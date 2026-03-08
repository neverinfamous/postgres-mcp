/**
 * postgres-mcp - Progress Notification Utilities
 *
 * Utilities for sending MCP progress notifications during long-running operations.
 * Follows MCP 2025-11-25 specification for notifications/progress.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestContext } from "../types/index.js";



/** Context required to send progress notifications */
export interface ProgressContext {
  /** MCP Server instance for sending notifications */
  server: McpServer;
  /** Progress token from request _meta (if client requested progress) */
  progressToken?: string | number;
}

/**
 * Build a ProgressContext from RequestContext if progress fields are available.
 * Returns undefined if the context doesn't have progress support.
 */
export function buildProgressContext(
  ctx: RequestContext | undefined,
): ProgressContext | undefined {
  if (ctx?.server === undefined || ctx.progressToken === undefined) {
    return undefined;
  }
  return {
    server: ctx.server as McpServer,
    progressToken: ctx.progressToken,
  };
}

/**
 * Send a progress notification to the client.
 *
 * Only sends if a progressToken was provided in the original request.
 * Silently no-ops if no token was provided.
 *
 * @param ctx - Progress context with server and optional token
 * @param progress - Current progress value (e.g., items processed)
 * @param total - Optional total value for percentage calculation
 * @param message - Optional human-readable status message
 */
export async function sendProgress(
  ctx: ProgressContext | undefined,
  progress: number,
  total?: number,
  message?: string,
): Promise<void> {
  // Early return if no context, no progressToken, or no server
  if (ctx === undefined) return;
  if (ctx.progressToken === undefined) return;

  try {
    // Build notification payload per MCP spec
    const notification = {
      method: "notifications/progress" as const,
      params: {
        progressToken: ctx.progressToken,
        progress,
        ...(total !== undefined && { total }),
        ...(message !== undefined && message !== "" && { message }),
      },
    };

    // Send via server's internal notification method
    await ctx.server.server.notification(notification);
  } catch {
    // Non-critical: progress notifications are best-effort
    // Don't let notification failures break the operation
  }
}


