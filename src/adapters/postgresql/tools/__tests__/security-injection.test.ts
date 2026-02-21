/**
 * postgres-mcp - SQL Injection Security Tests
 *
 * Tests to verify protection against SQL injection attacks.
 * Covers WHERE clause, FTS config, identifier, and DDL injection vectors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTextTools } from "../text.js";
import { getVectorTools } from "../vector/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import {
  sanitizeIdentifier,
  validateIdentifier,
  InvalidIdentifierError,
} from "../../../../utils/identifiers.js";

// =============================================================================
// Identifier Injection Tests (Extended Edge Cases)
// =============================================================================

describe("Identifier SQL Injection Prevention", () => {
  describe("validateIdentifier edge cases", () => {
    it("should reject null byte injection", () => {
      expect(() => validateIdentifier("users\x00--")).toThrow(
        InvalidIdentifierError,
      );
    });

    it("should reject Unicode homoglyph attacks", () => {
      // Using Cyrillic 'а' (U+0430) which looks like Latin 'a'
      expect(() => validateIdentifier("tаble")).toThrow(InvalidIdentifierError);
    });

    it("should reject newline injection", () => {
      expect(() => validateIdentifier("users\n--DROP")).toThrow(
        InvalidIdentifierError,
      );
    });

    it("should reject tab injection", () => {
      expect(() => validateIdentifier("users\t--")).toThrow(
        InvalidIdentifierError,
      );
    });

    it("should reject carriage return injection", () => {
      expect(() => validateIdentifier("users\r--")).toThrow(
        InvalidIdentifierError,
      );
    });

    it("should reject backslash injection", () => {
      expect(() => validateIdentifier("users\\--")).toThrow(
        InvalidIdentifierError,
      );
    });

    it("should accept valid identifier at max length (63 chars)", () => {
      const maxLengthIdentifier = "a".repeat(63);
      expect(() => validateIdentifier(maxLengthIdentifier)).not.toThrow();
      expect(sanitizeIdentifier(maxLengthIdentifier)).toBe(
        `"${"a".repeat(63)}"`,
      );
    });

    it("should reject identifier exceeding max length (64 chars)", () => {
      const tooLongIdentifier = "a".repeat(64);
      expect(() => validateIdentifier(tooLongIdentifier)).toThrow(
        InvalidIdentifierError,
      );
    });
  });

  describe("sanitizeIdentifier SQL injection patterns", () => {
    const injectionAttempts = [
      'users"; DROP TABLE users;--',
      "users' OR '1'='1",
      "users; DELETE FROM passwords;",
      "users UNION SELECT * FROM secrets",
      "users/**/OR/**/1=1",
      "users`; DROP TABLE users;",
      "users\\'; DROP TABLE users;--",
      '"; GRANT ALL ON *.* TO "hacker"@"%";--',
      "users\x00; DROP TABLE users;",
    ];

    for (const attempt of injectionAttempts) {
      it(`should reject injection attempt: ${attempt.substring(0, 30)}...`, () => {
        expect(() => sanitizeIdentifier(attempt)).toThrow(
          InvalidIdentifierError,
        );
      });
    }
  });
});

// =============================================================================
// WHERE Clause Injection Tests
// =============================================================================

describe("WHERE Clause SQL Injection", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let textTools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    textTools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_trigram_similarity WHERE injection", () => {
    it("should accept valid WHERE clause", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = textTools.find((t) => t.name === "pg_trigram_similarity")!;
      await tool.handler(
        {
          table: "test_products",
          column: "name",
          value: "Product",
          where: "price > 10",
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("AND (price > 10)");
    });

    it("should reject WHERE clause with semicolon (SQL injection)", async () => {
      const tool = textTools.find((t) => t.name === "pg_trigram_similarity")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          value: "Product",
          where: "1=1; DROP TABLE test_products;--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });

    it("should reject WHERE clause with UNION (SQL injection)", async () => {
      const tool = textTools.find((t) => t.name === "pg_trigram_similarity")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          value: "Product",
          where: "1=1 UNION SELECT password FROM pg_shadow",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });

    it("should reject WHERE clause with SQL comment (SQL injection)", async () => {
      const tool = textTools.find((t) => t.name === "pg_trigram_similarity")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          value: "Product",
          where: "1=1--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });
  });

  describe("pg_like_search WHERE injection", () => {
    it("should reject WHERE clause with injection", async () => {
      const tool = textTools.find((t) => t.name === "pg_like_search")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          pattern: "%test%",
          where: "1=1; DELETE FROM test_products;--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });
  });

  describe("pg_regexp_match WHERE injection", () => {
    it("should reject WHERE clause with injection", async () => {
      const tool = textTools.find((t) => t.name === "pg_regexp_match")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          pattern: ".*",
          where: "1=1 OR pg_sleep(10)",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });
  });

  describe("pg_fuzzy_match WHERE injection", () => {
    it("should reject WHERE clause with injection", async () => {
      const tool = textTools.find((t) => t.name === "pg_fuzzy_match")!;
      const result = (await tool.handler(
        {
          table: "test_products",
          column: "name",
          value: "Product",
          where: "1=1; UPDATE pg_shadow SET passwd='hacked';--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe WHERE clause");
    });
  });
});

// =============================================================================
// FTS Config Injection Tests
// =============================================================================

describe("FTS Config SQL Injection", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let textTools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    textTools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_text_search config injection", () => {
    it("should accept valid config names", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = textTools.find((t) => t.name === "pg_text_search")!;
      await tool.handler(
        {
          table: "test_articles",
          columns: ["title", "body"],
          query: "test",
          config: "english",
        },
        mockContext,
      );

      const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
      expect(sql).toContain("to_tsvector('english'");
    });

    it("should reject config with quote (SQL injection)", async () => {
      const tool = textTools.find((t) => t.name === "pg_text_search")!;
      const result = (await tool.handler(
        {
          table: "test_articles",
          columns: ["title"],
          query: "test",
          config: "english'); DROP TABLE test_articles;--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid FTS configuration");
    });
  });

  describe("pg_text_rank config injection", () => {
    it("should reject config with injection attempt", async () => {
      const tool = textTools.find((t) => t.name === "pg_text_rank")!;
      const result = (await tool.handler(
        {
          table: "test_articles",
          column: "body",
          query: "test",
          config: "german'); DELETE FROM secrets;--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid FTS configuration");
    });
  });

  describe("pg_create_fts_index config injection", () => {
    it("should reject config with injection attempt", async () => {
      const tool = textTools.find((t) => t.name === "pg_create_fts_index")!;
      const result = (await tool.handler(
        {
          table: "test_articles",
          column: "title",
          config: "english'); CREATE ROLE hacker SUPERUSER;--",
        },
        mockContext,
      )) as { success: boolean; error: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid FTS configuration");
    });
  });
});

// =============================================================================
// Vector Tools WHERE Injection Tests
// =============================================================================

describe("Vector Tools WHERE Clause Injection", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let vectorTools: ReturnType<typeof getVectorTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    vectorTools = getVectorTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  describe("pg_vector_search WHERE injection", () => {
    it("should reject WHERE clause with injection", async () => {
      // Mock existence check and type check to pass so WHERE validation triggers
      mockAdapter.executeQuery
        .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // existence check (checkTableAndColumn)
        .mockResolvedValueOnce({ rows: [{ udt_name: "vector" }] }); // type check

      const tool = vectorTools.find((t) => t.name === "pg_vector_search")!;
      await expect(
        tool.handler(
          {
            table: "test_embeddings",
            column: "embedding",
            vector: Array(384).fill(0.1),
            where: "1=1; DROP TABLE test_embeddings;--",
          },
          mockContext,
        ),
      ).rejects.toThrow("Unsafe WHERE clause");
    });
  });
});

// =============================================================================
// Table/Schema Name Injection Tests
// =============================================================================

describe("Table/Schema Name Injection via Manual Quoting", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let textTools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    textTools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // Table names with injection are now rejected
  it("should reject table names with injection", async () => {
    const tool = textTools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      {
        table: 'articles"; DROP TABLE users;--',
        columns: ["title"],
        query: "test",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // Schema names with injection are now rejected
  it("should reject schema names with injection", async () => {
    const tool = textTools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      {
        table: "articles",
        schema: 'public"; DROP TABLE users;--',
        columns: ["title"],
        query: "test",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// Summary of Security Findings
// =============================================================================

/**
 * SECURITY TEST SUMMARY
 *
 * These tests document the current state of SQL injection protection in postgres-mcp.
 *
 * ✅ PROTECTED:
 * - Identifier injection (table names, column names) - sanitizeIdentifier prevents attacks
 * - Data value injection - parameterized queries with $1, $2 placeholders
 *
 * ⚠️ POTENTIAL VULNERABILITIES (tests document current behavior):
 * - WHERE clause parameters are passed directly without validation
 * - FTS config strings are interpolated without validation
 * - DDL expressions (check, default, constraint.expression) may be vulnerable
 *
 * RECOMMENDATIONS:
 * 1. Add WHERE clause validation/sanitization
 * 2. Validate FTS config against known PostgreSQL text search configurations
 * 3. Review DDL expression handling in pg_create_table
 */
