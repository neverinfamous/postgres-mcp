# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it by emailing **admin@adamic.tech**.

**Please do NOT report security vulnerabilities through public GitHub issues.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution**: Depends on severity and complexity

### What to Expect

1. Acknowledgment of your report
2. Assessment of the vulnerability
3. Development of a fix
4. Coordinated disclosure (if applicable)
5. Credit in the release notes (unless you prefer anonymity)

## Security Controls

### SQL Injection Prevention

**Identifier Sanitization** (`src/utils/identifiers.ts`)

- All table, column, schema, and index names are validated and quoted across all tool groups (admin, backup, core, jsonb, monitoring, partitioning, performance, postgis, schema, stats, text, vector)
- PostgreSQL identifier rules enforced: start with letter/underscore, contain only alphanumerics, underscores, or $ signs
- Maximum 63-character limit enforced
- Invalid identifiers throw `InvalidIdentifierError`

Key functions:

- `sanitizeIdentifier(name)` — Validates and double-quotes an identifier
- `sanitizeTableName(table, schema?)` — Handles schema-qualified table references
- `sanitizeColumnRef(column, table?)` — Handles column references with optional table qualifier
- `sanitizeIdentifiers(names[])` — Batch sanitization for column lists

**Parameterized Queries**

- All user-provided values use parameterized queries via `pg` library
- Identifier sanitization complements parameterized values

### HTTP Transport Security

**Rate Limiting** (enabled by default)

- 100 requests per minute per IP address
- Configurable via `rateLimitMaxRequests` and `rateLimitWindowMs`
- Returns `429 Too Many Requests` when exceeded

> **Reverse Proxy Note:** Rate limiting uses `req.socket.remoteAddress`. Behind a reverse proxy (e.g., nginx, Cloudflare Tunnel), all requests may share the same source IP. Ensure your proxy forwards distinct client IPs, or apply rate limiting at the proxy layer instead.

**Request Body Limits**

- Maximum 1MB request body (configurable via `maxBodySize`)
- Prevents memory exhaustion attacks

**Security Headers**

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Cache-Control: no-store, no-cache, must-revalidate`
- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Referrer-Policy: no-referrer`

**HSTS Support**

- Optional `Strict-Transport-Security` header for HTTPS deployments
- Enable via `enableHSTS: true` configuration

**CORS Configuration**

- Origin whitelist with `Vary: Origin` header for caching
- Optional credentials support (`corsAllowCredentials`)
- MCP-specific headers allowed (`X-Session-ID`, `mcp-session-id`)

### Authentication (OAuth 2.1)

- RFC 9728 Protected Resource Metadata at `/.well-known/oauth-protected-resource`
- RFC 8414 Authorization Server Metadata discovery
- JWT token validation with JWKS caching (TTL: 1 hour, configurable)
- PostgreSQL-specific scopes: `read`, `write`, `admin`, `full`, `db:{name}`, `schema:{name}`, `table:{schema}:{table}`
- Per-tool scope enforcement via `AsyncLocalStorage` context threading

> **⚠️ HTTP without OAuth:** When OAuth is not configured, all scope checks are bypassed. If you expose the HTTP transport without enabling OAuth, any client has full unrestricted access. Always enable OAuth for production HTTP deployments.

### Code Mode Sandbox Boundaries

Code Mode executes user-provided JavaScript in a Node.js `vm` context. The `vm` module provides **script isolation, not security isolation** — it is not designed to resist a determined attacker with direct access. The following defense-in-depth mitigations significantly reduce risk within the intended **trusted AI agent** threat model:

- **Blocked globals** — `require`, `process`, `global`, `globalThis`, `module`, `exports`, `setTimeout`, `setInterval`, `setImmediate`, `Proxy` set to `undefined`
- **Blocked patterns** — 17 static regex rules reject code containing `require()`, `import()`, `eval()`, `Function()`, `__proto__`, `constructor.constructor`, `Reflect.*`, `Symbol.*`, `new Proxy()`, and filesystem/network/child_process references
- **Execution limits** — 30s timeout (configurable), 50KB code input, 10MB result output
- **Rate limiting** — 60 executions per minute per client
- **Audit logging** — Every execution logged with UUID, client ID, metrics, and code preview (truncated to 200 chars)
- **Admin scope** — Code Mode requires `admin` scope when OAuth is enabled

> **⚠️ Threat Model:** Code Mode is designed for use by **trusted AI agents**, not for executing arbitrary untrusted code from end users. The `vm` module does not provide a true security boundary — a sufficiently determined attacker with direct access could potentially escape the sandbox (e.g., via fragmented `constructor` chain access on exposed built-in Error types). Static pattern blocking catches the known literal forms (`constructor.constructor`) but not dynamically constructed variants.
>
> **For untrusted input deployments:** Use process-level sandboxing such as running the container with `--cap-drop=ALL`, or replace `vm` with `isolated-vm` for V8 isolate-level separation.

### Logging Security

**Credential Redaction**

- Sensitive fields automatically redacted in logs: `password`, `secret`, `token`, `apikey`, `issuer`, `audience`, `jwksUri`, `credentials`, etc.
- Recursive sanitization for nested objects

**Log Injection Prevention**

- Control character sanitization (ASCII 0x00-0x1F except tab/newline, 0x7F, C1 characters)
- Prevents log forging and escape sequence attacks

## Security Best Practices

When using postgres-mcp:

- Never commit database credentials to version control
- Use environment variables for sensitive configuration
- Restrict database user permissions to minimum required
- Keep dependencies updated (Dependabot is configured for weekly npm and GitHub Actions updates)
- Enable SSL for database connections in production (`--ssl` or `ssl=true` in connection string)
- Use OAuth 2.1 authentication for HTTP transport in production — never expose HTTP transport without OAuth
- Enable HSTS when running over HTTPS (`--enableHSTS`)
- Configure CORS origins explicitly (avoid wildcards)
- For cloud-managed databases with IAM authentication (e.g., AWS RDS), set `POSTGRES_POOL_MIN=2` to reduce connection establishment latency
- Consider SHA-pinning critical GitHub Actions in CI workflows for supply-chain defense-in-depth
- When deploying behind a reverse proxy, apply rate limiting at the proxy layer rather than relying solely on the built-in per-IP rate limiter
