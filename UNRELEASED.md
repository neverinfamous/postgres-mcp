# Unreleased

## Added
- **Instruction Filter Alignment**: Server instructions now align with `--tool-filter` — only documentation for enabled tool groups is included in the MCP instructions sent to clients. Added `<!-- GROUP: -->` markers to `server-instructions.md`, rewrote generator script to emit per-group `INSTRUCTION_SECTIONS` Map, and updated `McpServer.ts` to use `generateInstructions(enabledTools)`. Reduces wasted tokens by filtering out documentation for disabled tool groups.
- **Integration Test**: Added `test-server/test-instruction-levels.mjs` to verify instruction filtering behavior.
