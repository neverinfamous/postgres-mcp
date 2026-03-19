/**
 * PostgreSQL citext Extension Tools - Setup
 *
 * Tools for enabling and configuring citext: create extension, convert columns.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  CitextConvertColumnSchema,
  CitextConvertColumnSchemaBase,
  CitextCreateExtensionOutputSchema,
  CitextConvertColumnOutputSchema,
} from "../../schemas/index.js";

/**
 * Enable the citext extension
 */
export function createCitextExtensionTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_create_extension",
    description: `Enable the citext extension for case-insensitive text columns.
citext is ideal for emails, usernames, and other identifiers where case shouldn't matter.`,
    group: "citext",
    inputSchema: z.object({}),
    outputSchema: CitextCreateExtensionOutputSchema,
    annotations: write("Create Citext Extension"),
    icons: getToolIcons("citext", write("Create Citext Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS citext");
        return {
          success: true,
          message: "citext extension enabled",
          usage:
            "Create columns with type CITEXT instead of TEXT for case-insensitive comparisons",
        };
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_create_extension",
          });
      }
    },
  };
}

/**
 * Convert an existing text column to citext
 */
export function createCitextConvertColumnTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_convert_column",
    description: `Convert an existing TEXT column to CITEXT for case-insensitive comparisons.
This is useful for retrofitting case-insensitivity to existing columns like email or username.
Note: If views depend on this column, you must drop and recreate them manually before conversion.`,
    group: "citext",
    inputSchema: CitextConvertColumnSchemaBase,
    outputSchema: CitextConvertColumnOutputSchema,
    annotations: write("Convert to Citext"),
    icons: getToolIcons("citext", write("Convert to Citext")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CitextConvertColumnSchema.parse(params ?? {});
        const { table, column, schema: schemaOpt } = parsed;
        const schemaName = schemaOpt ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;

        const extCheck = await adapter.executeQuery(`
                SELECT EXISTS(
                    SELECT 1 FROM pg_extension WHERE extname = 'citext'
                ) as installed
            `);

        const hasExt = (extCheck.rows?.[0]?.["installed"] as boolean) ?? false;
        if (!hasExt) {
          return {
            success: false,
            error:
              "citext extension is not installed. Run pg_citext_create_extension first.",
          };
        }

        // Check if table exists before checking column
        const tableCheck = await adapter.executeQuery(
          `
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = $1 AND table_name = $2
            `,
          [schemaName, table],
        );

        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist. Verify the table name and schema.`,
          };
        }

        const colCheck = await adapter.executeQuery(
          `
                SELECT data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = $1
                  AND table_name = $2
                  AND column_name = $3
            `,
          [schemaName, table, column],
        );

        if (!colCheck.rows || colCheck.rows.length === 0) {
          return {
            success: false,
            error: `Column "${column}" not found in table ${qualifiedTable}. Verify the column name.`,
          };
        }

        const dataType = colCheck.rows[0]?.["data_type"] as string;
        const udtName = colCheck.rows[0]?.["udt_name"] as string;
        // Normalize type: use udt_name for user-defined types (like citext)
        const currentType = dataType === "USER-DEFINED" ? udtName : dataType;
        if (udtName === "citext") {
          return {
            success: true,
            message: `Column ${column} is already citext`,
            wasAlreadyCitext: true,
          };
        }

        // Validate that the column is a text-based type
        const allowedTypes = [
          "text",
          "character varying",
          "character",
          "char",
          "varchar",
        ];
        const normalizedType = dataType.toLowerCase();
        if (!allowedTypes.includes(normalizedType)) {
          return {
            success: false,
            error: `Column "${column}" is type "${currentType}", not a text-based type`,
            currentType,
            allowedTypes: ["text", "varchar", "character varying"],
            suggestion: `citext conversion only works for text-based columns. Column "${column}" is "${currentType}" which cannot be converted.`,
          };
        }

        // Check for dependent views before attempting the conversion
        const depCheck = await adapter.executeQuery(
          `
                SELECT DISTINCT
                    c.relname as dependent_view,
                    n.nspname as view_schema
                FROM pg_depend d
                JOIN pg_rewrite r ON d.objid = r.oid
                JOIN pg_class c ON r.ev_class = c.oid
                JOIN pg_namespace n ON c.relnamespace = n.oid
                JOIN pg_class t ON d.refobjid = t.oid
                JOIN pg_namespace tn ON t.relnamespace = tn.oid
                JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
                WHERE c.relkind = 'v'
                  AND tn.nspname = $1
                  AND t.relname = $2
                  AND a.attname = $3
            `,
          [schemaName, table, column],
        );

        const dependentViews = depCheck.rows ?? [];

        if (dependentViews.length > 0) {
          return {
            success: false,
            error:
              "Column has dependent views that must be dropped before conversion",
            dependentViews: dependentViews.map(
              (v) =>
                `${v["view_schema"] as string}.${v["dependent_view"] as string}`,
            ),
            hint: "Drop the listed views, run this conversion, then recreate the views. PostgreSQL cannot ALTER COLUMN TYPE when views depend on it.",
          };
        }

        try {
          await adapter.executeQuery(`
                    ALTER TABLE ${qualifiedTable}
                    ALTER COLUMN "${column}" TYPE citext USING "${column}"::citext
                `);

          return {
            success: true,
            message: `Column ${column} converted from ${currentType} to citext`,
            table: qualifiedTable,
            previousType: currentType,
            affectedViews:
              dependentViews.length > 0
                ? dependentViews.map(
                    (v) =>
                      `${v["view_schema"] as string}.${v["dependent_view"] as string}`,
                  )
                : undefined,
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: `Failed to convert column: ${errorMessage}`,
            hint: "If views depend on this column, they may need to be dropped and recreated",
            dependentViews:
              dependentViews.length > 0
                ? dependentViews.map(
                    (v) =>
                      `${v["view_schema"] as string}.${v["dependent_view"] as string}`,
                  )
                : undefined,
          };
        }
      } catch (error) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_convert_column",
          });
      }
    },
  };
}
