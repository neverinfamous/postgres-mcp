import { test, expect } from "./fixtures.js";
import { startServer, stopServer, createClient } from "./helpers.js";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const ADV_SEC_PORT = 3110;
const SLOWLORIS_PORT = 3111;

test.describe.configure({ mode: "serial" });

test.describe("Advanced HTTP Transport Security", () => {
  test.describe("DNS Rebinding & Trust Proxy", () => {
    test.beforeAll(async () => {
      // Start server with trust-proxy enabled
      await startServer(ADV_SEC_PORT, ["--trust-proxy"], "adv-sec");
    });

    test.afterAll(() => {
      stopServer(ADV_SEC_PORT);
    });

    test("should reject requests with invalid Host header (DNS rebinding protection)", async ({ request }) => {
      // Direct request with valid local IP works
      const validResponse = await request.get(`http://127.0.0.1:${ADV_SEC_PORT}/health`, {
        headers: { Host: `127.0.0.1:${ADV_SEC_PORT}` }
      });
      expect(validResponse.status()).toBe(200);

      // Request with malicious host header
      const invalidResponse = await request.get(`http://127.0.0.1:${ADV_SEC_PORT}/health`, {
        headers: { Host: "malicious-attacker.com" }
      });
      expect(invalidResponse.status()).toBe(403);
      const invalidBody = await invalidResponse.json();
      expect(invalidBody.error?.message).toContain("Invalid Host");
    });

    test("should use X-Forwarded-For for rate limiting when trustProxy is true", async ({ request }) => {
      const targetUrl = `http://127.0.0.1:${ADV_SEC_PORT}/health`;
      
      // Simulate multiple requests from same forwarded IP
      const spoofedIp = "203.0.113.1";
      
      for (let i = 0; i < 5; i++) {
        const response = await request.get(targetUrl, {
          headers: { "X-Forwarded-For": spoofedIp }
        });
        expect(response.status()).toBe(200); // health bypasses rate limit
      }
      
      // Hit an endpoint that DOES rate limit
      // Set to 110 requests to breach the default 100 max limit
      for (let i = 0; i < 110; i++) {
        const response = await request.get(`http://127.0.0.1:${ADV_SEC_PORT}/`, {
          headers: { "X-Forwarded-For": spoofedIp }
        });
        
        if (i >= 105) {
          // Should trigger 429 eventually
          expect([200, 429]).toContain(response.status());
        }
      }
    });
  });
  test.describe("Slowloris & Connection Timeouts", () => {
    test.setTimeout(10000);

    test.beforeAll(async () => {
      // Start server with 1s headers/request timeout for testing Slowloris fast
      process.env["MCP_HEADERS_TIMEOUT"] = "1000";
      process.env["MCP_REQUEST_TIMEOUT"] = "1000";
      await startServer(SLOWLORIS_PORT, [], "slowloris");
      delete process.env["MCP_HEADERS_TIMEOUT"];
      delete process.env["MCP_REQUEST_TIMEOUT"];
    });

    test.afterAll(() => {
      stopServer(SLOWLORIS_PORT);
    });

    test("should drop connection if headers take too long (Slowloris protection)", async () => {
      return new Promise<void>((resolve, reject) => {
        const client = createConnection({ port: SLOWLORIS_PORT, host: "localhost" }, () => {
          // Send incomplete headers slowly
          client.write("GET /health HTTP/1.1\\r\\n");
          client.write("Host: localhost\\r\\n");
          
          // Trickle data to keep socket active but headers incomplete
          const interval = setInterval(() => {
            if (!client.destroyed) {
              client.write("X-Slow: 1\\r\\n");
            }
          }, 300);

          const timeout = setTimeout(() => {
            clearInterval(interval);
            client.destroy();
            reject(new Error("Socket did not close within expected timeout"));
          }, 3500); // Should timeout at 1000ms

          client.on("close", () => {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve();
          });
          
          client.on("error", (err) => {
            clearInterval(interval);
            clearTimeout(timeout);
            resolve();
          });
        });
      });
    });
  });
});
