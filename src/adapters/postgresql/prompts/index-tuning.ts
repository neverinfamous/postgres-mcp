/**
 * Index Tuning Prompt
 *
 * Comprehensive index analysis and optimization workflow.
 */

import type { PromptDefinition, RequestContext } from "../../../types/index.js";

export function createIndexTuningPrompt(): PromptDefinition {
  return {
    name: "pg_index_tuning",
    description:
      "Comprehensive index analysis covering unused, missing, and duplicate indexes.",
    arguments: [
      {
        name: "schema",
        description: "Schema name to analyze (default: public)",
        required: false,
      },
      {
        name: "focus",
        description: "Focus area: all, unused, missing, duplicate",
        required: false,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const schema = args["schema"] ?? "public";
      const focus = args["focus"] ?? "all";

      let content = `# Index Tuning Workflow - Schema: ${schema}

Focus Area: **${focus.charAt(0).toUpperCase() + focus.slice(1)}**

## Analysis Steps

### 1. Current Index Usage

\`\`\`sql
SELECT
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_scan as index_scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = '${schema}'
ORDER BY idx_scan ASC;
\`\`\`

Use \`pg_index_stats\` for detailed analysis.

**What to look for:**
- idx_scan = 0 → Never used (candidates for removal)
- Large indexes with low scan counts → Expensive but rarely useful
`;

      if (focus === "unused" || focus === "all") {
        content += `
### 2. Unused Indexes

\`\`\`sql
SELECT indexrelname as indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND schemaname = '${schema}';
\`\`\`

**Before dropping:**
- Consider grace period (index might be for monthly reports)
- Check with application team
- Calculate storage savings
`;
      }

      if (focus === "missing" || focus === "all") {
        content += `
### 3. Missing Indexes

Use \`pg_analyze_workload_indexes\` to find:
- Queries with sequential scans on large tables
- Joins without appropriate indexes
- WHERE clauses on unindexed columns

Test recommendations with \`pg_explain_analyze\` and hypothetical indexes.
`;
      }

      if (focus === "duplicate" || focus === "all") {
        content += `
### 4. Duplicate/Redundant Indexes

\`\`\`sql
SELECT
    t.tablename,
    array_agg(i.indexname) as index_names,
    i.indexdef
FROM pg_indexes i
JOIN pg_tables t ON i.tablename = t.tablename
WHERE t.schemaname = '${schema}'
GROUP BY t.tablename, i.indexdef
HAVING COUNT(*) > 1;
\`\`\`

**Redundant patterns:**
- Index on (a, b) makes index on (a) redundant
- Multiple indexes with same columns in different order
`;
      }

      content += `
### 5. Action Plan

**High Priority:**
- Drop unused indexes (immediate space savings)
- Add missing indexes for top slow queries

**Medium Priority:**
- Replace redundant indexes
- Rebuild bloated indexes

### 6. Safe Implementation

\`\`\`sql
-- Safe index creation (doesn't block table)
CREATE INDEX CONCURRENTLY idx_name ON table(column);

-- Safe index removal
BEGIN;
DROP INDEX IF EXISTS idx_old_unused;
-- Test queries here
COMMIT; -- or ROLLBACK if issues
\`\`\`

**Pro Tip:** Use CONCURRENTLY when creating indexes on production databases!`;

      return Promise.resolve(content);
    },
  };
}
