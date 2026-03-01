/**
 * PostgreSQL Performance Tools - Analysis
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  SeqScanTablesOutputSchema,
  IndexRecommendationsOutputSchema,
  QueryPlanCompareOutputSchema,
} from "../../schemas/index.js";

// Helper to coerce string numbers to JavaScript numbers (PostgreSQL returns BIGINT as strings)
const toNum = (val: unknown): number | null =>
  val === null || val === undefined ? null : Number(val);

/**
 * P154: Validate that a schema exists before executing performance queries.
 */
async function validatePerformanceSchemaExists(
  adapter: PostgresAdapter,
  schema?: string,
): Promise<string | null> {
  if (!schema) return null;
  const schemaResult = await adapter.executeQuery(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
    [schema],
  );
  if (!schemaResult.rows || schemaResult.rows.length === 0) {
    return `Schema '${schema}' does not exist. Use pg_list_objects with type 'table' to see available schemas.`;
  }
  return null;
}

/**
 * P154: Validate that a table exists before executing performance queries.
 */
async function validatePerformanceTableExists(
  adapter: PostgresAdapter,
  table?: string,
  schema?: string,
): Promise<string | null> {
  if (!table && !schema) return null;

  if (schema) {
    const schemaError = await validatePerformanceSchemaExists(adapter, schema);
    if (schemaError !== null) return schemaError;
  }

  if (table) {
    const targetSchema = schema ?? "public";
    const tableResult = await adapter.executeQuery(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [targetSchema, table],
    );
    if (!tableResult.rows || tableResult.rows.length === 0) {
      return `Table '${targetSchema}.${table}' not found. Use pg_list_tables to see available tables.`;
    }
  }

  return null;
}

export function createSeqScanTablesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  const SeqScanTablesSchemaBase = z.object({
    minScans: z
      .number()
      .optional()
      .describe("Minimum seq scans to include (default: 10)"),
    schema: z.string().optional().describe("Schema to filter"),
    limit: z
      .number()
      .optional()
      .describe("Max rows to return (default: 50, use 0 for all)"),
  });

  const SeqScanTablesSchema = z.preprocess(
    (input) => input ?? {},
    SeqScanTablesSchemaBase,
  );

  return {
    name: "pg_seq_scan_tables",
    description:
      "Find tables with high sequential scan counts (potential missing indexes). Default minScans=10; use higher values (e.g., 100+) for production databases.",
    group: "performance",
    inputSchema: SeqScanTablesSchemaBase,
    outputSchema: SeqScanTablesOutputSchema,
    annotations: readOnly("Sequential Scan Tables"),
    icons: getToolIcons("performance", readOnly("Sequential Scan Tables")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = SeqScanTablesSchema.parse(params);
      const minScans = parsed.minScans ?? 10; // Default to 10 for better testing visibility
      const limit = parsed.limit === 0 ? null : (parsed.limit ?? 50);

      let whereClause = `seq_scan > ${String(minScans)}`;
      const queryParams: string[] = [];
      if (parsed.schema !== undefined) {
        queryParams.push(parsed.schema);
        whereClause += ` AND schemaname = $${String(queryParams.length)}`;
      }

      // P154: Validate schema existence when filtering by schema
      const schemaError = await validatePerformanceSchemaExists(
        adapter,
        parsed.schema,
      );
      if (schemaError !== null) {
        return { success: false, error: schemaError };
      }

      const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, seq_tup_read,
                        idx_scan, idx_tup_fetch,
                        CASE WHEN idx_scan > 0 THEN round((100.0 * seq_scan / (seq_scan + idx_scan))::numeric, 2) ELSE 100 END as seq_scan_pct
                        FROM pg_stat_user_tables
                        WHERE ${whereClause}
                        ORDER BY seq_scan DESC
                        ${limit !== null ? `LIMIT ${String(limit)}` : ""}`;

      const result = await adapter.executeQuery(sql, queryParams);
      // Coerce numeric fields to JavaScript numbers
      const tables = (result.rows ?? []).map(
        (row: Record<string, unknown>) => ({
          ...row,
          seq_scan: toNum(row["seq_scan"]),
          seq_tup_read: toNum(row["seq_tup_read"]),
          idx_scan: toNum(row["idx_scan"]),
          idx_tup_fetch: toNum(row["idx_tup_fetch"]),
          seq_scan_pct: toNum(row["seq_scan_pct"]),
        }),
      );

      const response: Record<string, unknown> = {
        tables,
        count: tables.length,
        minScans,
        hint: "High seq_scan_pct indicates tables that could benefit from indexes.",
      };

      // Add totalCount if results were limited
      if (limit !== null && tables.length === limit) {
        const countSql = `SELECT COUNT(*) as total FROM pg_stat_user_tables WHERE ${whereClause}`;
        const countResult = await adapter.executeQuery(countSql, queryParams);
        response["totalCount"] = toNum(countResult.rows?.[0]?.["total"]);
        response["truncated"] = true;
      }
      return response;
    },
  };
}

export function createIndexRecommendationsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const IndexRecommendationsSchemaBase = z.object({
    table: z.string().optional().describe("Table name to analyze"),
    sql: z
      .string()
      .optional()
      .describe("SQL query to analyze for index recommendations"),
    query: z
      .string()
      .optional()
      .describe("Alias for sql - SQL query to analyze"),
    params: z
      .array(z.unknown())
      .optional()
      .describe("Query parameters for $1, $2, etc. placeholders"),
    schema: z.string().optional().describe("Schema name (default: public)"),
  });

  // Preprocess for query alias and handle undefined params
  const IndexRecommendationsSchema = z.preprocess((input) => {
    const normalized = (input ?? {}) as Record<string, unknown>;
    const result = { ...normalized };
    // Alias: query → sql
    if (result["sql"] === undefined && result["query"] !== undefined) {
      result["sql"] = result["query"];
    }
    return result;
  }, IndexRecommendationsSchemaBase);

  // Helper to check if HypoPG extension is available
  const checkHypoPG = async (): Promise<boolean> => {
    try {
      const result = await adapter.executeQuery(
        "SELECT 1 FROM pg_extension WHERE extname = 'hypopg'",
      );
      return (result.rows?.length ?? 0) > 0;
    } catch {
      return false;
    }
  };

  // Helper to extract cost from EXPLAIN JSON plan
  const extractCost = (
    plan: Record<string, unknown> | undefined,
  ): number | null => {
    if (plan === undefined) return null;
    const totalCost = plan["Total Cost"];
    return typeof totalCost === "number" ? totalCost : null;
  };

  // Type for index candidate
  interface IndexCandidate {
    table: string;
    column: string;
    indexDDL: string;
  }

  // Helper to extract Seq Scan candidates from EXPLAIN plan
  const extractSeqScanCandidates = (
    node: Record<string, unknown> | undefined,
    depth = 0,
  ): IndexCandidate[] => {
    if (node === undefined || depth > 20) return [];

    const candidates: IndexCandidate[] = [];
    const nodeType = node["Node Type"] as string | undefined;
    const relationName = node["Relation Name"] as string | undefined;
    const filter = node["Filter"] as string | undefined;

    if (
      nodeType === "Seq Scan" &&
      relationName !== undefined &&
      filter !== undefined
    ) {
      // Extract column from filter (handles patterns like "(column = value)" or "(column > value)")
      const colMatch = /\((\w+)\s*[=<>!]/.exec(filter);
      if (colMatch?.[1] !== undefined) {
        candidates.push({
          table: relationName,
          column: colMatch[1],
          indexDDL: `CREATE INDEX ON ${relationName} (${colMatch[1]})`,
        });
      }
    }

    // Recurse into child plans
    const plans = node["Plans"] as Record<string, unknown>[] | undefined;
    if (Array.isArray(plans)) {
      for (const child of plans) {
        candidates.push(...extractSeqScanCandidates(child, depth + 1));
      }
    }

    return candidates;
  };

  return {
    name: "pg_index_recommendations",
    description:
      "Suggest missing indexes based on table statistics or query analysis. When sql is provided and HypoPG is installed, creates hypothetical indexes to measure potential performance improvement.",
    group: "performance",
    inputSchema: IndexRecommendationsSchemaBase, // Base schema for MCP visibility
    outputSchema: IndexRecommendationsOutputSchema,
    annotations: readOnly("Index Recommendations"),
    icons: getToolIcons("performance", readOnly("Index Recommendations")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = IndexRecommendationsSchema.parse(params);
        const schemaName = parsed.schema ?? "public";
        const queryParams = parsed.params ?? [];

        // If SQL query provided, perform query-specific analysis
        if (parsed.sql !== undefined && parsed.sql.trim() !== "") {
          const hypopgAvailable = await checkHypoPG();

          // Get baseline EXPLAIN plan (with parameter binding support)
          const baselineResult = await adapter.executeQuery(
            `EXPLAIN (FORMAT JSON) ${parsed.sql}`,
            queryParams,
          );
          const baselinePlanRow = baselineResult.rows?.[0] as
            | { "QUERY PLAN"?: unknown[] }
            | undefined;
          const baselinePlan = baselinePlanRow?.["QUERY PLAN"]?.[0] as
            | { Plan?: Record<string, unknown> }
            | undefined;
          const baselineCost = extractCost(baselinePlan?.Plan);

          // Extract Seq Scan candidates
          const candidates = extractSeqScanCandidates(baselinePlan?.Plan);

          // If no candidates or no baseline cost, return basic analysis
          if (candidates.length === 0 || baselineCost === null) {
            return {
              queryAnalysis: true,
              hypopgAvailable,
              baselineCost,
              recommendations: [],
              hint: "Query appears well-indexed. No sequential scans with filterable columns detected.",
            };
          }

          // If HypoPG is available, create hypothetical indexes and measure improvement
          if (hypopgAvailable) {
            const recommendations: {
              table: string;
              column: string;
              suggestedIndex: string;
              baselineCost: number;
              improvedCost: number;
              improvement: string;
            }[] = [];

            try {
              // Reset any existing hypothetical indexes
              await adapter.executeQuery("SELECT hypopg_reset()");

              // Test each candidate index
              for (const candidate of candidates) {
                try {
                  // Create hypothetical index
                  await adapter.executeQuery(
                    `SELECT hypopg_create_index('${candidate.indexDDL.replace(/'/g, "''")}')`,
                  );

                  // Re-run EXPLAIN with hypothetical index (with parameter binding)
                  const improvedResult = await adapter.executeQuery(
                    `EXPLAIN (FORMAT JSON) ${parsed.sql}`,
                    queryParams,
                  );
                  const improvedPlanRow = improvedResult.rows?.[0] as
                    | { "QUERY PLAN"?: unknown[] }
                    | undefined;
                  const improvedPlan = improvedPlanRow?.["QUERY PLAN"]?.[0] as
                    | { Plan?: Record<string, unknown> }
                    | undefined;
                  const improvedCost = extractCost(improvedPlan?.Plan);

                  if (improvedCost !== null && improvedCost < baselineCost) {
                    const improvementPct =
                      ((baselineCost - improvedCost) / baselineCost) * 100;
                    recommendations.push({
                      table: candidate.table,
                      column: candidate.column,
                      suggestedIndex: candidate.indexDDL,
                      baselineCost,
                      improvedCost,
                      improvement: `${improvementPct.toFixed(1)}% cost reduction`,
                    });
                  }

                  // Reset for next candidate
                  await adapter.executeQuery("SELECT hypopg_reset()");
                } catch {
                  // Skip this candidate if it fails
                  await adapter
                    .executeQuery("SELECT hypopg_reset()")
                    .catch(() => {
                      /* ignore */
                    });
                }
              }
            } finally {
              // Ensure cleanup
              await adapter.executeQuery("SELECT hypopg_reset()").catch(() => {
                /* ignore */
              });
            }

            // Sort by improvement
            recommendations.sort((a, b) => {
              const aImprv = parseFloat(a.improvement);
              const bImprv = parseFloat(b.improvement);
              return bImprv - aImprv;
            });

            return {
              queryAnalysis: true,
              hypopgAvailable: true,
              baselineCost,
              recommendations,
              hint:
                recommendations.length > 0
                  ? `Found ${String(recommendations.length)} index(es) that would improve query performance. Review and create indexes as needed.`
                  : "No indexes found that would significantly improve this query.",
            };
          }

          // HypoPG not available - return basic recommendations without cost analysis
          const basicRecommendations = candidates.map((c) => ({
            table: c.table,
            column: c.column,
            suggestedIndex: c.indexDDL,
            recommendation:
              "Sequential scan detected - consider adding this index",
          }));

          return {
            queryAnalysis: true,
            hypopgAvailable: false,
            baselineCost,
            recommendations: basicRecommendations,
            hint: "Install HypoPG extension for precise cost improvement analysis. Basic recommendations provided based on EXPLAIN output.",
          };
        }

        // Fall back to table statistics-based recommendations
        const statsParams: string[] = [schemaName];
        const schemaClause = `AND schemaname = $${String(statsParams.length)}`;
        let tableClause = "";
        if (parsed.table !== undefined) {
          statsParams.push(parsed.table);
          tableClause = `AND relname = $${String(statsParams.length)}`;
        }

        // P154: Validate table/schema existence in table-stats path
        const validationError = await validatePerformanceTableExists(
          adapter,
          parsed.table,
          parsed.schema ?? "public",
        );
        if (validationError !== null) {
          return { success: false, error: validationError };
        }

        const sql = `SELECT schemaname, relname as table_name,
                        seq_scan, idx_scan,
                        n_live_tup as row_count,
                        pg_size_pretty(pg_table_size(relid)) as size,
                        CASE
                            WHEN idx_scan = 0 AND seq_scan > 100 THEN 'HIGH - No index usage, many seq scans'
                            WHEN idx_scan > 0 AND seq_scan > idx_scan * 10 THEN 'MEDIUM - Seq scans dominate'
                            ELSE 'LOW - Good index usage'
                        END as recommendation
                        FROM pg_stat_user_tables
                        WHERE seq_scan > 50 ${schemaClause} ${tableClause}
                        ORDER BY seq_scan DESC
                        LIMIT 20`;

        const result = await adapter.executeQuery(sql, statsParams);
        // Coerce numeric fields to JavaScript numbers
        const recommendations = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            ...row,
            seq_scan: toNum(row["seq_scan"]),
            idx_scan: toNum(row["idx_scan"]),
            row_count: toNum(row["row_count"]),
          }),
        );
        return {
          queryAnalysis: false,
          recommendations,
          hint: "Based on table statistics. Provide a SQL query for query-specific recommendations.",
        };
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_index_recommendations",
          }),
        };
      }
    },
  };
}

/**
 * Recursively strip zero-value block stats, empty Triggers arrays,
 * and empty Planning objects from EXPLAIN plan output to reduce payload noise.
 */
function stripZeroValuePlanFields(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    const filtered = obj
      .map(stripZeroValuePlanFields)
      .filter((v) => v !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Strip zero-value block stats
      if (typeof value === "number" && value === 0 && key.includes("Blocks"))
        continue;
      // Strip empty Triggers arrays
      if (key === "Triggers" && Array.isArray(value) && value.length === 0)
        continue;
      // Strip empty Planning objects
      if (
        key === "Planning" &&
        typeof value === "object" &&
        value !== null &&
        Object.keys(value).length === 0
      )
        continue;
      const cleaned = stripZeroValuePlanFields(value);
      if (cleaned !== undefined) {
        result[key] = cleaned;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  return obj;
}

export function createQueryPlanCompareTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (no preprocess)
  const QueryPlanCompareSchemaBase = z.object({
    query1: z.string().describe("First SQL query"),
    query2: z.string().describe("Second SQL query"),
    params1: z
      .array(z.unknown())
      .optional()
      .describe("Parameters for first query ($1, $2, etc.)"),
    params2: z
      .array(z.unknown())
      .optional()
      .describe("Parameters for second query ($1, $2, etc.)"),
    analyze: z
      .boolean()
      .optional()
      .describe("Run EXPLAIN ANALYZE (executes queries)"),
  });

  // Preprocess for sql1/sql2 → query1/query2 aliases
  const QueryPlanCompareSchema = z.preprocess((input) => {
    if (typeof input !== "object" || input === null) return input;
    const obj = input as Record<string, unknown>;
    const result = { ...obj };
    // Alias: sql1 → query1, sql2 → query2
    if (result["query1"] === undefined && result["sql1"] !== undefined) {
      result["query1"] = result["sql1"];
    }
    if (result["query2"] === undefined && result["sql2"] !== undefined) {
      result["query2"] = result["sql2"];
    }
    return result;
  }, QueryPlanCompareSchemaBase);

  return {
    name: "pg_query_plan_compare",
    description:
      "Compare execution plans of two SQL queries to identify performance differences.",
    group: "performance",
    inputSchema: QueryPlanCompareSchemaBase, // Base schema for MCP visibility
    outputSchema: QueryPlanCompareOutputSchema,
    annotations: readOnly("Query Plan Compare"),
    icons: getToolIcons("performance", readOnly("Query Plan Compare")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = QueryPlanCompareSchema.parse(params);
        const explainType =
          parsed.analyze === true
            ? "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"
            : "EXPLAIN (FORMAT JSON)";

        const [result1, result2] = await Promise.all([
          adapter.executeQuery(
            `${explainType} ${parsed.query1}`,
            parsed.params1 ?? [],
          ),
          adapter.executeQuery(
            `${explainType} ${parsed.query2}`,
            parsed.params2 ?? [],
          ),
        ]);

        const row1 = result1.rows?.[0];
        const row2 = result2.rows?.[0];
        const queryPlan1 = row1?.["QUERY PLAN"] as unknown[] | undefined;
        const queryPlan2 = row2?.["QUERY PLAN"] as unknown[] | undefined;
        const plan1 = queryPlan1?.[0] as Record<string, unknown> | undefined;
        const plan2 = queryPlan2?.[0] as Record<string, unknown> | undefined;

        const comparison = {
          query1: {
            planningTime: plan1?.["Planning Time"],
            executionTime: plan1?.["Execution Time"],
            totalCost: (
              plan1?.["Plan"] as Record<string, unknown> | undefined
            )?.["Total Cost"],
            sharedBuffersHit: plan1?.["Shared Hit Blocks"],
            sharedBuffersRead: plan1?.["Shared Read Blocks"],
          },
          query2: {
            planningTime: plan2?.["Planning Time"],
            executionTime: plan2?.["Execution Time"],
            totalCost: (
              plan2?.["Plan"] as Record<string, unknown> | undefined
            )?.["Total Cost"],
            sharedBuffersHit: plan2?.["Shared Hit Blocks"],
            sharedBuffersRead: plan2?.["Shared Read Blocks"],
          },
          analysis: {
            costDifference:
              plan1 && plan2
                ? Number(
                    (plan1["Plan"] as Record<string, unknown>)?.["Total Cost"],
                  ) -
                  Number(
                    (plan2["Plan"] as Record<string, unknown>)?.["Total Cost"],
                  )
                : null,
            recommendation: "",
          },
          fullPlans: {
            plan1: stripZeroValuePlanFields(plan1),
            plan2: stripZeroValuePlanFields(plan2),
          },
        };

        if (comparison.analysis.costDifference !== null) {
          if (comparison.analysis.costDifference > 0) {
            comparison.analysis.recommendation =
              "Query 2 has lower estimated cost";
          } else if (comparison.analysis.costDifference < 0) {
            comparison.analysis.recommendation =
              "Query 1 has lower estimated cost";
          } else {
            comparison.analysis.recommendation =
              "Both queries have similar estimated cost";
          }
        }

        return comparison;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_query_plan_compare",
          }),
        };
      }
    },
  };
}
