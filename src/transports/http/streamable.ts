/**
 * postgres-mcp - Streamable HTTP Transport Handler
 *
 * Handles Streamable HTTP (MCP protocol 2025-11-25) requests on `/mcp`.
 * Supports GET (SSE stream), POST (initialize + messages), DELETE (terminate).
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { logger } from "../../utils/logger.js";
import { DEFAULTS, readBody } from "./security.js";
import type { HttpTransportConfig } from "./types.js";

/**
 * Handle Streamable HTTP requests on `/mcp`.
 *
 * Supports GET (SSE stream), POST (initialize + messages), DELETE (terminate).
 * Session management is handled via the `Mcp-Session-Id` header.
 */
export async function handleStreamableRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: HttpTransportConfig,
  transports: Map<
    string,
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    StreamableHTTPServerTransport | SSEServerTransport
  >,
  onConnect?: (transport: Transport) => void | Promise<void>,
): Promise<void> {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  // For non-POST requests (GET for SSE stream, DELETE for session termination),
  // delegate directly to the transport if we have a valid session
  if (req.method !== "POST") {
    if (sessionId && transports.has(sessionId)) {
      const existing = transports.get(sessionId);
      if (existing instanceof StreamableHTTPServerTransport) {
        await existing.handleRequest(req, res);
        return;
      }
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid session ID provided",
        },
        id: null,
      }),
    );
    return;
  }

  // POST requests — pre-parse the body so the SDK receives parsed JSON
  const maxBodySize = config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE;
  let body: unknown;
  try {
    body = await readBody(req, res, maxBodySize);
  } catch (readError) {
    // readBody rejects with "Payload too large" after sending 413 to client
    if (
      readError instanceof Error &&
      readError.message === "Payload too large"
    ) {
      return;
    }
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error: Invalid JSON" },
        id: null,
      }),
    );
    return;
  }

  // Existing session — route to the correct transport
  if (sessionId && transports.has(sessionId)) {
    const existing = transports.get(sessionId);
    if (existing instanceof StreamableHTTPServerTransport) {
      await existing.handleRequest(req, res, body);
      return;
    }
    // Session exists but uses legacy SSE transport
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            "Bad Request: Session exists but uses a different transport protocol",
        },
        id: null,
      }),
    );
    return;
  }

  // No session ID — must be an initialization request
  if (!sessionId && isInitializeRequest(body)) {
    const newTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId: string) => {
        logger.debug("Streamable HTTP session initialized", {
          sessionId: newSessionId,
        });
        transports.set(newSessionId, newTransport);
      },
    });

    // Clean up on close
    newTransport.onclose = () => {
      const sid = newTransport.sessionId;
      if (sid && transports.has(sid)) {
        logger.debug("Streamable HTTP transport closed", {
          sessionId: sid,
        });
        transports.delete(sid);
      }
    };

    // Connect MCP server to this transport (must complete before handling request)
    if (onConnect) {
      await onConnect(newTransport as unknown as Transport);
    }

    // Handle request with pre-parsed body
    await newTransport.handleRequest(req, res, body);
    return;
  }

  // POST without session ID and not an initialization request
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    }),
  );
}
