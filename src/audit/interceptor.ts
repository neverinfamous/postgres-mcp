/**
 * postgres-mcp — Audit Interceptor
 *
 * Wraps tool execution to produce audit entries for write/admin
 * operations. Reads OAuth identity from AsyncLocalStorage and
 * determines the tool's required scope via the scope-map.
 *
 * Phase 2: When a BackupManager is provided, captures pre-mutation
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
   */
  around<T>(
    toolName: string,
    args: unknown,
    requestId: string,
    fn: () => Promise<T>,
  ): Promise<T>;
}

/**
 * Scope values that trigger audit logging
 * (read-only tools are skipped for log manageability).
 */
const AUDITED_SCOPES = new Set(["write", "admin"]);

/**
 * Map a scope string to an AuditCategory.
 */
function scopeToCategory(scope: string): AuditCategory {
  return scope === "admin" ? "admin" : "write";
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
  return {
    async around<T>(
      toolName: string,
      args: unknown,
      requestId: string,
      fn: () => Promise<T>,
    ): Promise<T> {
      const scope = getRequiredScope(toolName);

      // Skip read-only tools — only audit write & admin
      if (!AUDITED_SCOPES.has(scope)) {
        return fn();
      }

      const authCtx = getAuthContext();
      const start = performance.now();
      let success = true;
      let error: string | undefined;
      let backupRef: string | undefined;

      // Phase 2: Pre-mutation snapshot (before tool executes)
      if (backupManager && queryAdapter && backupManager.shouldSnapshot(toolName)) {
        try {
          backupRef = await backupManager.createSnapshot(
            toolName,
            (args ?? {}) as Record<string, unknown>,
            requestId,
            queryAdapter,
          );
        } catch {
          // Snapshot failure must not block tool execution
        }
      }

      try {
        return await fn();
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        throw err; // Re-throw — don't swallow
      } finally {
        const durationMs = Math.round(performance.now() - start);

        auditLogger.log({
          timestamp: new Date().toISOString(),
          requestId,
          tool: toolName,
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
        });
      }
    },
  };
}
