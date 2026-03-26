/**
 * PostgreSQL citext Extension Tools - Candidates & Advisor
 *
 * Analyze candidate columns for citext conversion and provide schema recommendations.
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
  CitextAnalyzeCandidatesSchema,
  CitextAnalyzeCandidatesSchemaBase,
  CitextSchemaAdvisorSchema,
  CitextSchemaAdvisorSchemaBase,
  CitextAnalyzeCandidatesOutputSchema,
  CitextSchemaAdvisorOutputSchema,
} from "../../schemas/index.js";

/**
 * Analyze text columns that could benefit from citext
 */
export function createCitextAnalyzeCandidatesTool(
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
      try {
        const parsed = CitextAnalyzeCandidatesSchema.parse(params) as {
          patterns?: string[];
          schema?: string;
          table?: string;
          limit?: unknown;
          excludeSystemSchemas?: boolean;
        };
      const {
        patterns,
        schema,
        table,
        excludeSystemSchemas: userExcludeSystemSchemas,
      } = parsed;
      const rawLimit = parsed.limit;
      const userLimit =
        rawLimit === undefined
          ? undefined
          : typeof rawLimit === "number"
            ? rawLimit
            : Number(rawLimit);
      const safeLimit =
        userLimit !== undefined && isNaN(userLimit) ? undefined : userLimit;

      if (safeLimit !== undefined && safeLimit < 0) {
        return {
          success: false,
          error: "Validation error: limit must be non-negative",
          code: "VALIDATION_ERROR",
          category: "validation",
          recoverable: false,
        };
      }

      // Validate table/schema existence before querying
      if (table !== undefined) {
        const schemaName = schema ?? "public";
        const qualifiedTable = `"${schemaName}"."${table}"`;
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2`,
          [schemaName, table],
        );
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
          return {
            success: false,
            error: `Table ${qualifiedTable} does not exist. Verify the table name and schema.`,
          };
        }
      } else if (schema !== undefined) {
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

      // Default limit of 50 to prevent large payloads and transport truncation
      const DEFAULT_LIMIT = 50;
      const effectiveLimit =
        safeLimit === 0 ? undefined : (safeLimit ?? DEFAULT_LIMIT);

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
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_analyze_candidates",
          });
      }
    },
  };
}

/**
 * Schema advisor for citext columns
 */
export function createCitextSchemaAdvisorTool(
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
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_citext_schema_advisor",
          });
      }
    },
  };
}
