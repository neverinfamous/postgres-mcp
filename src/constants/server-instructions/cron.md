# Cron Tools (pg_cron)

Core: `createExtension()`, `schedule()`, `scheduleInDatabase()`, `unschedule()`, `alterJob()`, `listJobs()`, `jobRunDetails()`, `cleanupHistory()`

- `pg_cron_schedule`: Schedule a cron job. `schedule` supports standard cron (`0 5 * * *`) or interval (`1 second` to `59 seconds`). ⚠️ Interval syntax only works for 1-59 seconds—for 60+ seconds, use cron syntax (e.g., `* * * * *` for every minute). Use `name`/`jobName` for identification. `command`/`sql`/`query` aliases supported. Note: pg_cron allows duplicate job names; use unique names to avoid confusion when unscheduling
- `pg_cron_schedule_in_database`: Schedule job in specific database. `database`/`db` aliases. Optional `username`, `active` params
- `pg_cron_unschedule`: Remove job by `jobId` or `jobName`. Inactive job failures are handled via `jobId` fallback lookups. If both provided, `jobName` takes precedence (with warning)
- `pg_cron_alter_job`: Modify existing job. Can change `schedule`, `command`, `database`, `username`, `active`. ⛔ Non-existent jobId returns error
- `pg_cron_list_jobs`: List all jobs. Default `limit: 50` (use `0` for all). Optional `active` boolean filter. Returns `truncated` + `totalCount` when limited. Returns `hint` when jobs have no name. Supports `compact` mode (default: `true`) to truncate long text fields like command
- `pg_cron_job_run_details`: View execution history. Default `limit: 10`. Optional `jobId`, `status` ('running'|'succeeded'|'failed') filters. Returns `truncated` + `totalCount` when limited. Returns `summary` with counts. Supports `compact` mode (default: `true`) to truncate long text fields like command and return_message
- `pg_cron_cleanup_history`: Delete old run records. `olderThanDays`/`days` param (default: 7). Optional `jobId` to target specific job
- `pg_cron_create_extension`: Enable pg_cron extension (idempotent). Requires superuser

**Discovery**: `pg.cron.help()` returns `{methods, methodAliases, examples}` object
