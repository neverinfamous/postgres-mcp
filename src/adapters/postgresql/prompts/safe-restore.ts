/**
 * Safe Restore Workflow Prompt
 *
 * §6: Step-by-step playbook for agents to safely restore a pre-mutation backup
 * snapshot using non-destructive side-by-side comparison. This prompt guides
 * agents through the safest possible restore path, avoiding accidental
 * overwrites of live production data.
 */

import type { PromptDefinition, RequestContext } from "../../../types/index.js";

/**
 * Create the pg_safe_restore_workflow prompt.
 */
export function createSafeRestoreWorkflowPrompt(): PromptDefinition {
  return {
    name: "pg_safe_restore_workflow",
    description:
      "Step-by-step playbook for safely restoring a pre-mutation backup snapshot using side-by-side comparison.",
    arguments: [
      {
        name: "snapshot",
        description: "Snapshot filename or target table name (optional — helps customize guidance)",
        required: false,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const snapshot = args["snapshot"] ?? "";
      const snapshotRef = snapshot
        ? `\n**Target Snapshot:** \`${snapshot}\`\n`
        : "";

      return Promise.resolve(`# Safe Restore Workflow
${snapshotRef}
Follow these 6 steps in order to safely restore a pre-mutation backup snapshot.
This workflow uses **non-destructive restore** (\`restoreAs\`) to avoid overwriting live data.

---

## Step 1: Identify the Snapshot

\`\`\`
pg_audit_list_backups
\`\`\`

Find the snapshot you want to restore. Note the \`filename\`, \`tool\`, \`target\`, and \`timestamp\`.

## Step 2: Inspect the Drift

\`\`\`
pg_audit_diff_backup { filename: "<snapshot_filename>" }
\`\`\`

Review:
- **Schema drift** (\`hasDrift\`): Were columns added, removed, or modified?
- **Volume drift** (\`volumeDrift\`): Did row count or table size change significantly?
- If the object was **dropped** (\`objectExists: false\`), a direct restore may be appropriate.

## Step 3: Dry Run

\`\`\`
pg_audit_restore_backup { filename: "<snapshot_filename>", dryRun: true }
\`\`\`

Review the DDL that will be executed. Verify:
- The CREATE TABLE statement looks correct
- Data INSERT count matches expectations
- No unexpected schema changes

## Step 4: Restore to Side-by-Side Table

\`\`\`
pg_audit_restore_backup {
  filename: "<snapshot_filename>",
  restoreAs: "<original_table>_restored"
}
\`\`\`

This creates the snapshot as a **new table** alongside the original.
The live table is **not modified**.

## Step 5: Compare and Validate

\`\`\`sql
-- Compare row counts
SELECT 'restored' AS source, count(*) FROM schema."<table>_restored"
UNION ALL
SELECT 'live' AS source, count(*) FROM schema."<table>";

-- Compare specific rows (example: find rows in restored but not in live)
SELECT r.* FROM schema."<table>_restored" r
LEFT JOIN schema."<table>" l USING (id)
WHERE l.id IS NULL;
\`\`\`

Use \`pg_read_query\` to run these comparisons. Verify the restored data matches expectations.

## Step 6: Merge or Replace

**Option A — Cherry-pick rows** (safest):
\`\`\`sql
INSERT INTO schema."<table>" SELECT * FROM schema."<table>_restored"
WHERE id IN (...specific_ids...);
\`\`\`

**Option B — Full replacement** (when confirmed safe):
\`\`\`sql
BEGIN;
ALTER TABLE schema."<table>" RENAME TO "<table>_old";
ALTER TABLE schema."<table>_restored" RENAME TO "<table>";
COMMIT;
-- After verification: DROP TABLE schema."<table>_old";
\`\`\`

---

> **Key Principle:** Never restore directly over live data unless the table was dropped.
> Always use \`restoreAs\` first, compare, then merge or swap.`);
    },
  };
}
