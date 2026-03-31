/**
 * postgres-mcp - Code Mode Tool: pg_execute_code
 *
 * MCP tool that executes LLM-generated code in a sandboxed environment
 * with access to all 194 PostgreSQL tools via the pg.* API.
 */

import { z } from "zod";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";
import { createSandboxPool, type ISandboxPool } from "../../../../codemode/index.js";
import { CodeModeSecurityManager } from "../../../../codemode/security.js";
import { createPgApi } from "../../../../codemode/api/index.js";
import { toolNameToMethodName } from "../../../../codemode/api/group-api.js";
import type { ExecuteCodeOptions } from "../../../../codemode/types.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { ErrorResponseFields } from "../../schemas/error-response-fields.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";

// Schema for pg_execute_code input
export const ExecuteCodeSchemaBase = z.object({
  code: z
    .string()
    .optional()
    .describe(
      "TypeScript/JavaScript code to execute. Use pg.{group}.{method}() for database operations.",
    ),
  timeout: z
    .number()
    .optional()
    .describe("Execution timeout in milliseconds (max 30000, default 30000)"),
  readonly: z
    .boolean()
    .optional()
    .describe("If true, restricts to read-only operations"),
});

const ExecuteCodeParseSchema = z.object({
  code: z
    .string()
    .optional()
    .describe(
      "TypeScript/JavaScript code to execute. Use pg.{group}.{method}() for database operations.",
    ),
  timeout: z
    .number()
    .optional()
    .describe("Execution timeout in milliseconds (max 30000, default 30000)"),
  readonly: z
    .boolean()
    .optional()
    .describe("If true, restricts to read-only operations"),
});

export const ExecuteCodeSchema = ExecuteCodeParseSchema.transform((data) => ({
  code: data.code ?? "",
  timeout: data.timeout,
  readonly: data.readonly,
})).refine((data) => data.code !== "", {
  message: "code is required",
});

// Schema for pg_execute_code output
export const ExecuteCodeOutputSchema = z.object({
  success: z.boolean().describe("Whether the code executed successfully"),
  result: z
    .unknown()
    .optional()
    .describe("Return value from the executed code"),
  error: z.string().optional().describe("Error message if execution failed"),
  metrics: z
    .object({
      wallTimeMs: z
        .number()
        .describe("Wall clock execution time in milliseconds"),
      cpuTimeMs: z.number().describe("CPU time used in milliseconds"),
      memoryUsedMb: z.number().describe("Memory used in megabytes"),
      tokenEstimate: z
        .number()
        .optional()
        .describe("Estimated token count of the result (~4 bytes per token)"),
    })
    .optional()
    .describe("Execution performance metrics"),
  hint: z.string().optional().describe("Helpful tip or additional information"),
}).extend(ErrorResponseFields.shape);

// Singleton instances (initialized on first use)
let sandboxPool: ISandboxPool | null = null;
let securityManager: CodeModeSecurityManager | null = null;

/**
 * Initialize Code Mode infrastructure
 */
function ensureInitialized(): {
  pool: ISandboxPool;
  security: CodeModeSecurityManager;
} {
  sandboxPool ??= createSandboxPool(process.env["CODEMODE_WORKER"] === "true" ? "worker" : "vm");
  if ("initialize" in sandboxPool && typeof sandboxPool.initialize === "function") {
    (sandboxPool as { initialize: () => void }).initialize();
  }
  securityManager ??= new CodeModeSecurityManager();
  return { pool: sandboxPool, security: securityManager };
}

/**
 * Create the pg_execute_code tool
 */
export function createExecuteCodeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_execute_code",
    description: `Execute TypeScript/JavaScript code in a sandboxed environment with access to all PostgreSQL tools via the pg.* API.

Available API groups:
- pg.core: readQuery, writeQuery, listTables, describeTable, createTable, createIndex, etc. (18 methods)
- pg.transactions: begin, commit, rollback, savepoint, execute (7 methods)
- pg.jsonb: extract, set, insert, delete, contains, pathQuery (19 methods)
- pg.text: search, fuzzy, headline, rank (11 methods)
- pg.performance: explain, tableStats, indexStats (16 methods)
- pg.admin: vacuum, analyze, reindex (10 methods)
- pg.monitoring: databaseSize, tableSizes, connectionStats (11 methods)
- pg.backup: dumpTable, dumpSchema, copyExport, copyImport, createBackupPlan, restoreCommand, physical, restoreValidate, scheduleOptimize (9 methods)
- pg.schema: createSchema, createView, createSequence (13 methods)
- pg.vector: search, createIndex, embed (14 methods)
- pg.postgis: distance, buffer, pointInPolygon (15 methods)
- pg.partitioning: createPartition, listPartitions (6 methods)
- pg.stats: descriptive, percentiles, correlation (8 methods)
- pg.cron: schedule, unschedule, listJobs (8 methods)
- pg.partman: createParent, runMaintenance (10 methods)
- pg.kcache: queryStats, reset (7 methods)
- pg.citext: convertColumn, listColumns (6 methods)
- pg.ltree: query, subpath, lca (8 methods)
- pg.pgcrypto: hash, encrypt, decrypt (9 methods)

Example:
\`\`\`javascript
const tables = await pg.core.listTables();
const results = [];
for (const t of tables.tables) {
    const count = await pg.core.readQuery({sql: \`SELECT COUNT(*) as n FROM \${t.name}\`});
    results.push({ table: t.name, rows: count.rows[0].n });
}
return results;
\`\`\``,
    group: "codemode",
    tags: ["code", "execute", "sandbox", "script", "batch"],
    inputSchema: ExecuteCodeSchemaBase,
    outputSchema: ExecuteCodeOutputSchema,
    requiredScopes: ["admin"],
    annotations: {
      title: "Execute Code",
      readOnlyHint: false,
      destructiveHint: true, // Can perform any operation
      idempotentHint: false,
      openWorldHint: false,
    },
    icons: getToolIcons("codemode", { destructiveHint: true }),
    handler: async (params: unknown) => {
      try {
        const { code, readonly, timeout } = ExecuteCodeSchema.parse(params) as ExecuteCodeOptions;

        // Initialize infrastructure
      const { pool, security } = ensureInitialized();

      // Validate code
      const validation = security.validateCode(code);
      if (!validation.valid) {
        return {
          success: false,
          error: `Code validation failed: ${validation.errors.join("; ")}`,
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Check rate limit
      const clientId = "default"; // Could be extracted from context in future
      if (!security.checkRateLimit(clientId)) {
        return {
          success: false,
          error: "Rate limit exceeded. Please wait before executing more code.",
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Create pg API bindings
      const pgApi = createPgApi(adapter);
      const bindings = pgApi.createSandboxBindings();

      // Enforce readonly mode by wrapping write-capable methods
      if (readonly === true) {
        enforceReadonly(bindings, adapter);
      }

      // Validate bindings are populated
      const totalMethods = Object.values(bindings).reduce(
        (sum: number, group) => {
          if (typeof group === "object" && group !== null) {
            return sum + Object.keys(group).length;
          }
          return sum;
        },
        0,
      );
      if (totalMethods === 0) {
        return {
          success: false,
          error:
            "pg.* API not available: no tool bindings were created. Ensure adapter.getToolDefinitions() returns valid tools.",
          metrics: { wallTimeMs: 0, cpuTimeMs: 0, memoryUsedMb: 0 },
        };
      }

      // Capture active transactions before execution for cleanup on error
      const transactionsBefore = new Set(adapter.getActiveTransactionIds());

      // Execute in sandbox
      const result = await pool.execute(code, bindings, timeout);

      // Cleanup orphaned transactions on failure
      // Any transaction started during execution but not committed/rolled back is orphaned
      if (!result.success) {
        const transactionsAfter = adapter.getActiveTransactionIds();
        const orphanedTransactions = transactionsAfter.filter(
          (txId) => !transactionsBefore.has(txId),
        );

        // Best-effort cleanup of orphaned transactions
        for (const txId of orphanedTransactions) {
          await adapter.cleanupTransaction(txId);
        }
      }

      // Sanitize result
      if (result.success && result.result !== undefined) {
        result.result = security.sanitizeResult(result.result);
      }

      // Compute token estimate for Code Mode responses
      const resultJson = JSON.stringify(result.result ?? null);
      const tokenEstimate = Math.ceil(
        Buffer.byteLength(resultJson, "utf8") / 4,
      );

      // Audit log
      const record = security.createExecutionRecord(
        code,
        result,
        readonly ?? false,
        clientId,
      );
      security.auditLog(record);

      // Add help hint for discoverability
      const helpHint =
        "Tip: Use pg.help() to list all groups, or pg.core.help() for group-specific methods.";

      // Include hint and enriched metrics in response
      return {
        ...result,
        metrics: result.metrics != null
          ? { ...result.metrics, tokenEstimate }
          : undefined,
        hint: helpHint,
      };
    } catch (error) {
      return formatHandlerErrorResponse(error, { tool: "pg_execute_code" });
    }
  },
};
}

/**
 * Get all Code Mode tools
 */
export function getCodeModeTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [createExecuteCodeTool(adapter)];
}

/**
 * Enforce readonly mode by replacing write-capable API methods with
 * functions that throw immediately. Uses each tool's `readOnlyHint`
 * annotation to determine which methods are write-capable.
 *
 * Builds a forward lookup (toolName → methodName) using the same
 * `toolNameToMethodName` that created the bindings, avoiding lossy
 * reverse name reconstruction.
 */
function enforceReadonly(
  bindings: Record<string, unknown>,
  adapter: PostgresAdapter,
): void {
  // Build a set of writable (group, methodName) pairs using the same
  // toolNameToMethodName conversion that created the API bindings
  const writableMethods = new Set<string>();
  for (const tool of adapter.getToolDefinitions()) {
    if (tool.annotations?.readOnlyHint === false) {
      const group = tool.group;
      const methodName = toolNameToMethodName(tool.name, group);
      writableMethods.add(`${group}.${methodName}`);
    }
  }

  // For each group in bindings, wrap write methods to throw
  for (const [groupKey, groupVal] of Object.entries(bindings)) {
    if (typeof groupVal !== "object" || groupVal === null) continue;

    const group = groupVal as Record<string, unknown>;
    for (const [methodName, methodFn] of Object.entries(group)) {
      if (typeof methodFn !== "function") continue;
      if (methodName === "help") continue; // Never block help()

      if (writableMethods.has(`${groupKey}.${methodName}`)) {
        group[methodName] = () => {
          throw new Error(
            `Readonly mode: ${groupKey}.${methodName}() is a write operation and is blocked in readonly mode`,
          );
        };
      }
    }
  }
}

/**
 * Cleanup Code Mode resources (call on server shutdown)
 */
export function cleanupCodeMode(): void {
  if (sandboxPool) {
    if ("dispose" in sandboxPool && typeof sandboxPool.dispose === "function") {
      (sandboxPool as { dispose: () => void }).dispose();
    }
    sandboxPool = null;
  }
}
