/**
 * postgres-mcp - HTTP Transport Utility Handlers
 *
 * Standalone handler functions for utility endpoints (health, root info, OAuth metadata).
 */

import type { ServerResponse } from "node:http";
import type { OAuthResourceServer } from "../../auth/OAuthResourceServer.js";

/**
 * Handle protected resource metadata endpoint
 */
export function handleProtectedResourceMetadata(
  res: ServerResponse,
  resourceServer?: OAuthResourceServer,
): void {
  if (!resourceServer) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "OAuth not configured" }));
    return;
  }

  const metadata = resourceServer.getMetadata();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(metadata));
}

/**
 * Handle health check endpoint
 */
export function handleHealthCheck(
  res: ServerResponse,
  oauthEnabled: boolean,
): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      oauthEnabled,
    }),
  );
}

/**
 * Handle root info endpoint — helpful for browser visitors and debugging
 */
export function handleRootInfo(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      name: "postgres-mcp",
      description: "PostgreSQL MCP Server with dual HTTP transport",
      endpoints: {
        "POST /mcp": "JSON-RPC requests (Streamable HTTP, MCP 2025-11-25)",
        "GET /mcp": "SSE stream for server-to-client notifications",
        "DELETE /mcp": "Session termination",
        "GET /sse": "Legacy SSE connection (MCP 2024-11-05)",
        "POST /messages": "Legacy SSE message endpoint",
        "GET /health": "Health check",
      },
      documentation: "https://github.com/neverinfamous/postgres-mcp",
    }),
  );
}
