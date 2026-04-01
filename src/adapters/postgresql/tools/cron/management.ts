/**
 * PostgreSQL pg_cron Extension Tools - Management
 *
 * Job management and monitoring: alter, list, run details, cleanup.
 * 4 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  CronAlterJobSchemaBase,
  CronAlterJobSchema,
  CronJobRunDetailsSchemaBase,
  CronJobRunDetailsSchema,
  CronListJobsSchemaBase,
  CronListJobsSchema,
  CronCleanupHistorySchema,
  CronCleanupHistorySchemaBase,
  // Output schemas
  CronAlterJobOutputSchema,
  CronListJobsOutputSchema,
  CronJobRunDetailsOutputSchema,
  CronCleanupHistoryOutputSchema,
} from "../../schemas/index.js";

/**
 * Modify an existing job
 */
export function createCronAlterJobTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_alter_job",
    description: `Modify an existing cron job. Can change schedule, command, database, username,
or active status. Only specify the parameters you want to change.`,
    group: "cron",
    inputSchema: CronAlterJobSchemaBase,
    outputSchema: CronAlterJobOutputSchema,
    annotations: write("Alter Cron Job"),
    icons: getToolIcons("cron", write("Alter Cron Job")),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsedJobId: number | undefined;
      try {
        const { jobId, schedule, command, database, username, active } =
          CronAlterJobSchema.parse(params);
        parsedJobId = jobId;

        const sql = `SELECT cron.alter_job($1, $2, $3, $4, $5, $6)`;
        const queryParams = [
          jobId,
          schedule ?? null,
          command ?? null,
          database ?? null,
          username ?? null,
          active ?? null,
        ];

        await adapter.executeQuery(sql, queryParams);

        return {
          success: true,
          jobId,
          changes: {
            schedule: schedule ?? undefined,
            command: command ?? undefined,
            database: database ?? undefined,
            username: username ?? undefined,
            active: active ?? undefined,
          },
          message: `Job ${String(jobId)} updated successfully`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_cron_alter_job",
            ...(parsedJobId !== undefined && {
              target: String(parsedJobId),
            }),
          });
      }
    },
  };
}

/**
 * List all scheduled jobs
 */
export function createCronListJobsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_list_jobs",
    description:
      "List all scheduled cron jobs. Shows job ID, name, schedule, command, and status. Jobs without names (jobname: null) must be referenced by jobId. Default limit: 50 rows.",
    group: "cron",
    inputSchema: CronListJobsSchemaBase,
    outputSchema: CronListJobsOutputSchema,
    annotations: readOnly("List Cron Jobs"),
    icons: getToolIcons("cron", readOnly("List Cron Jobs")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CronListJobsSchema.parse(params ?? {}) as {
          active?: boolean;
          limit?: unknown;
          compact?: boolean;
        };
        const compact = parsed.compact ?? true;

        let sql = `
                SELECT
                    jobid,
                    jobname,
                    schedule,
                    command,
                    nodename,
                    nodeport,
                    database,
                    username,
                    active
                FROM cron.job
            `;

        const queryParams: unknown[] = [];
        if (parsed.active !== undefined) {
          sql += " WHERE active = $1";
          queryParams.push(parsed.active);
        }

        sql += " ORDER BY jobid";

        // Safely coerce limit — NaN/non-finite → undefined (falls back to default 50)
        const rawLimit = parsed.limit;
        const coercedLimit =
          rawLimit !== undefined && rawLimit !== null
            ? Number(rawLimit)
            : undefined;
        const limitRaw =
          coercedLimit !== undefined &&
          !isNaN(coercedLimit) &&
          isFinite(coercedLimit) &&
          coercedLimit >= 0
            ? Math.floor(coercedLimit)
            : undefined;
        // Get total count first if we're limiting
        const limitVal = limitRaw === 0 ? null : (limitRaw ?? 50);
        let totalCount: number | undefined;

        if (limitVal !== null) {
          let countSql = "SELECT COUNT(*)::int as total FROM cron.job";
          if (parsed.active !== undefined) {
            countSql += " WHERE active = $1";
          }
          const countResult = await adapter.executeQuery(
            countSql,
            parsed.active !== undefined ? [parsed.active] : [],
          );
          totalCount = (countResult.rows?.[0] as { total: number } | undefined)
            ?.total;

          sql += ` LIMIT ${String(limitVal)}`;
        }

        const result = await adapter.executeQuery(sql, queryParams);

        // Normalize jobid to number (PostgreSQL BIGINT may return as string)
        const jobs = (result.rows ?? []).map(
          (row: Record<string, unknown>) => {
            let cmd = row["command"] as string | undefined;
            if (compact && cmd && cmd.length > 200) {
              cmd = cmd.substring(0, 197) + "...";
            }
            return {
              ...row,
              command: cmd,
              jobid:
                row["jobid"] !== null && row["jobid"] !== undefined
                  ? Number(row["jobid"])
                  : null,
            };
          },
        );

        // Count unnamed jobs for hint
        const unnamedCount = jobs.filter(
          (j) => (j as Record<string, unknown>)["jobname"] === null,
        ).length;

        // Determine if results were truncated
        const truncated =
          limitVal !== null &&
          totalCount !== undefined &&
          jobs.length < totalCount;

        return {
          success: true,
          jobs,
          count: jobs.length,
          ...(truncated ? { truncated: true, totalCount } : {}),
          hint:
            unnamedCount > 0
              ? `${String(unnamedCount)} job(s) have no name. Use jobId to reference them with alterJob or unschedule.`
              : undefined,
        };
      } catch (error: unknown) {
        return {
          jobs: [],
          count: 0,
          ...formatHandlerErrorResponse(error, { tool: "pg_cron_list_jobs" }),
        };
      }
    },
  };
}

/**
 * View job execution history
 */
export function createCronJobRunDetailsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_job_run_details",
    description: `View execution history for cron jobs. Shows start/end times, status, and return messages.
Useful for monitoring and debugging scheduled jobs. Default limit is 10 rows.`,
    group: "cron",
    inputSchema: CronJobRunDetailsSchemaBase,
    outputSchema: CronJobRunDetailsOutputSchema,
    annotations: readOnly("Cron Job Run Details"),
    icons: getToolIcons("cron", readOnly("Cron Job Run Details")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          jobId,
          jobName,
          status,
          limit: rawLimitValue,
          compact: isCompact,
        } = CronJobRunDetailsSchema.parse(params) as {
          jobId?: number;
          jobName?: string;
          status?: string;
          limit?: unknown;
          compact?: boolean;
        };
        const compact = isCompact ?? true;

        // Safely coerce limit — NaN/non-finite → undefined (falls back to default 50)
        const coercedLimit =
          rawLimitValue !== undefined && rawLimitValue !== null
            ? Number(rawLimitValue)
            : undefined;
        const limit =
          coercedLimit !== undefined &&
          !isNaN(coercedLimit) &&
          isFinite(coercedLimit) &&
          coercedLimit >= 0
            ? Math.floor(coercedLimit)
            : undefined;

        const VALID_STATUSES = ["running", "succeeded", "failed"];
        if (status !== undefined && !VALID_STATUSES.includes(status)) {
          return {
            success: false,
            error: `Invalid status "${status}". Valid statuses: ${VALID_STATUSES.join(", ")}`,
            code: "VALIDATION_ERROR",
            category: "validation",
            recoverable: false,
          };
        }

        const conditions: string[] = [];
        const queryParams: unknown[] = [];
        let paramIndex = 1;

        if (jobId !== undefined) {
          conditions.push(`jobid = $${String(paramIndex++)}`);
          queryParams.push(jobId);
        } else if (jobName !== undefined) {
          conditions.push(
            `jobid IN (SELECT jobid FROM cron.job WHERE jobname = $${String(paramIndex++)})`
          );
          queryParams.push(jobName);
        }

        if (status !== undefined) {
          conditions.push(`status = $${String(paramIndex++)}`);
          queryParams.push(status);
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        // Handle limit: 0 as "no limit" (return all rows), consistent with other AI-optimized tools
        const limitVal = limit === 0 ? null : (limit ?? 10);

        // Get total count for truncation indicator (only needed when limiting)
        let totalCount: number | undefined;
        const summaryStats = { succeeded: 0, failed: 0, running: 0 };
        
        if (limitVal !== null) {
          const countSql = `SELECT status, COUNT(*)::int as total FROM cron.job_run_details ${whereClause} GROUP BY status`;
          const countResult = await adapter.executeQuery(countSql, queryParams);
          totalCount = 0;
          for (const row of countResult.rows ?? []) {
            const rowData = row as { status: string; total: number };
            totalCount += rowData.total;
            if (rowData.status === "succeeded") summaryStats.succeeded = rowData.total;
            if (rowData.status === "failed") summaryStats.failed = rowData.total;
            if (rowData.status === "running") summaryStats.running = rowData.total;
          }
        }

        const limitClause =
          limitVal !== null ? `LIMIT ${String(limitVal)}` : "";
        const sql = `
                SELECT
                    runid,
                    jobid,
                    job_pid,
                    database,
                    username,
                    command,
                    status,
                    return_message,
                    start_time,
                    end_time
                FROM cron.job_run_details
                ${whereClause}
                ORDER BY start_time DESC
                ${limitClause}
            `;

        const result = await adapter.executeQuery(sql, queryParams);

        // Normalize runid and jobid to numbers (PostgreSQL BIGINT may return as strings)
        const rows = (result.rows ?? []).map((r: Record<string, unknown>) => {
          let cmd = r["command"] as string;
          let retMsg = r["return_message"] as string | null;

          if (compact) {
            if (cmd && cmd.length > 200) cmd = cmd.substring(0, 197) + "...";
            if (retMsg && retMsg.length > 200) retMsg = retMsg.substring(0, 197) + "...";
          }

          return {
            ...r,
            command: cmd,
            return_message: retMsg,
            runid:
              r["runid"] !== null && r["runid"] !== undefined
                ? Number(r["runid"])
                : null,
            jobid:
              r["jobid"] !== null && r["jobid"] !== undefined
                ? Number(r["jobid"])
                : null,
          };
        });

        if (limitVal === null) {
          summaryStats.succeeded = rows.filter((r) => (r as Record<string, unknown>)["status"] === "succeeded").length;
          summaryStats.failed = rows.filter((r) => (r as Record<string, unknown>)["status"] === "failed").length;
          summaryStats.running = rows.filter((r) => (r as Record<string, unknown>)["status"] === "running").length;
        }

        // Determine if results were truncated (only when limiting)
        const truncated =
          limitVal !== null &&
          totalCount !== undefined &&
          rows.length < totalCount;

        return {
          success: true,
          runs: rows,
          count: rows.length,
          ...(truncated ? { truncated: true, totalCount } : {}),
          summary: summaryStats,
        };
      } catch (error: unknown) {
        return {
          runs: [],
          count: 0,
          summary: { succeeded: 0, failed: 0, running: 0 },
          ...formatHandlerErrorResponse(error, {
            tool: "pg_cron_job_run_details",
          }),
        };
      }
    },
  };
}

/**
 * Clean up old job run history
 */
export function createCronCleanupHistoryTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_cron_cleanup_history",
    description: `Delete old job run history records. Helps prevent the cron.job_run_details table
from growing too large. By default, removes records older than 7 days.`,
    group: "cron",
    // Use base schema for MCP visibility
    inputSchema: CronCleanupHistorySchemaBase,
    outputSchema: CronCleanupHistoryOutputSchema,
    annotations: destructive("Cleanup Cron History"),
    icons: getToolIcons("cron", destructive("Cleanup Cron History")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema for validation with alias support
        const { olderThanDays, jobId } = CronCleanupHistorySchema.parse(
          params,
        ) as {
          olderThanDays?: number;
          jobId?: number;
        };

        // Default to 7 days
        const days = olderThanDays ?? 7;

        // Handler-level validation for negative days (relaxed from z.min for structured errors)
        if (days < 0) {
          return {
            success: false,
            error: `olderThanDays must be non-negative, got ${String(days)}`,
            code: "VALIDATION_ERROR",
            category: "validation",
            recoverable: false,
          };
        }

        const conditions: string[] = [
          `end_time < now() - ($1 || ' days')::interval`,
        ];
        const queryParams: unknown[] = [String(days)];

        if (jobId !== undefined) {
          conditions.push("jobid = $2");
          queryParams.push(jobId);
        }

        const sql = `
                DELETE FROM cron.job_run_details
                WHERE ${conditions.join(" AND ")}
            `;

        const result = await adapter.executeQuery(sql, queryParams);

        return {
          success: true,
          deletedCount: result.rowsAffected ?? 0,
          olderThanDays: days,
          jobId: jobId ?? null,
          message: `Deleted ${String(result.rowsAffected ?? 0)} old job run records`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_cron_cleanup_history",
          });
      }
    },
  };
}
