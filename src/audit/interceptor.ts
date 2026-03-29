/**
 * postgres-mcp — Audit Interceptor
 *
 * Wraps tool execution to produce audit entries for all tool
 * invocations. Write/admin tools are always logged; read-scoped
 * tools are logged only when `--audit-reads` is enabled.
 *
 * Each entry includes a `tokenEstimate` (~4 bytes per token)
 * computed from the serialized result size.
 *
 * When a BackupManager is provided, captures pre-mutation
 * snapshots of target objects before destructive tool execution.
 *
 * The interceptor is injected into `DatabaseAdapter.registerTool()`
 * so that all 248 tool handlers are audited without per-handler changes.
 */

import { performance } from "node:perf_hooks";
import type { AuditLogger } from "./logger.js";
import type { BackupManager, SnapshotQueryAdapter } from "./backup-manager.js";
import type { AuditCategory } from "./types.js";
import { getAuthContext } from "../auth/auth-context.js";
import { getRequiredScope } from "../auth/scope-map.js";

/**
 * Audit interceptor interface — used by `DatabaseAdapter.registerTool()`.
 */
export interface AuditInterceptor {
  /**
   * Wrap a tool invocation with audit logging.
   * Returns the tool result unchanged; re-throws any errors.
   *
   * @param toolName  MCP tool name
   * @param args      Tool input arguments
   * @param requestId Request ID from RequestContext
   * @param fn        The actual tool handler to execute
   * @param options   Optional configuration, such as overriding the recorded tool name
   */
  around<T>(
    toolName: string,
    args: unknown,
    requestId: string,
    fn: () => Promise<T>,
    options?: { logAs?: string },
  ): Promise<T>;
}

/**
 * Write/admin scopes are always audited.
 * Read scope is audited only when `auditReads` is enabled.
 */
const ALWAYS_AUDITED_SCOPES = new Set(["write", "admin"]);

/**
 * Map a scope string to an AuditCategory.
 */
function scopeToCategory(scope: string): AuditCategory {
  if (scope === "admin") return "admin";
  if (scope === "read") return "read";
  return "write";
}

/**
 * Create an audit interceptor bound to the given logger.
 *
 * @param auditLogger  The JSONL audit logger
 * @param backupManager Optional backup manager for pre-mutation snapshots
 * @param queryAdapter  Optional query adapter for snapshot DDL capture
 */
export function createAuditInterceptor(
  auditLogger: AuditLogger,
  backupManager?: BackupManager,
  queryAdapter?: SnapshotQueryAdapter,
): AuditInterceptor {
  const auditReads = auditLogger.config.auditReads;

  return {
    async around<T>(
      toolName: string,
      args: unknown,
      requestId: string,
      fn: () => Promise<T>,
      options?: { logAs?: string },
    ): Promise<T> {
      const scope = getRequiredScope(toolName);

      // Read-scoped tools are only audited when --audit-reads is enabled
      if (!ALWAYS_AUDITED_SCOPES.has(scope) && !auditReads) {
        return fn();
      }

      const isReadScope = scope === "read";
      const authCtx = getAuthContext();
      const start = performance.now();
      let success = true;
      let error: string | undefined;
      let backupRef: string | undefined;
      let tokenEstimate: number | undefined;

      // Pre-mutation snapshot (before tool executes)
      if (backupManager && queryAdapter && backupManager.shouldSnapshot(toolName)) {
        try {
          backupRef = await backupManager.createSnapshot(
            toolName,
            (args ?? {}) as Record<string, unknown>,
            requestId,
            queryAdapter,
            options?.logAs,
          );
        } catch {
          // Snapshot failure must not block tool execution
        }
      }

      try {
        const result = await fn();

        // Compute token estimate from result (~4 bytes per token)
        if (typeof result === "object" && result !== null) {
          try {
            // Match mcp-registry.ts exact payload token calculation (minified + _meta)
            const json = JSON.stringify({ ...result, _meta: { tokenEstimate: 0 } });
            tokenEstimate = Math.ceil(Buffer.byteLength(json, "utf8") / 4);
          } catch {
            // Serialization failure must not block tool execution
          }
        } else if (typeof result === "string") {
          tokenEstimate = Math.ceil(Buffer.byteLength(result, "utf8") / 4);
        }

        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        
        // Match mcp-registry.ts raw exception fallback token calculation
        const errorResult = {
          success: false,
          error: error,
          code: "INTERNAL_ERROR",
          category: "internal",
          recoverable: false,
        };
        const enriched = JSON.stringify({ ...errorResult, _meta: { tokenEstimate: 0 } });
        tokenEstimate = Math.ceil(Buffer.byteLength(enriched, "utf8") / 4);
        
        throw err; // Re-throw — don't swallow
      } finally {
        const durationMs = Math.round(performance.now() - start);

        if (isReadScope) {
          // Compact read entries — omit args, user, scopes for ~100 byte entries
          auditLogger.log({
            timestamp: new Date().toISOString(),
            requestId,
            tool: options?.logAs ?? toolName,
            category: "read" as AuditCategory,
            scope,
            durationMs,
            success,
            error,
            tokenEstimate,
          } as Parameters<typeof auditLogger.log>[0]);
        } else {
          auditLogger.log({
            timestamp: new Date().toISOString(),
            requestId,
            tool: options?.logAs ?? toolName,
            category: scopeToCategory(scope),
            scope,
            user: authCtx?.claims?.sub ?? null,
            scopes: authCtx?.scopes ?? [],
            durationMs,
            success,
            error,
            args: auditLogger.config.redact
              ? undefined
              : (args as Record<string, unknown>),
            backup: backupRef,
            tokenEstimate,
          });
        }
      }
    },
  };
}
