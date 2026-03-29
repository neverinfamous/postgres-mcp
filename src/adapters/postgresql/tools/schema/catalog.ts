/**
 * PostgreSQL Schema Tools - Catalog Listing
 *
 * Listing tools for functions, triggers, and constraints.
 * 3 tools total.
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
  ListFunctionsSchemaBase,
  ListFunctionsSchema,
  ListTriggersSchemaBase,
  ListTriggersSchema,
  ListConstraintsSchemaBase,
  ListConstraintsSchema,
  // Output schemas
  ListFunctionsOutputSchema,
  ListTriggersOutputSchema,
  ListConstraintsOutputSchema,
} from "../../schemas/index.js";

/**
 * Well-known aliases for PostgreSQL extension names.
 * Users naturally write "pgvector" but the extension registers as "vector".
 * This map normalizes user input so exclude filters work correctly.
 */
const EXTENSION_ALIASES: Record<string, string> = {
  pgvector: "vector",
  vector: "vector",
  partman: "pg_partman",
  fuzzymatch: "fuzzystrmatch",
  fuzzy: "fuzzystrmatch",
};

// =============================================================================
// pg_list_functions
// =============================================================================

export function createListFunctionsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_functions",
    description:
      "List user-defined functions with optional filtering. Use exclude (array) to filter out extension functions. Default limit=500 may need increasing for busy databases.",
    group: "schema",
    // Use base schema for MCP visibility - ensures parameters are visible in Direct Tool Calls
    inputSchema: ListFunctionsSchemaBase,
    outputSchema: ListFunctionsOutputSchema,
    annotations: readOnly("List Functions"),
    icons: getToolIcons("schema", readOnly("List Functions")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use full schema with preprocessing for validation
        const parsed = ListFunctionsSchema.parse(params);
        const queryParams: unknown[] = [];

        // Validate schema existence when filtering by schema
        if (parsed.schema !== undefined) {
          const schemaCheck = await adapter.executeQuery(
            `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
            [parsed.schema],
          );
          if ((schemaCheck.rows?.length ?? 0) === 0) {
            throw new Error(`Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`);
          }
        }

        const conditions: string[] = [
          "n.nspname NOT IN ('pg_catalog', 'information_schema')",
        ];

        if (parsed.schema !== undefined) {
          queryParams.push(parsed.schema);
          conditions.push(`n.nspname = $${String(queryParams.length)}`);
        }

        if (parsed.exclude !== undefined && parsed.exclude.length > 0) {
          // Expand well-known aliases (e.g. "pgvector" -> ["pgvector", "vector"])
          const normalizedExclude = parsed.exclude.flatMap((s) => {
            const alias = EXTENSION_ALIASES[s];
            return alias ? [s, alias] : [s];
          });
          const excludePlaceholders = normalizedExclude.map((s) => {
            queryParams.push(s);
            return `$${String(queryParams.length)}`;
          });
          const excludeList = excludePlaceholders.join(", ");
          // Exclude by schema name
          conditions.push(`n.nspname NOT IN (${excludeList})`);
          // Also exclude extension-owned functions (e.g., ltree functions in public schema)
          conditions.push(`NOT EXISTS (
                      SELECT 1 FROM pg_depend d
                      JOIN pg_extension e ON d.refobjid = e.oid
                      WHERE d.objid = p.oid
                      AND d.deptype = 'e'
                      AND e.extname IN (${excludeList})
                  )`);
        }

        if (parsed.language !== undefined) {
          queryParams.push(parsed.language);
          conditions.push(`l.lanname = $${String(queryParams.length)}`);
        }

        // Safe coercion for limit
        const rawLimit = Number(parsed.limit);
        const limitVal = Number.isFinite(rawLimit) ? rawLimit : 50;

        const sql = `SELECT n.nspname as schema, p.proname as name,
                          pg_get_function_arguments(p.oid) as arguments,
                          pg_get_function_result(p.oid) as returns,
                          l.lanname as language,
                          p.provolatile as volatility
                          FROM pg_proc p
                          JOIN pg_namespace n ON n.oid = p.pronamespace
                          JOIN pg_language l ON l.oid = p.prolang
                          WHERE ${conditions.join(" AND ")}
                          ORDER BY n.nspname, p.proname
                          ${limitVal > 0 ? `LIMIT ${String(limitVal)}` : ""}`;

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(sql, queryParams)
            : await adapter.executeQuery(sql);
        return {
          functions: result.rows,
          count: result.rows?.length ?? 0,
          limit: limitVal,
          note:
            limitVal > 0 && (result.rows?.length ?? 0) >= limitVal
              ? `Results limited to ${String(limitVal)}. Use 'limit' param for more, or 'exclude' to filter out extension schemas.`
              : undefined,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_list_functions" });
      }
    },
  };
}

// =============================================================================
// pg_list_triggers
// =============================================================================

export function createListTriggersTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_triggers",
    description: "List all triggers.",
    group: "schema",
    inputSchema: ListTriggersSchemaBase,
    outputSchema: ListTriggersOutputSchema,
    annotations: readOnly("List Triggers"),
    icons: getToolIcons("schema", readOnly("List Triggers")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ListTriggersSchema.parse(params ?? {});

        // Parse schema.table format
        let tableName = parsed.table;
        let schemaName = parsed.schema;
        if (
          typeof tableName === "string" &&
          tableName.includes(".") &&
          !schemaName
        ) {
          const parts = tableName.split(".");
          if (parts.length === 2 && parts[0] && parts[1]) {
            schemaName = parts[0];
            tableName = parts[1];
          }
        }

        const resolvedSchema = schemaName ?? "public";

        // Validate schema existence when filtering by schema
        if (schemaName) {
          const schemaCheck = await adapter.executeQuery(
            `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
            [schemaName],
          );
          if ((schemaCheck.rows?.length ?? 0) === 0) {
            throw new Error(`Schema '${schemaName}' does not exist. Use pg_list_schemas to see available schemas.`);
          }
        }

        // Validate table existence when filtering by table
        if (tableName) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [resolvedSchema, tableName],
          );
          if ((tableCheck.rows?.length ?? 0) === 0) {
            throw new Error(`Table '${resolvedSchema}.${tableName}' not found. Use pg_list_tables to see available tables.`);
          }
        }

        const queryParams: unknown[] = [];
        let whereClause =
          "n.nspname NOT IN ('pg_catalog', 'information_schema')";
        if (schemaName) {
          queryParams.push(schemaName);
          whereClause += ` AND n.nspname = $${String(queryParams.length)}`;
        }
        if (tableName) {
          queryParams.push(tableName);
          whereClause += ` AND c.relname = $${String(queryParams.length)}`;
        }

        const sql = `SELECT n.nspname as schema, c.relname as table_name, t.tgname as name,
                          CASE t.tgtype::int & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
                          array_remove(ARRAY[
                              CASE WHEN t.tgtype::int & 4 = 4 THEN 'INSERT' END,
                              CASE WHEN t.tgtype::int & 8 = 8 THEN 'DELETE' END,
                              CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE' END,
                              CASE WHEN t.tgtype::int & 32 = 32 THEN 'TRUNCATE' END
                          ], NULL) as events,
                          p.proname as function_name,
                          t.tgenabled != 'D' as enabled
                          FROM pg_trigger t
                          JOIN pg_class c ON c.oid = t.tgrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          JOIN pg_proc p ON p.oid = t.tgfoid
                          WHERE NOT t.tgisinternal
                          AND ${whereClause}
                          ORDER BY n.nspname, c.relname, t.tgname`;

        const rawLimit = Number(parsed.limit);
        const limitVal = Number.isFinite(rawLimit) ? rawLimit : 50;
        const finalSql = limitVal > 0 ? `${sql} LIMIT ${String(limitVal)}` : sql;

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(finalSql, queryParams)
            : await adapter.executeQuery(finalSql);
            
        return { 
          triggers: result.rows, 
          count: result.rows?.length ?? 0,
          limit: limitVal,
          note: limitVal > 0 && (result.rows?.length ?? 0) >= limitVal
              ? `Results limited to ${String(limitVal)}. Use 'limit' param for more.`
              : undefined,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_list_triggers" });
      }
    },
  };
}

// =============================================================================
// pg_list_constraints
// =============================================================================

export function createListConstraintsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_constraints",
    description:
      "List table constraints (primary keys, foreign keys, unique, check).",
    group: "schema",
    inputSchema: ListConstraintsSchemaBase,
    outputSchema: ListConstraintsOutputSchema,
    annotations: readOnly("List Constraints"),
    icons: getToolIcons("schema", readOnly("List Constraints")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ListConstraintsSchema.parse(params ?? {});

        // Validate type enum value if provided
        const validTypes = [
          "primary_key",
          "foreign_key",
          "unique",
          "check",
        ] as const;
        if (
          parsed.type !== undefined &&
          !validTypes.includes(parsed.type as (typeof validTypes)[number])
        ) {
          return {
            success: false,
            error: `Validation error: type must be one of: ${validTypes.join(", ")}`,
          };
        }

        // Parse schema.table format
        if (
          typeof parsed.table === "string" &&
          parsed.table.includes(".") &&
          !parsed.schema
        ) {
          const parts = parsed.table.split(".");
          if (parts.length === 2 && parts[0] && parts[1]) {
            parsed.schema = parts[0];
            parsed.table = parts[1];
          }
        }

        const schemaName = parsed.schema ?? "public";

        // Validate schema existence when filtering by schema
        if (parsed.schema) {
          const schemaCheck = await adapter.executeQuery(
            `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
            [parsed.schema],
          );
          if ((schemaCheck.rows?.length ?? 0) === 0) {
            throw new Error(`Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`);
          }
        }

        // Validate table existence when filtering by table
        if (parsed.table) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, parsed.table],
          );
          if ((tableCheck.rows?.length ?? 0) === 0) {
            throw new Error(`Table '${schemaName}.${parsed.table}' not found. Use pg_list_tables to see available tables.`);
          }
        }

        const queryParams: unknown[] = [];
        let whereClause =
          "n.nspname NOT IN ('pg_catalog', 'information_schema') AND con.contype != 'n'";
        if (parsed.schema) {
          queryParams.push(parsed.schema);
          whereClause += ` AND n.nspname = $${String(queryParams.length)}`;
        }
        if (parsed.table) {
          queryParams.push(parsed.table);
          whereClause += ` AND c.relname = $${String(queryParams.length)}`;
        }
        if (parsed.type) {
          const typeMap: Record<string, string> = {
            primary_key: "p",
            foreign_key: "f",
            unique: "u",
            check: "c",
          };
          queryParams.push(typeMap[parsed.type] ?? "");
          whereClause += ` AND con.contype = $${String(queryParams.length)}`;
        }

        const sql = `SELECT n.nspname as schema, c.relname as table_name, con.conname as name,
                          CASE con.contype
                              WHEN 'p' THEN 'primary_key'
                              WHEN 'f' THEN 'foreign_key'
                              WHEN 'u' THEN 'unique'
                              WHEN 'c' THEN 'check'
                          END as type,
                          pg_get_constraintdef(con.oid) as definition
                          FROM pg_constraint con
                          JOIN pg_class c ON c.oid = con.conrelid
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE ${whereClause}
                          ORDER BY n.nspname, c.relname, con.conname`;

        const rawLimit = Number(parsed.limit);
        const limitVal = Number.isFinite(rawLimit) ? rawLimit : 50;
        const finalSql = limitVal > 0 ? `${sql} LIMIT ${String(limitVal)}` : sql;

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(finalSql, queryParams)
            : await adapter.executeQuery(finalSql);
            
        return { 
          constraints: result.rows, 
          count: result.rows?.length ?? 0,
          limit: limitVal,
          note: limitVal > 0 && (result.rows?.length ?? 0) >= limitVal
              ? `Results limited to ${String(limitVal)}. Use 'limit' param for more.`
              : undefined,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_list_constraints" });
      }
    },
  };
}
