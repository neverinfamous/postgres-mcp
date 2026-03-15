# Unreleased

## Added
- **Help Resource Architecture**: Replaced monolithic `ServerInstructions.ts` (72KB) with 22 per-group `.md` files under `src/constants/server-instructions/`. Slim ~600 char instructions field points agents to `postgres://help` resources for on-demand reference. `McpServer.ts` registers `postgres://help` (always) + `postgres://help/{group}` filtered by `--tool-filter`. Supersedes instruction filter alignment.
- **Agent Experience Test**: Added `test-server/test-agent-experience.md` with 9 passes (37 scenarios) covering all tool groups with explicit tool group annotations.
- **Integration Test**: Added `test-server/test-instruction-levels.mjs` to verify instruction filtering behavior.
