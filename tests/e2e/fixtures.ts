import { test as baseTest, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { startServer, stopServer } from "./helpers.js";

type WorkerFixtures = {
  workerServer: { port: number; dbName: string };
};

export const test = baseTest.extend<{}, WorkerFixtures>({
  workerServer: [
    async ({}, use, workerInfo) => {
      const workerIndex = workerInfo.workerIndex;
      const dbName = `postgres_mcp_test_w${workerIndex}`;
      const port = 3000 + workerIndex;
      const password = process.env.POSTGRES_PASSWORD || "postgres";

      // 1. Provision the database (via template clone)
      try {
        console.log(`[Worker ${workerIndex}] Provisioning database ${dbName}...`);
        
        // Terminate active connections to allow drop
        try {
          execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d postgres -t -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}';"`, { stdio: "ignore" });
        } catch {}

        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`, { stdio: "ignore" });
        
        // Create fresh clone template from postgres database
        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d postgres -c "CREATE DATABASE ${dbName};"`, { stdio: "ignore" });
        
        // Seed it from the container's /tmp/ artifacts
        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d ${dbName} -f /tmp/test-database.sql`, { stdio: "ignore" });
        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d ${dbName} -f /tmp/test-resources.sql`, { stdio: "ignore" });
      } catch (err: any) {
        console.error(`[Worker ${workerIndex}] Failed to provision database ${dbName}:`, err.message);
        throw err;
      }

      // 2. Start MCP Server mapped to this specific DB
      const pgUrl = `postgres://postgres:${password}@localhost:5432/${dbName}`;
      console.log(`[Worker ${workerIndex}] Starting isolated MCP server on port ${port}...`);
      
      process.env.MCP_TEST_URL = `http://127.0.0.1:${port}`;
      process.env.MCP_TEST_DB = pgUrl;
      process.env.MCP_TEST_PORT = String(port);
      
      // Tell Playwright wait for server
      await startServer(port, ["--postgres", pgUrl], `worker-${workerIndex}`);

      // Yield the server configuration
      await use({ port, dbName });

      // 3. Teardown
      console.log(`[Worker ${workerIndex}] Tearing down MCP server on port ${port}...`);
      stopServer(port);
      
      try {
        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d postgres -t -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}';"`, { stdio: "ignore" });
        execSync(`docker exec -e PGPASSWORD=${password} postgres-server psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${dbName};"`, { stdio: "ignore" });
      } catch {}
    },
    { scope: "worker", auto: true }, // Auto true ensures it starts eagerly when worker spawns
  ],
  baseURL: async ({ workerServer }, use) => {
    // Magically override Playwright's base URL for tests so it connects to the isolated server
    await use(`http://127.0.0.1:${workerServer.port}`);
  },
});

export { expect };
