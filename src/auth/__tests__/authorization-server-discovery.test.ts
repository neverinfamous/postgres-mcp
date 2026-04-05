/**
 * postgres-mcp - Authorization Server Discovery Tests
 *
 * Tests for RFC 8414 Authorization Server Metadata discovery.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AuthorizationServerDiscovery,
  createAuthServerDiscovery,
} from "../authorization-server-discovery.js";
import { AuthServerDiscoveryError } from "../errors.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("AuthorizationServerDiscovery", () => {
  const defaultConfig = {
    authServerUrl: "http://localhost:8080/realms/postgres-mcp",
  };

  const validMetadata = {
    issuer: "http://localhost:8080/realms/postgres-mcp",
    token_endpoint:
      "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/token",
    jwks_uri:
      "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/certs",
    authorization_endpoint:
      "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/auth",
    registration_endpoint:
      "http://localhost:8080/realms/postgres-mcp/clients-registrations/openid-connect",
    grant_types_supported: [
      "authorization_code",
      "client_credentials",
      "refresh_token",
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("discover", () => {
    it("should fetch and return authorization server metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      const metadata = await discovery.discover();

      expect(metadata.issuer).toBe("http://localhost:8080/realms/postgres-mcp");
      expect(metadata.token_endpoint).toBeDefined();
      expect(metadata.jwks_uri).toBeDefined();
    });

    it("should use the correct well-known URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      await discovery.discover();

      // Just verify correct URL is called - implementation details like signal/headers may vary
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0] as [string, unknown];
      expect(url).toBe(
        "http://localhost:8080/realms/postgres-mcp/.well-known/oauth-authorization-server",
      );
    });

    it("should cache metadata for subsequent calls", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      // First call
      await discovery.discover();
      // Second call - should use cache
      await discovery.discover();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("should throw error for HTTP failures", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      await expect(discovery.discover()).rejects.toThrow(
        AuthServerDiscoveryError,
      );
    });

    it("should throw error for network failures", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      await expect(discovery.discover()).rejects.toThrow(
        AuthServerDiscoveryError,
      );
    });

    it("should throw error for invalid metadata (missing issuer)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token_endpoint: "something" }),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      await expect(discovery.discover()).rejects.toThrow(
        AuthServerDiscoveryError,
      );
    });

    it("should throw error for invalid metadata (missing token_endpoint)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issuer: "something" }),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      await expect(discovery.discover()).rejects.toThrow(
        AuthServerDiscoveryError,
      );
    });
  });

  describe("getJwksUri", () => {
    it("should return JWKS URI from metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      const uri = await discovery.getJwksUri();

      expect(uri).toBe(
        "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/certs",
      );
    });

    it("should throw when metadata has no jwks_uri", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            issuer: validMetadata.issuer,
            token_endpoint: validMetadata.token_endpoint,
            // No jwks_uri
          }),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      await expect(discovery.getJwksUri()).rejects.toThrow(
        AuthServerDiscoveryError,
      );
    });
  });

  describe("getTokenEndpoint", () => {
    it("should return token endpoint from metadata", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      const endpoint = await discovery.getTokenEndpoint();

      expect(endpoint).toBe(
        "http://localhost:8080/realms/postgres-mcp/protocol/openid-connect/token",
      );
    });
  });

  describe("getRegistrationEndpoint", () => {
    it("should return registration endpoint when available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      const endpoint = await discovery.getRegistrationEndpoint();

      expect(endpoint).toBeDefined();
    });

    it("should return undefined when not available", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            issuer: validMetadata.issuer,
            token_endpoint: validMetadata.token_endpoint,
          }),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      const endpoint = await discovery.getRegistrationEndpoint();

      expect(endpoint).toBeUndefined();
    });
  });

  describe("supportsGrantType", () => {
    it("should return true for supported grant types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      expect(await discovery.supportsGrantType("client_credentials")).toBe(
        true,
      );
      expect(await discovery.supportsGrantType("authorization_code")).toBe(
        true,
      );
    });

    it("should return false for unsupported grant types", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      await discovery.discover(); // Prime the cache

      mockFetch.mockClear();

      expect(await discovery.supportsGrantType("implicit")).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled(); // Uses cache
    });

    it("should return false when grant_types_supported is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            issuer: validMetadata.issuer,
            token_endpoint: validMetadata.token_endpoint,
          }),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);
      expect(await discovery.supportsGrantType("client_credentials")).toBe(
        false,
      );
    });
  });

  describe("invalidateCache", () => {
    it("should clear the metadata cache", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validMetadata),
      });

      const discovery = new AuthorizationServerDiscovery(defaultConfig);

      // First call
      await discovery.discover();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Invalidate
      discovery.invalidateCache();

      // Second call - should fetch again
      await discovery.discover();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("createAuthServerDiscovery factory", () => {
    it("should create an AuthorizationServerDiscovery instance", () => {
      const discovery = createAuthServerDiscovery(defaultConfig);
      expect(discovery).toBeInstanceOf(AuthorizationServerDiscovery);
    });
  });
});
