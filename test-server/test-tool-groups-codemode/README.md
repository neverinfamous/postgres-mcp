# Postgres-MCP Code Mode Testing Suite

**Directory Purpose**: This folder contains 28 self-contained, modular test prompts covering every tool group in `postgres-mcp`. These prompts are strictly designed for **Code Mode (`pg_execute_code`) validation only**.

## Agent Instructions

When tasked with running tests from this folder, adhere to the following optimized protocol:

### 1. Execution Strictness

- **Code Mode Exclusive**: Test tools ONLY using `pg_execute_code`. Do not use the terminal or standalone standard tools unless specifically requested.
- **Batching**: Group multiple method calls into a single JavaScript code execution script to save context window tokens and improve speed.
- **Failures Array Format**: Design your JS script to capture both expected outputs and caught errors, appending assertions to a `failures` array, and returning `{ failures, success: failures.length === 0 }`.

### 2. Validation Targets

- **Happy Path Parity**: Validate that Code Mode handler execution matches expected database behavior.
- **Structured Error Path**: Ensure domain errors (e.g. nonexistent table) return an object `{"success": false, "error": "..."}` instead of crashing or leaking raw MCP errors.
- **Zod Resilience**: Pass `{}` missing required parameters or invalid types, and verify that Zod errors are properly caught and formatted, rather than returning raw JSON arrays.
- **Payload Limits**: If a response payload is excessively large, report it as a 📦 Payload issue to optimize token usage.

### 3. Tracking Progress

You must maintain a **Strict Coverage Matrix** in `tmp/task.md` logging completion for:
`| Tool | Code Mode (Happy Path) | Code Mode (Domain Error/Zod Error) |`
Never proceed to the final step until every tool in a given group has both columns marked as ✅.

### 4. Cleanup

- Any write tests should operate on temporary tables or objects prefixed with `temp_` (e.g., `temp_users`).
- Your script should explicitly drop `temp_` objects at the end of execution.

## Tool Groups Available

1. `admin`
2. `backup`
3. `citext`
4. `core`
5. `cron`
6. `introspection`
7. `jsonb`
8. `kcache`
9. `ltree`
10. `migration`
11. `monitoring`
12. `partitioning`
13. `partman`
14. `performance`
15. `pgcrypto`
16. `postgis`
17. `schema`
18. `stats`
19. `text`
20. `transactions`
21. `vector`
22. `cross-group`

Execute these sequentially, updating the Changelog and resolving bugs systematically before moving to the next.

## Test Results

Token consumption metrics and final summaries from executing the above codemode tests are persisted in [`test-results.md`](./test-results.md).
