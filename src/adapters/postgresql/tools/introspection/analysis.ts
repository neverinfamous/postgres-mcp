/**
 * PostgreSQL Introspection Tools - Schema Analysis
 *
 * Constraint analysis and migration risk assessment tools.
 * 2 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  parseArrayColumn,
  qualifiedName,
  checkSchemaExists,
  checkTableExists,
} from "./helpers.js";
import {
  ConstraintAnalysisSchemaBase,
  ConstraintAnalysisSchema,
  MigrationRisksSchemaBase,
  MigrationRisksSchema,
  // Output schemas
  ConstraintAnalysisOutputSchema,
  MigrationRisksOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_constraint_analysis
// =============================================================================


export function createConstraintAnalysisTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_constraint_analysis",
    description:
      "Analyze all constraints for issues: redundant indexes, missing foreign keys, missing NOT NULL, missing primary keys, and unindexed foreign keys.",
    group: "introspection",
    inputSchema: ConstraintAnalysisSchemaBase,
    outputSchema: ConstraintAnalysisOutputSchema,
    annotations: readOnly("Constraint Analysis"),
    icons: getToolIcons("introspection", readOnly("Constraint Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ConstraintAnalysisSchema.parse(params);

        // Validate schema existence when filtering by schema
        await checkSchemaExists(adapter, parsed.schema);

        // Validate table existence when filtering by table
        await checkTableExists(
          adapter,
          parsed.table,
          parsed.schema,
        );

        const runAll = !parsed.checks || parsed.checks.length === 0;
        const checks = new Set(parsed.checks ?? []);

        interface Finding {
          type: string;
          severity: "info" | "warning" | "error";
          table: string;
          description: string;
          suggestion?: string;
        }

        const findings: Finding[] = [];
        const schemaParams: unknown[] = [];
        let schemaWhere = "";
        let tableWhere = "";

        if (parsed.schema) {
          schemaParams.push(parsed.schema);
          schemaWhere = `AND n.nspname = $${String(schemaParams.length)}`;
        }
        if (parsed.table) {
          schemaParams.push(parsed.table);
          tableWhere = `AND c.relname = $${String(schemaParams.length)}`;
        }

        const extensionSchemaExclude =
          !parsed.schema &&
          !parsed.table &&
          parsed.excludeExtensionSchemas !== false
            ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
            : "";

        // Check: Tables without primary keys
        if (runAll || checks.has("missing_pk")) {
          const result = await adapter.executeQuery(
            `SELECT n.nspname AS schema, c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p')
             AND n.nspname NOT IN ('pg_catalog', 'information_schema')
             AND n.nspname !~ '^pg_toast'
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint pk
               WHERE pk.conrelid = c.oid AND pk.contype = 'p'
             )
             ${extensionSchemaExclude} ${schemaWhere} ${tableWhere}
           ORDER BY n.nspname, c.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );

          for (const row of result.rows ?? []) {
            findings.push({
              type: "missing_pk",
              severity: "error",
              table: qualifiedName(
                row["schema"] as string,
                row["table_name"] as string,
              ),
              description: "Table has no primary key",
              suggestion:
                "Add a primary key column (e.g., id SERIAL PRIMARY KEY) for data integrity and efficient lookups",
            });
          }
        }

        // Check: Unindexed foreign keys
        if (runAll || checks.has("unindexed_fk")) {
          const result = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, t.relname AS table_name,
            c.conname AS constraint_name,
            array_agg(a.attname ORDER BY x.ordinality) AS columns
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ordinality)
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
          WHERE c.contype = 'f'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ${extensionSchemaExclude}
            AND NOT EXISTS (
              SELECT 1 FROM pg_index ix
              WHERE ix.indrelid = t.oid
                AND c.conkey <@ ix.indkey::smallint[]
            )
            ${schemaWhere} ${tableWhere.replace("c.relname", "t.relname")}
          GROUP BY n.nspname, t.relname, c.conname
          ORDER BY n.nspname, t.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );

          for (const row of result.rows ?? []) {
            const cols = parseArrayColumn(row["columns"]);
            findings.push({
              type: "unindexed_fk",
              severity: "warning",
              table: qualifiedName(
                row["schema"] as string,
                row["table_name"] as string,
              ),
              description: `Foreign key '${row["constraint_name"] as string}' on column(s) [${cols.join(", ")}] has no supporting index`,
              suggestion: `CREATE INDEX ON ${qualifiedName(row["schema"] as string, row["table_name"] as string)} (${cols.join(", ")})`,
            });
          }
        }

        // Check: Tables with columns that likely should have NOT NULL
        if (runAll || checks.has("missing_not_null")) {
          const result = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, c.relname AS table_name,
            a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p')
            AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull = false
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            ${extensionSchemaExclude}
            AND a.attname IN ('id', 'uuid', 'email', 'name', 'created_at', 'updated_at', 'status', 'type')
            AND NOT EXISTS (SELECT 1 FROM pg_constraint pk WHERE pk.conrelid = c.oid AND a.attnum = ANY(pk.conkey) AND pk.contype = 'p')
            ${schemaWhere} ${tableWhere}
          ORDER BY n.nspname, c.relname, a.attname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );

          for (const row of result.rows ?? []) {
            findings.push({
              type: "missing_not_null",
              severity: "info",
              table: qualifiedName(
                row["schema"] as string,
                row["table_name"] as string,
              ),
              description: `Column '${row["column_name"] as string}' (${row["type"] as string}) is nullable but commonly expected to be NOT NULL`,
              suggestion: `ALTER TABLE ${qualifiedName(row["schema"] as string, row["table_name"] as string)} ALTER COLUMN "${row["column_name"] as string}" SET NOT NULL`,
            });
          }
        }

        // Build summary
        const byType: Record<string, number> = {};
        const bySeverity: Record<string, number> = {};
        for (const f of findings) {
          byType[f.type] = (byType[f.type] ?? 0) + 1;
          bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
        }

        return {
          findings,
          summary: {
            totalFindings: findings.length,
            byType,
            bySeverity,
          },
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_constraint_analysis",
          });
      }
    },
  };
}

// =============================================================================
// pg_migration_risks
// =============================================================================

/** DDL patterns and their associated risks */
const DDL_RISK_PATTERNS: {
  pattern: RegExp;
  category: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  description: string;
  mitigation?: string;
  requiresDowntime: boolean;
  lockImpact: string;
}[] = [
  {
    pattern: /\bDROP\s+TABLE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description: "DROP TABLE permanently deletes the table and all its data",
    mitigation:
      "Back up the table first (pg_dump_table), verify no active references",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bTRUNCATE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description: "TRUNCATE removes all rows from the table",
    mitigation: "Verify you intend to delete all data, check CASCADE effects",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bDROP\s+COLUMN\b/i,
    category: "data_loss",
    riskLevel: "high",
    description: "DROP COLUMN permanently removes the column and its data",
    mitigation:
      "Back up the column data first, verify no application dependencies",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bALTER\s+(?:TABLE|COLUMN)\b.*\bSET\s+NOT\s+NULL\b/i,
    category: "constraint",
    riskLevel: "high",
    description:
      "Adding NOT NULL requires a full table scan to verify no NULL values exist",
    mitigation:
      "First check for NULLs: SELECT COUNT(*) FROM table WHERE column IS NULL",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE during verification scan",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+(?:CONSTRAINT\b.*\b)?FOREIGN\s+KEY\b/i,
    category: "constraint",
    riskLevel: "medium",
    description: "Adding a foreign key requires validating all existing rows",
    mitigation:
      "Use NOT VALID to skip validation, then VALIDATE CONSTRAINT separately",
    requiresDowntime: false,
    lockImpact: "SHARE ROW EXCLUSIVE on both tables",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+COLUMN\b/i,
    category: "schema_change",
    riskLevel: "low",
    description:
      "Adding a nullable column without a default is a metadata-only change",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (very brief)",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+COLUMN\b.*\bDEFAULT\b/i,
    category: "schema_change",
    riskLevel: "medium",
    description:
      "Adding a column with a volatile DEFAULT may require rewriting all rows (PG < 11) or is metadata-only (PG >= 11)",
    mitigation:
      "On PG >= 11, this is usually fast. On older versions, consider adding without default then updating",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (metadata-only on PG >= 11)",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bALTER\s+COLUMN\b.*\bTYPE\b/i,
    category: "schema_change",
    riskLevel: "high",
    description: "Changing column type requires rewriting the entire table",
    mitigation:
      "Consider creating a new column, migrating data, then dropping the old one",
    requiresDowntime: true,
    lockImpact: "ACCESS EXCLUSIVE for the entire rewrite",
  },
  {
    pattern: /\bCREATE\s+INDEX\b(?!\s+CONCURRENTLY)/i,
    category: "locking",
    riskLevel: "high",
    description:
      "CREATE INDEX (non-concurrent) blocks writes to the table for the entire build duration",
    mitigation: "Use CREATE INDEX CONCURRENTLY to avoid blocking writes",
    requiresDowntime: false,
    lockImpact: "SHARE lock on the table (blocks INSERT/UPDATE/DELETE)",
  },
  {
    pattern: /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i,
    category: "locking",
    riskLevel: "low",
    description:
      "CREATE INDEX CONCURRENTLY allows concurrent writes but takes longer",
    requiresDowntime: false,
    lockImpact: "No blocking locks (uses ShareUpdateExclusiveLock)",
  },
  {
    pattern: /\bDROP\s+INDEX\b(?!\s+CONCURRENTLY)/i,
    category: "locking",
    riskLevel: "medium",
    description:
      "DROP INDEX blocks writes briefly. May degrade query performance",
    mitigation:
      "Use DROP INDEX CONCURRENTLY in production, verify no critical queries depend on it",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (brief)",
  },
  {
    pattern: /\bRENAME\s+(?:TABLE|COLUMN|TO)\b/i,
    category: "breaking_change",
    riskLevel: "high",
    description:
      "Renaming a table or column will break any application queries referencing the old name",
    mitigation:
      "Create a view with the old name pointing to the new name for backward compatibility",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (brief)",
  },
  {
    pattern: /\bDROP\s+SCHEMA\b.*\bCASCADE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description:
      "DROP SCHEMA CASCADE deletes the schema and ALL objects within it",
    mitigation:
      "List all objects in the schema first, verify intent, and back up critical data",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on all objects in the schema",
  },
];

export function createMigrationRisksTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_migration_risks",
    description:
      "Analyze proposed DDL statements for risks: data loss, lock contention, constraint violations, and breaking changes. Pre-flight check before executing migrations.",
    group: "introspection",
    inputSchema: MigrationRisksSchemaBase,
    outputSchema: MigrationRisksOutputSchema,
    annotations: readOnly("Migration Risks"),
    icons: getToolIcons("introspection", readOnly("Migration Risks")),
    handler: (params: unknown, _context: RequestContext) =>
      Promise.resolve()
        .then(() => {
          // Suppress unused-var — adapter captured by closure per tool factory pattern
          void adapter;
          const parsed = MigrationRisksSchema.parse(params);

          interface Risk {
            statement: string;
            statementIndex: number;
            riskLevel: "low" | "medium" | "high" | "critical";
            category: string;
            description: string;
            mitigation?: string | undefined;
          }

          const risks: Risk[] = [];
          let requiresDowntime = false;
          let highestRiskLevel: "low" | "medium" | "high" | "critical" = "low";
          const lockImpacts = new Set<string>();

          const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };

          for (let i = 0; i < parsed.statements.length; i++) {
            const stmt = parsed.statements[i] ?? "";

            for (const pattern of DDL_RISK_PATTERNS) {
              if (pattern.pattern.test(stmt)) {
                risks.push({
                  statement:
                    stmt.length > 200 ? stmt.slice(0, 200) + "..." : stmt,
                  statementIndex: i,
                  riskLevel: pattern.riskLevel,
                  category: pattern.category,
                  description: pattern.description,
                  mitigation: pattern.mitigation,
                });

                if (pattern.requiresDowntime) {
                  requiresDowntime = true;
                }
                if (
                  riskOrder[pattern.riskLevel] > riskOrder[highestRiskLevel]
                ) {
                  highestRiskLevel = pattern.riskLevel;
                }
                lockImpacts.add(pattern.lockImpact);
              }
            }
          }

          return {
            risks,
            summary: {
              totalStatements: parsed.statements.length,
              totalRisks: risks.length,
              highestRisk: highestRiskLevel,
              requiresDowntime,
              estimatedLockImpact:
                lockImpacts.size > 0 ? [...lockImpacts].join("; ") : "None",
            },
          };
        })
        .catch((error: unknown) => formatHandlerErrorResponse(error, { tool: "pg_migration_risks" })),
  };
}
