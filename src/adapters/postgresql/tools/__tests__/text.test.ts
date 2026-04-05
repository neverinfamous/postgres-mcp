/**
 * postgres-mcp - Text Tools Unit Tests
 *
 * Tests for PostgreSQL text processing tools with focus on
 * full-text search, trigrams, fuzzy matching, and sentiment analysis.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTextTools } from "../text/index.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

vi.mock("../vector/data.js", () => ({
  checkTableAndColumn: vi.fn().mockResolvedValue(null),
}));

describe("getTextTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getTextTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getTextTools(adapter);
  });

  it("should return 13 text tools", () => {
    expect(tools).toHaveLength(13);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_text_search");
    expect(toolNames).toContain("pg_text_rank");
    expect(toolNames).toContain("pg_trigram_similarity");
    expect(toolNames).toContain("pg_fuzzy_match");
    expect(toolNames).toContain("pg_regexp_match");
    expect(toolNames).toContain("pg_like_search");
    expect(toolNames).toContain("pg_text_headline");
    expect(toolNames).toContain("pg_create_fts_index");
    expect(toolNames).toContain("pg_text_normalize");
    expect(toolNames).toContain("pg_text_sentiment");
    expect(toolNames).toContain("pg_text_to_vector");
    expect(toolNames).toContain("pg_text_to_query");
    expect(toolNames).toContain("pg_text_search_config");
  });

  it("should have group set to text for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("text");
    }
  });
});

describe("pg_text_search", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should perform full-text search", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ title: "PostgreSQL Guide", rank: 0.9 }],
    });

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      {
        table: "articles",
        columns: ["title", "body"],
        query: "postgres",
      },
      mockContext,
    )) as {
      rows: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("to_tsvector"),
      ["postgres"],
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("plainto_tsquery"),
      expect.any(Array),
    );
    expect(result.count).toBe(1);
  });

  it("should use custom config", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    await tool.handler(
      {
        table: "articles",
        columns: ["title"],
        query: "test",
        config: "german",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("to_tsvector('german'"),
      expect.any(Array),
    );
  });

  it("should use custom select columns when provided (line 53 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, title: "Test", rank: 0.9 }],
    });

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    await tool.handler(
      {
        table: "articles",
        columns: ["title", "body"],
        query: "postgres",
        select: ["id", "title"],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT "id", "title"'),
      expect.any(Array),
    );
  });

  it("should use * when select is empty array (line 53 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    await tool.handler(
      {
        table: "articles",
        columns: ["title"],
        query: "test",
        select: [],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT *"),
      expect.any(Array),
    );
  });

  it("should add LIMIT clause when limit > 0 (line 55 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    await tool.handler(
      {
        table: "articles",
        columns: ["title"],
        query: "test",
        limit: 10,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 10"),
      expect.any(Array),
    );
  });

  it("should enforce limit constraints strictly to prevent payload bloat", async () => {
    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      {
        table: "articles",
        columns: ["title"],
        query: "test",
        limit: 0,
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("must be greater than 0");
  });
});

describe("pg_text_rank", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should rank text results", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, rank: 0.85 }],
    });

    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      {
        table: "documents",
        column: "content",
        query: "database",
      },
      mockContext,
    )) as {
      rows: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ts_rank_cd"),
      ["database"],
    );
    expect(result.rows).toHaveLength(1);
  });
});

describe("pg_trigram_similarity", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should find similar strings", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "PostgreSQL", similarity: 0.8 }],
    });

    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      {
        table: "products",
        column: "name",
        value: "PostgreS",
      },
      mockContext,
    )) as {
      rows: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("similarity("),
      ["PostgreS"],
    );
    expect(result.count).toBe(1);
  });

  it("should respect threshold", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    await tool.handler(
      {
        table: "products",
        column: "name",
        value: "test",
        threshold: 0.5,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("> 0.5"),
      expect.any(Array),
    );
  });
});

describe("pg_fuzzy_match", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use levenshtein by default", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ name: "Smith", distance: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    await tool.handler(
      {
        table: "users",
        column: "name",
        value: "Smyth",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("levenshtein"),
      ["Smyth"],
    );
  });

  it("should use soundex when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    await tool.handler(
      {
        table: "users",
        column: "name",
        value: "Smith",
        method: "soundex",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("soundex"),
      ["Smith"],
    );
  });

  it("should use metaphone when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    await tool.handler(
      {
        table: "users",
        column: "name",
        value: "Smith",
        method: "metaphone",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("metaphone"),
      ["Smith"],
    );
  });

  it("should return structured error for invalid method", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "name",
        value: "Smith",
        method: "invalid_method",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid method "invalid_method"');
    expect(result.error).toContain("levenshtein");
    expect(result.error).toContain("soundex");
    expect(result.error).toContain("metaphone");
    expect(mockAdapter.executeQuery).not.toHaveBeenCalled();
  });
});

describe("pg_regexp_match", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should match using regex", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ email: "test@example.com" }],
    });

    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(
      {
        table: "users",
        column: "email",
        pattern: "^[a-z]+@",
      },
      mockContext,
    )) as {
      rows: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining(" ~ $1"),
      ["^[a-z]+@"],
    );
    // Should include default LIMIT 100
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 100"),
      expect.any(Array),
    );
    expect(result.count).toBe(1);
  });

  it("should default to LIMIT 100 when no limit specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    await tool.handler(
      {
        table: "users",
        column: "email",
        pattern: "^test",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain("LIMIT 100");
  });

  it("should use case-insensitive match with i flag", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    await tool.handler(
      {
        table: "users",
        column: "email",
        pattern: "TEST",
        flags: "i",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining(" ~* $1"),
      expect.any(Array),
    );
  });

  it("should use custom select columns when provided (line 180 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    await tool.handler(
      {
        table: "users",
        column: "email",
        pattern: "^test",
        select: ["id", "name"],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT "id", "name"'),
      expect.any(Array),
    );
  });
});

describe("pg_like_search", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should search with LIKE", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ title: "PostgreSQL Tutorial" }],
    });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%PostgreSQL%",
      },
      mockContext,
    )) as {
      rows: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIKE $1"),
      ["%PostgreSQL%"],
    );
    // Should include default LIMIT 100
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 100"),
      expect.any(Array),
    );
    expect(result.count).toBe(1);
  });

  it("should default to LIMIT 100 when no limit specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%test%",
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain("LIMIT 100");
  });

  it("should use ILIKE when case-insensitive", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%test%",
        caseInsensitive: true,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE $1"),
      expect.any(Array),
    );
  });

  it("should use custom select columns when provided (line 210 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%test%",
        select: ["id", "title"],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT "id", "title"'),
      expect.any(Array),
    );
  });

  it("should add LIMIT clause when limit > 0 (line 212 branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%test%",
        limit: 25,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 25"),
      expect.any(Array),
    );
  });

  it("should use select columns with limit together (combined branch)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      {
        table: "articles",
        column: "title",
        pattern: "%test%",
        select: ["id"],
        limit: 10,
      },
      mockContext,
    );

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).toContain('SELECT "id"');
    expect(sql).toContain("LIMIT 10");
  });
});

describe("pg_text_headline", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should generate headlines with highlights", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ headline: "Learn <b>PostgreSQL</b> basics" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      {
        table: "articles",
        column: "content",
        query: "PostgreSQL",
      },
      mockContext,
    )) as {
      rows: Array<{ headline: string }>;
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ts_headline"),
      ["PostgreSQL"],
    );
    expect(result.rows[0].headline).toContain("<b>PostgreSQL</b>");
    expect(result.count).toBe(1);
  });
});

describe("pg_create_fts_index", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should create GIN index for FTS", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler(
      {
        table: "articles",
        column: "body",
      },
      mockContext,
    )) as {
      success: boolean;
      index: string;
      config: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("CREATE INDEX"),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("USING gin"),
    );
    expect(result.success).toBe(true);
    expect(result.index).toContain("fts");
  });
});

describe("pg_text_normalize", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should normalize text using unaccent", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // CREATE EXTENSION call
      .mockResolvedValueOnce({ rows: [{ normalized: "cafe" }] }); // unaccent query

    const tool = tools.find((t) => t.name === "pg_text_normalize")!;
    const result = (await tool.handler(
      {
        text: "café",
      },
      mockContext,
    )) as {
      normalized: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      1,
      "CREATE EXTENSION IF NOT EXISTS unaccent",
    );
    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      "SELECT unaccent($1) as normalized",
      ["café"],
    );
    expect(result.normalized).toBe("cafe");
  });
});

describe("pg_text_sentiment", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze positive sentiment", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "This product is amazing and wonderful!",
      },
      mockContext,
    )) as {
      sentiment: string;
      score: number;
      positiveCount: number;
      negativeCount: number;
    };

    expect(result.sentiment).toBe("positive");
    expect(result.score).toBeGreaterThan(0);
    expect(result.positiveCount).toBeGreaterThan(0);
  });

  it("should analyze negative sentiment", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "This is terrible and horrible!",
      },
      mockContext,
    )) as {
      sentiment: string;
      score: number;
      negativeCount: number;
    };

    expect(result.sentiment).toContain("negative");
    expect(result.score).toBeLessThan(0);
    expect(result.negativeCount).toBeGreaterThan(0);
  });

  it("should return matched words when requested", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "I love this great product!",
        returnWords: true,
      },
      mockContext,
    )) as {
      matchedPositive: string[];
      matchedNegative: string[];
    };

    expect(result.matchedPositive).toContain("love");
    expect(result.matchedPositive).toContain("great");
    expect(result.matchedNegative).toHaveLength(0);
  });

  it("should detect neutral sentiment", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "The product arrived yesterday.",
      },
      mockContext,
    )) as {
      sentiment: string;
      score: number;
    };

    expect(result.sentiment).toBe("neutral");
    expect(result.score).toBe(0);
  });
});

// =============================================================================
// Branch Coverage Tests - Sentiment Score Branches
// =============================================================================

describe("pg_text_sentiment score branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should detect very positive sentiment (score > 2)", async () => {
    // Use many positive words to get score > 2
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "Amazing excellent fantastic wonderful great beautiful perfect awesome love brilliant",
      },
      mockContext,
    )) as {
      sentiment: string;
      score: number;
      positiveCount: number;
    };

    expect(result.sentiment).toBe("very_positive");
    expect(result.score).toBeGreaterThan(2);
    expect(result.positiveCount).toBeGreaterThan(3);
  });

  it("should detect very negative sentiment (score < -2)", async () => {
    // Use many negative words to get score < -2
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "Terrible horrible awful bad disgusting ugly failure hate worst poor",
      },
      mockContext,
    )) as {
      sentiment: string;
      score: number;
      negativeCount: number;
    };

    expect(result.sentiment).toBe("very_negative");
    expect(result.score).toBeLessThan(-2);
    expect(result.negativeCount).toBeGreaterThan(3);
  });

  it("should detect high confidence with many matched words", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "Amazing excellent fantastic wonderful beautiful perfect great",
      },
      mockContext,
    )) as {
      confidence: string;
      positiveCount: number;
    };

    // With 7+ matched positive words, should be high confidence
    expect(result.positiveCount).toBeGreaterThan(3);
    expect(result.confidence).toBe("high");
  });

  it("should detect low confidence with single matched word", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "This thing is good.",
      },
      mockContext,
    )) as {
      confidence: string;
      positiveCount: number;
    };

    expect(result.positiveCount).toBe(1);
    expect(result.confidence).toBe("low");
  });

  it("should detect medium confidence with 2-3 matched words", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {
        text: "This product is good and great.",
      },
      mockContext,
    )) as {
      confidence: string;
      positiveCount: number;
    };

    expect(result.positiveCount).toBe(2);
    expect(result.confidence).toBe("medium");
  });
});

// =============================================================================
// New Text Tools Tests
// =============================================================================

describe("pg_text_to_vector", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should convert text to tsvector with default config", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ vector: "'hello':1 'world':2" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_to_vector")!;
    const result = (await tool.handler(
      {
        text: "hello world",
      },
      mockContext,
    )) as {
      vector: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT to_tsvector($1, $2) as vector",
      ["english", "hello world"],
    );
    expect(result.vector).toBe("'hello':1 'world':2");
  });

  it("should use custom config when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ vector: "'hallo':1" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_to_vector")!;
    await tool.handler(
      {
        text: "hallo welt",
        config: "german",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT to_tsvector($1, $2) as vector",
      ["german", "hallo welt"],
    );
  });
});

describe("pg_text_to_query", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should convert text to tsquery with plain mode (default)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "'hello' & 'world'" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_to_query")!;
    const result = (await tool.handler(
      {
        text: "hello world",
      },
      mockContext,
    )) as {
      query: string;
      mode: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT plainto_tsquery($1, $2) as query",
      ["english", "hello world"],
    );
    expect(result.mode).toBe("plain");
  });

  it("should use phrase mode when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "'hello' <-> 'world'" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_to_query")!;
    const result = (await tool.handler(
      {
        text: "hello world",
        mode: "phrase",
      },
      mockContext,
    )) as {
      query: string;
      mode: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT phraseto_tsquery($1, $2) as query",
      ["english", "hello world"],
    );
    expect(result.mode).toBe("phrase");
  });

  it("should use websearch mode when specified", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "'hello' | 'world'" }],
    });

    const tool = tools.find((t) => t.name === "pg_text_to_query")!;
    const result = (await tool.handler(
      {
        text: "hello OR world",
        mode: "websearch",
      },
      mockContext,
    )) as {
      query: string;
      mode: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT websearch_to_tsquery($1, $2) as query",
      ["english", "hello OR world"],
    );
    expect(result.mode).toBe("websearch");
  });
});

describe("pg_text_search_config", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list available search configurations", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { name: "english", schema: "pg_catalog", description: "English" },
        { name: "german", schema: "pg_catalog", description: "German" },
        { name: "simple", schema: "pg_catalog", description: "Simple" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_text_search_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      configs: Array<{ name: string; schema: string; description: string }>;
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("pg_ts_config"),
    );
    expect(result.configs).toHaveLength(3);
    expect(result.count).toBe(3);
    expect(result.configs[0]?.name).toBe("english");
  });

  it("should return empty array when no configs found", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_text_search_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      configs: unknown[];
      count: number;
    };

    expect(result.configs).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// =============================================================================
// Structured Error Handling (parsePostgresError)
// =============================================================================

describe("Structured Error Handling (parsePostgresError)", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for 42P01 table-not-found in pg_text_search", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "body", query: "hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_trigram_similarity", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", value: "hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_create_fts_index", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "body" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_fuzzy_match", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", value: "hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_like_search", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", pattern: "%hello%" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_text_headline", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "body", query: "hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_regexp_match", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", pattern: "^hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured error for 42P01 table-not-found in pg_text_rank", async () => {
    const pgError = new Error(
      'relation "nonexistent" does not exist',
    ) as Error & { code: string };
    (pgError as unknown as Record<string, unknown>)["code"] = "42P01";
    mockAdapter.executeQuery.mockRejectedValue(pgError);

    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "body", query: "hello" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/does not exist.*pg_list_tables/i);
  });

  it("should return structured validation error for pg_fuzzy_match with invalid method", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      {
        table: "test_table",
        column: "name",
        value: "hello",
        method: "invalidmethod",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid method/i);
  });
});

// =============================================================================
// Branch Coverage Tests - text.ts edge cases
// =============================================================================

describe("text.ts branch coverage", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("pg_like_search should use case-sensitive LIKE when caseSensitive=true", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      { table: "t", column: "c", pattern: "%x%", caseSensitive: true },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain(" LIKE ");
    expect(sql).not.toContain("ILIKE");
  });

  it("pg_like_search limit:0 should throw validation error", async () => {
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(
      { table: "t", column: "c", pattern: "%x%", limit: 0 },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("greater than 0");
  });

  it("pg_like_search with where clause", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    await tool.handler(
      { table: "t", column: "c", pattern: "%x%", where: "id > 5" },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain("AND");
    expect(sql).toContain("id > 5");
  });

  it("pg_like_search truncation indicator when results equal limit", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ c: "x" }),
    });
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(
      { table: "t", column: "c", pattern: "%x%" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    expect(result.hint).toContain("Use a higher limit");
  });

  it("pg_trigram_similarity with where clause and limit:0 should validate", async () => {
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { table: "t", column: "c", value: "x", where: "active=true", limit: 0 },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("greater than 0");
  });

  it("pg_trigram_similarity truncation indicator", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ c: "x", similarity: 0.8 }),
    });
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { table: "t", column: "c", value: "x" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });

  it("pg_trigram_similarity select columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    await tool.handler(
      { table: "t", column: "c", value: "x", select: ["id", "name"] },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('"id", "name"');
  });

  it("pg_fuzzy_match with where clause and limit:0 should validate", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      {
        table: "t",
        column: "c",
        value: "x",
        where: "active=true",
        limit: 0,
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("greater than 0");
  });

  it("pg_fuzzy_match truncation indicator", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ c: "x", distance: 1 }),
    });
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      { table: "t", column: "c", value: "x" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });

  it("pg_fuzzy_match select columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    await tool.handler(
      { table: "t", column: "c", value: "x", select: ["id"] },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
  });

  it("pg_regexp_match with where clause and limit:0 should validate", async () => {
    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(
      { table: "t", column: "c", pattern: "^x", where: "id>1", limit: 0 },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("greater than 0");
  });

  it("pg_regexp_match truncation indicator", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ c: "x" }),
    });
    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(
      { table: "t", column: "c", pattern: "." },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });

  it("pg_text_headline with options string", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ headline: "test" }],
    });
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    await tool.handler(
      {
        table: "t",
        column: "c",
        query: "q",
        options: "MaxWords=10, MinWords=3",
      },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain("MaxWords=10, MinWords=3");
  });

  it("pg_text_headline with custom selectors", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    await tool.handler(
      {
        table: "t",
        column: "c",
        query: "q",
        startSel: "<em>",
        stopSel: "</em>",
        maxWords: 20,
        minWords: 5,
      },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain("StartSel=<em>");
    expect(sql).toContain("MaxWords=20");
  });

  it("pg_text_headline limit:0 and truncation", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ headline: "t" }),
    });
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      { table: "t", column: "c", query: "q" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });

  it("pg_text_headline with select columns", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    await tool.handler(
      { table: "t", column: "c", query: "q", select: ["id"] },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('"id"');
  });

  it("pg_create_fts_index with ifNotExists=false", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler(
      { table: "t", column: "c", ifNotExists: false },
      mockContext,
    )) as { success: boolean };
    expect(result.success).toBe(true);
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).not.toContain("IF NOT EXISTS");
  });

  it("pg_create_fts_index skipped when index already exists", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ "1": 1 }] }) // check query - exists
      .mockResolvedValueOnce({ rows: [] }); // create query
    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler(
      { table: "t", column: "c" },
      mockContext,
    )) as { skipped: boolean };
    expect(result.skipped).toBe(true);
  });

  it("pg_text_sentiment very_positive", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      { text: "amazing wonderful excellent great love happy best" },
      mockContext,
    )) as { sentiment: string };
    expect(result.sentiment).toBe("very_positive");
  });

  it("pg_text_sentiment very_negative", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      { text: "terrible horrible awful worst hate broken useless" },
      mockContext,
    )) as { sentiment: string };
    expect(result.sentiment).toBe("very_negative");
  });

  it("pg_text_sentiment high confidence", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      { text: "great good love happy amazing wonderful excellent best" },
      mockContext,
    )) as { confidence: string };
    expect(result.confidence).toBe("high");
  });

  it("pg_text_to_vector basic", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ vector: "'hello':1 'world':2" }],
    });
    const tool = tools.find((t) => t.name === "pg_text_to_vector")!;
    const result = (await tool.handler(
      { text: "hello world" },
      mockContext,
    )) as { vector: string };
    expect(result.vector).toBeDefined();
  });

  it("pg_text_to_query basic", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ query: "'hello' & 'world'" }],
    });
    const tool = tools.find((t) => t.name === "pg_text_to_query")!;
    const result = (await tool.handler(
      { text: "hello world" },
      mockContext,
    )) as { query: string };
    expect(result.query).toBeDefined();
  });

  it("pg_text_search_config basic", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ cfgname: "english" }],
    });
    const tool = tools.find((t) => t.name === "pg_text_search_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      configs: unknown[];
    };
    expect(result).toBeDefined();
  });

  it("pg_text_search with schema", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_text_search")!;
    await tool.handler(
      {
        table: "t",
        columns: ["c"],
        query: "q",
        schema: "myschema",
      },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('"myschema"');
  });

  it("pg_text_search truncation indicator", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ c: "x", rank: 0.5 }),
    });
    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      { table: "t", columns: ["c"], query: "q" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });

  it("pg_text_rank with schema and select", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    await tool.handler(
      {
        table: "t",
        column: "c",
        query: "q",
        schema: "s",
        select: ["id"],
      },
      mockContext,
    );
    const sql = mockAdapter.executeQuery.mock.calls[0][0] as string;
    expect(sql).toContain('"s"');
    expect(sql).toContain('"id"');
  });

  it("pg_text_rank limit:0 and truncation", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: Array(100).fill({ rank: 0.5 }),
    });
    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      { table: "t", column: "c", query: "q" },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
  });
});

// =============================================================================
// Text Tools - uncovered error paths
// =============================================================================

describe("text tools uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // search.ts L61-66: pg_text_search missing both column and columns
  it("should return error for pg_text_search without column or columns", async () => {
    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      { table: "users", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // search.ts L71-76: pg_text_search missing table
  it("should return error for pg_text_search without table or tableName", async () => {
    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      { column: "name", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // search.ts L128-133: pg_text_search DB error
  it("should return structured error for pg_text_search DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_text_search")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L191-196: pg_text_rank missing column/columns
  it("should return error for pg_text_rank without column or columns", async () => {
    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      { table: "users", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // search.ts L200-205: pg_text_rank missing table
  it("should return error for pg_text_rank without table", async () => {
    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      { column: "name", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // search.ts L257-263: pg_text_rank DB error
  it("should return structured error for pg_text_rank DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_text_rank")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "name", query: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L359-364: pg_text_headline missing table
  it("should return error for pg_text_headline without table", async () => {
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      { column: "content", query: "match" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // search.ts L366-371: pg_text_headline missing column or query
  it("should return error for pg_text_headline without column", async () => {
    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      { table: "articles", query: "match" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // search.ts L413-418: pg_text_headline ZodError
  it("should return structured error for pg_text_headline DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_text_headline")!;
    const result = (await tool.handler(
      { table: "articles", column: "content", query: "match" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L466-471: pg_create_fts_index missing table
  it("should return error for pg_create_fts_index without table", async () => {
    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler({ column: "name" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // search.ts L472-477: pg_create_fts_index missing column
  it("should return error for pg_create_fts_index without column", async () => {
    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // search.ts L508-521: pg_create_fts_index DB error
  it("should return structured error for pg_create_fts_index DB failure", async () => {
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [] }) // index doesn't exist
      .mockRejectedValueOnce(new Error("permission denied"));

    const tool = tools.find((t) => t.name === "pg_create_fts_index")!;
    const result = (await tool.handler(
      { table: "users", column: "name" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  // search.ts L563-569: pg_text_normalize ZodError/DB error
  it("should return structured error for pg_text_normalize failure", async () => {
    const tool = tools.find((t) => t.name === "pg_text_normalize")!;
    const result = (await tool.handler(
      {}, // missing text
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L623-629: pg_text_to_vector ZodError
  it("should return structured error for pg_text_to_vector validation failure", async () => {
    const tool = tools.find((t) => t.name === "pg_text_to_vector")!;
    const result = (await tool.handler(
      {}, // missing text
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L708-714: pg_text_to_query ZodError
  it("should return structured error for pg_text_to_query validation failure", async () => {
    const tool = tools.find((t) => t.name === "pg_text_to_query")!;
    const result = (await tool.handler(
      {}, // missing text
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // search.ts L757: pg_text_search_config DB error
  it("should return structured error for pg_text_search_config DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("permission denied"),
    );

    const tool = tools.find((t) => t.name === "pg_text_search_config")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });
});

// =============================================================================
// text/matching.ts - uncovered error paths
// =============================================================================

describe("text matching uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getTextTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getTextTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // matching.ts L83-88: trigram_similarity missing table
  it("should return error for pg_trigram_similarity without table", async () => {
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { column: "name", value: "test" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // matching.ts L90-94: trigram_similarity missing column/value
  it("should return error for pg_trigram_similarity without column/value", async () => {
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { table: "users", value: "test" }, // missing column
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // matching.ts L123-128: trigram_similarity ZodError
  it("should return structured error for pg_trigram_similarity ZodError", async () => {
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    // Pass something that makes the preprocess schema reject
    const result = (await tool.handler(null, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L130-135: trigram_similarity DB error
  it("should return structured error for pg_trigram_similarity DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("extension not found"),
    );
    const tool = tools.find((t) => t.name === "pg_trigram_similarity")!;
    const result = (await tool.handler(
      { table: "users", column: "name", value: "test" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L232-237: fuzzy_match missing table
  it("should return error for pg_fuzzy_match without table", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      { column: "name", value: "test" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // matching.ts L240-244: fuzzy_match missing column/value
  it("should return error for pg_fuzzy_match without column/value", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      { table: "users" }, // missing column and value
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // matching.ts L278-282: fuzzy_match ZodError
  it("should return structured error for pg_fuzzy_match ZodError", async () => {
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(null, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L284-289: fuzzy_match DB error
  it("should return structured error for pg_fuzzy_match DB failure", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("extension not found"),
    );
    const tool = tools.find((t) => t.name === "pg_fuzzy_match")!;
    const result = (await tool.handler(
      { table: "users", column: "name", value: "test" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L316-320: regexp_match missing table
  it("should return error for pg_regexp_match without table", async () => {
    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(
      { column: "name", pattern: "test.*" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // matching.ts L323-327: regexp_match missing column/pattern
  it("should return error for pg_regexp_match without column/pattern", async () => {
    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // matching.ts L370-374: regexp_match ZodError
  it("should return structured error for pg_regexp_match ZodError", async () => {
    const tool = tools.find((t) => t.name === "pg_regexp_match")!;
    const result = (await tool.handler(null, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L432-436: like_search missing table
  it("should return error for pg_like_search without table", async () => {
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(
      { column: "name", pattern: "%test%" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("table");
  });

  // matching.ts L439-443: like_search missing column/pattern
  it("should return error for pg_like_search without column/pattern", async () => {
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler({ table: "users" }, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain("column");
  });

  // matching.ts L486-490: like_search ZodError
  it("should return structured error for pg_like_search ZodError", async () => {
    const tool = tools.find((t) => t.name === "pg_like_search")!;
    const result = (await tool.handler(null, mockContext)) as {
      success: boolean;
      error: string;
    };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L642-648: sentiment ZodError (missing text)
  it("should return structured error for pg_text_sentiment validation failure", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      {}, // missing text
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // matching.ts L648-652: sentiment general error
  it("should return error for pg_text_sentiment non-Zod error", async () => {
    const tool = tools.find((t) => t.name === "pg_text_sentiment")!;
    const result = (await tool.handler(
      { text: null }, // triggers error in handler
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
