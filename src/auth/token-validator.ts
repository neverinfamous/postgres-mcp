/**
 * postgres-mcp - Token Validator
 *
 * JWT token validation with JWKS support.
 */

import * as jose from "jose";
import type {
  TokenValidatorConfig,
  TokenValidationResult,
  TokenClaims,
} from "./types.js";
import { JwksFetchError } from "./errors.js";
import { parseScopes } from "./scopes.js";
import { logger } from "../utils/logger.js";

/**
 * JWT Token Validator with JWKS support
 */
export class TokenValidator {
  private readonly config: TokenValidatorConfig;
  private jwksCache: jose.JWTVerifyGetKey | null = null;
  private jwksCacheTime = 0;

  constructor(config: TokenValidatorConfig) {
    this.config = {
      ...config,
      clockTolerance: config.clockTolerance ?? 60,
      jwksCacheTtl: config.jwksCacheTtl ?? 3600,
      algorithms: config.algorithms ?? [
        "RS256",
        "RS384",
        "RS512",
        "ES256",
        "ES384",
        "ES512",
      ],
    };
  }

  /**
   * Validate a JWT token
   */
  async validate(token: string): Promise<TokenValidationResult> {
    try {
      // Get or refresh JWKS
      const jwks = this.getJWKS();

      // Build verification options
      const verifyOptions: jose.JWTVerifyOptions = {
        issuer: this.config.issuer,
        audience: this.config.audience,
      };
      if (this.config.clockTolerance !== undefined) {
        verifyOptions.clockTolerance = this.config.clockTolerance;
      }

      // Verify the token
      const { payload } = await jose.jwtVerify(token, jwks, verifyOptions);

      // Extract claims
      const claims: TokenClaims = {
        sub: payload.sub ?? "",
        scopes: parseScopes(payload["scope"] as string | undefined),
        exp: payload.exp ?? 0,
        iat: payload.iat ?? 0,
        iss: payload.iss,
        aud: payload.aud,
        nbf: payload.nbf,
        jti: payload.jti,
        client_id: payload["client_id"] as string | undefined,
      };

      logger.debug("Token validated successfully", { sub: claims.sub });

      return { valid: true, claims };
    } catch (error) {
      return this.handleValidationError(error);
    }
  }

  /**
   * Get or refresh JWKS cache
   */
  private getJWKS(): jose.JWTVerifyGetKey {
    const now = Date.now();
    const cacheTtlMs = (this.config.jwksCacheTtl ?? 3600) * 1000;

    // Check if cache is still valid
    if (this.jwksCache && now - this.jwksCacheTime < cacheTtlMs) {
      return this.jwksCache;
    }

    try {
      // Create new JWKS remote key set
      this.jwksCache = jose.createRemoteJWKSet(new URL(this.config.jwksUri));
      this.jwksCacheTime = now;

      logger.debug("JWKS cache refreshed", { uri: this.config.jwksUri });

      return this.jwksCache;
    } catch (error) {
      logger.error("Failed to fetch JWKS", {
        uri: this.config.jwksUri,
        error: String(error),
      });
      throw new JwksFetchError(
        `Failed to fetch JWKS from ${this.config.jwksUri}`,
      );
    }
  }

  /**
   * Handle validation errors
   */
  private handleValidationError(error: unknown): TokenValidationResult {
    if (error instanceof jose.errors.JWTExpired) {
      return {
        valid: false,
        error: "Token has expired",
        errorCode: "TOKEN_EXPIRED",
      };
    }

    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return {
        valid: false,
        error: "Invalid token signature",
        errorCode: "INVALID_SIGNATURE",
      };
    }

    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      return {
        valid: false,
        error: `Claim validation failed: ${error.message}`,
        errorCode: "INVALID_CLAIMS",
      };
    }

    // Generic error
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Token validation failed",
      errorCode: "INVALID_TOKEN",
    };
  }

  /**
   * Invalidate JWKS cache (for testing or forced refresh)
   */
  invalidateCache(): void {
    this.jwksCache = null;
    this.jwksCacheTime = 0;
  }
}

/**
 * Create a token validator instance
 */
export function createTokenValidator(
  config: TokenValidatorConfig,
): TokenValidator {
  return new TokenValidator(config);
}
