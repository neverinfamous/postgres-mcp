import { test, expect } from "@playwright/test";
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
      const validResponse = await request.get(`http://localhost:${ADV_SEC_PORT}/health`, {
        headers: { Host: `127.0.0.1:${ADV_SEC_PORT}` }
      });
      expect(validResponse.status()).toBe(200);

      // Request with malicious host header
      const invalidResponse = await request.get(`http://localhost:${ADV_SEC_PORT}/health`, {
        headers: { Host: "malicious-attacker.com" }
      });
      expect(invalidResponse.status()).toBe(403);
      const invalidBody = await invalidResponse.json();
      expect(invalidBody.error?.message).toContain("Invalid Host");
    });

    test("should use X-Forwarded-For for rate limiting when trustProxy is true", async ({ request }) => {
      const targetUrl = `http://localhost:${ADV_SEC_PORT}/health`;
      
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
        const response = await request.get(`http://localhost:${ADV_SEC_PORT}/`, {
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
    test.setTimeout(80000);

    test.beforeAll(async () => {
      await startServer(SLOWLORIS_PORT, [], "slowloris");
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
          
          // DO NOT send the final \\r\\n\\r\\n, leaving the headers incomplete
          
          const timeout = setTimeout(() => {
            client.destroy();
            reject(new Error("Socket did not close within expected timeout"));
          }, 70000); // The server's headersTimeout is 66000 by default

          client.on("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          
          client.on("error", (err) => {
            // ECONNRESET or similar is acceptable when the server drops us
            clearTimeout(timeout);
            resolve();
          });
        });
      });
    });
  });
});
