# Monitoring Tool Group Verification

## Strict Coverage Matrix

| Tool | Happy Path | Domain Error | Zod Empty Param / Type | Alias | Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `pg_database_size` | ✅ | N/A | N/A | N/A | N/A |
| `pg_table_sizes` | ✅ | ✅ (nonexistent schema) | ✅ (empty `{}` → defaults to 10, Antigravity uses 50) | N/A | ✅ |
| `pg_connection_stats` | ✅ | N/A | N/A | N/A | N/A |
| `pg_replication_status` | ✅ | N/A | N/A | N/A | N/A |
| `pg_server_version` | ✅ | N/A | N/A | N/A | N/A |
| `pg_show_settings` | ✅ | N/A | N/A | ✅ (`setting`, `name` aliases) | ✅ (limit=50 truncation metadata) |
| `pg_uptime` | ✅ | N/A | N/A | N/A | N/A |
| `pg_recovery_status` | ✅ | N/A | N/A | N/A | N/A |
| `pg_capacity_planning` | ✅ | N/A | N/A | ✅ (`days` alias) | N/A |
| `pg_resource_usage_analyze` | ✅ | ✅ (try/catch added) | N/A | N/A | N/A |
| `pg_alert_threshold_set` | ✅ | ✅ (`invalid_metric_xyz` → structured error) | N/A | N/A | N/A |

## Findings

### ❌ Bugs Fixed

1. **`pg_resource_usage_analyze` — Missing try/catch** (FIXED): The entire handler had no `try/catch`. Any DB error propagated as a raw MCP error frame rather than a structured `{success: false}` response. Added `formatHandlerErrorResponse` import and wrapped the handler in `try/catch`.

### ⚠️ Behavioral Notes (No Action Required)

2. **`pg_table_sizes` — Antigravity interface required `limit`**: The Antigravity tool binding marks `limit` as a required parameter (returning 50 rows by default when the interface sets it). This is a known Antigravity client-side binding behavior (documented in UNRELEASED.md lines 247-248 and 324); the server-side schema correctly defines `limit` as `.optional()` with a built-in handler default of 10. No fix needed.

3. **`pg_show_settings` — Default 50 settings without filter**: When no pattern is specified, the schema defaults `limit` to 50 (returning ~2493 tokens). This is by design — the default was intentionally set to 50 to prevent the full 416 settings from being returned. The `truncated: true` metadata communicates truncation correctly.

### ✅ All Tools Pass

- All 11 monitoring tools demonstrated operational parity
- P154 structured error compliance verified (domain errors, invalid metrics)
- Alias propagation verified: `setting`/`name` for `pg_show_settings`, `days` for `pg_capacity_planning`
- Split Schema boundary protection verified for all parametric tools
- `_meta.tokenEstimate` present on all responses
- Code Mode parity confirmed via `pg_execute_code`
