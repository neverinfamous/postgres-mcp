/**
 * postgres-mcp - CLI Arguments Parser (Test-Only)
 *
 * Standalone (non-Commander) argument parser used exclusively by unit tests.
 * The production entry point is `cli.ts` which uses Commander.js.
 */

import type {
  TransportType,
  DatabaseConfig,
  OAuthConfig,
} from "../types/index.js";

/**
 * Parsed CLI configuration
 */
export interface ParsedArgs {
  /** Server transport type */
  transport: TransportType;

  /** HTTP port (for http/sse transports) */
  port?: number;

  /** Server bind host (for http/sse transports) */
  serverHost?: string;

  /** Database configuration */
  database?: DatabaseConfig;

  /** OAuth configuration */
  oauth?: OAuthConfig;

  /** Tool filter string */
  toolFilter?: string;

  /** Log level */
  logLevel?:
    | "debug"
    | "info"
    | "notice"
    | "warning"
    | "error"
    | "critical"
    | "alert"
    | "emergency";

  /** Whether to exit after printing help/version */
  shouldExit: boolean;

  /** Audit log file path (enables audit logging when set) */
  auditLogPath?: string;

  /** Whether to redact tool arguments from audit entries */
  auditRedact?: boolean;
}

import { VERSION } from "../utils/version.js";

/**
 * Parse command line arguments
 */
export function parseArgs(argv: string[] = process.argv.slice(2)): ParsedArgs {
  const result: ParsedArgs = {
    transport: "stdio",
    shouldExit: false,
  };

  // OAuth config accumulator
  let oauthEnabled = false;
  let oauthIssuer: string | undefined;
  let oauthAudience: string | undefined;
  let oauthJwksUri: string | undefined;
  let oauthClockTolerance: number | undefined;

  // Database config accumulator
  let pgConnectionString: string | undefined;
  let pgHost: string | undefined;
  let pgPort: number | undefined;
  let pgUser: string | undefined;
  let pgPassword: string | undefined;
  let pgDatabase: string | undefined;
  let pgSsl = false;
  let poolMax: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const nextArg = argv[i + 1];

    switch (arg) {
      // Transport options
      case "--transport":
      case "-t":
        if (nextArg && !nextArg.startsWith("-")) {
          result.transport = nextArg as TransportType;
          i++;
        }
        break;

      case "--port":
      case "-p":
        if (nextArg && !nextArg.startsWith("-")) {
          result.port = parseInt(nextArg, 10);
          i++;
        }
        break;

      case "--server-host":
        if (nextArg && !nextArg.startsWith("-")) {
          result.serverHost = nextArg;
          i++;
        }
        break;

      // PostgreSQL connection options
      case "--postgres":
        if (nextArg && !nextArg.startsWith("-")) {
          pgConnectionString = nextArg;
          i++;
        }
        break;

      case "--host":
        if (nextArg && !nextArg.startsWith("-")) {
          pgHost = nextArg;
          i++;
        }
        break;

      case "--pg-port":
        if (nextArg && !nextArg.startsWith("-")) {
          pgPort = parseInt(nextArg, 10);
          i++;
        }
        break;

      case "--user":
        if (nextArg && !nextArg.startsWith("-")) {
          pgUser = nextArg;
          i++;
        }
        break;

      case "--password":
        if (nextArg && !nextArg.startsWith("-")) {
          pgPassword = nextArg;
          i++;
        }
        break;

      case "--database":
        if (nextArg && !nextArg.startsWith("-")) {
          pgDatabase = nextArg;
          i++;
        }
        break;

      case "--ssl":
        pgSsl = true;
        break;

      case "--pool-max":
        if (nextArg && !nextArg.startsWith("-")) {
          poolMax = parseInt(nextArg, 10);
          i++;
        }
        break;

      // Tool filter
      case "--tool-filter":
      case "-f":
        // Note: tool filter values can start with '-' (e.g., "-base,-extensions,+starter")
        if (nextArg !== undefined) {
          result.toolFilter = nextArg;
          i++;
        }
        break;

      // Log level
      case "--log-level":
        if (nextArg && !nextArg.startsWith("-")) {
          result.logLevel = nextArg as
            | "debug"
            | "info"
            | "notice"
            | "warning"
            | "error"
            | "critical"
            | "alert"
            | "emergency";
          i++;
        }
        break;

      // OAuth options
      case "--oauth-enabled":
      case "-o":
        oauthEnabled = true;
        break;

      case "--oauth-issuer":
        if (nextArg && !nextArg.startsWith("-")) {
          oauthIssuer = nextArg;
          i++;
        }
        break;

      case "--oauth-audience":
        if (nextArg && !nextArg.startsWith("-")) {
          oauthAudience = nextArg;
          i++;
        }
        break;

      case "--oauth-jwks-uri":
        if (nextArg && !nextArg.startsWith("-")) {
          oauthJwksUri = nextArg;
          i++;
        }
        break;

      case "--oauth-clock-tolerance":
        if (nextArg && !nextArg.startsWith("-")) {
          oauthClockTolerance = parseInt(nextArg, 10);
          i++;
        }
        break;

      // Help and version
      case "--version":
      case "-v":
        console.error(`postgres-mcp version ${VERSION}`);
        result.shouldExit = true;
        return result;

      case "--help":
      case "-h":
        printHelp();
        result.shouldExit = true;
        return result;

      default:
        // Audit options (placed before default fallthrough)
        if (arg === "--audit-log") {
          if (nextArg && !nextArg.startsWith("-")) {
            result.auditLogPath = nextArg;
            i++;
          }
          break;
        }
        if (arg === "--audit-redact") {
          result.auditRedact = true;
          break;
        }
        if (arg?.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  // Build database config from connection string or individual params
  if (pgConnectionString) {
    result.database = parseConnectionString(pgConnectionString, poolMax);
  } else {
    // Check individual params or environment variables
    const host =
      pgHost ?? process.env["PGHOST"] ?? process.env["POSTGRES_HOST"];
    const port =
      pgPort ??
      parseInt(
        process.env["PGPORT"] ?? process.env["POSTGRES_PORT"] ?? "5432",
        10,
      );
    const user =
      pgUser ?? process.env["PGUSER"] ?? process.env["POSTGRES_USER"];
    const password =
      pgPassword ??
      process.env["PGPASSWORD"] ??
      process.env["POSTGRES_PASSWORD"];
    const database =
      pgDatabase ??
      process.env["PGDATABASE"] ??
      process.env["POSTGRES_DATABASE"];

    if (host || user || database) {
      const dbConfig: DatabaseConfig = {
        type: "postgresql",
        host: host ?? "localhost",
        port,
        username: user ?? "postgres",
        database: database ?? "postgres",
      };
      if (password) dbConfig.password = password;
      if (poolMax !== undefined && poolMax > 0)
        dbConfig.pool = { max: poolMax };
      if (pgSsl) dbConfig.options = { ssl: true };
      result.database = dbConfig;
    }
  }

  // Check for tool filter in environment
  const envToolFilter =
    process.env["POSTGRES_TOOL_FILTER"] ?? process.env["MCP_TOOL_FILTER"];
  if (envToolFilter) {
    result.toolFilter ??= envToolFilter;
  }

  // Check for log level in environment
  if (!result.logLevel && process.env["LOG_LEVEL"]) {
    result.logLevel = process.env["LOG_LEVEL"] as
      | "debug"
      | "info"
      | "notice"
      | "warning"
      | "error"
      | "critical"
      | "alert"
      | "emergency";
  }

  // Check for server host in environment
  if (!result.serverHost) {
    const envHost = process.env["MCP_HOST"] ?? process.env["HOST"];
    if (envHost) {
      result.serverHost = envHost;
    }
  }

  // Check OAuth environment variables
  if (!oauthEnabled && process.env["OAUTH_ENABLED"] === "true") {
    oauthEnabled = true;
  }
  oauthIssuer ??= process.env["OAUTH_ISSUER"];
  oauthAudience ??= process.env["OAUTH_AUDIENCE"];
  oauthJwksUri ??= process.env["OAUTH_JWKS_URI"];
  if (
    oauthClockTolerance === undefined &&
    process.env["OAUTH_CLOCK_TOLERANCE"]
  ) {
    oauthClockTolerance = parseInt(process.env["OAUTH_CLOCK_TOLERANCE"], 10);
  }

  // Build OAuth config if enabled
  if (oauthEnabled) {
    const oauth: OAuthConfig = {
      enabled: true,
    };
    if (oauthIssuer) oauth.authorizationServerUrl = oauthIssuer;
    if (oauthIssuer) oauth.issuer = oauthIssuer;
    if (oauthAudience) oauth.audience = oauthAudience;
    if (oauthJwksUri) oauth.jwksUri = oauthJwksUri;
    if (oauthClockTolerance !== undefined)
      oauth.clockTolerance = oauthClockTolerance;
    result.oauth = oauth;
  }

  return result;
}

/**
 * Parse PostgreSQL connection string
 */
function parseConnectionString(
  connectionString: string,
  poolMax?: number,
): DatabaseConfig {
  const url = new URL(connectionString);

  const config: DatabaseConfig = {
    type: "postgresql",
    host: url.hostname || "localhost",
    port: parseInt(url.port, 10) || 5432,
    username: url.username || "postgres",
    database: url.pathname.slice(1) || "postgres",
  };
  if (url.password) config.password = url.password;

  // Check for SSL in query params
  if (
    url.searchParams.get("ssl") === "true" ||
    url.searchParams.get("sslmode") === "require"
  ) {
    config.options = { ssl: true };
  }

  // Pool configuration
  if (poolMax !== undefined && poolMax > 0) {
    config.pool = { max: poolMax };
  }

  return config;
}

/**
 * Print help message
 */
export function printHelp(): void {
  console.error(`
postgres-mcp - PostgreSQL MCP Server

Usage: postgres-mcp [options]

Connection Options:
  --postgres <url>          PostgreSQL connection string
                            (postgres://user:pass@host:port/database)
  --host <host>             PostgreSQL host (default: localhost)
  --pg-port <port>          PostgreSQL port (default: 5432)
  --user <user>             PostgreSQL username (default: postgres)
  --password <pass>         PostgreSQL password
  --database <db>           PostgreSQL database name (default: postgres)
  --ssl                     Enable SSL connection
  --pool-max <n>            Maximum pool connections (default: 10)

Server Options:
  --transport, -t <type>    Transport type: stdio, http, sse (default: stdio)
  --port, -p <port>         HTTP port for http/sse transports (default: 3000)
  --server-host <host>      Server bind host for http/sse transports (default: localhost)
  --tool-filter, -f <str>   Tool filter string (e.g., "-base,-extensions,+starter")
  --log-level <level>       Log level: debug, info, notice, warning, error, critical, alert, emergency

OAuth Options:
  --oauth-enabled, -o       Enable OAuth 2.1 authentication
  --oauth-issuer <url>      Authorization server URL (issuer)
  --oauth-audience <aud>    Expected token audience
  --oauth-jwks-uri <url>    JWKS URI (auto-discovered from issuer if not set)
  --oauth-clock-tolerance   Clock tolerance in seconds (default: 60)

Other:
  --version, -v             Show version
  --help, -h                Show this help

Environment Variables:
  PGHOST, POSTGRES_HOST     PostgreSQL host
  PGPORT, POSTGRES_PORT     PostgreSQL port
  PGUSER, POSTGRES_USER     PostgreSQL username
  PGPASSWORD, POSTGRES_PASSWORD  PostgreSQL password
  PGDATABASE, POSTGRES_DATABASE  PostgreSQL database
  MCP_HOST, HOST            Server bind host (default: localhost)
  POSTGRES_TOOL_FILTER      Tool filter string
  LOG_LEVEL                 Log level (debug, info, notice, warning, error, critical, alert, emergency)
  OAUTH_ENABLED             Enable OAuth (true/false)
  OAUTH_ISSUER              Authorization server URL
  OAUTH_AUDIENCE            Expected token audience
  OAUTH_JWKS_URI            JWKS endpoint URL
  OAUTH_CLOCK_TOLERANCE     Clock tolerance in seconds

Audit Options:
  --audit-log <path>        Enable JSONL audit trail for write/admin tool calls
  --audit-redact            Omit tool arguments from audit entries

  AUDIT_LOG_PATH            Audit log file path
  AUDIT_REDACT              Redact audit args (true/false)
`);
}
