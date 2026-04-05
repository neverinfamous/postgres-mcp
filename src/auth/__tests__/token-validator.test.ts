/**
 * postgres-mcp - Token Validator Tests
 *
 * Tests for JWT token validation with JWKS support.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TokenValidator, createTokenValidator } from "../token-validator.js";

// Mock jose module
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => {
    return () => Promise.resolve({ type: "remote" });
  }),
  errors: {
    JWTExpired: class JWTExpired extends Error {
      constructor(message = "jwt expired", _claim?: string, _reason?: string) {
        super(message);
        this.name = "JWTExpired";
      }
    },
    JWSSignatureVerificationFailed: class JWSSignatureVerificationFailed extends Error {
      constructor(message = "signature verification failed", _cause?: Error) {
        super(message);
        this.name = "JWSSignatureVerificationFailed";
      }
    },
    JWTClaimValidationFailed: class JWTClaimValidationFailed extends Error {
      constructor(
        message = "claim validation failed",
        _claim?: string,
        _reason?: string,
      ) {
        super(message);
        this.name = "JWTClaimValidationFailed";
      }
    },
  },
}));

// Import after mock
const jose = await import("jose");

describe("TokenValidator", () => {
  const defaultConfig = {
    jwksUri:
      "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/certs",
    issuer: "http://localhost:8080/realms/postgres-mcp",
    audience: "postgres-mcp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with default config values", () => {
      const validator = new TokenValidator(defaultConfig);
      expect(validator).toBeInstanceOf(TokenValidator);
    });

    it("should accept custom config values", () => {
      const validator = new TokenValidator({
        ...defaultConfig,
        clockTolerance: 120,
        jwksCacheTtl: 7200,
        algorithms: ["RS256"],
      });
      expect(validator).toBeInstanceOf(TokenValidator);
    });
  });

  describe("validate", () => {
    it("should return valid result for valid token", async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "user123",
          scope: "read write",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          iss: "http://localhost:8080/realms/postgres-mcp",
          aud: "postgres-mcp",
        },
        protectedHeader: { alg: "RS256" },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("valid.jwt.token");

      expect(result.valid).toBe(true);
      expect(result.claims?.sub).toBe("user123");
      expect(result.claims?.scopes).toEqual(["read", "write"]);
    });

    it("should handle tokens without scope claim", async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        },
        protectedHeader: { alg: "RS256" },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("token.without.scope");

      expect(result.valid).toBe(true);
      expect(result.claims?.scopes).toEqual([]);
    });

    it("should return TOKEN_EXPIRED error for expired tokens", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
        new jose.errors.JWTExpired("jwt expired", { exp: 0 }, "exp"),
      );

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("expired.jwt.token");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("TOKEN_EXPIRED");
    });

    it("should return INVALID_SIGNATURE for bad signatures", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
        new jose.errors.JWSSignatureVerificationFailed(
          "signature verification failed",
        ),
      );

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("bad.sig.token");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("INVALID_SIGNATURE");
    });

    it("should return INVALID_CLAIMS for claim validation failures", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
        new jose.errors.JWTClaimValidationFailed(
          "claim validation failed",
          { aud: "wrong" },
          "aud",
        ),
      );

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("wrong.claims.token");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("INVALID_CLAIMS");
    });

    it("should return INVALID_TOKEN for generic errors", async () => {
      vi.mocked(jose.jwtVerify).mockRejectedValueOnce(
        new Error("Unknown error"),
      );

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("malformed.token");

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("INVALID_TOKEN");
    });

    it("should extract client_id from payload", async () => {
      vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
        payload: {
          sub: "user123",
          scope: "read",
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
          client_id: "my-client-app",
        },
        protectedHeader: { alg: "RS256" },
      } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

      const validator = new TokenValidator(defaultConfig);
      const result = await validator.validate("token.with.clientid");

      expect(result.claims?.client_id).toBe("my-client-app");
    });
  });

  describe("invalidateCache", () => {
    it("should clear the JWKS cache", () => {
      const validator = new TokenValidator(defaultConfig);
      // This should not throw
      expect(() => validator.invalidateCache()).not.toThrow();
    });
  });

  describe("createTokenValidator factory", () => {
    it("should create a TokenValidator instance", () => {
      const validator = createTokenValidator(defaultConfig);
      expect(validator).toBeInstanceOf(TokenValidator);
    });
  });
});

// =============================================================================
// Phase 4: TokenValidator Branch Coverage
// =============================================================================

describe("TokenValidator (Branch Coverage)", () => {
  const defaultConfig = {
    jwksUri:
      "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/certs",
    issuer: "http://localhost:8080/realms/postgres-mcp",
    audience: "postgres-mcp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use cached JWKS on second validation (line 81 cache hit)", async () => {
    // First validation - creates cache
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: {
        sub: "user1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      protectedHeader: { alg: "RS256" },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

    const validator = new TokenValidator(defaultConfig);

    // First call creates the cache
    await validator.validate("first.jwt.token");

    // Second call should hit the cache (line 81)
    await validator.validate("second.jwt.token");

    // createRemoteJWKSet should only be called once (cached on second call)
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(1);
  });

  it("should refresh JWKS cache after TTL expires (lines 80-87)", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValue({
      payload: {
        sub: "user1",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      protectedHeader: { alg: "RS256" },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

    // Create validator with very short TTL
    const validator = new TokenValidator({
      ...defaultConfig,
      jwksCacheTtl: 0, // 0 seconds - always expires
    });

    await validator.validate("token1");
    await validator.validate("token2");

    // With 0 TTL, cache always expires, so should create new JWKS set each time
    expect(jose.createRemoteJWKSet).toHaveBeenCalledTimes(2);
  });

  it("should handle non-Error exception in handleValidationError (line 129)", async () => {
    // Reject with a non-Error value (string)
    vi.mocked(jose.jwtVerify).mockRejectedValueOnce("string error" as unknown);

    const validator = new TokenValidator(defaultConfig);
    const result = await validator.validate("weird.error.token");

    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("INVALID_TOKEN");
    expect(result.error).toBe("Token validation failed"); // fallback message
  });

  it("should handle tokens with array scope claim", async () => {
    vi.mocked(jose.jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: "user123",
        scope: "admin write read", // space-separated scopes
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      },
      protectedHeader: { alg: "RS256" },
    } as unknown as Awaited<ReturnType<typeof jose.jwtVerify>>);

    const validator = new TokenValidator(defaultConfig);
    const result = await validator.validate("token.with.scopes");

    expect(result.claims?.scopes).toContain("admin");
    expect(result.claims?.scopes).toContain("write");
    expect(result.claims?.scopes).toContain("read");
  });
});
