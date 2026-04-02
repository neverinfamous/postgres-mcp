# Postgres-MCP Standard Testing Suite

**Directory Purpose**: This folder contains 27 self-contained, modular test prompts covering every tool group in `postgres-mcp`. Unlike the `test-tool-groups-codemode.md` directory, these prompts are strictly designed for **Direct MCP Tool Call validation**.

## Agent Instructions

When tasked with running tests from this folder, adhere to the following optimized protocol:

### 1. Execution Strictness
- **Direct Calls Exclusive**: Test tools ONLY using direct MCP tool calls (e.g., calling `mcp_postgres_pg_vacuum`). Do not use Code Mode (`pg_execute_code`) or scripts to batch the tests.
- **No Scripted Loops**: Each happy and error path must be tested individually with a distinct tool call. This simulates exact client interaction behavior.

### 2. Validation Targets
- **Happy Path Consistency**: Validate that each tool outputs exactly what is expected from the explicit checklist items given in the prompt.
- **Structured Error Path (P154)**: Ensure domain errors (e.g., nonexistent table) return an object `{"success": false, "error": "..."}`. A raw MCP error indicates a missing try/catch in the handler.
- **Zod Exceptions**: Pass `{}` missing required parameters or invalid types. The error string must not be a raw JSON array but must be cleaned up by the handler's error formatter.
- **Payload Limits**: Watch for payload bloat and explicitly log it as a 📦 warning if it risks overflowing context window token limits.

### 3. Tracking Metrics & Progress
- **Strict Coverage Matrix**: You must maintain a table tracking your progress in `tmp/task.md` logging completion for:
`| Tool | Direct Call (Happy Path) | Domain Error | Zod Empty Param | Alias Acceptance |`
Never proceed to the final step until every tool in a given group is fully checked off.
- **Session Token Usage**: Use `read_resource` on `postgres://audit` at the end of your test group to capture the total `sessionTokenEstimate` and log it in your summaries.

### 4. Cleanup & Scope
- Direct write tests should operate on temporary tables or objects prefixed with `temp_`.
- When completed, explicitly drop all `temp_` artifacts.
- Update `code-map.md`, handlers, and instructions if bugs are uncovered, then update the Changelog with fixes before summarizing your work.

## Execution

Begin with any requested group prompt from this folder (e.g. `test-tool-group-admin.md`), and execute the deterministic checklist line-by-line using direct tool calls only.
