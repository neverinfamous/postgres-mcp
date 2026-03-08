/**
 * PostgreSQL Schema Tools - Views, Functions, Triggers & Constraints
 *
 * Listing and CRUD for views, functions, triggers, and constraints.
 * 6 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  CreateViewSchemaBase,
  CreateViewSchema,
  DropViewSchemaBase,
  DropViewSchema,
  ListFunctionsSchemaBase,
  ListFunctionsSchema,
  // Output schemas
  ListViewsOutputSchema,
  CreateViewOutputSchema,
  DropViewOutputSchema,
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
// pg_list_views
// =============================================================================

export function createListViewsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_views",
    description: "List all views and materialized views.",
    group: "schema",
    inputSchema: z.object({
      schema: z.string().optional(),
      includeMaterialized: z.boolean().optional(),
      truncateDefinition: z
        .any()
        .optional()
        .describe(
          "Max length for view definitions (default: 500). Use 0 for no truncation.",
        ),
      limit: z
        .any()
        .optional()
        .describe(
          "Maximum number of views to return (default: 50). Use 0 for all views.",
        ),
    }),
    outputSchema: ListViewsOutputSchema,
    annotations: readOnly("List Views"),
    icons: getToolIcons("schema", readOnly("List Views")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as {
        schema?: string;
        includeMaterialized?: boolean;
        truncateDefinition?: unknown;
        limit?: unknown;
      };
      const queryParams: unknown[] = [];

      // Validate schema existence when filtering by schema
      if (parsed.schema) {
        const schemaCheck = await adapter.executeQuery(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [parsed.schema],
        );
        if ((schemaCheck.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`,
          };
        }
      }

      const schemaClause = parsed.schema
        ? (queryParams.push(parsed.schema),
          `AND n.nspname = $${String(queryParams.length)}`)
        : "";
      const kindClause =
        parsed.includeMaterialized !== false ? "IN ('v', 'm')" : "= 'v'";

      // Default truncation: 500 chars, 0 = no truncation (safe coercion)
      const rawTruncate = Number(parsed.truncateDefinition);
      const truncateLimit = Number.isFinite(rawTruncate) ? rawTruncate : 500;

      // Default limit: 50, 0 = no limit (safe coercion)
      const rawLimit = Number(parsed.limit);
      const limitVal = Number.isFinite(rawLimit) ? rawLimit : 50;
      const limitClause = limitVal > 0 ? `LIMIT ${String(limitVal + 1)}` : "";

      const sql = `SELECT n.nspname as schema, c.relname as name,
                        CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END as type,
                        TRIM(pg_get_viewdef(c.oid, true)) as definition
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind ${kindClause}
                        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ${schemaClause}
                        ORDER BY n.nspname, c.relname
                        ${limitClause}`;

      const result =
        queryParams.length > 0
          ? await adapter.executeQuery(sql, queryParams)
          : await adapter.executeQuery(sql);
      let views = result.rows ?? [];

      // Check if there are more results than the limit
      const hasMore = limitVal > 0 && views.length > limitVal;
      if (hasMore) {
        views = views.slice(0, limitVal);
      }

      // Truncate definitions if limit is set
      let truncatedCount = 0;
      if (truncateLimit > 0) {
        views = views.map((v: Record<string, unknown>) => {
          const def = v["definition"];
          if (typeof def === "string" && def.length > truncateLimit) {
            truncatedCount++;
            return {
              ...v,
              definition: def.slice(0, truncateLimit) + "...",
              definitionTruncated: true,
            };
          }
          return v;
        });
      }

      const hasMatViews = views.some(
        (v: Record<string, unknown>) => v["type"] === "materialized_view",
      );

      const response: Record<string, unknown> = {
        views,
        count: views.length,
        hasMatViews,
      };
      if (truncatedCount > 0) {
        response["truncatedDefinitions"] = truncatedCount;
      }
      // Always include truncated field for consistent response structure
      response["truncated"] = hasMore;
      if (hasMore) {
        // Get total count
        const countParams: unknown[] = [];
        const countSchemaClause = parsed.schema
          ? (countParams.push(parsed.schema),
            `AND n.nspname = $${String(countParams.length)}`)
          : "";
        const countSql = `SELECT COUNT(*)::int as total FROM pg_class c
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE c.relkind ${kindClause}
                          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                          ${countSchemaClause}`;
        const countResult =
          countParams.length > 0
            ? await adapter.executeQuery(countSql, countParams)
            : await adapter.executeQuery(countSql);
        response["totalCount"] =
          countResult.rows?.[0]?.["total"] ?? views.length;
        response["note"] =
          `Results limited to ${String(limitVal)}. Use 'limit: 0' for all views.`;
      }
      return response;
    },
  };
}

// =============================================================================
// pg_create_view
// =============================================================================

export function createCreateViewTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_create_view",
    description: "Create a view or materialized view.",
    group: "schema",
    inputSchema: CreateViewSchemaBase,
    outputSchema: CreateViewOutputSchema,
    annotations: write("Create View"),
    icons: getToolIcons("schema", write("Create View")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, query, materialized, orReplace, checkOption } =
          CreateViewSchema.parse(params);

        const schemaName = schema ?? "public";

        // Check if view already exists when orReplace is true (for informational response)
        let alreadyExisted: boolean | undefined;
        if (orReplace === true) {
          const relkind = materialized === true ? "m" : "v";
          const existsResult = await adapter.executeQuery(
            `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = $1 AND n.nspname = $2 AND c.relname = $3`,
            [relkind, schemaName, name],
          );
          alreadyExisted = (existsResult.rows?.length ?? 0) > 0;
        }

        const schemaPrefix = schema ? `${sanitizeIdentifier(schema)}.` : "";
        const replaceClause = orReplace && !materialized ? "OR REPLACE " : "";
        const matClause = materialized ? "MATERIALIZED " : "";
        const viewName = sanitizeIdentifier(name);

        // WITH CHECK OPTION clause (not available for materialized views)
        let checkClause = "";
        if (checkOption && checkOption !== "none" && !materialized) {
          checkClause = ` WITH ${checkOption.toUpperCase()} CHECK OPTION`;
        }

        const sql = `CREATE ${replaceClause}${matClause}VIEW ${schemaPrefix}${viewName} AS ${query}${checkClause}`;
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_create_view",
              objectType: "view",
              ...(schema !== undefined && { schema }),
            }),
          };
        }

        const result: Record<string, unknown> = {
          success: true,
          view: `${schemaName}.${name}`,
          materialized: !!materialized,
        };
        if (alreadyExisted !== undefined) {
          result["alreadyExisted"] = alreadyExisted;
        }
        return result;
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_create_view" }),
        };
      }
    },
  };
}

// =============================================================================
// pg_drop_view
// =============================================================================

// DropViewSchema is now imported from schemas/schema-mgmt.js

export function createDropViewTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_view",
    description:
      "Drop a view or materialized view. Supports IF EXISTS and CASCADE options.",
    group: "schema",
    inputSchema: DropViewSchemaBase,
    outputSchema: DropViewOutputSchema,
    annotations: destructive("Drop View"),
    icons: getToolIcons("schema", destructive("Drop View")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          name: rawName,
          schema,
          materialized,
          ifExists,
          cascade,
        } = DropViewSchema.parse(params);
        const name = rawName ?? "";

        const schemaName = schema ?? "public";

        // Check if view exists before dropping (for accurate response)
        const relkind = materialized === true ? "m" : "v";
        const existsResult = await adapter.executeQuery(
          `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = $1 AND n.nspname = $2 AND c.relname = $3`,
          [relkind, schemaName, name],
        );
        const existed = (existsResult.rows?.length ?? 0) > 0;

        const matClause = materialized === true ? "MATERIALIZED " : "";
        const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
        const cascadeClause = cascade === true ? " CASCADE" : "";

        const sql = `DROP ${matClause}VIEW ${ifExistsClause}"${schemaName}"."${name}"${cascadeClause}`;
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_drop_view",
              ...(schema !== undefined && { schema }),
            }),
          };
        }
        return {
          success: true,
          view: `${schemaName}.${name}`,
          materialized: materialized ?? false,
          existed,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_drop_view" }),
        };
      }
    },
  };
}

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
            return {
              success: false,
              error: `Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`,
            };
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

        // Safe coercion for limit (z.any() in base schema)
        const rawLimit = Number(parsed.limit);
        const limitVal = Number.isFinite(rawLimit) ? rawLimit : 500;

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
                          LIMIT ${String(limitVal)}`;

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(sql, queryParams)
            : await adapter.executeQuery(sql);
        return {
          functions: result.rows,
          count: result.rows?.length ?? 0,
          limit: limitVal,
          note:
            (result.rows?.length ?? 0) >= limitVal
              ? `Results limited to ${String(limitVal)}. Use 'limit' param for more, or 'exclude' to filter out extension schemas.`
              : undefined,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_list_functions" }),
        };
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
    inputSchema: z.object({
      schema: z.string().optional(),
      table: z.string().optional(),
    }),
    outputSchema: ListTriggersOutputSchema,
    annotations: readOnly("List Triggers"),
    icons: getToolIcons("schema", readOnly("List Triggers")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = (params ?? {}) as { schema?: string; table?: string };

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
            return {
              success: false,
              error: `Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`,
            };
          }
        }

        // Validate table existence when filtering by table
        if (parsed.table) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, parsed.table],
          );
          if ((tableCheck.rows?.length ?? 0) === 0) {
            return {
              success: false,
              error: `Table '${schemaName}.${parsed.table}' not found. Use pg_list_tables to see available tables.`,
            };
          }
        }

        const queryParams: unknown[] = [];
        let whereClause =
          "n.nspname NOT IN ('pg_catalog', 'information_schema')";
        if (parsed.schema) {
          queryParams.push(parsed.schema);
          whereClause += ` AND n.nspname = $${String(queryParams.length)}`;
        }
        if (parsed.table) {
          queryParams.push(parsed.table);
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

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(sql, queryParams)
            : await adapter.executeQuery(sql);
        return { triggers: result.rows, count: result.rows?.length ?? 0 };
      } catch (error: unknown) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_list_triggers" }),
        };
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
    inputSchema: z.object({
      table: z.string().optional(),
      schema: z.string().optional(),
      type: z
        .string()
        .optional()
        .describe(
          "Constraint type filter: 'primary_key', 'foreign_key', 'unique', 'check'",
        ),
    }),
    outputSchema: ListConstraintsOutputSchema,
    annotations: readOnly("List Constraints"),
    icons: getToolIcons("schema", readOnly("List Constraints")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = (params ?? {}) as {
          table?: string;
          schema?: string;
          type?: string;
        };

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
            return {
              success: false,
              error: `Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`,
            };
          }
        }

        // Validate table existence when filtering by table
        if (parsed.table) {
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
            [schemaName, parsed.table],
          );
          if ((tableCheck.rows?.length ?? 0) === 0) {
            return {
              success: false,
              error: `Table '${schemaName}.${parsed.table}' not found. Use pg_list_tables to see available tables.`,
            };
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

        const result =
          queryParams.length > 0
            ? await adapter.executeQuery(sql, queryParams)
            : await adapter.executeQuery(sql);
        return { constraints: result.rows, count: result.rows?.length ?? 0 };
      } catch (error: unknown) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_list_constraints" }),
        };
      }
    },
  };
}
