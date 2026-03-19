/**
 * PostgreSQL pg_cron Extension Tools - Scheduling
 *
 * Job scheduling tools: extension, schedule, schedule_in_database, unschedule.
 * 4 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition, RequestContext } from "../../../../types/index.js";
import { z } from "zod";
import { write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  CronScheduleSchema,
  CronScheduleSchemaBase,
  CronScheduleInDatabaseSchema,
  CronScheduleInDatabaseSchemaBase,
  CronUnscheduleSchemaBase,
  CronUnscheduleSchema,
  // Output schemas
  CronCreateExtensionOutputSchema,
  CronScheduleOutputSchema,
  CronScheduleInDatabaseOutputSchema,
  CronUnscheduleOutputSchema,
} from "../../schemas/index.js";

/**
 * Enable the pg_cron extension
 */
export function createCronExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_create_extension",
    description:
      "Enable the pg_cron extension for job scheduling. Requires superuser privileges.",
    group: "cron",
    inputSchema: z.object({}),
    outputSchema: CronCreateExtensionOutputSchema,
    annotations: write("Create Cron Extension"),
    icons: getToolIcons("cron", write("Create Cron Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS pg_cron");
      return { success: true, message: "pg_cron extension enabled" };
    },
  };
}

/**
 * Schedule a new cron job
 */
export function createCronScheduleTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_schedule",
    description: `Schedule a new cron job. Supports standard cron syntax (e.g., "0 2 * * *" for 2 AM daily)
or interval syntax (e.g., "30 seconds"). Note: pg_cron allows duplicate job names; use unique names to avoid confusion. Returns the job ID.`,
    group: "cron",
    // Use base schema for MCP so properties are properly exposed
    inputSchema: CronScheduleSchemaBase,
    outputSchema: CronScheduleOutputSchema,
    annotations: write("Schedule Cron Job"),
    icons: getToolIcons("cron", write("Schedule Cron Job")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema with alias resolution for validation
        const { schedule, command, jobName } = CronScheduleSchema.parse(params);

        let sql: string;
        let queryParams: unknown[];

        if (jobName !== undefined) {
          sql = "SELECT cron.schedule($1, $2, $3) as jobid";
          queryParams = [jobName, schedule, command];
        } else {
          sql = "SELECT cron.schedule($1, $2) as jobid";
          queryParams = [schedule, command];
        }

        const result = await adapter.executeQuery(sql, queryParams);
        const jobId = result.rows?.[0]?.["jobid"];

        return {
          success: true,
          jobId,
          jobName: jobName ?? null,
          schedule,
          command,
          message: `Job scheduled with ID ${String(jobId)}`,
          hint: jobName
            ? "Use pg_cron_list_jobs to verify job was created with expected name"
            : undefined,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_cron_schedule" });
      }
    },
  };
}

/**
 * Schedule a job in a different database
 */
export function createCronScheduleInDatabaseTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_cron_schedule_in_database",
    description: `Schedule a cron job to run in a different database. Useful for cross-database
maintenance tasks. Returns the job ID.`,
    group: "cron",
    // Use base schema for MCP so properties are properly exposed
    inputSchema: CronScheduleInDatabaseSchemaBase,
    outputSchema: CronScheduleInDatabaseOutputSchema,
    annotations: write("Schedule Cron in Database"),
    icons: getToolIcons("cron", write("Schedule Cron in Database")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema with alias resolution for validation
        const { jobName, schedule, command, database, username, active } =
          CronScheduleInDatabaseSchema.parse(params);

        const activeVal = active ?? true;
        const sql = `SELECT cron.schedule_in_database($1, $2, $3, $4, $5, $6) as jobid`;
        const queryParams = [
          jobName,
          schedule,
          command,
          database,
          username ?? null,
          activeVal,
        ];

        const result = await adapter.executeQuery(sql, queryParams);
        const jobId = result.rows?.[0]?.["jobid"];

        return {
          success: true,
          jobId,
          jobName,
          schedule,
          command,
          database,
          username: username ?? null,
          active: activeVal,
          message: `Job scheduled in database '${database}' with ID ${String(jobId)}`,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_cron_schedule_in_database",
          });
      }
    },
  };
}

/**
 * Remove a scheduled job
 */
export function createCronUnscheduleTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_cron_unschedule",
    description:
      "Remove a scheduled cron job by its ID or name. If both are provided, jobName takes precedence. Job ID accepts numbers or numeric strings. Works for both active and inactive jobs.",
    group: "cron",
    inputSchema: CronUnscheduleSchemaBase,
    outputSchema: CronUnscheduleOutputSchema,
    annotations: destructive("Unschedule Cron Job"),
    icons: getToolIcons("cron", destructive("Unschedule Cron Job")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CronUnscheduleSchema.parse(params);

        // Prefer jobName over jobId when both provided
        const useJobName = parsed.jobName !== undefined;
        const warning =
          parsed.jobId !== undefined && parsed.jobName !== undefined
            ? "Both jobId and jobName provided; using jobName"
            : undefined;

        // Look up job info before deletion to return complete response
        let jobInfo: { jobid: number; jobname: string | null } | null = null;
        try {
          const lookupSql = useJobName
            ? "SELECT jobid, jobname FROM cron.job WHERE jobname = $1"
            : "SELECT jobid, jobname FROM cron.job WHERE jobid = $1::bigint";
          const lookupResult = await adapter.executeQuery(lookupSql, [
            useJobName ? parsed.jobName : parsed.jobId,
          ]);
          if (lookupResult.rows && lookupResult.rows.length > 0) {
            const row = lookupResult.rows[0] as {
              jobid: unknown;
              jobname: unknown;
            };
            jobInfo = {
              jobid: Number(row.jobid),
              jobname: row.jobname as string | null,
            };
          }
        } catch {
          // Lookup failed, continue with unschedule attempt
        }

        // Use explicit type casting to ensure correct pg_cron function overload:
        // - cron.unschedule(bigint) works for both active and inactive jobs
        // - cron.unschedule(text) only finds active jobs by name
        let sql: string;
        let queryParams: unknown[];
        if (useJobName) {
          sql = "SELECT cron.unschedule($1::text) as removed";
          queryParams = [parsed.jobName];
        } else {
          sql = "SELECT cron.unschedule($1::bigint) as removed";
          queryParams = [parsed.jobId];
        }

        const result = await adapter.executeQuery(sql, queryParams);
        const removed = result.rows?.[0]?.["removed"] as boolean;

        // Return complete job info from lookup
        const resolvedJobId = jobInfo?.jobid ?? parsed.jobId ?? null;
        const resolvedJobName = jobInfo?.jobname ?? parsed.jobName ?? null;

        return {
          success: removed,
          jobId: resolvedJobId,
          jobName: resolvedJobName,
          usedIdentifier: useJobName ? "jobName" : "jobId",
          warning,
          message: removed
            ? `Job ${resolvedJobId !== null ? `ID ${String(resolvedJobId)}` : `"${String(resolvedJobName)}"`} removed successfully`
            : "Job not found",
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_cron_unschedule" });
      }
    },
  };
}
