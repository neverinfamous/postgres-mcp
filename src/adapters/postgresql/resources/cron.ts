/**
 * pg_cron Status Resource
 *
 * Provides pg_cron job status, schedules, and execution history.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";

/** Safely convert unknown value to string */
function toStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface CronResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  jobs: {
    jobid: number;
    jobname: string | null;
    schedule: string;
    command: string;
    nodename: string;
    nodeport: number;
    database: string;
    username: string;
    active: boolean;
  }[];
  jobCount: number;
  activeJobCount: number;
  recentRuns: {
    total: number;
    successful: number;
    failed: number;
  };
  failedJobs: {
    jobid: number;
    command: string;
    lastFailure: string;
    failureCount: number;
  }[];
  recommendations: string[];
}

export function createCronResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://cron",
    name: "pg_cron Status",
    description:
      "pg_cron job scheduling status, active jobs, and execution history",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: CronResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        jobs: [],
        jobCount: 0,
        activeJobCount: 0,
        recentRuns: {
          total: 0,
          successful: 0,
          failed: 0,
        },
        failedJobs: [],
        recommendations: [],
      };

      // Check if pg_cron is installed (outside try-catch for correct error messaging)
      const extCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'pg_cron'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "pg_cron is not installed. Installation steps:",
          "1. Add to postgresql.conf: shared_preload_libraries = 'pg_cron'",
          "2. Add to postgresql.conf: cron.database_name = 'your_database'",
          "3. Restart PostgreSQL (required for shared_preload_libraries)",
          "4. Run: CREATE EXTENSION pg_cron;",
          "Note: pg_cron requires superuser privileges and a PostgreSQL restart to enable.",
        );
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      try {
        // Get all jobs
        const jobsResult = await adapter.executeQuery(
          `SELECT jobid, jobname, schedule, command, nodename, nodeport, database, username, active
                     FROM cron.job ORDER BY jobid`,
        );

        if (jobsResult.rows) {
          for (const row of jobsResult.rows) {
            result.jobs.push({
              jobid: Number(row["jobid"]),
              jobname:
                typeof row["jobname"] === "string" ? row["jobname"] : null,
              schedule: toStr(row["schedule"]),
              command: toStr(row["command"]),
              nodename: toStr(row["nodename"]),
              nodeport: Number(row["nodeport"]),
              database: toStr(row["database"]),
              username: toStr(row["username"]),
              active: Boolean(row["active"]),
            });
          }
          result.jobCount = result.jobs.length;
          result.activeJobCount = result.jobs.filter((j) => j.active).length;
        }

        // Get recent run statistics (last 7 days)
        const runsResult = await adapter.executeQuery(
          `SELECT status, COUNT(*)::int as count
                     FROM cron.job_run_details
                     WHERE start_time > NOW() - INTERVAL '7 days'
                     GROUP BY status`,
        );

        if (runsResult.rows) {
          for (const row of runsResult.rows) {
            const count = Number(row["count"] ?? 0);
            const status = toStr(row["status"]);
            result.recentRuns.total += count;
            if (status === "succeeded") {
              result.recentRuns.successful += count;
            } else if (status === "failed") {
              result.recentRuns.failed += count;
            }
          }
        }

        // Get last run time per job
        const lastRunResult = await adapter.executeQuery(
          `SELECT DISTINCT ON (jobid) 
                            jobid,
                            status as last_status,
                            start_time as last_run_time,
                            end_time as last_end_time
                     FROM cron.job_run_details
                     ORDER BY jobid, start_time DESC`,
        );

        // Attach last run info to each job
        const lastRunMap = new Map<number, { status: string; time: string }>();
        if (lastRunResult.rows) {
          for (const row of lastRunResult.rows) {
            lastRunMap.set(Number(row["jobid"]), {
              status: toStr(row["last_status"]),
              time: toStr(row["last_run_time"]),
            });
          }
        }

        // Enhance jobs with last run info
        for (const job of result.jobs) {
          const lastRun = lastRunMap.get(job.jobid);
          if (lastRun) {
            (job as Record<string, unknown>)["lastRunTime"] = lastRun.time;
            (job as Record<string, unknown>)["lastRunStatus"] = lastRun.status;
          }
        }

        // Get failed jobs with details
        const failedResult = await adapter.executeQuery(
          `SELECT j.jobid, j.command, d.return_message, 
                            COUNT(*)::int as failure_count
                     FROM cron.job j
                     JOIN cron.job_run_details d ON j.jobid = d.jobid
                     WHERE d.status = 'failed' 
                       AND d.start_time > NOW() - INTERVAL '7 days'
                     GROUP BY j.jobid, j.command, d.return_message
                     ORDER BY failure_count DESC
                     LIMIT 5`,
        );

        if (failedResult.rows) {
          for (const row of failedResult.rows) {
            const command = toStr(row["command"]);
            result.failedJobs.push({
              jobid: Number(row["jobid"]),
              command: command.substring(0, 100),
              lastFailure: toStr(row["return_message"]),
              failureCount: Number(row["failure_count"]),
            });
          }
        }

        // Generate recommendations
        if (result.jobCount === 0) {
          result.recommendations.push(
            "No cron jobs scheduled. Use pg_cron_schedule to create jobs.",
          );
        }

        if (result.failedJobs.length > 0) {
          result.recommendations.push(
            `${String(result.failedJobs.length)} jobs have failed recently. Review job_run_details for errors.`,
          );
        }

        const inactiveJobs = result.jobs.filter((j) => !j.active);
        if (inactiveJobs.length > 0) {
          result.recommendations.push(
            `${String(inactiveJobs.length)} jobs are inactive. Consider removing them with pg_cron_unschedule.`,
          );
        }

        // Check for old history that should be cleaned
        const historyCheck = await adapter.executeQuery(
          `SELECT COUNT(*)::int as old_count 
                     FROM cron.job_run_details 
                     WHERE start_time < NOW() - INTERVAL '30 days'`,
        );

        const oldCount = Number(historyCheck.rows?.[0]?.["old_count"] ?? 0);
        if (oldCount > 1000) {
          result.recommendations.push(
            `${String(oldCount)} old history records. Use pg_cron_cleanup_history to reduce bloat.`,
          );
        }
      } catch {
        // Extension is installed but data queries failed (permissions, schema visibility, etc.)
        result.recommendations.push(
          "Error querying pg_cron data. Check permissions on cron schema tables.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
