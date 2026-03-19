/**
 * PostgreSQL Core Tools - Object Operations
 *
 * List and describe database objects (tables, views, functions, etc.).
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "./error-helpers.js";
import {
  ListObjectsSchemaBase,
  ListObjectsSchema,
  ObjectDetailsSchema,
  ObjectDetailsSchemaBase,
  ObjectListOutputSchema,
  ObjectDetailsOutputSchema,
  ExtensionListOutputSchema,
} from "./schemas/index.js";

/**
 * List database objects
 */
export function createListObjectsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_objects",
    description:
      'List database objects filtered by type. Use type: "table" (singular) or types: ["table","view"] (array). Supports: table, view, materialized_view, function, procedure, sequence, index, trigger.',
    group: "core",
    annotations: readOnly("List Objects"),
    icons: getToolIcons("core", readOnly("List Objects")),
    inputSchema: ListObjectsSchemaBase,
    outputSchema: ObjectListOutputSchema,
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { schema, types, limit } = ListObjectsSchema.parse(params);

        const schemaFilter = schema
          ? `AND n.nspname = '${schema}'`
          : `AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')`;

        const typeFilters: string[] = [];
        const selectedTypes = types ?? [
          "table",
          "view",
          "materialized_view",
          "function",
          "sequence",
        ];

        if (selectedTypes.includes("table")) typeFilters.push(`('r', 'table')`);
        if (selectedTypes.includes("view")) typeFilters.push(`('v', 'view')`);
        if (selectedTypes.includes("materialized_view"))
          typeFilters.push(`('m', 'materialized_view')`);
        if (selectedTypes.includes("sequence"))
          typeFilters.push(`('S', 'sequence')`);

        const objects: {
          type: string;
          schema: string;
          name: string;
          owner: string;
        }[] = [];

        // Get tables, views, materialized views, sequences
        if (typeFilters.length > 0) {
          const sql = `
                      SELECT
                          CASE c.relkind
                              ${selectedTypes.includes("table") ? `WHEN 'r' THEN 'table'` : ""}
                              ${selectedTypes.includes("view") ? `WHEN 'v' THEN 'view'` : ""}
                              ${selectedTypes.includes("materialized_view") ? `WHEN 'm' THEN 'materialized_view'` : ""}
                              ${selectedTypes.includes("sequence") ? `WHEN 'S' THEN 'sequence'` : ""}
                          END as type,
                          n.nspname as schema,
                          c.relname as name,
                          pg_get_userbyid(c.relowner) as owner
                      FROM pg_class c
                      JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE c.relkind IN (${selectedTypes
                        .map((t) => {
                          if (t === "table") return `'r'`;
                          if (t === "view") return `'v'`;
                          if (t === "materialized_view") return `'m'`;
                          if (t === "sequence") return `'S'`;
                          return null;
                        })
                        .filter(Boolean)
                        .join(", ")})
                      ${schemaFilter}
                      ORDER BY n.nspname, c.relname
                  `;
          const result = await adapter.executeQuery(sql);
          objects.push(...(result.rows as typeof objects));
        }

        // Get functions
        if (
          selectedTypes.includes("function") ||
          selectedTypes.includes("procedure")
        ) {
          const kindFilter = [];
          if (selectedTypes.includes("function")) kindFilter.push(`'f'`, `'a'`);
          if (selectedTypes.includes("procedure")) kindFilter.push(`'p'`);

          const sql = `
                      SELECT
                          CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END as type,
                          n.nspname as schema,
                          p.proname as name,
                          pg_get_userbyid(p.proowner) as owner
                      FROM pg_proc p
                      JOIN pg_namespace n ON n.oid = p.pronamespace
                      WHERE p.prokind IN (${kindFilter.join(", ")})
                      ${
                        schema
                          ? `AND n.nspname = '${schema}'`
                          : `AND n.nspname NOT IN ('pg_catalog', 'information_schema')`
                      }
                      ORDER BY n.nspname, p.proname
                  `;
          const result = await adapter.executeQuery(sql);
          objects.push(...(result.rows as typeof objects));
        }

        // Get indexes
        if (selectedTypes.includes("index")) {
          const sql = `
                      SELECT
                          'index' as type,
                          n.nspname as schema,
                          c.relname as name,
                          pg_get_userbyid(c.relowner) as owner
                      FROM pg_class c
                      JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE c.relkind = 'i'
                      ${schemaFilter}
                      ORDER BY n.nspname, c.relname
                  `;
          const result = await adapter.executeQuery(sql);
          objects.push(...(result.rows as typeof objects));
        }

        // Get triggers
        if (selectedTypes.includes("trigger")) {
          const sql = `
                      SELECT DISTINCT
                          'trigger' as type,
                          n.nspname as schema,
                          t.tgname as name,
                          pg_get_userbyid(c.relowner) as owner
                      FROM pg_trigger t
                      JOIN pg_class c ON c.oid = t.tgrelid
                      JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE NOT t.tgisinternal
                      ${schemaFilter}
                      ORDER BY n.nspname, t.tgname
                  `;
          const result = await adapter.executeQuery(sql);
          objects.push(...(result.rows as typeof objects));
        }

        // Apply default limit of 100 if not specified
        const effectiveLimit = limit ?? 100;
        const truncated = objects.length > effectiveLimit;
        const limitedObjects = truncated
          ? objects.slice(0, effectiveLimit)
          : objects;

        return {
          objects: limitedObjects,
          count: limitedObjects.length,
          totalCount: objects.length, // Total before limit
          byType: limitedObjects.reduce<Record<string, number>>((acc, obj) => {
            acc[obj.type] = (acc[obj.type] ?? 0) + 1;
            return acc;
          }, {}),
          ...(truncated && {
            truncated: true,
            hint: `Showing ${String(effectiveLimit)} of ${String(objects.length)} objects. Use 'limit' to see more, or 'schema'/'types' to filter.`,
          }),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_list_objects",
          });
      }
    },
  };
}

/**
 * Get object details
 */
export function createObjectDetailsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_object_details",
    description:
      "Get detailed metadata for a specific database object (table, view, function, sequence, index).",
    group: "core",
    inputSchema: ObjectDetailsSchemaBase,
    outputSchema: ObjectDetailsOutputSchema,
    annotations: readOnly("Object Details"),
    icons: getToolIcons("core", readOnly("Object Details")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, type } = ObjectDetailsSchema.parse(params);
        const schemaName = schema ?? "public";

        // Determine the actual object type
        const detectSql = `
                SELECT
                    CASE
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'r') THEN 'table'
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'p') THEN 'partitioned_table'
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'v') THEN 'view'
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'm') THEN 'materialized_view'
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'i') THEN 'index'
                        WHEN EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                                    WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = 'S') THEN 'sequence'
                        WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                                    WHERE p.proname = $1 AND n.nspname = $2) THEN 'function'
                    END as object_type
            `;
        const detectResult = await adapter.executeQuery(detectSql, [
          name,
          schemaName,
        ]);
        const detectedType = (
          detectResult.rows?.[0] as { object_type: string } | undefined
        )?.object_type as typeof type;

        // Validate type if specified
        if (type && detectedType && type !== detectedType) {
          return {
            success: false,
            error:
              `Object '${schemaName}.${name}' is a ${detectedType}, not a ${type}. ` +
              `Use type: '${detectedType}' or omit type to auto-detect.`,
          };
        }

        // If type was provided but object not found, return clear error
        if (type && !detectedType) {
          return {
            success: false,
            error: `Object '${schemaName}.${name}' not found (searched as ${type}). Use pg_list_objects to discover available objects.`,
          };
        }

        const objectType = type ?? detectedType;

        if (!objectType) {
          return {
            success: false,
            error: `Object '${schemaName}.${name}' not found. Use pg_list_objects to discover available objects.`,
          };
        }

        let details: Record<string, unknown> = {
          name,
          schema: schemaName,
          type: objectType,
        };

        if (
          objectType === "table" ||
          objectType === "partitioned_table" ||
          objectType === "view" ||
          objectType === "materialized_view"
        ) {
          const tableDetails = await adapter.describeTable(name, schemaName);
          details = { ...details, ...tableDetails };

          // For views and materialized views, also get the view definition SQL
          if (objectType === "view" || objectType === "materialized_view") {
            const relkind = objectType === "view" ? "v" : "m";
            const viewDefSql = `
                        SELECT pg_get_viewdef(c.oid, true) as definition
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relname = $1 AND n.nspname = $2 AND c.relkind = '${relkind}'
                    `;
            const viewDefResult = await adapter.executeQuery(viewDefSql, [
              name,
              schemaName,
            ]);
            if (viewDefResult.rows && viewDefResult.rows.length > 0) {
              details["definition"] = viewDefResult.rows[0]?.[
                "definition"
              ] as string;
              details["hasDefinition"] = true;
            }
          }
        } else if (objectType === "function") {
          const sql = `
                    SELECT
                        p.proname as name,
                        pg_get_function_arguments(p.oid) as arguments,
                        pg_get_function_result(p.oid) as return_type,
                        p.prosrc as source,
                        l.lanname as language,
                        p.provolatile as volatility,
                        pg_get_userbyid(p.proowner) as owner
                    FROM pg_proc p
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                    JOIN pg_language l ON l.oid = p.prolang
                    WHERE p.proname = $1 AND n.nspname = $2
                `;
          const result = await adapter.executeQuery(sql, [name, schemaName]);
          const funcRow = result.rows?.[0];
          if (funcRow) {
            details = {
              ...details,
              ...funcRow,
              // Add camelCase aliases
              returnType: funcRow["return_type"] as string,
            };
          }
        } else if (objectType === "sequence") {
          // Get sequence metadata from pg_sequence catalog
          const metaSql = `
                    SELECT
                        s.seqstart as start_value,
                        s.seqmin as min_value,
                        s.seqmax as max_value,
                        s.seqincrement as increment,
                        s.seqcycle as cycle,
                        s.seqcache as cache,
                        pg_get_userbyid(c.relowner) as owner
                    FROM pg_sequence s
                    JOIN pg_class c ON c.oid = s.seqrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = $1 AND c.relname = $2
                `;
          const metaResult = await adapter.executeQuery(metaSql, [
            schemaName,
            name,
          ]);
          if (metaResult.rows && metaResult.rows.length > 0) {
            details = { ...details, ...metaResult.rows[0] };
          }

          // Get current value by querying the sequence directly
          try {
            const valueSql = `SELECT last_value, is_called FROM "${schemaName}"."${name}"`;
            const valueResult = await adapter.executeQuery(valueSql);
            if (valueResult.rows && valueResult.rows.length > 0) {
              const seqRow = valueResult.rows[0] as {
                last_value: number;
                is_called: boolean;
              };
              details["last_value"] = seqRow.last_value;
              details["is_called"] = seqRow.is_called;
              // Add human-readable current value explanation
              details["current_value"] = seqRow.is_called
                ? seqRow.last_value
                : `${String(seqRow.last_value)} (not yet used, next call returns this value)`;
            }
          } catch {
            // Sequence might not be accessible, skip current value
          }
        } else if (objectType === "index") {
          const sql = `
                    SELECT
                        i.relname as index_name,
                        t.relname as table_name,
                        am.amname as index_type,
                        pg_get_indexdef(i.oid) as definition,
                        ix.indisunique as is_unique,
                        ix.indisprimary as is_primary,
                        pg_size_pretty(pg_relation_size(i.oid)) as size
                    FROM pg_index ix
                    JOIN pg_class i ON i.oid = ix.indexrelid
                    JOIN pg_class t ON t.oid = ix.indrelid
                    JOIN pg_am am ON am.oid = i.relam
                    JOIN pg_namespace n ON n.oid = i.relnamespace
                    WHERE i.relname = $1 AND n.nspname = $2
                `;
          const result = await adapter.executeQuery(sql, [name, schemaName]);
          if (result.rows && result.rows.length > 0) {
            details = { ...details, ...result.rows[0] };
          }
        }

        return details;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_object_details",
          });
      }
    },
  };
}

/**
 * List installed PostgreSQL extensions
 */
export function createListExtensionsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_extensions",
    description: "List installed PostgreSQL extensions with versions.",
    group: "core",
    inputSchema: z.object({}),
    outputSchema: ExtensionListOutputSchema,
    annotations: readOnly("List Extensions"),
    icons: getToolIcons("core", readOnly("List Extensions")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        const result = await adapter.executeQuery(`
          SELECT
            e.extname as name,
            e.extversion as version,
            n.nspname as schema,
            c.description
          FROM pg_extension e
          LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
          LEFT JOIN pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass
          ORDER BY e.extname
        `);
        return {
          extensions: result.rows,
          count: result.rows?.length ?? 0,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_list_extensions",
          });
      }
    },
  };
}
