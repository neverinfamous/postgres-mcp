/**
 * PostgreSQL Introspection Tools - Graph Algorithms
 *
 * Pure graph algorithms: cycle detection, topological sort, depth calculation.
 * No database dependencies — operates on adjacency lists.
 */

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
export function calculateMaxDepth(
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
