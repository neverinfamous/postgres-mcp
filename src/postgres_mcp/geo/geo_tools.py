"""Geospatial Tools for PostgreSQL MCP Server.

This module provides 7 geospatial tools leveraging PostGIS extension:
- geo_distance: Calculate distance between geometries
- geo_within: Point-in-polygon and containment queries
- geo_buffer: Create buffer zones around geometries
- geo_intersection: Find geometric intersections
- geo_index_optimize: Spatial index tuning (GIST/BRIN)
- geo_transform: Coordinate system transformations
- geo_cluster: Spatial clustering (DBSCAN/k-means)
"""

import logging
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import cast

from typing_extensions import LiteralString

from ..sql import SafeSqlDriver
from ..sql import SqlDriver

logger = logging.getLogger(__name__)


def safe_float(value: Any) -> Optional[float]:
    """Safely convert a value to float, returning None if not possible."""
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def safe_int(value: Any) -> Optional[int]:
    """Safely convert a value to int, returning None if not possible."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class GeospatialTools:
    """Geospatial operations for PostgreSQL using PostGIS."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize geospatial tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def _check_postgis_installed(self) -> bool:
        """Check if PostGIS extension is installed.

        Returns:
            True if PostGIS is installed, False otherwise
        """
        try:
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'postgis'
            ) as has_postgis
            """
            result = await self.sql_driver.execute_query(check_query)
            return bool(result and result[0].cells.get("has_postgis"))
        except Exception as e:
            logger.error(f"Error checking PostGIS installation: {e}")
            return False

    async def geo_distance(
        self,
        table_name: str,
        geometry_column: str,
        reference_point: str,
        distance_type: str = "meters",
        max_distance: Optional[float] = None,
        limit: int = 100,
        srid: int = 4326,
    ) -> Dict[str, Any]:
        """Calculate distance between geometries and a reference point.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            reference_point: Reference point in WKT format (e.g., 'POINT(-122.4194 37.7749)')
            distance_type: Distance unit ('meters', 'kilometers', 'miles', 'feet')
            max_distance: Maximum distance filter
            limit: Maximum results to return
            srid: Spatial reference system ID (default: 4326 = WGS84)

        Returns:
            Distance calculations with sorted results

        Examples:
            # Find nearest locations
            await geo_distance(
                'locations',
                'geom',
                'POINT(-122.4194 37.7749)',
                distance_type='meters',
                max_distance=5000,
                limit=10
            )

        Note:
            Requires PostGIS extension: CREATE EXTENSION IF NOT EXISTS postgis;
            SRID 4326 = WGS84 (lat/lon), SRID 3857 = Web Mercator
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            # Distance multiplier based on type
            if distance_type == "meters":
                multiplier = 1.0
                unit = "m"
            elif distance_type == "kilometers":
                multiplier = 0.001
                unit = "km"
            elif distance_type == "miles":
                multiplier = 0.000621371
                unit = "mi"
            elif distance_type == "feet":
                multiplier = 3.28084
                unit = "ft"
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance type: {distance_type}. Use 'meters', 'kilometers', 'miles', or 'feet'.",
                }

            # Build WHERE clause for max distance
            where_clause = ""
            where_params: List[Any] = []
            if max_distance is not None:
                where_clause = "WHERE ST_DWithin({}, ST_GeomFromText({}, {}), {})"
                where_params = [geometry_column, reference_point, srid, max_distance / multiplier]

            # Query for distance calculation
            query = f"""
            SELECT
                *,
                ST_Distance(
                    ST_Transform({{}}, 3857),
                    ST_Transform(ST_GeomFromText({{}}, {{}}), 3857)
                ) * {{}} as distance_{unit}
            FROM {{}}
            {where_clause}
            ORDER BY ST_Distance(
                ST_Transform({{}}, 3857),
                ST_Transform(ST_GeomFromText({{}}, {{}}), 3857)
            )
            LIMIT {{}}
            """

            params = [
                geometry_column,
                reference_point,
                srid,
                multiplier,
                table_name,
                *where_params,
                geometry_column,
                reference_point,
                srid,
                limit,
            ]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "reference_point": reference_point,
                "distance_type": distance_type,
                "max_distance": max_distance,
                "srid": srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_distance: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_within(
        self,
        table_name: str,
        geometry_column: str,
        boundary_geometry: str,
        geometry_type: str = "polygon",
        limit: int = 1000,
        srid: int = 4326,
    ) -> Dict[str, Any]:
        """Point-in-polygon and geometric containment queries.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            boundary_geometry: Boundary in WKT format (e.g., 'POLYGON((...))')
            geometry_type: Type of boundary ('polygon', 'multipolygon', 'circle')
            limit: Maximum results to return
            srid: Spatial reference system ID (default: 4326)

        Returns:
            Geometries within the specified boundary

        Examples:
            # Find points within polygon
            await geo_within(
                'stores',
                'location',
                'POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.8, -122.5 37.8, -122.5 37.7))',
                geometry_type='polygon'
            )

        Note:
            Uses ST_Within for containment testing.
            For large datasets, ensure spatial index exists on geometry_column.
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            query = """
            SELECT
                *
            FROM {}
            WHERE ST_Within({}, ST_GeomFromText({}, {}))
            LIMIT {}
            """

            params = [table_name, geometry_column, boundary_geometry, srid, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "boundary_geometry": boundary_geometry,
                "geometry_type": geometry_type,
                "srid": srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_within: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_buffer(
        self,
        table_name: str,
        geometry_column: str,
        buffer_distance: float,
        distance_unit: str = "meters",
        segments: int = 8,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
        limit: int = 100,
        srid: int = 4326,
    ) -> Dict[str, Any]:
        """Create buffer zones around geometries.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            buffer_distance: Buffer distance
            distance_unit: Distance unit ('meters', 'kilometers', 'miles', 'feet')
            segments: Number of segments for buffer (higher = smoother)
            where_clause: Optional WHERE clause for filtering
            where_params: Parameters for WHERE clause
            limit: Maximum results to return
            srid: Spatial reference system ID (default: 4326)

        Returns:
            Geometries with buffer zones

        Examples:
            # Create 1km buffer around stores
            await geo_buffer(
                'stores',
                'location',
                buffer_distance=1000,
                distance_unit='meters',
                segments=16
            )

        Note:
            Buffer distance is in meters when using projected coordinate system (3857).
            For geographic coordinates (4326), use geography type or ST_Transform.
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            # Convert distance to meters
            if distance_unit == "meters":
                distance_m = buffer_distance
            elif distance_unit == "kilometers":
                distance_m = buffer_distance * 1000
            elif distance_unit == "miles":
                distance_m = buffer_distance * 1609.34
            elif distance_unit == "feet":
                distance_m = buffer_distance * 0.3048
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance unit: {distance_unit}. Use 'meters', 'kilometers', 'miles', or 'feet'.",
                }

            where_sql = f"WHERE {where_clause}" if where_clause else ""

            query = f"""
            SELECT
                *,
                ST_AsText(
                    ST_Transform(
                        ST_Buffer(
                            ST_Transform({{}}, 3857),
                            {{}},
                            {{}}
                        ),
                        {{}}
                    )
                ) as buffer_geometry
            FROM {{}}
            {where_sql}
            LIMIT {{}}
            """

            query_params = (where_params or []) + [geometry_column, distance_m, segments, srid, table_name, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                query_params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "buffer_distance": buffer_distance,
                "distance_unit": distance_unit,
                "segments": segments,
                "srid": srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_buffer: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_intersection(
        self,
        table_name: str,
        geometry_column: str,
        intersecting_geometry: str,
        return_intersection: bool = False,
        limit: int = 100,
        srid: int = 4326,
    ) -> Dict[str, Any]:
        """Find geometric intersections between features.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            intersecting_geometry: Geometry to test intersection (WKT format)
            return_intersection: If True, return intersection geometry
            limit: Maximum results to return
            srid: Spatial reference system ID (default: 4326)

        Returns:
            Geometries that intersect with the specified geometry

        Examples:
            # Find features intersecting with polygon
            await geo_intersection(
                'parcels',
                'boundary',
                'POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.8, -122.5 37.8, -122.5 37.7))',
                return_intersection=True
            )

        Note:
            ST_Intersects is faster for simple intersection tests.
            ST_Intersection computes the actual intersection geometry.
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            if return_intersection:
                intersection_col = ", ST_AsText(ST_Intersection({}, ST_GeomFromText({}, {}))) as intersection_geometry"
                intersection_params = [geometry_column, intersecting_geometry, srid]
            else:
                intersection_col = ""
                intersection_params = []

            query = f"""
            SELECT
                *{intersection_col}
            FROM {{}}
            WHERE ST_Intersects({{}}, ST_GeomFromText({{}}, {{}}))
            LIMIT {{}}
            """

            params = [*intersection_params, table_name, geometry_column, intersecting_geometry, srid, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "intersecting_geometry": intersecting_geometry,
                "return_intersection": return_intersection,
                "srid": srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_intersection: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_index_optimize(
        self,
        table_name: str,
        geometry_column: str,
        index_type: str = "gist",
        index_options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Optimize spatial indexes (GIST/BRIN) for performance.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            index_type: Index type ('gist', 'brin', 'spgist')
            index_options: Index-specific options

        Returns:
            Index optimization recommendations and status

        Examples:
            # Create GIST index (default, best for most cases)
            await geo_index_optimize(
                'locations',
                'geom',
                index_type='gist'
            )

            # Create BRIN index (for large, naturally ordered datasets)
            await geo_index_optimize(
                'sensor_readings',
                'location',
                index_type='brin',
                index_options={'pages_per_range': 128}
            )

        Note:
            GIST (Generalized Search Tree):
            - Best for general spatial queries
            - Supports all geometry types
            - Higher memory usage but faster queries

            BRIN (Block Range Index):
            - Best for large, naturally ordered data
            - Lower memory usage
            - Good for time-series geospatial data

            SP-GIST (Space-Partitioned GIST):
            - For non-balanced tree structures
            - Better for specific use cases
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            # Validate index type
            if index_type not in ("gist", "brin", "spgist"):
                return {
                    "success": False,
                    "error": f"Invalid index type: {index_type}. Use 'gist', 'brin', or 'spgist'.",
                }

            # Get table stats
            stats_query = f"""
            SELECT
                COUNT(*) as row_count,
                pg_size_pretty(pg_total_relation_size('{table_name}')) as table_size,
                pg_size_pretty(pg_relation_size('{table_name}')) as data_size
            FROM {table_name}
            """

            result = await self.sql_driver.execute_query(stats_query)
            row_count = safe_int(result[0].cells.get("row_count")) if result else 0
            table_size = result[0].cells.get("table_size") if result else "Unknown"
            data_size = result[0].cells.get("data_size") if result else "Unknown"

            # Build recommendations
            options = index_options or {}
            recommendations = []

            if index_type == "gist":
                recommendations.append(f"CREATE INDEX ON {table_name} USING GIST ({geometry_column});")
                recommendations.append("-- GIST index (recommended for most spatial queries)")
                recommendations.append("-- Supports: ST_Intersects, ST_Within, ST_Contains, ST_DWithin, etc.")
                recommendations.append("-- Good balance of performance and functionality")

            elif index_type == "brin":
                pages_per_range = options.get("pages_per_range", 128)
                recommendations.append(f"CREATE INDEX ON {table_name} USING BRIN ({geometry_column}) WITH (pages_per_range = {pages_per_range});")
                recommendations.append("-- BRIN index (best for large, naturally ordered data)")
                recommendations.append(f"-- pages_per_range = {pages_per_range} (lower = more precise, larger index)")
                recommendations.append("-- Ideal for time-series geospatial data with natural clustering")

            elif index_type == "spgist":
                recommendations.append(f"CREATE INDEX ON {table_name} USING SPGIST ({geometry_column});")
                recommendations.append("-- SP-GIST index (space-partitioned)")
                recommendations.append("-- Best for specific geometric partitioning scenarios")
                recommendations.append("-- Consider GIST for general use cases")

            # Add general recommendations
            if row_count and row_count > 1000000:
                recommendations.append(f"\n📊 Large table ({row_count:,} rows)")
                recommendations.append("Consider BRIN if data has spatial clustering (e.g., time-ordered)")

            recommendations.append("\n💡 After creating index, run: VACUUM ANALYZE {table_name};")

            return {
                "success": True,
                "table_name": table_name,
                "geometry_column": geometry_column,
                "index_type": index_type,
                "row_count": row_count,
                "table_size": table_size,
                "data_size": data_size,
                "recommendations": recommendations,
                "status": "ready_to_create",
            }

        except Exception as e:
            logger.error(f"Error in geo_index_optimize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_transform(
        self,
        table_name: str,
        geometry_column: str,
        source_srid: int,
        target_srid: int,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Transform geometries between coordinate systems.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            source_srid: Source spatial reference system ID
            target_srid: Target spatial reference system ID
            limit: Maximum results to return

        Returns:
            Transformed geometries

        Examples:
            # Transform from WGS84 (4326) to Web Mercator (3857)
            await geo_transform(
                'locations',
                'geom',
                source_srid=4326,
                target_srid=3857
            )

            # Transform from NAD83 (4269) to WGS84 (4326)
            await geo_transform(
                'parcels',
                'boundary',
                source_srid=4269,
                target_srid=4326
            )

        Note:
            Common SRIDs:
            - 4326: WGS84 (GPS coordinates, lat/lon)
            - 3857: Web Mercator (web mapping)
            - 4269: NAD83 (North America)
            - 2163: US National Atlas Equal Area
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            query = """
            SELECT
                *,
                ST_AsText(ST_Transform(ST_SetSRID({}, {}), {})) as transformed_geometry,
                {} as source_srid,
                {} as target_srid
            FROM {}
            WHERE {} IS NOT NULL
            LIMIT {}
            """

            params = [geometry_column, source_srid, target_srid, source_srid, target_srid, table_name, geometry_column, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "source_srid": source_srid,
                "target_srid": target_srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_transform: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def geo_cluster(
        self,
        table_name: str,
        geometry_column: str,
        cluster_distance: float,
        distance_unit: str = "meters",
        min_points: int = 2,
        limit: int = 1000,
        srid: int = 4326,
    ) -> Dict[str, Any]:
        """Spatial clustering using distance-based grouping.

        Args:
            table_name: Source table name
            geometry_column: Column containing geometry data
            cluster_distance: Maximum distance for clustering
            distance_unit: Distance unit ('meters', 'kilometers', 'miles')
            min_points: Minimum points to form a cluster
            limit: Maximum results to return
            srid: Spatial reference system ID (default: 4326)

        Returns:
            Clustered geometries with cluster IDs

        Examples:
            # Cluster nearby points within 100m
            await geo_cluster(
                'poi',
                'location',
                cluster_distance=100,
                distance_unit='meters',
                min_points=3
            )

        Note:
            Uses ST_ClusterDBSCAN for density-based clustering.
            Requires PostGIS 2.3+
        """
        try:
            if not await self._check_postgis_installed():
                return {
                    "success": False,
                    "error": "PostGIS extension not installed. Run: CREATE EXTENSION IF NOT EXISTS postgis;",
                }

            # Convert distance to meters
            if distance_unit == "meters":
                distance_m = cluster_distance
            elif distance_unit == "kilometers":
                distance_m = cluster_distance * 1000
            elif distance_unit == "miles":
                distance_m = cluster_distance * 1609.34
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance unit: {distance_unit}. Use 'meters', 'kilometers', or 'miles'.",
                }

            query = """
            SELECT
                *,
                ST_ClusterDBSCAN(ST_Transform({}, 3857), {}, {}) OVER () as cluster_id
            FROM {}
            WHERE {} IS NOT NULL
            LIMIT {}
            """

            params = [geometry_column, distance_m, min_points, table_name, geometry_column, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                cast(LiteralString, query),
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            # Count clusters
            cluster_ids = set(row.get("cluster_id") for row in data if row.get("cluster_id") is not None)
            num_clusters = len(cluster_ids)

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "num_clusters": num_clusters,
                "cluster_distance": cluster_distance,
                "distance_unit": distance_unit,
                "min_points": min_points,
                "srid": srid,
            }

        except Exception as e:
            logger.error(f"Error in geo_cluster: {e}")
            return {
                "success": False,
                "error": str(e),
            }
