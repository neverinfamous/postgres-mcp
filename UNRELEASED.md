# Unreleased

## Added
- **Help Resource Architecture**: Replaced monolithic `ServerInstructions.ts` (72KB) with 22 per-group `.md` files under `src/constants/server-instructions/`. Slim ~600 char instructions field points agents to `postgres://help` resources for on-demand reference. `McpServer.ts` registers `postgres://help` (always) + `postgres://help/{group}` filtered by `--tool-filter`. Supersedes instruction filter alignment.
- **Agent Experience Test**: Added `test-server/test-agent-experience.md` with 9 passes (37 scenarios) covering all tool groups with explicit tool group annotations.
- **Integration Test**: Added `test-server/test-instruction-levels.mjs` to verify instruction filtering behavior.

### Changed
- **Modularization**: Split 8 files exceeding 500-line limit into focused sub-modules:
  - `server.ts` (690→~420) → extracted `streamable.ts`, `stateless.ts`, `legacy-sse.ts`
  - `PostgresAdapter.ts` (674→~480) → extracted `transaction-operations.ts`
  - `partman/maintenance.ts` (632) → split into `retention.ts` + `health-analysis.ts`
  - `citext/analysis.ts` (611) → split into `list-compare.ts` + `candidates-advisor.ts`
  - `schemas/introspection.ts` (602) → split into `introspection/input.ts` + `output.ts`
  - `tools/admin.ts` (599) → split into `admin/vacuum-tools.ts` + `backend-tools.ts` + `config-tools.ts`
  - `schemas/index.ts` (555→8) → split into `core-exports.ts` + `extension-exports.ts`
  - `tools/core/schemas.ts` (559→8) → split into `schemas/input.ts` + `schemas/output.ts`
  - `schemas/jsonb/basic.ts` (587→~420) → extracted `utils.ts` (path normalization, preprocessing)
  - `schemas/postgis/basic.ts` (575→~430) → extracted `utils.ts` (preprocessing, coordinate helpers)
  - `schemas/postgis/advanced.ts` (535→~218) → extracted `output.ts` (16 output schemas)
  - `schemas/partman.ts` (577) → promoted to `partman/` directory with `input.ts` + `output.ts` + `index.ts`
  - `schemas/vector.ts` (529) → promoted to `vector/` directory with `input.ts` + `output.ts` + `index.ts`
  - `schemas/partitioning/range.ts` (545→~350) → extracted `preprocess.ts` (alias resolution, bounds construction)
  - `tools/monitoring/analysis.ts` (547) → split into `capacity-planning.ts` + `resource-usage.ts` + `alert-thresholds.ts`
  - `tools/jsonb/write.ts` (549→~360) → extracted `write-builders.ts` (object, array, stripNulls)
- **Naming conventions**: Renamed 12 source + 9 test PascalCase files to kebab-case (`DatabaseAdapter.ts` → `database-adapter.ts`, `PostgresAdapter.ts` → `postgres-adapter.ts`, `McpServer.ts` → `mcp-server.ts`, etc.). Updated all import paths across ~80 files.

### Fixed
- **Test imports**: Fixed stale import paths in `admin.test.ts`, `security-injection.test.ts` (admin split), `http.test.ts` (HTTP transport function extraction), and `schemas.test.ts` (partman/vector directory promotion)
