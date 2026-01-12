# PostgreSQL MCP Server - Enhanced

Last Updated January 12, 2026 - Production/Stable v1.2.0

<!-- mcp-name: io.github.neverinfamous/postgres-mcp-server -->

Enterprise-grade PostgreSQL MCP server with enhanced security, comprehensive testing, AI-native database operations, intelligent meta-awareness, and guided workflows.

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgres-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp-enhanced)](https://hub.docker.com/r/writenotenow/postgres-mcp-enhanced)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.2.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-Published-green)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp-server)
[![PyPI](https://img.shields.io/pypi/v/postgres-mcp-enhanced)](https://pypi.org/project/postgres-mcp-enhanced/)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp/security/code-scanning)
[![Type Safety](https://img.shields.io/badge/Pyright-Strict-blue.svg)](https://github.com/neverinfamous/postgres-mcp)

**[Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** • **[Changelog](https://github.com/neverinfamous/postgres-mcp/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/postgres-mcp-server)**

---

### **Version 1.2.0 Tool Filtering** 🎛️ (December 2025)
- **🎛️ NEW: Tool Filtering** - Control which tools are exposed via `POSTGRES_MCP_TOOL_FILTER` environment variable
- **🎯 Client Compatibility** - Stay under tool limits (Windsurf: 100, Cursor: ~80 warning threshold)
- **💰 Token Savings** - Reduce tool schema overhead by 24-86% based on configuration
- **🔧 9 Tool Groups** - Filter by category: `core`, `json`, `text`, `stats`, `performance`, `vector`, `geo`, `backup`, `monitoring`
- **⚡ Flexible Syntax** - `-group` disables group, `-tool` disables specific tool, `+tool` re-enables
- **✅ Zero Breaking Changes** - All 63 tools enabled by default, backward compatible

**Common filters:**
- `POSTGRES_MCP_TOOL_FILTER="-vector,-geo,-stats,-text"` → 35 tools (44% savings)
- `POSTGRES_MCP_TOOL_FILTER="-vector,-geo"` → 48 tools (24% savings)
- `POSTGRES_MCP_TOOL_FILTER="-json,-text,-stats,-performance,-vector,-geo,-backup,-monitoring"` → 9 tools (86% savings)

**📖 [Tool Filtering Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Filtering)**
## 🔍 **[AI-Powered Documentation Search →](https://search.adamic.tech)**

Can't find what you're looking for? Use our **AI-powered search interface** to search both PostgreSQL and SQLite MCP Server documentation:

- 🤖 **Natural Language Queries** - Ask questions in plain English
- ⚡ **Instant Results** - AI-enhanced answers with source attribution
- 📚 **Comprehensive Coverage** - Searches all 63 PostgreSQL tools + 73 SQLite tools
- 🎯 **Smart Context** - Understands technical questions and provides relevant examples

**[→ Try AI Search Now](https://search.adamic.tech)**

Example queries: "How do I optimize PostgreSQL query performance?", "What PostGIS features are available?", "How do I use pgvector for semantic search?"

---

## 📚 **[Complete Documentation - Visit the Wiki →](https://github.com/neverinfamous/postgres-mcp/wiki)**

For detailed documentation, examples, and guides, visit our comprehensive wiki:
- **[Quick Start Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Quick-Start)** - Get running in 30 seconds
- **[Installation & Configuration](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration)** - Detailed setup
- **[All Tool Categories](https://github.com/neverinfamous/postgres-mcp/wiki/Home)** - 63 specialized tools
- **[Security Best Practices](https://github.com/neverinfamous/postgres-mcp/wiki/Security-and-Best-practices)** - Production security
- **[Troubleshooting](https://github.com/neverinfamous/postgres-mcp/wiki/Troubleshooting)** - Common issues

**📰 [Read the v1.1.1 Release Article](https://adamic.tech/articles/2025-10-04-postgres-mcp-server-v1-0-5)** - Learn about enterprise features, AI-native operations, and intelligent meta-awareness

---

## 🚀 **Quick Overview**

**63 specialized MCP tools** + **10 intelligent resources** + **10 guided prompts** for PostgreSQL operations:

### MCP Tools (63)
- **Core Database (9)**: Schema management, SQL execution, health monitoring
- **JSON Operations (11)**: JSONB operations, validation, security scanning
- **Text Processing (5)**: Similarity search, full-text search, fuzzy matching
- **Statistical Analysis (8)**: Descriptive stats, correlation, regression, time series
- **Performance Intelligence (6)**: Query optimization, index tuning, workload analysis
- **Vector/Semantic Search (8)**: Embeddings, similarity search, clustering
- **Geospatial (7)**: Distance calculation, spatial queries, GIS operations
- **Backup & Recovery (4)**: Backup planning, restore validation, scheduling
- **Monitoring & Alerting (5)**: Real-time monitoring, capacity planning, alerting

### MCP Resources (10) - Database Meta-Awareness
- **database://schema**: Complete schema with tables, columns, indexes
- **database://capabilities**: Server capabilities and installed extensions
- **database://performance**: Query performance metrics from pg_stat_statements
- **database://health**: Comprehensive health status
- **database://extensions**: Installed extensions with versions
- **database://indexes**: Index usage statistics and recommendations
- **database://connections**: Active connections and pool status
- **database://replication**: Replication status and lag
- **database://vacuum**: Vacuum status and transaction ID wraparound
- **database://locks**: Current lock information
- **database://statistics**: Table statistics quality

### MCP Prompts (10) - Guided Workflows
- **optimize_query**: Step-by-step query optimization
- **index_tuning**: Comprehensive index analysis
- **database_health_check**: Full health assessment
- **setup_pgvector**: Complete pgvector setup guide
- **json_operations**: JSONB best practices
- **performance_baseline**: Establish performance baselines
- **backup_strategy**: Design backup strategy
- **setup_postgis**: PostGIS setup and usage
- **explain_analyze_workflow**: Deep dive into EXPLAIN plans
- **extension_setup**: Extension installation guide

Enhanced with **pg_stat_statements**, **hypopg**, **pgvector**, and **PostGIS** extensions.

---

## 📋 **Prerequisites**

1. **PostgreSQL Database** (version 13-18)
2. **Python** (version 3.12, 3.13, or 3.14)
3. **Environment Variable**: `DATABASE_URI="postgresql://user:pass@host:5432/db"`
4. **MCP Client**: Claude Desktop, Cursor, or compatible client

**See [Installation Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration) for detailed setup instructions.**

---

## 🚀 **Quick Start**

### **Docker (Recommended)**

**Step 1: Pull the image**

```bash
docker pull writenotenow/postgres-mcp-enhanced:latest
```

**Step 2: Run with your database connection**

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://user:pass@localhost:5432/db" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=restricted
```

### **Python Installation**

**Step 1: Install the package**

```bash
pip install postgres-mcp-enhanced
```

**Step 2: Run the server**

```bash
postgres-mcp --access-mode=restricted
```

### **From Source**

**Step 1: Clone the repository**

```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
```

**Step 2: Install dependencies and run tests**

```bash
uv sync
uv run pytest -v
```

**📖 [See Full Installation Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration)**

---

## ⚡ **Install to Cursor IDE**

### **One-Click Installation**

Click the button below to install directly into Cursor:

[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-Click%20Here-blue?style=for-the-badge)](cursor://anysphere.cursor-deeplink/mcp/install?name=PostgreSQL%20Enterprise%20MCP%20Server&config=eyJkb2NrZXIuaW8vd3JpdGVub3Rlbm93L3Bvc3RncmVzLW1jcC1lbmhhbmNlZDp2MS4xLjEiOnsidHJhbnNwb3J0Ijp7InR5cGUiOiJzdGRpbyJ9fX0=)

Or copy this deep link:
```
cursor://anysphere.cursor-deeplink/mcp/install?name=PostgreSQL%20Enterprise%20MCP%20Server&config=eyJkb2NrZXIuaW8vd3JpdGVub3Rlbm93L3Bvc3RncmVzLW1jcC1lbmhhbmNlZDp2MS4xLjEiOnsidHJhbnNwb3J0Ijp7InR5cGUiOiJzdGRpbyJ9fX0=
```

### **Prerequisites**
- ✅ Docker installed and running
- ✅ PostgreSQL database (version 13-18)
- ✅ `DATABASE_URI` environment variable configured

### **Configuration**

After installation, Cursor will use this Docker-based configuration. If you prefer manual setup, add this to your MCP client configuration:

```json
{
  "docker.io/writenotenow/postgres-mcp-enhanced:v1.1.1": {
    "transport": {
      "type": "stdio"
    }
  }
}
```

**📖 [See Full Installation Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration)**

---

## 🛡️ **Security-First Design**

**Zero known vulnerabilities** - Comprehensive security audit passed:
- ✅ SQL injection prevention with parameter binding
- ✅ 20+ security test cases covering all attack vectors
- ✅ Dual security modes (restricted/unrestricted)
- ✅ Advanced query validation
- ✅ CodeQL security scanning passing
- ✅ **Pyright strict mode** - 2,000+ type issues resolved, 100% type-safe codebase

**Security Modes:**
- **Restricted (Production)**: Read-only, query validation, resource limits
- **Unrestricted (Development)**: Full access with parameter binding protection

**📖 [Security Best Practices →](https://github.com/neverinfamous/postgres-mcp/wiki/Security-and-Best-Practices)**

---

## 🏢 **Enterprise Features**

### **🔍 Real-Time Monitoring**
- Database health monitoring (indexes, connections, vacuum, buffer cache)
- Query performance tracking via **pg_stat_statements**
- Capacity planning and growth forecasting
- Replication lag monitoring

### **⚡ Performance Optimization**
- AI-powered index tuning with DTA algorithms
- Hypothetical index testing via **hypopg** (zero-risk)
- Query plan analysis and optimization
- Workload analysis and slow query detection

### **🧠 AI-Native Operations**
- Vector similarity search via **pgvector**
- Geospatial operations via **PostGIS**
- Semantic search and clustering
- Natural language database interactions

**📖 [Explore All Features →](https://github.com/neverinfamous/postgres-mcp/wiki/Home)**

---

## 📊 **Features Overview**

### MCP Tools (63)

Explore comprehensive documentation for each category:

| Category | Tools | Documentation |
|----------|-------|---------------|
| **Core Database** | 9 | [Core Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Core-Database-Tools) |
| **JSON Operations** | 11 | [JSON Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/JSON-Operations) |
| **Text Processing** | 5 | [Text Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Text-Processing) |
| **Statistical Analysis** | 8 | [Stats Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Statistical-Analysis) |
| **Performance Intelligence** | 6 | [Performance →](https://github.com/neverinfamous/postgres-mcp/wiki/Performance-Intelligence) |
| **Vector/Semantic Search** | 8 | [Vector Search →](https://github.com/neverinfamous/postgres-mcp/wiki/Vector-Semantic-Search) |
| **Geospatial** | 7 | [GIS Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Geospatial-Operations) |
| **Backup & Recovery** | 4 | [Backup Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Backup-Recovery) |
| **Monitoring & Alerting** | 5 | [Monitoring →](https://github.com/neverinfamous/postgres-mcp/wiki/Monitoring-Alerting) |

### MCP Resources (10) - NEW in v1.1.0! 🎉

Resources provide real-time database meta-awareness - AI can access these automatically without explicit tool calls:

| Resource | Purpose | When to Use |
|----------|---------|-------------|
| **database://schema** | Complete database structure | Understanding database layout before queries |
| **database://capabilities** | Server features and extensions | Checking what operations are available |
| **database://performance** | Query performance metrics | Identifying slow queries proactively |
| **database://health** | Database health status | Proactive monitoring and issue detection |
| **database://extensions** | Extension inventory | Verifying required features are installed |
| **database://indexes** | Index usage statistics | Finding unused or missing indexes |
| **database://connections** | Connection pool status | Monitoring connection utilization |
| **database://replication** | Replication lag and status | Ensuring replica consistency |
| **database://vacuum** | Vacuum and wraparound status | Preventing transaction ID exhaustion |
| **database://locks** | Lock contention information | Diagnosing deadlocks and blocking |
| **database://statistics** | Statistics quality | Ensuring accurate query planning |

**💡 Key Benefit:** Resources reduce token usage by providing cached context vs. repeated queries!

### MCP Prompts (10) - NEW in v1.1.0! 🎉

Prompts provide guided workflows for complex operations - step-by-step instructions with examples:

| Prompt | Purpose | Use Case |
|--------|---------|----------|
| **optimize_query** | Query optimization workflow | Analyzing and improving slow queries |
| **index_tuning** | Index analysis and recommendations | Finding unused/missing/duplicate indexes |
| **database_health_check** | Comprehensive health assessment | Regular maintenance and monitoring |
| **setup_pgvector** | pgvector installation and setup | Implementing semantic search |
| **json_operations** | JSONB best practices | Optimizing JSON queries and indexes |
| **performance_baseline** | Baseline establishment | Setting up performance monitoring |
| **backup_strategy** | Backup planning and design | Designing enterprise backup strategy |
| **setup_postgis** | PostGIS installation and usage | Implementing geospatial features |
| **explain_analyze_workflow** | Deep plan analysis | Understanding query execution |
| **extension_setup** | Extension installation guide | Installing and configuring extensions |

**💡 Key Benefit:** Prompts guide users through complex multi-step operations with PostgreSQL best practices!

**📖 [View Complete Documentation →](https://github.com/neverinfamous/postgres-mcp/wiki/Home)**

---

## 🔧 **PostgreSQL Extensions**

Required extensions for full functionality:
- **pg_stat_statements** (built-in) - Query performance tracking
- **pg_trgm** & **fuzzystrmatch** (built-in) - Text similarity
- **hypopg** (optional) - Hypothetical index testing
- **pgvector** (optional) - Vector similarity search
- **PostGIS** (optional) - Geospatial operations

**Quick Setup:**

Run these commands in your PostgreSQL database:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
```

**📖 [Extension Setup Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Extension-Setup)**

---

## 🎛️ **Tool Filtering** - NEW in v1.2.0!

**Optimize tool count and token usage** for your MCP client with intelligent filtering.

### Why Tool Filtering?

- ✅ **Stay under client limits** - Windsurf (100 tools), Cursor (~80 warning threshold)
- ✅ **Reduce token consumption** - 24-86% reduction in tool schema overhead
- ✅ **Remove unused tools** - Disable tools requiring missing PostgreSQL extensions
- ✅ **Faster AI discovery** - Smaller tool sets mean faster tool selection
- ✅ **Zero breaking changes** - All 63 tools enabled by default

### Quick Start

Set the `POSTGRES_MCP_TOOL_FILTER` environment variable:

```bash
# Windsurf (100-tool limit) - reduces to ~35 tools, saves ~5,600 tokens (44% reduction)
POSTGRES_MCP_TOOL_FILTER="-vector,-geo,-stats,-text"

# No pgvector/PostGIS installed - reduces to 48 tools, saves ~3,000 tokens (24% reduction)
POSTGRES_MCP_TOOL_FILTER="-vector,-geo"

# Core database only - reduces to 9 tools, saves ~10,800 tokens (86% reduction)
POSTGRES_MCP_TOOL_FILTER="-json,-text,-stats,-performance,-vector,-geo,-backup,-monitoring"
```

### Filter Syntax

| Syntax | Description | Example |
|--------|-------------|---------|
| `-group` | Disable all tools in a group | `-vector` disables 8 vector tools |
| `-tool` | Disable a specific tool | `-execute_sql` disables only execute_sql |
| `+tool` | Re-enable a tool after group disable | `+list_schemas` re-enables list_schemas |

**Rules process left-to-right** - order matters!

### Available Tool Groups

| Group | Tool Count | Description |
|-------|------------|-------------|
| `core` | 9 | Schema management, SQL execution, health monitoring |
| `json` | 11 | JSONB operations, validation, security scanning |
| `text` | 5 | Similarity search, full-text search, fuzzy matching |
| `stats` | 8 | Descriptive stats, correlation, regression, time series |
| `performance` | 6 | Query optimization, index tuning, workload analysis |
| `vector` | 8 | Embeddings, similarity search, clustering (requires pgvector) |
| `geo` | 7 | Distance calculation, spatial queries (requires PostGIS) |
| `backup` | 4 | Backup planning, restore validation, scheduling |
| `monitoring` | 5 | Real-time monitoring, capacity planning, alerting |

**Total: 63 tools across 9 groups**

### Token Savings Calculator

| Configuration | Tools | Tokens Saved | Savings % |
|--------------|-------|--------------|-----------|
| No filtering | 63 | 0 | 0% |
| `-vector,-geo,-stats,-text` | 35 | ~5,600 | **44%** |
| `-vector,-geo` | 48 | ~3,000 | **24%** |
| Core + JSON only | 20 | ~8,600 | **68%** |
| Core only | 9 | ~10,800 | **86%** |

*Based on ~200 tokens per tool definition (description + parameters)*

### MCP Client Configuration

**Cursor / Claude Desktop:**

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "DATABASE_URI", "-e", "POSTGRES_MCP_TOOL_FILTER",
               "writenotenow/postgres-mcp-enhanced:latest", "--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/db",
        "POSTGRES_MCP_TOOL_FILTER": "-vector,-geo,-stats,-text"
      }
    }
  }
}
```

**Windsurf:**

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "DATABASE_URI", "-e", "POSTGRES_MCP_TOOL_FILTER",
               "writenotenow/postgres-mcp-enhanced:latest", "--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/db",
        "POSTGRES_MCP_TOOL_FILTER": "-vector,-geo,-stats,-text"
      }
    }
  }
}
```

> **Tip:** Omit `POSTGRES_MCP_TOOL_FILTER` to enable all 63 tools (default behavior)

### Common Use Cases

```bash
# Analytics focus - keep stats/performance, remove spatial
POSTGRES_MCP_TOOL_FILTER="-vector,-geo,-backup"

# Read-only operations - disable execute_sql
POSTGRES_MCP_TOOL_FILTER="-execute_sql"

# CI/CD pipelines - core operations only
POSTGRES_MCP_TOOL_FILTER="-backup,-monitoring"

# Development - all tools except missing extensions
POSTGRES_MCP_TOOL_FILTER="-vector,-geo"
```

**📖 [Complete Tool Filtering Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Filtering)**

---

## 🆕 **Recent Updates**

### **Version 1.2.0 Tool Filtering** 🎛️ (December 2025)
- **🎛️ NEW: Tool Filtering** - Control which tools are exposed via `POSTGRES_MCP_TOOL_FILTER` environment variable
- **🎯 Client Compatibility** - Stay under tool limits (Windsurf: 100, Cursor: ~80 warning threshold)
- **💰 Token Savings** - Reduce tool schema overhead by 24-86% based on configuration
- **🔧 9 Tool Groups** - Filter by category: `core`, `json`, `text`, `stats`, `performance`, `vector`, `geo`, `backup`, `monitoring`
- **⚡ Flexible Syntax** - `-group` disables group, `-tool` disables specific tool, `+tool` re-enables
- **✅ Zero Breaking Changes** - All 63 tools enabled by default, backward compatible

**Common filters:**
- `POSTGRES_MCP_TOOL_FILTER="-vector,-geo,-stats,-text"` → 35 tools (44% savings)
- `POSTGRES_MCP_TOOL_FILTER="-vector,-geo"` → 48 tools (24% savings)
- `POSTGRES_MCP_TOOL_FILTER="-json,-text,-stats,-performance,-vector,-geo,-backup,-monitoring"` → 9 tools (86% savings)

**📖 [Tool Filtering Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Tool-Filtering)**

---

### **Version 1.1.1 Security Patch** 🔒 (December 6, 2025)
- **🔒 Security Fixes**: Updated critical dependencies to address vulnerabilities
  - `urllib3` upgraded to 2.6.0 (fixes CVE-2025-66471, CVE-2025-66418)
  - `mcp` upgraded to 1.23.1 (fixes CVE-2025-66416)
- **🐍 Python 3.13 Upgrade**: Docker images now use Python 3.13
  - Aligned with SQLite MCP Server for consistency
  - Better performance and improved features
  - Local development supports Python 3.12, 3.13, and 3.14
- **📦 Dependency Updates**: All packages updated to latest stable versions
  - Improved compatibility and performance
  - Enhanced reliability and security posture
- **✅ Tested**: All 60 security tests passing
- **🐳 Docker**: Updated to Python 3.13 with latest security patches

### **Version 1.1.0 Release** 🎉 (October 4, 2025)
- **🌟 NEW: MCP Resources (10)**: Real-time database meta-awareness
  - Instant access to schema, capabilities, performance, health
  - Reduces token usage by providing cached context
  - AI can access database state without explicit queries
- **🌟 NEW: MCP Prompts (10)**: Guided workflows for complex operations
  - Step-by-step query optimization workflow
  - Comprehensive index tuning guide
  - Complete database health assessment
  - pgvector and PostGIS setup guides
  - JSONB best practices and optimization
- **✨ Intelligent Assistant**: Transforms from tool collection to database expert
  - Proactive optimization suggestions
  - Context-aware recommendations
  - PostgreSQL-specific best practices
- **🔒 Code Quality**: Pyright strict mode compliance
  - Resolved 2,000+ type issues
  - 100% type-safe codebase
  - Enhanced reliability and maintainability
- **📦 Zero Breaking Changes**: All existing tools work unchanged

### **Version 1.0.0 Release** 🎉 (October 3, 2025)
- **Production Ready**: Enterprise-grade PostgreSQL MCP server
- **63 Specialized Tools**: Complete feature set across 9 categories
- **Zero Known Vulnerabilities**: Comprehensive security audit passed
- **Type Safety**: Pyright strict mode compliance
- **Multi-Platform**: Windows, Linux, macOS (amd64, arm64)

### **Phase 5 Complete** ✅ (October 3, 2025)
- **Backup & Recovery**: 4 new tools for enterprise backup planning
- **Monitoring & Alerting**: 5 new tools for real-time monitoring
- **All 63 Tools Ready**: Complete Phase 5 implementation

### **Phase 4 Complete** ✅ (October 3, 2025)
- **Vector Search**: 8 tools with pgvector integration
- **Geospatial**: 7 tools with PostGIS integration
- **Extension Support**: pgvector v0.8.0, PostGIS v3.5.0

### **Phase 3 Complete** ✅ (October 3, 2025)
- **Statistical Analysis**: 8 advanced statistics tools
- **Performance Intelligence**: 6 optimization tools

---

## 📖 **Configuration**

### **Claude Desktop**
```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "DATABASE_URI", 
               "writenotenow/postgres-mcp-enhanced:latest", "--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }
}
```

### **Cursor IDE**
```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "postgres-mcp",
      "args": ["--access-mode=restricted"],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/db"
      }
    }
  }
}
```

**📖 [MCP Configuration Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/MCP-Configuration)**

---

## 🔧 **Troubleshooting**

**Common Issues:**
- **Connection Refused**: Verify PostgreSQL is running with `pg_isready`
- **Extension Not Found**: Install required extensions (see Extension Setup)
- **Permission Denied**: Check database user permissions
- **MCP Server Not Found**: Validate MCP client configuration

**📖 [Full Troubleshooting Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Troubleshooting)**

---

## 🧪 **Testing**

**Run all tests:**

```bash
uv run pytest -v
```

**Security tests:**

```bash
python security/run_security_test.py
```

**With coverage:**

```bash
uv run pytest --cov=src tests/
```

**Test Results:**
- ✅ Security: 20/20 passed (100% protection)
- ✅ SQL Injection: All vectors blocked
- ✅ Integration: All operations validated
- ✅ Type Safety: Pyright strict mode (2,000+ issues resolved)
- ✅ Compatibility: PostgreSQL 13-18 supported


---

## 🏆 **Why Choose This Server?**

- ✅ **Zero Known Vulnerabilities** - Comprehensive security audit passed
- ✅ **Pyright Strict Mode** - 2,000+ type issues resolved, 100% type-safe codebase
- ✅ **Enterprise-Grade** - Production-ready with advanced features
- ✅ **63 Specialized Tools** - Complete database operation coverage
- ✅ **10 Intelligent Resources** - Real-time database meta-awareness (NEW in v1.1.0!)
- ✅ **10 Guided Prompts** - Step-by-step workflows for complex operations (NEW in v1.1.0!)
- ✅ **AI Assistant Capabilities** - Proactive optimization and recommendations
- ✅ **Real-Time Analytics** - pg_stat_statements integration
- ✅ **AI-Native** - Vector search, semantic operations, ML-ready
- ✅ **Active Maintenance** - Regular updates and security patches
- ✅ **Comprehensive Documentation** - 16-page wiki with examples

---

## 🔗 **Links**

- **[📚 Complete Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** - Full documentation
- **[📝 GitHub Gists](https://gist.github.com/neverinfamous/7a47b6ca39857c7a8e06c4f7e6537a16)** - 7 practical examples and use cases
- **[🛡️ Security Policy](SECURITY.md)** - Vulnerability reporting
- **[🤝 Contributing](CONTRIBUTING.md)** - Development guidelines
- **[🐳 Docker Hub](https://hub.docker.com/r/writenotenow/postgres-mcp-enhanced)** - Container images
- **[📦 PyPI Package](https://pypi.org/project/postgres-mcp-enhanced/)** - Python package

**GitHub Gists - Practical Examples:**
- **Complete Feature Showcase** - All 63 tools with comprehensive examples
- **Security Best Practices** - SQL injection prevention and production security
- **Performance Intelligence** - Query optimization and index tuning strategies
- **Vector/Semantic Search** - pgvector integration and AI-native operations
- **Enterprise Monitoring** - Real-time monitoring and alerting workflows
- **Geospatial Operations** - PostGIS integration and spatial queries
- **JSON/JSONB Operations** - Advanced JSONB operations and validation

---

## 📈 **Project Stats**

- **Version 1.1.1** - Security patch + Python 3.14 support (December 6, 2025)
- **63 MCP Tools** across 9 categories
- **10 MCP Resources** - Database meta-awareness (NEW!)
- **10 MCP Prompts** - Guided workflows (NEW!)
- **100% Type Safe** - Pyright strict mode (2,000+ issues resolved)
- **Zero Known Vulnerabilities** - Security audit passed (Python deps)
- **Zero Linter Errors** - Clean codebase with comprehensive type checking
- **PostgreSQL 13-18** - Full compatibility
- **Python 3.12-3.14** - Full compatibility with latest Python
- **Multi-platform** - Windows, Linux, macOS (amd64, arm64)
- **7,500+ lines** - 14 modules, comprehensive implementation

---

## 📄 **License & Security**

- **License**: MIT - see [LICENSE](LICENSE) file
- **Security**: Report vulnerabilities to admin@adamic.tech
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Enterprise-grade PostgreSQL MCP server with comprehensive security, real-time analytics, and AI-native operations.*
