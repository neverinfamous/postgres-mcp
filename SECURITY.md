# 🔒 Security Policy

The postgres-mcp PostgreSQL MCP server implements comprehensive security measures to protect your databases across stdio, HTTP, and SSE transports.

## 🛡️ **Database Security**

### **SQL Injection Prevention**

**Identifier Sanitization** (`src/utils/identifiers.ts`)

- ✅ **Comprehensive coverage** — all table, column, schema, and index names validated and quoted across every tool group (admin, backup, core, jsonb, monitoring, partitioning, performance, postgis, schema, stats, text, vector)
- ✅ **PostgreSQL identifier rules enforced** — start with letter/underscore, contain only alphanumerics, underscores, or $ signs
- ✅ **63-character limit** enforced (PostgreSQL maximum)
- ✅ **Invalid identifiers** throw `InvalidIdentifierError`

Key functions:

- `sanitizeIdentifier(name)` — Validates and double-quotes an identifier
- `sanitizeTableName(table, schema?)` — Handles schema-qualified table references
- `sanitizeColumnRef(column, table?)` — Handles column references with optional table qualifier
- `sanitizeIdentifiers(names[])` — Batch sanitization for column lists

**Parameterized Queries**

- ✅ **All user-provided values** use parameterized queries via `pg` library
- ✅ **Identifier sanitization** complements parameterized values — defense in depth

### **Structured Error Handling**

Every tool returns structured error responses — never raw exceptions or internal details:

```json
{
  "success": false,
  "error": "Descriptive message with context",
  "code": "MODULE_ERROR_CODE",
  "category": "VALIDATION_ERROR",
  "suggestion": "Actionable remediation hint",
  "recoverable": true
}
```

Error codes are module-prefixed (e.g., `PG_CONNECTION_FAILED`, `SCHEMA_NOT_FOUND`). Internal stack traces are logged server-side but never exposed to clients.

## 🔐 **Input Validation**

- ✅ **Zod schemas** — all tool inputs validated at tool boundaries before database operations
- ✅ **Parameterized queries** used throughout — never string interpolation
- ✅ **Identifier sanitization** — table, column, schema, and index names validated against injection

## 🧪 **Code Mode Sandbox Security**

Code Mode executes user-provided JavaScript in a Node.js `vm` context. The `vm` module provides **script isolation, not security isolation** — it is not designed to resist a determined attacker with direct access. The following defense-in-depth mitigations significantly reduce risk within the intended **trusted AI agent** threat model:

### **Sandbox Restrictions**

- ✅ **Blocked globals** — `require`, `process`, `global`, `globalThis`, `module`, `exports`, `setTimeout`, `setInterval`, `setImmediate`, `Proxy` set to `undefined`
- ✅ **Blocked patterns** — 17 static regex rules reject code containing `require()`, `import()`, `eval()`, `Function()`, `__proto__`, `constructor.constructor`, `Reflect.*`, `Symbol.*`, `new Proxy()`, and filesystem/network/child_process references
- ✅ **Execution timeout** — 30s hard limit (configurable)
- ✅ **Input limits** — 50KB code input, 10MB result output
- ✅ **Rate limiting** — 60 executions per minute per client
- ✅ **Audit logging** — every execution logged with UUID, client ID, metrics, and code preview (truncated to 200 chars)
- ✅ **Admin scope** — Code Mode requires `admin` scope when OAuth is enabled

> **⚠️ Threat Model:** Code Mode is designed for use by **trusted AI agents**, not for executing arbitrary untrusted code from end users. The `vm` module does not provide a true security boundary — a sufficiently determined attacker with direct access could potentially escape the sandbox (e.g., via fragmented `constructor` chain access on exposed built-in Error types). Static pattern blocking catches the known literal forms (`constructor.constructor`) but not dynamically constructed variants.
>
> **For untrusted input deployments:** Use process-level sandboxing such as running the container with `--cap-drop=ALL`, or replace `vm` with `isolated-vm` for V8 isolate-level separation.

## 🌐 **HTTP Transport Security**

When running in HTTP mode (`--transport http`), the following security measures apply:

### **Security Headers & Protections**

- ✅ **X-Content-Type-Options: nosniff** — prevents MIME sniffing
- ✅ **X-Frame-Options: DENY** — prevents clickjacking
- ✅ **Content-Security-Policy: default-src 'none'; frame-ancestors 'none'** — prevents XSS and framing
- ✅ **Cache-Control: no-store, no-cache, must-revalidate** — prevents caching of sensitive data
- ✅ **Referrer-Policy: no-referrer** — prevents referrer leakage
- ✅ **Permissions-Policy: camera=(), microphone=(), geolocation=()** — restricts browser APIs

### **HSTS Support**

- ✅ **Strict-Transport-Security** header for HTTPS deployments
- ✅ Enable via `enableHSTS: true` configuration

### **CORS Configuration**

- ✅ **Origin whitelist** with `Vary: Origin` header for caching
- ✅ **Optional credentials support** (`corsAllowCredentials`)
- ✅ **MCP-specific headers** allowed (`X-Session-ID`, `mcp-session-id`)

### **Rate Limiting & Timeouts**

- ✅ **Built-in Rate Limiting** — 100 requests/minute per IP
- ✅ **Configurable** via `rateLimitMaxRequests` and `rateLimitWindowMs`
- ✅ **Returns `429 Too Many Requests`** when exceeded

> **Reverse Proxy Note:** Rate limiting uses `req.socket.remoteAddress`. Behind a reverse proxy (e.g., nginx, Cloudflare Tunnel), all requests may share the same source IP. Ensure your proxy forwards distinct client IPs, or apply rate limiting at the proxy layer instead.

### **Request Size Limits**

- ✅ **Configurable body limit** via `maxBodySize` (default: 1 MB) — prevents memory exhaustion DoS

## 🔑 **Authentication (OAuth 2.1)**

Full OAuth 2.1 for production multi-tenant deployments:

- ✅ **RFC 9728** Protected Resource Metadata (`/.well-known/oauth-protected-resource`)
- ✅ **RFC 8414** Authorization Server Discovery with caching
- ✅ **JWT validation** with JWKS support (TTL: 1 hour, configurable)
- ✅ **PostgreSQL-specific scopes**: `read`, `write`, `admin`, `full`, `db:{name}`, `schema:{name}`, `table:{schema}:{table}`
- ✅ **Per-tool scope enforcement** via `AsyncLocalStorage` context threading

> **⚠️ HTTP without OAuth:** When OAuth is not configured, all scope checks are bypassed. If you expose the HTTP transport without enabling OAuth, any client has full unrestricted access. Always enable OAuth for production HTTP deployments.

## 🐳 **Docker Security**

### **Non-Root User**

- ✅ **Dedicated user**: `appuser` (UID 1001) with minimal privileges
- ✅ **Restricted group**: `appgroup` (GID 1001)
- ✅ **Restricted data directory**: `700` permissions

### **Container Hardening**

- ✅ **Minimal base image**: `node:24-alpine`
- ✅ **Multi-stage build**: Build dependencies not in production image
- ✅ **Production pruning**: `npm prune --omit=dev` after build
- ✅ **Health check**: Built-in `HEALTHCHECK` instruction (transport-aware for HTTP/SSE/stdio)
- ✅ **Process isolation** from host system

### **Dependency Patching**

The Dockerfile patches npm-bundled transitive dependencies for Docker Scout compliance:

- ✅ `diff@8.0.3` — GHSA-73rr-hh4g-fpgx
- ✅ `@isaacs/brace-expansion@5.0.1` — CVE-2026-25547
- ✅ `tar@7.5.11` — CVE-2026-23950, CVE-2026-24842
- ✅ `minimatch@10.2.4` — CVE-2026-27904, CVE-2026-27903

### **Volume Mounting Security**

```bash
# Secure volume mounting
docker run -v ./data:/app/data:rw,noexec,nosuid,nodev neverinfamous/postgres-mcp:latest
```

### **Resource Limits**

```bash
# Apply resource limits
docker run --memory=1g --cpus=1 neverinfamous/postgres-mcp:latest
```

## 🔐 **Logging Security**

### **Credential Redaction**

- ✅ **Sensitive fields automatically redacted** in logs: `password`, `secret`, `token`, `apikey`, `issuer`, `audience`, `jwksUri`, `credentials`, etc.
- ✅ **Recursive sanitization** for nested objects

### **Log Injection Prevention**

- ✅ **Control character sanitization** (ASCII 0x00-0x1F except tab/newline, 0x7F, C1 characters)
- ✅ **Prevents log forging** and escape sequence attacks

## 🔄 **CI/CD Security**

- ✅ **CodeQL analysis** — automated static analysis on push/PR
- ✅ **npm audit** — dependency vulnerability checking (audit-level: moderate)
- ✅ **Dependabot** — automated dependency update PRs (weekly for npm and GitHub Actions)
- ✅ **Secrets scanning** — dedicated workflow for leaked credential detection
- ✅ **E2E transport parity** — Playwright suite validates HTTP/SSE security behavior

## 🚨 **Security Best Practices**

### **For Users**

1. **Never commit database credentials** to version control — use environment variables
2. **Use OAuth 2.1 authentication** for HTTP transport in production — never expose HTTP transport without OAuth
3. **Restrict database user permissions** to minimum required
4. **Enable SSL** for database connections in production (`--ssl` or `ssl=true` in connection string)
5. **Enable HSTS** when running over HTTPS (`--enableHSTS`)
6. **Configure CORS origins explicitly** — avoid wildcards
7. **Use resource limits** — apply Docker `--memory` and `--cpus` limits
8. **Apply rate limiting at the proxy layer** when deploying behind a reverse proxy
9. **For cloud-managed databases** with IAM authentication (e.g., AWS RDS), set `POSTGRES_POOL_MIN=2` to reduce connection establishment latency
10. **Consider SHA-pinning** critical GitHub Actions in CI workflows for supply-chain defense-in-depth

### **For Developers**

1. **Parameterized queries only** — never interpolate user input into SQL strings
2. **Zod validation** — all tool inputs validated via schemas at tool boundaries
3. **No secrets in code** — use environment variables (`.env` files are gitignored)
4. **Typed error classes** — descriptive messages with context; don't expose internals
5. **Regular updates** — keep Node.js and npm dependencies updated
6. **Security scanning** — regularly scan Docker images for vulnerabilities

## 📋 **Security Checklist**

- [x] Parameterized SQL queries throughout
- [x] Identifier sanitization (table, column, schema, index names)
- [x] Input validation via Zod schemas
- [x] Code Mode sandbox isolation (vm context)
- [x] Code Mode execution timeout (30s hard limit)
- [x] Code Mode rate limiting (60 executions/min)
- [x] Code Mode audit logging
- [x] HTTP body size limit (configurable, default 1 MB)
- [x] Configurable CORS with origin whitelist
- [x] Rate limiting (100 req/min per IP)
- [x] Security headers (CSP, X-Content-Type-Options, X-Frame-Options, Cache-Control, Referrer-Policy, Permissions-Policy)
- [x] HSTS (opt-in)
- [x] OAuth 2.1 with JWT/JWKS validation (RFC 9728, RFC 8414)
- [x] PostgreSQL-specific scope enforcement (`read`, `write`, `admin`, `full`, `db:*`, `schema:*`, `table:*:*:*`)
- [x] Per-tool scope enforcement via `AsyncLocalStorage`
- [x] Credential redaction in logs
- [x] Log injection prevention
- [x] Non-root Docker user
- [x] Multi-stage Docker build with production pruning
- [x] Transitive dependency CVE patching in Dockerfile
- [x] CI/CD security pipeline (CodeQL, npm audit, secrets scanning)
- [x] Structured error responses (no internal details leaked)
- [x] Comprehensive security documentation

## 🚨 **Reporting Security Issues**

| Version | Supported |
| ------- | --------- |
| 2.x.x   | ✅        |
| 1.x.x   | ✅        |
| < 1.0   | ❌        |

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. **Email** security concerns to: **admin@adamic.tech**
3. **Include** detailed reproduction steps and potential impact
4. **Allow** reasonable time for a fix before public disclosure

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Fix Timeline**: Depends on severity

We appreciate responsible disclosure and will acknowledge your contribution in our release notes (unless you prefer to remain anonymous).

## 🔄 **Security Updates**

- **Container updates**: Rebuild Docker images when base images are updated
- **Dependency updates**: Keep npm packages updated via `npm audit` and Dependabot
- **Database maintenance**: Run `ANALYZE` and `VACUUM` regularly for optimal performance
- **Security patches**: Apply host system security updates

The postgres-mcp PostgreSQL MCP server is designed with **security-first principles** to protect your databases while maintaining excellent performance and full PostgreSQL capability.
