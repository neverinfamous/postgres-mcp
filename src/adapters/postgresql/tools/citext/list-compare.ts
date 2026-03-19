/**
 * PostgreSQL citext Extension Tools - List & Compare
 *
 * List citext columns and compare values case-insensitively.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  CitextListColumnsSchema,
  CitextListColumnsSchemaBase,
  CitextCompareSchemaBase,
  CitextCompareSchema,
  CitextListColumnsOutputSchema,
  CitextCompareOutputSchema,
} from "../../schemas/index.js";

/**
 * List all citext columns in the database
 */
export function createCitextListColumnsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_list_columns",
    description: `List all columns using the citext type in the database.
Useful for auditing case-insensitive columns.`,
    group: "citext",
    inputSchema: CitextListColumnsSchemaBase,
    outputSchema: CitextListColumnsOutputSchema,
    annotations: readOnly("List Citext Columns"),
    icons: getToolIcons("citext", readOnly("List Citext Columns")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CitextListColumnsSchema.parse(params) as {
          schema?: string;
          limit?: unknown;
        };
        const { schema } = parsed;
        const rawLimit = parsed.limit;
        const userLimit =
          rawLimit === undefined
            ? undefined
            : typeof rawLimit === "number"
              ? rawLimit
              : Number(rawLimit);
        const safeLimit =
          userLimit !== undefined && isNaN(userLimit) ? undefined : userLimit;

        // Validate schema existence when specified
        if (schema !== undefined) {
          const schemaCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.schemata
             WHERE schema_name = $1`,
            [schema],
          );
          if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
            return {
              success: false,
              error: `Schema '${schema}' does not exist. Verify the schema name.`,
            };
          }
        }

        // Default limit of 100 to prevent large payloads
        const DEFAULT_LIMIT = 100;
        const effectiveLimit =
          safeLimit === 0 ? undefined : (safeLimit ?? DEFAULT_LIMIT);

        const conditions: string[] = [
          "udt_name = 'citext'",
          "table_schema NOT IN ('pg_catalog', 'information_schema')",
        ];
        const queryParams: unknown[] = [];
        let paramIndex = 1;

        if (schema !== undefined) {
          conditions.push(`table_schema = $${String(paramIndex++)}`);
          queryParams.push(schema);
        }

        const whereClause = conditions.join(" AND ");

        // Count total columns first
        const countSql = `
                SELECT COUNT(*) as total
                FROM information_schema.columns
                WHERE ${whereClause}
            `;
        const countResult = await adapter.executeQuery(countSql, queryParams);
        const totalCount = Number(countResult.rows?.[0]?.["total"] ?? 0);

        // Add LIMIT clause
        const limitClause =
          effectiveLimit !== undefined ? `LIMIT ${String(effectiveLimit)}` : "";

        const sql = `
                SELECT
                    table_schema,
                    table_name,
                    column_name,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE ${whereClause}
                ORDER BY table_schema, table_name, ordinal_position
                ${limitClause}
            `;

        const result = await adapter.executeQuery(sql, queryParams);
        const columns = result.rows ?? [];

        // Determine if results were truncated
        const truncated =
          effectiveLimit !== undefined && columns.length < totalCount;

        return {
          columns,
          count: columns.length,
          totalCount,
          truncated,
          ...(effectiveLimit !== undefined && { limit: effectiveLimit }),
          ...(schema !== undefined && { schema }),
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_list_columns",
          });
      }
    },
  };
}

/**
 * Compare values case-insensitively
 */
export function createCitextCompareTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_compare",
    description: `Compare two values using case-insensitive semantics.
Useful for testing citext behavior before converting columns.`,
    group: "citext",
    inputSchema: CitextCompareSchemaBase,
    outputSchema: CitextCompareOutputSchema,
    annotations: readOnly("Compare Citext Values"),
    icons: getToolIcons("citext", readOnly("Compare Citext Values")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { value1, value2 } = CitextCompareSchema.parse(params) as {
          value1: string;
          value2: string;
        };

        const extCheck = await adapter.executeQuery(`
                SELECT EXISTS(
                    SELECT 1 FROM pg_extension WHERE extname = 'citext'
                ) as installed
            `);

        const hasExt = (extCheck.rows?.[0]?.["installed"] as boolean) ?? false;

        if (hasExt) {
          const result = await adapter.executeQuery(
            `
                    SELECT
                        $1::citext = $2::citext as citext_equal,
                        $1::text = $2::text as text_equal,
                        LOWER($1) = LOWER($2) as lower_equal
                `,
            [value1, value2],
          );

          const row = result.rows?.[0];
          return {
            value1,
            value2,
            citextEqual: row?.["citext_equal"] as boolean,
            textEqual: row?.["text_equal"] as boolean,
            lowerEqual: row?.["lower_equal"] as boolean,
            extensionInstalled: true,
          };
        } else {
          const result = await adapter.executeQuery(
            `
                    SELECT
                        $1::text = $2::text as text_equal,
                        LOWER($1) = LOWER($2) as lower_equal
                `,
            [value1, value2],
          );

          const row = result.rows?.[0];
          return {
            value1,
            value2,
            textEqual: row?.["text_equal"] as boolean,
            lowerEqual: row?.["lower_equal"] as boolean,
            extensionInstalled: false,
            hint: "Install citext extension for native case-insensitive comparisons",
          };
        }
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_compare",
          });
      }
    },
  };
}
