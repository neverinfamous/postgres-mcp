/**
 * postgres-mcp - Statistics Tools Unit Tests
 *
 * Tests for PostgreSQL statistical analysis tools including
 * descriptive statistics, percentiles, correlation, and regression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getStatsTools } from "../index.js";
import type { PostgresAdapter } from "../../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../../__tests__/mocks/index.js";

describe("getStatsTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getStatsTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getStatsTools(adapter);
  });

  it("should return 8 stats tools", () => {
    expect(tools).toHaveLength(8);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_stats_descriptive");
    expect(toolNames).toContain("pg_stats_percentiles");
    expect(toolNames).toContain("pg_stats_correlation");
    expect(toolNames).toContain("pg_stats_regression");
    expect(toolNames).toContain("pg_stats_time_series");
    expect(toolNames).toContain("pg_stats_distribution");
    expect(toolNames).toContain("pg_stats_hypothesis");
    expect(toolNames).toContain("pg_stats_sampling");
  });

  it("should have group set to stats for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("stats");
    }
  });
});

describe("pg_stats_descriptive", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should calculate descriptive statistics", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          count: 100,
          min: 10,
          max: 500,
          avg: 150.5,
          stddev: 45.2,
          variance: 2043.04,
          sum: 15050,
          mode: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
      },
      mockContext,
    )) as {
      table: string;
      column: string;
      statistics: {
        count: number;
        min: number;
        max: number;
        avg: number;
        stddev: number;
      };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("COUNT"),
    );
    expect(result.statistics.count).toBe(100);
    expect(result.statistics.min).toBe(10);
    expect(result.statistics.max).toBe(500);
  });

  it("should apply where clause", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          count: 50,
          min: 10,
          max: 250,
          avg: 100,
          stddev: 30,
          variance: 900,
          sum: 5000,
          mode: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        where: "status = 'completed'",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should return grouped statistics when groupBy is provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          group_key: "A",
          count: 50,
          min: 10,
          max: 250,
          avg: 100,
          stddev: 30,
          variance: 900,
          sum: 5000,
          mode: 100,
        },
        {
          group_key: "B",
          count: 50,
          min: 20,
          max: 300,
          avg: 150,
          stddev: 40,
          variance: 1600,
          sum: 7500,
          mode: 150,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
        groupBy: "category",
      },
      mockContext,
    )) as {
      groups: Array<{ groupKey: string; statistics: { count: number } }>;
      count: number;
    };

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groups[0].groupKey).toBe("A");
    expect(result.groups[0].statistics.count).toBe(50);
    expect(result.groups[1].groupKey).toBe("B");
  });

  it("should throw error when table does not exist", async () => {
    // Mock column type check - column not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // No column found
    });
    // Mock table check - table also not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // Table doesn't exist
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;

    const result = (await tool.handler(
      {
        table: "nonexistent_table",
        column: "amount",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Table "public.nonexistent_table" not found',
    );
  });

  it("should throw error when column does not exist", async () => {
    // Mock column type check - column not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // No column found
    });
    // Mock table check - table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }], // Table exists
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;

    const result = (await tool.handler(
      {
        table: "orders",
        column: "nonexistent_column",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Column "nonexistent_column" not found in table "public.orders"',
    );
  });

  it("should throw error for non-numeric column type", async () => {
    // Mock column type check - column exists but is text
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "text" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;

    const result = (await tool.handler(
      {
        table: "orders",
        column: "customer_name",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Column "customer_name" is type "text" but must be a numeric type',
    );
  });
});

describe("pg_stats_percentiles", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should calculate default percentiles", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ p25: 50, p50: 100, p75: 200 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
      },
      mockContext,
    )) as {
      percentiles: Record<string, number>;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("PERCENTILE_CONT"),
    );
    expect(result.percentiles).toHaveProperty("p25");
    expect(result.percentiles).toHaveProperty("p50");
    expect(result.percentiles).toHaveProperty("p75");
  });

  it("should calculate custom percentiles", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ p10: 20, p90: 400 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        percentiles: [0.1, 0.9],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("0.1"),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("0.9"),
    );
  });

  it("should throw error when table does not exist via validateNumericColumn", async () => {
    // Mock column type check - column not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // No column found
    });
    // Mock table check - table also not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // Table doesn't exist
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;

    const result = (await tool.handler(
      {
        table: "missing_table",
        column: "value",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Table "public.missing_table" not found');
  });

  it("should throw error for non-numeric column in percentiles", async () => {
    // Mock column type check - column exists but is text
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "varchar" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;

    const result = (await tool.handler(
      {
        table: "users",
        column: "email",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Column "email" is type "varchar" but must be a numeric',
    );
  });
});

describe("pg_stats_correlation", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should calculate correlation", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 0.85,
          covariance_pop: 1500.5,
          covariance_sample: 1510.2,
          sample_size: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "products",
        column1: "price",
        column2: "sales",
      },
      mockContext,
    )) as {
      correlation: number;
      interpretation: string;
      sampleSize: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("CORR"),
    );
    expect(result.correlation).toBe(0.85);
    expect(result.interpretation).toContain("Strong");
    expect(result.sampleSize).toBe(100);
  });

  it("should interpret negative correlation", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: -0.75,
          covariance_pop: -1200,
          covariance_sample: -1210,
          sample_size: 80,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "products",
        column1: "price",
        column2: "demand",
      },
      mockContext,
    )) as {
      correlation: number;
      interpretation: string;
    };

    expect(result.correlation).toBe(-0.75);
    expect(result.interpretation).toContain("negative");
  });

  it("should throw table-not-found error for nonexistent table", async () => {
    // Mock column type check - column not found (table doesn't exist)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // No column found
    });
    // Mock table check - table also not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // Table doesn't exist
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;

    const result = (await tool.handler(
      {
        table: "nonexistent_table",
        column1: "price",
        column2: "sales",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Table "public.nonexistent_table" not found',
    );
  });

  it("should throw column-not-found error for nonexistent column", async () => {
    // Mock first column type check - column not found
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [], // No column found
    });
    // Mock table check - table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }], // Table exists
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;

    const result = (await tool.handler(
      {
        table: "products",
        column1: "nonexistent_col",
        column2: "sales",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain(
      'Column "nonexistent_col" not found in table "public.products"',
    );
  });
});

describe("pg_stats_regression", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should perform linear regression", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          slope: 2.5,
          intercept: 10.0,
          r_squared: 0.92,
          avg_x: 50,
          avg_y: 135,
          sample_size: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    const result = (await tool.handler(
      {
        table: "sales",
        xColumn: "advertising",
        yColumn: "revenue",
      },
      mockContext,
    )) as {
      regression: {
        slope: number;
        intercept: number;
        rSquared: number;
        equation: string;
      };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("REGR_SLOPE"),
    );
    expect(result.regression.slope).toBe(2.5);
    expect(result.regression.intercept).toBe(10.0);
    expect(result.regression.rSquared).toBe(0.92);
    expect(result.regression.equation).toContain("y =");
  });
});

describe("pg_stats_time_series", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should analyze time series data", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock totalCount query (when using default limit)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_buckets: 2 }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { time_bucket: new Date("2024-01-01"), value: 100, count: 10 },
        { time_bucket: new Date("2024-02-01"), value: 110, count: 12 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "month",
      },
      mockContext,
    )) as {
      buckets: unknown[];
      truncated?: boolean;
      totalCount?: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.buckets).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.totalCount).toBe(2);
  });

  it("should return grouped time series when groupBy is provided", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock total group count query (for groupLimit truncation indicator)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_groups: 2 }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { group_key: "A", time_bucket: "2024-01-01", value: 100, count: 10 },
        { group_key: "A", time_bucket: "2024-02-01", value: 110, count: 12 },
        { group_key: "B", time_bucket: "2024-01-01", value: 50, count: 5 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        groupBy: "category",
      },
      mockContext,
    )) as {
      groups: Array<{ groupKey: string; buckets: unknown[] }>;
      count: number;
      truncated?: boolean;
      totalGroupCount?: number;
    };

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groups[0].groupKey).toBe("A");
    expect(result.groups[0].buckets).toHaveLength(2);
    expect(result.truncated).toBe(false);
    expect(result.totalGroupCount).toBe(2);
  });

  // Parameter smoothing tests
  it('should accept PostgreSQL-style interval "1 day" and normalize to "day"', async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "1 day", // Common agent mistake - should be normalized
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("DATE_TRUNC('day',"),
    );
  });

  it('should accept "2 hours" and normalize to "hour"', async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "2 hours",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("DATE_TRUNC('hour',"),
    );
  });

  it('should accept plural form "days" and normalize to "day"', async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "days",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("DATE_TRUNC('day',"),
    );
  });

  it('should handle uppercase interval "DAY"', async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "DAY",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("DATE_TRUNC('day',"),
    );
  });
});

describe("pg_stats_distribution", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should calculate distribution", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ min_val: 0, max_val: 100 }] })
      .mockResolvedValueOnce({
        rows: [
          { bucket: 1, frequency: 20, bucket_min: 0, bucket_max: 33 },
          { bucket: 2, frequency: 50, bucket_min: 33, bucket_max: 66 },
          { bucket: 3, frequency: 30, bucket_min: 66, bucket_max: 100 },
        ],
      });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
        buckets: 10,
      },
      mockContext,
    )) as {
      histogram: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.histogram).toBeDefined();
  });

  it("should return skewness and kurtosis in distribution output", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery
      .mockResolvedValueOnce({
        rows: [
          {
            min_val: 0,
            max_val: 100,
            mean: 50,
            stddev: 25,
            n: 100,
            skewness: 0.5,
            kurtosis: -0.3,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ bucket: 1, frequency: 50, bucket_min: 0, bucket_max: 100 }],
      });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
      },
      mockContext,
    )) as {
      histogram: unknown[];
      skewness: number | null;
      kurtosis: number | null;
    };

    expect(result.histogram).toBeDefined();
    expect(result.skewness).toBe(0.5);
    expect(result.kurtosis).toBe(-0.3);
  });
});

describe("pg_stats_hypothesis", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should perform hypothesis test", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as {
      results: { testStatistic: number };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.results).toHaveProperty("testStatistic");
  });

  // Parameter smoothing tests
  it('should accept "ttest" and normalize to "t_test"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "ttest", // Common agent mistake - should be normalized
        hypothesizedMean: 95,
      },
      mockContext,
    )) as {
      testType: string;
      results: { testStatistic: number };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalled();
    expect(result.testType).toBe("t_test");
  });

  it('should accept "t-test" and normalize to "t_test"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t-test",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as {
      testType: string;
    };

    expect(result.testType).toBe("t_test");
  });

  it('should accept "ztest" and normalize to "z_test"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "ztest",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as {
      testType: string;
    };

    expect(result.testType).toBe("z_test");
  });

  it('should accept uppercase "T_TEST"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "T_TEST",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as {
      testType: string;
    };

    expect(result.testType).toBe("t_test");
  });

  it('should accept bare "t" shorthand and normalize to "t_test"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as { testType: string };

    expect(result.testType).toBe("t_test");
  });

  it('should accept bare "z" shorthand and normalize to "z_test"', async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "z",
        hypothesizedMean: 95,
      },
      mockContext,
    )) as { testType: string };

    expect(result.testType).toBe("z_test");
  });
});

describe("pg_stats_sampling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should sample from table using random method", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 5 }, { id: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    const result = (await tool.handler(
      {
        table: "users",
        sampleSize: 100,
      },
      mockContext,
    )) as {
      rows: unknown[];
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("RANDOM()"),
    );
    expect(result.rows).toBeDefined();
  });

  it("should use ORDER BY RANDOM() LIMIT when sampleSize is provided with any method", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    const result = (await tool.handler(
      {
        table: "users",
        method: "bernoulli", // Even with bernoulli, sampleSize forces RANDOM()
        sampleSize: 10,
      },
      mockContext,
    )) as {
      rows: unknown[];
      note?: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("ORDER BY RANDOM()"),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 10"),
    );
    expect(result.note).toContain("exact");
  });

  it("should use TABLESAMPLE for bernoulli method", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
        method: "bernoulli",
        percentage: 10,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("TABLESAMPLE"),
    );
  });
});

// =============================================================================
// Branch Coverage Tests - Correlation Interpretation
// =============================================================================

describe("pg_stats_correlation interpretation branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should interpret very strong correlation (absCorr >= 0.9)", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 0.95,
          covariance_pop: 2000,
          covariance_sample: 2010,
          sample_size: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { interpretation: string };

    expect(result.interpretation).toContain("Very strong");
    expect(result.interpretation).toContain("positive");
  });

  it("should interpret moderate correlation (0.5 <= absCorr < 0.7)", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 0.55,
          covariance_pop: 500,
          covariance_sample: 510,
          sample_size: 50,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { interpretation: string };

    expect(result.interpretation).toContain("Moderate");
    expect(result.interpretation).toContain("positive");
  });

  it("should interpret weak correlation (0.3 <= absCorr < 0.5)", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: -0.35,
          covariance_pop: -100,
          covariance_sample: -105,
          sample_size: 40,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { interpretation: string };

    expect(result.interpretation).toContain("Weak");
    expect(result.interpretation).toContain("negative");
  });

  it("should interpret very weak correlation (absCorr < 0.3)", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 0.15,
          covariance_pop: 20,
          covariance_sample: 25,
          sample_size: 30,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { interpretation: string };

    expect(result.interpretation).toContain("Very weak");
  });

  it("should handle null/empty rows gracefully", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;

    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "a" not found');
  });
});

// =============================================================================
// Branch Coverage Tests - Regression Equation Formatting
// =============================================================================

describe("pg_stats_regression equation branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should format equation with negative intercept", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          slope: 3.0,
          intercept: -5.0,
          r_squared: 0.88,
          avg_x: 25,
          avg_y: 70,
          sample_size: 50,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    const result = (await tool.handler(
      {
        table: "data",
        xColumn: "x",
        yColumn: "y",
      },
      mockContext,
    )) as { regression: { equation: string; intercept: number } };

    expect(result.regression.intercept).toBe(-5.0);
    // Equation should show minus sign properly: "y = 3.00x - 5.00"
    expect(result.regression.equation).toMatch(/y.*=.*3.*x.*-.*5/);
  });

  it("should handle empty rows gracefully", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;

    const result = (await tool.handler(
      {
        table: "data",
        xColumn: "x",
        yColumn: "y",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "x" not found');
  });
});

// =============================================================================
// Branch Coverage Tests - Optional Parameters
// =============================================================================

describe("pg_stats_descriptive optional params", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include schema prefix when schema is provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          count: 100,
          min: 1,
          max: 100,
          avg: 50,
          stddev: 10,
          variance: 100,
          sum: 5000,
          mode: 50,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        schema: "sales",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"sales".'),
    );
  });

  it("should include where clause when provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          count: 50,
          min: 10,
          max: 200,
          avg: 100,
          stddev: 20,
          variance: 400,
          sum: 5000,
          mode: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        where: "status = 'active'",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should return error when no stats found", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;

    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "amount" not found');
  });
});

describe("pg_stats_percentiles optional params", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include schema and where clause when provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ p25: 25, p50: 50, p75: 75 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        schema: "sales",
        where: "amount > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"sales".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });
});

describe("pg_stats_correlation optional params", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include schema and where clause when provided", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 0.8,
          covariance_pop: 100,
          covariance_sample: 110,
          sample_size: 50,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    await tool.handler(
      {
        table: "products",
        column1: "price",
        column2: "sales",
        schema: "inventory",
        where: "price > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"inventory".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should return error when no correlation data found", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;

    const result = (await tool.handler(
      {
        table: "test",
        column1: "a",
        column2: "b",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "a" not found');
  });
});

describe("pg_stats_regression optional params", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should include schema and where clause when provided", async () => {
    // Mock column type checks (2 columns)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          slope: 2.5,
          intercept: 10,
          r_squared: 0.9,
          avg_x: 50,
          avg_y: 135,
          sample_size: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    await tool.handler(
      {
        table: "sales",
        xColumn: "advertising",
        yColumn: "revenue",
        schema: "marketing",
        where: "revenue > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"marketing".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should return error when no regression data found", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;

    const result = (await tool.handler(
      {
        table: "data",
        xColumn: "x",
        yColumn: "y",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "x" not found');
  });
});

// =============================================================================
// Branch Coverage Tests - Advanced Stats Tools
// =============================================================================

describe("pg_stats_distribution error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when column has no data", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data with null min/max
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ min_val: null, max_val: null }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
      },
      mockContext,
    )) as { error?: string };

    expect(result.error).toBe("No data or all nulls in column");
  });

  it("should include schema and where clause when provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery
      .mockResolvedValueOnce({ rows: [{ min_val: 0, max_val: 100 }] })
      .mockResolvedValueOnce({
        rows: [{ bucket: 1, frequency: 50, bucket_min: 0, bucket_max: 50 }],
      });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        schema: "sales",
        where: "amount > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"sales".'),
    );
  });

  it("should return clean validation error for buckets: 0", async () => {
    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      { table: "orders", column: "amount", buckets: 0 },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("buckets must be greater than 0");
    expect(result.error).not.toContain('"code"'); // Should not contain raw JSON
  });
});

describe("pg_stats_hypothesis error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error when no data found", async () => {
    // Mock column type check returns no row (column not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock table exists check
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;

    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain('Column "value" not found');
  });

  it("should return error when insufficient data (n < 2)", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 1, mean: 50, stddev: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { error?: string; sampleSize?: number };

    expect(result.error).toBe("Insufficient data or zero variance");
    expect(result.sampleSize).toBe(1);
  });

  it("should return error when zero variance", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 100, stddev: 0 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { error?: string };

    expect(result.error).toBe("Insufficient data or zero variance");
  });

  it("should include schema and where clause when provided", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 105, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "z_test",
        hypothesizedMean: 100,
        schema: "testing",
        where: "value > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"testing".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should indicate potential significance when |testStatistic| > 1.96", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 100, mean: 110, stddev: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { results: { interpretation: string } };

    expect(result.results.interpretation).toMatch(/significant/i);
  });

  it("should indicate no significance when |testStatistic| <= 1.96", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 100, mean: 101, stddev: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { results: { interpretation: string } };

    expect(result.results.interpretation).toMatch(/not significant/i);
  });
});

describe("pg_stats_sampling additional branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use TABLESAMPLE for system method", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
        method: "system",
        percentage: 5,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("TABLESAMPLE SYSTEM"),
    );
  });

  it("should use default percentage for bernoulli/system when not provided", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
        method: "bernoulli",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("(10)"), // default percentage
    );
  });

  it("should select specific columns when select param provided", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "Test" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
        select: ["id", "name"],
        sampleSize: 10,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"id"'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"name"'),
    );
  });

  it("should include schema and where clause when provided", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
        schema: "accounts",
        where: "active = true",
        sampleSize: 50,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"accounts".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should use default sampleSize for random method when not provided", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    await tool.handler(
      {
        table: "users",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 20"), // default sampleSize (optimized for LLM context)
    );
  });
});

describe("pg_stats_time_series optional params", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should use custom aggregation function when provided", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 1000, count: 50 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        aggregation: "sum",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("SUM"),
    );
  });

  it("should include schema and where clause when provided", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "hour",
        schema: "reporting",
        where: "amount > 0",
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('"reporting".'),
    );
    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE"),
    );
  });

  it("should use custom limit when provided", async () => {
    // Mock table existence check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ "1": 1 }],
    });
    // Mock timeColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    // Mock valueColumn type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Mock actual data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "week",
        limit: 50,
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT 50"),
    );
  });

  it("should handle limit:0 for no limit", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: "2024-01-01", value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        limit: 0,
      },
      mockContext,
    )) as Record<string, unknown>;
    // With limit:0, no LIMIT clause should be present, and no truncation
    expect(result.buckets).toBeDefined();
  });

  it("should handle groupBy with groupLimit", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    // Group count query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total_groups: "5" }],
    });
    // Grouped results
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { group_key: "A", time_bucket: "2024-01-01", value: 100, count: 10 },
        { group_key: "A", time_bucket: "2024-01-02", value: 200, count: 20 },
        { group_key: "B", time_bucket: "2024-01-01", value: 50, count: 5 },
        { group_key: "C", time_bucket: "2024-01-01", value: 75, count: 8 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        groupBy: "category",
        groupLimit: 2,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    const groups = result.groups as unknown[];
    expect(groups.length).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.totalGroupCount).toBe(5);
  });

  it("should handle Date objects in time_bucket", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: new Date("2024-01-01"), value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        limit: 10,
      },
      mockContext,
    )) as Record<string, unknown>;
    const buckets = result.buckets as { timeBucket: string }[];
    expect(buckets[0].timeBucket).toContain("2024");
  });

  it("should handle null time_bucket value", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "numeric" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ time_bucket: null, value: 100, count: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "amount",
        interval: "day",
        limit: 10,
      },
      mockContext,
    )) as Record<string, unknown>;
    const buckets = result.buckets as { timeBucket: string }[];
    expect(buckets[0].timeBucket).toBe("");
  });

  it("should return error for non-timestamp timeColumn", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "amount",
        valueColumn: "price",
        interval: "day",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("timestamp");
  });

  it("should return error for non-numeric valueColumn", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "text" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "sale_date",
        valueColumn: "name",
        interval: "day",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("numeric");
  });

  it("should return error for missing timeColumn", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "nonexistent",
        valueColumn: "amount",
        interval: "day",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should return error for missing valueColumn", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "timestamp without time zone" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_time_series")!;
    const result = (await tool.handler(
      {
        table: "sales",
        timeColumn: "created_at",
        valueColumn: "nonexistent",
        interval: "day",
      },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("pg_stats_distribution groupBy", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped distribution data with groupLimit", async () => {
    // Mock column type check
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Mock SELECT DISTINCT groups
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ group_key: "A" }, { group_key: "B" }, { group_key: "C" }],
    });
    // Mock computeMoments for group A (only 1 due to groupLimit)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ min_val: 0, max_val: 100, skewness: 0.5, kurtosis: -0.2 }],
    });
    // Mock histogram for group A
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ bucket: 1, frequency: 50, bucket_min: 0, bucket_max: 50 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
        groupBy: "category",
        groupLimit: 1,
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    expect(result.truncated).toBe(true);
    expect(result.totalGroupCount).toBe(3);
  });

  it("should handle null moments in distribution group", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // SELECT DISTINCT groups
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ group_key: "A" }],
    });
    // Moments return null (no data in group)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ min_val: null, max_val: null }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_distribution")!;
    const result = (await tool.handler(
      {
        table: "orders",
        column: "amount",
        groupBy: "category",
      },
      mockContext,
    )) as Record<string, unknown>;

    // Group with null moments is skipped (continue), so groups array should be empty
    const groups = result.groups as unknown[];
    expect(groups.length).toBe(0);
  });
});

describe("pg_stats_hypothesis groupBy", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped hypothesis results", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    // Grouped data
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { group_key: "A", n: 50, mean: 110, stddev: 15 },
        { group_key: "B", n: 30, mean: 95, stddev: 10 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
        groupBy: "category",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    const groups = result.groups as { groupKey: string }[];
    expect(groups[0].groupKey).toBe("A");
    expect(groups[1].groupKey).toBe("B");
  });

  it("should return z_test results with groupBy", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ group_key: "X", n: 100, mean: 120, stddev: 20 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "z_test",
        hypothesizedMean: 100,
        groupBy: "region",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
  });
});

describe("pg_stats_sampling error paths", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return error for missing table", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('relation "nonexistent" does not exist'),
    );

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    const result = (await tool.handler(
      { table: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };
    expect(result.success).toBe(false);
  });

  it("should handle columns list in random sampling", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: "test" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    const result = (await tool.handler(
      {
        table: "users",
        select: ["id", "name"],
        method: "random",
        sampleSize: 5,
        where: "active = true",
        schema: "app",
      },
      mockContext,
    )) as Record<string, unknown>;
    expect(result.rows).toBeDefined();
  });
});

// =============================================================================
// Branch Coverage Tests - stats/basic.ts groupBy + edge paths
// =============================================================================

describe("pg_stats_descriptive groupBy", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped descriptive statistics", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          group_key: "A",
          count: 50,
          min: 1,
          max: 100,
          avg: 50,
          stddev: 10,
          variance: 100,
          sum: 2500,
          mode: 50,
        },
        {
          group_key: "B",
          count: 30,
          min: 5,
          max: 90,
          avg: 45,
          stddev: 8,
          variance: 64,
          sum: 1350,
          mode: null,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      { table: "orders", column: "amount", groupBy: "category" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groupBy).toBe("category");
  });

  it("should pass queryParams for grouped queries", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    await tool.handler(
      {
        table: "orders",
        column: "amount",
        groupBy: "cat",
        where: "id > $1",
        params: [10],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY"),
      [10],
    );
  });
});

describe("pg_stats_percentiles groupBy", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped percentiles", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { group_key: "X", p25: 25, p50: 50, p75: 75 },
        { group_key: "Y", p25: 10, p50: 30, p75: 60 },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    const result = (await tool.handler(
      { table: "scores", column: "value", groupBy: "region" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groupBy).toBe("region");
  });

  it("should handle null percentile values in groups", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ group_key: "Z", p25: null, p50: null, p75: null }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    const result = (await tool.handler(
      { table: "scores", column: "value", groupBy: "region" },
      mockContext,
    )) as Record<string, unknown>;

    const groups = result.groups as { percentiles: Record<string, unknown> }[];
    expect(groups[0].percentiles.p25).toBeNull();
  });

  it("should pass queryParams for grouped percentile queries", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_percentiles")!;
    await tool.handler(
      {
        table: "scores",
        column: "value",
        groupBy: "region",
        where: "id > $1",
        params: [5],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY"),
      [5],
    );
  });
});

describe("pg_stats_correlation groupBy", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped correlation results", async () => {
    // Two column type checks
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          group_key: "A",
          correlation: 0.9,
          covariance_pop: 100,
          covariance_sample: 110,
          sample_size: 50,
        },
        {
          group_key: "B",
          correlation: -0.5,
          covariance_pop: -50,
          covariance_sample: -55,
          sample_size: 30,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      {
        table: "data",
        column1: "x",
        column2: "y",
        groupBy: "category",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groupBy).toBe("category");
  });

  it("should add self-correlation note", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: 1.0,
          covariance_pop: 100,
          covariance_sample: 101,
          sample_size: 100,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      { table: "data", column1: "x", column2: "x" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.note).toBe("Self-correlation always equals 1.0");
  });

  it("should handle null correlation in interpretation", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          correlation: null,
          covariance_pop: null,
          covariance_sample: null,
          sample_size: 1,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    const result = (await tool.handler(
      { table: "data", column1: "x", column2: "y" },
      mockContext,
    )) as { interpretation: string };

    expect(result.interpretation).toBe("N/A");
  });

  it("should interpret various correlation strengths", async () => {
    const testCases = [
      { corr: 0.95, expected: "Very strong" },
      { corr: 0.75, expected: "Strong" },
      { corr: 0.55, expected: "Moderate" },
      { corr: 0.35, expected: "Weak" },
      { corr: 0.1, expected: "Very weak" },
      { corr: -0.8, expected: "Strong" },
    ];

    for (const tc of testCases) {
      vi.clearAllMocks();
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "integer" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ data_type: "integer" }],
      });
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            correlation: tc.corr,
            covariance_pop: 1,
            covariance_sample: 1,
            sample_size: 100,
          },
        ],
      });

      const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
      const result = (await tool.handler(
        { table: "data", column1: "x", column2: "y" },
        mockContext,
      )) as { interpretation: string };

      expect(result.interpretation).toContain(tc.expected);
    }
  });

  it("should pass queryParams for grouped correlation queries", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_correlation")!;
    await tool.handler(
      {
        table: "data",
        column1: "x",
        column2: "y",
        groupBy: "cat",
        where: "id > $1",
        params: [5],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY"),
      [5],
    );
  });
});

describe("pg_stats_regression groupBy + edges", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return grouped regression results", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          group_key: "A",
          slope: 2.5,
          intercept: 10,
          r_squared: 0.9,
          avg_x: 50,
          avg_y: 135,
          sample_size: 100,
        },
        {
          group_key: "B",
          slope: null,
          intercept: null,
          r_squared: null,
          avg_x: null,
          avg_y: null,
          sample_size: 1,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    const result = (await tool.handler(
      {
        table: "sales",
        xColumn: "x",
        yColumn: "y",
        groupBy: "category",
      },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.groups).toBeDefined();
    expect(result.count).toBe(2);
    expect(result.groupBy).toBe("category");
  });

  it("should add self-regression note", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          slope: 1,
          intercept: 0,
          r_squared: 1,
          avg_x: 50,
          avg_y: 50,
          sample_size: 100,
          sum_squares_x: 1,
          sum_squares_y: 1,
          sum_products: 1,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    const result = (await tool.handler(
      { table: "data", xColumn: "x", yColumn: "x" },
      mockContext,
    )) as Record<string, unknown>;

    expect(result.note).toBe("Self-regression always returns slope=1, r²=1");
  });

  it("should handle negative intercept in equation", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          slope: 3.5,
          intercept: -7.2,
          r_squared: 0.85,
          avg_x: 10,
          avg_y: 28,
          sample_size: 50,
          sum_squares_x: 1,
          sum_squares_y: 1,
          sum_products: 1,
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    const result = (await tool.handler(
      { table: "data", xColumn: "x", yColumn: "y" },
      mockContext,
    )) as { regression: { equation: string } };

    expect(result.regression.equation).toContain("-");
    expect(result.regression.equation).toContain("3.5000");
  });

  it("should pass queryParams for grouped regression queries", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_regression")!;
    await tool.handler(
      {
        table: "data",
        xColumn: "x",
        yColumn: "y",
        groupBy: "cat",
        where: "id > $1",
        params: [5],
      },
      mockContext,
    );

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("GROUP BY"),
      [5],
    );
  });
});

// =============================================================================
// stats/math-utils.ts — uncovered branches (L123: negative t, L228: table not
// found, L236: non-numeric column, L260: validateTableExists)
// =============================================================================
describe("math-utils.ts — uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getStatsTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getStatsTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // L123: negative t-statistic triggers the else path in tDistributionCDF
  it("pg_stats_hypothesis should handle negative t-statistic (mean < hypothesized)", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 50, mean: 80, stddev: 15 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "scores",
        column: "value",
        testType: "t_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as {
      results: { testStatistic: number; pValue: number };
    };

    // mean=80 < hypothesized=100, so t should be negative
    expect(result.results.testStatistic).toBeLessThan(0);
    expect(result.results.pValue).toBeGreaterThanOrEqual(0);
    expect(result.results.pValue).toBeLessThanOrEqual(1);
  });

  // L228: validateNumericColumn — table not found
  it("pg_stats_descriptive should error for nonexistent table", async () => {
    // Column type check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Table existence check also returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      { table: "nonexistent", column: "val" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  // L230-232: validateNumericColumn — column not found (but table exists)
  it("pg_stats_descriptive should error for nonexistent column", async () => {
    // Column type check returns no rows
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Table exists
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [{ "1": 1 }] });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      { table: "users", column: "nonexistent" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).toContain("nonexistent");
  });

  // L235-239: validateNumericColumn — non-numeric column
  it("pg_stats_descriptive should error for non-numeric column type", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "text" }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_descriptive")!;
    const result = (await tool.handler(
      { table: "users", column: "name" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain("numeric type");
  });

  // L259-261: validateTableExists — table not found
  it("pg_stats_sampling should error for nonexistent table via validateTableExists", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error('relation "missing_table" does not exist'),
    );

    const tool = tools.find((t) => t.name === "pg_stats_sampling")!;
    const result = (await tool.handler(
      { table: "missing_table" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
  });

  // incompleteBeta boundary: x=0 and x=1
  it("pg_stats_hypothesis z_test should produce valid p-value for large z", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ data_type: "integer" }],
    });
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ n: 100, mean: 200, stddev: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_stats_hypothesis")!;
    const result = (await tool.handler(
      {
        table: "metrics",
        column: "value",
        testType: "z_test",
        hypothesizedMean: 100,
      },
      mockContext,
    )) as { results: { pValue: number } };

    // z = (200-100)/(10/sqrt(100)) = 100, extreme value
    expect(result.results.pValue).toBeGreaterThanOrEqual(0);
    expect(result.results.pValue).toBeLessThanOrEqual(1);
  });
});
