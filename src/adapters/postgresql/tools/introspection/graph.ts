/**
 * PostgreSQL Introspection Tools - Graph Analysis
 *
 * Dependency graph, topological sort, and cascade simulation tools.
 * 3 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  DependencyGraphSchemaBase,
  DependencyGraphSchema,
  TopologicalSortSchemaBase,
  TopologicalSortSchema,
  CascadeSimulatorSchemaBase,
  CascadeSimulatorSchema,
  // Output schemas
  DependencyGraphOutputSchema,
  TopologicalSortOutputSchema,
  CascadeSimulatorOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Internal types
// =============================================================================

export interface FkEdge {
  constraintName: string;
  fromSchema: string;
  fromTable: string;
  fromColumns: string[];
  toSchema: string;
  toTable: string;
  toColumns: string[];
  onDelete: string;
  onUpdate: string;
}

interface TableNode {
  schema: string;
  table: string;
  rowCount?: number;
  sizeBytes?: number;
}

// =============================================================================
// Shared queries
// =============================================================================

/**
 * Fetch all foreign key relationships across user schemas
 */
export async function fetchForeignKeys(
  adapter: PostgresAdapter,
  schemaFilter?: string,
  excludeExtensionSchemas?: boolean,
): Promise<FkEdge[]> {
  const params: unknown[] = [];
  let schemaClause = "";
  if (schemaFilter) {
    params.push(schemaFilter);
    schemaClause = `AND src_ns.nspname = $${String(params.length)}`;
  }

  const extensionSchemaExclude =
    !schemaFilter && excludeExtensionSchemas !== false
      ? "AND src_ns.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
      : "";

  const result = await adapter.executeQuery(
    `SELECT
      c.conname AS constraint_name,
      src_ns.nspname AS from_schema,
      src_t.relname AS from_table,
      array_agg(DISTINCT src_a.attname ORDER BY src_a.attname) AS from_columns,
      ref_ns.nspname AS to_schema,
      ref_t.relname AS to_table,
      array_agg(DISTINCT ref_a.attname ORDER BY ref_a.attname) AS to_columns,
      CASE c.confdeltype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_delete,
      CASE c.confupdtype
        WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_update
    FROM pg_constraint c
    JOIN pg_class src_t ON src_t.oid = c.conrelid
    JOIN pg_namespace src_ns ON src_ns.oid = src_t.relnamespace
    JOIN pg_class ref_t ON ref_t.oid = c.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_t.relnamespace
    JOIN pg_attribute src_a ON src_a.attrelid = src_t.oid AND src_a.attnum = ANY(c.conkey)
    JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
    WHERE c.contype = 'f'
      AND src_ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND src_ns.nspname !~ '^pg_toast'
      ${extensionSchemaExclude}
      ${schemaClause}
    GROUP BY c.conname, src_ns.nspname, src_t.relname,
             ref_ns.nspname, ref_t.relname, c.confdeltype, c.confupdtype
    ORDER BY src_ns.nspname, src_t.relname, c.conname`,
    params.length > 0 ? params : undefined,
  );

  return (result.rows ?? []).map((row) => ({
    constraintName: row["constraint_name"] as string,
    fromSchema: row["from_schema"] as string,
    fromTable: row["from_table"] as string,
    fromColumns: parseArrayColumn(row["from_columns"]),
    toSchema: row["to_schema"] as string,
    toTable: row["to_table"] as string,
    toColumns: parseArrayColumn(row["to_columns"]),
    onDelete: row["on_delete"] as string,
    onUpdate: row["on_update"] as string,
  }));
}

/**
 * Fetch all user tables with row counts and sizes
 */
export async function fetchTableNodes(
  adapter: PostgresAdapter,
  schemaFilter?: string,
  excludeExtensionSchemas?: boolean,
): Promise<TableNode[]> {
  const params: unknown[] = [];
  let schemaClause = "";
  if (schemaFilter) {
    params.push(schemaFilter);
    schemaClause = `AND n.nspname = $${String(params.length)}`;
  }

  const extensionSchemaExclude =
    !schemaFilter && excludeExtensionSchemas !== false
      ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
      : "";

  const result = await adapter.executeQuery(
    `SELECT
      n.nspname AS schema,
      c.relname AS table_name,
      CASE WHEN c.reltuples = -1 THEN COALESCE(s.n_live_tup, 0)
           ELSE c.reltuples END::bigint AS row_count,
      pg_table_size(c.oid) AS size_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND n.nspname !~ '^pg_toast'
      ${extensionSchemaExclude}
      ${schemaClause}
    ORDER BY n.nspname, c.relname`,
    params.length > 0 ? params : undefined,
  );

  return (result.rows ?? []).map((row) => ({
    schema: row["schema"] as string,
    table: row["table_name"] as string,
    rowCount: Number(row["row_count"]) || 0,
    sizeBytes: Number(row["size_bytes"]) || 0,
  }));
}

/**
 * Parse PostgreSQL array column (handles both native arrays and string format)
 */
export function parseArrayColumn(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    const trimmed = value.replace(/^{|}$/g, "");
    if (trimmed === "") return [];
    return trimmed.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  }
  return [];
}

/**
 * Create qualified table name
 */
export function qualifiedName(schema: string, table: string): string {
  return `${schema}.${table}`;
}

// =============================================================================
// Graph algorithms
// =============================================================================

/**
 * Detect circular dependencies using DFS
 */
export function detectCycles(adjacency: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): void {
    if (inStack.has(node)) {
      // Found a cycle - extract it from the stack
      const cycleStart = stack.indexOf(node);
      if (cycleStart !== -1) {
        cycles.push([...stack.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor);
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of adjacency.keys()) {
    dfs(node);
  }

  return cycles;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns null if cycles exist
 */
export function topologicalSort(
  adjacency: Map<string, string[]>,
  allNodes: Set<string>,
): string[] | null {
  // Compute in-degrees
  const inDegree = new Map<string, number>();
  for (const node of allNodes) {
    inDegree.set(node, 0);
  }
  for (const [, neighbors] of adjacency) {
    for (const n of neighbors) {
      inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
    }
  }

  // Enqueue nodes with 0 in-degree
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }
  queue.sort(); // Deterministic ordering

  const result: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    result.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        // Insert in sorted position for deterministic output
        const insertIdx = queue.findIndex((q) => q > neighbor);
        if (insertIdx === -1) {
          queue.push(neighbor);
        } else {
          queue.splice(insertIdx, 0, neighbor);
        }
      }
    }
  }

  return result.length === allNodes.size ? result : null;
}

/**
 * Calculate max depth from root nodes in DAG
 */
function calculateMaxDepth(
  adjacency: Map<string, string[]>,
  roots: string[],
): number {
  if (roots.length === 0) return 0;

  let maxDepth = 0;
  const depthMap = new Map<string, number>();

  function dfs(node: string, depth: number, visited: Set<string>): void {
    if (visited.has(node)) return;
    visited.add(node);

    const currentMax = depthMap.get(node) ?? -1;
    if (depth > currentMax) {
      depthMap.set(node, depth);
      if (depth > maxDepth) maxDepth = depth;
    }

    for (const neighbor of adjacency.get(node) ?? []) {
      dfs(neighbor, depth + 1, visited);
    }
  }

  for (const root of roots) {
    dfs(root, 0, new Set<string>());
  }

  return maxDepth;
}

// =============================================================================
// pg_dependency_graph
// =============================================================================

export function createDependencyGraphTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_dependency_graph",
    description:
      "Get the full foreign key dependency graph with cascade paths, row counts, circular dependency detection, and severity assessment. Agent-optimized structured output.",
    group: "introspection",
    inputSchema: DependencyGraphSchemaBase,
    outputSchema: DependencyGraphOutputSchema,
    annotations: readOnly("Dependency Graph"),
    icons: getToolIcons("introspection", readOnly("Dependency Graph")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = DependencyGraphSchema.parse(params);
        const includeRowCounts = parsed.includeRowCounts !== false;

        const excludeExt = parsed.excludeExtensionSchemas;

        const [fks, tables] = await Promise.all([
          fetchForeignKeys(adapter, parsed.schema, excludeExt),
          includeRowCounts
            ? fetchTableNodes(adapter, parsed.schema, excludeExt)
            : Promise.resolve([]),
        ]);

        const tableMap = new Map(
          tables.map((t) => [qualifiedName(t.schema, t.table), t]),
        );

        // Build adjacency list (from → to, meaning "from" depends on "to")
        const adjacency = new Map<string, string[]>();
        const allNodes = new Set<string>();

        // Ensure all tables are in the node set even if they have no FKs
        for (const t of tables) {
          allNodes.add(qualifiedName(t.schema, t.table));
        }

        for (const fk of fks) {
          const from = qualifiedName(fk.fromSchema, fk.fromTable);
          const to = qualifiedName(fk.toSchema, fk.toTable);
          allNodes.add(from);
          allNodes.add(to);

          const existing = adjacency.get(from) ?? [];
          existing.push(to);
          adjacency.set(from, existing);
        }

        // Find root tables (no dependencies) and leaf tables (no dependents)
        const dependents = new Set<string>();
        for (const [, neighbors] of adjacency) {
          for (const n of neighbors) {
            dependents.add(n);
          }
        }
        const rootTables = [...allNodes]
          .filter(
            (n) => !adjacency.has(n) || (adjacency.get(n)?.length ?? 0) === 0,
          )
          .sort();
        const leafTables = [...allNodes]
          .filter((n) => !dependents.has(n))
          .sort();

        // Detect cycles
        const cycles = detectCycles(adjacency);
        const maxDepth = calculateMaxDepth(adjacency, leafTables);

        // Build nodes
        const nodes = [...allNodes].sort().map((name) => {
          const info = tableMap.get(name);
          const parts = name.split(".");
          return {
            table: parts[1] ?? name,
            schema: parts[0] ?? "public",
            ...(includeRowCounts && info
              ? { rowCount: info.rowCount, sizeBytes: info.sizeBytes }
              : {}),
          };
        });

        // Build edges
        const edges = fks.map((fk) => ({
          from: qualifiedName(fk.fromSchema, fk.fromTable),
          to: qualifiedName(fk.toSchema, fk.toTable),
          constraint: fk.constraintName,
          columns: fk.fromColumns.map((col, i) => ({
            from: col,
            to: fk.toColumns[i] ?? col,
          })),
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }));

        // Add hint for nonexistent/empty schema
        const hint =
          parsed.schema !== undefined && allNodes.size === 0
            ? `Schema '${parsed.schema}' returned no tables. Verify the schema exists with pg_list_schemas.`
            : undefined;

        return {
          nodes,
          edges,
          circularDependencies: cycles,
          stats: {
            totalTables: allNodes.size,
            totalRelationships: fks.length,
            maxDepth,
            rootTables,
            leafTables,
          },
          ...(hint !== undefined && { hint }),
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_dependency_graph",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_topological_sort
// =============================================================================

export function createTopologicalSortTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_topological_sort",
    description:
      "Get tables in safe DDL execution order. 'create' direction: dependencies first (for CREATE TABLE). 'drop' direction: dependents first (for DROP TABLE).",
    group: "introspection",
    inputSchema: TopologicalSortSchemaBase,
    outputSchema: TopologicalSortOutputSchema,
    annotations: readOnly("Topological Sort"),
    icons: getToolIcons("introspection", readOnly("Topological Sort")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = TopologicalSortSchema.parse(params);
        const direction = parsed.direction ?? "create";

        const excludeExt = parsed.excludeExtensionSchemas;

        const fks = await fetchForeignKeys(adapter, parsed.schema, excludeExt);
        const tables = await fetchTableNodes(
          adapter,
          parsed.schema,
          excludeExt,
        );

        // Build all graph structures in a single FK iteration (PERF-P3)
        const adjacency = new Map<string, string[]>();
        const allNodes = new Set<string>();
        const dependsOn = new Map<string, Set<string>>();
        // Pre-compute create-direction adjacency for level computation in drop mode
        const createAdj = new Map<string, string[]>();

        for (const t of tables) {
          allNodes.add(qualifiedName(t.schema, t.table));
        }
        for (const fk of fks) {
          const from = qualifiedName(fk.fromSchema, fk.fromTable);
          const to = qualifiedName(fk.toSchema, fk.toTable);
          allNodes.add(from);
          allNodes.add(to);

          if (from === to) continue; // Self-references don't affect ordering

          // dependsOn: from depends on to
          const deps = dependsOn.get(from) ?? new Set<string>();
          deps.add(to);
          dependsOn.set(from, deps);

          // adjacency for requested direction
          if (direction === "create") {
            const existing = adjacency.get(to) ?? [];
            existing.push(from);
            adjacency.set(to, existing);
          } else {
            const existing = adjacency.get(from) ?? [];
            existing.push(to);
            adjacency.set(from, existing);

            // Also build create-direction adjacency for level computation
            const createExisting = createAdj.get(to) ?? [];
            createExisting.push(from);
            createAdj.set(to, createExisting);
          }
        }

        const sorted = topologicalSort(adjacency, allNodes);
        const cycles = sorted === null ? detectCycles(adjacency) : [];

        // Compute level (depth in the dependency graph)
        // Always use create-order traversal for consistent levels regardless of direction
        const levelMap = new Map<string, number>();
        if (sorted) {
          // For create direction, sorted is already in dependency order.
          // For drop direction, use pre-computed create-direction adjacency.
          let createOrder: string[];
          if (direction === "create") {
            createOrder = sorted;
          } else {
            createOrder =
              topologicalSort(createAdj, allNodes) ?? [...allNodes].sort();
          }
          for (const node of createOrder) {
            const deps = dependsOn.get(node);
            if (!deps || deps.size === 0) {
              levelMap.set(node, 0);
            } else {
              let maxParentLevel = 0;
              for (const dep of deps) {
                const parentLevel = levelMap.get(dep) ?? 0;
                if (parentLevel >= maxParentLevel) {
                  maxParentLevel = parentLevel + 1;
                }
              }
              levelMap.set(node, maxParentLevel);
            }
          }
        }

        const order = (sorted ?? [...allNodes].sort()).map((name) => {
          const parts = name.split(".");
          return {
            table: parts[1] ?? name,
            schema: parts[0] ?? "public",
            level: levelMap.get(name) ?? 0,
            dependencies: [...(dependsOn.get(name) ?? [])].sort(),
          };
        });

        // Add hint for nonexistent/empty schema
        const hint =
          parsed.schema !== undefined && allNodes.size === 0
            ? `Schema '${parsed.schema}' returned no tables. Verify the schema exists with pg_list_schemas.`
            : undefined;

        return {
          order,
          direction,
          hasCycles: sorted === null,
          ...(cycles.length > 0 ? { cycles } : {}),
          ...(hint !== undefined && { hint }),
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_topological_sort",
          }),
        };
      }
    },
  };
}

// =============================================================================
// pg_cascade_simulator
// =============================================================================

export function createCascadeSimulatorTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_cascade_simulator",
    description:
      "Simulate the impact of DELETE, DROP, or TRUNCATE on a table. Returns affected tables, estimated row counts, cascade paths, and severity assessment.",
    group: "introspection",
    inputSchema: CascadeSimulatorSchemaBase,
    outputSchema: CascadeSimulatorOutputSchema,
    annotations: readOnly("Cascade Simulator"),
    icons: getToolIcons("introspection", readOnly("Cascade Simulator")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = CascadeSimulatorSchema.parse(params);
        const schema = parsed.schema ?? "public";
        const operation = parsed.operation ?? "DELETE";
        const sourceQName = qualifiedName(schema, parsed.table);

        // Cascade simulator must include ALL schemas for accurate cascade path tracing
        const [fks, tables] = await Promise.all([
          fetchForeignKeys(adapter, undefined, false),
          fetchTableNodes(adapter, undefined, false),
        ]);

        const tableMap = new Map(
          tables.map((t) => [qualifiedName(t.schema, t.table), t]),
        );

        // Check if source table exists
        if (!tableMap.has(sourceQName)) {
          return {
            success: false as const,
            sourceTable: sourceQName,
            operation,
            affectedTables: [],
            severity: "low" as const,
            stats: {
              totalTablesAffected: 0,
              cascadeActions: 0,
              blockingActions: 0,
              setNullActions: 0,
              maxDepth: 0,
            },
            error: `Table '${sourceQName}' not found. Use pg_list_tables to verify.`,
          };
        }

        // Build reverse adjacency: for each table, find what references it
        // (which tables have FKs pointing TO this table)
        const referencedBy = new Map<string, FkEdge[]>();
        for (const fk of fks) {
          const to = qualifiedName(fk.toSchema, fk.toTable);
          const existing = referencedBy.get(to) ?? [];
          existing.push(fk);
          referencedBy.set(to, existing);
        }

        // BFS from source table following cascade paths
        interface AffectedEntry {
          table: string;
          schema: string;
          action: string;
          estimatedRows?: number | undefined;
          path: string[];
          depth: number;
        }

        const affected: AffectedEntry[] = [];
        const visited = new Set<string>();
        const queue: {
          tableName: string;
          path: string[];
          depth: number;
        }[] = [{ tableName: sourceQName, path: [sourceQName], depth: 0 }];
        visited.add(sourceQName);

        let cascadeActions = 0;
        let blockingActions = 0;
        let setNullActions = 0;

        while (queue.length > 0) {
          const current = queue.shift();
          if (current === undefined) break;
          const refs = referencedBy.get(current.tableName) ?? [];

          for (const ref of refs) {
            const refQName = qualifiedName(ref.fromSchema, ref.fromTable);
            if (visited.has(refQName)) continue;
            visited.add(refQName);

            const action = operation === "DELETE" ? ref.onDelete : "CASCADE";
            const tableInfo = tableMap.get(refQName);

            if (action === "CASCADE") {
              cascadeActions++;
              affected.push({
                table: ref.fromTable,
                schema: ref.fromSchema,
                action: "CASCADE",
                estimatedRows: tableInfo?.rowCount,
                path: [...current.path, refQName],
                depth: current.depth + 1,
              });
              // Continue traversal for cascade
              queue.push({
                tableName: refQName,
                path: [...current.path, refQName],
                depth: current.depth + 1,
              });
            } else if (action === "RESTRICT" || action === "NO ACTION") {
              blockingActions++;
              affected.push({
                table: ref.fromTable,
                schema: ref.fromSchema,
                action,
                estimatedRows: tableInfo?.rowCount,
                path: [...current.path, refQName],
                depth: current.depth + 1,
              });
            } else if (action === "SET NULL" || action === "SET DEFAULT") {
              setNullActions++;
              affected.push({
                table: ref.fromTable,
                schema: ref.fromSchema,
                action,
                estimatedRows: tableInfo?.rowCount,
                path: [...current.path, refQName],
                depth: current.depth + 1,
              });
            }
          }
        }

        const maxDepth = affected.reduce((max, a) => Math.max(max, a.depth), 0);

        // Severity assessment
        let severity: "low" | "medium" | "high" | "critical";
        if (blockingActions > 0) {
          severity = "critical"; // Operation will fail
        } else if (operation !== "DELETE" && cascadeActions > 0) {
          severity = "critical"; // DROP/TRUNCATE force-cascades everything
        } else if (cascadeActions > 5 || maxDepth > 3) {
          severity = "high";
        } else if (cascadeActions > 0) {
          severity = "medium";
        } else {
          severity = "low";
        }

        return {
          sourceTable: sourceQName,
          operation,
          affectedTables: affected,
          severity,
          stats: {
            totalTablesAffected: affected.length,
            cascadeActions,
            blockingActions,
            setNullActions,
            maxDepth,
          },
        };
      } catch (error: unknown) {
        return {
          success: false as const,
          error: formatPostgresError(error, {
            tool: "pg_cascade_simulator",
          }),
        };
      }
    },
  };
}
