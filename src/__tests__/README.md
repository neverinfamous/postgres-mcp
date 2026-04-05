# PostgreSQL MCP Unit Tests (Vitest)

**Agent & Token Optimized Context**
This directory and co-located `__tests__` directories contain unit and integration tests.

## 🔎 Key Architecture

- **Framework**: Vitest (`vitest`)
- **Location Pattern**:
  - `src/__tests__/`: Core module tests (mocks, benchmarks, schemas, tools)
  - `src/**/__tests__/`: Co-located unit tests (e.g., `src/adapters/postgresql/tools/__tests__/`)
- **Coverage**: Handled by V8 provider.

## 🚀 Commands

- **Run all tests**: `npm run test`
- **Run single file**: `vitest run <path-to-file>` (e.g., `vitest run src/adapters/postgresql/tools/__tests__/security-injection.test.ts`)
- **Re-run on failure**: Use `vitest` in watch mode or `npm run test` repeatedly while iterating.

## 🧠 Agent Guidelines & Patterns

1. **Mock Everything Network-Related**:
   - Use `createMockPostgresAdapter` from `src/__tests__/mocks/index.js` for simulating the DB layer.
   - Use `createMockRequestContext` for simulating MCP tool invocation context.
2. **Deterministic Imports**:
   - Prefer static top-level imports for tools (e.g., `import { getAdminTools } from "../admin/index.js";`) rather than dynamic imports within test blocks to prevent timeout flakiness.
3. **Vitest Output limits**:
   - When debugging failing tests, ensure `OutputCharacterCount` is large enough (`>= 10000`) to see the failure summary at the bottom, not just the early stdout chunks.
4. **Security Tests**:
   - Files like `security-injection.test.ts` rigorously enforce anti-SQL-injection rules. Ensure any new vector/feature tests include corresponding security edge-case checks.

## 🏗️ Typical Mock Setup

```typescript
import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("Tool Name", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
  });
});
```
