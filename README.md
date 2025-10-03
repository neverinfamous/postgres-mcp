# PostgreSQL MCP Server - Version 1.0.5

* Last Updated October 3, 2025 7:58 PM EST **

Enterprise-grade PostgreSQL MCP server with enhanced security, comprehensive testing, AI-native database operations, and advanced analytics.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp/security/code-scanning)

---

## 📚 **[Complete Documentation - Visit the Wiki →](https://github.com/neverinfamous/postgres-mcp/wiki)**

For detailed documentation, examples, and guides, visit our comprehensive wiki:
- **[Quick Start Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Quick-Start)** - Get running in 30 seconds
- **[Installation & Configuration](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration)** - Detailed setup
- **[All Tool Categories](https://github.com/neverinfamous/postgres-mcp/wiki/Home)** - 63 specialized tools
- **[Security Best Practices](https://github.com/neverinfamous/postgres-mcp/wiki/Security-and-Best-Practices)** - Production security
- **[Troubleshooting](https://github.com/neverinfamous/postgres-mcp/wiki/Troubleshooting)** - Common issues

---

## 🚀 **Quick Overview**

**63 specialized MCP tools** for PostgreSQL operations:
- **Core Database (9)**: Schema management, SQL execution, health monitoring
- **JSON Operations (11)**: JSONB operations, validation, security scanning
- **Text Processing (5)**: Similarity search, full-text search, fuzzy matching
- **Statistical Analysis (8)**: Descriptive stats, correlation, regression, time series
- **Performance Intelligence (6)**: Query optimization, index tuning, workload analysis
- **Vector/Semantic Search (8)**: Embeddings, similarity search, clustering
- **Geospatial (7)**: Distance calculation, spatial queries, GIS operations
- **Backup & Recovery (4)**: Backup planning, restore validation, scheduling
- **Monitoring & Alerting (5)**: Real-time monitoring, capacity planning, alerting

Enhanced with **pg_stat_statements**, **hypopg**, **pgvector**, and **PostGIS** extensions.

---

## 📋 **Prerequisites**

1. **PostgreSQL Database** (version 13-17)
2. **Environment Variable**: `DATABASE_URI="postgresql://user:pass@host:5432/db"`
3. **MCP Client**: Claude Desktop, Cursor, or compatible client

**See [Installation Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration) for detailed setup instructions.**

---

## 🚀 **Quick Start**

### **Docker (Recommended)**
```bash
docker pull neverinfamous/postgres-mcp:latest

docker run -i --rm \
  -e DATABASE_URI="postgresql://user:pass@localhost:5432/db" \
  neverinfamous/postgres-mcp:latest \
  --access-mode=restricted
```

### **Python Installation**
```bash
pip install postgres-mcp-enhanced
postgres-mcp --access-mode=restricted
```

### **From Source**
```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
uv sync
uv run pytest -v
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

## 📊 **Tool Categories (63 Tools)**

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

**📖 [View All Tools →](https://github.com/neverinfamous/postgres-mcp/wiki/Home)**

---

## 🔧 **PostgreSQL Extensions**

Required extensions for full functionality:
- **pg_stat_statements** (built-in) - Query performance tracking
- **pg_trgm** & **fuzzystrmatch** (built-in) - Text similarity
- **hypopg** (optional) - Hypothetical index testing
- **pgvector** (optional) - Vector similarity search
- **PostGIS** (optional) - Geospatial operations

**Quick Setup:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
```

**📖 [Extension Setup Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Extension-Setup)**

---

## 🆕 **Recent Updates**

### **Version 1.0.0 Release** 🎉 (October 3, 2025)
- **Production Ready**: Enterprise-grade PostgreSQL MCP server
- **63 Specialized Tools**: Complete feature set across 9 categories
- **Zero Known Vulnerbilities**: Comprehensive security audit passed
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
               "neverinfamous/postgres-mcp:latest", "--access-mode=restricted"],
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

```bash
# Run all tests
uv run pytest -v

# Security tests
python security/run_security_test.py

# With coverage
uv run pytest --cov=src tests/
```

**Test Results:**
- ✅ Security: 20/20 passed (100% protection)
- ✅ SQL Injection: All vectors blocked
- ✅ Integration: All operations validated
- ✅ Compatibility: PostgreSQL 13-17 supported


---

## 🏆 **Why Choose This Server?**

- ✅ **Zero Known Vulnerabilities** - Comprehensive security audit passed
- ✅ **Enterprise-Grade** - Production-ready with advanced features
- ✅ **63 Specialized Tools** - Complete database operation coverage
- ✅ **Real-Time Analytics** - pg_stat_statements integration
- ✅ **AI-Native** - Vector search, semantic operations, ML-ready
- ✅ **Active Maintenance** - Regular updates and security patches
- ✅ **Comprehensive Documentation** - 16-page wiki with examples

---

## 🔗 **Links**

- **[📚 Complete Wiki](https://github.com/neverinfamous/postgres-mcp/wiki)** - Full documentation
- **[🛡️ Security Policy](SECURITY.md)** - Vulnerability reporting
- **[🤝 Contributing](CONTRIBUTING.md)** - Development guidelines
- **[🐳 Docker Hub](https://hub.docker.com/r/neverinfamous/postgres-mcp)** - Container images (coming soon)
- **[📦 PyPI Package](https://pypi.org/project/postgres-mcp-enhanced/)** - Python package

---

## 📈 **Project Stats**

- **Version 1.0.5** - Production ready release (October 3, 2025)
- **63 MCP Tools** across 9 categories
- **Phase 5 Complete** ✅ - All enterprise features implemented
- **Type Safe** - Pyright strict mode
- **Zero Known Vulnerabilities** - Security audit passed
- **PostgreSQL 13-17** - Full compatibility
- **Multi-platform** - Windows, Linux, macOS (amd64, arm64)
- **6,900+ lines** - 12 modules, comprehensive implementation

---

## 📄 **License & Security**

- **License**: MIT - see [LICENSE](LICENSE) file
- **Security**: Report vulnerabilities to admin@adamic.tech
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

*Enterprise-grade PostgreSQL MCP server with comprehensive security, real-time analytics, and AI-native operations.*
