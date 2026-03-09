/**
 * postgres-mcp - Introspection & Migration Schema Parsing Benchmarks
 *
 * Measures parsing performance for introspection and migration input schemas,
 * covering z.preprocess transforms, alias resolution, coercion, and
 * validation failure rejection speed.
 *
 * Run: npm run bench
 */

import { describe, bench, vi } from "vitest";
import {
  DependencyGraphSchema,
  TopologicalSortSchema,
  CascadeSimulatorSchema,
  SchemaSnapshotSchema,
  ConstraintAnalysisSchema,
  MigrationRisksSchema,
  MigrationInitSchema,
  MigrationRecordSchema,
  MigrationApplySchema,
  MigrationRollbackSchema,
  MigrationHistorySchema,
  MigrationStatusSchema,
} from "../../adapters/postgresql/schemas/introspection.js";

// Suppress logger output
vi.mock("../../utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    notice: vi.fn(),
    critical: vi.fn(),
    alert: vi.fn(),
    emergency: vi.fn(),
    setLevel: vi.fn(),
    setMcpServer: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// 1. Simple Introspection Schemas (no transforms)
// ---------------------------------------------------------------------------
describe("Simple Introspection Schema Parsing", () => {
  bench(
    "DependencyGraphSchema.parse(defaults)",
    () => {
      DependencyGraphSchema.parse({});
    },
    { iterations: 5000, warmupIterations: 100 },
  );

  bench(
    "DependencyGraphSchema.parse(with schema)",
    () => {
      DependencyGraphSchema.parse({ schema: "public", includeRowCounts: true });
    },
    { iterations: 5000, warmupIterations: 100 },
  );

  bench(
    "TopologicalSortSchema.parse(create direction)",
    () => {
      TopologicalSortSchema.parse({ direction: "create" });
    },
    { iterations: 5000, warmupIterations: 100 },
  );

  bench(
    "MigrationInitSchema.parse(defaults)",
    () => {
      MigrationInitSchema.parse({});
    },
    { iterations: 5000, warmupIterations: 100 },
  );
});

// ---------------------------------------------------------------------------
// 2. Transform Schemas (z.preprocess with aliasing)
// ---------------------------------------------------------------------------
describe("Transform Schema Parsing (z.preprocess)", () => {
  bench(
    'CascadeSimulatorSchema.parse(string shorthand "users")',
    () => {
      CascadeSimulatorSchema.parse("users");
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "CascadeSimulatorSchema.parse(object with schema.table)",
    () => {
      CascadeSimulatorSchema.parse({ table: "public.orders", operation: "DELETE" });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "ConstraintAnalysisSchema.parse(with schema.table split)",
    () => {
      ConstraintAnalysisSchema.parse({ table: "public.users" });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationRisksSchema.parse(statement → statements alias)",
    () => {
      MigrationRisksSchema.parse({
        statement: "ALTER TABLE users ADD COLUMN bio TEXT",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationRisksSchema.parse(3 statements)",
    () => {
      MigrationRisksSchema.parse({
        statements: [
          "ALTER TABLE users ADD COLUMN bio TEXT",
          "DROP TABLE old_users",
          "CREATE INDEX CONCURRENTLY idx_bio ON users(bio)",
        ],
      });
    },
    { iterations: 2000, warmupIterations: 50 },
  );

  bench(
    "SchemaSnapshotSchema.parse(with sections + compact)",
    () => {
      SchemaSnapshotSchema.parse({
        sections: ["tables", "indexes", "constraints"],
        compact: true,
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );
});

// ---------------------------------------------------------------------------
// 3. Migration Tool Schemas (required fields + coercion)
// ---------------------------------------------------------------------------
describe("Migration Schema Parsing", () => {
  bench(
    "MigrationRecordSchema.parse(full payload)",
    () => {
      MigrationRecordSchema.parse({
        version: "1.0.0",
        description: "Add users table",
        migrationSql: "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT)",
        rollbackSql: "DROP TABLE users",
        sourceSystem: "agent",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationApplySchema.parse(minimal required)",
    () => {
      MigrationApplySchema.parse({
        version: "2.0.0",
        migrationSql: "ALTER TABLE users ADD COLUMN email TEXT",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationRollbackSchema.parse(by version)",
    () => {
      MigrationRollbackSchema.parse({ version: "1.0.0", dryRun: true });
    },
    { iterations: 5000, warmupIterations: 100 },
  );

  bench(
    "MigrationHistorySchema.parse(with coerced limit/offset)",
    () => {
      MigrationHistorySchema.parse({
        limit: "25",
        offset: "10",
        status: "applied",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationStatusSchema.parse(defaults)",
    () => {
      MigrationStatusSchema.parse({});
    },
    { iterations: 5000, warmupIterations: 100 },
  );
});

// ---------------------------------------------------------------------------
// 4. Validation Failure Paths
// ---------------------------------------------------------------------------
describe("Validation Failure Paths (Introspection & Migration)", () => {
  bench(
    "MigrationRecordSchema.safeParse(missing version)",
    () => {
      MigrationRecordSchema.safeParse({
        migrationSql: "CREATE TABLE test (id INT)",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationRecordSchema.safeParse(missing migrationSql)",
    () => {
      MigrationRecordSchema.safeParse({ version: "1.0.0" });
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationApplySchema.safeParse(empty object)",
    () => {
      MigrationApplySchema.safeParse({});
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "CascadeSimulatorSchema.safeParse(wrong type — number)",
    () => {
      CascadeSimulatorSchema.safeParse(42);
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "MigrationRisksSchema.safeParse(empty object)",
    () => {
      MigrationRisksSchema.safeParse({});
    },
    { iterations: 3000, warmupIterations: 50 },
  );

  bench(
    "ConstraintAnalysisSchema.safeParse(wrong param types)",
    () => {
      ConstraintAnalysisSchema.safeParse({
        table: 123,
        checks: "not-an-array",
      });
    },
    { iterations: 3000, warmupIterations: 50 },
  );
});
