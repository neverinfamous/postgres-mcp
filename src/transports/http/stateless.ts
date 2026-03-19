/**
 * postgres-mcp - Stateless HTTP Transport Handler
 *
 * Handles stateless HTTP requests on `/mcp`.
 * Each request creates a fresh transport — no sessions, no SSE stream.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { DEFAULTS, readBody } from "./security.js";
import type { HttpTransportConfig } from "./types.js";

/**
 * Handle stateless HTTP requests on `/mcp`.
 *
 * Each request creates a fresh transport — no sessions, no SSE stream.
 * Only POST is supported; GET (SSE) and DELETE (terminate) return errors.
 */
export async function handleStatelessRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: HttpTransportConfig,
  onConnect?: (transport: Transport) => void | Promise<void>,
): Promise<void> {
  if (req.method === "GET") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          message: "SSE connections not available in stateless mode",
        },
      }),
    );
    return;
  }

  if (req.method === "DELETE") {
    // No-op in stateless mode — nothing to terminate
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "Method not allowed" } }));
    return;
  }

  const maxBodySize = config.maxBodySize ?? DEFAULTS.MAX_BODY_SIZE;
  let body: unknown;
  try {
    body = await readBody(req, res, maxBodySize);
  } catch (readError) {
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

  // Create a fresh transport for each request (no session persistence)
  // Omitting sessionIdGenerator tells the SDK to run in stateless mode
  const transport = new StreamableHTTPServerTransport(
    {} as ConstructorParameters<typeof StreamableHTTPServerTransport>[0],
  );

  if (onConnect) {
    await onConnect(transport as unknown as Transport);
  }

  await transport.handleRequest(req, res, body);
  await transport.close();
}
