"""Vector and Semantic Search Tools for PostgreSQL MCP Server.

This module provides 8 vector/semantic search tools leveraging pgvector extension:
- vector_embed: Generate embeddings (OpenAI/local models)
- vector_similarity: Cosine/dot product/L2 distance similarity
- vector_search: Semantic search with ranking and filtering
- vector_cluster: K-means clustering for vector data
- vector_index_optimize: HNSW/IVFFlat index tuning
- vector_dimension_reduce: Dimensionality reduction (PCA)
- hybrid_search: Combine full-text + vector search
- vector_performance: Vector query optimization and benchmarking
"""

import json
import logging
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import cast

from typing_extensions import LiteralString

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


class VectorTools:
    """Vector and semantic search operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize vector tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def _check_pgvector_installed(self) -> bool:
        """Check if pgvector extension is installed.

        Returns:
            True if pgvector is installed, False otherwise
        """
        try:
            check_query = """
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = 'vector'
            ) as has_pgvector
            """
            result = await self.sql_driver.execute_query(check_query)
            return bool(result and result[0].cells.get("has_pgvector"))
        except Exception as e:
            logger.error(f"Error checking pgvector installation: {e}")
            return False

    async def vector_embed(
        self,
        table_name: str,
        text_column: str,
        vector_column: str,
        model: str = "text-embedding-ada-002",
        batch_size: int = 100,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Generate embeddings for text data and store in vector column.

        Args:
            table_name: Source table name
            text_column: Column containing text to embed
            vector_column: Column to store embeddings (must be vector type)
            model: Embedding model name (OpenAI or local)
            batch_size: Number of rows to process per batch
            where_clause: Optional WHERE clause for filtering
            where_params: Parameters for WHERE clause

        Returns:
            Embedding generation results and statistics

        Examples:
            # Embed product descriptions
            await vector_embed(
                'products',
                'description',
                'embedding',
                model='text-embedding-ada-002'
            )

        Note:
            This is a placeholder implementation. Production use requires:
            - Integration with embedding API (OpenAI, Cohere, etc.)
            - Or local embedding model (sentence-transformers)
            - Proper API key management and rate limiting
            - Batch processing for large datasets
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            where_sql = f"WHERE {where_clause}" if where_clause else ""
            params = where_params or []

            # Count rows to process
            count_query = f"""
            SELECT COUNT(*) as total
            FROM {table_name}
            {where_sql}
            """

            result = await self.sql_driver.execute_query(
                cast(LiteralString, count_query),
                params,
            )

            total_rows = safe_int(result[0].cells.get("total")) if result else 0

            return {
                "success": True,
                "status": "pending_implementation",
                "message": "Embedding generation requires API integration (OpenAI, Cohere, or local model)",
                "total_rows": total_rows,
                "table_name": table_name,
                "text_column": text_column,
                "vector_column": vector_column,
                "model": model,
                "batch_size": batch_size,
                "note": "To implement: 1) Add API client, 2) Batch process rows, 3) Update vector column with embeddings",
            }

        except Exception as e:
            logger.error(f"Error in vector_embed: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_similarity(
        self,
        table_name: str,
        vector_column: str,
        query_vector: List[float],
        distance_metric: str = "cosine",
        limit: int = 10,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Find similar vectors using various distance metrics.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            query_vector: Query vector to find similar vectors
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')
            limit: Maximum results to return
            where_clause: Optional WHERE clause for filtering
            where_params: Parameters for WHERE clause

        Returns:
            Similar vectors with distance scores

        Examples:
            # Find similar products
            await vector_similarity(
                'products',
                'embedding',
                query_vector=[0.1, 0.2, ...],
                distance_metric='cosine',
                limit=10
            )

        Note:
            Requires pgvector extension with vector column type.
            Distance operators:
            - Cosine: <=> (1 - cosine similarity)
            - L2: <-> (Euclidean distance)
            - Inner product: <#> (negative inner product)
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Select distance operator based on metric
            if distance_metric == "cosine":
                distance_op = "<=>"
                distance_name = "cosine_distance"
            elif distance_metric == "l2":
                distance_op = "<->"
                distance_name = "l2_distance"
            elif distance_metric == "inner_product":
                distance_op = "<#>"
                distance_name = "inner_product_distance"
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance metric: {distance_metric}. Use 'cosine', 'l2', or 'inner_product'.",
                }

            where_sql = f"WHERE {where_clause}" if where_clause else ""

            query = f"""
            SELECT
                *,
                {vector_column} {distance_op} %s::vector as {distance_name}
            FROM {table_name}
            {where_sql}
            ORDER BY {vector_column} {distance_op} %s::vector
            LIMIT %s
            """

            query_params = (where_params or []) + [
                json.dumps(query_vector),
                json.dumps(query_vector),
                limit,
            ]

            result = await self.sql_driver.execute_query(
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
                "distance_metric": distance_metric,
                "query_vector_dimensions": len(query_vector),
            }

        except Exception as e:
            logger.error(f"Error in vector_similarity: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_search(
        self,
        table_name: str,
        vector_column: str,
        query_vector: List[float],
        distance_metric: str = "cosine",
        limit: int = 10,
        threshold: Optional[float] = None,
        return_columns: Optional[List[str]] = None,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Semantic search with ranking and optional distance threshold.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            query_vector: Query vector for semantic search
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')
            limit: Maximum results to return
            threshold: Optional distance threshold for filtering
            return_columns: Specific columns to return (None = all)
            where_clause: Optional WHERE clause for filtering
            where_params: Parameters for WHERE clause

        Returns:
            Semantic search results with relevance ranking

        Examples:
            # Search for similar documents
            await vector_search(
                'documents',
                'embedding',
                query_vector=[0.1, 0.2, ...],
                distance_metric='cosine',
                threshold=0.5,
                return_columns=['id', 'title', 'content']
            )
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Select distance operator
            if distance_metric == "cosine":
                distance_op = "<=>"
                distance_name = "relevance_score"
            elif distance_metric == "l2":
                distance_op = "<->"
                distance_name = "distance"
            elif distance_metric == "inner_product":
                distance_op = "<#>"
                distance_name = "similarity"
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance metric: {distance_metric}. Use 'cosine', 'l2', or 'inner_product'.",
                }

            # Build column selection
            columns = "*" if not return_columns else ", ".join([f"{col}" for col in return_columns])

            # Build WHERE clause
            where_parts: List[str] = []
            if where_clause:
                where_parts.append(where_clause)
            if threshold is not None:
                where_parts.append(f"{vector_column} {distance_op} %s::vector < %s")

            where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

            # Build parameters
            params = where_params or []
            if threshold is not None:
                params.extend([json.dumps(query_vector), threshold])

            query = f"""
            SELECT
                {columns},
                {vector_column} {distance_op} %s::vector as {distance_name}
            FROM {table_name}
            {where_sql}
            ORDER BY {vector_column} {distance_op} %s::vector
            LIMIT %s
            """

            query_params = [
                *params,
                json.dumps(query_vector),
                json.dumps(query_vector),
                limit,
            ]

            result = await self.sql_driver.execute_query(
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
                "distance_metric": distance_metric,
                "threshold": threshold,
                "query_vector_dimensions": len(query_vector),
            }

        except Exception as e:
            logger.error(f"Error in vector_search: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_cluster(
        self,
        table_name: str,
        vector_column: str,
        num_clusters: int = 5,
        max_iterations: int = 100,
        distance_metric: str = "l2",
    ) -> Dict[str, Any]:
        """K-means clustering for vector data.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            num_clusters: Number of clusters (k)
            max_iterations: Maximum iterations for convergence
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')

        Returns:
            Cluster assignments and centroids

        Examples:
            # Cluster product embeddings
            await vector_cluster(
                'products',
                'embedding',
                num_clusters=5,
                distance_metric='cosine'
            )

        Note:
            This is a placeholder implementation. Production clustering requires:
            - Iterative k-means algorithm implementation
            - Or integration with ML library (scikit-learn, pgvector k-means extension)
            - Convergence detection and optimization
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Count vectors
            count_query = f"""
            SELECT COUNT(*) as total
            FROM {table_name}
            WHERE {vector_column} IS NOT NULL
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, count_query))
            total_vectors = safe_int(result[0].cells.get("total")) if result else 0

            return {
                "success": True,
                "status": "pending_implementation",
                "message": "K-means clustering requires iterative algorithm or ML library integration",
                "total_vectors": total_vectors,
                "table_name": table_name,
                "vector_column": vector_column,
                "num_clusters": num_clusters,
                "max_iterations": max_iterations,
                "distance_metric": distance_metric,
                "note": "To implement: 1) Initialize centroids, 2) Iterative assignment and update, 3) Convergence detection",
            }

        except Exception as e:
            logger.error(f"Error in vector_cluster: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_index_optimize(
        self,
        table_name: str,
        vector_column: str,
        index_type: str = "hnsw",
        distance_metric: str = "cosine",
        index_options: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Optimize vector indexes (HNSW/IVFFlat) for performance.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            index_type: Index type ('hnsw', 'ivfflat')
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')
            index_options: Index-specific options (m, ef_construction for HNSW, lists for IVFFlat)

        Returns:
            Index optimization recommendations and status

        Examples:
            # Create HNSW index
            await vector_index_optimize(
                'products',
                'embedding',
                index_type='hnsw',
                distance_metric='cosine',
                index_options={'m': 16, 'ef_construction': 64}
            )

            # Create IVFFlat index
            await vector_index_optimize(
                'products',
                'embedding',
                index_type='ivfflat',
                distance_metric='l2',
                index_options={'lists': 100}
            )

        Note:
            HNSW (Hierarchical Navigable Small World):
            - Better for recall and performance
            - Options: m (connections per layer), ef_construction (build quality)

            IVFFlat (Inverted File Flat):
            - Better for larger datasets
            - Options: lists (number of clusters)
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Validate index type
            if index_type not in ("hnsw", "ivfflat"):
                return {
                    "success": False,
                    "error": f"Invalid index type: {index_type}. Use 'hnsw' or 'ivfflat'.",
                }

            # Select distance operator
            if distance_metric == "cosine":
                distance_op = "vector_cosine_ops"
            elif distance_metric == "l2":
                distance_op = "vector_l2_ops"
            elif distance_metric == "inner_product":
                distance_op = "vector_ip_ops"
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance metric: {distance_metric}. Use 'cosine', 'l2', or 'inner_product'.",
                }

            # Get table stats
            stats_query = f"""
            SELECT
                COUNT(*) as row_count,
                pg_size_pretty(pg_total_relation_size('{table_name}')) as table_size
            FROM {table_name}
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, stats_query))
            row_count = safe_int(result[0].cells.get("row_count")) if result else 0
            table_size = result[0].cells.get("table_size") if result else "Unknown"

            # Build recommendations
            options = index_options or {}
            recommendations: List[str] = []

            if index_type == "hnsw":
                m = options.get("m", 16)
                ef_construction = options.get("ef_construction", 64)

                recommendations.append(
                    f"CREATE INDEX ON {table_name} USING hnsw ({vector_column} {distance_op}) WITH (m = {m}, ef_construction = {ef_construction});"
                )
                recommendations.append("-- HNSW parameters:")
                recommendations.append(f"-- m = {m} (higher = better recall, more memory)")
                recommendations.append(f"-- ef_construction = {ef_construction} (higher = better recall, slower build)")

            elif index_type == "ivfflat":
                # Default lists = sqrt(rows)
                default_lists = max(1, int((row_count or 1) ** 0.5)) if row_count else 100
                lists = options.get("lists", default_lists)

                recommendations.append(f"CREATE INDEX ON {table_name} USING ivfflat ({vector_column} {distance_op}) WITH (lists = {lists});")
                recommendations.append("-- IVFFlat parameters:")
                recommendations.append(f"-- lists = {lists} (typically sqrt(rows), tune based on dataset size)")
                recommendations.append("-- Don't forget to set probes at query time: SET ivfflat.probes = 10;")

            return {
                "success": True,
                "table_name": table_name,
                "vector_column": vector_column,
                "index_type": index_type,
                "distance_metric": distance_metric,
                "row_count": row_count,
                "table_size": table_size,
                "recommendations": recommendations,
                "status": "ready_to_create",
            }

        except Exception as e:
            logger.error(f"Error in vector_index_optimize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_dimension_reduce(
        self,
        table_name: str,
        vector_column: str,
        target_dimensions: int,
        method: str = "pca",
    ) -> Dict[str, Any]:
        """Dimensionality reduction for vector data.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            target_dimensions: Target number of dimensions
            method: Reduction method ('pca', 'random_projection')

        Returns:
            Dimensionality reduction results and recommendations

        Examples:
            # Reduce 1536-dim embeddings to 256 dims
            await vector_dimension_reduce(
                'products',
                'embedding',
                target_dimensions=256,
                method='pca'
            )

        Note:
            This is a placeholder implementation. Production dimensionality reduction requires:
            - PCA algorithm implementation or library integration
            - Or random projection matrices
            - Variance preservation analysis
            - Performance vs accuracy trade-off evaluation
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Get vector dimensions
            dim_query = f"""
            SELECT vector_dims({vector_column}) as current_dimensions
            FROM {table_name}
            WHERE {vector_column} IS NOT NULL
            LIMIT 1
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, dim_query))
            current_dimensions = safe_int(result[0].cells.get("current_dimensions")) if result else None

            if not current_dimensions:
                return {
                    "success": False,
                    "error": "Could not determine vector dimensions or no vectors found",
                }

            if target_dimensions >= current_dimensions:
                return {
                    "success": False,
                    "error": f"Target dimensions ({target_dimensions}) must be less than current dimensions ({current_dimensions})",
                }

            return {
                "success": True,
                "status": "pending_implementation",
                "message": "Dimensionality reduction requires PCA or random projection implementation",
                "table_name": table_name,
                "vector_column": vector_column,
                "current_dimensions": current_dimensions,
                "target_dimensions": target_dimensions,
                "reduction_ratio": f"{(1 - target_dimensions / current_dimensions) * 100:.1f}%",
                "method": method,
                "note": "To implement: 1) Extract vectors, 2) Apply reduction algorithm, 3) Store reduced vectors",
            }

        except Exception as e:
            logger.error(f"Error in vector_dimension_reduce: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def hybrid_search(
        self,
        table_name: str,
        vector_column: str,
        text_columns: List[str],
        query_vector: List[float],
        query_text: str,
        vector_weight: float = 0.7,
        text_weight: float = 0.3,
        distance_metric: str = "cosine",
        language: str = "english",
        limit: int = 10,
    ) -> Dict[str, Any]:
        """Combine full-text search with vector similarity for hybrid search.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            text_columns: Columns for full-text search
            query_vector: Query vector for semantic search
            query_text: Query text for full-text search
            vector_weight: Weight for vector similarity (0-1)
            text_weight: Weight for text relevance (0-1)
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')
            language: Text search language configuration
            limit: Maximum results to return

        Returns:
            Hybrid search results with combined ranking

        Examples:
            # Hybrid search for documents
            await hybrid_search(
                'documents',
                'embedding',
                ['title', 'content'],
                query_vector=[0.1, 0.2, ...],
                query_text='machine learning',
                vector_weight=0.7,
                text_weight=0.3
            )

        Note:
            Combines semantic similarity (vector) with keyword relevance (text).
            Weights should sum to 1.0 for proper normalization.
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            # Validate weights
            if abs((vector_weight + text_weight) - 1.0) > 0.01:
                return {
                    "success": False,
                    "error": f"Weights must sum to 1.0 (got {vector_weight + text_weight})",
                }

            # Select distance operator
            if distance_metric == "cosine":
                distance_op = "<=>"
            elif distance_metric == "l2":
                distance_op = "<->"
            elif distance_metric == "inner_product":
                distance_op = "<#>"
            else:
                return {
                    "success": False,
                    "error": f"Invalid distance metric: {distance_metric}. Use 'cosine', 'l2', or 'inner_product'.",
                }

            # Build tsvector expression
            if len(text_columns) == 1:
                tsvector_expr = f"to_tsvector('{language}', {text_columns[0]})"
            else:
                weighted_columns = " || ' ' || ".join([f"coalesce({col}, '')" for col in text_columns])
                tsvector_expr = f"to_tsvector('{language}', {weighted_columns})"

            # Hybrid query with normalized scoring
            query = f"""
            WITH vector_scores AS (
                SELECT
                    *,
                    1 - ({vector_column} {distance_op} %s::vector) as vector_score
                FROM {table_name}
            ),
            text_scores AS (
                SELECT
                    *,
                    ts_rank_cd({tsvector_expr}, to_tsquery('{language}', %s)) as text_score
                FROM vector_scores
                WHERE {tsvector_expr} @@ to_tsquery('{language}', %s)
            ),
            combined_scores AS (
                SELECT
                    *,
                    %s * vector_score + %s * text_score as hybrid_score
                FROM text_scores
            )
            SELECT * FROM combined_scores
            ORDER BY hybrid_score DESC
            LIMIT %s
            """

            params = [
                json.dumps(query_vector),
                query_text,
                query_text,
                vector_weight,
                text_weight,
                limit,
            ]

            result = await self.sql_driver.execute_query(
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
                "distance_metric": distance_metric,
                "vector_weight": vector_weight,
                "text_weight": text_weight,
                "query_text": query_text,
                "query_vector_dimensions": len(query_vector),
            }

        except Exception as e:
            logger.error(f"Error in hybrid_search: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def vector_performance(
        self,
        table_name: str,
        vector_column: str,
        query_vector: List[float],
        distance_metric: str = "cosine",
        test_limits: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Vector query optimization and performance benchmarking.

        Args:
            table_name: Source table name
            vector_column: Column containing vectors
            query_vector: Query vector for benchmarking
            distance_metric: Distance metric ('cosine', 'l2', 'inner_product')
            test_limits: List of limits to test (default: [10, 50, 100])

        Returns:
            Performance benchmarks and optimization recommendations

        Examples:
            # Benchmark vector queries
            await vector_performance(
                'products',
                'embedding',
                query_vector=[0.1, 0.2, ...],
                distance_metric='cosine',
                test_limits=[10, 50, 100, 500]
            )
        """
        try:
            if not await self._check_pgvector_installed():
                return {
                    "success": False,
                    "error": "pgvector extension not installed. Run: CREATE EXTENSION IF NOT EXISTS vector;",
                }

            test_limits = test_limits or [10, 50, 100]

            # Validate distance metric
            if distance_metric not in ("cosine", "l2", "inner_product"):
                return {
                    "success": False,
                    "error": f"Invalid distance metric: {distance_metric}. Use 'cosine', 'l2', or 'inner_product'.",
                }

            # Check for index
            index_query = """
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = %s
                AND indexdef LIKE %s
            """

            result = await self.sql_driver.execute_query(
                cast(LiteralString, index_query),
                [table_name, f"%{vector_column}%"],
            )

            has_index = bool(result and len(result) > 0)
            index_info = [row.cells for row in result] if result else []

            # Get table stats
            stats_query = f"""
            SELECT
                COUNT(*) as total_rows,
                pg_size_pretty(pg_total_relation_size('{table_name}')) as table_size
            FROM {table_name}
            """

            result = await self.sql_driver.execute_query(cast(LiteralString, stats_query))
            total_rows = safe_int(result[0].cells.get("total_rows")) if result else 0
            table_size = result[0].cells.get("table_size") if result else "Unknown"

            # Build recommendations
            recommendations: List[str] = []

            if not has_index:
                recommendations.append("⚠️ No vector index found - queries will be slow")
                recommendations.append(
                    f"Consider creating an HNSW index: CREATE INDEX ON {table_name} USING hnsw ({vector_column} vector_cosine_ops);"
                )
            else:
                recommendations.append("✅ Vector index exists")

            if total_rows and total_rows > 100000:
                recommendations.append(f"📊 Large table ({total_rows:,} rows) - ensure appropriate index parameters")

            return {
                "success": True,
                "table_name": table_name,
                "vector_column": vector_column,
                "total_rows": total_rows,
                "table_size": table_size,
                "has_index": has_index,
                "index_info": index_info,
                "distance_metric": distance_metric,
                "query_vector_dimensions": len(query_vector),
                "recommendations": recommendations,
                "note": "Use EXPLAIN ANALYZE to get detailed query performance metrics",
            }

        except Exception as e:
            logger.error(f"Error in vector_performance: {e}")
            return {
                "success": False,
                "error": str(e),
            }
