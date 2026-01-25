# ⚠️ DEPRECATED - PostgreSQL MCP Server (Python)

> **This repository has been deprecated.** Please use the new TypeScript version instead.

---

## 🔄 Migration

The PostgreSQL MCP Server has been completely rewritten in TypeScript with significant improvements:

| | Old (Python) | New (TypeScript) |
|---|---|---|
| **Tools** | 63 | 203 |
| **Resources** | 10 | 20 |
| **Prompts** | 10 | 19 |
| **Transport** | stdio only | stdio + HTTP/SSE |
| **Auth** | None | OAuth 2.1 |
| **Features** | Basic | Code Mode, Tool Filtering |

## 📦 New Repository

**GitHub:** https://github.com/neverinfamous/postgresql-mcp

**Docker:**
```bash
docker pull writenotenow/postgres-mcp:latest
```

**npm:**
```bash
npm install -g @neverinfamous/postgres-mcp
```

**MCP Registry:** `io.github.neverinfamous/postgres-mcp`

---

## ⚠️ Notice

- This repository will no longer receive updates
- Security patches will NOT be applied
- Please migrate to the new TypeScript version

**For documentation and support, visit:** https://github.com/neverinfamous/postgresql-mcp

---

*Last Python version: v1.2.0 (December 2025)*
