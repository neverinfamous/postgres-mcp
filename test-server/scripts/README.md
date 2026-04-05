# test-server/scripts

Standalone integration test scripts that validate server behavior by spawning
`node dist/cli.js` as a child process, sending JSON-RPC over stdio, and
asserting on the responses. These are **not** part of the Vitest or Playwright
suites — they run directly with `node`.

## Prerequisites

1. **Build first** — scripts run against `dist/cli.js`:
   ```bash
   npm run build
   ```
2. **PostgreSQL running** on `127.0.0.1:5432` (Docker compose file:
   `docs/datadog-monitoring/database-containers/postgres-with-logs.yml`).
3. **No env vars required** — scripts default to
   `postgres:postgres@127.0.0.1:5432/postgres`. Override with
   `POSTGRES_CONNECTION_STRING` or individual `POSTGRES_*` / `PG*` vars.

## Scripts

| Script                         | What it tests                                               | Pass criteria                                                   |
| ------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `test-filter-instructions.mjs` | `--tool-filter` × `--instruction-level` matrix (8 configs)  | Instruction sections present/absent per config                  |
| `test-instruction-levels.mjs`  | `essential` ≤ `standard` ≤ `full` ordering + section checks | Char counts monotonically increase; sections gated correctly    |
| `test-prompts.mjs`             | `prompts/list` + `prompts/get` for all 20 prompts           | All 24 test cases return valid `messages` with expected content |
| `test-tool-annotations.mjs`    | `tools/list` annotation coverage                            | All 248 tools have `annotations` with `openWorldHint` set       |

## Running

```bash
# Individual
node test-server/scripts/test-filter-instructions.mjs
node test-server/scripts/test-instruction-levels.mjs
node test-server/scripts/test-prompts.mjs
node test-server/scripts/test-tool-annotations.mjs

# All at once
for f in test-server/scripts/test-*.mjs; do echo "=== $f ===" && node "$f" || exit 1; done
```

Exit code `0` = all passed, `1` = failures.

## Architecture

Each script follows the same pattern:

```
┌─────────────┐    spawn     ┌──────────────┐
│  test-*.mjs │ ──────────── │ dist/cli.js  │
│  (parent)   │   stdio      │  (child)     │
└──────┬──────┘              └──────┬───────┘
       │  stdin: JSON-RPC          │
       │  ← stdout: JSON-RPC      │
       │  (stderr: suppressed)     │
       └───────────────────────────┘
```

1. Set `POSTGRES_*` env vars (inherited by child via `process.env`)
2. Spawn `node dist/cli.js` with optional `--tool-filter` / `--instruction-level`
3. Send `initialize` JSON-RPC request over stdin
4. Parse `initialize` response from stdout (buffered line-by-line)
5. Extract `serverInfo.instructions` or send follow-up RPCs (`prompts/get`, `tools/list`)
6. Assert on response shape/content, kill child, report results

**Key implementation detail**: `PROJECT_DIR` / `projectDir` resolves two levels
up (`resolve(__dirname, '..', '..')`) because scripts live in
`test-server/scripts/`, not `test-server/`.

## Env Var Resolution

Scripts use `||` (not `??`) for env var fallbacks to handle empty strings that
Windows shells may inject:

```javascript
process.env.POSTGRES_PASSWORD =
  process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || "postgres";
process.env.POSTGRES_HOST =
  process.env.POSTGRES_HOST || process.env.PGHOST || "127.0.0.1";
```

The CLI (`src/cli/config.ts`) checks `PGHOST` → `POSTGRES_HOST` → `'localhost'`,
but these scripts explicitly set `POSTGRES_HOST` to `127.0.0.1` to ensure
reliable Docker connectivity on all platforms.

## Failure Modes

| Symptom                                              | Cause                                       | Fix                                                          |
| ---------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `Timeout` or `Server exited prematurely with code 1` | PostgreSQL not running or wrong credentials | Start the Docker container; check port 5432                  |
| `MODULE_NOT_FOUND: dist/cli.js`                      | Stale build or wrong `PROJECT_DIR`          | Run `npm run build`; verify `resolve(__dirname, '..', '..')` |
| `client password must be a string`                   | Empty `POSTGRES_PASSWORD` env var           | Ensure env block uses `\|\|` not `??`                        |

## Relationship to Other Test Suites

- **Vitest** (`npm run test`): Unit/integration tests using PGLite in-memory DB.
  Does not test CLI spawning or instruction generation.
- **Playwright** (`npm run test:e2e`): E2E tests via HTTP transport with
  `--postgres` connection string. Tests tool execution, payloads, auth, sessions.
- **These scripts**: CLI stdio integration tests. Validate instruction filtering,
  prompt serving, and annotation coverage — things only testable via the real
  CLI entry point.
