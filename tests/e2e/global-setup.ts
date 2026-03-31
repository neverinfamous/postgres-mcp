import { execSync } from "node:child_process";

export default async function globalSetup() {
  console.log("Global Setup: Ensuring SQL seed files exist in the postgres-server container...");
  try {
    execSync(`docker cp test-server/test-database.sql postgres-server:/tmp/test-database.sql`);
    execSync(`docker cp test-server/test-resources.sql postgres-server:/tmp/test-resources.sql`);
    console.log("Global Setup: Done. Ready for parallel workers.");
  } catch (err: any) {
    console.warn("Global Setup Warning: Could not copy seed files. Ensure postgres-server is running.", err.message);
  }
}
