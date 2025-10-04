"""Prompt Handlers for PostgreSQL MCP Server.

Provides guided workflows through MCP Prompts.
"""

import logging
from typing import Optional

import mcp.types as types
from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)


def register_prompts(mcp: FastMCP) -> None:
    """Register all prompts with the MCP server.

    Args:
        mcp: FastMCP server instance
    """

    @mcp.prompt()
    async def optimize_query(query: str, include_hypothetical: bool = True) -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Guide user through query optimization workflow."""

        prompt_text = f"""# Query Optimization Workflow

I'll help you analyze and optimize this query:

```sql
{query}
```

## Step-by-Step Optimization Process

### 1. **Analyze Current Performance**

First, let's run EXPLAIN ANALYZE to see how PostgreSQL executes this query:

Use the `explain_query` tool with:
- sql: `{query}`
- analyze: true

This will show:
- Actual execution time
- Row count estimates vs. actual
- Index usage
- Join methods
- Buffer hits and I/O

### 2. **Identify Bottlenecks**

Look for these warning signs in the execution plan:
- **Sequential Scans** on large tables (suggests missing indexes)
- **Nested Loop Joins** with high row counts (inefficient join method)
- **Sort** or **Hash** operations (may need covering indexes)
- **Large differences** between estimated and actual rows (statistics issue)

### 3. **Check Query History**

Use the `get_top_queries` tool to see if this query appears in top slow queries:
- sort_by: "mean_time"
- limit: 50

This tells us if it's a consistently slow query or one-time issue.

### 4. **Generate Index Recommendations**

Use the `analyze_query_indexes` tool with:
- queries: [`{query}`]
- method: "dta"

This uses the Database Tuning Advisor to recommend optimal indexes.

{"### 5. **Test Recommendations Safely (Zero Risk)**" if include_hypothetical else ""}

{
            f'''Use the `explain_query` tool with hypothetical indexes:
- sql: `{query}`
- analyze: false
- hypothetical_indexes: [recommended indexes from step 4]

This uses the hypopg extension to test indexes WITHOUT actually creating them.
No disk I/O, no performance impact, completely safe!'''
            if include_hypothetical
            else ""
        }

### 6. **Compare Results**

I'll create a side-by-side comparison showing:
- Current execution time vs. with recommended indexes
- Cost reduction estimate
- Index creation time estimate
- Storage overhead

### 7. **Implementation Plan**

If the indexes show improvement, I'll provide:
- Safe index creation SQL (with CONCURRENTLY option)
- Rollback plan
- Monitoring queries to verify improvement

## Ready to Start?

Let's begin with Step 1. Use the `explain_query` tool as shown above, and I'll analyze the results with you.

**Pro Tip:** The hypopg extension lets us test indexes risk-free - this is unique to PostgreSQL and one of its most powerful optimization features!
"""

        return types.GetPromptResult(
            description=f"Query optimization workflow for: {query[:100]}...",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def index_tuning(schema_name: str = "public", focus: str = "all") -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Comprehensive index analysis and optimization."""

        prompt_text = f"""# Index Tuning Workflow - Schema: {schema_name}

Focus Area: **{focus.title()}**

I'll help you analyze and optimize indexes in your database.

## Analysis Steps

### 1. **Current Index Usage Analysis**

Let's see which indexes are actually being used:

```sql
-- Use the execute_sql tool:
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = '{schema_name}'
ORDER BY idx_scan ASC;
```

**What to look for:**
- Indexes with **idx_scan = 0** → Never used (candidates for removal)
- Large indexes with low scan counts → Expensive but rarely useful
- High tuples_read with low tuples_fetched → Index not selective enough

### 2. **Identify Missing Indexes**

Use the `analyze_workload_indexes` tool:
- method: "dta"
- max_index_size_mb: 10000

This analyzes pg_stat_statements to find queries that would benefit from new indexes.

### 3. **Find Duplicate/Redundant Indexes**

```sql
-- Duplicate indexes query:
SELECT
    t.tablename,
    array_agg(i.indexname) as index_names,
    i.indexdef
FROM pg_indexes i
JOIN pg_tables t ON i.tablename = t.tablename
WHERE t.schemaname = '{schema_name}'
GROUP BY t.tablename, i.indexdef
HAVING COUNT(*) > 1;
```

**Redundant index patterns:**
- Index on (a, b) makes index on (a) redundant
- Multiple indexes with same columns in different order
- Partial indexes that overlap completely

### 4. **Calculate Index Bloat**

```sql
-- Index bloat analysis:
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = '{schema_name}'
  AND pg_relation_size(indexrelid) > 10485760  -- > 10MB
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 5. **Generate Action Plan**

Based on the analysis, I'll provide a prioritized action plan:

**High Priority (Do First):**
- Drop unused indexes (immediate space savings, no performance impact)
- Add missing indexes for top slow queries (immediate performance gain)

**Medium Priority (Plan Carefully):**
- Replace redundant indexes
- Rebuild bloated indexes
- Add partial indexes for common filters

**Low Priority (Monitor First):**
- Experimental index optimizations
- Covering indexes for specific queries

### 6. **Safe Implementation**

For each recommendation, I'll provide:

```sql
-- Example: Safe index creation (doesn't block table)
CREATE INDEX CONCURRENTLY idx_users_email
ON users(email)
WHERE active = true;

-- Example: Safe index removal (with backup plan)
BEGIN;
DROP INDEX IF EXISTS idx_old_unused;
-- Test queries here
-- If problems: ROLLBACK;
-- If good: COMMIT;
```

## Specific Focus Areas

"""

        if focus in ["unused", "all"]:
            prompt_text += """
**Unused Indexes:**
- Zero or very low idx_scan counts
- Consider grace period (index might be for monthly reports)
- Always check with application team before dropping
- Calculate storage savings: can free up gigabytes
"""

        if focus in ["missing", "all"]:
            prompt_text += """
**Missing Indexes:**
- Queries with sequential scans on large tables
- Joins without appropriate indexes
- WHERE clauses on unindexed columns
- Test with hypopg before creating (zero risk)
"""

        if focus in ["duplicate", "all"]:
            prompt_text += """
**Duplicate/Redundant Indexes:**
- Multiple indexes with identical definitions
- Overlapping multi-column indexes
- Keep the most frequently used, drop others
- Can reduce index maintenance overhead significantly
"""

        prompt_text += """

## Ready to Begin?

Let's start with Step 1. Run the index usage query above using the `execute_sql` tool, and I'll help you interpret the results.

**Pro Tip:** Use CONCURRENTLY when creating indexes on production databases - it takes longer but doesn't block writes!
"""

        return types.GetPromptResult(
            description=f"Index tuning workflow for schema '{schema_name}' (focus: {focus})",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def database_health_check(focus: str = "all") -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Comprehensive database health assessment."""

        prompt_text = f"""# Database Health Check - Focus: {focus.title()}

I'll run a comprehensive health assessment of your PostgreSQL database.

## Health Check Categories

### 1. **Extension Availability**

First, let's verify critical extensions are installed:

Use the `list_objects` tool:
- schema_name: "public"
- object_type: "extension"

**Critical extensions:**
- **pg_stat_statements** - Query performance tracking (REQUIRED)
- **hypopg** - Safe index testing (recommended)
- **pgvector** - Vector/semantic search (if using AI features)
- **postgis** - Geospatial operations (if using GIS features)

### 2. **Database Health Analysis**

Use the `analyze_db_health` tool:
- health_type: "{focus}"

This runs comprehensive checks on:
"""

        if focus in ["indexes", "all"]:
            prompt_text += """
**Index Health:**
- Invalid indexes (need rebuilding)
- Duplicate indexes (waste space)
- Bloated indexes (need REINDEX)
- Unused indexes (candidates for removal)
"""

        if focus in ["connections", "all"]:
            prompt_text += """
**Connection Health:**
- Current connection count vs. max_connections
- Connection pool utilization
- Idle connections consuming resources
- Long-running transactions blocking others
"""

        if focus in ["vacuum", "all"]:
            prompt_text += """
**Vacuum Health:**
- Transaction ID wraparound risk (CRITICAL)
- Autovacuum effectiveness
- Table bloat estimates
- Dead tuple accumulation
"""

        if focus in ["replication", "all"]:
            prompt_text += """
**Replication Health:**
- Replication lag in milliseconds
- Replication slot status
- WAL sender/receiver status
- Streaming replication health
"""

        if focus in ["buffer", "all"]:
            prompt_text += """
**Buffer Cache Health:**
- Cache hit ratio for tables (should be > 99%)
- Cache hit ratio for indexes (should be > 99%)
- Buffer usage patterns
- Shared buffers effectiveness
"""

        if focus in ["constraint", "all"]:
            prompt_text += """
**Constraint Health:**
- Invalid foreign keys (need validation)
- Invalid check constraints
- Constraint validation failures
"""

        prompt_text += """

### 3. **Performance Metrics**

Check query performance using `get_top_queries`:
- sort_by: "total_time"
- limit: 20

**Warning signs:**
- Queries with mean_exec_time > 1000ms
- High variation in execution times
- Queries dominating total database time

### 4. **Capacity Planning**

Use the `capacity_planning` tool to analyze growth:
- forecast_days: 90
- include_table_growth: true
- include_index_growth: true

**Key metrics:**
- Database size growth rate
- Estimated time to disk full
- Table growth patterns
- Index growth vs. table growth

### 5. **Alert Threshold Check**

Use the `alert_threshold_set` tool to check critical metrics:

**Connection Limits:**
```
alert_threshold_set(
    metric_type="connection_count",
    warning_threshold=80,  # 80% of max_connections
    critical_threshold=95,  # 95% of max_connections
    check_current=true
)
```

**Cache Hit Ratio:**
```
alert_threshold_set(
    metric_type="cache_hit_ratio",
    warning_threshold=95,  # Should be > 99%
    critical_threshold=90,  # Below 90% is serious
    check_current=true
)
```

**Replication Lag:**
```
alert_threshold_set(
    metric_type="replication_lag",
    warning_threshold=5000,    # 5 seconds
    critical_threshold=30000,   # 30 seconds
    check_current=true
)
```

### 6. **Generate Health Report**

After running all checks, I'll provide:

**Health Score:** Overall database health (Good/Warning/Critical)

**Critical Issues (Fix Immediately):**
- Transaction ID wraparound risk
- Approaching connection limits
- Replication lag > 30 seconds
- Cache hit ratio < 90%

**Warnings (Plan to Fix):**
- Bloated indexes > 50%
- Unused indexes
- Slow query patterns
- Table growth concerns

**Recommendations:**
- Maintenance schedule (VACUUM, ANALYZE, REINDEX)
- Configuration tuning suggestions
- Capacity expansion timeline
- Monitoring improvements

## Ready to Start?

Let's begin with Step 1. Use the `list_objects` tool to check extension availability, and we'll proceed through each health category.

**Pro Tip:** Run health checks during low-traffic periods to get accurate baseline metrics!
"""

        return types.GetPromptResult(
            description=f"Database health check workflow (focus: {focus})",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def setup_pgvector(  # pyright: ignore[reportUnusedFunction]
        content_type: str = "documents", embedding_dimensions: int = 1536, distance_metric: str = "cosine"
    ) -> types.GetPromptResult:
        """Complete guide for setting up semantic search with pgvector."""

        prompt_text = f"""# pgVector Setup Guide - {content_type.title()}

I'll guide you through setting up semantic search with pgvector for {content_type}.

## Configuration
- **Content Type**: {content_type}
- **Embedding Dimensions**: {embedding_dimensions} (OpenAI ada-002 standard)
- **Distance Metric**: {distance_metric}

## Setup Steps

### 1. **Install pgvector Extension**

First, check if pgvector is available:

```sql
-- Use execute_sql tool:
SELECT * FROM pg_available_extensions WHERE name = 'vector';
```

If available, install it:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 2. **Create Table with Vector Column**

```sql
-- Example table for {content_type}
CREATE TABLE {content_type} (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector({embedding_dimensions}),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. **Choose Distance Metric**

PostgreSQL supports three distance metrics for pgvector:

**Cosine Distance** (most common for embeddings):
```sql
-- Finds semantically similar content
SELECT id, content,
       1 - (embedding <=> query_vector) as similarity
FROM {content_type}
ORDER BY embedding <=> query_vector
LIMIT 10;
```

**L2 Distance** (Euclidean):
```sql
-- Measures absolute distance
SELECT id, content, embedding <-> query_vector as distance
FROM {content_type}
ORDER BY embedding <-> query_vector
LIMIT 10;
```

**Inner Product** (for normalized vectors):
```sql
-- Dot product similarity
SELECT id, content, (embedding <#> query_vector) * -1 as similarity
FROM {content_type}
ORDER BY embedding <#> query_vector
LIMIT 10;
```

**Recommendation:** Use **{distance_metric}** for {content_type}.

### 4. **Create Appropriate Index**

For best performance, create an HNSW or IVFFlat index:

**HNSW Index** (Hierarchical Navigable Small World - Best Quality):
```sql
CREATE INDEX ON {content_type}
USING hnsw (embedding vector_{distance_metric}_ops)
WITH (m = 16, ef_construction = 64);
```

**IVFFlat Index** (Inverted File - Faster Build):
```sql
CREATE INDEX ON {content_type}
USING ivfflat (embedding vector_{distance_metric}_ops)
WITH (lists = 100);
```

**For {embedding_dimensions} dimensions:** Use HNSW for best recall, IVFFlat for faster indexing.

### 5. **Generate Embeddings**

You'll need to generate embeddings using an AI model (like OpenAI):

```python
# Python example with OpenAI
import openai

def get_embedding(text):
    response = openai.Embedding.create(
        input=text,
        model="text-embedding-ada-002"
    )
    return response['data'][0]['embedding']

# Store in database
embedding = get_embedding("Your content here")
# INSERT INTO {content_type} (content, embedding) VALUES (%s, %s::vector)
```

### 6. **Query Similar Content**

Use the `vector_search` tool:
```
vector_search(
    table_name="{content_type}",
    vector_column="embedding",
    query_vector=[...],  # Your query embedding
    distance_metric="{distance_metric}",
    limit=10
)
```

### 7. **Optimize Performance**

Monitor and tune your vector index:

```sql
-- Check index size
SELECT pg_size_pretty(pg_relation_size('{content_type}_embedding_idx'));

-- Vacuum regularly
VACUUM ANALYZE {content_type};
```

Use the `vector_performance` tool to benchmark:
```
vector_performance(
    table_name="{content_type}",
    vector_column="embedding",
    query_vector=[...],
    distance_metric="{distance_metric}",
    test_limits=[10, 50, 100]
)
```

## Common Use Cases

**Document Search:**
- Semantic search across documentation
- Find related articles
- Question answering systems

**Product Recommendations:**
- Similar product discovery
- Visual search
- Personalized recommendations

**Content Moderation:**
- Detect duplicate content
- Find policy violations
- Cluster similar items

## Best Practices

1. **Normalize embeddings** before storage if using inner product distance
2. **Batch insert** embeddings for better performance
3. **Monitor index recall** with vector_performance tool
4. **Use HNSW indexes** for production (better recall)
5. **Tune index parameters** based on your data size:
   - Small dataset (< 100K): m=16, ef_construction=64
   - Medium dataset (100K-1M): m=32, ef_construction=128
   - Large dataset (> 1M): m=48, ef_construction=256

## Ready to Start?

Begin with Step 1 - check if pgvector is available, then we'll proceed through each step together.

**Pro Tip:** pgvector is PostgreSQL's killer AI feature - no other database does vector search this well!
"""

        return types.GetPromptResult(
            description=f"pgvector setup guide for {content_type} with {embedding_dimensions}D embeddings",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def json_operations(  # pyright: ignore[reportUnusedFunction]
        table_name: str, json_column: str, operation_type: str = "query"
    ) -> types.GetPromptResult:
        """Guide for effective JSONB operations and optimization."""

        prompt_text = f"""# JSONB Operations Guide - {table_name}.{json_column}

Operation Focus: **{operation_type.title()}**

I'll guide you through effective JSONB operations for {table_name}.{json_column}.

## Current Table Analysis

First, let's analyze your JSONB column:

```sql
-- Use execute_sql tool to get structure sample:
SELECT {json_column}
FROM {table_name}
LIMIT 5;
```

## JSONB Operation Patterns

### 1. **Querying JSONB Data**

**Extract Specific Keys:**
```sql
-- Single level: data->>'key'
SELECT id, {json_column}->>'name' as name
FROM {table_name};

-- Nested path: data#>>'{{"{{path,to,value"}}}}'
SELECT id, {json_column}#>>'{{"{{user,email"}}}}' as email
FROM {table_name};
```

**Filter by JSONB Values:**
```sql
-- Exact match
WHERE {json_column}->>'status' = 'active'

-- Existence check
WHERE {json_column} ? 'key'

-- Contains (@@>)
WHERE {json_column} @> '{{"{{\"active\": true"}}}}'

-- Contained by (<@)
WHERE '{{"{{\"role\": \"admin"}}}}' <@ {json_column}
```

### 2. **Updating JSONB Data**

Use the `json_update` tool for safe updates:
```
json_update(
    table_name="{table_name}",
    json_column="{json_column}",
    json_path="{{user,email}}",
    new_value="new@example.com",
    where_clause="id = %s",
    where_params=[123],
    create_if_missing=True
)
```

**Native PostgreSQL Update:**
```sql
-- Update nested value
UPDATE {table_name}
SET {json_column} = jsonb_set(
    {json_column},
    '{{"{{user,email}}}}',
    '"new@example.com"',
    true  -- create if missing
)
WHERE id = 123;
```

### 3. **Indexing JSONB Columns**

**GIN Index** (General Inverted Index - Most Common):
```sql
-- Index entire JSONB column
CREATE INDEX idx_{table_name}_{json_column}_gin
ON {table_name} USING GIN ({json_column});

-- Supports: @>, ?, ?&, ?|
```

**Expression Index** (For Specific Keys):
```sql
-- Index a specific key
CREATE INDEX idx_{table_name}_{json_column}_status
ON {table_name} ((({json_column}->>'status')));

-- Now this is fast:
-- WHERE {json_column}->>'status' = 'active'
```

**Partial Index** (Filtered):
```sql
-- Index only active records
CREATE INDEX idx_{table_name}_{json_column}_active
ON {table_name} USING GIN ({json_column})
WHERE {json_column}->>'active' = 'true';
```

### 4. **Efficient Query Patterns**

**DO - Fast Queries:**
```sql
-- ✅ Use containment (@>) - uses GIN index
WHERE {json_column} @> '{{"status": "active"}}'

-- ✅ Use existence (?) - uses GIN index
WHERE {json_column} ? 'email'

-- ✅ Use expression index
WHERE {json_column}->>'status' = 'active'  -- if indexed
```

**DON'T - Slow Queries:**
```sql
-- ❌ Function on indexed column
WHERE LOWER({json_column}->>'name') = 'john'

-- ❌ Not operator without support
WHERE NOT ({json_column} @> '{{"status": "active"}}')

-- ❌ Wildcard JSON path
WHERE {json_column}::text LIKE '%email%'
```

### 5. **Advanced Operations**

**Aggregating JSONB:**
```sql
-- Collect all values for a key
SELECT jsonb_agg({json_column}->>'name') as all_names
FROM {table_name};

-- Build JSONB object from query
SELECT jsonb_object_agg(id, {json_column}->>'name') as id_to_name
FROM {table_name};
```

**Merging JSONB:**
```sql
-- Merge two JSONB columns
UPDATE {table_name}
SET {json_column} = {json_column} || '{{"updated": true}}'::jsonb
WHERE id = 123;
```

## Performance Analysis

Use the `jsonb_stats` tool to analyze your JSONB structure:
```
jsonb_stats(
    table_name="{table_name}",
    json_column="{json_column}"
)
```

Use the `jsonb_index_suggest` tool for index recommendations:
```
jsonb_index_suggest(
    table_name="{table_name}",
    json_column="{json_column}",
    analyze_usage=true
)
```

## Security Best Practices

**Always use parameterized queries:**
```sql
-- ✅ SAFE - Uses parameter binding
WHERE {json_column}->>'email' = %s

-- ❌ UNSAFE - String concatenation
WHERE {json_column}->>'email' = '" + user_input + "'
```

**Validate JSON input:**
Use the `json_security_scan` tool:
```
json_security_scan(
    json_data=user_input,
    check_injection=true,
    check_xss=true
)
```

## Common Pitfalls

1. **No Index**: Always index JSONB columns you query frequently
2. **Wrong Operator**: Use @> instead of = for containment checks
3. **Text Casting**: Avoid {json_column}::text LIKE patterns
4. **Deep Nesting**: Flatten deeply nested structures for better performance
5. **Large Documents**: Consider splitting large JSONB into separate columns

## Ready to Optimize?

Let's start by analyzing your current JSONB structure. Run the sample query above, and I'll help you identify optimization opportunities.

**Pro Tip:** JSONB is PostgreSQL's superpower - no other database does JSON this well!
"""

        return types.GetPromptResult(
            description=f"JSONB operations guide for {table_name}.{json_column} ({operation_type})",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def performance_baseline(  # pyright: ignore[reportUnusedFunction]
        baseline_duration: str = "1 week", critical_queries: Optional[list[str]] = None
    ) -> types.GetPromptResult:
        """Establish and monitor performance baselines."""

        if critical_queries is None:
            critical_queries = []
        critical_queries_list = (
            "\n".join([f"  {i + 1}. {q[:100]}..." for i, q in enumerate(critical_queries)])
            if critical_queries
            else "  (None specified - will analyze workload)"
        )

        prompt_text = f"""# Performance Baseline Establishment

Baseline Duration: **{baseline_duration}**

I'll help you establish performance baselines for your PostgreSQL database.

## Critical Queries to Monitor

{critical_queries_list}

## Baseline Process

### 1. **Verify pg_stat_statements Installation**

First, ensure pg_stat_statements is installed and configured:

```sql
-- Check if extension is installed
SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements';

-- If not installed:
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Verify configuration in postgresql.conf:
```
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all
pg_stat_statements.max = 10000
```

### 2. **Reset Statistics** (Optional - for clean baseline)

```sql
-- WARNING: This clears all historical data
SELECT pg_stat_statements_reset();
```

### 3. **Collect Representative Workload**

Let the database run under typical load for **{baseline_duration}**:

- Include normal business hours activity
- Include batch jobs and maintenance windows
- Capture peak and off-peak patterns
- Run all critical application workflows

### 4. **Establish Baseline Metrics**

After {baseline_duration}, capture baseline metrics:

**Overall Database Performance:**
```sql
-- Use execute_sql tool:
SELECT
    calls,
    total_exec_time,
    mean_exec_time,
    stddev_exec_time,
    min_exec_time,
    max_exec_time,
    rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 50;
```

**Query-Specific Baselines:**
Use the `performance_baseline` tool:
```
performance_baseline(
    queries=[
        "SELECT ...",  # Your critical queries
        "UPDATE ...",
        "DELETE ..."
    ],
    iterations=10  # Run each query 10 times
)
```

### 5. **Document Baseline Values**

Record these key metrics:

**Per-Query Baselines:**
- Mean execution time
- P50, P95, P99 execution times
- Average rows returned/affected
- Buffer hit ratio
- I/O patterns

**Database-Wide Baselines:**
- Total queries per second
- Cache hit ratio (should be > 99%)
- Connection pool utilization
- Replication lag (if applicable)
- Checkpoint frequency

### 6. **Set Up Monitoring**

Create monitoring queries for ongoing comparison:

```sql
-- Query performance degradation check
WITH baseline AS (
    SELECT
        query,
        mean_exec_time as baseline_time
    FROM pg_stat_statements_history  -- Your baseline snapshot
),
current AS (
    SELECT
        query,
        mean_exec_time as current_time
    FROM pg_stat_statements
)
SELECT
    c.query,
    b.baseline_time,
    c.current_time,
    ((c.current_time - b.baseline_time) / b.baseline_time * 100) as percent_change
FROM current c
JOIN baseline b USING (query)
WHERE c.current_time > b.baseline_time * 1.5  -- 50% slower
ORDER BY percent_change DESC
LIMIT 20;
```

### 7. **Establish Alert Thresholds**

Use the `alert_threshold_set` tool for each critical metric:

**Query Execution Time:**
```
alert_threshold_set(
    metric_type="mean_execution_time",
    warning_threshold=<baseline_mean * 1.5>,
    critical_threshold=<baseline_mean * 2.0>,
    check_current=true
)
```

**Cache Hit Ratio:**
```
alert_threshold_set(
    metric_type="cache_hit_ratio",
    warning_threshold=95.0,  # Should be > 99%
    critical_threshold=90.0,
    check_current=true
)
```

## Performance Comparison Framework

### Regular Health Checks

Run these checks **daily** or **weekly**:

1. **Top Slow Queries:**
```
get_top_queries(
    sort_by="mean_time",
    limit=20
)
```

2. **Workload Analysis:**
```
analyze_workload_indexes(
    method="dta",
    max_index_size_mb=10000
)
```

3. **Database Health:**
```
analyze_db_health(
    health_type="all"
)
```

### Baseline Drift Detection

Monitor for these warning signs:

- Query execution times increasing > 50%
- Cache hit ratio dropping below 99%
- Index scans decreasing (more seq scans)
- Connection pool utilization increasing
- Replication lag increasing

## Continuous Improvement

**Monthly Review:**
1. Compare current metrics to baseline
2. Identify queries with performance degradation
3. Use `optimize_query` prompt for slow queries
4. Update indexes using `index_tuning` prompt
5. Re-establish baseline after major optimizations

**Quarterly Re-baseline:**
- Reset baselines after major schema changes
- Account for data volume growth
- Adjust alert thresholds based on trends

## Ready to Establish Baseline?

Let's start with Step 1 - verify pg_stat_statements is installed and configured properly.

**Pro Tip:** Baselines are only useful if collected under representative load - don't baseline during maintenance windows!
"""

        return types.GetPromptResult(
            description=f"Performance baseline establishment workflow ({baseline_duration})",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def backup_strategy(  # pyright: ignore[reportUnusedFunction]
        backup_type: str = "logical", retention_period: int = 30
    ) -> types.GetPromptResult:
        """Design and implement backup strategy."""

        prompt_text = f"""# Enterprise Backup Strategy - {backup_type.title()} Backup

Retention Period: **{retention_period} days**

I'll help you design and implement an enterprise backup strategy for PostgreSQL.

## Backup Types Overview

**Logical Backup (pg_dump/pg_dumpall):**
- ✅ Portable across PostgreSQL versions
- ✅ Selective backup (specific schemas/tables)
- ✅ Human-readable SQL format
- ❌ Slower for large databases
- ❌ Requires more processing power

**Physical Backup (pg_basebackup):**
- ✅ Fast backup for large databases
- ✅ Binary copy of data directory
- ✅ Supports point-in-time recovery (PITR)
- ❌ PostgreSQL version specific
- ❌ All-or-nothing (can't select schemas)

**Continuous Archiving (WAL):**
- ✅ Point-in-time recovery to any second
- ✅ Minimal data loss (RPO < 1 minute)
- ✅ Supports streaming replication
- ❌ More complex to set up
- ❌ Requires more storage

**Current Selection: {backup_type.title()}**

## Backup Strategy Design

### 1. **Assess Database Characteristics**

First, let's gather information about your database:

```sql
-- Database size and growth
SELECT
    pg_size_pretty(pg_database_size(current_database())) as total_size,
    pg_database_size(current_database()) as size_bytes;

-- Table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY size_bytes DESC
LIMIT 20;
```

Use the `capacity_planning` tool to analyze growth:
```
capacity_planning(
    forecast_days=90,
    include_table_growth=true,
    include_index_growth=true
)
```

### 2. **Calculate Backup Requirements**

**Storage Requirements:**
- Full backup size: ~100% of database size
- Compressed backup: ~30-50% of database size
- WAL archive: ~5-10% per day
- Total for {retention_period} days: Calculate based on above

**Time Requirements:**
- Backup window: When can you run backups?
- Acceptable backup duration: How long can backup take?
- Network bandwidth: For remote backups
- CPU/IO impact: During backup operation

### 3. **Design Backup Schedule**

Use the `backup_schedule_optimize` tool:
```
backup_schedule_optimize(
    daily_change_rate_mb=<estimate>,
    backup_window_hours=8,
    retention_days={retention_period}
)
```

**Recommended Schedule (for {backup_type}):**

"""

        if backup_type == "logical":
            prompt_text += """
**Logical Backup Schedule:**

- **Full Backup:** Daily at 2:00 AM
  ```bash
  pg_dump -Fc -Z9 -f /backup/db_$(date +%Y%m%d).dump dbname
  ```

- **Schema-Only Backup:** Daily at 1:00 AM
  ```bash
  pg_dump --schema-only -f /backup/schema_$(date +%Y%m%d).sql dbname
  ```

- **Critical Tables:** Every 6 hours
  ```bash
  pg_dump -Fc -t critical_table -f /backup/critical_$(date +%Y%m%d_%H).dump dbname
  ```
"""
        elif backup_type == "physical":
            prompt_text += """
**Physical Backup Schedule:**

- **Base Backup:** Weekly on Sunday at 2:00 AM
  ```bash
  pg_basebackup -D /backup/base_$(date +%Y%m%d) -Ft -z -P
  ```

- **WAL Archiving:** Continuous (configure in postgresql.conf)
  ```
  archive_mode = on
  archive_command = 'cp %p /backup/wal/%f'
  ```

- **Incremental:** Based on WAL files (automatic)
"""
        else:
            prompt_text += """
**Continuous Archiving Schedule:**

- **Base Backup:** Weekly on Sunday at 2:00 AM
- **WAL Archiving:** Continuous (every 16MB or 1 minute)
- **Point-in-Time Recovery:** Available to any second
"""

        prompt_text += (
            """

### 4. **Implement Backup Solution**

Use the `backup_logical` or `backup_physical` tool:

```
backup_logical(
    schema_name=None,  # All schemas
    table_names=None,  # All tables
    include_data=true,
    include_schema=true,
    validate_after=true
)
```

**Automated Backup Script:**
```bash
#!/bin/bash
# PostgreSQL Automated Backup Script

DB_NAME="your_database"
BACKUP_DIR="/backup"
RETENTION_DAYS="""
            + str(retention_period)
            + """

# Create backup
BACKUP_FILE="${BACKUP_DIR}/db_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -Fc -Z9 -f "${BACKUP_FILE}" "${DB_NAME}"

# Verify backup
if pg_restore -l "${BACKUP_FILE}" > /dev/null 2>&1; then
    echo "Backup successful: ${BACKUP_FILE}"
else
    echo "ERROR: Backup verification failed!" >&2
    exit 1
fi

# Cleanup old backups
find "${BACKUP_DIR}" -name "db_*.dump" -mtime +${RETENTION_DAYS} -delete

# Log success
echo "Backup completed at $(date)" >> "${BACKUP_DIR}/backup.log"
```

### 5. **Validate Backup Integrity**

Use the `restore_validate` tool before backup:
```
restore_validate(
    check_disk_space=true,
    check_connections=true,
    check_constraints=true
)
```

**Test Restore Regularly:**
```bash
# Monthly restore test
pg_restore -d test_restore_db /backup/latest.dump

# Verify data integrity
psql test_restore_db -c "SELECT COUNT(*) FROM critical_table;"
```

### 6. **Monitor and Alert**

**Backup Monitoring Checks:**

1. **Backup Success Rate:**
   - Track successful vs. failed backups
   - Alert if backup fails 2x in a row

2. **Backup Duration:**
   - Monitor backup time trends
   - Alert if backup takes > 2x normal time

3. **Backup Size:**
   - Track backup growth rate
   - Alert if backup size increases unexpectedly

4. **Storage Space:**
   - Monitor backup directory space
   - Alert at 80% capacity

### 7. **Recovery Procedures**

**Document recovery steps:**

**Full Database Restore:**
```bash
# Stop application
# Drop existing database (if needed)
dropdb dbname

# Create new database
createdb dbname

# Restore from backup
pg_restore -d dbname /backup/latest.dump

# Verify data
psql dbname -c "SELECT COUNT(*) FROM users;"
```

**Point-in-Time Recovery** (if using WAL archiving):
```bash
# Restore base backup
pg_basebackup -D /pgdata -Ft -z

# Configure recovery.conf
cat > /pgdata/recovery.conf << EOF
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2024-01-15 14:30:00'
EOF

# Start PostgreSQL
pg_ctl start
```

## Disaster Recovery Plan

1. **RTO (Recovery Time Objective):** How quickly must database be restored?
2. **RPO (Recovery Point Objective):** How much data loss is acceptable?
3. **Off-site Backups:** Store copies in different location/cloud
4. **Tested Restore Procedures:** Practice restore quarterly
5. **Documentation:** Keep recovery procedures up-to-date

## Cost Optimization

**Storage Costs:**
- Use compression (-Z9 for maximum)
- Archive to cheaper storage tier after 7 days
- Delete backups after {retention_period} days

**Performance Impact:**
- Run backups during low-traffic windows
- Use `--no-sync` for faster dumps (if acceptable)
- Consider streaming replication for hot standby

## Ready to Implement?

Let's start with Step 1 - assess your database characteristics and calculate requirements.

**Pro Tip:** The best backup is the one you've successfully restored - test your backups regularly!
"""
        )

        return types.GetPromptResult(
            description=f"Backup strategy design workflow ({backup_type}, {retention_period} days retention)",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def setup_postgis(use_case: str = "mapping") -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Guide for setting up and using PostGIS."""

        prompt_text = f"""# PostGIS Setup Guide - {use_case.title()}

I'll guide you through setting up PostGIS for {use_case} operations.

## PostGIS Overview

PostGIS is the industry-standard spatial database extension for PostgreSQL, providing:
- 400+ spatial functions
- Spatial indexing (GiST, BRIN, SP-GiST)
- Geometry and geography data types
- Spatial relationship analysis
- Advanced GIS operations

## Setup Steps

### 1. **Install PostGIS Extension**

Check if PostGIS is available:

```sql
-- Use execute_sql tool:
SELECT * FROM pg_available_extensions WHERE name = 'postgis';
```

Install PostGIS:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify installation
SELECT PostGIS_Full_Version();
```

### 2. **Understand Data Types**

PostGIS provides two main spatial data types:

**Geometry** (Planar coordinates):
- For local/regional mapping
- Uses projected coordinate systems
- Faster computations
- Example: State plane coordinates

**Geography** (Spherical coordinates):
- For global mapping
- Uses lat/lon (WGS84)
- More accurate for long distances
- Example: GPS coordinates

**For {use_case}:** Use {"Geography for global mapping" if use_case in ["mapping", "routing"] else "Geometry for local analysis"}.

### 3. **Create Spatial Table**

"""

        if use_case == "mapping":
            prompt_text += """
**Example: Store Locations**
```sql
CREATE TABLE locations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location GEOGRAPHY(POINT, 4326),  -- WGS84 (GPS)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data (lat, lon)
INSERT INTO locations (name, location)
VALUES ('San Francisco', ST_GeographyFromText('POINT(-122.4194 37.7749)'));
```
"""
        elif use_case == "distance_calc":
            prompt_text += """
**Example: Distance Calculations**
```sql
CREATE TABLE points_of_interest (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    category VARCHAR(50),
    location GEOGRAPHY(POINT, 4326)
);

-- Find nearest POIs
SELECT
    name,
    ST_Distance(
        location,
        ST_GeographyFromText('POINT(-122.4194 37.7749)')
    ) / 1000 as distance_km
FROM points_of_interest
ORDER BY location <-> ST_GeographyFromText('POINT(-122.4194 37.7749)')
LIMIT 10;
```
"""
        elif use_case == "spatial_analysis":
            prompt_text += """
**Example: Spatial Analysis**
```sql
CREATE TABLE regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    boundary GEOGRAPHY(POLYGON, 4326),
    properties JSONB
);

-- Check if point is within region
SELECT r.name
FROM regions r
WHERE ST_Contains(
    r.boundary::geometry,
    ST_GeographyFromText('POINT(-122.4194 37.7749)')::geometry
);
```
"""
        elif use_case == "routing":
            prompt_text += """
**Example: Routing/Networks**
```sql
CREATE TABLE roads (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    road_type VARCHAR(50),
    geometry GEOGRAPHY(LINESTRING, 4326),
    length_meters FLOAT,
    speed_limit INT
);

-- Find roads within distance
SELECT name, road_type
FROM roads
WHERE ST_DWithin(
    geometry,
    ST_GeographyFromText('POINT(-122.4194 37.7749)'),
    1000  -- 1km
);
```
"""

        prompt_text += """

### 4. **Create Spatial Index**

Spatial indexes dramatically improve query performance:

```sql
-- GiST index (most common for PostGIS)
CREATE INDEX idx_locations_geog ON locations USING GIST (location);

-- For geometry type:
-- CREATE INDEX idx_geom ON table_name USING GIST (geom_column);
```

### 5. **Common Spatial Queries**

**Distance Queries:**

Use the `geo_distance` tool:
```
geo_distance(
    table_name="locations",
    geometry_column="location",
    reference_point="POINT(-122.4194 37.7749)",
    distance_type="kilometers",
    max_distance=10.0,
    limit=100
)
```

Or native SQL:
```sql
-- Find all within 10km
SELECT name,
       ST_Distance(location, ST_GeographyFromText('POINT(-122.4194 37.7749)')) / 1000 as km
FROM locations
WHERE ST_DWithin(location, ST_GeographyFromText('POINT(-122.4194 37.7749)'), 10000);
```

**Containment Queries:**

Use the `geo_within` tool:
```
geo_within(
    table_name="locations",
    geometry_column="location",
    boundary_geometry="POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.8, -122.5 37.8, -122.5 37.7))",
    geometry_type="polygon"
)
```

**Buffer Operations:**

Use the `geo_buffer` tool:
```
geo_buffer(
    table_name="locations",
    geometry_column="location",
    buffer_distance=5.0,
    distance_unit="kilometers"
)
```

**Intersection Queries:**

Use the `geo_intersection` tool:
```
geo_intersection(
    table_name="locations",
    geometry_column="location",
    intersecting_geometry="POLYGON(...)",
    return_intersection=true
)
```

### 6. **Optimize Performance**

**Index Optimization:**

Use the `geo_index_optimize` tool:
```
geo_index_optimize(
    table_name="locations",
    geometry_column="location",
    index_type="gist"
)
```

**Clustering:**

Use the `geo_cluster` tool for spatial clustering:
```
geo_cluster(
    table_name="locations",
    geometry_column="location",
    cluster_distance=1000,  # meters
    distance_unit="meters",
    min_points=5
)
```

### 7. **Advanced Operations**

**Coordinate Transformation:**

Use the `geo_transform` tool:
```
geo_transform(
    table_name="locations",
    geometry_column="location",
    source_srid=4326,  # WGS84
    target_srid=3857   # Web Mercator
)
```

**Spatial Aggregations:**
```sql
-- Union all geometries
SELECT ST_Union(location::geometry) as combined_area
FROM locations
WHERE category = 'parks';

-- Calculate total area
SELECT SUM(ST_Area(boundary::geometry)) as total_area_sqm
FROM regions;

-- Centroid of multiple points
SELECT ST_Centroid(ST_Collect(location::geometry)) as center
FROM locations;
```

## Use Case Specific Examples

"""

        if use_case == "mapping":
            prompt_text += """
**Interactive Mapping:**
```sql
-- Generate GeoJSON for web maps
SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', jsonb_agg(
        jsonb_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(location)::jsonb,
            'properties', jsonb_build_object('name', name)
        )
    )
) as geojson
FROM locations;
```
"""
        elif use_case == "distance_calc":
            prompt_text += """
**Nearest Neighbor Search:**
```sql
-- Find 5 nearest locations to a point
SELECT
    name,
    ST_Distance(location, ST_GeographyFromText('POINT(-122.4 37.8)')) as distance
FROM locations
ORDER BY location <-> ST_GeographyFromText('POINT(-122.4 37.8)')
LIMIT 5;
```
"""
        elif use_case == "routing":
            prompt_text += """
**Network Analysis:**
```sql
-- Find connected road segments
SELECT r1.name as from_road, r2.name as to_road
FROM roads r1
JOIN roads r2 ON ST_Intersects(r1.geometry::geometry, r2.geometry::geometry)
WHERE r1.id < r2.id;
```
"""

        prompt_text += """

## Best Practices

1. **Always use spatial indexes** - 100x+ performance improvement
2. **Choose appropriate SRID** - 4326 for global, local SRID for regional
3. **Use geography for distance** - More accurate than geometry for Earth
4. **Simplify geometries** when possible - Use ST_Simplify() for performance
5. **VACUUM ANALYZE regularly** - Keep statistics current for query planning

## Common Pitfalls

1. ❌ Mixing geometry and geography without casting
2. ❌ Not using spatial indexes for large datasets
3. ❌ Using wrong SRID for coordinate system
4. ❌ Not validating geometries (use ST_IsValid())
5. ❌ Calculating area/distance on lat/lon without casting to geography

## Ready to Start?

Let's begin with Step 1 - check if PostGIS is available and install it.

**Pro Tip:** PostGIS is PostgreSQL's GIS superpower - it's the industry standard for spatial databases!
"""

        return types.GetPromptResult(
            description=f"PostGIS setup guide for {use_case}",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def explain_analyze_workflow(query: str, format: str = "text") -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Deep dive into EXPLAIN ANALYZE output."""

        prompt_text = f"""# EXPLAIN ANALYZE Deep Dive

Query: `{query[:100]}...`
Output Format: **{format}**

I'll help you analyze this query's execution plan in detail.

## Understanding EXPLAIN ANALYZE

EXPLAIN ANALYZE runs the query and shows:
- **Actual execution time** (not just estimates)
- **Actual row counts** vs. estimated
- **Buffer hits/misses** (I/O patterns)
- **Node execution times** (which parts are slow)
- **Join methods** and their costs

## Analysis Steps

### 1. **Run EXPLAIN ANALYZE**

```
explain_query(
    sql="{query}",
    analyze=true
)
```

### 2. **Interpret the Output**

**Key Metrics to Look For:**

**Timing:**
```
Execution Time: 1234.567 ms
Planning Time: 12.345 ms
```
- Planning time should be < 1% of execution time
- If planning > 10ms, consider prepared statements

**Node Types:**
- **Seq Scan**: Full table scan (slow for large tables)
- **Index Scan**: Uses index (fast)
- **Index Only Scan**: Uses index without table access (fastest)
- **Bitmap Heap Scan**: Multiple index lookups
- **Nested Loop**: Join method (good for small datasets)
- **Hash Join**: Join method (good for medium datasets)
- **Merge Join**: Join method (best for large sorted datasets)

**Actual vs. Estimated Rows:**
```
actual rows=10000 estimate rows=100
```
- Large differences indicate stale statistics
- Run `ANALYZE table_name;` to update statistics

**Buffer Usage:**
```
Buffers: shared hit=1234 read=5678
```
- **hit**: Data found in cache (fast)
- **read**: Data read from disk (slow)
- Cache hit ratio should be > 99%

### 3. **Identify Bottlenecks**

**Common Performance Issues:**

**Sequential Scans on Large Tables:**
```
-> Seq Scan on large_table  (actual time=1234.567..5678.901 rows=1000000)
   Filter: (status = 'active')
   Rows Removed by Filter: 999000
```
**Solution:** Add index on status column

**Poor Join Method:**
```
-> Nested Loop  (actual time=0.123..9876.543 rows=1000000)
```
**Solution:** Increase work_mem or add indexes to change join method

**Expensive Sort:**
```
-> Sort  (actual time=1234.567..2345.678 rows=1000000)
   Sort Method: external merge  Disk: 123456kB
```
**Solution:** Increase work_mem or add covering index

**Hash Aggregate Spilling:**
```
-> HashAggregate  (actual time=1234..5678 rows=100000)
   Disk Usage: 123456kB
```
**Solution:** Increase work_mem

### 4. **Generate Optimization Recommendations**

Based on the explain plan, I'll suggest:

1. **Missing Indexes:**
   - Which columns need indexes
   - Index type (B-tree, GIN, GiST)
   - Partial indexes for filtered queries

2. **Statistics Updates:**
   ```sql
   ANALYZE table_name;
   ```

3. **Configuration Tuning:**
   ```sql
   -- Increase work_mem for sorts/hashes
   SET work_mem = '256MB';

   -- Enable parallel workers
   SET max_parallel_workers_per_gather = 4;
   ```

4. **Query Rewrite:**
   - Simplify subqueries
   - Use CTEs or temp tables
   - Break into smaller queries

### 5. **Test with Hypothetical Indexes**

Use the `explain_query` tool with hypothetical indexes:
```
explain_query(
    sql="{query}",
    analyze=false,
    hypothetical_indexes=[
        {{"table": "table_name", "columns": ["status"], "using": "btree"}}
    ]
)
```

This tests the impact of indexes WITHOUT creating them!

### 6. **Compare Before/After**

Use the `query_plan_compare` tool:
```
query_plan_compare(
    query1="{query}",  # Original
    query2="{query}",  # Optimized version
)
```

## Interpreting Specific Node Types

**Seq Scan:**
```
-> Seq Scan on users  (cost=0.00..1234.56 rows=10000 width=123)
```
- Reads entire table sequentially
- **When OK:** Small tables (< 1000 rows)
- **When BAD:** Large tables with WHERE clauses

**Index Scan:**
```
-> Index Scan using idx_users_email on users  (cost=0.42..8.44 rows=1 width=123)
   Index Cond: (email = 'user@example.com')
```
- Uses index, then fetches rows
- **Good:** Selective queries (< 10% of rows)
- **Bad:** Returning many rows (seq scan might be better)

**Bitmap Heap Scan:**
```
-> Bitmap Heap Scan on orders  (cost=123.45..678.90 rows=500)
   Recheck Cond: (status = ANY ('{{active,pending}}'))
   -> Bitmap Index Scan on idx_orders_status
```
- Uses index to build bitmap of matching rows
- **Good:** Multiple index conditions or moderate selectivity

**Nested Loop:**
```
-> Nested Loop  (cost=0.42..123.45 rows=10)
   -> Index Scan on users  (rows=1)
   -> Index Scan on orders  (rows=10)
```
- For each outer row, scans inner table
- **Good:** Small outer table with indexed inner table
- **Bad:** Large outer table (consider hash/merge join)

## Output Format Options

"""

        if format == "text":
            prompt_text += """
**Text Format** (default):
- Human-readable
- Shows tree structure
- Includes all timing details
"""
        elif format == "json":
            prompt_text += """
**JSON Format:**
- Machine-readable
- Programmatic analysis
- All data preserved

Use with `format: json` in explain_query tool
"""
        elif format == "yaml":
            prompt_text += """
**YAML Format:**
- Human and machine-readable
- Clear structure
- Easy to parse

Use with `format: yaml` in explain_query tool
"""

        prompt_text += """

## Advanced Analysis

**Misestimation Detection:**
```sql
-- Find queries with bad estimates
WITH explain_data AS (
    -- Your EXPLAIN ANALYZE output
)
SELECT
    node_type,
    estimated_rows,
    actual_rows,
    ABS(estimated_rows - actual_rows) as difference,
    ROUND(100.0 * ABS(estimated_rows - actual_rows) / NULLIF(actual_rows, 0), 2) as percent_off
FROM explain_data
WHERE ABS(estimated_rows - actual_rows) / NULLIF(actual_rows, 0) > 0.1  -- > 10% off
ORDER BY percent_off DESC;
```

**Buffer Analysis:**
```sql
-- Calculate cache hit ratio
SELECT
    100.0 * shared_hit / (shared_hit + shared_read) as cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();
```

## Ready to Analyze?

Run the explain_query tool with analyze=true, then share the output and I'll help you interpret it.

**Pro Tip:** PostgreSQL's EXPLAIN ANALYZE is the most detailed of any database - use it to understand exactly what's happening!
"""

        return types.GetPromptResult(
            description=f"EXPLAIN ANALYZE deep dive for query ({format} format)",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    @mcp.prompt()
    async def extension_setup(extension_name: str) -> types.GetPromptResult:  # pyright: ignore[reportUnusedFunction]
        """Guide for installing and configuring extensions."""

        extension_info = {
            "pgvector": {
                "purpose": "AI-native vector similarity search",
                "use_cases": ["Semantic search", "Recommendation systems", "Image similarity"],
                "dependencies": [],
            },
            "postgis": {
                "purpose": "Geospatial operations and GIS",
                "use_cases": ["Mapping", "Location-based services", "Spatial analysis"],
                "dependencies": [],
            },
            "hypopg": {
                "purpose": "Hypothetical index testing",
                "use_cases": ["Index optimization", "Zero-risk testing", "Performance tuning"],
                "dependencies": [],
            },
            "pg_stat_statements": {
                "purpose": "Query performance tracking",
                "use_cases": ["Performance monitoring", "Slow query detection", "Workload analysis"],
                "dependencies": [],
            },
            "pg_trgm": {
                "purpose": "Fuzzy text search with trigrams",
                "use_cases": ["Fuzzy matching", "Typo tolerance", "Text similarity"],
                "dependencies": [],
            },
            "fuzzystrmatch": {
                "purpose": "Phonetic matching and edit distance",
                "use_cases": ["Soundex matching", "Levenshtein distance", "Metaphone"],
                "dependencies": [],
            },
        }

        ext_data = extension_info.get(extension_name, {"purpose": "PostgreSQL extension", "use_cases": ["Database operations"], "dependencies": []})

        prompt_text = f"""# Extension Setup Guide - {extension_name}

**Purpose:** {ext_data["purpose"]}

## Use Cases
{chr(10).join([f"- {uc}" for uc in ext_data["use_cases"]])}

## Setup Steps

### 1. **Check Availability**

First, check if the extension is available:

```sql
-- Use execute_sql tool:
SELECT * FROM pg_available_extensions
WHERE name = '{extension_name}';
```

If not available, you may need to install it at the system level:
```bash
# On Ubuntu/Debian:
sudo apt-get install postgresql-{extension_name}

# On RHEL/CentOS:
sudo yum install postgresql-{extension_name}

# On macOS (Homebrew):
brew install {extension_name}
```

### 2. **Install Extension**

```sql
CREATE EXTENSION IF NOT EXISTS {extension_name};
```

Verify installation:
```sql
SELECT extname, extversion
FROM pg_extension
WHERE extname = '{extension_name}';
```

### 3. **Configuration**

"""

        if extension_name == "pg_stat_statements":
            prompt_text += """
**postgresql.conf Configuration:**
```conf
# Add to shared_preload_libraries
shared_preload_libraries = 'pg_stat_statements'

# Configure tracking
pg_stat_statements.track = all
pg_stat_statements.max = 10000
pg_stat_statements.track_utility = on
```

**After configuration:** Restart PostgreSQL!

**Verification:**
```sql
SELECT query, calls, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```
"""
        elif extension_name == "hypopg":
            prompt_text += """
**No configuration needed** - hypopg works out of the box!

**Test it:**
```sql
-- Create hypothetical index
SELECT * FROM hypopg_create_index(
    'CREATE INDEX ON users(email)'
);

-- Run EXPLAIN with hypothetical index
EXPLAIN SELECT * FROM users WHERE email = 'test@example.com';

-- Clean up
SELECT hypopg_reset();
```
"""
        elif extension_name == "pgvector":
            prompt_text += """
**Create vector column:**
```sql
ALTER TABLE documents
ADD COLUMN embedding vector(1536);
```

**Create HNSW index:**
```sql
CREATE INDEX ON documents
USING hnsw (embedding vector_cosine_ops);
```

**Test similarity search:**
```sql
SELECT id, content
FROM documents
ORDER BY embedding <=> '[...]'::vector
LIMIT 10;
```
"""
        elif extension_name == "postgis":
            prompt_text += """
**Check PostGIS version:**
```sql
SELECT PostGIS_Full_Version();
```

**Enable topology (optional):**
```sql
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

**Create spatial column:**
```sql
ALTER TABLE locations
ADD COLUMN geom GEOGRAPHY(POINT, 4326);
```

**Create spatial index:**
```sql
CREATE INDEX ON locations USING GIST (geom);
```
"""

        prompt_text += """

### 4. **Usage Examples**

"""

        if extension_name == "pgvector":
            prompt_text += """
**Vector Search:**
```
vector_search(
    table_name="documents",
    vector_column="embedding",
    query_vector=[...],  # 1536-dimensional vector
    distance_metric="cosine",
    limit=10
)
```

**Hybrid Search (vector + text):**
```
hybrid_search(
    table_name="documents",
    vector_column="embedding",
    text_columns=["title", "content"],
    query_vector=[...],
    query_text="search terms",
    vector_weight=0.7,
    text_weight=0.3
)
```
"""
        elif extension_name == "postgis":
            prompt_text += """
**Distance Queries:**
```
geo_distance(
    table_name="locations",
    geometry_column="geom",
    reference_point="POINT(-122.4194 37.7749)",
    distance_type="kilometers",
    max_distance=10.0
)
```

**Containment Queries:**
```
geo_within(
    table_name="locations",
    geometry_column="geom",
    boundary_geometry="POLYGON(...)",
    geometry_type="polygon"
)
```
"""
        elif extension_name == "hypopg":
            prompt_text += """
**Test Index Impact:**
```
explain_query(
    sql="SELECT * FROM users WHERE email = 'test@example.com'",
    analyze=false,
    hypothetical_indexes=[
        {"table": "users", "columns": ["email"], "using": "btree"}
    ]
)
```

**Index Recommendations:**
```
analyze_query_indexes(
    queries=["SELECT ..."],
    method="dta"
)
```
"""
        elif extension_name == "pg_stat_statements":
            prompt_text += """
**Top Slow Queries:**
```
get_top_queries(
    sort_by="mean_time",
    limit=20
)
```

**Workload Analysis:**
```
analyze_workload_indexes(
    method="dta",
    max_index_size_mb=10000
)
```
"""

        prompt_text += """

### 5. **Troubleshooting**

**Extension not found:**
- Verify system-level installation
- Check pg_config --sharedir
- Restart PostgreSQL if needed

**Permission denied:**
- Must be superuser to install extensions
- Or grant CREATE on database

**Version mismatch:**
- Ensure extension compatible with PostgreSQL version
- Check pg_available_extensions for version

### 6. **Best Practices**

"""

        if extension_name == "pgvector":
            prompt_text += """
1. Use HNSW indexes for production (better recall than IVFFlat)
2. Normalize embeddings if using inner product distance
3. Monitor index size and recall metrics
4. Use appropriate m and ef_construction values
"""
        elif extension_name == "postgis":
            prompt_text += """
1. Always create spatial indexes (GIST)
2. Use geography type for global coordinates
3. Validate geometries with ST_IsValid()
4. VACUUM ANALYZE after bulk inserts
"""
        elif extension_name == "hypopg":
            prompt_text += """
1. Always call hypopg_reset() after testing
2. Test multiple index combinations
3. Compare plans with/without indexes
4. Use before creating real indexes
"""
        elif extension_name == "pg_stat_statements":
            prompt_text += """
1. Monitor query counts and execution times
2. Reset statistics periodically for clean baselines
3. Use for both slow query detection and capacity planning
4. Track planning time vs execution time
"""

        prompt_text += """

## Ready to Install?

Let's start with Step 1 - check if {extension_name} is available in your PostgreSQL installation.

**Pro Tip:** PostgreSQL's extension ecosystem is one of its greatest strengths - {extension_name} adds powerful capabilities!
"""

        return types.GetPromptResult(
            description=f"Extension setup guide for {extension_name}",
            messages=[types.PromptMessage(role="user", content=types.TextContent(type="text", text=prompt_text.strip()))],
        )

    logger.info(
        "Registered 10 prompts: optimize_query, index_tuning, database_health_check, "
        "setup_pgvector, json_operations, performance_baseline, backup_strategy, "
        "setup_postgis, explain_analyze_workflow, extension_setup"
    )
