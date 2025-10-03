# PostgreSQL MCP Server - Enhanced

*Last Updated October 3, 2025 7:26 PM EST*

[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/postgres-mcp-enhanced)](https://hub.docker.com/r/writenotenow/postgres-mcp-enhanced)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.5-green)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/postgres-mcp/blob/main/SECURITY.md)
[![GitHub Stars](https://img.shields.io/github/stars/neverinfamous/postgres-mcp?style=social)](https://github.com/neverinfamous/postgres-mcp)

*Enterprise-grade PostgreSQL MCP server with comprehensive security and AI-native operations*

---

## 🚀 Quick Start

Pull and run the latest version:

```bash
docker pull writenotenow/postgres-mcp-enhanced:latest

docker run -i --rm \
  -e DATABASE_URI="postgresql://user:pass@host:5432/dbname" \
  writenotenow/postgres-mcp-enhanced:latest \
  --access-mode=restricted
```

**That's it!** The server is now running and ready to connect via MCP.

---

## 📋 Prerequisites

1. **PostgreSQL Database** (version 13-17) - Running and accessible
2. **Database Connection String** - In the format: `postgresql://user:pass@host:5432/dbname`
3. **MCP Client** - Claude Desktop, Cursor, or any MCP-compatible client

---

## 🐳 Docker Tags

We provide multiple tags for different use cases:

| Tag | Description | Use Case |
|-----|-------------|----------|
| `latest` | Latest stable release | **Recommended for production** |
| `v1.0.5` | Specific version | Pin to exact version |
| `sha-abc1234` | Commit SHA | Development/testing |
| `master-YYYYMMDD-HHMMSS-sha` | Timestamped | Audit trail |

**Pull a specific version:**
```bash
docker pull writenotenow/postgres-mcp-enhanced:v1.0.5
```

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

## 🛡️ Security Features

This image is built with security as a priority:

- ✅ **Non-root user** - Runs as user `app` (UID 1000)
- ✅ **Zero critical vulnerabilities** - All dependencies patched
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

**63 specialized MCP tools** for comprehensive PostgreSQL operations:

- **Core Database (9)** - Schema management, SQL execution, health monitoring
- **JSON Operations (11)** - JSONB operations, validation, security scanning
- **Text Processing (5)** - Full-text search, similarity matching
- **Statistical Analysis (8)** - Descriptive stats, correlation, regression
- **Performance Intelligence (6)** - Query optimization, index tuning
- **Vector/Semantic Search (8)** - pgvector integration, embeddings
- **Geospatial (7)** - PostGIS integration, spatial queries
- **Backup & Recovery (4)** - Backup planning, restore validation
- **Monitoring & Alerting (5)** - Real-time monitoring, capacity planning

---

## 🔌 MCP Client Configuration

### Claude Desktop
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

## 🔗 Links & Resources

- **[📚 Complete Documentation](https://github.com/neverinfamous/postgres-mcp/wiki)** - Comprehensive wiki
- **[🚀 Quick Start Guide](https://github.com/neverinfamous/postgres-mcp/wiki/Quick-Start)** - Get started in 30 seconds
- **[🛡️ Security Policy](https://github.com/neverinfamous/postgres-mcp/blob/main/SECURITY.md)** - Vulnerability reporting
- **[💻 GitHub Repository](https://github.com/neverinfamous/postgres-mcp)** - Source code
- **[📦 PyPI Package](https://pypi.org/project/postgres-mcp-enhanced/)** - Python installation option

---

## 🆕 Recent Updates

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
