# PostgreSQL MCP Server

*Last Updated: September 29, 2025 10:43 AM EST *

*Enterprise-grade PostgreSQL MCP server with enhanced security, comprehensive testing, and AI-native database operations*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](SECURITY.md)
[![CodeQL](https://img.shields.io/badge/CodeQL-Passing-brightgreen.svg)](https://github.com/neverinfamous/postgres-mcp/security/code-scanning)

Transform PostgreSQL into a powerful, AI-ready database engine with **9 specialized tools** for advanced analytics, health monitoring, index optimization, and secure query execution.

---

## 🚀 **Quick Start**

### **Option 1: Docker (Recommended)**
```bash
# Pull and run instantly
docker pull neverinfamous/postgres-mcp:latest

docker run -i --rm \
  -e DATABASE_URI="postgresql://username:password@localhost:5432/dbname" \
  neverinfamous/postgres-mcp:latest \
  --access-mode=restricted
```

### **Option 2: Python Installation**
```bash
# Install from PyPI
pip install postgres-mcp

# Run the server
postgres-mcp --access-mode=restricted
```

### **Option 3: Test in 30 Seconds**
```bash
git clone https://github.com/neverinfamous/postgres-mcp.git
cd postgres-mcp
uv sync
uv run pytest -v
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
- **Fix**: Added comprehensive parameter binding with backward compatibility
- **Testing**: 20+ security test cases validate protection against all attack vectors
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

### **🔍 Database Health Monitoring**
- **Index Health** - Detect unused, duplicate, and bloated indexes
- **Connection Health** - Monitor connection utilization and limits
- **Vacuum Health** - Prevent transaction ID wraparound issues
- **Buffer Cache** - Analyze cache hit rates and performance
- **Replication Health** - Monitor lag and replication status
- **Constraint Validation** - Detect invalid constraints

### **⚡ Performance Optimization**
- **Intelligent Index Tuning** - AI-powered index recommendations
- **Query Plan Analysis** - EXPLAIN plans with hypothetical indexes
- **Workload Analysis** - Identify resource-intensive queries
- **Cost-Benefit Analysis** - Optimize performance vs. storage trade-offs

### **🧠 AI-Native Operations**
- **Schema Intelligence** - Context-aware SQL generation
- **Query Optimization** - Automated performance improvements
- **Predictive Analysis** - Simulate performance improvements
- **Natural Language Interface** - Human-friendly database interactions

---

## 📊 **MCP Tools**

The PostgreSQL MCP Server provides **9 specialized tools**:

| Tool | Description | Security Level |
|------|-------------|----------------|
| `list_schemas` | List all database schemas | 🟢 Safe |
| `list_objects` | List tables, views, sequences, extensions | 🟢 Safe |
| `get_object_details` | Detailed object information and schema | 🟢 Safe |
| `execute_sql` | **Secure SQL execution with parameter binding** | 🛡️ **Enhanced** |
| `explain_query` | Query execution plans and optimization | 🟢 Safe |
| `get_top_queries` | Performance analysis of slow queries | 🟢 Safe |
| `analyze_workload_indexes` | Workload-based index recommendations | 🟢 Safe |
| `analyze_query_indexes` | Query-specific index optimization | 🟢 Safe |
| `analyze_db_health` | Comprehensive database health checks | 🟢 Safe |

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

### **Performance Optimization**
```bash
# Analyze slow queries and get index recommendations
get_top_queries(sort_by="total_time", limit=10)
analyze_workload_indexes(method="dta", max_index_size_mb=1000)

# Optimize specific queries
analyze_query_indexes(
    queries=["SELECT * FROM orders WHERE customer_id = %s"],
    method="dta"
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


---

## 🧪 **Comprehensive Testing**

### **Security Testing**
```bash
# Run comprehensive security test suite
python run_security_test.py

# Test specific vulnerability fixes
python test_security_fix.py

# Demonstrate security protections (educational)
python demonstrate_vulnerability.py
```

### **Functional Testing**
```bash
# Run all tests
uv run pytest -v

# Run with coverage
uv run pytest --cov=src tests/

# Integration tests
uv run pytest tests/integration/ -v
```

**Test Results:**
- ✅ **Security Tests**: 20/20 passed (100% protection rate)
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
- ✅ **Industrial-Strength Algorithms** - Microsoft SQL Server DTA-inspired index tuning
- ✅ **Proven Architecture** - Built on psycopg3 and libpq for maximum compatibility
- ✅ **Comprehensive Health Checks** - Based on proven PgHero methodologies
- ✅ **Predictive Analysis** - HypoPG integration for accurate performance simulation

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
| **Test Security** | `python run_security_test.py` |
| **Docker Quick Start** | `docker run -i --rm -e DATABASE_URI neverinfamous/postgres-mcp:latest` |
| **Install from PyPI** | `pip install postgres-mcp` |
| **Run Tests** | `uv run pytest -v` |
| **Report Security Issues** | [Security Policy](SECURITY.md) |

---

## 📈 **Project Stats**

- **9 MCP Tools** for comprehensive database operations
- **20+ Security Tests** covering all attack vectors
- **Zero Known Vulnerabilities** after comprehensive audit
- **Multi-platform Support** (Windows, Linux, macOS)
- **Docker Images** for amd64 and arm64
- **Enterprise Testing** with comprehensive validation
- **Active Development** with regular security updates

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

*This PostgreSQL MCP Server represents a commitment to secure, reliable, and high-performance database operations in AI-driven environments.*

