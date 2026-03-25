/**
 * postgres-mcp - Code Mode Group API Generator
 *
 * Dynamic API generator for tool groups. Creates methods for each tool
 * in the group, wires up method aliases, and adds special wrapper
 * functions for text (soundex/metaphone) and performance groups.
 */

import type { PostgresAdapter } from "../../adapters/postgresql/postgres-adapter.js";
import type { ToolDefinition } from "../../types/index.js";
import type { AuditInterceptor } from "../../audit/index.js";
import { METHOD_ALIASES } from "./maps.js";
import { normalizeParams } from "./normalize.js";

/**
 * Dynamic API generator for tool groups.
 * Creates methods for each tool in the group.
 *
 * §1: When an auditInterceptor is provided, all handler calls are wrapped
 * with audit logging + pre-mutation snapshots. This closes the Code Mode
 * blindspot where sandbox tool calls previously bypassed the audit trail.
 * Each auditInterceptor.around() adds ~2ms latency per inner tool call.
 */
export function createGroupApi(
  adapter: PostgresAdapter,
  groupName: string,
  tools: ToolDefinition[],
  auditInterceptor?: AuditInterceptor | null,
): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const api: Record<string, (...args: unknown[]) => Promise<unknown>> = {};

  for (const tool of tools) {
    // Convert tool name to method name
    // e.g., pg_read_query -> readQuery, pg_jsonb_extract -> extract
    const methodName = toolNameToMethodName(tool.name, groupName);

    api[methodName] = async (...args: unknown[]) => {
      // Normalize positional arguments to object parameters
      // Use empty object when no args provided to match direct tool call behavior
      const normalizedParams = normalizeParams(methodName, args) ?? {};
      const context = adapter.createContext();

      // §1: Wrap with audit interceptor when available
      if (auditInterceptor) {
        return auditInterceptor.around(
          tool.name,
          normalizedParams,
          context.requestId,
          () => tool.handler(normalizedParams, context),
          { logAs: "pg_execute_code" }
        );
      }
      return tool.handler(normalizedParams, context);
    };
  }

  // Add method aliases for this group
  const aliases = METHOD_ALIASES[groupName];
  if (aliases !== undefined) {
    for (const [aliasName, canonicalName] of Object.entries(aliases)) {
      if (api[canonicalName] !== undefined) {
        api[aliasName] = api[canonicalName];
      }
    }
  }

  // Add special wrapper functions for text group (soundex/metaphone call fuzzyMatch with method param)
  if (groupName === "text" && api["fuzzyMatch"] !== undefined) {
    const fuzzyMatchFn = api["fuzzyMatch"];

    // pg.text.soundex({table, column, value}) → fuzzyMatch({table, column, value, method: 'soundex'})
    api["soundex"] = async (...args: unknown[]) => {
      const normalizedParams = normalizeParams("soundex", args) as
        | Record<string, unknown>
        | undefined;
      return fuzzyMatchFn({ ...normalizedParams, method: "soundex" });
    };

    // pg.text.metaphone({table, column, value}) → fuzzyMatch({table, column, value, method: 'metaphone'})
    api["metaphone"] = async (...args: unknown[]) => {
      const normalizedParams = normalizeParams("metaphone", args) as
        | Record<string, unknown>
        | undefined;
      return fuzzyMatchFn({ ...normalizedParams, method: "metaphone" });
    };
  }

  // Add special wrapper functions for performance group
  if (groupName === "performance") {
    const locksFn = api["locks"];
    const statActivityFn = api["statActivity"];

    // pg.performance.blockingQueries() → locks({ showBlocked: true })
    if (locksFn !== undefined) {
      api["blockingQueries"] = async () => {
        return locksFn({ showBlocked: true });
      };
    }

    // pg.performance.longRunningQueries(seconds?) → {longRunningQueries, count, threshold}
    if (statActivityFn !== undefined) {
      api["longRunningQueries"] = async (...args: unknown[]) => {
        // Support both: longRunningQueries(10) and longRunningQueries({seconds: 10})
        let minSeconds: number | undefined;
        const arg0 = args[0];
        if (typeof arg0 === "number") {
          minSeconds = arg0;
        } else if (typeof arg0 === "object" && arg0 !== null) {
          const obj = arg0 as Record<string, unknown>;
          const secVal =
            obj["seconds"] ??
            obj["threshold"] ??
            obj["minSeconds"] ??
            obj["minDuration"];
          if (typeof secVal === "number") {
            minSeconds = secVal;
          }
        }

        const result = (await statActivityFn({ includeIdle: false })) as {
          connections: Record<string, unknown>[];
          count: number;
        };
        const threshold = minSeconds ?? 5; // Default 5 seconds
        const longRunning = result.connections.filter((conn) => {
          const duration = conn["duration"];
          if (typeof duration === "string") {
            // Parse interval like "00:00:10.123"
            const parts = duration.split(":");
            if (parts.length >= 3) {
              const hours = parseInt(parts[0] ?? "0", 10);
              const mins = parseInt(parts[1] ?? "0", 10);
              const secs = parseFloat(parts[2] ?? "0");
              const totalSeconds = hours * 3600 + mins * 60 + secs;
              return totalSeconds >= threshold;
            }
          }
          return false;
        });
        return {
          longRunningQueries: longRunning,
          count: longRunning.length,
          threshold: `${String(threshold)} seconds`,
        };
      };
      // Add alias: runningQueries → longRunningQueries
      api["runningQueries"] = api["longRunningQueries"];
    }

    // pg.performance.analyzeTable() → Actually runs ANALYZE (cross-group bridge to admin)
    api["analyzeTable"] = async (...args: unknown[]): Promise<unknown> => {
      const arg0 = args[0];
      let tableName = "";
      let schemaName = "public";

      if (typeof arg0 === "string") {
        // Handle schema.table format
        if (arg0.includes(".")) {
          const parts = arg0.split(".");
          schemaName = parts[0] ?? "public";
          tableName = parts[1] ?? "";
        } else {
          tableName = arg0;
        }
      } else if (typeof arg0 === "object" && arg0 !== null) {
        const obj = arg0 as Record<string, unknown>;
        const tableVal = obj["table"] ?? obj["name"];
        if (typeof tableVal === "string") {
          // Handle schema.table format in object form too
          if (tableVal.includes(".")) {
            const parts = tableVal.split(".");
            schemaName = parts[0] ?? "public";
            tableName = parts[1] ?? "";
          } else {
            tableName = tableVal;
          }
        }
        // Only use explicit schema if table didn't contain schema prefix
        const schemaVal = obj["schema"];
        if (
          typeof schemaVal === "string" &&
          !tableVal?.toString().includes(".")
        ) {
          schemaName = schemaVal;
        }
      }

      if (tableName === "") {
        return {
          error: "Table name required",
          usage:
            'pg.performance.analyzeTable("table_name") or pg.performance.analyzeTable({ table: "name", schema: "public" })',
        };
      }

      // Execute ANALYZE directly
      const qualifiedName = `"${schemaName}"."${tableName}"`;
      await adapter.executeQuery(`ANALYZE ${qualifiedName}`);

      return {
        success: true,
        message: `ANALYZE completed on ${qualifiedName}`,
        hint: "Table statistics updated for query planner optimization.",
      };
    };
  }

  return api;
}

/**
 * Convert tool name to camelCase method name
 * Examples:
 *   pg_read_query (core) -> readQuery
 *   pg_jsonb_extract (jsonb) -> extract
 *   pg_vector_search (vector) -> search
 */
export function toolNameToMethodName(
  toolName: string,
  groupName: string,
): string {
  // Remove pg_ prefix
  let name = toolName.replace(/^pg_/, "");

  // Remove group prefix if present
  const groupPrefix = groupName.replace(/-/g, "_") + "_";
  if (name.startsWith(groupPrefix)) {
    name = name.substring(groupPrefix.length);
  }

  // Convert snake_case to camelCase
  return name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
