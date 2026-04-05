/**
 * postgres-mcp - Legacy SSE Transport Handlers
 *
 * Handles legacy SSE (MCP protocol 2024-11-05) connections via `/sse` + `/messages`.
 * Backward compatibility — intentionally using deprecated SSEServerTransport.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Legacy SSE transport — intentionally used for MCP 2024-11-05 backward compatibility
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { logger } from "../../utils/logger.js";

/**
 * Handle legacy SSE connection request (GET /sse).
 *
 * Creates an SSEServerTransport that establishes an event stream and
 * directs the client to POST messages to `/messages?sessionId=<id>`.
 */
export async function handleLegacySSERequest(
  _req: IncomingMessage,
  res: ServerResponse,
  transports: Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    StreamableHTTPServerTransport | SSEServerTransport
  >,
  onConnect?: (transport: Transport) => void | Promise<void>,
): Promise<void> {
  logger.debug("Legacy SSE connection established");

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  // Clean up on disconnect
  res.on("close", () => {
    logger.debug("Legacy SSE transport closed", {
      sessionId: transport.sessionId,
    });
    transports.delete(transport.sessionId);
  });

  // Connect MCP server to this transport (must complete before client sends messages)
  if (onConnect) {
    await onConnect(transport as unknown as Transport);
  }
}

/**
 * Handle legacy message request (POST /messages?sessionId=<id>).
 *
 * Routes the message to the correct SSEServerTransport instance.
 */
export async function handleLegacyMessageRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  transports: Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    StreamableHTTPServerTransport | SSEServerTransport
  >,
): Promise<void> {
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing sessionId parameter" }));
    return;
  }

  const transport = transports.get(sessionId);

  if (!transport) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No transport found for sessionId" }));
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  if (!(transport instanceof SSEServerTransport)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Session exists but uses a different transport protocol. Use /mcp instead.",
      }),
    );
    return;
  }

  await transport.handlePostMessage(req, res);
}
