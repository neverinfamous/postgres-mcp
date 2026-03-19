/**
 * postgres-mcp - CLI Module
 *
 * Command-line interface utilities.
 */

export { parseArgs, printHelp } from "./args.js";
export type { ParsedArgs } from "./args.js";
export { buildDatabaseConfig, buildOAuthConfig } from "./config.js";
export { startStdioServer, startHttpServer } from "./server.js";
