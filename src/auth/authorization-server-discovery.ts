/**
 * postgres-mcp - Authorization Server Discovery
 *
 * RFC 8414 Authorization Server Metadata discovery.
 */

import type {
  AuthServerDiscoveryConfig,
  AuthorizationServerMetadata,
} from "./types.js";
import { AuthServerDiscoveryError } from "./errors.js";
import { logger } from "../utils/logger.js";

/**
 * Authorization Server Discovery (RFC 8414)
 */
export class AuthorizationServerDiscovery {
  private readonly config: AuthServerDiscoveryConfig;
  private metadataCache: AuthorizationServerMetadata | null = null;
  private cacheTime = 0;

  constructor(config: AuthServerDiscoveryConfig) {
    this.config = {
      ...config,
      cacheTtl: config.cacheTtl ?? 3600,
      timeout: config.timeout ?? 5000,
    };
  }

  /**
   * Discover authorization server metadata
   */
  async discover(): Promise<AuthorizationServerMetadata> {
    const now = Date.now();
    const cacheTtlMs = (this.config.cacheTtl ?? 3600) * 1000;

    // Check cache
    if (this.metadataCache && now - this.cacheTime < cacheTtlMs) {
      return this.metadataCache;
    }

    try {
      // RFC 8414: well-known endpoint - append to base URL path
      const baseUrl = this.config.authServerUrl.endsWith("/")
        ? this.config.authServerUrl.slice(0, -1)
        : this.config.authServerUrl;
      const wellKnownUrl = `${baseUrl}/.well-known/oauth-authorization-server`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.timeout);

      const response = await fetch(wellKnownUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status.toString()}: ${response.statusText}`,
        );
      }

      const metadata = (await response.json()) as AuthorizationServerMetadata;

      // Validate required fields
      if (!metadata.issuer || !metadata.token_endpoint) {
        throw new Error("Invalid metadata: missing required fields");
      }

      // Cache the metadata
      this.metadataCache = metadata;
      this.cacheTime = now;

      logger.debug("Auth server metadata discovered", {
        issuer: metadata.issuer,
      });

      return metadata;
    } catch (error) {
      logger.error("Auth server discovery failed", {
        url: this.config.authServerUrl,
        error: String(error),
      });
      throw new AuthServerDiscoveryError(
        `Failed to discover auth server at ${this.config.authServerUrl}: ${String(error)}`,
      );
    }
  }

  /**
   * Get JWKS URI from discovered metadata
   */
  async getJwksUri(): Promise<string> {
    const metadata = await this.discover();
    if (!metadata.jwks_uri) {
      throw new AuthServerDiscoveryError(
        "Auth server metadata does not include jwks_uri",
      );
    }
    return metadata.jwks_uri;
  }

  /**
   * Get token endpoint from discovered metadata
   */
  async getTokenEndpoint(): Promise<string> {
    const metadata = await this.discover();
    return metadata.token_endpoint;
  }

  /**
   * Get registration endpoint (if available)
   */
  async getRegistrationEndpoint(): Promise<string | undefined> {
    const metadata = await this.discover();
    return metadata.registration_endpoint;
  }

  /**
   * Check if auth server supports a specific grant type
   */
  async supportsGrantType(grantType: string): Promise<boolean> {
    const metadata = await this.discover();
    return metadata.grant_types_supported?.includes(grantType) ?? false;
  }

  /**
   * Invalidate cache
   */
  invalidateCache(): void {
    this.metadataCache = null;
    this.cacheTime = 0;
  }
}

/**
 * Create an authorization server discovery instance
 */
export function createAuthServerDiscovery(
  config: AuthServerDiscoveryConfig,
): AuthorizationServerDiscovery {
  return new AuthorizationServerDiscovery(config);
}
