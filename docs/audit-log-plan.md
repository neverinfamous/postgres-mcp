# Audit Log — Implementation Plan

> **Complexity:** Tier 3 — new subsystem with moderate integration surface (CLI args, tool dispatch hook, resource registration, types, tests). Low risk to existing code paths since the interceptor wraps the existing `registerTool()` callback without modifying tool handlers.

## Goal

Add a JSONL audit log to postgres-mcp that records all write/admin tool invocations with OAuth identity, tool name, parameters, duration, and outcome. This is Phase 1 of a two-phase plan — Phase 2 (pre-mutation backup linking) will be layered on after this is tested and stable.

No MCP server in the ecosystem currently ships an audit log. Combined with postgres-mcp's existing OAuth 2.1 identity layer, this gives teams forensic-grade visibility into **who** did **what** and **when**.

## Phased Approach

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** (this plan) | JSONL audit log, CLI flags, tool dispatch interception, `postgres://audit` resource | 🟡 Planning |
| **Phase 2** (future) | Pre-mutation backup linking, retention policy, restore-from-audit workflow | ⬜ Deferred |

Phase 2 builds cleanly on Phase 1 — the `AuditEntry` type will include an optional `backup` field from day one (always `undefined` in Phase 1), so wiring in backup linking later requires zero schema migration.

---

## Proposed Changes

### Audit Module

New module at `src/audit/` with 4 files:

#### [NEW] [types.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/audit/types.ts)

Audit event types and configuration:

```typescript
/** What category of operation was performed */
export type AuditCategory = 'write' | 'admin' | 'auth' | 'error';

/** Single audit log entry (one line of JSONL) */
export interface AuditEntry {
  timestamp: string;           // ISO 8601
  requestId: string;           // Correlates with RequestContext.requestId
  tool: string;                // Tool name (e.g., "pg_write_query")
  category: AuditCategory;     // write | admin | auth | error
  scope: string;               // Required OAuth scope for this tool
  user: string | null;         // OAuth sub claim (null if no OAuth)
  scopes: string[];            // All scopes on the token
  durationMs: number;          // Execution duration
  success: boolean;            // Whether the tool succeeded
  error?: string;              // Error message (if failed)
  args?: Record<string, unknown>; // Tool input (redacted in redact mode)
  backup?: string;             // Phase 2: path to pre-mutation backup
}

/** Audit log configuration */
export interface AuditConfig {
  enabled: boolean;            // Master switch
  logPath: string;             // Output file path
  redact: boolean;             // Redact args (log tool name only, no SQL/params)
  categories: AuditCategory[]; // Which categories to log (default: all)
}
```

#### [NEW] [logger.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/audit/logger.ts)

`AuditLogger` class — async buffered JSONL writer:

- Constructor takes `AuditConfig`
- `log(entry: AuditEntry): void` — non-blocking, appends to internal buffer
- Internal flush at configurable interval (100ms) or when buffer exceeds 50 entries
- `flush(): Promise<void>` — explicitly drain buffer (called on shutdown)
- `close(): Promise<void>` — flush + close file handle
- Uses `node:fs/promises` `appendFile` for writes (atomic per JSONL line)
- Creates parent directories if they don't exist (`mkdir -p` equivalent)
- Logs to stderr on write failure (never throws — audit must not break tool execution)

#### [NEW] [interceptor.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/audit/interceptor.ts)

Audit interception logic — a function that wraps tool execution:

```typescript
export function createAuditInterceptor(
  auditLogger: AuditLogger,
): AuditInterceptor {
  return {
    /** Called around tool execution. Returns the tool result unchanged. */
    async around<T>(
      toolName: string,
      args: unknown,
      requestId: string,
      fn: () => Promise<T>,
    ): Promise<T> {
      const scope = getRequiredScope(toolName);
      // Only audit write/admin scopes (skip read-only tools)
      if (scope === 'read') return fn();

      const authCtx = getAuthContext();
      const start = performance.now();
      let success = true;
      let error: string | undefined;

      try {
        return await fn();
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        throw err; // Re-throw — don't swallow errors
      } finally {
        const durationMs = Math.round(performance.now() - start);
        auditLogger.log({
          timestamp: new Date().toISOString(),
          requestId,
          tool: toolName,
          category: scope === 'admin' ? 'admin' : 'write',
          scope,
          user: authCtx?.claims?.sub ?? null,
          scopes: authCtx?.scopes ?? [],
          durationMs,
          success,
          error,
          args: auditLogger.config.redact ? undefined : (args as Record<string, unknown>),
        });
      }
    },
  };
}
```

#### [NEW] [index.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/audit/index.ts)

Barrel re-export.

---

### Integration Points

#### [MODIFY] [database-adapter.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/adapters/database-adapter.ts)

The key integration point. The `registerTool()` method's callback (line 228) already handles auth context and scope enforcement. The audit interceptor wraps the `tool.handler()` call:

```diff
- const result = await tool.handler(args, context);
+ const result = auditInterceptor
+   ? await auditInterceptor.around(tool.name, args, context.requestId, () => tool.handler(args, context))
+   : await tool.handler(args, context);
```

Changes:
- Add optional `auditInterceptor` field to `DatabaseAdapter` (set via setter method)
- Wrap `tool.handler()` call in the `registerTool()` callback
- ~10 lines changed total

#### [MODIFY] [mcp-server.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/server/mcp-server.ts)

- Add optional `auditConfig` to `ServerConfig`
- Create `AuditLogger` + `AuditInterceptor` if enabled
- Pass interceptor to adapter via setter before `registerComponents()`
- Register `postgres://audit` resource (see below)
- Call `auditLogger.close()` in `stop()`
- Extend `registerComponents()` log to include audit status

#### [MODIFY] [cli.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/cli.ts)

Add Commander options:
- `--audit-log <path>` — Enable audit logging to the specified file path
- `--audit-redact` — Redact tool arguments from audit entries

Environment variable support:
- `AUDIT_LOG_PATH` — Same as `--audit-log`
- `AUDIT_REDACT` — Same as `--audit-redact` (true/false)

#### [MODIFY] [args.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/cli/args.ts)

Add `auditLogPath` and `auditRedact` to `ParsedArgs` for test-only parser parity.

#### [MODIFY] [cli/server.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/cli/server.ts)

Pass audit config through to `ServerConfig` in both `startStdioServer()` and `startHttpServer()`.

---

### Resource: `postgres://audit`

#### [MODIFY] [mcp-server.ts](file:///C:/Users/chris/Desktop/postgres-mcp/src/server/mcp-server.ts)

Register a new resource `postgres://audit` that returns the most recent audit entries (tail of the JSONL file). Implementation:

- Reads last N lines of the audit log file (default 50)
- Returns as JSON array of `AuditEntry` objects
- Returns `{"entries": [], "message": "Audit logging not enabled"}` if audit is disabled
- Requires `admin` scope when OAuth is enabled

This gives agents read access to the audit trail without needing to parse files.

---

### Documentation & Changelog

#### [MODIFY] [README.md](file:///C:/Users/chris/Desktop/postgres-mcp/README.md)

- Add `--audit-log` and `--audit-redact` to CLI Reference table
- Add `AUDIT_LOG_PATH` and `AUDIT_REDACT` to Environment Variables table
- Add `postgres://audit` to Resources table (22 resources total)
- Brief mention in "What Sets Us Apart" feature table

#### [MODIFY] [UNRELEASED.md](file:///C:/Users/chris/Desktop/postgres-mcp/UNRELEASED.md)

```markdown
### Added
- Audit log: JSONL audit trail for write/admin operations with OAuth identity (`--audit-log <path>`)
- Audit redaction mode: `--audit-redact` to log tool names without arguments
- `postgres://audit` resource for agent-readable audit trail
```

#### [MODIFY] [code-map.md](file:///C:/Users/chris/Desktop/postgres-mcp/test-server/code-map.md)

Add `src/audit/` directory to the directory tree and describe the module.

---

## Verification Plan

### Unit Tests

#### [NEW] `src/audit/audit-logger.test.ts`

Test the `AuditLogger` class in isolation:

| Test | What it Validates |
|------|------------------|
| Writes JSONL entries to file | Basic file I/O, one JSON object per line |
| Buffers and flushes | Entries are batched, not written one-at-a-time |
| Handles missing parent directories | Auto-creates path |
| Redact mode omits args | `args` field is `undefined` when redact=true |
| `close()` flushes remaining buffer | No data loss on shutdown |
| Non-blocking on write errors | Logs to stderr, doesn't throw |

**Run command:**
```powershell
npx vitest run src/audit/audit-logger.test.ts --reporter=verbose
```

#### [NEW] `src/audit/audit-interceptor.test.ts`

Test the interceptor with mock auth context:

| Test | What it Validates |
|------|------------------|
| Skips read-only tools | `pg_read_query` produces no audit entry |
| Logs write tool execution | `pg_write_query` produces an entry with correct fields |
| Logs admin tool execution | `pg_execute_code` produces an entry with category=admin |
| Captures OAuth identity | `user` field populated from `AuthenticatedContext.claims.sub` |
| Handles null auth context | `user` is null when no OAuth |
| Captures errors | Failed tool produces entry with `success: false` and error message |
| Measures duration | `durationMs` is populated and > 0 |
| Re-throws errors | Interceptor does not swallow exceptions |

**Run command:**
```powershell
npx vitest run src/audit/audit-interceptor.test.ts --reporter=verbose
```

### Integration Tests

#### [NEW] `src/audit/audit-integration.test.ts`

Test the full flow with `DatabaseAdapter` + audit interceptor:

| Test | What it Validates |
|------|------------------|
| Audit entries written when adapter processes write tools | End-to-end: tool call → interceptor → JSONL file |
| CLI args parsed correctly | `--audit-log` and `--audit-redact` appear in `ParsedArgs` |
| Disabled by default | No audit file created when `--audit-log` is not specified |

**Run command:**
```powershell
npx vitest run src/audit/audit-integration.test.ts --reporter=verbose
```

### Existing Test Suite

Run the full existing test suite to verify no regressions:

```powershell
npx vitest run --reporter=verbose
```

### Build Verification

```powershell
npm run lint && npm run typecheck
```

### Manual / User Verification

After implementation, Chris can verify by:

1. Starting the server with `--audit-log ./audit.jsonl --transport stdio`
2. Performing a write operation (e.g., `pg_write_query`)
3. Checking that `audit.jsonl` contains a JSONL entry with the correct fields
4. Starting with `--audit-redact` and verifying `args` is absent from entries

---

## Design Decisions

1. **JSONL over SQLite/DB** — The audit log must work without additional dependencies and be parseable by agents, `jq`, and log aggregators. JSONL is append-only, rotation-friendly, and human-readable.

2. **Intercept at `registerTool()`, not per-handler** — This keeps all 245 tool handlers untouched. The interceptor wraps the handler callback in `database-adapter.ts`, the single dispatch point. Zero per-handler changes.

3. **Non-blocking writes** — Audit logging must never slow down tool execution. The buffer+flush pattern ensures this. If the filesystem is slow, entries queue in memory.

4. **Off by default** — The `--audit-log` flag is opt-in. When not specified, the audit system has zero runtime cost (no interceptor created, no file handles opened).

5. **Phase 2 field reserved** — `AuditEntry.backup` is typed but always `undefined` in Phase 1. This means Phase 2 (backup linking) won't require schema changes to the JSONL format.

6. **Scope-based filtering** — Only `write` and `admin` scoped tools are logged. Read-only tools (`pg_read_query`, `pg_list_tables`, etc.) are skipped to keep the log focused and manageable.
