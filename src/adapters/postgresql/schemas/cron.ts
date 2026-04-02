/**
 * postgres-mcp - pg_cron Tool Schemas
 *
 * Input validation schemas for scheduled job management.
 */

import { z } from "zod";
import { coerceStrictNumber } from "../../../utils/query-helpers.js";

/**
 * Helper type for raw cron input with common aliases
 */
interface RawCronInput {
  command?: string;
  sql?: string; // Alias → command
  query?: string; // Alias → command
  database?: string;
  db?: string; // Alias → database
  olderThanDays?: number;
  days?: number; // Alias → olderThanDays
  [key: string]: unknown;
}

/**
 * Validate pg_cron interval schedule format.
 * pg_cron only accepts intervals from 1-59 seconds.
 * For 60+ seconds, standard cron syntax must be used.
 *
 * Valid interval examples: "1 second", "5 seconds", "30 seconds", "59 seconds"
 * Invalid: "60 seconds", "1 minute", "2 hours"
 *
 * @returns Error message if invalid, undefined if valid
 */
function validateIntervalSchedule(schedule: string): string | undefined {
  // Match interval patterns like "N second", "N seconds"
  const intervalRegex = /^(\d+)\s+seconds?$/i;
  const intervalMatch = intervalRegex.exec(schedule);
  if (!intervalMatch?.[1]) {
    return undefined; // Not an interval format, let pg_cron handle validation
  }

  const seconds = parseInt(intervalMatch[1], 10);
  if (seconds < 1 || seconds > 59) {
    const minuteEquivalent =
      seconds >= 60
        ? `${String(Math.floor(seconds / 60))} minute(s)`
        : "less than 1 second";
    return `Invalid interval schedule: "${schedule}". pg_cron interval syntax only supports 1-59 seconds. For ${minuteEquivalent}, use standard cron syntax instead (e.g., "* * * * *" for every minute, "*/5 * * * *" for every 5 minutes).`;
  }

  return undefined; // Valid interval
}

/**
 * Preprocess cron parameters to normalize common input patterns
 */
function preprocessCronParams(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  const raw = input as RawCronInput;
  const result = { ...raw };

  // Alias: sql/query → command
  if (!result.command) {
    if (raw.sql !== undefined) {
      result.command = raw.sql;
    } else if (raw.query !== undefined) {
      result.command = raw.query;
    }
  }

  // Alias: db → database
  if (raw.db !== undefined && !result.database) {
    result.database = raw.db;
  }

  // Alias: days → olderThanDays
  if (raw.days !== undefined && result.olderThanDays === undefined) {
    result.olderThanDays = raw.days;
  }

  return result;
}

/**
 * Coercible job ID schema that accepts both numbers and numeric strings.
 * Handles PostgreSQL BIGINT values that may be returned as strings.
 */
const CoercibleJobId = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .describe("Job ID (accepts number or numeric string)");

/**
 * Schedule for cron jobs. Supports:
 * - Standard cron: "0 10 * * *" (daily at 10:00)
 * - Interval: "30 seconds" (every 30 seconds)
 * - Special: "0 12 $ * *" (noon on last day of month)
 *
 * Accepts 'name' as alias for 'jobName'.
 * Accepts 'sql' or 'query' as alias for 'command'.
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const CronCreateExtensionSchemaBase = z.object({});

export const CronCreateExtensionSchema = z.preprocess(
  (input) => (typeof input === "object" && input !== null ? input : {}),
  z.object({}).strict()
);

export const CronScheduleSchemaBase = z.object({
  schedule: z
    .string()
    .optional()
    .describe(
      'Cron schedule expression (e.g., "0 10 * * *") or interval ("1-59 seconds")',
    ),
  command: z.string().optional().describe("SQL command to execute"),
  sql: z.string().optional().describe("Alias for command"),
  query: z.string().optional().describe("Alias for command"),
  jobName: z.string().optional().describe("Optional unique name for the job"),
  name: z.string().optional().describe("Alias for jobName"),
});

export const CronScheduleSchema = z.preprocess(
  preprocessCronParams,
  CronScheduleSchemaBase.refine(
    (data) => data.schedule !== undefined,
    { message: "schedule is required" }
  )
    .refine(
      (data) =>
        data.command !== undefined ||
        data.sql !== undefined ||
        data.query !== undefined,
      {
        message: "Either command, sql, or query must be provided",
      },
    )
    .refine(
      (data) => {
        const error = validateIntervalSchedule(String(data.schedule));
        return error === undefined;
      },
      {
        message:
          "pg_cron interval syntax only supports 1-59 seconds. For 60+ seconds, use standard cron syntax.",
      },
    )
    .transform((data) => {
      // Handle alias: name -> jobName
      const resolvedJobName = data.jobName ?? data.name;
      return {
        schedule: String(data.schedule),
        command: data.command ?? "", // Guaranteed by refine + preprocessing
        jobName: resolvedJobName,
      };
    }),
);

/**
 * Schedule for cross-database cron jobs.
 * Accepts 'name' as alias for 'jobName'.
 * Accepts 'sql'/'query' as alias for 'command'.
 * Accepts 'db' as alias for 'database'.
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const CronScheduleInDatabaseSchemaBase = z.object({
  jobName: z.string().optional().describe("Unique name for the job"),
  name: z.string().optional().describe("Alias for jobName"),
  schedule: z
    .string()
    .optional()
    .describe(
      'Cron schedule expression (e.g., "0 10 * * *") or interval ("1-59 seconds")',
    ),
  command: z.string().optional().describe("SQL command to execute"),
  sql: z.string().optional().describe("Alias for command"),
  query: z.string().optional().describe("Alias for command"),
  database: z.string().optional().describe("Target database name"),
  db: z.string().optional().describe("Alias for database"),
  username: z.string().optional().describe("User to run the job as"),
  active: z
    .boolean()
    .optional()
    .describe("Whether the job is active (default: true)"),
});

export const CronScheduleInDatabaseSchema = z.preprocess(
  preprocessCronParams,
  CronScheduleInDatabaseSchemaBase.refine(
    (data) => data.schedule !== undefined,
    { message: "schedule is required" }
  )
    .refine(
      (data) =>
        data.command !== undefined ||
        data.sql !== undefined ||
        data.query !== undefined,
      {
        message: "Either command, sql, or query must be provided",
      },
    )
    .refine((data) => data.database !== undefined || data.db !== undefined, {
      message: "Either database or db must be provided",
    })
    .refine(
      (data) => {
        const error = validateIntervalSchedule(String(data.schedule));
        return error === undefined;
      },
      {
        message:
          "pg_cron interval syntax only supports 1-59 seconds. For 60+ seconds, use standard cron syntax.",
      },
    )
    .transform((data) => {
      // Handle alias: name -> jobName
      const resolvedJobName = data.jobName ?? data.name;
      return {
        jobName: resolvedJobName,
        schedule: String(data.schedule),
        command: data.command ?? "", // Guaranteed by refine + preprocessing
        database: data.database ?? "", // Guaranteed by refine + preprocessing
        username: data.username,
        active: data.active,
      };
    })
    .refine((data) => data.jobName !== undefined, {
      message: "jobName (or name alias) is required",
    }),
);

export const CronUnscheduleSchemaBase = z.object({
  jobId: z.union([z.number(), z.string()]).optional().describe("Job ID to remove"),
  jobName: z.string().optional().describe("Job name to remove"),
  name: z.string().optional().describe("Alias for jobName"),
});

export const CronUnscheduleSchema = CronUnscheduleSchemaBase.refine(
  (data) => data.jobId !== undefined || data.jobName !== undefined || data.name !== undefined,
  {
    message: "Either jobId or jobName (or name alias) must be provided",
  },
).transform((data) => ({
  jobId: data.jobId !== undefined && data.jobId !== null ? Number(data.jobId) : undefined,
  jobName: data.jobName ?? data.name,
}));

export const CronAlterJobSchemaBase = z.object({
  jobId: z.union([z.number(), z.string()]).optional().describe("Job ID to modify"),
  schedule: z
    .string()
    .optional()
    .describe(
      'New cron schedule (e.g., "0 10 * * *") or interval ("1-59 seconds")',
    ),
  command: z.string().optional().describe("New SQL command"),
  database: z.string().optional().describe("New target database"),
  username: z.string().optional().describe("New username"),
  active: z.boolean().optional().describe("Enable/disable the job"),
});

export const CronAlterJobSchema = z
  .object({
    jobId: z.union([z.number(), z.string()]).optional().describe("Job ID to modify"),
    schedule: z
      .string()
      .optional()
      .describe(
        'New cron schedule (e.g., "0 10 * * *") or interval ("1-59 seconds")',
      ),
    command: z.string().optional().describe("New SQL command"),
    database: z.string().optional().describe("New target database"),
    username: z.string().optional().describe("New username"),
    active: z.boolean().optional().describe("Enable/disable the job"),
  })
  .refine(
    (data) => {
      if (data.schedule === undefined) return true;
      const error = validateIntervalSchedule(data.schedule);
      return error === undefined;
    },
    {
      message:
        "pg_cron interval syntax only supports 1-59 seconds. For 60+ seconds, use standard cron syntax.",
    },
  )
  .refine(
    (data) => data.jobId !== undefined,
    { message: "jobId is required" }
  )
  .transform((data) => ({
    ...data,
    jobId: Number(data.jobId),
  }));

export const CronListJobsSchemaBase = z.object({
  active: z.boolean().optional().describe("Filter by active status"),
  limit: z.union([z.number(), z.string()]).optional().describe("Maximum jobs to return (default: 50, use 0 for all)"),
  compact: z.boolean().optional().describe("Whether to truncate long text fields like command (default: true)"),
});

export const CronListJobsSchema = z.object({
  active: z.boolean().optional().describe("Filter by active status"),
  limit: z.preprocess(coerceStrictNumber, z.number().optional()).optional().describe("Maximum jobs to return (default: 50, use 0 for all)"),
  compact: z.boolean().optional().default(true).describe("Whether to truncate long text fields"),
}).default({ compact: true });

export const CronJobRunDetailsSchemaBase = z.object({
  jobId: z.union([z.number(), z.string()]).optional().describe("Filter by job ID"),
  jobName: z.string().optional().describe("Filter by job name"),
  status: z
    .string()
    .optional()
    .describe("Filter by status (running, succeeded, failed)"),
  limit: z.union([z.number(), z.string()]).optional().describe("Maximum records to return (default: 10)"),
  compact: z.boolean().optional().describe("Whether to truncate long text fields like command and return_message (default: true)"),
});

export const CronJobRunDetailsSchema = z
  .object({
    jobId: z.union([z.number(), z.string()]).optional().describe("Filter by job ID"),
    jobName: z.string().optional().describe("Filter by job name"),
    status: z
      .string()
      .optional()
      .describe("Filter by status (running, succeeded, failed)"),
    limit: z.preprocess(coerceStrictNumber, z.number().optional()).optional()
      .describe("Maximum records to return (default: 10)"),
    compact: z.boolean().optional().default(true).describe("Whether to truncate long text fields"),
  })
  .default({ compact: true })
  .transform((data) => ({
    ...data,
    jobId: data.jobId !== undefined && data.jobId !== null ? Number(data.jobId) : undefined,
  }));

export const CronCleanupHistorySchemaBase = z.object({
  olderThanDays: z.union([z.number(), z.string()]).optional().describe("Delete records older than N days (default: 7)"),
  days: z.union([z.number(), z.string()]).optional().describe("Alias for olderThanDays"),
  jobId: z.union([z.number(), z.string()]).optional().describe("Clean up only for specific job"),
});

export const CronCleanupHistorySchema = z.preprocess(
  (input) => preprocessCronParams(input ?? {}),
  z.object({
    olderThanDays: z.preprocess(coerceStrictNumber, z.number().optional()).optional(),
    days: z.preprocess(coerceStrictNumber, z.number().optional()).optional(),
    jobId: z.unknown().optional(),
  }).transform((data) => {
    const rawDays = data.olderThanDays as unknown;
    const coercedDays =
      rawDays !== undefined && rawDays !== null ? Number(rawDays) : undefined;

    // Coerce jobId through CoercibleJobId for type safety
    const rawJobId = data.jobId;
    let parsedJobId: number | undefined;
    if (rawJobId !== undefined && rawJobId !== null) {
      const coerced = CoercibleJobId.safeParse(rawJobId);
      if (coerced.success) {
        parsedJobId = coerced.data;
      } else {
        // Invalid jobId format — will surface as structured error in handler
        throw coerced.error;
      }
    }

    return {
      olderThanDays:
        coercedDays !== undefined && !isNaN(coercedDays)
          ? coercedDays
          : undefined,
      jobId: parsedJobId,
    };
  }),
);

// ============================================================================
// OUTPUT SCHEMAS - For MCP 2025-11-25 structured content compliance
// ============================================================================

/**
 * Output schema for pg_cron_create_extension
 */
export const CronCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("pg_cron extension creation result");

/**
 * Output schema for pg_cron_schedule
 */
export const CronScheduleOutputSchema = z
  .object({
    success: z.boolean().describe("Whether job was scheduled"),
    jobId: z.string().nullable().optional().describe("Assigned job ID"),
    jobName: z.string().nullable().optional().describe("Job name if provided"),
    schedule: z.string().optional().describe("Cron schedule expression"),
    command: z.string().optional().describe("SQL command to execute"),
    message: z.string().optional().describe("Status message"),
    hint: z.string().optional().describe("Usage hint"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron job scheduling result");

/**
 * Output schema for pg_cron_schedule_in_database
 */
export const CronScheduleInDatabaseOutputSchema = z
  .object({
    success: z.boolean().describe("Whether job was scheduled"),
    jobId: z.string().nullable().optional().describe("Assigned job ID"),
    jobName: z.string().optional().describe("Job name"),
    schedule: z.string().optional().describe("Cron schedule expression"),
    command: z.string().optional().describe("SQL command to execute"),
    database: z.string().optional().describe("Target database"),
    username: z.string().nullable().optional().describe("Username to run as"),
    active: z.boolean().optional().describe("Whether job is active"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cross-database cron job scheduling result");

/**
 * Output schema for pg_cron_unschedule
 */
export const CronUnscheduleOutputSchema = z
  .object({
    success: z.boolean().describe("Whether job was removed"),
    jobId: z.number().nullable().optional().describe("Job ID that was removed"),
    jobName: z
      .string()
      .nullable()
      .optional()
      .describe("Job name that was removed"),
    usedIdentifier: z
      .enum(["jobId", "jobName"])
      .optional()
      .describe("Which identifier was used"),
    warning: z
      .string()
      .optional()
      .describe("Warning if both identifiers given"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron job removal result");

/**
 * Output schema for pg_cron_alter_job
 */
export const CronAlterJobOutputSchema = z
  .object({
    success: z.boolean().describe("Whether job was updated"),
    jobId: z.number().optional().describe("Job ID that was modified"),
    changes: z
      .object({
        schedule: z.string().optional().describe("New schedule if changed"),
        command: z.string().optional().describe("New command if changed"),
        database: z.string().optional().describe("New database if changed"),
        username: z.string().optional().describe("New username if changed"),
        active: z.boolean().optional().describe("New active status if changed"),
      })
      .optional()
      .describe("Changes applied"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron job modification result");

/**
 * Output schema for pg_cron_list_jobs
 */
export const CronListJobsOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the request succeeded"),
    jobs: z
      .array(
        z.object({
          jobid: z.number().nullable().describe("Job ID"),
          jobname: z.string().nullable().describe("Job name"),
          schedule: z.string().describe("Cron schedule"),
          command: z.string().describe("SQL command"),
          nodename: z.string().nullable().describe("Node name"),
          nodeport: z.number().nullable().describe("Node port"),
          database: z.string().describe("Target database"),
          username: z.string().describe("Run as username"),
          active: z.boolean().describe("Whether active"),
        }),
      )
      .optional()
      .describe("Scheduled jobs"),
    count: z.number().optional().describe("Number of jobs returned"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    hint: z.string().optional().describe("Hint about unnamed jobs"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron job list result");

/**
 * Output schema for pg_cron_job_run_details
 */
export const CronJobRunDetailsOutputSchema = z
  .object({
    success: z.boolean().describe("Whether the query succeeded"),
    runs: z
      .array(
        z.object({
          runid: z.number().nullable().describe("Run ID"),
          jobid: z.number().nullable().describe("Job ID"),
          job_pid: z.number().nullable().describe("Process ID"),
          database: z.string().describe("Database"),
          username: z.string().describe("Username"),
          command: z.string().describe("Command executed"),
          status: z.string().describe("Execution status"),
          return_message: z.string().nullable().describe("Return message"),
          // Use coercion to handle PostgreSQL Date objects → string
          start_time: z.coerce.string().nullable().describe("Start time"),
          end_time: z.coerce.string().nullable().describe("End time"),
        }),
      )
      .optional()
      .describe("Job execution history"),
    count: z.number().optional().describe("Number of records returned"),
    truncated: z.boolean().optional().describe("Results were truncated"),
    totalCount: z.number().optional().describe("Total available count"),
    summary: z
      .object({
        succeeded: z.number().describe("Successful runs"),
        failed: z.number().describe("Failed runs"),
        running: z.number().describe("Currently running"),
      })
      .optional()
      .describe("Execution summary"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron job execution history result");

/**
 * Output schema for pg_cron_cleanup_history
 */
export const CronCleanupHistoryOutputSchema = z
  .object({
    success: z.boolean().describe("Whether cleanup succeeded"),
    deletedCount: z.number().optional().describe("Number of records deleted"),
    olderThanDays: z.number().optional().describe("Age threshold in days"),
    jobId: z.number().nullable().optional().describe("Job ID if filtered"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Cron history cleanup result");
