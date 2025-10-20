# PostgreSQL MCP Server - Enhanced

Last Updated October 18, 2025 8:59 PM EST Production/Stable v1.1.1

<!-- mcp-name: io.github.neverinfamous/postgres-mcp-server -->

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/postgres--mcp-blue?logo=github)](https://github.com/neverinfamous/postgres-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp-enhanced)](https://hub.docker.com/r/writenotenow/postgres-mcp-enhanced)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.1.1-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![PyPI](https://img.shields.io/pypi/v/postgres-mcp-enhanced)](https://pypi.org/project/postgres-mcp-enhanced/)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/postgres-mcp/blob/main/SECURITY.md)
[![GitHub Stars](https://img.shields.io/github/stars/neverinfamous/postgres-mcp?style=social)](https://github.com/neverinfamous/postgres-mcp)
[![Type Safety](https://img.shields.io/badge/Pyright-Strict-blue.svg)](https://github.com/neverinfamous/postgres-mcp)

*Enterprise-grade PostgreSQL MCP server with comprehensive security, AI-native operations, and intelligent meta-awareness*

---

## 🚀 Quick Start

**Step 1: Pull the latest image**

```bash
docker pull writenotenow/postgres-mcp-enhanced:latest
```

**Step 2: Run with your database connection**

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://user:pass@host:5432/dbname" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=restricted
```

The server is now running and ready to connect via MCP.

---

## ⚡ **Install to Cursor IDE**

### **One-Click Installation**

Click the button below to install directly into Cursor:

[![Install to Cursor](https://img.shields.io/badge/Install%20to%20Cursor-Click%20Here-blue?style=for-the-badge)](cursor://anysphere.cursor-deeplink/mcp/install?name=PostgreSQL%20Enterprise%20MCP%20Server&config=eyJkb2NrZXIuaW8vd3JpdGVub3Rlbm93L3Bvc3RncmVzLW1jcC1lbmhhbmNlZDp2MS4xLjEiOnsidHJhbnNwb3J0Ijp7InR5cGUiOiJzdGRpbyJ9fX0=)

Or copy this deep link:
```
cursor://anysphere.cursor-deeplink/mcp/install?name=PostgreSQL%20Enterprise%20MCP%20Server&config=eyJkb2NrZXIuaW8vd3JpdGVub3Rlbm93L3Bvc3RncmVzLW1jcC1lbmhhbmNlZDp2MS4xLjEiOnsidHJhbnNwb3J0Ijp7InR5cGUiOiJzdGRpbyJ9fX0=
```

### **Setup Requirements**
- ✅ Docker installed and running
- ✅ PostgreSQL database (version 13-18)
- ✅ `DATABASE_URI` environment variable configured

**📖 [See Full Installation Guide →](https://github.com/neverinfamous/postgres-mcp/wiki/Installation-and-Configuration)**

---

## 📋 Prerequisites

1. **PostgreSQL Database** (version 13-18) - Running and accessible
2. **Database Connection String** - In the format: `postgresql://user:pass@host:5432/dbname`
3. **MCP Client** - Claude Desktop, Cursor, or any MCP-compatible client

**Platform Compatibility:**
- ✅ **Full support**: Linux, macOS, WSL2
- ✅ **Docker images**: Work perfectly on all platforms including Windows
- ℹ️ **Note**: Integration tests are skipped on native Windows due to psycopg async pool compatibility with Docker containers

---

## 🐳 Docker Tags

We provide optimized tags for reliability and traceability:

| Tag | Description | Use Case |
|-----|-------------|----------|
| `latest` | Latest stable release | **Recommended for production** |
| `v1.1.1` | Specific version | Pin to exact version |
| `sha-9286931` | Commit SHA (12-char short) | Development/testing/traceability |

**Pull a specific version:**

```bash
docker pull writenotenow/postgres-mcp-enhanced:v1.1.1
```

**Tag Strategy Updates (October 2025)**

We've optimized our Docker tagging approach for improved reliability:

- ✅ **Streamlined to 3 essential tags** - Reduces Docker Hub API pressure during multi-platform builds
- ✅ **Short SHA format** (e.g., `sha-9286931`) - Maintains commit traceability with 60% smaller payload
- ⚠️ **Removed `master-YYYYMMDD-...` timestamps** - These redundant tags caused upload bottlenecks and registry timeouts
- 📝 **Infrastructure resilience** - Optimized strategy reduces impact of temporary outages (e.g., AWS/Docker Hub API issues)
- 🔄 **Consistent across all projects** - Same strategy now used in memory-journal-mcp and postgres-mcp-server

**If you encounter Docker Hub timeouts:** This is typically due to infrastructure issues (AWS outages, Docker Hub API limits). The optimizations above significantly reduce the impact of such incidents. Your images are fully deployed and available, even if description updates or metrics uploads experience delays.

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URI` | Yes | PostgreSQL connection string |
| `--access-mode` | Recommended | `restricted` (read-only) or `unrestricted` (full access) |

### Example Configurations

**Production (Restricted Mode):**

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://readonly_user:pass@db.example.com:5432/production" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=restricted
```

**Development (Unrestricted Mode):**

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://admin:pass@localhost:5432/dev_db" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=unrestricted
```

**With Docker Compose:**

```yaml
version: '3.8'
services:
  postgres-mcp:
    image: writenotenow/postgres-mcp-enhanced:latest
    environment:
      DATABASE_URI: postgresql://user:pass@postgres:5432/mydb
    command: --access-mode=restricted
    stdin_open: true
    tty: true
```

---

## 🛡️ Security & Code Quality

This image is built with security and quality as top priorities:

- ✅ **Non-root user** - Runs as user `app` (UID 1000)
- ✅ **Zero critical vulnerabilities** - All dependencies patched
- ✅ **Pyright strict mode** - 2,000+ type issues resolved, 100% type-safe codebase
- ✅ **Zero linter errors** - Clean codebase with comprehensive type checking
- ✅ **Supply chain attestation** - Full SBOM and provenance included
- ✅ **Docker Scout verified** - Continuous security scanning
- ✅ **SQL injection prevention** - All queries use parameter binding
- ✅ **Minimal attack surface** - Alpine-based with only required dependencies

**View security scan results:**
```bash
docker scout cves writenotenow/postgres-mcp-enhanced:latest
```

---

## 🏢 What's Included

**63 specialized MCP tools** + **10 intelligent resources** + **10 guided prompts** for comprehensive PostgreSQL operations:

### MCP Tools (63)
- **Core Database (9)** - Schema management, SQL execution, health monitoring
- **JSON Operations (11)** - JSONB operations, validation, security scanning
- **Text Processing (5)** - Full-text search, similarity matching
- **Statistical Analysis (8)** - Descriptive stats, correlation, regression
- **Performance Intelligence (6)** - Query optimization, index tuning
- **Vector/Semantic Search (8)** - pgvector integration, embeddings
- **Geospatial (7)** - PostGIS integration, spatial queries
- **Backup & Recovery (4)** - Backup planning, restore validation
- **Monitoring & Alerting (5)** - Real-time monitoring, capacity planning

### MCP Resources (10) - NEW in v1.1.0!
Real-time database meta-awareness that AI can access automatically:
- Database schema, capabilities, performance metrics
- Health status, extensions, index statistics
- Connection pool, replication, vacuum status
- Lock information and statistics quality

### MCP Prompts (10) - NEW in v1.1.0!
Guided workflows for complex operations:
- Query optimization, index tuning, health checks
- pgvector and PostGIS setup guides
- JSONB best practices, performance baselines
- Backup strategy and extension setup

---

## 🔌 MCP Client Configuration

### Claude Desktop

Add this to your Claude Desktop configuration file:

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "-e", "DATABASE_URI",
        "writenotenow/postgres-mcp-enhanced:latest",
        "--access-mode=restricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/dbname"
      }
    }
  }
}
```

### Cursor IDE

Add this to your Cursor IDE MCP configuration file:

```json
{
  "mcpServers": {
    "postgres-mcp": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm", "-e", "DATABASE_URI",
        "writenotenow/postgres-mcp-enhanced:latest",
        "--access-mode=restricted"
      ],
      "env": {
        "DATABASE_URI": "postgresql://user:pass@localhost:5432/dbname"
      }
    }
  }
}
```

---

## 📊 PostgreSQL Extensions

The server works with standard PostgreSQL installations. For enhanced functionality, install these extensions:

**Required for all features:**

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
```

**Optional but recommended:**

```sql
CREATE EXTENSION IF NOT EXISTS hypopg;
CREATE EXTENSION IF NOT EXISTS pgvector;
CREATE EXTENSION IF NOT EXISTS postgis;
```

The server gracefully handles missing extensions - features requiring them will provide helpful error messages.

---

## 🧪 Testing the Image

Verify the image works correctly.

**Check server version:**

```bash
docker run --rm writenotenow/postgres-mcp-enhanced:latest --version
```

**Test database connection:**

```bash
docker run -i --rm \
  -e DATABASE_URI="postgresql://user:pass@localhost:5432/dbname" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=restricted
```

---

## 📏 Image Details

- **Base Image**: Python 3.13-slim-bookworm
- **Architecture**: AMD64, ARM64 (multi-arch)
- **Size**: ~80MB compressed, ~240MB uncompressed
- **User**: Non-root (`app:1000`)
- **Entrypoint**: `/app/docker-entrypoint.sh`
- **Working Directory**: `/app`

---

## 🔍 AI-Powered Documentation Search

**[→ Search the Documentation with AI](https://search.adamic.tech)**

Can't find what you're looking for? Use our AI-powered search to query both PostgreSQL and SQLite MCP Server documentation:

- 🤖 **Natural Language Queries** - Ask questions in plain English
- ⚡ **Instant AI Answers** - Get synthesized responses with source attribution
- 📚 **136 Tools Covered** - Search across 63 PostgreSQL + 73 SQLite tools
- 🎯 **Smart Context** - Understands technical questions and provides examples

**Example queries:** "How do I use pgvector for semantic search?", "What are the backup best practices?", "How do I optimize query performance?"

---

## 🔗 Links & Resources

- **[🔍 AI Search](https://search.adamic.tech)** - AI-powered documentation search
- **[📚 Complete Documentation](https://github.com/neverinfamous/postgres-mcp/wiki)** - Comprehensive wiki
- **[📝 GitHub Gists](https://gist.github.com/neverinfamous/7a47b6ca39857c7a8e06c4f7e6537a16)** - 7 practical examples and real-world use cases
- **[🚀 Quick Start Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Quick-Start)** - Get started in 30 seconds
- **[🛡️ Security Policy](https://github.com/neverinfamous/postgres-mcp/blob/main/SECURITY.md)** - Vulnerability reporting
- **[💻 GitHub Repository](https://github.com/neverinfamous/postgres-mcp)** - Source code
- **[📦 PyPI Package](https://pypi.org/project/postgres-mcp-enhanced/)** - Python installation option

**Practical Examples (GitHub Gists):**
- Complete Feature Showcase (63 tools)
- Security Best Practices & Implementation
- Performance Intelligence & Query Optimization
- Vector/Semantic Search with pgvector
- Enterprise Monitoring & Alerting
- Geospatial Operations with PostGIS
- JSON/JSONB Operations Masterclass

---

## 🆕 Recent Updates

### v1.1.1 (October 13, 2025) - MCP Registry Ready 🎉
- ✅ **MCP Registry Support** - Configured for Model Context Protocol Registry
- ✅ **Hybrid Deployment** - Available via PyPI, Docker Hub, and MCP Registry
- ✅ **Validation Markers** - Added MCP name markers for registry validation
- ✅ **Automated Publishing** - Integrated MCP Registry into release workflow

### v1.1.1 (October 8, 2025) 🎉
- ✅ **PostgreSQL 18 Support** - Full compatibility with PostgreSQL 13-18
- ✅ **Bug Fix** - Fixed jsonb_stats SQL type casting issue (jsonb_array_length)
- ✅ **Test Suite Enhancement** - Comprehensive testing against PostgreSQL 13 and 18
- ✅ **Windows Compatibility** - Documented Windows test limitations with workarounds
- ✅ **IDE Configuration** - Improved basedpyright configuration for better developer experience
- ✅ Zero breaking changes - All existing features work unchanged

### v1.1.0 (October 4, 2025)
- ✅ **NEW: MCP Resources (10)** - Real-time database meta-awareness
- ✅ **NEW: MCP Prompts (10)** - Guided workflows for complex operations
- ✅ **Intelligent Assistant** - Transforms from tool collection to database expert
- ✅ **Pyright strict mode** - 2,000+ type issues resolved, 100% type-safe codebase
- ✅ **Zero linter errors** - Clean codebase with comprehensive type checking
- ✅ Zero breaking changes - All existing tools work unchanged

### v1.0.5 (October 3, 2025)
- ✅ Fixed Docker Scout tag format
- ✅ Docker-optimized README for Docker Hub
- ✅ Complete workflow automation

### v1.0.4 (October 3, 2025)
- ✅ Improved Docker tagging strategy
- ✅ Removed buildcache tag clutter
- ✅ Automatic README sync to Docker Hub

### v1.0.3 (October 3, 2025)
- ✅ Fixed all critical/high CVEs (h11, mcp, setuptools, bind9)
- ✅ Updated dependencies to latest secure versions
- ✅ Zero known vulnerabilities

### v1.0.2 (October 3, 2025)
- ✅ Added non-root user (security hardening)
- ✅ Supply chain attestation (SBOM + Provenance)
- ✅ Docker Scout scanning integration

---

## 🙋 Support & Contributing

- **Issues**: [GitHub Issues](https://github.com/neverinfamous/postgres-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/neverinfamous/postgres-mcp/discussions)
- **Security**: Report vulnerabilities to admin@adamic.tech
- **Contributing**: See [Contributing Guide](https://github.com/neverinfamous/postgres-mcp/blob/main/CONTRIBUTING.md)

---

## 📄 License

MIT License - See [LICENSE](https://github.com/neverinfamous/postgres-mcp/blob/main/LICENSE)