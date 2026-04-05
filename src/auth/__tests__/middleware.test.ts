/**
 * postgres-mcp - OAuth Middleware Tests
 *
 * Tests for authentication middleware, bearer token extraction,
 * scope validation, and error formatting.
 */

import { describe, it, expect, vi } from "vitest";
import {
  extractBearerToken,
  createAuthContext,
  validateAuth,
  requireScope,
  requireAnyScope,
  requireToolScope,
  formatOAuthError,
  type AuthenticatedContext,
} from "../middleware.js";
import {
  TokenMissingError,
  InvalidTokenError,
  InsufficientScopeError,
} from "../errors.js";
import type { TokenValidator } from "../token-validator.js";
import type { TokenValidationResult } from "../types.js";

// Mock token validator
function createMockTokenValidator(
  result: TokenValidationResult,
): TokenValidator {
  return {
    validate: vi.fn().mockResolvedValue(result),
    invalidateCache: vi.fn(),
  } as unknown as TokenValidator;
}

describe("OAuth Middleware", () => {
  describe("extractBearerToken", () => {
    it("should extract token from valid Bearer header", () => {
      const token = extractBearerToken("Bearer abc123xyz");
      expect(token).toBe("abc123xyz");
    });

    it("should return null for missing header", () => {
      expect(extractBearerToken(undefined)).toBeNull();
    });

    it("should return null for empty header", () => {
      expect(extractBearerToken("")).toBeNull();
    });

    it("should return null for non-Bearer header", () => {
      expect(extractBearerToken("Basic abc123")).toBeNull();
    });

    it("should handle case-insensitive Bearer prefix", () => {
      const token = extractBearerToken("bearer abc123xyz");
      expect(token).toBe("abc123xyz");
    });

    it("should return null for malformed header (missing token)", () => {
      // 'Bearer ' splits into ["Bearer", ""] — empty after trim → null
      expect(extractBearerToken("Bearer ")).toBeNull();
    });

    it("should return null for malformed header (extra parts)", () => {
      // 'Bearer token extra' splits into 3 parts, so returns null
      expect(extractBearerToken("Bearer token extra")).toBeNull();
    });
  });

  describe("createAuthContext", () => {
    it("should return unauthenticated context when no token", async () => {
      const mockValidator = createMockTokenValidator({ valid: true });
      const context = await createAuthContext(undefined, mockValidator);

      expect(context.authenticated).toBe(false);
      expect(context.scopes).toEqual([]);
      expect(context.claims).toBeUndefined();
    });

    it("should return authenticated context with valid token", async () => {
      const mockValidator = createMockTokenValidator({
        valid: true,
        claims: {
          sub: "user123",
          scopes: ["read", "write"],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
        },
      });

      const context = await createAuthContext(
        "Bearer valid-token",
        mockValidator,
      );

      expect(context.authenticated).toBe(true);
      expect(context.scopes).toEqual(["read", "write"]);
      expect(context.claims?.sub).toBe("user123");
    });

    it("should return unauthenticated context with invalid token", async () => {
      const mockValidator = createMockTokenValidator({
        valid: false,
        error: "Invalid signature",
      });

      const context = await createAuthContext(
        "Bearer invalid-token",
        mockValidator,
      );

      expect(context.authenticated).toBe(false);
      expect(context.scopes).toEqual([]);
    });
  });

  describe("validateAuth", () => {
    it("should throw TokenMissingError when required and no token", async () => {
      const mockValidator = createMockTokenValidator({ valid: true });

      await expect(
        validateAuth(undefined, {
          tokenValidator: mockValidator,
          required: true,
        }),
      ).rejects.toThrow(TokenMissingError);
    });

    it("should return unauthenticated when not required and no token", async () => {
      const mockValidator = createMockTokenValidator({ valid: true });

      const context = await validateAuth(undefined, {
        tokenValidator: mockValidator,
        required: false,
      });

      expect(context.authenticated).toBe(false);
    });

    it("should throw InvalidTokenError for invalid tokens", async () => {
      const mockValidator = createMockTokenValidator({
        valid: false,
        error: "Token expired",
      });

      await expect(
        validateAuth("Bearer expired-token", {
          tokenValidator: mockValidator,
          required: true,
        }),
      ).rejects.toThrow(InvalidTokenError);
    });

    it("should throw InsufficientScopeError when missing required scopes", async () => {
      const mockValidator = createMockTokenValidator({
        valid: true,
        claims: {
          sub: "user123",
          scopes: ["read"],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
        },
      });

      await expect(
        validateAuth("Bearer token", {
          tokenValidator: mockValidator,
          required: true,
          requiredScopes: ["admin"],
        }),
      ).rejects.toThrow(InsufficientScopeError);
    });

    it("should succeed when token has required scope", async () => {
      const mockValidator = createMockTokenValidator({
        valid: true,
        claims: {
          sub: "user123",
          scopes: ["admin"],
          exp: Date.now() / 1000 + 3600,
          iat: Date.now() / 1000,
        },
      });

      const context = await validateAuth("Bearer token", {
        tokenValidator: mockValidator,
        required: true,
        requiredScopes: ["admin"],
      });

      expect(context.authenticated).toBe(true);
      expect(context.scopes).toContain("admin");
    });
  });

  describe("requireScope", () => {
    const authenticatedContext: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user123",
        scopes: ["read", "write"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["read", "write"],
    };

    const unauthenticatedContext: AuthenticatedContext = {
      authenticated: false,
      scopes: [],
    };

    it("should pass when scope is present", () => {
      expect(() => requireScope(authenticatedContext, "read")).not.toThrow();
    });

    it("should throw InsufficientScopeError when scope missing", () => {
      expect(() => requireScope(authenticatedContext, "admin")).toThrow(
        InsufficientScopeError,
      );
    });

    it("should throw TokenMissingError when not authenticated", () => {
      expect(() => requireScope(unauthenticatedContext, "read")).toThrow(
        TokenMissingError,
      );
    });
  });

  describe("requireAnyScope", () => {
    const context: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user123",
        scopes: ["read"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["read"],
    };

    it("should pass when any scope matches", () => {
      expect(() => requireAnyScope(context, ["read", "write"])).not.toThrow();
    });

    it("should throw when no scopes match", () => {
      expect(() => requireAnyScope(context, ["admin", "write"])).toThrow(
        InsufficientScopeError,
      );
    });

    it("should throw TokenMissingError when not authenticated (line 140)", () => {
      const unauthenticatedContext: AuthenticatedContext = {
        authenticated: false,
        scopes: [],
      };
      expect(() => requireAnyScope(unauthenticatedContext, ["read"])).toThrow(
        TokenMissingError,
      );
    });
  });

  describe("requireToolScope", () => {
    const readContext: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user123",
        scopes: ["read"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["read"],
    };

    const writeContext: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user123",
        scopes: ["write"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["write"],
    };

    const customScopeContext: AuthenticatedContext = {
      authenticated: true,
      claims: {
        sub: "user123",
        scopes: ["db:production", "schema:public"],
        exp: Date.now() / 1000 + 3600,
        iat: Date.now() / 1000,
      },
      scopes: ["db:production", "schema:public"],
    };

    it("should map tool scope names to OAuth scopes", () => {
      expect(() => requireToolScope(readContext, ["read"])).not.toThrow();
    });

    it("should throw for missing tool scopes", () => {
      expect(() => requireToolScope(readContext, ["admin"])).toThrow(
        InsufficientScopeError,
      );
    });

    it("should throw TokenMissingError when not authenticated (line 153)", () => {
      const unauthenticatedContext: AuthenticatedContext = {
        authenticated: false,
        scopes: [],
      };
      expect(() => requireToolScope(unauthenticatedContext, ["read"])).toThrow(
        TokenMissingError,
      );
    });

    it('should map "write" scope correctly (line 160)', () => {
      expect(() => requireToolScope(writeContext, ["write"])).not.toThrow();
    });

    it("should pass custom/unknown scopes through unchanged (line 162)", () => {
      expect(() =>
        requireToolScope(customScopeContext, ["db:production"]),
      ).not.toThrow();
      expect(() =>
        requireToolScope(customScopeContext, ["schema:public"]),
      ).not.toThrow();
    });

    it("should throw for custom scopes not present", () => {
      expect(() =>
        requireToolScope(customScopeContext, ["db:staging"]),
      ).toThrow(InsufficientScopeError);
    });
  });

  describe("formatOAuthError", () => {
    it("should format TokenMissingError as 401", () => {
      const error = new TokenMissingError();
      const { status, body } = formatOAuthError(error);

      expect(status).toBe(401);
      expect(body).toHaveProperty("error", "invalid_token");
    });

    it("should format InvalidTokenError as 401", () => {
      const error = new InvalidTokenError("Token is malformed");
      const { status, body } = formatOAuthError(error);

      expect(status).toBe(401);
      expect(body).toHaveProperty("error", "invalid_token");
      expect(body).toHaveProperty("error_description", "Token is malformed");
    });

    it("should format InsufficientScopeError as 403", () => {
      const error = new InsufficientScopeError(["admin", "write"]);
      const { status, body } = formatOAuthError(error);

      expect(status).toBe(403);
      expect(body).toHaveProperty("error", "insufficient_scope");
      expect(body).toHaveProperty("scope", "admin write");
    });

    it("should format unknown errors as 500", () => {
      const error = new Error("Something unexpected");
      const { status, body } = formatOAuthError(error);

      expect(status).toBe(500);
      expect(body).toHaveProperty("error", "server_error");
    });
  });
});
