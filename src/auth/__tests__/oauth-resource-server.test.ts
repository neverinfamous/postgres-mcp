/**
 * postgres-mcp - OAuth Resource Server Tests
 *
 * Tests for RFC 9728 Protected Resource Metadata implementation.
 */

import { describe, it, expect } from "vitest";
import {
  OAuthResourceServer,
  createOAuthResourceServer,
} from "../oauth-resource-server.js";

describe("OAuthResourceServer", () => {
  const defaultConfig = {
    resource: "http://localhost:3000",
    authorizationServers: ["http://localhost:8080/realms/postgres-mcp"],
    scopesSupported: ["read", "write", "admin"],
  };

  describe("constructor", () => {
    it("should create instance with provided config", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.getResourceId()).toBe("http://localhost:3000");
    });

    it("should default bearerMethodsSupported to header", () => {
      const server = new OAuthResourceServer(defaultConfig);
      const metadata = server.getMetadata();
      expect(metadata.bearer_methods_supported).toEqual(["header"]);
    });

    it("should use provided bearerMethodsSupported", () => {
      const server = new OAuthResourceServer({
        ...defaultConfig,
        bearerMethodsSupported: ["header", "body"],
      });
      const metadata = server.getMetadata();
      expect(metadata.bearer_methods_supported).toEqual(["header", "body"]);
    });
  });

  describe("getMetadata", () => {
    it("should return RFC 9728 compliant metadata", () => {
      const server = new OAuthResourceServer(defaultConfig);
      const metadata = server.getMetadata();

      expect(metadata.resource).toBe("http://localhost:3000");
      expect(metadata.authorization_servers).toEqual([
        "http://localhost:8080/realms/postgres-mcp",
      ]);
      expect(metadata.scopes_supported).toEqual(["read", "write", "admin"]);
      expect(metadata.resource_documentation).toBe(
        "http://localhost:3000/docs",
      );
      expect(metadata.resource_signing_alg_values_supported).toEqual([
        "RS256",
        "ES256",
      ]);
    });

    it("should include all required RFC 9728 fields", () => {
      const server = new OAuthResourceServer(defaultConfig);
      const metadata = server.getMetadata();

      // RFC 9728 required fields
      expect(metadata).toHaveProperty("resource");
      // RFC 9728 optional but important fields
      expect(metadata).toHaveProperty("authorization_servers");
      expect(metadata).toHaveProperty("scopes_supported");
    });
  });

  describe("getWellKnownPath", () => {
    it("should return the RFC 9728 well-known path", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.getWellKnownPath()).toBe(
        "/.well-known/oauth-protected-resource",
      );
    });
  });

  describe("isScopeSupported", () => {
    it("should return true for explicitly listed scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);

      expect(server.isScopeSupported("read")).toBe(true);
      expect(server.isScopeSupported("write")).toBe(true);
      expect(server.isScopeSupported("admin")).toBe(true);
    });

    it("should return false for unknown scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.isScopeSupported("unknown")).toBe(false);
    });

    it("should support PostgreSQL db: pattern scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.isScopeSupported("db:mydb")).toBe(true);
      expect(server.isScopeSupported("db:production")).toBe(true);
    });

    it("should support PostgreSQL schema: pattern scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.isScopeSupported("schema:public")).toBe(true);
      expect(server.isScopeSupported("schema:analytics")).toBe(true);
    });

    it("should support PostgreSQL table: pattern scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.isScopeSupported("table:public:users")).toBe(true);
      expect(server.isScopeSupported("table:schema:table_name")).toBe(true);
    });
  });

  describe("getResourceId", () => {
    it("should return the resource identifier", () => {
      const server = new OAuthResourceServer(defaultConfig);
      expect(server.getResourceId()).toBe("http://localhost:3000");
    });
  });

  describe("getSupportedScopes", () => {
    it("should return copy of supported scopes", () => {
      const server = new OAuthResourceServer(defaultConfig);
      const scopes = server.getSupportedScopes();

      expect(scopes).toEqual(["read", "write", "admin"]);
      // Verify it's a copy
      scopes.push("modified");
      expect(server.getSupportedScopes()).not.toContain("modified");
    });
  });

  describe("getAuthorizationServers", () => {
    it("should return copy of authorization servers", () => {
      const server = new OAuthResourceServer(defaultConfig);
      const servers = server.getAuthorizationServers();

      expect(servers).toEqual(["http://localhost:8080/realms/postgres-mcp"]);
      // Verify it's a copy
      servers.push("http://other-server");
      expect(server.getAuthorizationServers()).toHaveLength(1);
    });

    it("should support multiple authorization servers", () => {
      const server = new OAuthResourceServer({
        ...defaultConfig,
        authorizationServers: [
          "http://localhost:8080/realms/postgres-mcp",
          "http://backup-auth.example.com",
        ],
      });

      expect(server.getAuthorizationServers()).toHaveLength(2);
    });
  });

  describe("createOAuthResourceServer factory", () => {
    it("should create an OAuthResourceServer instance", () => {
      const server = createOAuthResourceServer(defaultConfig);
      expect(server).toBeInstanceOf(OAuthResourceServer);
      expect(server.getResourceId()).toBe("http://localhost:3000");
    });
  });
});
