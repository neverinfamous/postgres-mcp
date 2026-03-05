#!/usr/bin/env node
/**
 * postgres-mcp - CLI Entry Point
 *
 * Command-line interface for the PostgreSQL MCP server.
 * Supports stdio, HTTP, and SSE transports with OAuth 2.0 authentication.
 */

import { Command } from "commander";
import { PostgresAdapter } from "./adapters/postgresql/index.js";
import { PostgresMcpServer } from "./server/McpServer.js";
import { parseToolFilter, getFilterSummary } from "./filtering/ToolFilter.js";
import { logger } from "./utils/logger.js";
import { HttpTransport, type HttpTransportConfig } from "./transports/http.js";
import {
  OAuthResourceServer,
  TokenValidator,
  AuthorizationServerDiscovery,
  ALL_SCOPES,
} from "./auth/index.js";
import type {
  DatabaseConfig,
  OAuthConfig,
  TransportType,
} from "./types/index.js";

const VERSION = "0.1.0";

interface CliOptions {
  postgres?: string;
  host?: string;
  pgPort?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  poolMax?: number;
  toolFilter?: string;
  logLevel?:
    | "debug"
    | "info"
    | "notice"
    | "warning"
    | "error"
    | "critical"
    | "alert"
    | "emergency";
  transport?: TransportType;
  port?: number;
  serverHost?: string;
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthAudience?: string;
  oauthJwksUri?: string;
  oauthClockTolerance?: number;
}

interface ListToolsOptions {
  filter?: string;
  group?: string;
}

const program = new Command();

program
  .name("postgres-mcp")
  .description(
    "PostgreSQL MCP Server - Full-featured database tools for AI with OAuth 2.0",
  )
  .version(VERSION);

program
  // Connection options
  .option(
    "--postgres <url>",
    "PostgreSQL connection string (postgres://user:pass@host:port/database)",
  )
  .option("--host <host>", "PostgreSQL host (default: localhost)")
  .option("--pg-port <port>", "PostgreSQL port (default: 5432)", parseInt)
  .option("--user <user>", "PostgreSQL username")
  .option(
    "--password <password>",
    "PostgreSQL password (prefer PGPASSWORD env var to avoid process list exposure)",
  )
  .option("--database <database>", "PostgreSQL database name")
  .option("--ssl", "Enable SSL connection")
  .option(
    "--pool-max <size>",
    "Maximum pool connections (default: 10)",
    parseInt,
  )
  // Server options
  .option(
    "--transport, -t <type>",
    "Transport type: stdio, http, sse (default: stdio)",
  )
  .option(
    "--port, -p <port>",
    "HTTP port for http/sse transports (default: 3000)",
    parseInt,
  )
  .option(
    "--server-host <host>",
    "Server bind host for http/sse transports (default: localhost)",
  )
  .option(
    "--tool-filter <filter>",
    'Tool filter string (e.g., "-vector,-postgis")',
  )
  .option(
    "--log-level <level>",
    "Log level: debug, info, notice, warning, error, critical, alert, emergency (default: info)",
  )
  // OAuth options
  .option("--oauth-enabled, -o", "Enable OAuth 2.0 authentication")
  .option("--oauth-issuer <url>", "Authorization server URL (issuer)")
  .option("--oauth-audience <aud>", "Expected token audience")
  .option(
    "--oauth-jwks-uri <url>",
    "JWKS URI (auto-discovered from issuer if not set)",
  )
  .option(
    "--oauth-clock-tolerance <seconds>",
    "Clock tolerance in seconds (default: 60)",
    parseInt,
  )
  .action(async (options: CliOptions) => {
    // Set log level
    const logLevel =
      options.logLevel ?? (process.env["LOG_LEVEL"] as typeof options.logLevel);
    if (logLevel) {
      logger.setLevel(logLevel);
    }

    // Build database config
    const dbConfig = buildDatabaseConfig(options);

    // Build OAuth config
    const oauthConfig = await buildOAuthConfig(options);

    // Create adapter and connect
    const adapter = new PostgresAdapter();

    try {
      await adapter.connect(dbConfig);

      // Get tool filter from option or environment
      const toolFilter =
        options.toolFilter ??
        process.env["POSTGRES_TOOL_FILTER"] ??
        process.env["MCP_TOOL_FILTER"];

      if (toolFilter) {
        const filterConfig = parseToolFilter(toolFilter);
        logger.info(getFilterSummary(filterConfig));
      }

      // Log OAuth status
      if (oauthConfig?.enabled) {
        logger.info("OAuth 2.0 authentication enabled", {
          issuer: oauthConfig.issuer,
        });
      }

      // Determine transport type
      const transport = (options.transport ??
        process.env["MCP_TRANSPORT"] ??
        "stdio") as TransportType;

      if (transport === "http" || transport === "sse") {
        // Start with HTTP transport
        await startHttpServer(adapter, toolFilter, oauthConfig, options);
      } else {
        // Start with stdio transport (default)
        await startStdioServer(adapter, toolFilter);
      }
    } catch (error) {
      logger.error("Failed to start server", {
        error: error instanceof Error ? error.message : String(error),
      });
      await adapter.disconnect();
      process.exit(1);
    }
  });

/**
 * Build database configuration from CLI options and environment
 */
function buildDatabaseConfig(options: CliOptions): DatabaseConfig {
  const config: DatabaseConfig = {
    type: "postgresql",
  };

  // Parse connection string or individual options
  if (options.postgres) {
    const url = new URL(options.postgres);
    config.host = url.hostname;
    config.port = parseInt(url.port, 10) || 5432;
    config.username = url.username;
    config.password = url.password;
    config.database = url.pathname.slice(1); // Remove leading /

    if (
      url.searchParams.get("ssl") === "true" ||
      url.searchParams.get("sslmode") === "require"
    ) {
      config.options = { ssl: true };
    }
  } else {
    config.host =
      options.host ??
      process.env["PGHOST"] ??
      process.env["POSTGRES_HOST"] ??
      "localhost";
    config.port =
      options.pgPort ??
      parseInt(
        process.env["PGPORT"] ?? process.env["POSTGRES_PORT"] ?? "5432",
        10,
      );
    config.username =
      options.user ??
      process.env["PGUSER"] ??
      process.env["POSTGRES_USER"] ??
      "postgres";
    config.password =
      options.password ??
      process.env["PGPASSWORD"] ??
      process.env["POSTGRES_PASSWORD"] ??
      "";
    config.database =
      options.database ??
      process.env["PGDATABASE"] ??
      process.env["POSTGRES_DATABASE"] ??
      "postgres";

    if (options.ssl) {
      config.options = { ssl: true };
    }
  }

  // Pool configuration
  if (options.poolMax !== undefined && options.poolMax > 0) {
    config.pool = { max: options.poolMax };
  }

  return config;
}

/**
 * Build OAuth configuration from CLI options and environment
 */
async function buildOAuthConfig(
  options: CliOptions,
): Promise<OAuthConfig | undefined> {
  // Check if OAuth is enabled
  const oauthEnabled =
    options.oauthEnabled ?? process.env["OAUTH_ENABLED"] === "true";

  if (!oauthEnabled) {
    return undefined;
  }

  const issuer = options.oauthIssuer ?? process.env["OAUTH_ISSUER"];
  const audience = options.oauthAudience ?? process.env["OAUTH_AUDIENCE"];
  let jwksUri = options.oauthJwksUri ?? process.env["OAUTH_JWKS_URI"];
  const clockTolerance =
    options.oauthClockTolerance ??
    (process.env["OAUTH_CLOCK_TOLERANCE"]
      ? parseInt(process.env["OAUTH_CLOCK_TOLERANCE"], 10)
      : 60);

  // Auto-discover JWKS URI if not provided
  if (!jwksUri && issuer) {
    try {
      const discovery = new AuthorizationServerDiscovery({
        authServerUrl: issuer,
      });
      jwksUri = await discovery.getJwksUri();
      logger.debug("JWKS URI discovered from issuer", { jwksUri });
    } catch (error) {
      logger.warn("Failed to discover JWKS URI, OAuth may not work correctly", {
        error: String(error),
      });
    }
  }

  // Build OAuth config (we already checked oauthEnabled at function start)
  const oauthConfig: OAuthConfig = {
    enabled: true,
    clockTolerance,
  };
  if (issuer) oauthConfig.authorizationServerUrl = issuer;
  if (issuer) oauthConfig.issuer = issuer;
  if (audience) oauthConfig.audience = audience;
  if (jwksUri) oauthConfig.jwksUri = jwksUri;
  return oauthConfig;
}

/**
 * Start the server with stdio transport
 */
async function startStdioServer(
  adapter: PostgresAdapter,
  toolFilter?: string,
): Promise<void> {
  const server = new PostgresMcpServer({
    name: "postgres-mcp",
    version: VERSION,
    adapter,
    toolFilter,
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
async function startHttpServer(
  adapter: PostgresAdapter,
  toolFilter: string | undefined,
  oauthConfig: OAuthConfig | undefined,
  options: CliOptions,
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
  });

  // ALWAYSS register components (tools, resources, prompts) regardless of transport
  mcpServer.registerComponents();

  // Build HTTP transport config
  const transportConfig: HttpTransportConfig = {
    port,
    host,
    publicPaths: oauthConfig?.publicPaths ?? ["/health", "/.well-known/*"],
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
      "OAuth 2.0 protected resource metadata available at /.well-known/oauth-protected-resource",
    );
  }
}

// List tools command
program
  .command("list-tools")
  .description("List all available tools")
  .option("--filter <filter>", "Apply tool filter")
  .option("--group <group>", "Filter by tool group")
  .action((options: ListToolsOptions) => {
    const adapter = new PostgresAdapter();
    const tools = adapter.getToolDefinitions();

    const filterConfig = parseToolFilter(options.filter);

    let filteredTools = tools;
    if (options.group) {
      filteredTools = tools.filter((t) => t.group === options.group);
    }

    filteredTools = filteredTools.filter((t) =>
      filterConfig.enabledTools.has(t.name),
    );

    // Use stderr for all output - stdout is reserved for MCP protocol
    console.error(
      `\nPostgreSQL MCP Tools (${String(filteredTools.length)}/${String(tools.length)}):\n`,
    );

    // Group by category
    const grouped = new Map<string, typeof tools>();
    for (const tool of filteredTools) {
      const groupTools = grouped.get(tool.group) ?? [];
      groupTools.push(tool);
      grouped.set(tool.group, groupTools);
    }

    for (const [group, groupTools] of grouped) {
      console.error(`[${group}] (${String(groupTools.length)})`);
      for (const tool of groupTools) {
        const desc = tool.description.split(".")[0] ?? "";
        console.error(`  - ${tool.name}: ${desc}`);
      }
      console.error("");
    }
  });

// Print tool count
program
  .command("info")
  .description("Show server information")
  .action(() => {
    const adapter = new PostgresAdapter();
    const tools = adapter.getToolDefinitions();
    const resources = adapter.getResourceDefinitions();
    const prompts = adapter.getPromptDefinitions();
    const groups = adapter.getSupportedToolGroups();

    // Use stderr for all output - stdout is reserved for MCP protocol
    console.error("\nPostgreSQL MCP Server");
    console.error("=====================");
    console.error(`Version: ${VERSION}`);
    console.error(`Tools: ${String(tools.length)}`);
    console.error(`Resources: ${String(resources.length)}`);
    console.error(`Prompts: ${String(prompts.length)}`);
    console.error(`Tool Groups: ${groups.join(", ")}`);
    console.error("\nTransports: stdio (default), http, sse");
    console.error("OAuth 2.0: Supported (RFC 9728/8414)");
    console.error("\nCapabilities:");
    const caps = adapter.getCapabilities();
    for (const [cap, enabled] of Object.entries(caps)) {
      console.error(`  ${cap}: ${enabled ? "✓" : "✗"}`);
    }
  });

program.parse();
