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
});
