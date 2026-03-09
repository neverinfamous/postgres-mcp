/**
 * PostgreSQL Introspection Tools - Schema Analysis
 *
 * Schema snapshot, constraint analysis, and migration risk assessment tools.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import { parseArrayColumn, qualifiedName } from "./graph.js";
import {
  SchemaSnapshotSchemaBase,
  SchemaSnapshotSchema,
  ConstraintAnalysisSchemaBase,
  ConstraintAnalysisSchema,
  MigrationRisksSchemaBase,
  MigrationRisksSchema,
  // Output schemas
  SchemaSnapshotOutputSchema,
  ConstraintAnalysisOutputSchema,
  MigrationRisksOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_schema_snapshot
// =============================================================================

export function createSchemaSnapshotTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_schema_snapshot",
    description:
      "Get a complete schema snapshot in a single agent-optimized JSON structure. Includes tables, columns, types, constraints, indexes, triggers, sequences, and extensions.",
    group: "introspection",
    inputSchema: SchemaSnapshotSchemaBase,
    outputSchema: SchemaSnapshotOutputSchema,
    annotations: readOnly("Schema Snapshot"),
    icons: getToolIcons("introspection", readOnly("Schema Snapshot")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = SchemaSnapshotSchema.parse(params);
        const includeAll = !parsed.sections || parsed.sections.length === 0;
        const sections = new Set(parsed.sections ?? []);

        const snapshot: Record<string, unknown> = {};
        const stats = {
          tables: 0,
          views: 0,
          indexes: 0,
          constraints: 0,
          functions: 0,
          triggers: 0,
          sequences: 0,
          customTypes: 0,
          extensions: 0,
        };

        const schemaExclude = parsed.includeSystem
          ? ""
          : "AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'";
        const extensionSchemaExclude =
          !parsed.schema &&
          !parsed.includeSystem &&
          parsed.excludeExtensionSchemas !== false
            ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
            : "";
        // Exclude extension-owned objects (e.g. spatial_ref_sys, part_config) from public schema
        const extOwnedActive =
          !parsed.includeSystem && parsed.excludeExtensionSchemas !== false;
        const extOwnedClause = (oidExpr: string): string =>
          extOwnedActive
            ? `AND NOT EXISTS (SELECT 1 FROM pg_depend dep WHERE dep.objid = ${oidExpr} AND dep.deptype = 'e')`
            : "";
        const schemaParams: unknown[] = [];
        let schemaWhere = "";
        if (parsed.schema) {
          schemaParams.push(parsed.schema);
          schemaWhere = `AND n.nspname = $${String(schemaParams.length)}`;
        }

        // Tables + columns (or compact mode without columns)
        if (includeAll || sections.has("tables")) {
          const columnsSubquery = parsed.compact
            ? ""
            : `,
            (SELECT json_agg(json_build_object(
              'name', a.attname,
              'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
              'nullable', NOT a.attnotnull,
              'default', pg_get_expr(d.adbin, d.adrelid),
              'primaryKey', COALESCE((SELECT true FROM pg_constraint pk
                WHERE pk.conrelid = a.attrelid AND a.attnum = ANY(pk.conkey)
                AND pk.contype = 'p'), false)
            ) ORDER BY a.attnum)
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ) AS columns`;
          const tablesResult = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, c.relname AS name,
            CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table' END AS type,
            CASE WHEN c.reltuples = -1 THEN COALESCE(s.n_live_tup, 0) ELSE c.reltuples END::bigint AS row_count,
            pg_table_size(c.oid) AS size_bytes,
            obj_description(c.oid, 'pg_class') AS comment${columnsSubquery}
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
          WHERE c.relkind IN ('r', 'p')
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["tables"] = tablesResult.rows ?? [];
          stats.tables = tablesResult.rows?.length ?? 0;
        }

        // Views
        if (includeAll || sections.has("views")) {
          const viewsResult = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, c.relname AS name,
            CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS type,
            pg_get_viewdef(c.oid, true) AS definition
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('v', 'm')
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["views"] = viewsResult.rows ?? [];
          stats.views = viewsResult.rows?.length ?? 0;
        }

        // Indexes
        if (includeAll || sections.has("indexes")) {
          const indexesResult = await adapter.executeQuery(
            `SELECT
            i.relname AS name, t.relname AS table_name, n.nspname AS schema,
            am.amname AS type, ix.indisunique AS is_unique,
            pg_get_indexdef(ix.indexrelid) AS definition,
            pg_relation_size(i.oid) AS size_bytes
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_am am ON am.oid = i.relam
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'"}
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
          ORDER BY n.nspname, t.relname, i.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["indexes"] = indexesResult.rows ?? [];
          stats.indexes = indexesResult.rows?.length ?? 0;
        }

        // Constraints
        if (includeAll || sections.has("constraints")) {
          const constraintsResult = await adapter.executeQuery(
            `SELECT
            c.conname AS name, t.relname AS table_name, n.nspname AS schema,
            CASE c.contype WHEN 'p' THEN 'primary_key' WHEN 'f' THEN 'foreign_key'
              WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' END AS type,
            pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
          ORDER BY n.nspname, t.relname, c.conname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["constraints"] = constraintsResult.rows ?? [];
          stats.constraints = constraintsResult.rows?.length ?? 0;
        }

        // Functions
        if (includeAll || sections.has("functions")) {
          const functionsResult = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, p.proname AS name,
            pg_get_function_arguments(p.oid) AS arguments,
            pg_get_function_result(p.oid) AS return_type,
            l.lanname AS language, p.provolatile AS volatility
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
            ${extensionSchemaExclude} ${extOwnedClause("p.oid")} ${schemaWhere}
          ORDER BY n.nspname, p.proname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["functions"] = functionsResult.rows ?? [];
          stats.functions = functionsResult.rows?.length ?? 0;
        }

        // Triggers
        if (includeAll || sections.has("triggers")) {
          const triggersResult = await adapter.executeQuery(
            `SELECT
            t.tgname AS name, c.relname AS table_name, n.nspname AS schema,
            CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
            array_remove(ARRAY[
              CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
              CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END,
              CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END,
              CASE WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE' END
            ], NULL) AS events,
            p.proname AS function_name
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname, t.tgname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["triggers"] = triggersResult.rows ?? [];
          stats.triggers = triggersResult.rows?.length ?? 0;
        }

        // Sequences
        if (includeAll || sections.has("sequences")) {
          const seqResult = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, c.relname AS name,
            (SELECT tc.relname || '.' || a.attname
             FROM pg_depend d
             JOIN pg_class tc ON tc.oid = d.refobjid
             JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
             WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'a'
             LIMIT 1) AS owned_by
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'S'
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["sequences"] = seqResult.rows ?? [];
          stats.sequences = seqResult.rows?.length ?? 0;
        }

        // Custom types
        if (includeAll || sections.has("types")) {
          const typesResult = await adapter.executeQuery(
            `SELECT
            n.nspname AS schema, t.typname AS name,
            CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'c' THEN 'composite' WHEN 'd' THEN 'domain' WHEN 'r' THEN 'range' END AS type,
            CASE WHEN t.typtype = 'e' THEN
              (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
            END AS values
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typtype IN ('e', 'c', 'd', 'r')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
          ORDER BY n.nspname, t.typname`,
            schemaParams.length > 0 ? schemaParams : undefined,
          );
          snapshot["types"] = typesResult.rows ?? [];
          stats.customTypes = typesResult.rows?.length ?? 0;
        }

        // Extensions (skip when schema filter is active — extensions are global objects)
        if ((includeAll || sections.has("extensions")) && !parsed.schema) {
          const extResult = await adapter.executeQuery(
            `SELECT extname AS name, extversion AS version,
                  n.nspname AS schema
           FROM pg_extension e
           JOIN pg_namespace n ON n.oid = e.extnamespace
           ORDER BY e.extname`,
          );
          snapshot["extensions"] = extResult.rows ?? [];
          stats.extensions = extResult.rows?.length ?? 0;
        }

        // Add hint for nonexistent/empty schema
        const allEmpty = Object.values(stats).every((v) => v === 0);
        const hint =
          parsed.schema !== undefined && allEmpty
            ? `Schema '${parsed.schema}' returned no tables. Verify the schema exists with pg_list_schemas.`
            : undefined;

        return {
          snapshot,
          stats,
          generatedAt: new Date().toISOString(),
          ...(parsed.compact && { compact: true }),
          ...(hint !== undefined && { hint }),
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_schema_snapshot",
          }),
        };
      }
    },
  };
}

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

        // Add hint for nonexistent table
        const hint =
          parsed.table !== undefined && findings.length === 0
            ? `No findings for table '${parsed.schema ? parsed.schema + "." : "public."}${parsed.table}'. Verify the table exists with pg_list_tables.`
            : undefined;

        return {
          findings,
          summary: {
            totalFindings: findings.length,
            byType,
            bySeverity,
          },
          ...(hint !== undefined && { hint }),
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_constraint_analysis",
          }),
        };
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
          // adapter is available for future enhancements (e.g., checking table existence)
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
        .catch((error: unknown) => ({
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_migration_risks",
          }),
        })),
  };
}
