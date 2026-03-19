/**
 * postgres-mcp - PostgreSQL MCP Server
 *
 * Full-featured PostgreSQL database tools for AI assistants.
 *
 * @module postgres-mcp
 */

// Export types
export * from "./types/index.js";

// Export adapters
export { DatabaseAdapter } from "./adapters/database-adapter.js";
export { PostgresAdapter } from "./adapters/postgresql/index.js";

// Export server
export { PostgresMcpServer } from "./server/mcp-server.js";

// Export utilities
export { ConnectionPool } from "./pool/connection-pool.js";
export {
  parseToolFilter,
  filterTools,
  getToolFilterFromEnv,
  TOOL_GROUPS,
  getAllToolNames,
  getToolGroup,
} from "./filtering/tool-filter.js";
export { logger } from "./utils/logger.js";
