/**
 * postgres-mcp - Cron Tools Unit Tests
 *
 * Tests for PostgreSQL pg_cron extension tools with focus on
 * job scheduling, management, and execution history.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCronTools } from "../cron/index.js";
import type { PostgresAdapter } from "../../PostgresAdapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";

describe("getCronTools", () => {
  let adapter: PostgresAdapter;
  let tools: ReturnType<typeof getCronTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createMockPostgresAdapter() as unknown as PostgresAdapter;
    tools = getCronTools(adapter);
  });

  it("should return 8 cron tools", () => {
    expect(tools).toHaveLength(8);
  });

  it("should have all expected tool names", () => {
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_cron_create_extension");
    expect(toolNames).toContain("pg_cron_schedule");
    expect(toolNames).toContain("pg_cron_schedule_in_database");
    expect(toolNames).toContain("pg_cron_unschedule");
    expect(toolNames).toContain("pg_cron_alter_job");
    expect(toolNames).toContain("pg_cron_list_jobs");
    expect(toolNames).toContain("pg_cron_job_run_details");
    expect(toolNames).toContain("pg_cron_cleanup_history");
  });

  it("should have group set to cron for all tools", () => {
    for (const tool of tools) {
      expect(tool.group).toBe("cron");
    }
  });
});

describe("pg_cron_create_extension", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should enable pg_cron extension", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_create_extension")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "CREATE EXTENSION IF NOT EXISTS pg_cron",
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("pg_cron");
  });
});

describe("pg_cron_schedule", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should schedule a cron job", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 1 }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;
    const result = (await tool.handler(
      {
        schedule: "0 2 * * *",
        command: "VACUUM ANALYZE",
      },
      mockContext,
    )) as {
      success: boolean;
      jobId: number;
      schedule: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT cron.schedule($1, $2) as jobid",
      ["0 2 * * *", "VACUUM ANALYZE"],
    );
    expect(result.success).toBe(true);
    expect(result.jobId).toBe(1);
  });

  it("should schedule a named job", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 2 }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;
    const result = (await tool.handler(
      {
        schedule: "30 seconds",
        command: "SELECT 1",
        jobName: "heartbeat",
      },
      mockContext,
    )) as {
      success: boolean;
      jobName: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT cron.schedule($1, $2, $3) as jobid",
      ["heartbeat", "30 seconds", "SELECT 1"],
    );
    expect(result.jobName).toBe("heartbeat");
  });
});

describe("pg_cron_schedule_in_database", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should schedule a job in another database", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 3 }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_schedule_in_database")!;
    const result = (await tool.handler(
      {
        jobName: "cleanup_logs",
        schedule: "0 0 * * *",
        command:
          "DELETE FROM logs WHERE created_at < now() - interval '30 days'",
        database: "app_db",
      },
      mockContext,
    )) as {
      success: boolean;
      database: string;
      jobId: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("cron.schedule_in_database"),
      expect.arrayContaining([
        "cleanup_logs",
        "0 0 * * *",
        expect.any(String),
        "app_db",
      ]),
    );
    expect(result.success).toBe(true);
    expect(result.database).toBe("app_db");
  });
});

describe("pg_cron_unschedule", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should unschedule by job ID", async () => {
    // Mock lookup query (returns job info)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 5, jobname: "test_job" }],
    });
    // Mock unschedule query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ removed: true }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;
    const result = (await tool.handler(
      {
        jobId: 5,
      },
      mockContext,
    )) as {
      success: boolean;
      message: string;
    };

    expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
      "SELECT cron.unschedule($1::bigint) as removed",
      [5],
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain("removed");
  });

  it("should unschedule by job name", async () => {
    // Mock lookup query (returns job info)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 10, jobname: "heartbeat" }],
    });
    // Mock unschedule query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ removed: true }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;
    const result = (await tool.handler(
      {
        jobName: "heartbeat",
      },
      mockContext,
    )) as { jobId: number | null };

    expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
      "SELECT cron.unschedule($1::text) as removed",
      ["heartbeat"],
    );
    // Verify jobId is returned from lookup
    expect(result.jobId).toBe(10);
  });

  it("should fail when no identifier provided", async () => {
    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;

    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/jobId.*jobName/i);
  });
});

describe("pg_cron_alter_job", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should alter a job schedule", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_alter_job")!;
    const result = (await tool.handler(
      {
        jobId: 1,
        schedule: "0 3 * * *",
      },
      mockContext,
    )) as {
      success: boolean;
      jobId: number;
      changes: { schedule?: string };
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("cron.alter_job"),
      expect.arrayContaining([1, "0 3 * * *"]),
    );
    expect(result.success).toBe(true);
    expect(result.changes.schedule).toBe("0 3 * * *");
  });

  it("should disable a job", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_alter_job")!;
    const result = (await tool.handler(
      {
        jobId: 2,
        active: false,
      },
      mockContext,
    )) as {
      changes: { active?: boolean };
    };

    expect(result.changes.active).toBe(false);
  });
});

describe("pg_cron_list_jobs", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should list all jobs", async () => {
    // Mock COUNT query first (for pagination)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          jobid: 1,
          jobname: "daily_vacuum",
          schedule: "0 2 * * *",
          active: true,
        },
        { jobid: 2, jobname: "cleanup", schedule: "0 0 * * 0", active: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({}, mockContext)) as {
      jobs: unknown[];
      count: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM cron.job"),
      [],
    );
    expect(result.count).toBe(2);
  });

  it("should filter by active status", async () => {
    // Mock COUNT query first (for pagination)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    await tool.handler({ active: true }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("WHERE active = $1"),
      [true],
    );
  });
});

describe("pg_cron_job_run_details", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should get job run details", async () => {
    // Mock COUNT query first (for truncation indicator)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 3 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        {
          runid: 1,
          jobid: 1,
          status: "succeeded",
          start_time: "2024-01-01 02:00:00",
        },
        {
          runid: 2,
          jobid: 1,
          status: "succeeded",
          start_time: "2024-01-02 02:00:00",
        },
        {
          runid: 3,
          jobid: 1,
          status: "failed",
          start_time: "2024-01-03 02:00:00",
        },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    const result = (await tool.handler({}, mockContext)) as {
      runs: unknown[];
      count: number;
      summary: { succeeded: number; failed: number; running: number };
    };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("FROM cron.job_run_details"),
      [],
    );
    expect(result.count).toBe(3);
    expect(result.summary.succeeded).toBe(2);
    expect(result.summary.failed).toBe(1);
  });

  it("should filter by job ID", async () => {
    // Mock COUNT query first (for truncation indicator)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    await tool.handler({ jobId: 5 }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("jobid = $1"),
      [5],
    );
  });

  it("should filter by status", async () => {
    // Mock COUNT query first (for truncation indicator)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 0 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    await tool.handler({ status: "failed" }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("status = $"),
      ["failed"],
    );
  });

  it("should return structured error for invalid status", async () => {
    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    const result = (await tool.handler(
      { status: "invalid_status" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid status.*invalid_status/);
  });
});

describe("pg_cron_cleanup_history", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should cleanup old history", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rowsAffected: 150,
    });

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler({}, mockContext)) as {
      success: boolean;
      deletedCount: number;
      olderThanDays: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM cron.job_run_details"),
      ["7"],
    );
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(150);
    expect(result.olderThanDays).toBe(7); // default
  });

  it("should use custom days parameter", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 50 });

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler({ olderThanDays: 30 }, mockContext)) as {
      olderThanDays: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("($1 || ' days')::interval"),
      ["30"],
    );
    expect(result.olderThanDays).toBe(30);
  });

  it("should filter by job ID", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 10 });

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    await tool.handler({ jobId: 5 }, mockContext);

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("jobid = $2"),
      ["7", 5],
    );
  });

  it("should accept days alias for olderThanDays", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 25 });

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler({ days: 14 }, mockContext)) as {
      olderThanDays: number;
    };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("($1 || ' days')::interval"),
      ["14"],
    );
    expect(result.olderThanDays).toBe(14);
  });
});

describe("pg_cron parameter aliases", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should accept sql alias for command in schedule", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 10 }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;
    const result = (await tool.handler(
      {
        schedule: "0 * * * *",
        sql: "SELECT NOW()", // alias for command
      },
      mockContext,
    )) as { success: boolean; jobId: number };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT cron.schedule($1, $2) as jobid",
      ["0 * * * *", "SELECT NOW()"],
    );
    expect(result.success).toBe(true);
  });

  it("should accept query alias for command in schedule", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 11 }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;
    const result = (await tool.handler(
      {
        schedule: "30 2 * * *",
        query: "VACUUM users", // alias for command
      },
      mockContext,
    )) as { success: boolean; jobId: number };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      "SELECT cron.schedule($1, $2) as jobid",
      ["30 2 * * *", "VACUUM users"],
    );
    expect(result.success).toBe(true);
  });

  it("should return structured error for pg_cron_schedule with missing command", async () => {
    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;
    const result = (await tool.handler(
      { schedule: "0 * * * *" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/command.*sql.*query/i);
  });

  it("should return structured error for pg_cron_schedule_in_database with missing command", async () => {
    const tool = tools.find((t) => t.name === "pg_cron_schedule_in_database")!;
    const result = (await tool.handler(
      { schedule: "0 * * * *", database: "postgres", jobName: "test" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/command.*sql.*query/i);
  });
});

describe("pg_cron string jobId coercion", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should accept string jobId in pg_cron_unschedule", async () => {
    // Mock lookup query (returns job info)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ jobid: 5, jobname: null }],
    });
    // Mock unschedule query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ removed: true }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;
    const result = (await tool.handler(
      {
        jobId: "5", // String from listJobs
      },
      mockContext,
    )) as { success: boolean };

    expect(mockAdapter.executeQuery).toHaveBeenLastCalledWith(
      "SELECT cron.unschedule($1::bigint) as removed",
      [5], // Coerced to number
    );
    expect(result.success).toBe(true);
  });

  it("should accept string jobId in pg_cron_alter_job", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

    const tool = tools.find((t) => t.name === "pg_cron_alter_job")!;
    const result = (await tool.handler(
      {
        jobId: "20", // String from listJobs
        schedule: "0 4 * * *",
      },
      mockContext,
    )) as { success: boolean; jobId: number };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("cron.alter_job"),
      expect.arrayContaining([20, "0 4 * * *"]), // jobId coerced to number
    );
    expect(result.success).toBe(true);
    expect(result.jobId).toBe(20);
  });

  it("should accept string jobId in pg_cron_job_run_details", async () => {
    // Mock COUNT query first (for truncation indicator)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 1 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ runid: "101", jobid: "5", status: "succeeded" }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    const result = (await tool.handler(
      {
        jobId: "5", // String from listJobs
      },
      mockContext,
    )) as { runs: Array<{ runid: number; jobid: number }>; count: number };

    expect(mockAdapter.executeQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("jobid = $1"),
      [5], // Coerced to number
    );
    expect(result.count).toBe(1);
    // Output should normalize to numbers
    expect(result.runs[0].runid).toBe(101);
    expect(result.runs[0].jobid).toBe(5);
  });

  it("should normalize list_jobs output to numbers", async () => {
    // Mock COUNT query first (for pagination)
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { jobid: "1", jobname: "test", schedule: "* * * * *", active: true },
        { jobid: "2", jobname: "test2", schedule: "0 * * * *", active: false },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({}, mockContext)) as {
      jobs: Array<{ jobid: number }>;
      count: number;
    };

    expect(result.jobs[0].jobid).toBe(1); // Normalized to number
    expect(result.jobs[1].jobid).toBe(2); // Normalized to number
  });

  it("should accept string jobId in pg_cron_cleanup_history", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({ rowsAffected: 5 });

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler(
      {
        jobId: "10", // String from listJobs
      },
      mockContext,
    )) as { success: boolean };

    expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
      expect.stringContaining("jobid = $2"),
      ["7", 10], // days param first, then coerced jobId
    );
    expect(result.success).toBe(true);
  });
});

describe("pg_cron error handling", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  it("should return structured error for pg_cron_schedule with invalid schedule", async () => {
    const pgError = new Error("invalid schedule: invalid cron syntax");
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_cron_schedule")!;

    const result = (await tool.handler(
      { schedule: "invalid_schedule", command: "SELECT 1" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Invalid cron schedule/);
  });

  it("should return structured error for pg_cron_schedule_in_database with nonexistent database", async () => {
    const pgError = new Error('database "nonexistent_db" does not exist');
    (pgError as unknown as Record<string, unknown>)["code"] = "3D000";
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_cron_schedule_in_database")!;

    const result = (await tool.handler(
      {
        jobName: "test",
        schedule: "0 * * * *",
        command: "SELECT 1",
        database: "nonexistent_db",
      },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Database.*does not exist/);
  });

  it("should return structured error for pg_cron_alter_job with nonexistent jobId", async () => {
    const pgError = new Error('could not find valid entry for job "99999"');
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_cron_alter_job")!;

    const result = (await tool.handler(
      { jobId: 99999, schedule: "0 3 * * *" },
      mockContext,
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Job '99999' not found/);
  });

  it("should return structured error for pg_cron_unschedule with nonexistent jobId", async () => {
    // Mock lookup query returning empty (job not found)
    mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });
    // Mock unschedule query failing
    const pgError = new Error('could not find valid entry for job "99999"');
    mockAdapter.executeQuery.mockRejectedValueOnce(pgError);

    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;

    const result = (await tool.handler({ jobId: 99999 }, mockContext)) as {
      success: boolean;
      error: string;
    };

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Job.*not found/);
  });
});

// =============================================================================
// Additional Coverage: uncovered branches in cron.ts
// =============================================================================

describe("cron.ts uncovered branches", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let tools: ReturnType<typeof getCronTools>;
  let mockContext: ReturnType<typeof createMockRequestContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    tools = getCronTools(mockAdapter as unknown as PostgresAdapter);
    mockContext = createMockRequestContext();
  });

  // cron.ts L245-246: unschedule lookup query failure (catch block)
  it("should handle unschedule lookup failure gracefully", async () => {
    // Mock lookup query failing
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cron.job does not exist"),
    );
    // Mock unschedule query succeeding
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ removed: true }],
    });

    const tool = tools.find((t) => t.name === "pg_cron_unschedule")!;
    const result = (await tool.handler({ jobId: 5 }, mockContext)) as {
      success: boolean;
      jobId: number | null;
    };

    expect(result.success).toBe(true);
    expect(result.jobId).toBe(5); // Falls back to provided jobId
  });

  // cron.ts L419-424: list_jobs limit coercion with NaN value
  it("should fallback to default limit when limit is NaN", async () => {
    // Mock COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { jobid: 1, jobname: "test", schedule: "* * * * *", active: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler(
      { limit: "not_a_number" },
      mockContext,
    )) as { count: number };

    // Should fallback to default limit 50
    const sql = mockAdapter.executeQuery.mock.calls[1]?.[0] as string;
    expect(sql).toContain("LIMIT 50");
    expect(result.count).toBe(1);
  });

  // cron.ts L437: list_jobs active filter in COUNT query
  it("should include active filter in COUNT query when active is set", async () => {
    // Mock COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 3 }],
    });
    // Mock main query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { jobid: 1, jobname: "test", schedule: "* * * * *", active: true },
        { jobid: 2, jobname: "test2", schedule: "0 * * * *", active: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({ active: true }, mockContext)) as {
      count: number;
      truncated: boolean;
      totalCount: number;
    };

    // COUNT query should include WHERE active = $1
    const countSql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(countSql).toContain("WHERE active = $1");
    expect(result.truncated).toBe(true);
    expect(result.totalCount).toBe(3);
  });

  // cron.ts list_jobs with unnamed jobs hint
  it("should include unnamed jobs hint in list_jobs response", async () => {
    // Mock COUNT query
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [{ total: 2 }],
    });
    // Mock main query with unnamed jobs
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { jobid: 1, jobname: null, schedule: "* * * * *", active: true },
        { jobid: 2, jobname: null, schedule: "0 * * * *", active: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({}, mockContext)) as {
      hint: string;
    };

    expect(result.hint).toContain("2 job(s) have no name");
    expect(result.hint).toContain("jobId");
  });

  // cron.ts L419-424: list_jobs with limit=0 (unlimited)
  it("should return all jobs when limit is 0", async () => {
    // No COUNT query needed when unlimited
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { jobid: 1, jobname: "a", schedule: "* * * * *", active: true },
        { jobid: 2, jobname: "b", schedule: "0 * * * *", active: true },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      count: number;
      truncated?: boolean;
    };

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain("LIMIT");
    expect(result.count).toBe(2);
    expect(result.truncated).toBeUndefined();
  });

  // cron.ts L681: cleanup_history negative days validation
  it("should return error for negative days in cleanup_history", async () => {
    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler({ olderThanDays: -1 }, mockContext)) as {
      success: boolean;
      message: string;
      olderThanDays: number;
    };

    expect(result.success).toBe(false);
    expect(result.message).toContain("non-negative");
    expect(result.olderThanDays).toBe(-1);
  });

  // cron.ts L715-724: cleanup_history ZodError catch path
  // This would fire if the schema parse itself throws, but since we relaxed
  // validation, we'll test the general DB error path instead
  it("should handle DB error in cleanup_history", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cron.job_run_details does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_cron_cleanup_history")!;
    const result = (await tool.handler({ olderThanDays: 7 }, mockContext)) as {
      success: boolean;
      message: string;
      deletedCount: number;
    };

    expect(result.success).toBe(false);
    expect(result.deletedCount).toBe(0);
    expect(result.message).toContain("does not exist");
  });

  // cron.ts list_jobs DB error path
  it("should handle DB error in list_jobs", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("cron.job does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_cron_list_jobs")!;
    const result = (await tool.handler({}, mockContext)) as {
      jobs: unknown[];
      count: number;
      error: string;
    };

    expect(result.jobs).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.error).toContain("does not exist");
  });

  // cron.ts job_run_details with limit=0 (unlimited)
  it("should return all run details when limit is 0", async () => {
    mockAdapter.executeQuery.mockResolvedValueOnce({
      rows: [
        { runid: 1, jobid: 1, status: "succeeded" },
        { runid: 2, jobid: 1, status: "failed" },
      ],
    });

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    const result = (await tool.handler({ limit: 0 }, mockContext)) as {
      count: number;
      truncated?: boolean;
      summary: { succeeded: number; failed: number };
    };

    const sql = mockAdapter.executeQuery.mock.calls[0]?.[0] as string;
    expect(sql).not.toContain("LIMIT");
    expect(result.count).toBe(2);
    expect(result.summary.succeeded).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.truncated).toBeUndefined();
  });

  // cron.ts job_run_details DB error path
  it("should handle DB error in job_run_details", async () => {
    mockAdapter.executeQuery.mockRejectedValueOnce(
      new Error("relation does not exist"),
    );

    const tool = tools.find((t) => t.name === "pg_cron_job_run_details")!;
    const result = (await tool.handler({}, mockContext)) as {
      runs: unknown[];
      count: number;
      error: string;
    };

    expect(result.runs).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.error).toContain("does not exist");
  });
});
