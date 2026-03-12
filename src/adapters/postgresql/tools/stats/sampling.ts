/**
 * PostgreSQL Statistics Tools - Random Sampling
 *
 * Get a random sample of rows using various sampling methods.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { sanitizeWhereClause } from "../../../../utils/where-clause.js";
import { validateTableExists } from "./math-utils.js";
import {
  StatsSamplingSchemaBase,
  StatsSamplingSchema,
  SamplingOutputSchema,
} from "../../schemas/index.js";

/**
 * Random sampling
 */
export function createStatsSamplingTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_stats_sampling",
    description:
      "Get a random sample of rows. Use sampleSize for exact row count (any method), or percentage for approximate sampling with bernoulli/system methods.",
    group: "stats",
    inputSchema: StatsSamplingSchemaBase, // Base schema for MCP visibility
    outputSchema: SamplingOutputSchema,
    annotations: readOnly("Random Sampling"),
    icons: getToolIcons("stats", readOnly("Random Sampling")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          table,
          method,
          sampleSize,
          percentage,
          schema,
          select,
          where,
          params: queryParams,
        } = StatsSamplingSchema.parse(params) as {
          table: string;
          method?: "random" | "bernoulli" | "system";
          sampleSize?: number;
          percentage?: number;
          schema?: string;
          select?: string[];
          where?: string;
          params?: unknown[];
        };

        const schemaName = schema ?? "public";

        // Validate table exists
        await validateTableExists(adapter, table, schemaName);

        const schemaPrefix = schema ? `"${schema}".` : "";
        const columns =
          select && select.length > 0
            ? select.map((c) => `"${c}"`).join(", ")
            : "*";
        const whereClause = where ? `WHERE ${sanitizeWhereClause(where)}` : "";
        const samplingMethod = method ?? "random";

        let sql: string;
        let note: string | undefined;

        // If sampleSize is provided, always use ORDER BY RANDOM() LIMIT n for exact counts
        // TABLESAMPLE BERNOULLI/SYSTEM are percentage-based and cannot guarantee exact row counts
        if (sampleSize !== undefined) {
          const limit = sampleSize;
          sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY RANDOM()
                    LIMIT ${String(limit)}
                `;
          if (percentage !== undefined) {
            note = `sampleSize (${String(sampleSize)}) takes precedence over percentage (${String(percentage)}%). Using ORDER BY RANDOM() LIMIT for exact row count.`;
          } else if (samplingMethod !== "random") {
            note = `Using ORDER BY RANDOM() LIMIT for exact ${String(sampleSize)} row count. TABLESAMPLE ${samplingMethod.toUpperCase()} is percentage-based and cannot guarantee exact counts.`;
          }
        } else if (samplingMethod === "random") {
          // Default random sampling with default limit (20 to reduce LLM context usage)
          const limit = 20;
          sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    ${whereClause}
                    ORDER BY RANDOM()
                    LIMIT ${String(limit)}
                `;
          if (percentage !== undefined) {
            note = `percentage (${String(percentage)}%) is ignored for random method. Use method:'bernoulli' or method:'system' for percentage-based sampling, or use sampleSize for exact row count.`;
          }
        } else {
          // TABLESAMPLE with percentage (approximate row count)
          // Apply default limit to prevent large payloads
          const pct = percentage ?? 10;
          const DEFAULT_TABLESAMPLE_LIMIT = 100;
          sql = `
                    SELECT ${columns}
                    FROM ${schemaPrefix}"${table}"
                    TABLESAMPLE ${samplingMethod.toUpperCase()}(${String(pct)})
                    ${whereClause}
                    LIMIT ${String(DEFAULT_TABLESAMPLE_LIMIT + 1)}
                `;
          // Add hint about system method unreliability for small tables
          const methodHint =
            samplingMethod === "system"
              ? " Consider using 'bernoulli' or 'random' method for more reliable results on small tables."
              : "";
          note = `TABLESAMPLE ${samplingMethod.toUpperCase()}(${String(pct)}%) returns approximately ${String(pct)}% of rows. Actual count varies based on table size and sampling algorithm.${methodHint}`;
        }

        const result = await adapter.executeQuery(
          sql,
          ...(queryParams !== undefined && queryParams.length > 0
            ? [queryParams]
            : []),
        );
        let rows = result.rows ?? [];

        // Check if we need to truncate due to default limit for TABLESAMPLE methods
        let truncated = false;
        let totalSampled: number | undefined;
        const DEFAULT_TABLESAMPLE_LIMIT = 100;
        if (
          sampleSize === undefined &&
          samplingMethod !== "random" &&
          rows.length > DEFAULT_TABLESAMPLE_LIMIT
        ) {
          totalSampled = rows.length;
          rows = rows.slice(0, DEFAULT_TABLESAMPLE_LIMIT);
          truncated = true;
        }

        const response: {
          table: string;
          method: string;
          sampleSize: number;
          rows: unknown[];
          truncated?: boolean;
          totalSampled?: number;
          note?: string;
        } = {
          table: `${schema ?? "public"}.${table}`,
          method: samplingMethod,
          sampleSize: rows.length,
          rows,
        };

        // Add truncation indicators if applicable
        if (truncated && totalSampled !== undefined) {
          response.truncated = truncated;
          response.totalSampled = totalSampled;
        }

        if (note !== undefined) {
          response.note = note;
        }

        // Add note if requested sampleSize exceeded available rows
        if (sampleSize !== undefined && rows.length < sampleSize) {
          const existingNote =
            response.note !== undefined ? response.note + " " : "";
          response.note =
            existingNote +
            `Requested ${String(sampleSize)} rows but only ${String(rows.length)} available.`;
        }

        return response;
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_stats_sampling" });
      }
    },
  };
}
