/**
 * E2E Tests: OAuth 2.1 Discovery Endpoint
 *
 * Tests the RFC 9728 Protected Resource Metadata endpoint
 * (/.well-known/oauth-protected-resource) behavior with
 * and without OAuth enabled.
 *
 * Ported from db-mcp/tests/e2e/oauth-discovery.spec.ts — adapted for postgres-mcp.
 */

import { test, expect } from "@playwright/test";
import { startServer, stopServer } from "./helpers.js";

const OAUTH_PORT = 3106;

test.describe("OAuth 2.1 Discovery", () => {
  test.describe("Without OAuth enabled (default)", () => {
    test("/.well-known/oauth-protected-resource should return 404", async ({
      request,
    }) => {
      // Default webServer does not have OAuth enabled
      const response = await request.get(
        "/.well-known/oauth-protected-resource",
      );

      // Without OAuth, the endpoint should not be registered
      expect(response.status()).toBe(404);
    });
  });

  test.describe("With OAuth enabled", () => {
    test.beforeAll(async () => {
      await startServer(
        OAUTH_PORT,
        [
          "--oauth-enabled",
          "--oauth-issuer",
          "https://auth.example.com/realms/test",
          "--oauth-audience",
          "postgres-mcp-server",
          // Provide a JWKS URI so the server doesn't crash when issuer
          // discovery fails (the fake issuer is unreachable)
          "--oauth-jwks-uri",
          "https://auth.example.com/realms/test/protocol/openid-connect/certs",
        ],
        "oauth",
      );
    });

    test.afterAll(() => {
      stopServer(OAUTH_PORT);
    });

    test("/.well-known/oauth-protected-resource should return RFC 9728 metadata", async () => {
      const response = await fetch(
        `http://localhost:${OAUTH_PORT}/.well-known/oauth-protected-resource`,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;

      // RFC 9728 required fields
      expect(body).toHaveProperty("resource");
      expect(body).toHaveProperty("authorization_servers");
      expect(Array.isArray(body.authorization_servers)).toBe(true);
      expect((body.authorization_servers as string[]).length).toBeGreaterThan(
        0,
      );

      // Should include the issuer we configured
      expect(body.authorization_servers).toContain(
        "https://auth.example.com/realms/test",
      );
    });

    test("/.well-known/oauth-protected-resource should include scopes", async () => {
      const response = await fetch(
        `http://localhost:${OAUTH_PORT}/.well-known/oauth-protected-resource`,
      );

      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toHaveProperty("scopes_supported");
      expect(Array.isArray(body.scopes_supported)).toBe(true);

      // Should include the 3 scope levels
      const scopes = body.scopes_supported as string[];
      expect(scopes).toContain("read");
      expect(scopes).toContain("write");
      expect(scopes).toContain("admin");
    });

    test("MCP endpoints should require authentication with OAuth enabled", async () => {
      // POST to /mcp without a token should be rejected
      const response = await fetch(`http://localhost:${OAUTH_PORT}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "oauth-test", version: "1.0" },
          },
        }),
      });

      // Should be 401 (unauthorized) since no valid JWT is provided
      expect(response.status).toBe(401);
    });
  });
});
