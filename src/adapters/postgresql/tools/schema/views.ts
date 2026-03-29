/**
 * PostgreSQL Schema Tools - Views
 *
 * Listing, creating, and dropping views.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  CreateViewSchemaBase,
  CreateViewSchema,
  DropViewSchemaBase,
  DropViewSchema,
  ListViewsSchemaBase,
  ListViewsSchema,
  // Output schemas
  ListViewsOutputSchema,
  CreateViewOutputSchema,
  DropViewOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_list_views
// =============================================================================

export function createListViewsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_views",
    description: "List all views and materialized views.",
    group: "schema",
    inputSchema: ListViewsSchemaBase,
    outputSchema: ListViewsOutputSchema,
    annotations: readOnly("List Views"),
    icons: getToolIcons("schema", readOnly("List Views")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = ListViewsSchema.parse(params ?? {});
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
              code: "QUERY_ERROR",
              category: "query",
              recoverable: false
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
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_list_views" });
      }
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
        let alreadyExists: boolean | undefined;
        if (orReplace === true) {
          const relkind = materialized === true ? "m" : "v";
          const existsResult = await adapter.executeQuery(
            `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = $1 AND n.nspname = $2 AND c.relname = $3`,
            [relkind, schemaName, name],
          );
          alreadyExists = (existsResult.rows?.length ?? 0) > 0;
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
          // If orReplace is true and the error is "cannot drop columns from view" (42P16),
          // we must drop the view first and then recreate it.
          const errMsg = error instanceof Error ? error.message : String(error);
          if (
            orReplace &&
            !materialized &&
            (errMsg.includes("cannot drop columns from view") ||
             errMsg.includes("cannot change data type of view column") ||
             (typeof error === "object" && error !== null && "code" in error && (error as Record<string, unknown>)["code"] === "42P16"))
          ) {
            try {
              // Execute a clean drop
              await adapter.executeQuery(`DROP VIEW IF EXISTS ${schemaPrefix}${viewName}`);
              // Retry the create (without OR REPLACE since we just dropped it)
              const retrySql = `CREATE VIEW ${schemaPrefix}${viewName} AS ${query}${checkClause}`;
              await adapter.executeQuery(retrySql);
            } catch (retryError: unknown) {
              return formatHandlerErrorResponse(retryError, {
                tool: "pg_create_view",
                objectType: "view",
                ...(schema !== undefined && { schema }),
              });
            }
          } else {
            return formatHandlerErrorResponse(error, {
                tool: "pg_create_view",
                objectType: "view",
                ...(schema !== undefined && { schema }),
              });
          }
        }

        const result: Record<string, unknown> = {
          success: true,
          view: `${schemaName}.${name}`,
          materialized: !!materialized,
        };
        if (alreadyExists !== undefined) {
          result["alreadyExists"] = alreadyExists;
        }
        return result;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_create_view" });
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
          return formatHandlerErrorResponse(error, {
              tool: "pg_drop_view",
              ...(schema !== undefined && { schema }),
            });
        }
        return {
          success: true,
          view: `${schemaName}.${name}`,
          materialized: materialized ?? false,
          existed,
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_drop_view" });
      }
    },
  };
}
