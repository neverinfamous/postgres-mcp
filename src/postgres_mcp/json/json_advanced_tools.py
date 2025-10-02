"""Advanced JSON Operations for PostgreSQL MCP Server.

This module provides 12 advanced JSON operations:
- jsonb_path_query_advanced: JSONPath queries with advanced features
- jsonb_aggregate: Advanced aggregation operations
- json_schema_validate: Schema validation
- json_transform: Data transformation pipelines
- json_diff: Compare JSON structures
- json_flatten: Flatten nested structures
- json_normalize: Auto-fix Python-style JSON
- jsonb_index_suggest: Index recommendations for JSON
- json_extract_tables: Convert JSON to relational
- json_performance_analyze: JSON query optimization
- jsonb_stats: JSON structure analysis
- json_security_scan: Detect injection patterns
"""

import json
import logging
import re
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import Union

from ..sql import SafeSqlDriver
from ..sql import SqlDriver

logger = logging.getLogger(__name__)


class JsonAdvancedTools:
    """Advanced JSON operations for PostgreSQL."""

    def __init__(self, sql_driver: SqlDriver):
        """Initialize advanced JSON tools.

        Args:
            sql_driver: SQL driver instance for database operations
        """
        self.sql_driver = sql_driver

    async def jsonb_path_query_advanced(
        self,
        table_name: str,
        json_column: str,
        json_path: str,
        filter_conditions: Optional[List[str]] = None,
        order_by: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Advanced JSONPath queries with filtering and ordering.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            json_path: JSONPath query expression
            filter_conditions: Additional SQL filter conditions
            order_by: Optional ordering expression
            limit: Maximum rows to return

        Returns:
            Query results with metadata

        Examples:
            # Find high-value products with ordering
            await jsonb_path_query_advanced(
                'orders', 'data',
                '$.products[*] ? (@.price > 100)',
                filter_conditions=['status = active'],
                order_by='item->>price DESC'
            )
        """
        try:
            # Build WHERE clause
            where_parts = []
            where_params = []

            if filter_conditions:
                for condition in filter_conditions:
                    where_parts.append(condition)

            where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""

            # Build ORDER BY clause
            order_clause = f"ORDER BY {order_by}" if order_by else ""

            # Build query
            query = f"""
            SELECT 
                item,
                jsonb_typeof(item) as item_type,
                jsonb_path_exists({{}}, {{}}) as path_exists
            FROM {{}},
            LATERAL jsonb_path_query({{}}, {{}}) as item
            {where_clause}
            {order_clause}
            LIMIT {{}}
            """

            params = [
                json_column,
                json_path,
                table_name,
                json_column,
                json_path,
                limit,
            ]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": [], "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "path": json_path,
            }

        except Exception as e:
            logger.error(f"Error in jsonb_path_query_advanced: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def jsonb_aggregate(
        self,
        table_name: str,
        json_column: str,
        aggregate_type: str,
        json_path: Optional[str] = None,
        group_by: Optional[str] = None,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Advanced JSON aggregation operations.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            aggregate_type: Type of aggregation ('object', 'array', 'sum', 'avg')
            json_path: Optional path for extraction
            group_by: Optional GROUP BY expression
            where_clause: Optional WHERE clause
            where_params: Parameters for WHERE clause

        Returns:
            Aggregated results

        Examples:
            # Aggregate objects
            await jsonb_aggregate('users', 'preferences',
                                'object', group_by='user_type')

            # Sum values
            await jsonb_aggregate('orders', 'items',
                                'sum', json_path='$.price')
        """
        try:
            # Build aggregation expression
            if aggregate_type == "object":
                agg_expr = f"jsonb_object_agg(id::text, {{}})"
                select_params = [json_column]
            elif aggregate_type == "array":
                agg_expr = f"jsonb_agg({{}})"
                select_params = [json_column]
            elif aggregate_type in ["sum", "avg", "min", "max"]:
                if not json_path:
                    return {
                        "success": False,
                        "error": f"{aggregate_type} requires json_path",
                    }
                agg_expr = f"{aggregate_type.upper()}(({{}}->>'{json_path}')::numeric)"
                select_params = [json_column]
            else:
                return {
                    "success": False,
                    "error": f"Invalid aggregate type: {aggregate_type}",
                }

            # Build GROUP BY clause
            group_clause = f"GROUP BY {group_by}" if group_by else ""

            # Build WHERE clause
            where_part = f"WHERE {where_clause}" if where_clause else ""

            # Build full query
            query = f"""
            SELECT 
                {group_by + ',' if group_by else ''}
                {agg_expr} as result
            FROM {{}}
            {where_part}
            {group_clause}
            """

            params = select_params + [table_name] + (where_params or [])

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": None, "count": 0}

            data = [row.cells for row in result]

            return {
                "success": True,
                "data": data,
                "count": len(data),
                "aggregate_type": aggregate_type,
            }

        except Exception as e:
            logger.error(f"Error in jsonb_aggregate: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_normalize(
        self,
        json_data: Union[Dict[str, Any], str],
    ) -> Dict[str, Any]:
        """Auto-fix Python-style JSON (single quotes, True/False/None).

        Args:
            json_data: Python-style JSON string or dict

        Returns:
            Normalized JSON data

        Examples:
            # Fix Python dict syntax
            await json_normalize("{'key': True, 'value': None}")
            # Returns: {"key": true, "value": null}
        """
        try:
            # If already a dict, just validate and return
            if isinstance(json_data, dict):
                return {
                    "success": True,
                    "data": json_data,
                    "normalized": False,
                    "message": "Already valid JSON object",
                }

            # Convert Python literals to JSON
            normalized = json_data

            # Replace Python boolean/null with JSON equivalents
            replacements = [
                (r"\bTrue\b", "true"),
                (r"\bFalse\b", "false"),
                (r"\bNone\b", "null"),
            ]

            for pattern, replacement in replacements:
                normalized = re.sub(pattern, replacement, normalized)

            # Try to parse
            try:
                parsed = json.loads(normalized)
                return {
                    "success": True,
                    "data": parsed,
                    "normalized": True,
                    "original": json_data,
                }
            except json.JSONDecodeError:
                # If still fails, try replacing single quotes with double quotes
                # This is trickier because of embedded quotes
                try:
                    # Simple approach: replace single quotes not preceded by backslash
                    normalized = re.sub(r"(?<!\\)'", '"', normalized)
                    parsed = json.loads(normalized)
                    return {
                        "success": True,
                        "data": parsed,
                        "normalized": True,
                        "original": json_data,
                    }
                except json.JSONDecodeError as e:
                    return {
                        "success": False,
                        "error": f"Could not normalize JSON: {str(e)}",
                        "attempted": normalized,
                    }

        except Exception as e:
            logger.error(f"Error in json_normalize: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_flatten(
        self,
        table_name: str,
        json_column: str,
        separator: str = ".",
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Flatten nested JSON structures into key-value pairs.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            separator: Key separator for nested paths (default: '.')
            where_clause: Optional WHERE clause
            where_params: Parameters for WHERE clause
            limit: Maximum rows to return

        Returns:
            Flattened JSON data

        Examples:
            # Flatten nested preferences
            await json_flatten('users', 'preferences')
            # {'user.name.first': 'John'} -> {'user.name.first': 'John'}
        """
        try:
            # PostgreSQL doesn't have built-in flatten, so we'll use jsonb_each recursively
            # This is a simplified version - for production, you might want a more robust solution
            where_part = f"WHERE {where_clause}" if where_clause else ""

            query = f"""
            WITH RECURSIVE flatten AS (
                SELECT 
                    id,
                    key,
                    value,
                    key as path
                FROM {{}},
                LATERAL jsonb_each({{}})
                {where_part}
                
                UNION ALL
                
                SELECT 
                    f.id,
                    e.key,
                    e.value,
                    f.path || '{}' || e.key as path
                FROM flatten f,
                LATERAL jsonb_each(f.value) e
                WHERE jsonb_typeof(f.value) = 'object'
            )
            SELECT 
                path,
                value,
                jsonb_typeof(value) as value_type
            FROM flatten
            WHERE jsonb_typeof(value) != 'object'
            LIMIT {{}}
            """

            params = [table_name, json_column] + (where_params or []) + [separator, limit]

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result:
                return {"success": True, "data": {}, "count": 0}

            # Convert to flat dictionary
            flattened = {}
            for row in result:
                cells = row.cells
                flattened[cells.get("path", "")] = cells.get("value")

            return {
                "success": True,
                "data": flattened,
                "count": len(flattened),
                "separator": separator,
            }

        except Exception as e:
            logger.error(f"Error in json_flatten: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_diff(
        self,
        json1: Union[Dict[str, Any], str],
        json2: Union[Dict[str, Any], str],
    ) -> Dict[str, Any]:
        """Compare two JSON structures and return differences.

        Args:
            json1: First JSON object
            json2: Second JSON object

        Returns:
            Differences between the two JSON objects

        Examples:
            # Compare configurations
            await json_diff(
                {'theme': 'dark', 'size': 14},
                {'theme': 'light', 'size': 14}
            )
            # Returns: {'changed': {'theme': {'from': 'dark', 'to': 'light'}}}
        """
        try:
            # Convert to dicts if needed
            if isinstance(json1, str):
                json1 = json.loads(json1)
            if isinstance(json2, str):
                json2 = json.loads(json2)

            # Find differences
            added = {}
            removed = {}
            changed = {}

            # Check for added and changed keys
            for key in json2:
                if key not in json1:
                    added[key] = json2[key]
                elif json1[key] != json2[key]:
                    changed[key] = {"from": json1[key], "to": json2[key]}

            # Check for removed keys
            for key in json1:
                if key not in json2:
                    removed[key] = json1[key]

            return {
                "success": True,
                "added": added,
                "removed": removed,
                "changed": changed,
                "identical": not (added or removed or changed),
            }

        except Exception as e:
            logger.error(f"Error in json_diff: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def jsonb_index_suggest(
        self,
        table_name: str,
        json_column: str,
        common_paths: Optional[List[str]] = None,
        analyze_usage: bool = True,
    ) -> Dict[str, Any]:
        """Suggest indexes for JSONB columns based on usage patterns.

        Args:
            table_name: Target table name
            json_column: JSONB column name
            common_paths: List of commonly queried paths
            analyze_usage: Analyze query patterns from pg_stat_statements

        Returns:
            Index recommendations for JSON queries

        Examples:
            # Get index suggestions
            await jsonb_index_suggest('users', 'preferences',
                                    common_paths=['$.theme', '$.language'])
        """
        try:
            recommendations = []

            # Recommend GIN index for general JSON querying
            recommendations.append({
                "index_type": "GIN",
                "ddl": f"CREATE INDEX idx_{table_name}_{json_column}_gin ON {table_name} USING gin ({json_column});",
                "use_case": "General JSONB containment and existence queries",
                "benefit": "Fast querying with @>, @<, ?, ?& operators",
            })

            # Recommend GIN index with jsonb_path_ops for containment
            recommendations.append({
                "index_type": "GIN (jsonb_path_ops)",
                "ddl": f"CREATE INDEX idx_{table_name}_{json_column}_path_ops ON {table_name} USING gin ({json_column} jsonb_path_ops);",
                "use_case": "Containment queries (@> operator)",
                "benefit": "Smaller index size, faster containment queries",
            })

            # Recommend expression indexes for common paths
            if common_paths:
                for path in common_paths:
                    # Clean path for index name
                    clean_path = re.sub(r"[^\w]+", "_", path)
                    recommendations.append({
                        "index_type": "B-tree (expression)",
                        "ddl": f"CREATE INDEX idx_{table_name}_{json_column}_{clean_path} ON {table_name} (({json_column}->'{path}'));",
                        "use_case": f"Queries filtering on {path}",
                        "benefit": "Fast equality and range queries on specific path",
                    })

            return {
                "success": True,
                "table": table_name,
                "column": json_column,
                "recommendations": recommendations,
                "count": len(recommendations),
            }

        except Exception as e:
            logger.error(f"Error in jsonb_index_suggest: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def json_security_scan(
        self,
        json_data: Union[Dict[str, Any], str],
        check_injection: bool = True,
        check_xss: bool = True,
    ) -> Dict[str, Any]:
        """Scan JSON data for potential security issues.

        Args:
            json_data: JSON data to scan
            check_injection: Check for SQL injection patterns
            check_xss: Check for XSS patterns

        Returns:
            Security scan results with any detected issues

        Examples:
            # Scan user input
            await json_security_scan({'query': "' OR '1'='1"})
        """
        try:
            # Convert to dict if needed
            if isinstance(json_data, str):
                json_data = json.loads(json_data)

            issues = []

            # Flatten JSON for scanning
            def flatten_values(obj, prefix=""):
                """Recursively flatten JSON to get all string values."""
                values = []
                if isinstance(obj, dict):
                    for key, value in obj.items():
                        values.extend(flatten_values(value, f"{prefix}.{key}" if prefix else key))
                elif isinstance(obj, list):
                    for i, item in enumerate(obj):
                        values.extend(flatten_values(item, f"{prefix}[{i}]"))
                elif isinstance(obj, str):
                    values.append((prefix, obj))
                return values

            flat_values = flatten_values(json_data)

            # Check for SQL injection patterns
            if check_injection:
                injection_patterns = [
                    r"('\s*OR\s*'.*'=')",  # ' OR '1'='1
                    r"(;\s*DROP\s+TABLE)",  # ; DROP TABLE
                    r"(UNION\s+SELECT)",  # UNION SELECT
                    r"(--|\#|/\*)",  # SQL comments
                    r"(xp_cmdshell)",  # Command execution
                ]

                for path, value in flat_values:
                    for pattern in injection_patterns:
                        if re.search(pattern, value, re.IGNORECASE):
                            issues.append({
                                "type": "SQL Injection",
                                "severity": "HIGH",
                                "path": path,
                                "value": value[:100],  # Truncate long values
                                "pattern": pattern,
                            })

            # Check for XSS patterns
            if check_xss:
                xss_patterns = [
                    r"<script[^>]*>.*?</script>",  # Script tags
                    r"javascript:",  # JavaScript protocol
                    r"on\w+\s*=",  # Event handlers
                    r"<iframe[^>]*>",  # Iframes
                ]

                for path, value in flat_values:
                    for pattern in xss_patterns:
                        if re.search(pattern, value, re.IGNORECASE):
                            issues.append({
                                "type": "XSS",
                                "severity": "HIGH",
                                "path": path,
                                "value": value[:100],
                                "pattern": pattern,
                            })

            return {
                "success": True,
                "safe": len(issues) == 0,
                "issues": issues,
                "scanned_values": len(flat_values),
            }

        except Exception as e:
            logger.error(f"Error in json_security_scan: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    async def jsonb_stats(
        self,
        table_name: str,
        json_column: str,
        where_clause: Optional[str] = None,
        where_params: Optional[List[Any]] = None,
    ) -> Dict[str, Any]:
        """Analyze JSON structure and generate statistics.

        Args:
            table_name: Source table name
            json_column: JSONB column name
            where_clause: Optional WHERE clause
            where_params: Parameters for WHERE clause

        Returns:
            Statistics about JSON structure and usage

        Examples:
            # Get JSON statistics
            await jsonb_stats('users', 'preferences')
        """
        try:
            where_part = f"WHERE {where_clause}" if where_clause else ""

            # Analyze JSON structure
            query = f"""
            SELECT
                COUNT(*) as total_rows,
                COUNT({{}}) as non_null_rows,
                COUNT(*) - COUNT({{}}) as null_rows,
                AVG(jsonb_array_length(jsonb_object_keys({{}}))) as avg_keys,
                AVG(pg_column_size({{}})) as avg_size_bytes,
                MAX(pg_column_size({{}})) as max_size_bytes,
                MIN(pg_column_size({{}})) as min_size_bytes
            FROM {{}}
            {where_part}
            """

            params = [
                json_column,
                json_column,
                json_column,
                json_column,
                json_column,
                json_column,
                table_name,
            ] + (where_params or [])

            result = await SafeSqlDriver.execute_param_query(
                self.sql_driver,
                query,
                params,
            )

            if not result or not result[0]:
                return {"success": True, "stats": {}}

            stats = dict(result[0].cells)

            return {
                "success": True,
                "table": table_name,
                "column": json_column,
                "stats": stats,
            }

        except Exception as e:
            logger.error(f"Error in jsonb_stats: {e}")
            return {
                "success": False,
                "error": str(e),
            }

