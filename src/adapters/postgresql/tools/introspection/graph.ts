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
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
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

// Shared helpers
import type { FkEdge } from "./helpers.js";
import {
  fetchForeignKeys,
  fetchTableNodes,
  qualifiedName,
  checkSchemaExists,
} from "./helpers.js";

// Graph algorithms
import {
  detectCycles,
  topologicalSort,
  calculateMaxDepth,
} from "./algorithms.js";

// Re-export helpers and algorithms for consumers
export {
  parseArrayColumn,
  qualifiedName,
  checkSchemaExists,
  checkTableExists,
  fetchForeignKeys,
  fetchTableNodes,
} from "./helpers.js";
export type { FkEdge, TableNode } from "./helpers.js";
export { detectCycles, topologicalSort, calculateMaxDepth } from "./algorithms.js";

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

        // Validate schema existence when filtering by schema
        const schemaError = await checkSchemaExists(adapter, parsed.schema);
        if (schemaError) return schemaError;

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
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_dependency_graph",
          });
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

        // Validate schema existence when filtering by schema
        const schemaError = await checkSchemaExists(adapter, parsed.schema);
        if (schemaError) return schemaError;

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

        return {
          order,
          direction,
          hasCycles: sorted === null,
          ...(cycles.length > 0 ? { cycles } : {}),
        };
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, {
            tool: "pg_topological_sort",
          });
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
        return formatHandlerErrorResponse(error, {
            tool: "pg_cascade_simulator",
          });
      }
    },
  };
}
