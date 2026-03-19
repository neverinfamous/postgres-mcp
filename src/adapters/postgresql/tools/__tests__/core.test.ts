/**
 * postgres-mcp - Core Tools Unit Tests
 *
 * Tests for parsePostgresError() error mapping helper
 * in the core tool group.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parsePostgresError } from "../core/error-helpers.js";

/**
 * Helper to create a mock PostgreSQL error with a code property.
 */
function makePgError(message: string, code?: string): Error {
  const err = new Error(message);
  if (code) {
    (err as unknown as Record<string, unknown>)["code"] = code;
  }
  return err;
}

describe("parsePostgresError", () => {
  // ── 42704 + schema message ──────────────────────────────────────────
  it("should throw schema-specific error for 42704 with schema message", () => {
    const err = makePgError('schema "fake_schema" does not exist', "42704");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_table",
        table: "test",
        schema: "fake_schema",
      }),
    ).toThrow(
      "Schema 'fake_schema' does not exist. Create it with pg_create_schema or use pg_list_schemas to see available schemas.",
    );
  });

  it("should extract schema name from message even without context", () => {
    const err = makePgError('schema "my_schema" does not exist', "42704");
    expect(() => parsePostgresError(err, { tool: "pg_create_table" })).toThrow(
      "Schema 'my_schema' does not exist.",
    );
  });

  // ── 42704 + pg_drop_table ───────────────────────────────────────────
  it("should throw table-specific error for pg_drop_table", () => {
    const err = makePgError(
      'table "nonexistent_table" does not exist',
      "42704",
    );
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_drop_table",
        table: "nonexistent_table",
        schema: "public",
      }),
    ).toThrow(
      "Table 'public.nonexistent_table' not found. Use ifExists: true to avoid this error, or pg_list_tables to verify.",
    );
  });

  it("should default to public schema for pg_drop_table when schema not provided", () => {
    const err = makePgError('table "some_table" does not exist', "42704");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_drop_table",
        table: "some_table",
      }),
    ).toThrow("Table 'public.some_table' not found.");
  });

  // ── 42704 + pg_drop_index ───────────────────────────────────────────
  it("should throw index-specific error for pg_drop_index", () => {
    const err = makePgError('index "idx_test" does not exist', "42704");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_drop_index",
        index: "idx_test",
      }),
    ).toThrow(
      "Index 'idx_test' not found. Use ifExists: true to avoid this error, or pg_get_indexes to see available indexes.",
    );
  });

  // ── 42704 + tsvector function signature ──────────────────────────────
  it("should throw tsvector-specific error for function signature with tsvector", () => {
    const err = makePgError(
      "function to_tsvector(unknown, tsvector) does not exist",
      "42704",
    );
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_text_search",
        table: "test_articles",
      }),
    ).toThrow(
      "Column appears to be a tsvector type, which cannot be used directly with text search tools.",
    );
  });

  // ── 42704 generic fallback ──────────────────────────────────────────
  it("should throw generic error for 42704 with unknown tool", () => {
    const err = makePgError('"some_object" does not exist', "42704");
    expect(() => parsePostgresError(err, { tool: "pg_something" })).toThrow(
      "Object 'some_object' not found. Use ifExists: true to avoid this error.",
    );
  });

  // ── 42P01 — relation does not exist ─────────────────────────────────
  it("should throw table/view not found for 42P01", () => {
    const err = makePgError('relation "missing_table" does not exist', "42P01");
    expect(() => parsePostgresError(err, { tool: "pg_read_query" })).toThrow(
      "Table or view 'missing_table' not found. Use pg_list_tables to see available tables.",
    );
  });

  // ── 42P07 — duplicate relation ──────────────────────────────────────
  it("should throw index already exists for pg_create_index", () => {
    const err = makePgError(
      'relation "idx_users_email" already exists',
      "42P07",
    );
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_index",
        index: "idx_users_email",
      }),
    ).toThrow(
      "Index 'idx_users_email' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  it("should throw index already exists for pg_vector_create_index", () => {
    const err = makePgError(
      'relation "idx_temp_vec_hnsw" already exists',
      "42P07",
    );
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_vector_create_index",
      }),
    ).toThrow(
      "Index 'idx_temp_vec_hnsw' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  it("should infer index from idx_ prefix even without tool context", () => {
    const err = makePgError('relation "idx_my_index" already exists', "42P07");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_something",
      }),
    ).toThrow(
      "Index 'idx_my_index' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  it("should throw table already exists for pg_create_table", () => {
    const err = makePgError('relation "users" already exists', "42P07");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_table",
        table: "users",
      }),
    ).toThrow(
      "Table 'users' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  // ── 42P06 — duplicate schema ────────────────────────────────────────
  it("should throw schema already exists for 42P06", () => {
    const err = makePgError('schema "test_schema" already exists', "42P06");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_schema",
        schema: "test_schema",
      }),
    ).toThrow(
      "Schema 'test_schema' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  // ── 42P07 with objectType context ───────────────────────────────────
  it("should throw sequence already exists for pg_create_sequence with objectType", () => {
    const err = makePgError('relation "test_seq" already exists', "42P07");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_sequence",
        objectType: "sequence",
      }),
    ).toThrow(
      "Sequence 'test_seq' already exists. Use ifNotExists: true to skip if it exists.",
    );
  });

  it("should throw view already exists for pg_create_view with objectType", () => {
    const err = makePgError('relation "test_view" already exists', "42P07");
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_create_view",
        objectType: "view",
      }),
    ).toThrow(
      "View 'test_view' already exists. Use orReplace: true to replace it.",
    );
  });

  // ── 3F000 — invalid schema name ─────────────────────────────────────
  it("should throw schema error for 3F000 with schema message", () => {
    // When PG throws 3F000 with "schema X does not exist", the 42704 regex
    // (/does not exist/) catches it first, routing to the schema-specific branch
    const err = makePgError('schema "bad_schema" does not exist', "3F000");
    expect(() =>
      parsePostgresError(err, { tool: "pg_read_query", schema: "bad_schema" }),
    ).toThrow(
      "Schema 'bad_schema' does not exist. Create it with pg_create_schema or use pg_list_schemas to see available schemas.",
    );
  });

  it("should throw schema error for 3F000 code without regex match", () => {
    // Pure 3F000 code path (message doesn't trigger the 42704 regex)
    const err = makePgError("invalid schema name", "3F000");
    expect(() =>
      parsePostgresError(err, { tool: "pg_read_query", schema: "bad" }),
    ).toThrow(
      "Schema 'bad' does not exist. Use pg_list_objects with type 'table' to see available schemas.",
    );
  });

  // ── Non-PG error ────────────────────────────────────────────────────
  it("should re-throw non-PG errors unchanged", () => {
    const err = new Error("ECONNREFUSED");
    expect(() => parsePostgresError(err, { tool: "pg_read_query" })).toThrow(
      err,
    );
  });

  // ── Non-Error thrown ────────────────────────────────────────────────
  it("should re-throw non-Error values unchanged", () => {
    expect(() =>
      parsePostgresError("string error" as unknown, { tool: "pg_read_query" }),
    ).toThrow();
  });
});

// ==========================================================================
// Coverage-targeted tests for core/schemas.ts preprocessing branches
// ==========================================================================

import {
  ListObjectsSchema,
  ObjectDetailsSchema,
  AnalyzeQueryIndexesSchema,
  AnalyzeDbHealthSchema,
  AnalyzeWorkloadIndexesSchema,
} from "../core/schemas/index.js";

describe("ListObjectsSchema — preprocess branches", () => {
  it("should convert 'type' string to 'types' array", () => {
    const parsed = ListObjectsSchema.parse({ type: "table" });
    expect(parsed.types).toEqual(["table"]);
  });

  it("should pass through 'type' array to 'types'", () => {
    const parsed = ListObjectsSchema.parse({ type: ["table", "view"] });
    expect(parsed.types).toEqual(["table", "view"]);
  });

  it("should wrap single 'types' string in array", () => {
    const parsed = ListObjectsSchema.parse({ types: "table" as unknown });
    expect(parsed.types).toEqual(["table"]);
  });

  it("should not overwrite 'types' if already defined", () => {
    const parsed = ListObjectsSchema.parse({
      types: ["view"],
      type: "table",
    });
    // types is already defined, so type alias is ignored
    expect(parsed.types).toEqual(["view"]);
  });

  it("should handle undefined input (defaultToEmpty)", () => {
    const parsed = ListObjectsSchema.parse(undefined);
    expect(parsed).toBeDefined();
    expect(parsed.types).toBeUndefined();
  });

  it("should handle null input (defaultToEmpty)", () => {
    const parsed = ListObjectsSchema.parse(null);
    expect(parsed).toBeDefined();
  });
});

describe("ObjectDetailsSchema — preprocess branches", () => {
  it("should resolve 'table' alias to 'name'", () => {
    const parsed = ObjectDetailsSchema.parse({ table: "users" });
    expect(parsed.name).toBe("users");
  });

  it("should resolve 'object' alias to 'name'", () => {
    const parsed = ObjectDetailsSchema.parse({ object: "users" });
    expect(parsed.name).toBe("users");
  });

  it("should resolve 'objectName' alias to 'name'", () => {
    const parsed = ObjectDetailsSchema.parse({ objectName: "users" });
    expect(parsed.name).toBe("users");
  });

  it("should parse schema.table format from 'name'", () => {
    const parsed = ObjectDetailsSchema.parse({ name: "myschema.users" });
    expect(parsed.name).toBe("users");
    expect(parsed.schema).toBe("myschema");
  });

  it("should NOT parse schema.table if schema is explicitly provided", () => {
    const parsed = ObjectDetailsSchema.parse({
      name: "myschema.users",
      schema: "custom",
    });
    // schema is already set, so name stays intact
    expect(parsed.name).toBe("myschema.users");
    expect(parsed.schema).toBe("custom");
  });

  it("should normalize type to lowercase", () => {
    const parsed = ObjectDetailsSchema.parse({
      name: "users",
      type: "TABLE" as "table",
    });
    expect(parsed.type).toBe("table");
  });

  it("should resolve objectType as alias for type", () => {
    const parsed = ObjectDetailsSchema.parse({
      name: "users",
      objectType: "VIEW" as "view",
    });
    expect(parsed.type).toBe("view");
  });

  it("should fail refinement when no name variant is provided", () => {
    expect(() => ObjectDetailsSchema.parse({})).toThrow(
      "name (or object/objectName/table alias) is required",
    );
  });

  it("should handle null input via preprocess", () => {
    // null → {} via defaultToEmpty, then fails name refine
    expect(() => ObjectDetailsSchema.parse(null)).toThrow("required");
  });
});

describe("AnalyzeQueryIndexesSchema — preprocess branches", () => {
  it("should resolve 'query' alias to 'sql'", () => {
    const parsed = AnalyzeQueryIndexesSchema.parse({
      query: "SELECT * FROM users",
    });
    expect(parsed.sql).toBe("SELECT * FROM users");
  });

  it("should default verbosity to 'summary'", () => {
    const parsed = AnalyzeQueryIndexesSchema.parse({
      sql: "SELECT 1",
    });
    expect(parsed.verbosity).toBe("summary");
  });

  it("should fail refinement when neither sql nor query is provided", () => {
    expect(() => AnalyzeQueryIndexesSchema.parse({})).toThrow(
      "sql (or query alias) is required",
    );
  });
});

describe("AnalyzeDbHealthSchema — preprocess branches", () => {
  it("should handle undefined input (defaultToEmpty)", () => {
    const parsed = AnalyzeDbHealthSchema.parse(undefined);
    expect(parsed).toBeDefined();
  });
});

describe("AnalyzeWorkloadIndexesSchema — preprocess branches", () => {
  it("should handle undefined input (defaultToEmpty)", () => {
    const parsed = AnalyzeWorkloadIndexesSchema.parse(undefined);
    expect(parsed).toBeDefined();
  });
});

// ==========================================================================
// Coverage-targeted tests for core/convenience.ts alias branches
// ==========================================================================

import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import { getCoreTools } from "../core/index.js";

describe("core/convenience.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  it("pg_count should resolve 'name' alias for table", async () => {
    // Schema exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // COUNT result
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 42 }],
    });

    const tool = findTool("pg_count")!;
    const result = (await tool.handler({ name: "users" }, mockContext)) as {
      count: number;
    };

    expect(result.count).toBe(42);
  });

  it("pg_count should resolve 'condition' alias for where", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 10 }],
    });

    const tool = findTool("pg_count")!;
    const result = (await tool.handler(
      { table: "users", condition: "active = true" },
      mockContext,
    )) as { count: number };

    expect(result.count).toBe(10);
  });

  it("pg_count should resolve 'filter' alias for where", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 5 }],
    });

    const tool = findTool("pg_count")!;
    const result = (await tool.handler(
      { table: "users", filter: "status = 'active'" },
      mockContext,
    )) as { count: number };

    expect(result.count).toBe(5);
  });

  it("pg_count should parse schema.table format", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ count: 100 }],
    });

    const tool = findTool("pg_count")!;
    const result = (await tool.handler(
      { table: "myschema.users" },
      mockContext,
    )) as { count: number };

    expect(result.count).toBe(100);
  });

  it("pg_exists should resolve 'condition' alias for where", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ exists: true }],
    });

    const tool = findTool("pg_exists")!;
    const result = (await tool.handler(
      { table: "users", condition: "id = 1" },
      mockContext,
    )) as { exists: boolean; mode: string };

    expect(result.exists).toBe(true);
    expect(result.mode).toBe("filtered");
  });

  it("pg_upsert should use DO NOTHING when all data columns are conflict columns", async () => {
    // Schema exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // Upsert returns with xmax=0 (insert)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ _xmax: "0" }],
      rowsAffected: 1,
    });

    const tool = findTool("pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "tags",
        data: { name: "important" },
        conflictColumns: ["name"],
      },
      mockContext,
    )) as { success: boolean; operation: string };

    expect(result.success).toBe(true);
    // The upsert SQL should contain DO NOTHING since name is both data and conflict
    const sql = mockAdapter.executeQuery.mock.calls[2]?.[0];
    expect(sql).toContain("DO NOTHING");
  });

  it("pg_upsert should detect update operation via xmax", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    // xmax > 0 means UPDATE
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ _xmax: "42", id: 1 }],
      rowsAffected: 1,
    });

    const tool = findTool("pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "users",
        data: { id: 1, name: "Updated" },
        conflictColumns: ["id"],
        returning: ["id"],
      },
      mockContext,
    )) as { success: boolean; operation: string; rows: unknown[] };

    expect(result.success).toBe(true);
    expect(result.operation).toBe("update");
    // _xmax should be stripped from returned rows
    expect(result.rows?.[0]).not.toHaveProperty("_xmax");
  });

  it("pg_upsert should return constraint error for missing unique constraint", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("no unique or exclusion constraint matching the ON CONFLICT"),
    );

    const tool = findTool("pg_upsert")!;
    const result = (await tool.handler(
      {
        table: "logs",
        data: { msg: "hello" },
        conflictColumns: ["msg"],
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("UNIQUE constraint");
  });

  it("pg_truncate should resolve 'tableName' alias for table", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 0 });

    const tool = findTool("pg_truncate")!;
    const result = (await tool.handler({ tableName: "logs" }, mockContext)) as {
      success: boolean;
    };

    expect(result.success).toBe(true);
  });

  it("pg_count should return error for nonexistent schema", async () => {
    // Schema check returns empty → schema not found
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = findTool("pg_count")!;
    const result = (await tool.handler(
      { table: "users", schema: "fake_schema" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not exist");
  });
});

// =============================================================================
// parsePostgresError — uncovered branches
// =============================================================================

describe("parsePostgresError — uncovered branches", () => {
  // error-helpers.ts L57-58: idempotency guard — error with cause but no pgCode
  it("should re-throw error with cause but no pgCode unchanged", () => {
    const inner = new Error("inner");
    const outer = new Error("already processed", { cause: inner });
    expect(() => parsePostgresError(outer, { tool: "pg_test" })).toThrow(outer);
  });

  // error-helpers.ts L174-178: foreign key violation
  it("should throw actionable error for FK violation", () => {
    const err = new Error("violates foreign key constraint");
    expect(() => parsePostgresError(err, { tool: "pg_write_query" })).toThrow(
      /Foreign key constraint violated/,
    );
  });

  // error-helpers.ts L174-178: FK violation via pgCode 23503
  it("should throw actionable error for FK violation via pgCode", () => {
    const err = new Error("insert or update on table violates FK");
    (err as unknown as Record<string, unknown>)["code"] = "23503";
    expect(() => parsePostgresError(err, { tool: "pg_write_query" })).toThrow(
      /Foreign key constraint violated/,
    );
  });

  // error-helpers.ts L312-318: pg_cron_alter_job context
  it("should throw cron job not found for pg_cron_alter_job", () => {
    const err = new Error("something does not exist");
    (err as unknown as Record<string, unknown>)["code"] = "42704";
    expect(() =>
      parsePostgresError(err, { tool: "pg_cron_alter_job", target: "99" }),
    ).toThrow(/Job 99 not found/);
  });

  // error-helpers.ts L319-326: pg_cron_schedule_in_database context
  it("should throw database not found for pg_cron_schedule_in_database", () => {
    // Use pgCode 42704 to enter the 42704 block, and a message with 'database "X"'
    // but NOT matching 3D000's `database "..." does not exist` text regex
    const err = new Error('database "testdb" is not accessible');
    (err as unknown as Record<string, unknown>)["code"] = "42704";
    expect(() =>
      parsePostgresError(err, {
        tool: "pg_cron_schedule_in_database",
        target: "testdb",
      }),
    ).toThrow(/Database 'testdb' not found/);
  });

  // error-helpers.ts L327-331: generic cron fallback
  it("should throw generic cron error for other pg_cron_ tools", () => {
    const err = new Error("some cron thing does not exist");
    (err as unknown as Record<string, unknown>)["code"] = "42704";
    expect(() =>
      parsePostgresError(err, { tool: "pg_cron_list_jobs" }),
    ).toThrow(/Cron operation failed/);
  });

  // error-helpers.ts L300-306: tsvector function does not exist
  it("should throw tsvector guidance for function tsvector error", () => {
    const err = new Error(
      "function to_tsvector(unknown, tsvector) does not exist",
    );
    (err as unknown as Record<string, unknown>)["code"] = "42704";
    expect(() => parsePostgresError(err, { tool: "pg_text_search" })).toThrow(
      /tsvector type/,
    );
  });

  // error-helpers.ts L292-298: pg_drop_table table not found
  it("should throw table not found for pg_drop_table", () => {
    const err = new Error("something does not exist");
    (err as unknown as Record<string, unknown>)["code"] = "42704";
    expect(() =>
      parsePostgresError(err, { tool: "pg_drop_table", table: "mytable" }),
    ).toThrow(/Table 'public.mytable' not found/);
  });
});

// =============================================================================
// core/query.ts — uncovered transaction error paths
// =============================================================================

describe("core/query.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCoreTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCoreTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  const findTool = (name: string) => {
    return tools.find((t) => t.name === name)!;
  };

  // query.ts L59-66: pg_read_query transaction connection error
  it("pg_read_query should return error when transaction query fails", async () => {
    const mockClient = {};
    mockAdapter.getTransactionConnection = vi.fn().mockReturnValue(mockClient);
    mockAdapter.executeOnConnection = vi
      .fn()
      .mockRejectedValueOnce(new Error('relation "foo" does not exist'));

    const tool = findTool("pg_read_query");
    const result = (await tool.handler(
      { sql: "SELECT * FROM foo", transactionId: "tx-1" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // query.ts L148-155: pg_write_query transaction connection error
  it("pg_write_query should return error when transaction query fails", async () => {
    const mockClient = {};
    mockAdapter.getTransactionConnection = vi.fn().mockReturnValue(mockClient);
    mockAdapter.executeOnConnection = vi
      .fn()
      .mockRejectedValueOnce(new Error("permission denied"));

    const tool = findTool("pg_write_query");
    const result = (await tool.handler(
      { sql: "DELETE FROM foo", transactionId: "tx-1" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  // query.ts L180-184: pg_write_query outer catch (Zod validation)
  it("pg_write_query should return error for missing sql param", async () => {
    const tool = findTool("pg_write_query");
    const result = (await tool.handler(
      {}, // missing sql
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // query.ts L92-96: pg_read_query outer catch (Zod validation)
  it("pg_read_query should return error for missing sql param", async () => {
    const tool = findTool("pg_read_query");
    const result = (await tool.handler(
      {}, // missing sql
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
