/**
 * PostgreSQL Introspection Tools
 *
 * Agent-optimized database analysis tools for dependency graphs,
 * cascade simulation, schema snapshots, migration risk analysis,
 * and schema version tracking.
 * 11 tools total (6 read-only + 5 migration tracking).
 */

import { createHash } from "node:crypto";
import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { readOnly, write, destructive } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import {
  DependencyGraphSchemaBase,
  DependencyGraphSchema,
  TopologicalSortSchemaBase,
  TopologicalSortSchema,
  CascadeSimulatorSchemaBase,
  CascadeSimulatorSchema,
  SchemaSnapshotSchemaBase,
  SchemaSnapshotSchema,
  ConstraintAnalysisSchemaBase,
  ConstraintAnalysisSchema,
  MigrationRisksSchemaBase,
  MigrationRisksSchema,
  MigrationInitSchemaBase,
  MigrationInitSchema,
  MigrationRecordSchemaBase,
  MigrationRecordSchema,
  MigrationRollbackSchemaBase,
  MigrationRollbackSchema,
  MigrationHistorySchemaBase,
  MigrationHistorySchema,
  MigrationStatusSchemaBase,
  MigrationStatusSchema,
  // Output schemas
  DependencyGraphOutputSchema,
  TopologicalSortOutputSchema,
  CascadeSimulatorOutputSchema,
  SchemaSnapshotOutputSchema,
  ConstraintAnalysisOutputSchema,
  MigrationRisksOutputSchema,
  MigrationInitOutputSchema,
  MigrationRecordOutputSchema,
  MigrationRollbackOutputSchema,
  MigrationHistoryOutputSchema,
  MigrationStatusOutputSchema,
} from "../schemas/index.js";

// =============================================================================
// Internal types
// =============================================================================

interface FkEdge {
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
async function fetchForeignKeys(
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
async function fetchTableNodes(
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
function parseArrayColumn(value: unknown): string[] {
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
function qualifiedName(schema: string, table: string): string {
  return `${schema}.${table}`;
}

// =============================================================================
// Graph algorithms
// =============================================================================

/**
 * Detect circular dependencies using DFS
 */
function detectCycles(adjacency: Map<string, string[]>): string[][] {
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
function topologicalSort(
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
// Tool factory functions
// =============================================================================

/**
 * Get all introspection tools
 */
export function getIntrospectionTools(
  adapter: PostgresAdapter,
): ToolDefinition[] {
  return [
    createDependencyGraphTool(adapter),
    createTopologicalSortTool(adapter),
    createCascadeSimulatorTool(adapter),
    createSchemaSnapshotTool(adapter),
    createConstraintAnalysisTool(adapter),
    createMigrationRisksTool(adapter),
    createMigrationInitTool(adapter),
    createMigrationRecordTool(adapter),
    createMigrationRollbackTool(adapter),
    createMigrationHistoryTool(adapter),
    createMigrationStatusTool(adapter),
  ];
}

// =============================================================================
// pg_dependency_graph
// =============================================================================

function createDependencyGraphTool(adapter: PostgresAdapter): ToolDefinition {
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
      const leafTables = [...allNodes].filter((n) => !dependents.has(n)).sort();

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
    },
  };
}

// =============================================================================
// pg_topological_sort
// =============================================================================

function createTopologicalSortTool(adapter: PostgresAdapter): ToolDefinition {
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
      const parsed = TopologicalSortSchema.parse(params);
      const direction = parsed.direction ?? "create";

      const excludeExt = parsed.excludeExtensionSchemas;

      const fks = await fetchForeignKeys(adapter, parsed.schema, excludeExt);
      const tables = await fetchTableNodes(adapter, parsed.schema, excludeExt);

      // Build adjacency: A depends on B means A→B
      // For "create" order, we need B before A (dependencies first)
      // For "drop" order, we need A before B (dependents first)
      const adjacency = new Map<string, string[]>();
      const allNodes = new Set<string>();

      for (const t of tables) {
        allNodes.add(qualifiedName(t.schema, t.table));
      }
      for (const fk of fks) {
        const from = qualifiedName(fk.fromSchema, fk.fromTable);
        const to = qualifiedName(fk.toSchema, fk.toTable);
        allNodes.add(from);
        allNodes.add(to);
      }

      // Build dependency graph: from→to means "from depends on to"
      const dependsOn = new Map<string, Set<string>>();
      for (const fk of fks) {
        const from = qualifiedName(fk.fromSchema, fk.fromTable);
        const to = qualifiedName(fk.toSchema, fk.toTable);
        if (from === to) continue; // Self-references don't affect ordering
        const deps = dependsOn.get(from) ?? new Set<string>();
        deps.add(to);
        dependsOn.set(from, deps);
      }

      // For create order: edge from dependency → dependent (process deps first)
      // For drop order: edge from dependent → dependency (process dependents first)
      for (const fk of fks) {
        const from = qualifiedName(fk.fromSchema, fk.fromTable);
        const to = qualifiedName(fk.toSchema, fk.toTable);
        if (from === to) continue; // Self-references don't affect ordering

        if (direction === "create") {
          const existing = adjacency.get(to) ?? [];
          existing.push(from);
          adjacency.set(to, existing);
        } else {
          const existing = adjacency.get(from) ?? [];
          existing.push(to);
          adjacency.set(from, existing);
        }
      }

      const sorted = topologicalSort(adjacency, allNodes);
      const cycles = sorted === null ? detectCycles(adjacency) : [];

      // Compute level (depth in the dependency graph)
      // Always use create-order traversal for consistent levels regardless of direction
      const levelMap = new Map<string, number>();
      if (sorted) {
        // For create direction, sorted is already in dependency order.
        // For drop direction, we need create-order to compute levels correctly.
        let createOrder: string[];
        if (direction === "create") {
          createOrder = sorted;
        } else {
          // Build create-direction adjacency and sort
          const createAdj = new Map<string, string[]>();
          for (const fk of fks) {
            const from = qualifiedName(fk.fromSchema, fk.fromTable);
            const to = qualifiedName(fk.toSchema, fk.toTable);
            if (from === to) continue;
            const existing = createAdj.get(to) ?? [];
            existing.push(from);
            createAdj.set(to, existing);
          }
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
    },
  };
}

// =============================================================================
// pg_cascade_simulator
// =============================================================================

function createCascadeSimulatorTool(adapter: PostgresAdapter): ToolDefinition {
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
    },
  };
}

// =============================================================================
// pg_schema_snapshot
// =============================================================================

function createSchemaSnapshotTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_schema_snapshot",
    description:
      "Get a complete schema snapshot in a single agent-optimized JSON structure. Includes tables, columns, types, constraints, indexes, triggers, sequences, and extensions.",
    group: "introspection",
    inputSchema: SchemaSnapshotSchemaBase,
    outputSchema: SchemaSnapshotOutputSchema,
    annotations: readOnly("Schema Snapshot"),
    icons: getToolIcons("introspection", readOnly("Schema Snapshot")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = SchemaSnapshotSchema.parse(params);
      const includeAll = !parsed.sections || parsed.sections.length === 0;
      const sections = new Set(parsed.sections ?? []);

      const snapshot: Record<string, unknown> = {};
      const stats = {
        tables: 0,
        views: 0,
        indexes: 0,
        constraints: 0,
        functions: 0,
        triggers: 0,
        sequences: 0,
        customTypes: 0,
        extensions: 0,
      };

      const schemaExclude = parsed.includeSystem
        ? ""
        : "AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'";
      const extensionSchemaExclude =
        !parsed.schema &&
        !parsed.includeSystem &&
        parsed.excludeExtensionSchemas !== false
          ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
          : "";
      // Exclude extension-owned objects (e.g. spatial_ref_sys, part_config) from public schema
      const extOwnedActive =
        !parsed.includeSystem && parsed.excludeExtensionSchemas !== false;
      const extOwnedClause = (oidExpr: string): string =>
        extOwnedActive
          ? `AND NOT EXISTS (SELECT 1 FROM pg_depend dep WHERE dep.objid = ${oidExpr} AND dep.deptype = 'e')`
          : "";
      const schemaParams: unknown[] = [];
      let schemaWhere = "";
      if (parsed.schema) {
        schemaParams.push(parsed.schema);
        schemaWhere = `AND n.nspname = $${String(schemaParams.length)}`;
      }

      // Tables + columns (or compact mode without columns)
      if (includeAll || sections.has("tables")) {
        const columnsSubquery = parsed.compact
          ? ""
          : `,
            (SELECT json_agg(json_build_object(
              'name', a.attname,
              'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
              'nullable', NOT a.attnotnull,
              'default', pg_get_expr(d.adbin, d.adrelid),
              'primaryKey', COALESCE((SELECT true FROM pg_constraint pk
                WHERE pk.conrelid = a.attrelid AND a.attnum = ANY(pk.conkey)
                AND pk.contype = 'p'), false)
            ) ORDER BY a.attnum)
            FROM pg_attribute a
            LEFT JOIN pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
            ) AS columns`;
        const tablesResult = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, c.relname AS name,
            CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'partitioned_table' END AS type,
            CASE WHEN c.reltuples = -1 THEN COALESCE(s.n_live_tup, 0) ELSE c.reltuples END::bigint AS row_count,
            pg_table_size(c.oid) AS size_bytes,
            obj_description(c.oid, 'pg_class') AS comment${columnsSubquery}
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
          WHERE c.relkind IN ('r', 'p')
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["tables"] = tablesResult.rows ?? [];
        stats.tables = tablesResult.rows?.length ?? 0;
      }

      // Views
      if (includeAll || sections.has("views")) {
        const viewsResult = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, c.relname AS name,
            CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END AS type,
            pg_get_viewdef(c.oid, true) AS definition
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('v', 'm')
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["views"] = viewsResult.rows ?? [];
        stats.views = viewsResult.rows?.length ?? 0;
      }

      // Indexes
      if (includeAll || sections.has("indexes")) {
        const indexesResult = await adapter.executeQuery(
          `SELECT
            i.relname AS name, t.relname AS table_name, n.nspname AS schema,
            am.amname AS type, ix.indisunique AS is_unique,
            pg_get_indexdef(ix.indexrelid) AS definition,
            pg_relation_size(i.oid) AS size_bytes
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          JOIN pg_am am ON am.oid = i.relam
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_toast'"}
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere.replace(/\bn\./g, "n.")}
          ORDER BY n.nspname, t.relname, i.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["indexes"] = indexesResult.rows ?? [];
        stats.indexes = indexesResult.rows?.length ?? 0;
      }

      // Constraints
      if (includeAll || sections.has("constraints")) {
        const constraintsResult = await adapter.executeQuery(
          `SELECT
            c.conname AS name, t.relname AS table_name, n.nspname AS schema,
            CASE c.contype WHEN 'p' THEN 'primary_key' WHEN 'f' THEN 'foreign_key'
              WHEN 'u' THEN 'unique' WHEN 'c' THEN 'check' WHEN 'x' THEN 'exclusion' END AS type,
            pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
          ORDER BY n.nspname, t.relname, c.conname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["constraints"] = constraintsResult.rows ?? [];
        stats.constraints = constraintsResult.rows?.length ?? 0;
      }

      // Functions
      if (includeAll || sections.has("functions")) {
        const functionsResult = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, p.proname AS name,
            pg_get_function_arguments(p.oid) AS arguments,
            pg_get_function_result(p.oid) AS return_type,
            l.lanname AS language, p.provolatile AS volatility
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_language l ON l.oid = p.prolang
          WHERE ${parsed.includeSystem ? "true" : "n.nspname NOT IN ('pg_catalog', 'information_schema')"}
            ${extensionSchemaExclude} ${extOwnedClause("p.oid")} ${schemaWhere}
          ORDER BY n.nspname, p.proname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["functions"] = functionsResult.rows ?? [];
        stats.functions = functionsResult.rows?.length ?? 0;
      }

      // Triggers
      if (includeAll || sections.has("triggers")) {
        const triggersResult = await adapter.executeQuery(
          `SELECT
            t.tgname AS name, c.relname AS table_name, n.nspname AS schema,
            CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
            array_remove(ARRAY[
              CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END,
              CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END,
              CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END,
              CASE WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE' END
            ], NULL) AS events,
            p.proname AS function_name
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_proc p ON p.oid = t.tgfoid
          WHERE NOT t.tgisinternal
            ${schemaExclude.replace(/\bn\./g, "n.")} ${extensionSchemaExclude.replace(/\bn\./g, "n.")} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname, t.tgname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["triggers"] = triggersResult.rows ?? [];
        stats.triggers = triggersResult.rows?.length ?? 0;
      }

      // Sequences
      if (includeAll || sections.has("sequences")) {
        const seqResult = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, c.relname AS name,
            (SELECT tc.relname || '.' || a.attname
             FROM pg_depend d
             JOIN pg_class tc ON tc.oid = d.refobjid
             JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
             WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'a'
             LIMIT 1) AS owned_by
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'S'
            ${schemaExclude} ${extensionSchemaExclude} ${extOwnedClause("c.oid")} ${schemaWhere}
          ORDER BY n.nspname, c.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["sequences"] = seqResult.rows ?? [];
        stats.sequences = seqResult.rows?.length ?? 0;
      }

      // Custom types
      if (includeAll || sections.has("types")) {
        const typesResult = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, t.typname AS name,
            CASE t.typtype WHEN 'e' THEN 'enum' WHEN 'c' THEN 'composite' WHEN 'd' THEN 'domain' WHEN 'r' THEN 'range' END AS type,
            CASE WHEN t.typtype = 'e' THEN
              (SELECT json_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid)
            END AS values
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typtype IN ('e', 'c', 'd', 'r')
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ${extensionSchemaExclude} ${extOwnedClause("t.oid")} ${schemaWhere}
          ORDER BY n.nspname, t.typname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );
        snapshot["types"] = typesResult.rows ?? [];
        stats.customTypes = typesResult.rows?.length ?? 0;
      }

      // Extensions (skip when schema filter is active — extensions are global objects)
      if ((includeAll || sections.has("extensions")) && !parsed.schema) {
        const extResult = await adapter.executeQuery(
          `SELECT extname AS name, extversion AS version,
                  n.nspname AS schema
           FROM pg_extension e
           JOIN pg_namespace n ON n.oid = e.extnamespace
           ORDER BY e.extname`,
        );
        snapshot["extensions"] = extResult.rows ?? [];
        stats.extensions = extResult.rows?.length ?? 0;
      }

      // Add hint for nonexistent/empty schema
      const allEmpty = Object.values(stats).every((v) => v === 0);
      const hint =
        parsed.schema !== undefined && allEmpty
          ? `Schema '${parsed.schema}' returned no tables. Verify the schema exists with pg_list_schemas.`
          : undefined;

      return {
        snapshot,
        stats,
        generatedAt: new Date().toISOString(),
        ...(parsed.compact && { compact: true }),
        ...(hint !== undefined && { hint }),
      };
    },
  };
}

// =============================================================================
// pg_constraint_analysis
// =============================================================================

function createConstraintAnalysisTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_constraint_analysis",
    description:
      "Analyze all constraints for issues: redundant indexes, missing foreign keys, missing NOT NULL, missing primary keys, and unindexed foreign keys.",
    group: "introspection",
    inputSchema: ConstraintAnalysisSchemaBase,
    outputSchema: ConstraintAnalysisOutputSchema,
    annotations: readOnly("Constraint Analysis"),
    icons: getToolIcons("introspection", readOnly("Constraint Analysis")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = ConstraintAnalysisSchema.parse(params);
      const runAll = !parsed.checks || parsed.checks.length === 0;
      const checks = new Set(parsed.checks ?? []);

      interface Finding {
        type: string;
        severity: "info" | "warning" | "error";
        table: string;
        description: string;
        suggestion?: string;
      }

      const findings: Finding[] = [];
      const schemaParams: unknown[] = [];
      let schemaWhere = "";
      let tableWhere = "";

      if (parsed.schema) {
        schemaParams.push(parsed.schema);
        schemaWhere = `AND n.nspname = $${String(schemaParams.length)}`;
      }
      if (parsed.table) {
        schemaParams.push(parsed.table);
        tableWhere = `AND c.relname = $${String(schemaParams.length)}`;
      }

      const extensionSchemaExclude =
        !parsed.schema &&
        !parsed.table &&
        parsed.excludeExtensionSchemas !== false
          ? "AND n.nspname NOT IN ('cron', 'topology', 'tiger', 'tiger_data')"
          : "";

      // Check: Tables without primary keys
      if (runAll || checks.has("missing_pk")) {
        const result = await adapter.executeQuery(
          `SELECT n.nspname AS schema, c.relname AS table_name
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE c.relkind IN ('r', 'p')
             AND n.nspname NOT IN ('pg_catalog', 'information_schema')
             AND n.nspname !~ '^pg_toast'
             AND NOT EXISTS (
               SELECT 1 FROM pg_constraint pk
               WHERE pk.conrelid = c.oid AND pk.contype = 'p'
             )
             ${extensionSchemaExclude} ${schemaWhere} ${tableWhere}
           ORDER BY n.nspname, c.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );

        for (const row of result.rows ?? []) {
          findings.push({
            type: "missing_pk",
            severity: "error",
            table: qualifiedName(
              row["schema"] as string,
              row["table_name"] as string,
            ),
            description: "Table has no primary key",
            suggestion:
              "Add a primary key column (e.g., id SERIAL PRIMARY KEY) for data integrity and efficient lookups",
          });
        }
      }

      // Check: Unindexed foreign keys
      if (runAll || checks.has("unindexed_fk")) {
        const result = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, t.relname AS table_name,
            c.conname AS constraint_name,
            array_agg(a.attname ORDER BY x.ordinality) AS columns
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ordinality)
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
          WHERE c.contype = 'f'
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            ${extensionSchemaExclude}
            AND NOT EXISTS (
              SELECT 1 FROM pg_index ix
              WHERE ix.indrelid = t.oid
                AND c.conkey <@ ix.indkey::smallint[]
            )
            ${schemaWhere} ${tableWhere.replace("c.relname", "t.relname")}
          GROUP BY n.nspname, t.relname, c.conname
          ORDER BY n.nspname, t.relname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );

        for (const row of result.rows ?? []) {
          const cols = parseArrayColumn(row["columns"]);
          findings.push({
            type: "unindexed_fk",
            severity: "warning",
            table: qualifiedName(
              row["schema"] as string,
              row["table_name"] as string,
            ),
            description: `Foreign key '${row["constraint_name"] as string}' on column(s) [${cols.join(", ")}] has no supporting index`,
            suggestion: `CREATE INDEX ON ${qualifiedName(row["schema"] as string, row["table_name"] as string)} (${cols.join(", ")})`,
          });
        }
      }

      // Check: Tables with columns that likely should have NOT NULL
      if (runAll || checks.has("missing_not_null")) {
        const result = await adapter.executeQuery(
          `SELECT
            n.nspname AS schema, c.relname AS table_name,
            a.attname AS column_name, pg_catalog.format_type(a.atttypid, a.atttypmod) AS type
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p')
            AND a.attnum > 0 AND NOT a.attisdropped AND a.attnotnull = false
            AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND n.nspname !~ '^pg_toast'
            ${extensionSchemaExclude}
            AND a.attname IN ('id', 'uuid', 'email', 'name', 'created_at', 'updated_at', 'status', 'type')
            AND NOT EXISTS (SELECT 1 FROM pg_constraint pk WHERE pk.conrelid = c.oid AND a.attnum = ANY(pk.conkey) AND pk.contype = 'p')
            ${schemaWhere} ${tableWhere}
          ORDER BY n.nspname, c.relname, a.attname`,
          schemaParams.length > 0 ? schemaParams : undefined,
        );

        for (const row of result.rows ?? []) {
          findings.push({
            type: "missing_not_null",
            severity: "info",
            table: qualifiedName(
              row["schema"] as string,
              row["table_name"] as string,
            ),
            description: `Column '${row["column_name"] as string}' (${row["type"] as string}) is nullable but commonly expected to be NOT NULL`,
            suggestion: `ALTER TABLE ${qualifiedName(row["schema"] as string, row["table_name"] as string)} ALTER COLUMN "${row["column_name"] as string}" SET NOT NULL`,
          });
        }
      }

      // Build summary
      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = {};
      for (const f of findings) {
        byType[f.type] = (byType[f.type] ?? 0) + 1;
        bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
      }

      // Add hint for nonexistent table
      const hint =
        parsed.table !== undefined && findings.length === 0
          ? `No findings for table '${parsed.schema ? parsed.schema + "." : "public."}${parsed.table}'. Verify the table exists with pg_list_tables.`
          : undefined;

      return {
        findings,
        summary: {
          totalFindings: findings.length,
          byType,
          bySeverity,
        },
        ...(hint !== undefined && { hint }),
      };
    },
  };
}

// =============================================================================
// pg_migration_risks
// =============================================================================

/** DDL patterns and their associated risks */
const DDL_RISK_PATTERNS: {
  pattern: RegExp;
  category: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  description: string;
  mitigation?: string;
  requiresDowntime: boolean;
  lockImpact: string;
}[] = [
  {
    pattern: /\bDROP\s+TABLE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description: "DROP TABLE permanently deletes the table and all its data",
    mitigation:
      "Back up the table first (pg_dump_table), verify no active references",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bTRUNCATE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description: "TRUNCATE removes all rows from the table",
    mitigation: "Verify you intend to delete all data, check CASCADE effects",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bDROP\s+COLUMN\b/i,
    category: "data_loss",
    riskLevel: "high",
    description: "DROP COLUMN permanently removes the column and its data",
    mitigation:
      "Back up the column data first, verify no application dependencies",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on the table",
  },
  {
    pattern: /\bALTER\s+(?:TABLE|COLUMN)\b.*\bSET\s+NOT\s+NULL\b/i,
    category: "constraint",
    riskLevel: "high",
    description:
      "Adding NOT NULL requires a full table scan to verify no NULL values exist",
    mitigation:
      "First check for NULLs: SELECT COUNT(*) FROM table WHERE column IS NULL",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE during verification scan",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+(?:CONSTRAINT\b.*\b)?FOREIGN\s+KEY\b/i,
    category: "constraint",
    riskLevel: "medium",
    description: "Adding a foreign key requires validating all existing rows",
    mitigation:
      "Use NOT VALID to skip validation, then VALIDATE CONSTRAINT separately",
    requiresDowntime: false,
    lockImpact: "SHARE ROW EXCLUSIVE on both tables",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+COLUMN\b/i,
    category: "schema_change",
    riskLevel: "low",
    description:
      "Adding a nullable column without a default is a metadata-only change",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (very brief)",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+COLUMN\b.*\bDEFAULT\b/i,
    category: "schema_change",
    riskLevel: "medium",
    description:
      "Adding a column with a volatile DEFAULT may require rewriting all rows (PG < 11) or is metadata-only (PG >= 11)",
    mitigation:
      "On PG >= 11, this is usually fast. On older versions, consider adding without default then updating",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (metadata-only on PG >= 11)",
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bALTER\s+COLUMN\b.*\bTYPE\b/i,
    category: "schema_change",
    riskLevel: "high",
    description: "Changing column type requires rewriting the entire table",
    mitigation:
      "Consider creating a new column, migrating data, then dropping the old one",
    requiresDowntime: true,
    lockImpact: "ACCESS EXCLUSIVE for the entire rewrite",
  },
  {
    pattern: /\bCREATE\s+INDEX\b(?!\s+CONCURRENTLY)/i,
    category: "locking",
    riskLevel: "high",
    description:
      "CREATE INDEX (non-concurrent) blocks writes to the table for the entire build duration",
    mitigation: "Use CREATE INDEX CONCURRENTLY to avoid blocking writes",
    requiresDowntime: false,
    lockImpact: "SHARE lock on the table (blocks INSERT/UPDATE/DELETE)",
  },
  {
    pattern: /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i,
    category: "locking",
    riskLevel: "low",
    description:
      "CREATE INDEX CONCURRENTLY allows concurrent writes but takes longer",
    requiresDowntime: false,
    lockImpact: "No blocking locks (uses ShareUpdateExclusiveLock)",
  },
  {
    pattern: /\bDROP\s+INDEX\b(?!\s+CONCURRENTLY)/i,
    category: "locking",
    riskLevel: "medium",
    description:
      "DROP INDEX blocks writes briefly. May degrade query performance",
    mitigation:
      "Use DROP INDEX CONCURRENTLY in production, verify no critical queries depend on it",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (brief)",
  },
  {
    pattern: /\bRENAME\s+(?:TABLE|COLUMN|TO)\b/i,
    category: "breaking_change",
    riskLevel: "high",
    description:
      "Renaming a table or column will break any application queries referencing the old name",
    mitigation:
      "Create a view with the old name pointing to the new name for backward compatibility",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE (brief)",
  },
  {
    pattern: /\bDROP\s+SCHEMA\b.*\bCASCADE\b/i,
    category: "data_loss",
    riskLevel: "critical",
    description:
      "DROP SCHEMA CASCADE deletes the schema and ALL objects within it",
    mitigation:
      "List all objects in the schema first, verify intent, and back up critical data",
    requiresDowntime: false,
    lockImpact: "ACCESS EXCLUSIVE on all objects in the schema",
  },
];

function createMigrationRisksTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_migration_risks",
    description:
      "Analyze proposed DDL statements for risks: data loss, lock contention, constraint violations, and breaking changes. Pre-flight check before executing migrations.",
    group: "introspection",
    inputSchema: MigrationRisksSchemaBase,
    outputSchema: MigrationRisksOutputSchema,
    annotations: readOnly("Migration Risks"),
    icons: getToolIcons("introspection", readOnly("Migration Risks")),
    handler: (params: unknown, _context: RequestContext) =>
      Promise.resolve().then(() => {
        // adapter is available for future enhancements (e.g., checking table existence)
        void adapter;
        const parsed = MigrationRisksSchema.parse(params);

        interface Risk {
          statement: string;
          statementIndex: number;
          riskLevel: "low" | "medium" | "high" | "critical";
          category: string;
          description: string;
          mitigation?: string | undefined;
        }

        const risks: Risk[] = [];
        let requiresDowntime = false;
        let highestRiskLevel: "low" | "medium" | "high" | "critical" = "low";
        const lockImpacts = new Set<string>();

        const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };

        for (let i = 0; i < parsed.statements.length; i++) {
          const stmt = parsed.statements[i] ?? "";

          for (const pattern of DDL_RISK_PATTERNS) {
            if (pattern.pattern.test(stmt)) {
              risks.push({
                statement:
                  stmt.length > 200 ? stmt.slice(0, 200) + "..." : stmt,
                statementIndex: i,
                riskLevel: pattern.riskLevel,
                category: pattern.category,
                description: pattern.description,
                mitigation: pattern.mitigation,
              });

              if (pattern.requiresDowntime) {
                requiresDowntime = true;
              }
              if (riskOrder[pattern.riskLevel] > riskOrder[highestRiskLevel]) {
                highestRiskLevel = pattern.riskLevel;
              }
              lockImpacts.add(pattern.lockImpact);
            }
          }
        }

        return {
          risks,
          summary: {
            totalStatements: parsed.statements.length,
            totalRisks: risks.length,
            highestRisk: highestRiskLevel,
            requiresDowntime,
            estimatedLockImpact:
              lockImpacts.size > 0 ? [...lockImpacts].join("; ") : "None",
          },
        };
      }),
  };
}

// =============================================================================
// Migration tracking — shared helpers
// =============================================================================

const TRACKING_TABLE = "_mcp_schema_versions";

const CREATE_TRACKING_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
  id SERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_by VARCHAR(255),
  migration_hash VARCHAR(64) NOT NULL,
  migration_sql TEXT NOT NULL,
  source_system VARCHAR(50),
  rollback_sql TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'applied',
  CONSTRAINT valid_status CHECK (status IN ('applied', 'rolled_back', 'failed'))
)`;

/**
 * Ensure the _mcp_schema_versions table exists.
 * Returns true if the table was newly created, false if it already existed.
 */
async function ensureTrackingTable(adapter: PostgresAdapter): Promise<boolean> {
  const check = await adapter.executeQuery(
    `SELECT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = $1
    ) AS "table_exists"`,
    [TRACKING_TABLE],
  );
  const firstRow = (check.rows ?? [])[0];
  const existed = firstRow?.["table_exists"] === true;

  if (!existed) {
    await adapter.executeQuery(CREATE_TRACKING_TABLE_SQL);
  }
  return !existed;
}

function hashMigrationSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

interface FormattedRecord {
  id: number;
  version: string;
  description: string | null;
  appliedAt: string;
  appliedBy: string | null;
  migrationHash: string;
  sourceSystem: string | null;
  status: string;
}

function formatRecord(row: Record<string, unknown>): FormattedRecord {
  const appliedAt = row["applied_at"];
  const appliedAtStr =
    appliedAt instanceof Date
      ? appliedAt.toISOString()
      : ((appliedAt as string | null) ?? "");
  return {
    id: row["id"] as number,
    version: row["version"] as string,
    description: (row["description"] as string | null) ?? null,
    appliedAt: appliedAtStr,
    appliedBy: (row["applied_by"] as string | null) ?? null,
    migrationHash: row["migration_hash"] as string,
    sourceSystem: (row["source_system"] as string | null) ?? null,
    status: row["status"] as string,
  };
}

// =============================================================================
// pg_migration_init
// =============================================================================

function createMigrationInitTool(adapter: PostgresAdapter): ToolDefinition {
  const annotations = write("Initialize migration tracking");
  return {
    name: "pg_migration_init",
    description:
      "Initialize or verify the schema version tracking table (_mcp_schema_versions). " +
      "Idempotent — safe to call repeatedly. Returns current tracking state.",
    group: "introspection",
    inputSchema: MigrationInitSchemaBase,
    outputSchema: MigrationInitOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = MigrationInitSchema.parse(params);
      const targetSchema = parsed.schema ?? "public";

      // Create table in target schema
      const createSql =
        targetSchema === "public"
          ? CREATE_TRACKING_TABLE_SQL
          : CREATE_TRACKING_TABLE_SQL.replace(
              TRACKING_TABLE,
              `${targetSchema}.${TRACKING_TABLE}`,
            );

      const check = await adapter.executeQuery(
        `SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = $1 AND tablename = $2
        ) AS "table_exists"`,
        [targetSchema, TRACKING_TABLE],
      );
      const firstRow = (check.rows ?? [])[0];
      const existed = firstRow?.["table_exists"] === true;

      if (!existed) {
        await adapter.executeQuery(createSql);
      }

      const qualifiedTable =
        targetSchema === "public"
          ? TRACKING_TABLE
          : `${targetSchema}.${TRACKING_TABLE}`;

      const countResult = await adapter.executeQuery(
        `SELECT COUNT(*)::int AS count FROM ${qualifiedTable}`,
      );
      const countRow = (countResult.rows ?? [])[0];
      const existingRecords = (countRow?.["count"] as number | null) ?? 0;

      return {
        success: true,
        tableCreated: !existed,
        tableName: qualifiedTable,
        existingRecords,
      };
    },
  };
}

// =============================================================================
// pg_migration_record
// =============================================================================

function createMigrationRecordTool(adapter: PostgresAdapter): ToolDefinition {
  const annotations = write("Record migration");
  return {
    name: "pg_migration_record",
    description:
      "Record a migration in the schema version tracking table. " +
      "Auto-provisions the tracking table on first use. " +
      "Computes SHA-256 hash for idempotency detection.",
    group: "introspection",
    inputSchema: MigrationRecordSchemaBase,
    outputSchema: MigrationRecordOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      let parsed;
      try {
        parsed = MigrationRecordSchema.parse(params);
      } catch (error: unknown) {
        if (
          error !== null &&
          typeof error === "object" &&
          "issues" in error &&
          Array.isArray((error as { issues: unknown[] }).issues)
        ) {
          const issues = (error as { issues: { message: string }[] }).issues;
          const messages = issues.map((i) => i.message).join("; ");
          return {
            success: false,
            error: `Validation error: ${messages}`,
          };
        }
        throw error;
      }
      await ensureTrackingTable(adapter);

      const migrationHash = hashMigrationSql(parsed.migrationSql);

      // Check for duplicate hash
      const dupCheck = await adapter.executeQuery(
        `SELECT id, version, status FROM ${TRACKING_TABLE}
         WHERE migration_hash = $1 AND status = 'applied'`,
        [migrationHash],
      );
      const dupRows = dupCheck.rows ?? [];
      if (dupRows.length > 0) {
        const dup = dupRows[0] ?? {};
        const dupId = dup["id"] as number;
        const dupVersion = dup["version"] as string;
        return {
          success: false,
          error:
            `Duplicate migration detected: version "${dupVersion}" (id: ${String(dupId)}) has the same SQL hash. ` +
            `Use a different migration SQL or roll back the existing one first.`,
        };
      }

      const result = await adapter.executeQuery(
        `INSERT INTO ${TRACKING_TABLE}
         (version, description, applied_by, migration_hash, migration_sql, source_system, rollback_sql)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          parsed.version,
          parsed.description ?? null,
          parsed.appliedBy ?? null,
          migrationHash,
          parsed.migrationSql,
          parsed.sourceSystem ?? null,
          parsed.rollbackSql ?? null,
        ],
      );

      const resultRows = result.rows ?? [];
      if (resultRows.length === 0) {
        return {
          success: false,
          error: "Failed to insert migration record.",
        };
      }
      const row = resultRows[0] ?? {};
      return {
        success: true,
        record: formatRecord(row),
      };
    },
  };
}

// =============================================================================
// pg_migration_rollback
// =============================================================================

function createMigrationRollbackTool(adapter: PostgresAdapter): ToolDefinition {
  const annotations = destructive("Roll back migration");
  return {
    name: "pg_migration_rollback",
    description:
      "Roll back a specific migration by ID or version. " +
      "Executes the stored rollback_sql in a transaction and updates status to 'rolled_back'. " +
      "Use dryRun: true to preview the rollback SQL without executing.",
    group: "introspection",
    inputSchema: MigrationRollbackSchemaBase,
    outputSchema: MigrationRollbackOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = MigrationRollbackSchema.parse(params);
      await ensureTrackingTable(adapter);

      if (parsed.id === undefined && parsed.version === undefined) {
        return {
          success: false,
          error:
            "Either 'id' or 'version' is required to identify the migration to roll back.",
        };
      }

      // Find the migration
      const whereClause = parsed.id !== undefined ? "id = $1" : "version = $1";
      const whereValue = parsed.id ?? parsed.version;

      const findResult = await adapter.executeQuery(
        `SELECT * FROM ${TRACKING_TABLE} WHERE ${whereClause} ORDER BY id DESC LIMIT 1`,
        [whereValue],
      );

      const findRows = findResult.rows ?? [];
      if (findRows.length === 0) {
        const identifier =
          parsed.id !== undefined
            ? `id ${String(parsed.id)}`
            : `version "${parsed.version ?? ""}"`;
        return {
          success: false,
          error: `Migration not found: ${identifier}`,
        };
      }

      const row = findRows[0] ?? {};
      const rowId = row["id"] as number;
      const rowVersion = row["version"] as string;
      const rowStatus = row["status"] as string;
      const rollbackSql = (row["rollback_sql"] as string | null) ?? null;

      if (rowStatus === "rolled_back") {
        return {
          success: false,
          error: `Migration "${rowVersion}" (id: ${String(rowId)}) has already been rolled back.`,
        };
      }

      if (rollbackSql === null) {
        return {
          success: false,
          error: `Migration "${rowVersion}" (id: ${String(rowId)}) has no rollback SQL stored. Manual rollback required.`,
        };
      }

      if (parsed.dryRun === true) {
        return {
          success: true,
          dryRun: true,
          rollbackSql,
          record: formatRecord(row),
        };
      }

      // Execute rollback in a transaction
      try {
        await adapter.executeQuery("BEGIN");
        await adapter.executeQuery(rollbackSql);
        await adapter.executeQuery(
          `UPDATE ${TRACKING_TABLE} SET status = 'rolled_back' WHERE id = $1`,
          [rowId],
        );
        await adapter.executeQuery("COMMIT");

        return {
          success: true,
          dryRun: false,
          rollbackSql,
          record: {
            ...formatRecord(row),
            status: "rolled_back",
          },
        };
      } catch (err: unknown) {
        await adapter.executeQuery("ROLLBACK");
        const message = err instanceof Error ? err.message : "Unknown error";
        return {
          success: false,
          error: `Rollback failed for migration "${rowVersion}" (id: ${String(rowId)}): ${message}. Transaction was rolled back.`,
        };
      }
    },
  };
}

// =============================================================================
// pg_migration_history
// =============================================================================

function createMigrationHistoryTool(adapter: PostgresAdapter): ToolDefinition {
  const annotations = readOnly("Migration history");
  return {
    name: "pg_migration_history",
    description:
      "Query migration history with optional filtering by status and source system. " +
      "Returns paginated results ordered by applied_at descending.",
    group: "introspection",
    inputSchema: MigrationHistorySchemaBase,
    outputSchema: MigrationHistoryOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = MigrationHistorySchema.parse(params);
      await ensureTrackingTable(adapter);

      const limit = parsed.limit ?? 50;
      const offset = parsed.offset ?? 0;

      // Build dynamic WHERE clause
      const conditions: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (parsed.status != null) {
        conditions.push(`status = $${String(paramIdx)}`);
        paramIdx++;
        values.push(parsed.status);
      }
      if (parsed.sourceSystem != null) {
        conditions.push(`source_system = $${String(paramIdx)}`);
        paramIdx++;
        values.push(parsed.sourceSystem);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Get total count
      const countResult = await adapter.executeQuery(
        `SELECT COUNT(*)::int AS count FROM ${TRACKING_TABLE} ${whereClause}`,
        values.length > 0 ? values : undefined,
      );
      const countRow = (countResult.rows ?? [])[0];
      const total = (countRow?.["count"] as number | null) ?? 0;

      // Get page of results (exclude migration_sql for payload efficiency)
      const limitIdx = String(paramIdx);
      paramIdx++;
      const offsetIdx = String(paramIdx);
      const dataResult = await adapter.executeQuery(
        `SELECT id, version, description, applied_at, applied_by,
                migration_hash, source_system, rollback_sql IS NOT NULL AS has_rollback, status
         FROM ${TRACKING_TABLE}
         ${whereClause}
         ORDER BY applied_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...values, limit, offset],
      );

      const records = (dataResult.rows ?? []).map(formatRecord);

      return {
        records,
        total,
        limit,
        offset,
      };
    },
  };
}

// =============================================================================
// pg_migration_status
// =============================================================================

function createMigrationStatusTool(adapter: PostgresAdapter): ToolDefinition {
  const annotations = readOnly("Migration status");
  return {
    name: "pg_migration_status",
    description:
      "Get current migration tracking status: latest version, counts by status, " +
      "and list of source systems. Returns initialized: false if tracking table doesn't exist.",
    group: "introspection",
    inputSchema: MigrationStatusSchemaBase,
    outputSchema: MigrationStatusOutputSchema,
    annotations,
    icons: getToolIcons("introspection", annotations),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = MigrationStatusSchema.parse(params);
      const targetSchema = parsed.schema ?? "public";

      // Check if tracking table exists
      const check = await adapter.executeQuery(
        `SELECT EXISTS (
          SELECT 1 FROM pg_tables
          WHERE schemaname = $1 AND tablename = $2
        ) AS "table_exists"`,
        [targetSchema, TRACKING_TABLE],
      );
      const firstRow = (check.rows ?? [])[0];
      const tableExists = firstRow?.["table_exists"] === true;

      if (!tableExists) {
        return {
          initialized: false,
          latestVersion: null,
          latestAppliedAt: null,
          counts: { total: 0, applied: 0, rolledBack: 0, failed: 0 },
          sourceSystems: [],
        };
      }

      const qualifiedTable =
        targetSchema === "public"
          ? TRACKING_TABLE
          : `${targetSchema}.${TRACKING_TABLE}`;

      // Get aggregate status
      const statsResult = await adapter.executeQuery(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'applied')::int AS applied,
          COUNT(*) FILTER (WHERE status = 'rolled_back')::int AS rolled_back,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM ${qualifiedTable}`,
      );
      const statsRow = (statsResult.rows ?? [])[0] ?? {};

      // Get latest applied migration
      const latestResult = await adapter.executeQuery(
        `SELECT version, applied_at FROM ${qualifiedTable}
         WHERE status = 'applied'
         ORDER BY applied_at DESC LIMIT 1`,
      );
      const latestRow = (latestResult.rows ?? [])[0];

      // Get distinct source systems
      const systemsResult = await adapter.executeQuery(
        `SELECT DISTINCT source_system FROM ${qualifiedTable}
         WHERE source_system IS NOT NULL
         ORDER BY source_system`,
      );
      const sourceSystems = (systemsResult.rows ?? []).map(
        (r) => r["source_system"] as string,
      );

      let latestAppliedAt: string | null = null;
      if (latestRow != null) {
        const appliedAt = latestRow["applied_at"];
        latestAppliedAt =
          appliedAt instanceof Date
            ? appliedAt.toISOString()
            : ((appliedAt as string | null) ?? "");
      }

      return {
        initialized: true,
        latestVersion:
          latestRow != null ? (latestRow["version"] as string) : null,
        latestAppliedAt,
        counts: {
          total: statsRow["total"] as number,
          applied: statsRow["applied"] as number,
          rolledBack: statsRow["rolled_back"] as number,
          failed: statsRow["failed"] as number,
        },
        sourceSystems,
      };
    },
  };
}
