/**
 * postgres-mcp - Citext Extension Tools Unit Tests
 *
 * Tests for case-insensitive text type tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getCitextTools } from "../citext/index.js";

describe("Citext Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getCitextTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getCitextTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_citext_create_extension", () => {
    it("should create citext extension", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("citext");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE EXTENSION IF NOT EXISTS citext"),
      );
    });
  });

  describe("pg_citext_convert_column", () => {
    it("should return structured error if extension not installed", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ installed: false }],
      });

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not installed or enabled");
    });

    it("should return structured error if table not found", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [] }); // table not found

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "nonexistent",
          column: "email",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return structured error if column not found", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({ rows: [] }); // column not found

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "nonexistent",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should report already citext column", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "USER-DEFINED", udt_name: "citext" }],
        });

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as { success: boolean; wasAlreadyCitext: boolean };

      expect(result.success).toBe(true);
      expect(result.wasAlreadyCitext).toBe(true);
    });

    it("should convert text column to citext", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
          schema: "public",
        },
        mockContext,
      )) as { success: boolean; previousType: string };

      expect(result.success).toBe(true);
      expect(result.previousType).toBe("text");
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("ALTER TABLE"),
      );
    });
  });

  describe("pg_citext_list_columns", () => {
    it("should list all citext columns", async () => {
      // Mock count query first, then main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              table_schema: "public",
              table_name: "users",
              column_name: "email",
            },
            {
              table_schema: "public",
              table_name: "users",
              column_name: "username",
            },
          ],
        });

      const tool = findTool("pg_citext_list_columns");
      const result = (await tool!.handler({}, mockContext)) as {
        columns: unknown[];
        count: number;
        totalCount: number;
        truncated: boolean;
      };

      expect(result.count).toBe(2);
      expect(result.columns).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.truncated).toBe(false);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("COUNT(*)"),
        [],
      );
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("udt_name = 'citext'"),
        [],
      );
    });

    it("should filter by schema when provided", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ schema_name: "custom" }] }) // schema exists
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_list_columns");
      await tool!.handler({ schema: "custom" }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("table_schema = $1"),
        ["custom"],
      );
    });

    it("should return structured error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // schema does not exist

      const tool = findTool("pg_citext_list_columns");
      const result = (await tool!.handler(
        { schema: "nonexistent_schema" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should apply default limit and return truncation info", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 150 }] })
        .mockResolvedValueOnce({
          rows: Array(100)
            .fill(null)
            .map((_, i) => ({
              table_schema: "public",
              table_name: `table_${String(i)}`,
              column_name: "col",
            })),
        });

      const tool = findTool("pg_citext_list_columns");
      const result = (await tool!.handler({}, mockContext)) as {
        count: number;
        totalCount: number;
        truncated: boolean;
        limit: number;
      };

      expect(result.count).toBe(100);
      expect(result.totalCount).toBe(150);
      expect(result.truncated).toBe(true);
      expect(result.limit).toBe(100);
    });

    it("should return all results with limit: 0", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 3 }] })
        .mockResolvedValueOnce({
          rows: [
            { table_schema: "public", table_name: "a", column_name: "col" },
            { table_schema: "public", table_name: "b", column_name: "col" },
            { table_schema: "public", table_name: "c", column_name: "col" },
          ],
        });

      const tool = findTool("pg_citext_list_columns");
      const result = (await tool!.handler({ limit: 0 }, mockContext)) as {
        count: number;
        totalCount: number;
        truncated: boolean;
        limit?: number;
      };

      expect(result.count).toBe(3);
      expect(result.totalCount).toBe(3);
      expect(result.truncated).toBe(false);
      expect(result.limit).toBeUndefined();
      // Verify no LIMIT clause in query
      expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
        expect.not.stringContaining("LIMIT"),
        [],
      );
    });
  });

  describe("pg_citext_analyze_candidates", () => {
    // System schemas excluded by default when no schema/table filter
    const systemSchemas = [
      "cron",
      "topology",
      "partman",
      "tiger",
      "tiger_data",
    ];

    it("should find email and username columns", async () => {
      // Mock count query first, then main query
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              table_schema: "public",
              table_name: "users",
              column_name: "email",
              data_type: "text",
            },
            {
              table_schema: "public",
              table_name: "users",
              column_name: "username",
              data_type: "character varying",
            },
          ],
        });

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler({}, mockContext)) as {
        count: number;
        summary: { highConfidence: number };
        excludedSchemas?: string[];
      };

      expect(result.count).toBe(2);
      expect(result.summary.highConfidence).toBe(2);
      // Should include system schema exclusion info
      expect(result.excludedSchemas).toEqual(systemSchemas);
    });

    it("should use custom patterns when provided", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [{ column_name: "custom_field", data_type: "text" }],
        });

      const tool = findTool("pg_citext_analyze_candidates");
      await tool!.handler({ patterns: ["custom"] }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("LOWER(column_name) LIKE"),
        expect.arrayContaining(["%custom%"]),
      );
    });

    it("should return recommendation when candidates found", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [{ column_name: "email", data_type: "text" }],
        });

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler({}, mockContext)) as {
        recommendation: string;
      };

      expect(result.recommendation).toContain("Consider converting");
    });

    it("should exclude system schemas by default", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler({}, mockContext)) as {
        excludedSchemas: string[];
      };

      // Query should include system schema exclusion
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("table_schema NOT IN"),
        expect.arrayContaining(systemSchemas),
      );
      expect(result.excludedSchemas).toEqual(systemSchemas);
    });

    it("should include all schemas when excludeSystemSchemas: false", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler(
        { excludeSystemSchemas: false },
        mockContext,
      )) as {
        excludedSchemas?: string[];
      };

      // Query should NOT include extra system schema exclusion params
      expect(mockAdapter.executeQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("table_schema NOT IN"),
        expect.arrayContaining(["cron"]),
      );
      // Should not have excludedSchemas in response
      expect(result.excludedSchemas).toBeUndefined();
    });

    it("should not exclude system schemas when table filter is specified", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler({ table: "users" }, mockContext)) as {
        excludedSchemas?: string[];
      };

      // Should not have excludedSchemas when filtering by table
      expect(result.excludedSchemas).toBeUndefined();
    });

    it("should return structured error for nonexistent table", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // table does not exist

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler(
        { table: "nonexistent_table" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should return structured error for nonexistent schema", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // schema does not exist

      const tool = findTool("pg_citext_analyze_candidates");
      const result = (await tool!.handler(
        { schema: "nonexistent_schema" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    it("should parse schema.table format", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_citext_analyze_candidates");
      await tool!.handler({ table: "custom_schema.users" }, mockContext);

      // Should have parsed schema.table and checked existence with split values
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("table_schema = $1 AND table_name = $2"),
        ["custom_schema", "users"],
      );
    });
  });

  describe("pg_citext_compare", () => {
    it("should compare values with citext extension", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] })
        .mockResolvedValueOnce({
          rows: [
            {
              citext_equal: true,
              text_equal: false,
              lower_equal: true,
            },
          ],
        });

      const tool = findTool("pg_citext_compare");
      const result = (await tool!.handler(
        {
          value1: "HELLO",
          value2: "hello",
        },
        mockContext,
      )) as {
        citextEqual: boolean;
        textEqual: boolean;
        extensionInstalled: boolean;
      };

      expect(result.citextEqual).toBe(true);
      expect(result.textEqual).toBe(false);
      expect(result.extensionInstalled).toBe(true);
    });

    it("should compare values without citext extension", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: false }] })
        .mockResolvedValueOnce({
          rows: [
            {
              text_equal: false,
              lower_equal: true,
            },
          ],
        });

      const tool = findTool("pg_citext_compare");
      const result = (await tool!.handler(
        {
          value1: "HELLO",
          value2: "hello",
        },
        mockContext,
      )) as {
        textEqual: boolean;
        lowerEqual: boolean;
        extensionInstalled: boolean;
        hint?: string;
      };

      expect(result.textEqual).toBe(false);
      expect(result.lowerEqual).toBe(true);
      expect(result.extensionInstalled).toBe(false);
      expect(result.hint).toBeDefined();
    });

    it("should return structured error when value2 is missing", async () => {
      const tool = findTool("pg_citext_compare");
      const result = (await tool!.handler(
        {
          value1: "HELLO",
          // value2 is missing
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_citext_schema_advisor", () => {
    it("should recommend columns for conversion", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [
            { column_name: "email", data_type: "text", udt_name: "text" },
            { column_name: "username", data_type: "text", udt_name: "text" },
            { column_name: "bio", data_type: "text", udt_name: "text" },
          ],
        });

      const tool = findTool("pg_citext_schema_advisor");
      const result = (await tool!.handler(
        {
          table: "users",
        },
        mockContext,
      )) as {
        recommendations: Array<{
          column: string;
          recommendation: string;
          confidence: string;
        }>;
        summary: { recommendConvert: number; highConfidence: number };
      };

      expect(result.summary.recommendConvert).toBe(2); // email, username
      expect(result.summary.highConfidence).toBe(2);

      const emailRec = result.recommendations.find((r) => r.column === "email");
      expect(emailRec?.recommendation).toBe("convert");
      expect(emailRec?.confidence).toBe("high");
    });

    it("should detect already citext columns", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [
            {
              column_name: "email",
              data_type: "USER-DEFINED",
              udt_name: "citext",
            },
          ],
        });

      const tool = findTool("pg_citext_schema_advisor");
      const result = (await tool!.handler(
        {
          table: "users",
        },
        mockContext,
      )) as {
        recommendations: Array<{ column: string; recommendation: string }>;
        summary: { alreadyCitext: number };
      };

      expect(result.summary.alreadyCitext).toBe(1);
      expect(result.recommendations[0].recommendation).toBe("already_citext");
    });

    it("should provide next steps when conversions recommended", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ column_name: "email", data_type: "text", udt_name: "text" }],
        });

      const tool = findTool("pg_citext_schema_advisor");
      const result = (await tool!.handler(
        {
          table: "users",
          schema: "auth",
        },
        mockContext,
      )) as { nextSteps: string[] };

      expect(result.nextSteps.length).toBeGreaterThan(0);
      expect(result.nextSteps.some((step) => step.includes("Review"))).toBe(
        true,
      );
    });

    it("should return structured error for non-existent table", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] }); // table does not exist

      const tool = findTool("pg_citext_schema_advisor");
      const result = (await tool!.handler(
        {
          table: "nonexistent",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  it("should export all 6 citext tools", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_citext_create_extension");
    expect(toolNames).toContain("pg_citext_convert_column");
    expect(toolNames).toContain("pg_citext_list_columns");
    expect(toolNames).toContain("pg_citext_analyze_candidates");
    expect(toolNames).toContain("pg_citext_compare");
    expect(toolNames).toContain("pg_citext_schema_advisor");
    expect(tools).toHaveLength(6);
  });

  // =========================================================================
  // Additional Coverage: uncovered branches in citext/setup.ts
  // =========================================================================

  describe("citext/setup.ts uncovered branches", () => {
    // setup.ts L47-54: create_extension error path
    it("should return structured error when create_extension fails", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("permission denied to create extension"),
      );

      const tool = findTool("pg_citext_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("permission denied");
    });

    // setup.ts L152-160: non-text column type validation
    it("should reject conversion of non-text column types", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] }) // ext check
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "integer", udt_name: "int4" }],
        }); // column is integer

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "age",
        },
        mockContext,
      )) as {
        success: boolean;
        error: string;
        details?: {
          currentType: string;
          allowedTypes: string[];
        };
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a text-based type");
      expect(result.details?.currentType).toBe("integer");
      expect(result.details?.allowedTypes).toEqual([
        "text",
        "varchar",
        "character varying",
      ]);
    });

    // setup.ts L185-196: dependent views blocking conversion
    it("should return error when dependent views exist", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] }) // ext check
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "text", udt_name: "text" }],
        }) // column type
        .mockResolvedValueOnce({
          rows: [
            { dependent_view: "user_emails_view", view_schema: "public" },
            { dependent_view: "active_users_view", view_schema: "app" },
          ],
        }); // dependent views

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as {
        success: boolean;
        error: string;
        details?: {
          dependentViews: string[];
          hint?: string;
        };
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("dependent views");
      expect(result.details?.dependentViews).toEqual([
        "public.user_emails_view",
        "app.active_users_view",
      ]);
      expect(result.error).toContain("Drop the listed views");
    });

    // setup.ts L217-232: ALTER TABLE conversion failure
    it("should handle ALTER TABLE failure during conversion", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] }) // ext check
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "character varying", udt_name: "varchar" }],
        }) // column type
        .mockResolvedValueOnce({ rows: [] }) // no dependent views
        .mockRejectedValueOnce(
          new Error("cannot alter type of a column used by a view"),
        ); // ALTER fails

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as {
        success: boolean;
        error: string;
        details?: { hint: string };
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to convert column");
      expect(result.details?.hint).toContain("views depend on this column");
    });

    // setup.ts L233-239: outer catch block for unexpected errors
    it("should handle unexpected errors in convert_column", async () => {
      const pgError = new Error(
        'relation "nonexistent" does not exist',
      ) as Error & { code: string };
      (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
      mockAdapter.executeQuery.mockRejectedValueOnce(pgError); // ext check itself fails

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    // setup.ts: convert varchar column to citext
    it("should convert varchar column to citext successfully", async () => {
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ installed: true }] }) // ext check
        .mockResolvedValueOnce({ rows: [{ "?column?": 1 }] }) // table exists
        .mockResolvedValueOnce({
          rows: [{ data_type: "character varying", udt_name: "varchar" }],
        }) // column type
        .mockResolvedValueOnce({ rows: [] }) // no dependent views
        .mockResolvedValueOnce({ rows: [] }); // ALTER succeeds

      const tool = findTool("pg_citext_convert_column");
      const result = (await tool!.handler(
        {
          table: "users",
          column: "email",
        },
        mockContext,
      )) as {
        success: boolean;
        previousType: string;
      };

      expect(result.success).toBe(true);
      expect(result.previousType).toBe("character varying");
    });
  });
});
