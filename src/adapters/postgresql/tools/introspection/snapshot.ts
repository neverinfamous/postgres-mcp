/**
 * PostgreSQL Introspection Tools - Schema Snapshot
 *
 * Complete schema snapshot in a single agent-optimized JSON structure.
 * 1 tool total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { checkSchemaExists } from "./helpers.js";
import {
  SchemaSnapshotSchemaBase,
  SchemaSnapshotSchema,
  SchemaSnapshotOutputSchema,
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

        // Validate schema existence when filtering by schema
        await checkSchemaExists(adapter, parsed.schema);

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

        // Build columns subquery for tables section
        const columnsSubquery = parsed.compact
          ? ""
          : `,
            (SELECT json_agg(json_strip_nulls(json_build_object(
              'name', a.attname,
              'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
              'nullable', CASE WHEN NOT a.attnotnull THEN true ELSE null END,
              'default', pg_get_expr(d.adbin, d.adrelid),
              'primaryKey', CASE WHEN COALESCE((SELECT true FROM pg_constraint pk
                WHERE pk.conrelid = a.attrelid AND a.attnum = ANY(pk.conkey)
                AND pk.contype = 'p'), false) THEN true ELSE null END
            )) ORDER BY a.attnum)
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ) AS columns`;
        
        const rowSizeFields = parsed.compact
          ? ""
          : `,
                CASE WHEN c.reltuples = -1 THEN COALESCE(s.n_live_tup, 0) ELSE c.reltuples END::bigint AS row_count,
                pg_table_size(c.oid) AS size_bytes`;

        const qp = schemaParams.length > 0 ? schemaParams : undefined;

        // Execute all independent section queries in parallel (PERF-P2)
        const [
          tablesResult,
          viewsResult,
          indexesResult,
          constraintsResult,
          functionsResult,
          triggersResult,
          seqResult,
          typesResult,
          extResult,
        ] = await Promise.all([
          // Tables + columns (or compact mode without columns)
          includeAll || sections.has("tables")
            ? adapter.executeQuery(
                `SELECT
                n.nspname AS schema, c.relname AS name,
                CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table' END AS type,
                obj_description(c.oid, 'pg_class') AS comment${rowSizeFields}${columnsSubquery}
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
              WHERE c.relkind IN ('r', 'p')
                ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
              ORDER BY n.nspname, c.relname`,
                qp,
              )
            : null,

          // Views
          includeAll || sections.has("views")
            ? adapter.executeQuery(
                `SELECT
                n.nspname AS schema, c.relname AS name,
                CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS type,
                ${parsed.compact ? 'NULL::text' : 'pg_get_viewdef(c.oid, true)'} AS definition
              FROM pg_class c
              JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relkind IN ('v', 'm')
                ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
              ORDER BY n.nspname, c.relname`,
                qp,
              )
            : null,

          // Indexes
          includeAll || sections.has("indexes")
            ? adapter.executeQuery(
                `SELECT
                i.relname AS name, t.relname AS table_name, n.nspname AS schema,
                am.amname AS type, ix.indisunique AS is_unique,
                ${parsed.compact ? 'NULL::text' : 'pg_get_indexdef(ix.indexrelid)'} AS definition,
                pg_relation_size(i.oid) AS size_bytes
              FROM pg_index ix
              JOIN pg_class t ON t.oid = ix.indrelid
              JOIN pg_class i ON i.oid = ix.indexrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_am am ON am.oid = i.relam
              WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'"}
                ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
              ORDER BY n.nspname, t.relname, i.relname`,
                qp,
              )
            : null,

          // Constraints
          includeAll || sections.has("constraints")
            ? adapter.executeQuery(
                `SELECT
                c.conname AS name, t.relname AS table_name, n.nspname AS schema,
                CASE c.contype WHEN 'p' THEN 'primary_key' WHEN 'f' THEN 'foreign_key'
                  WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' END AS type,
                ${parsed.compact ? 'NULL::text' : 'pg_get_constraintdef(c.oid)'} AS definition
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
                ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
              ORDER BY n.nspname, t.relname, c.conname`,
                qp,
              )
            : null,

          // Functions
          includeAll || sections.has("functions")
            ? adapter.executeQuery(
                `SELECT
                n.nspname AS schema, p.proname AS name,
                ${parsed.compact ? 'NULL::text' : 'pg_get_function_arguments(p.oid)'} AS arguments,
                pg_get_function_result(p.oid) AS return_type,
                l.lanname AS language, p.provolatile AS volatility
              FROM pg_proc p
              JOIN pg_namespace n ON n.oid = p.pronamespace
              JOIN pg_language l ON l.oid = p.prolang
              WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
                ${extensionSchemaExclude} ${extOwnedClause("p.oid")} ${schemaWhere}
              ORDER BY n.nspname, p.proname`,
                qp,
              )
            : null,

          // Triggers
          includeAll || sections.has("triggers")
            ? adapter.executeQuery(
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
                qp,
              )
            : null,

          // Sequences
          includeAll || sections.has("sequences")
            ? adapter.executeQuery(
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
                qp,
              )
            : null,

          // Custom types
          includeAll || sections.has("types")
            ? adapter.executeQuery(
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
                qp,
              )
            : null,

          // Extensions (skip when schema filter is active — extensions are global objects)
          (includeAll || sections.has("extensions")) && !parsed.schema
            ? adapter.executeQuery(
                `SELECT extname AS name, extversion AS version,
                      n.nspname AS schema
               FROM pg_extension e
               JOIN pg_namespace n ON n.oid = e.extnamespace
               ORDER BY e.extname`,
              )
            : null,
        ]);

        // Helper to defensively strip null/undefined/empty arrays from records recursively
        const stripNulls = (rows: Record<string, unknown>[]): Record<string, unknown>[] => {
          const clean = (obj: unknown): unknown => {
            if (Array.isArray(obj)) {
              return obj.map(clean).filter((v) => v != null && v !== "");
            }
            if (obj !== null && typeof obj === "object") {
              const res: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(obj)) {
                if (v == null || v === "") continue;
                const cleaned = clean(v);
                if (Array.isArray(cleaned) && cleaned.length === 0) continue;
                if (
                  typeof cleaned === "object" &&
                  cleaned !== null &&
                  Object.keys(cleaned).length === 0
                ) continue;
                res[k] = cleaned;
              }
              return res;
            }
            return obj;
          };
          return rows.map((r) => clean(r) as Record<string, unknown>);
        };

        // Assign results to snapshot and stats
        if (tablesResult !== null) {
          if (tablesResult.rows && tablesResult.rows.length > 0) snapshot["tables"] = stripNulls(tablesResult.rows);
          stats.tables = tablesResult.rows?.length ?? 0;
        }
        if (viewsResult !== null) {
          if (viewsResult.rows && viewsResult.rows.length > 0) snapshot["views"] = stripNulls(viewsResult.rows);
          stats.views = viewsResult.rows?.length ?? 0;
        }
        if (indexesResult !== null) {
          if (indexesResult.rows && indexesResult.rows.length > 0) snapshot["indexes"] = stripNulls(indexesResult.rows);
          stats.indexes = indexesResult.rows?.length ?? 0;
        }
        if (constraintsResult !== null) {
          if (constraintsResult.rows && constraintsResult.rows.length > 0) snapshot["constraints"] = stripNulls(constraintsResult.rows);
          stats.constraints = constraintsResult.rows?.length ?? 0;
        }
        if (functionsResult !== null) {
          if (functionsResult.rows && functionsResult.rows.length > 0) snapshot["functions"] = stripNulls(functionsResult.rows);
          stats.functions = functionsResult.rows?.length ?? 0;
        }
        if (triggersResult !== null) {
          if (triggersResult.rows && triggersResult.rows.length > 0) snapshot["triggers"] = stripNulls(triggersResult.rows);
          stats.triggers = triggersResult.rows?.length ?? 0;
        }
        if (seqResult !== null) {
          if (seqResult.rows && seqResult.rows.length > 0) snapshot["sequences"] = stripNulls(seqResult.rows);
          stats.sequences = seqResult.rows?.length ?? 0;
        }
        if (typesResult !== null) {
          if (typesResult.rows && typesResult.rows.length > 0) snapshot["types"] = stripNulls(typesResult.rows);
          stats.customTypes = typesResult.rows?.length ?? 0;
        }
        if (extResult !== null) {
          if (extResult.rows && extResult.rows.length > 0) snapshot["extensions"] = stripNulls(extResult.rows);
          stats.extensions = extResult.rows?.length ?? 0;
        }

        return {
          snapshot,
          stats,
          generatedAt: new Date().toISOString(),
          ...(parsed.compact && { compact: true }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_schema_snapshot",
          });
      }
    },
  };
}
