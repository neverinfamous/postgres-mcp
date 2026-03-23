/**
 * postgres-mcp - CLI Server Starters
 *
 * Functions to start the MCP server with stdio or HTTP transport.
 */

import type { PostgresAdapter } from "../adapters/postgresql/index.js";
import { PostgresMcpServer } from "../server/mcp-server.js";
import { logger } from "../utils/logger.js";
import type { InstructionLevel } from "../constants/server-instructions.js";
import type { AuditConfig } from "../audit/index.js";
import { HttpTransport, type HttpTransportConfig } from "../transports/http/index.js";
import {
  OAuthResourceServer,
  TokenValidator,
  ALL_SCOPES,
} from "../auth/index.js";
import type { OAuthConfig } from "../types/index.js";
import { VERSION } from "../utils/version.js";

interface ServerCliOptions {
  port?: number;
  serverHost?: string;
  authToken?: string;
  stateless?: boolean;
  enableHsts?: boolean;
  trustProxy?: boolean;
}

/**
 * Start the server with stdio transport
 */
export async function startStdioServer(
  adapter: PostgresAdapter,
  toolFilter?: string,
  instructionLevel?: InstructionLevel,
  auditConfig?: AuditConfig,
): Promise<void> {
  const server = new PostgresMcpServer({
    name: "postgres-mcp",
    version: VERSION,
    adapter,
    toolFilter,
    instructionLevel,
    auditConfig,
  });

  // Handle shutdown
  const shutdown = (): void => {
    logger.info("Shutting down...");
    void server
      .stop()
      .then(() => adapter.disconnect())
      .then(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await server.start();
}

/**
 * Start the server with HTTP transport
 */
export async function startHttpServer(
  adapter: PostgresAdapter,
  toolFilter: string | undefined,
  instructionLevel: InstructionLevel | undefined,
  oauthConfig: OAuthConfig | undefined,
  options: ServerCliOptions,
  auditConfig?: AuditConfig,
): Promise<void> {
  const port = options.port ?? parseInt(process.env["PORT"] ?? "3000", 10);
  const host =
    options.serverHost ??
    process.env["MCP_HOST"] ??
    process.env["HOST"] ??
    "localhost";

  // Create OAuth components if enabled
  let resourceServer: OAuthResourceServer | undefined;
  let tokenValidator: TokenValidator | undefined;

  if (
    oauthConfig?.enabled &&
    oauthConfig.issuer &&
    oauthConfig.jwksUri &&
    oauthConfig.audience
  ) {
    resourceServer = new OAuthResourceServer({
      resource: `http://${host}:${String(port)}`,
      authorizationServers: [oauthConfig.issuer],
      scopesSupported: [...ALL_SCOPES],
    });

    tokenValidator = new TokenValidator({
      jwksUri: oauthConfig.jwksUri,
      issuer: oauthConfig.issuer,
      audience: oauthConfig.audience,
      clockTolerance: oauthConfig.clockTolerance,
    });
  }

  // Create MCP server
  const mcpServer = new PostgresMcpServer({
    name: "postgres-mcp",
    version: VERSION,
    adapter,
    toolFilter,
    instructionLevel,
    auditConfig,
  });

  // ALWAYS register components (tools, resources, prompts) regardless of transport
  mcpServer.registerComponents();

  // Build HTTP transport config
  const resolvedToken = options.authToken ?? process.env["MCP_AUTH_TOKEN"];
  const transportConfig: HttpTransportConfig = {
    port,
    host,
    ...(resolvedToken !== undefined ? { authToken: resolvedToken } : {}),
    stateless: options.stateless ?? false,
    ...(options.enableHsts !== undefined && { enableHSTS: options.enableHsts }),
    publicPaths: oauthConfig?.publicPaths ?? ["/health", "/.well-known/*"],
    trustProxy: options.trustProxy ?? process.env["TRUST_PROXY"] === "true",
  };
  if (resourceServer) transportConfig.resourceServer = resourceServer;
  if (tokenValidator) transportConfig.tokenValidator = tokenValidator;

  // Create HTTP transport with OAuth
  const httpTransport = new HttpTransport(
    transportConfig,
    async (transport) => {
      const server = mcpServer.getMcpServer();
      // Close any existing transport before connecting (SDK throws if already connected)
      if (server.isConnected()) {
        await server.close();
      }
      await server.connect(transport);
    },
  );

  // Handle shutdown
  const shutdown = (): void => {
    logger.info("Shutting down...");
    void httpTransport
      .stop()
      .then(() => mcpServer.stop())
      .then(() => adapter.disconnect())
      .then(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start HTTP server
  await httpTransport.start();

  logger.info(
    `PostgreSQL MCP Server started on http://${host}:${String(port)}`,
  );

  if (oauthConfig?.enabled) {
    logger.info(
      "OAuth 2.1 protected resource metadata available at /.well-known/oauth-protected-resource",
    );
  }
}
