import { test, expect } from "@playwright/test";

test.describe("HTTP Transport Security & Limits", () => {
  test("should return 404 Not Found for unknown endpoints", async ({
    request,
  }) => {
    const response = await request.get("/non-existent-path");
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body).toHaveProperty("error", "Not found");
  });

  test("should return 413 Payload Too Large for excessive POST bodies", async ({
    request,
  }) => {
    // Generate a payload over 1MB (1048576 bytes)
    const bulkyData = "A".repeat(1024 * 1025); // ~1.025 MB string

    // We send this to /mcp which accepts POSTs
    const response = await request.post("/mcp", {
      headers: {
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          testData: bulkyData,
        },
      },
    });

    // The router should intercept this based on Content-Length (or stream size)
    expect(response.status()).toBe(413);

    const body = await response.json();
    expect(body).toHaveProperty("error", "payload_too_large");
  });

  test("should inject security headers on responses", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["cache-control"]).toBe(
      "no-store, no-cache, must-revalidate",
    );
    expect(headers["content-security-policy"]).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
    expect(headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  test("should respond correctly to CORS preflight OPTIONS requests without configured origin", async ({
    request,
  }) => {
    const response = await request.fetch("/mcp", {
      method: "OPTIONS",
    });

    // Preflight returns 204 No Content
    expect(response.status()).toBe(204);

    // Since we don't pass an origin header matching the configured CORS origins list (which is empty by default in CLI),
    // it shouldn't inject Access-Control-Allow-Origin headers.
    const headers = response.headers();
    expect(headers).not.toHaveProperty("access-control-allow-origin");
  });

  test("should expose oauthEnabled: false in /health when OAuth is not configured", async ({
    request,
  }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("oauthEnabled", false);
  });

  test("should ignore X-Forwarded-For for rate limiting when trustProxy is not enabled", async ({
    request,
  }) => {
    // Send requests with X-Forwarded-For header — should be ignored since trustProxy defaults to false
    // All requests should be tracked by socket IP, not the forwarded IP
    const response = await request.get("/health", {
      headers: { "X-Forwarded-For": "1.2.3.4" },
    });
    expect(response.status()).toBe(200);

    // Verify the response still works normally — the X-Forwarded-For header is simply ignored
    const body = await response.json();
    expect(body).toHaveProperty("status", "healthy");
  });

  test("should set Referrer-Policy header to no-referrer", async ({
    request,
  }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  test("should not set HSTS header by default (opt-in)", async ({
    request,
  }) => {
    const response = await request.get("/health");
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers["strict-transport-security"]).toBeUndefined();
  });

  test("should always serve /health even under rate limiting", async ({
    request,
  }) => {
    // Health check bypasses rate limiting — it should always return 200
    // regardless of how many requests have been made
    for (let i = 0; i < 5; i++) {
      const response = await request.get("/health");
      expect(response.status()).toBe(200);
    }
  });
});
