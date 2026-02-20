/**
 * PostgreSQL citext Extension Tools
 *
 * Case-insensitive text type for preventing subtle bugs in auth systems,
 * emails, and usernames. 6 tools total.
 *
 * citext provides a case-insensitive character string type at the type level:
 * - Comparisons are case-insensitive (e.g., 'HELLO' = 'hello')
 * - Sorting is case-insensitive
 * - Ideal for email, username, and other identifier columns
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../utils/annotations.js";
import { parsePostgresError } from "./core/error-helpers.js";
import { getToolIcons } from "../../../utils/icons.js";
import {
  CitextConvertColumnSchema,
  CitextConvertColumnSchemaBase,
  CitextListColumnsSchema,
  CitextListColumnsSchemaBase,
  CitextAnalyzeCandidatesSchema,
  CitextAnalyzeCandidatesSchemaBase,
  CitextSchemaAdvisorSchema,
  CitextSchemaAdvisorSchemaBase,
  // Output schemas
  CitextCreateExtensionOutputSchema,
  CitextConvertColumnOutputSchema,
  CitextListColumnsOutputSchema,
  CitextAnalyzeCandidatesOutputSchema,
  CitextCompareOutputSchema,
  CitextSchemaAdvisorOutputSchema,
} from "../schemas/index.js";

/**
 * Get all citext tools
 */
export function getCitextTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createCitextExtensionTool(adapter),
    createCitextConvertColumnTool(adapter),
    createCitextListColumnsTool(adapter),
    createCitextAnalyzeCandidatesTool(adapter),
    createCitextCompareTool(adapter),
    createCitextSchemaAdvisorTool(adapter),
  ];
}

/**
 * Enable the citext extension
 */
function createCitextExtensionTool(adapter: PostgresAdapter): ToolDefinition {
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
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS citext");
      return {
        success: true,
        message: "citext extension enabled",
        usage:
          "Create columns with type CITEXT instead of TEXT for case-insensitive comparisons",
      };
    },
  };
}

/**
 * Convert an existing text column to citext
 */
function createCitextConvertColumnTool(
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
        throw parsePostgresError(error, {
          tool: "pg_citext_convert_column",
        });
      }
    },
  };
}

/**
 * List all citext columns in the database
 */
function createCitextListColumnsTool(adapter: PostgresAdapter): ToolDefinition {
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
      const parsed = CitextListColumnsSchema.parse(params) as {
        schema?: string;
        limit?: number;
      };
      const { schema, limit: userLimit } = parsed;

      // Default limit of 100 to prevent large payloads
      const DEFAULT_LIMIT = 100;
      const effectiveLimit =
        userLimit === 0 ? undefined : (userLimit ?? DEFAULT_LIMIT);

      const conditions: string[] = [
        "udt_name = 'citext'",
        "table_schema NOT IN ('pg_catalog', 'information_schema')",
      ];
      const queryParams: unknown[] = [];
      const paramIndex = 1;

      if (schema !== undefined) {
        conditions.push(`table_schema = $${String(paramIndex)}`);
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
    },
  };
}

/**
 * Analyze text columns that could benefit from citext
 */
function createCitextAnalyzeCandidatesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_analyze_candidates",
    description: `Find TEXT columns that may benefit from case-insensitive comparisons.
Looks for common patterns like email, username, name, slug, etc.`,
    group: "citext",
    inputSchema: CitextAnalyzeCandidatesSchemaBase,
    outputSchema: CitextAnalyzeCandidatesOutputSchema,
    annotations: readOnly("Analyze Citext Candidates"),
    icons: getToolIcons("citext", readOnly("Analyze Citext Candidates")),
    handler: async (params: unknown, _context: RequestContext) => {
      const {
        patterns,
        schema,
        table,
        limit: userLimit,
        excludeSystemSchemas: userExcludeSystemSchemas,
      } = CitextAnalyzeCandidatesSchema.parse(params) as {
        patterns?: string[];
        schema?: string;
        table?: string;
        limit?: number;
        excludeSystemSchemas?: boolean;
      };

      // Default limit of 50 to prevent large payloads and transport truncation
      const DEFAULT_LIMIT = 50;
      const effectiveLimit =
        userLimit === 0 ? undefined : (userLimit ?? DEFAULT_LIMIT);

      // Exclude system schemas by default when no table filter is specified
      const excludeSystemSchemas = userExcludeSystemSchemas ?? true;

      const searchPatterns = patterns ?? [
        "email",
        "e_mail",
        "mail",
        "username",
        "user_name",
        "login",
        "name",
        "first_name",
        "last_name",
        "full_name",
        "slug",
        "handle",
        "nickname",
        "code",
        "sku",
        "identifier",
      ];

      // System/extension schemas to exclude by default (reduces noise from extension tables)
      const systemSchemas = [
        "cron",
        "topology",
        "partman",
        "tiger",
        "tiger_data",
      ];

      const conditions: string[] = [
        "data_type IN ('text', 'character varying')",
        "table_schema NOT IN ('pg_catalog', 'information_schema')",
      ];
      const queryParams: unknown[] = [];
      let paramIndex = 1;

      // Only apply system schema exclusion when no specific schema/table is requested
      if (excludeSystemSchemas && schema === undefined && table === undefined) {
        const placeholders = systemSchemas.map(() => {
          const idx = paramIndex++;
          return `$${String(idx)}`;
        });
        conditions.push(`table_schema NOT IN (${placeholders.join(", ")})`);
        queryParams.push(...systemSchemas);
      }

      if (schema !== undefined) {
        conditions.push(`table_schema = $${String(paramIndex++)}`);
        queryParams.push(schema);
      }

      if (table !== undefined) {
        conditions.push(`table_name = $${String(paramIndex++)}`);
        queryParams.push(table);
      }

      const patternConditions = searchPatterns.map((p) => {
        const idx = paramIndex++;
        queryParams.push(`%${p}%`);
        return `LOWER(column_name) LIKE $${String(idx)}`;
      });
      conditions.push(`(${patternConditions.join(" OR ")})`);

      // Build WHERE clause for reuse
      const whereClause = conditions.join(" AND ");

      // Count total candidates first
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
                    data_type,
                    character_maximum_length,
                    is_nullable
                FROM information_schema.columns
                WHERE ${whereClause}
                ORDER BY table_schema, table_name, ordinal_position
                ${limitClause}
            `;

      const result = await adapter.executeQuery(sql, queryParams);
      const candidates = result.rows ?? [];

      // Determine if results were truncated
      const truncated =
        effectiveLimit !== undefined && candidates.length < totalCount;

      // Count high/medium confidence candidates without storing duplicates
      let highConfidenceCount = 0;
      let mediumConfidenceCount = 0;

      for (const row of candidates) {
        const colName = (row["column_name"] as string).toLowerCase();
        if (
          colName.includes("email") ||
          colName.includes("username") ||
          colName === "login"
        ) {
          highConfidenceCount++;
        } else {
          mediumConfidenceCount++;
        }
      }

      return {
        candidates,
        count: candidates.length,
        totalCount,
        truncated,
        ...(effectiveLimit !== undefined && { limit: effectiveLimit }),
        ...(table !== undefined && { table }),
        ...(schema !== undefined && { schema }),
        summary: {
          highConfidence: highConfidenceCount,
          mediumConfidence: mediumConfidenceCount,
        },
        recommendation:
          candidates.length > 0
            ? "Consider converting these columns to citext for case-insensitive comparisons"
            : "No obvious candidates found. Use custom patterns if needed.",
        // Include excluded schemas info when filtering is applied
        ...(excludeSystemSchemas &&
          schema === undefined &&
          table === undefined && {
            excludedSchemas: systemSchemas,
          }),
        // Include patterns used for transparency
        patternsUsed: searchPatterns,
      };
    },
  };
}

/**
 * Compare values case-insensitively
 */
function createCitextCompareTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_citext_compare",
    description: `Compare two values using case-insensitive semantics.
Useful for testing citext behavior before converting columns.`,
    group: "citext",
    inputSchema: z.object({
      value1: z.string().describe("First value to compare"),
      value2: z.string().describe("Second value to compare"),
    }),
    outputSchema: CitextCompareOutputSchema,
    annotations: readOnly("Compare Citext Values"),
    icons: getToolIcons("citext", readOnly("Compare Citext Values")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Use the schema for proper validation
      const schema = z.object({
        value1: z.string(),
        value2: z.string(),
      });
      const { value1, value2 } = schema.parse(params);

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
    },
  };
}

/**
 * Schema advisor for citext columns
 */
function createCitextSchemaAdvisorTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_citext_schema_advisor",
    description: `Analyze a specific table and recommend which columns should use citext.
Provides schema design recommendations based on column names and existing data patterns.
Requires the 'table' parameter to specify which table to analyze.`,
    group: "citext",
    inputSchema: CitextSchemaAdvisorSchemaBase,
    outputSchema: CitextSchemaAdvisorOutputSchema,
    annotations: readOnly("Citext Schema Advisor"),
    icons: getToolIcons("citext", readOnly("Citext Schema Advisor")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { table, schema } = CitextSchemaAdvisorSchema.parse(params);
        const schemaName = schema ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;

        // First check if table exists
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
            error: `Table ${qualifiedTable} not found. Verify the table name and schema.`,
          };
        }

        const colResult = await adapter.executeQuery(
          `
                SELECT 
                    column_name,
                    data_type,
                    udt_name,
                    is_nullable,
                    character_maximum_length
                FROM information_schema.columns
                WHERE table_schema = $1 
                  AND table_name = $2
                  AND data_type IN ('text', 'character varying', 'USER-DEFINED')
                ORDER BY ordinal_position
            `,
          [schemaName, table],
        );

        const columns = colResult.rows ?? [];
        const recommendations: {
          column: string;
          currentType: string;
          previousType?: string;
          recommendation: "convert" | "keep" | "already_citext";
          confidence: "high" | "medium" | "low";
          reason: string;
        }[] = [];

        const highConfidencePatterns = [
          "email",
          "username",
          "login",
          "user_name",
        ];
        const mediumConfidencePatterns = [
          "name",
          "slug",
          "handle",
          "code",
          "sku",
          "identifier",
          "nickname",
        ];

        for (const col of columns) {
          const colName = (col["column_name"] as string).toLowerCase();
          const dataType = col["data_type"] as string;
          const udtName = col["udt_name"] as string;

          if (udtName === "citext") {
            recommendations.push({
              column: col["column_name"] as string,
              currentType: "citext",
              previousType: "text or varchar (converted)",
              recommendation: "already_citext",
              confidence: "high",
              reason: "Column is already using citext",
            });
            continue;
          }

          const isHighConfidence = highConfidencePatterns.some((p) =>
            colName.includes(p),
          );
          const isMediumConfidence = mediumConfidencePatterns.some((p) =>
            colName.includes(p),
          );

          if (isHighConfidence) {
            recommendations.push({
              column: col["column_name"] as string,
              currentType: dataType,
              recommendation: "convert",
              confidence: "high",
              reason: `Column name suggests case-insensitive data (${colName} matches common identifier patterns)`,
            });
          } else if (isMediumConfidence) {
            recommendations.push({
              column: col["column_name"] as string,
              currentType: dataType,
              recommendation: "convert",
              confidence: "medium",
              reason: `Column name may benefit from case-insensitivity (${colName})`,
            });
          } else {
            recommendations.push({
              column: col["column_name"] as string,
              currentType: dataType,
              recommendation: "keep",
              confidence: "low",
              reason: "No obvious case-insensitivity pattern detected",
            });
          }
        }

        const convertCount = recommendations.filter(
          (r) => r.recommendation === "convert",
        ).length;
        const highCount = recommendations.filter(
          (r) => r.recommendation === "convert" && r.confidence === "high",
        ).length;

        return {
          table: `${schemaName}.${table}`,
          recommendations,
          summary: {
            totalTextColumns: columns.length,
            recommendConvert: convertCount,
            highConfidence: highCount,
            alreadyCitext: recommendations.filter(
              (r) => r.recommendation === "already_citext",
            ).length,
          },
          nextSteps:
            convertCount > 0
              ? [
                  "Review recommendations above",
                  `Use pg_citext_convert_column to convert recommended columns`,
                  "Update application queries if they rely on case-sensitive comparisons",
                ]
              : ["No columns require conversion"],
        };
      } catch (error) {
        throw parsePostgresError(error, {
          tool: "pg_citext_schema_advisor",
        });
      }
    },
  };
}
