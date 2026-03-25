/**
 * postgres-mcp - CLI Configuration Builders
 *
 * Functions to build database and OAuth configuration
 * from CLI options and environment variables.
 */

import type { DatabaseConfig, OAuthConfig } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { AuthorizationServerDiscovery } from "../auth/index.js";

interface CliOptions {
  postgres?: string;
  host?: string;
  pgPort?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  poolMax?: number;
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthAudience?: string;
  oauthJwksUri?: string;
  oauthClockTolerance?: number;
}

/**
 * Build database configuration from CLI options and environment
 */
export function buildDatabaseConfig(options: CliOptions): DatabaseConfig {
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
export async function buildOAuthConfig(
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
    } catch (error: unknown) {
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
