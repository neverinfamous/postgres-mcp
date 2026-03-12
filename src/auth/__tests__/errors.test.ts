/**
 * postgres-mcp - OAuth Errors Tests
 *
 * Tests for OAuth error classes, inheritance, error codes, and HTTP status codes.
 */

import { describe, it, expect } from "vitest";
import {
  OAuthError,
  TokenMissingError,
  InvalidTokenError,
  TokenExpiredError,
  InvalidSignatureError,
  InsufficientScopeError,
  AuthServerDiscoveryError,
  JwksFetchError,
  ClientRegistrationError,
} from "../errors.js";

describe("OAuth Errors", () => {
  describe("OAuthError (base class)", () => {
    it("should create an error with message, code, and default status", () => {
      const error = new OAuthError("Test error", "TEST_CODE");

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("AUTH_TEST_CODE");
      expect(error.httpStatus).toBe(401);
      expect(error.name).toBe("OAuthError");
    });

    it("should accept custom HTTP status", () => {
      const error = new OAuthError("Server error", "SERVER_ERROR", 500);

      expect(error.code).toBe("AUTH_SERVER_ERROR");

      expect(error.httpStatus).toBe(500);
    });

    it("should be an instance of Error", () => {
      const error = new OAuthError("Test", "TEST");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OAuthError);
    });
  });

  describe("TokenMissingError", () => {
    it("should use default message", () => {
      const error = new TokenMissingError();

      expect(error.message).toBe("No bearer token provided");
      expect(error.code).toBe("AUTH_TOKEN_MISSING");
      expect(error.httpStatus).toBe(401);
      expect(error.name).toBe("TokenMissingError");
    });

    it("should accept custom message", () => {
      const error = new TokenMissingError("Authorization header required");

      expect(error.message).toBe("Authorization header required");
    });

    it("should inherit from OAuthError", () => {
      const error = new TokenMissingError();

      expect(error).toBeInstanceOf(OAuthError);
      expect(error).toBeInstanceOf(TokenMissingError);
    });
  });

  describe("InvalidTokenError", () => {
    it("should use default message", () => {
      const error = new InvalidTokenError();

      expect(error.message).toBe("Invalid access token");
      expect(error.code).toBe("AUTH_INVALID_TOKEN");
      expect(error.httpStatus).toBe(401);
      expect(error.name).toBe("InvalidTokenError");
    });

    it("should accept custom message", () => {
      const error = new InvalidTokenError(
        "Token signature verification failed",
      );

      expect(error.message).toBe("Token signature verification failed");
    });
  });

  describe("TokenExpiredError", () => {
    it("should use default message", () => {
      const error = new TokenExpiredError();

      expect(error.message).toBe("Access token has expired");
      expect(error.code).toBe("AUTH_TOKEN_EXPIRED");
      expect(error.httpStatus).toBe(401);
      expect(error.name).toBe("TokenExpiredError");
    });
  });

  describe("InvalidSignatureError", () => {
    it("should use default message", () => {
      const error = new InvalidSignatureError();

      expect(error.message).toBe("Invalid token signature");
      expect(error.code).toBe("AUTH_INVALID_SIGNATURE");
      expect(error.httpStatus).toBe(401);
      expect(error.name).toBe("InvalidSignatureError");
    });
  });

  describe("InsufficientScopeError", () => {
    it("should include required scopes in message", () => {
      const error = new InsufficientScopeError(["read", "write"]);

      expect(error.message).toBe("Insufficient scope. Required: read, write");
      expect(error.code).toBe("AUTH_INSUFFICIENT_SCOPE");
      expect(error.httpStatus).toBe(403); // 403 Forbidden, not 401
      expect(error.requiredScopes).toEqual(["read", "write"]);
      expect(error.name).toBe("InsufficientScopeError");
    });

    it("should accept custom message", () => {
      const error = new InsufficientScopeError(
        ["admin"],
        "Admin access required",
      );

      expect(error.message).toBe("Admin access required");
      expect(error.requiredScopes).toEqual(["admin"]);
    });

    it("should handle single scope", () => {
      const error = new InsufficientScopeError(["read"]);

      expect(error.message).toBe("Insufficient scope. Required: read");
      expect(error.requiredScopes).toEqual(["read"]);
    });

    it("should handle empty scopes array", () => {
      const error = new InsufficientScopeError([]);

      expect(error.message).toBe("Insufficient scope. Required: ");
      expect(error.requiredScopes).toEqual([]);
    });
  });

  describe("AuthServerDiscoveryError", () => {
    it("should use default message", () => {
      const error = new AuthServerDiscoveryError();

      expect(error.message).toBe(
        "Failed to discover authorization server metadata",
      );
      expect(error.code).toBe("AUTH_DISCOVERY_FAILED");
      expect(error.httpStatus).toBe(500); // Server error
      expect(error.name).toBe("AuthServerDiscoveryError");
    });

    it("should accept custom message with server details", () => {
      const error = new AuthServerDiscoveryError(
        "Connection refused to http://localhost:8080",
      );

      expect(error.message).toBe("Connection refused to http://localhost:8080");
    });
  });

  describe("JwksFetchError", () => {
    it("should use default message", () => {
      const error = new JwksFetchError();

      expect(error.message).toBe("Failed to fetch JWKS");
      expect(error.code).toBe("AUTH_JWKS_FETCH_FAILED");
      expect(error.httpStatus).toBe(500);
      expect(error.name).toBe("JwksFetchError");
    });

    it("should accept custom message with URI", () => {
      const error = new JwksFetchError(
        "Failed to fetch JWKS from https://auth.example.com/jwks",
      );

      expect(error.message).toBe(
        "Failed to fetch JWKS from https://auth.example.com/jwks",
      );
    });
  });

  describe("ClientRegistrationError", () => {
    it("should use default message", () => {
      const error = new ClientRegistrationError();

      expect(error.message).toBe("Client registration failed");
      expect(error.code).toBe("AUTH_REGISTRATION_FAILED");
      expect(error.httpStatus).toBe(400); // Bad Request
      expect(error.name).toBe("ClientRegistrationError");
    });
  });

  describe("Error inheritance chain", () => {
    it("all errors should be catchable as OAuthError", () => {
      const errors = [
        new TokenMissingError(),
        new InvalidTokenError(),
        new TokenExpiredError(),
        new InvalidSignatureError(),
        new InsufficientScopeError(["test"]),
        new AuthServerDiscoveryError(),
        new JwksFetchError(),
        new ClientRegistrationError(),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(OAuthError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it("all errors should have stack trace", () => {
      const error = new TokenMissingError();

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("TokenMissingError");
    });
  });
});
