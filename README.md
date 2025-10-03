# PostgreSQL MCP Server

*Last Updated: October 3, 2025*

*Enterprise-grade PostgreSQL MCP server with enhanced security, comprehensive testing, AI-native database operations, and advanced analytics powered by pg_stat_statements and hypopg extensions*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp/security/code-scanning)

**54 specialized MCP tools** for PostgreSQL operations:
- **Core Database Tools (9)**: Schema/object management, SQL execution, health monitoring, query analysis, index optimization
- **JSON Tools (11)**: JSONB operations, validation, security scanning, index suggestions, diff/merge
- **Text Tools (5)**: Similarity search, full-text search, regex extraction, fuzzy matching, sentiment analysis
- **Statistical Analysis Tools (8)**: Descriptive statistics, percentiles, correlation, regression, time series, distribution analysis, hypothesis testing, sampling
- **Performance Intelligence Tools (6)**: Query plan comparison, performance baselines, slow query analysis, connection pool optimization, vacuum strategy, partitioning recommendations
- **Vector/Semantic Search Tools (8)**: Vector embeddings, similarity search, semantic search, clustering, index optimization, dimensionality reduction, hybrid search, performance analysis
- **Geospatial Tools (7)**: Distance calculation, spatial queries, buffer zones, intersection analysis, coordinate transformation, spatial clustering, index optimization

Enhanced with **pg_stat_statements**, **hypopg**, **pgvector**, and **PostGIS** extensions for real-time analytics, hypothetical index testing, vector search, and geospatial operations.

---

## 📋 **Prerequisites**

Before using the PostgreSQL MCP Server, ensure you have:

### **1. PostgreSQL Database** (version 13-17)
- Running and accessible PostgreSQL instance
- Valid connection credentials with appropriate permissions
- Network connectivity to the database

### **2. Required Extensions**:
Enable pg_stat_statements (add to postgresql.conf):
```
shared_preload_libraries = 'pg_stat_statements'
```

Restart PostgreSQL, then create extensions:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;  -- Query performance tracking
CREATE EXTENSION IF NOT EXISTS hypopg;              -- Hypothetical indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;             -- Trigram similarity search
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;       -- Fuzzy string matching
CREATE EXTENSION IF NOT EXISTS vector;              -- Vector similarity search (pgvector)
CREATE EXTENSION IF NOT EXISTS postgis;             -- Geospatial operations (PostGIS)
```

### **3. Environment Variables**:
```bash
export DATABASE_URI="postgresql://username:password@localhost:5432/dbname"
```

### **4. MCP Client**
- Claude Desktop, Cursor, or other MCP-compatible client
- Proper MCP server configuration (see Configuration section)

---

## 🚀 **Quick Start**

### **Option 1: Docker (Recommended)**
Pull and run instantly:

```bash
docker pull neverinfamous/postgres-mcp:latest
```

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://username:password@localhost:5432/dbname" \
  neverinfamous/postgres-mcp:latest \
  --access-mode=restricted
```

### **Option 2: Python Installation**
Install from PyPI:

```bash
pip install postgres-mcp
```

Run the server:

```bash
postgres-mcp --access-mode=restricted
```

### **Option 3: Test in 30 Seconds**
```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
```

```bash
cd postgres-mcp
```

```bash
uv sync
```

```bash
uv run pytest -v
```

### **Verify Installation**
Test basic connectivity and functionality:

Test basic connectivity (using MCP client):
```bash
mcp_postgres-mcp_list_schemas
```

Verify extensions are working:
```bash
mcp_postgres-mcp_get_top_queries --sort_by=total_time --limit=5
```

Check database health:
```bash
mcp_postgres-mcp_analyze_db_health --health_type=all
```

---

## 🛡️ **Security-First Design**

### **✅ Enhanced Security Features**

This PostgreSQL MCP server has been **comprehensively security-audited** and enhanced with enterprise-grade protections:

- **🔒 SQL Injection Prevention** - Parameter binding with automatic sanitization
- **🛡️ Comprehensive Security Testing** - 20+ test cases covering all attack vectors
- **⚙️ Dual Security Modes** - Restricted (production) and unrestricted (development)
- **🔍 Query Validation** - Advanced SQL parsing and validation in restricted mode
- **📊 Security Monitoring** - Built-in logging and audit capabilities
- **🚨 Zero Known Vulnerabilities** - All CodeQL security issues resolved

### **🔧 Security Fix Highlights**

**Critical SQL Injection Vulnerability Fixed** (September 2025):
- **Issue**: Direct SQL string execution without parameter binding
- **Impact**: Complete database compromise in unrestricted mode
- **Fix**: Added SQL injection detection and comprehensive parameter binding validation
- **Testing**: 20+ security test cases validate protection against all attack vectors
- **Validation**: 100% protection rate across all attack vectors
- **Status**: ✅ **RESOLVED** - Zero security vulnerabilities remaining

### **🎯 Security Modes**

**Restricted Mode (Recommended for Production):**
- ✅ Read-only operations only
- ✅ Advanced SQL parsing and validation
- ✅ Query timeout protection
- ✅ Resource usage limits
- ✅ Comprehensive audit logging

**Unrestricted Mode (Development Only):**
- ⚠️ Full read/write access
- ✅ Parameter binding protection
- ✅ Security monitoring
- ⚠️ Use only in trusted environments

---

## 🏢 **Enterprise Features**

### **🔍 Advanced Database Health Monitoring**
- **Index Health** - Detect unused, duplicate, and bloated indexes with detailed analysis
- **Connection Health** - Monitor connection utilization and limits in real-time
- **Vacuum Health** - Prevent transaction ID wraparound issues with proactive monitoring
- **Buffer Cache Analysis** - Analyze cache hit rates and performance metrics (99%+ accuracy)
- **Replication Health** - Monitor lag and replication status across clusters
- **Constraint Validation** - Detect invalid constraints and integrity issues
- **Query Performance Tracking** - Real-time monitoring via **pg_stat_statements** extension

### **⚡ Advanced Performance Optimization**
- **Intelligent Index Tuning** - AI-powered index recommendations using DTA algorithms
- **Hypothetical Index Analysis** - Test index performance without creation via **hypopg** extension
- **Query Plan Analysis** - EXPLAIN plans with cost analysis and optimization suggestions
- **Workload Analysis** - Identify resource-intensive queries with detailed execution statistics
- **Real-Time Performance Tracking** - Monitor query execution times, call counts, and resource usage
- **Cost-Benefit Analysis** - Optimize performance vs. storage trade-offs with precise metrics

### **🧠 AI-Native Operations**
- **Schema Intelligence** - Context-aware SQL generation with deep database understanding
- **Query Optimization** - Automated performance improvements using machine learning algorithms
- **Predictive Analysis** - Simulate performance improvements with hypothetical index testing
- **Natural Language Interface** - Human-friendly database interactions with intelligent query suggestions
- **Performance Forecasting** - Predict database performance under different workload scenarios

---

## 📊 **MCP Tools (54 Total)**

### **Core Database Tools (9)**
| Tool | Description |
|------|-------------|
| `list_schemas` | List all database schemas |
| `list_objects` | List tables, views, sequences, extensions |
| `get_object_details` | Detailed object information and schema |
| `execute_sql` | Secure SQL execution with parameter binding |
| `explain_query` | Query execution plans with hypothetical index support |
| `get_top_queries` | Real-time query performance analysis (pg_stat_statements) |
| `analyze_workload_indexes` | Workload-based index recommendations |
| `analyze_query_indexes` | Query-specific index optimization |
| `analyze_db_health` | Comprehensive database health checks |

### **JSON Tools (11)**
| Tool | Description |
|------|-------------|
| `json_insert` | Insert/update JSONB with validation |
| `json_update` | Update by path with optional creation |
| `json_select` | Extract with multiple output formats |
| `json_query` | Complex filtering and aggregation via JSONPath |
| `json_validate_path` | Path validation with security checks |
| `json_merge` | Merge objects with conflict resolution |
| `json_normalize` | Auto-fix Python-style JSON |
| `json_diff` | Compare JSON structures |
| `jsonb_index_suggest` | Index recommendations for JSON queries |
| `json_security_scan` | Detect SQL injection and XSS patterns |
| `jsonb_stats` | JSON structure analysis |

### **Text Processing Tools (5)**
| Tool | Description |
|------|-------------|
| `text_similarity` | Trigram similarity search (pg_trgm) |
| `text_search_advanced` | Full-text search with ranking |
| `regex_extract_all` | Pattern extraction with capture groups |
| `fuzzy_match` | Levenshtein distance matching |
| `text_sentiment` | Sentiment analysis |

### **Statistical Analysis Tools (8)** *(Phase 3 - NEW)*
| Tool | Description |
|------|-------------|
| `stats_descriptive` | Calculate mean, median, mode, std dev, variance, quartiles |
| `stats_percentiles` | Calculate percentiles and detect outliers using IQR method |
| `stats_correlation` | Pearson and Spearman correlation between columns |
| `stats_regression` | Linear regression with slope, intercept, R-squared |
| `stats_time_series` | Time series analysis with trend detection |
| `stats_distribution` | Distribution analysis with histogram and skewness/kurtosis |
| `stats_hypothesis` | One-sample and two-sample t-tests with interpretation |
| `stats_sampling` | Statistical sampling (random, systematic, stratified) |

### **Performance Intelligence Tools (6)** *(Phase 3)*
| Tool | Description |
|------|-------------|
| `query_plan_compare` | Compare execution plans of two queries with cost analysis |
| `performance_baseline` | Establish performance baselines for critical queries |
| `slow_query_analyzer` | Analyze slow queries with optimization suggestions |
| `connection_pool_optimize` | Connection pool analysis and recommendations |
| `vacuum_strategy_recommend` | Vacuum strategy recommendations for tables |
| `partition_strategy_suggest` | Partitioning strategy recommendations for large tables |

### **Vector/Semantic Search Tools (8)** *(Phase 4 - NEW)*
| Tool | Description |
|------|-------------|
| `vector_embed` | Generate embeddings for text data (requires API integration) |
| `vector_similarity` | Find similar vectors using cosine, L2, or inner product distance |
| `vector_search` | Semantic search with ranking and distance threshold |
| `vector_cluster` | K-means clustering for vector data |
| `vector_index_optimize` | Optimize vector indexes (HNSW/IVFFlat) for performance |
| `vector_dimension_reduce` | Dimensionality reduction (PCA, random projection) |
| `hybrid_search` | Hybrid search combining full-text and vector similarity |
| `vector_performance` | Vector query optimization and performance benchmarking |

### **Geospatial Tools (7)** *(Phase 4 - NEW)*
| Tool | Description |
|------|-------------|
| `geo_distance` | Calculate distance between geometries in multiple units |
| `geo_within` | Point-in-polygon and geometric containment queries |
| `geo_buffer` | Create buffer zones around geometries |
| `geo_intersection` | Find geometric intersections with optional geometry return |
| `geo_index_optimize` | Optimize spatial indexes (GIST/BRIN/SP-GIST) |
| `geo_transform` | Transform geometries between coordinate systems |
| `geo_cluster` | Spatial clustering using distance-based grouping (DBSCAN) |

---

## 🔧 **PostgreSQL Extensions & Dependencies**

### **Required Extensions for Enhanced Features**

This MCP server leverages powerful PostgreSQL extensions for advanced analytics:

#### **pg_stat_statements** (Built-in)
- **Purpose**: Real-time query performance tracking and analysis
- **Features**: Execution time tracking, call counts, resource usage statistics
- **Installation**: `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`
- **Configuration**: Add to `shared_preload_libraries` in postgresql.conf

#### **hypopg** (Optional but Recommended)
- **Purpose**: Hypothetical index analysis without actual index creation
- **Features**: Test index performance impact, cost-benefit analysis
- **Installation**: Available via package managers (postgresql-XX-hypopg)
- **Usage**: Simulate index creation for optimization planning

#### **pgvector** (Required for Vector/Semantic Search)
- **Purpose**: Vector similarity search and embeddings storage
- **Features**: Cosine/L2/inner product distance, HNSW/IVFFlat indexes
- **Installation**: Available via package managers (postgresql-XX-pgvector)
- **Usage**: Store and query high-dimensional vectors for semantic search

#### **PostGIS** (Required for Geospatial Operations)
- **Purpose**: Geospatial data types and operations
- **Features**: Geometry/geography types, spatial indexes, coordinate transformations
- **Installation**: Available via package managers (postgresql-XX-postgis-3)
- **Usage**: Store and query geographic data with spatial operations

#### **Installing Extensions**

**For Ubuntu/Debian**:
```bash
# Install all required extensions
sudo apt-get update
sudo apt-get install -y \
  postgresql-17-hypopg \
  postgresql-17-pgvector \
  postgresql-17-postgis-3
```

Enable in PostgreSQL:
```bash
sudo -u postgres psql -d your_database <<EOF
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS hypopg;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS postgis;
EOF
```

**For Docker PostgreSQL**:
Add to your Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y \
  postgresql-17-hypopg \
  postgresql-17-pgvector \
  postgresql-17-postgis-3 \
  && rm -rf /var/lib/apt/lists/*
```

**Verify Installation**:
```sql
SELECT extname, extversion FROM pg_extension 
WHERE extname IN ('pg_stat_statements', 'hypopg', 'vector', 'postgis');
```

### **Recent Updates**

#### **Phase 4 Release - October 3, 2025** ✅ **COMPLETE**
- ✅ **Vector/Semantic Search Suite**: 8 tools implemented and tested
  - `vector_embed`, `vector_similarity`, `vector_search`, `vector_cluster`
  - `vector_index_optimize`, `vector_dimension_reduce`, `hybrid_search`, `vector_performance`
- ✅ **Geospatial Operations**: 7 tools implemented and tested
  - `geo_distance`, `geo_within`, `geo_buffer`, `geo_intersection`
  - `geo_index_optimize`, `geo_transform`, `geo_cluster`
- ✅ **All 54 Tools Validated**: MCP direct testing confirmed 100% operational
- ✅ **Extension Support**: pgvector (v0.8.0) and PostGIS (v3.5.0) integration
- ✅ **Type Safety**: Pyright strict mode compliance with proper parameter binding
- ✅ **Code Quality**: Ruff formatting and linting passing
- ✅ **Graceful Degradation**: Tools detect missing extensions and return informative errors

#### **Phase 3 Release - October 3, 2025** ✅ **COMPLETE**
- ✅ **Statistical Analysis Suite**: 8 tools implemented and tested
- ✅ **Performance Intelligence**: 6 tools implemented and tested
- ✅ **Type Safety**: Pyright strict mode compliance with LiteralString casts
- ✅ **Code Quality**: Ruff formatting and linting passing

#### **September 2025 Updates**
- ✅ **Dependency Updates via Dependabot**: All dependencies updated to latest secure versions
- ✅ **Performance Improvements**: Updated to latest psycopg3 and asyncpg versions
- ✅ **Compatibility**: Enhanced PostgreSQL 17 support with latest drivers
- ✅ **CI/CD**: Updated GitHub Actions and testing frameworks
- ✅ **Real-Time Monitoring**: pg_stat_statements integration for live query tracking
- ✅ **Hypothetical Indexes**: hypopg integration for performance simulation
- ✅ **Advanced Health Checks**: Enhanced buffer cache analysis and performance metrics
- ✅ **Improved DTA Algorithm**: Better index recommendation accuracy and performance

---

## 🎨 **Usage Examples**


### **Secure Database Operations**
```python
# ✅ SECURE: Parameter binding prevents injection
execute_sql(
    sql="SELECT * FROM users WHERE id = %s AND active = %s",
    params=[user_id, True]
)

# ✅ SECURE: Multiple parameters safely handled
execute_sql(
    sql="INSERT INTO products (name, price, category) VALUES (%s, %s, %s)",
    params=["Widget", 29.99, "electronics"]
)
```

### **Health Monitoring**
```bash
# Comprehensive database health check
analyze_db_health()

# Specific health areas
analyze_db_health(health_type="index")     # Index health only
analyze_db_health(health_type="buffer")    # Buffer cache analysis
analyze_db_health(health_type="vacuum")    # Vacuum health check
```

### **Advanced Performance Optimization**
```bash
# Real-time query performance analysis (requires pg_stat_statements)
get_top_queries(sort_by="total_time", limit=10)
get_top_queries(sort_by="mean_time", limit=5)

# Workload-based index recommendations using DTA algorithm
analyze_workload_indexes(method="dta", max_index_size_mb=1000)

# Query-specific optimization with hypothetical index testing
analyze_query_indexes(
    queries=["SELECT * FROM orders WHERE customer_id = %s AND status = %s"],
    method="dta"
)

# Test hypothetical indexes without creating them (requires hypopg)
explain_query(
    sql="SELECT * FROM users WHERE email = %s",
    hypothetical_indexes=[{"table": "users", "columns": ["email"], "using": "btree"}]
)
```

### **Database Health & Monitoring**
```bash
# Comprehensive health analysis
analyze_db_health(health_type="all")

# Specific health checks
analyze_db_health(health_type="index")     # Index bloat and usage analysis
analyze_db_health(health_type="buffer")    # Buffer cache hit rate analysis
analyze_db_health(health_type="vacuum")    # Transaction ID wraparound monitoring
analyze_db_health(health_type="connection") # Connection pool analysis
```

### **Statistical Analysis** *(Phase 3 - NEW)*
```bash
# Descriptive statistics
stats_descriptive(
    table_name="sales",
    column_name="amount"
)
# Returns: mean, median, mode, std dev, variance, quartiles, IQR

# Correlation analysis
stats_correlation(
    table_name="sales",
    column1="advertising_spend",
    column2="revenue",
    method="pearson"
)
# Returns: correlation coefficient, R-squared, covariance

# Linear regression
stats_regression(
    table_name="sales",
    x_column="advertising_spend",
    y_column="revenue"
)
# Returns: slope, intercept, R-squared, equation

# Time series analysis
stats_time_series(
    table_name="orders",
    time_column="created_at",
    value_column="amount",
    interval="1 day",
    aggregation="sum"
)
# Returns: trends, total change, percent change

# Outlier detection
stats_percentiles(
    table_name="transactions",
    column_name="amount",
    detect_outliers=True
)
# Returns: percentiles + outlier bounds and count
```

### **Performance Intelligence** *(Phase 3)*
```bash
# Compare query performance
query_plan_compare(
    query1="SELECT * FROM users WHERE email = %s",
    query2="SELECT * FROM users WHERE LOWER(email) = LOWER(%s)"
)

# Analyze slow queries
slow_query_analyzer(min_duration_ms=1000, limit=20)

# Connection pool optimization
connection_pool_optimize()

# Vacuum strategy
vacuum_strategy_recommend(table_name="large_table")
```

### **Vector/Semantic Search** *(Phase 4 - NEW)*
```bash
# Find similar vectors
vector_similarity(
    table_name="documents",
    vector_column="embedding",
    query_vector=[0.1, 0.2, ...],
    distance_metric="cosine",
    limit=10
)

# Semantic search with ranking
vector_search(
    table_name="documents",
    vector_column="embedding",
    query_vector=[0.1, 0.2, ...],
    threshold=0.5,
    return_columns=["id", "title"]
)

# Hybrid search (text + vector)
hybrid_search(
    table_name="articles",
    vector_column="embedding",
    text_columns=["title", "content"],
    query_vector=[0.1, 0.2, ...],
    query_text="machine learning",
    vector_weight=0.7,
    text_weight=0.3
)

# Optimize vector indexes
vector_index_optimize(
    table_name="embeddings",
    vector_column="vec",
    index_type="hnsw"
)
```

### **Geospatial Operations** *(Phase 4 - NEW)*
```bash
# Calculate distances
geo_distance(
    table_name="locations",
    geometry_column="geom",
    reference_point="POINT(-122.4194 37.7749)",
    distance_type="kilometers",
    max_distance=100
)

# Find points within polygon
geo_within(
    table_name="stores",
    geometry_column="location",
    boundary_geometry="POLYGON((-125 30, -115 30, -115 40, -125 40, -125 30))"
)

# Create buffer zones
geo_buffer(
    table_name="facilities",
    geometry_column="geom",
    buffer_distance=1000,
    distance_unit="meters"
)

# Spatial clustering
geo_cluster(
    table_name="events",
    geometry_column="location",
    cluster_distance=500,
    distance_unit="meters"
)
```

---

## 📚 **Configuration**

### **Claude Desktop**
```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "DATABASE_URI",
        "neverinfamous/postgres-mcp:latest",
        "--access-mode=restricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://username:password@localhost:5432/dbname"
      }
    }
  }
}
```

### **Cursor MCP**
```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "postgres-mcp",
      "args": ["--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://username:password@localhost:5432/dbname"
      }
    }
  }
}
```

### **Testing MCP Connection**
To verify the MCP server is working, you can test the connection:

Start the server locally for testing:
```bash
python start_local_server.py
```

Or using Docker:
```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://username:password@localhost:5432/dbname" \
  neverinfamous/postgres-mcp:latest \
  --access-mode=restricted
```

**Note**: Ensure your PostgreSQL database is running and accessible before starting the MCP server.

---

## 🔧 **Troubleshooting**

### **Common Issues**

**MCP Server Not Found**:
- Ensure the server is properly configured in your MCP client
- Verify the DATABASE_URI environment variable is set correctly
- Check that PostgreSQL is running and accessible
- Validate MCP client configuration syntax

**Extension Not Found Errors**:
Install required extensions:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
CREATE EXTENSION IF NOT EXISTS hypopg;
```

**Connection Refused**:
- Verify PostgreSQL is running:
```bash
pg_isready -h localhost -p 5432
```
- Check firewall settings and network connectivity
- Validate connection string format and credentials
- Ensure database exists and user has proper permissions

**No Query Data in pg_stat_statements**:
- Ensure `shared_preload_libraries = 'pg_stat_statements'` in postgresql.conf
- Restart PostgreSQL after configuration changes
- Run some queries to populate statistics
- Check if extension is properly installed:
```sql
\dx pg_stat_statements
```

**Permission Denied Errors**:
- Verify database user has necessary permissions
- Check if restricted mode is appropriate for your use case
- Ensure user can access required system tables and views

**Performance Issues**:
- Monitor database resource usage during operations
- Check if pg_stat_statements is causing overhead
- Verify network latency between MCP server and database
- Consider adjusting query timeouts and connection limits

---

## 🧪 **Comprehensive Testing**

### **Security Testing**
Run comprehensive security test suite:
```bash
python run_security_test.py
```

Run quick security validation:
```bash
python run_security_test.py --quick
```

Test MCP server security fix directly:
```bash
python test_mcp_security_fix.py
```

### **Functional Testing**
Run all tests:
```bash
uv run pytest -v
```

Run with coverage:
```bash
uv run pytest --cov=src tests/
```

Integration tests:
```bash
uv run pytest tests/integration/ -v
```

### **Security Test Suite**
The security tests are located in the `security/` directory:

- **`run_security_test.py`** - Main security test runner with comprehensive coverage
- **`test_sql_injection_security.py`** - 20 attack vector test suite
- **`test_mcp_security_fix.py`** - Direct MCP server security validation
- **`SECURITY_REPORT.md`** - Detailed security analysis and findings

**Test Results:**
- ✅ **Security Tests**: 20/20 passed (100% protection rate)
- ✅ **SQL Injection Protection**: All attack vectors blocked
- ✅ **Integration Tests**: All database operations validated
- ✅ **Performance Tests**: Index tuning algorithms verified
- ✅ **Compatibility Tests**: PostgreSQL 13-17 supported


---

## 🏆 **Why Choose This PostgreSQL MCP Server?**

### **Security Excellence**
- ✅ **Zero Known Vulnerabilities** - Comprehensive security audit completed
- ✅ **Enterprise-Grade Protection** - Parameter binding, query validation, audit logging
- ✅ **Production Ready** - Restricted mode safe for production databases
- ✅ **Continuous Security** - Automated dependency updates and security monitoring

### **Performance & Reliability**
- ✅ **Industrial-Strength Algorithms** - Microsoft SQL Server DTA-inspired index tuning with enhanced accuracy
- ✅ **Real-Time Analytics** - pg_stat_statements integration for live query performance monitoring
- ✅ **Hypothetical Index Testing** - HypoPG integration for zero-risk performance simulation
- ✅ **Proven Architecture** - Built on latest psycopg3 and libpq with PostgreSQL 17 support
- ✅ **Comprehensive Health Checks** - Enhanced buffer cache analysis and performance metrics
- ✅ **Automated Dependency Management** - Dependabot integration for security and performance updates

### **Professional Development**
- ✅ **Active Maintenance** - Regular updates and security patches
- ✅ **Comprehensive Documentation** - Security policies, contributing guidelines, code of conduct
- ✅ **Community Focused** - Open source with professional support
- ✅ **Enterprise Support** - Professional consulting available

---

## 🔗 **Resources**

- **[Security Policy](SECURITY.md)** - Vulnerability reporting and security guidelines
- **[Contributing Guide](CONTRIBUTING.md)** - Development and contribution guidelines
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community standards and guidelines
- **[Security Report](SECURITY_REPORT.md)** - Detailed security analysis and fixes
- **[GitHub Repository](https://github.com/neverinfamous/postgres-mcp)** - Source code and issues
- **[Docker Hub](https://hub.docker.com/r/neverinfamous/postgres-mcp)** - Container images

---

## 🚀 **Quick Links**

| Action | Command |
|--------|---------|
| **Test Security** | `cd security && python run_security_test.py` |
| **Docker Quick Start** | `docker run -i --rm -e DATABASE_URI neverinfamous/postgres-mcp:latest` |
| **Install from PyPI** | `pip install postgres-mcp` |
| **Run Tests** | `uv run pytest -v` |
| **Report Security Issues** | [Security Policy](SECURITY.md) |

---

## 📈 **Project Stats**

- **54 MCP Tools** (9 core + 11 JSON + 5 text + 8 statistics + 6 performance + 8 vector + 7 geo)
- **Phase 4 Complete** ✅ (October 3, 2025)
- **100% Operational** - All 54 tools validated via MCP direct testing
- **Type Safe** - Pyright strict mode, LiteralString enforcement
- **Zero Known Vulnerabilities** - Security audit passed
- **PostgreSQL Extensions**: pg_stat_statements + hypopg + pgvector + PostGIS + pg_trgm + fuzzystrmatch
- **Multi-platform**: Windows, Linux, macOS (amd64, arm64)
- **CI/CD**: Ruff format/lint + Pyright + security tests passing
- **PostgreSQL 13-17** with psycopg3/asyncpg latest

### **Development Milestones**
- **Phase 1** (Aug 2025): Core database tools + security hardening
- **Phase 2** (Sep 2025): JSON (11) + text (5) processing tools
- **Phase 3** (Oct 2025): Statistics (8) + performance (6) intelligence ✅
- **Phase 4** (Oct 2025): Vector/semantic (8) + geospatial (7) operations ✅
- **Total Implementation**: 4,918 lines, 10 modules, 54 tools

---

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on:

- Setting up the development environment
- Running tests and security checks
- Submitting pull requests
- Security considerations
- Code style and standards

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🛡️ **Security**

Security is our top priority. If you discover a security vulnerability, please follow our [Security Policy](SECURITY.md) for responsible disclosure.

**Security Contact**: admin@adamic.tech

---

## 🔄 **Compatibility & Versions**

### **PostgreSQL Compatibility**
- **Supported Versions**: PostgreSQL 13, 14, 15, 16, 17
- **Recommended**: PostgreSQL 15+ for optimal performance
- **Extensions**: pg_stat_statements (built-in), hypopg (optional)

### **Python Compatibility**
- **Supported Versions**: Python 3.8, 3.9, 3.10, 3.11, 3.12
- **Recommended**: Python 3.11+ for best performance
- **Dependencies**: Latest psycopg3, asyncpg (auto-updated via Dependabot)

### **Platform Support**
- **Operating Systems**: Windows, Linux, macOS
- **Architectures**: amd64, arm64
- **Deployment**: Docker, pip, uv, source installation

---

*This PostgreSQL MCP Server represents a commitment to secure, reliable, and high-performance database operations in AI-driven environments. Enhanced with real-time analytics, hypothetical index testing, and automated dependency management for enterprise-grade PostgreSQL operations.*
