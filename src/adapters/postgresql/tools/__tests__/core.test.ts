/**
 * postgres-mcp - Core Tools Unit Tests
 *
 * Tests for parsePostgresError() error mapping helper
 * in the core tool group.
 */

import { describe, it, expect } from "vitest";
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
