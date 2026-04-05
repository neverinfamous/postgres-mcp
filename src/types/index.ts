/**
 * postgres-mcp - PostgreSQL MCP Server
 *
 * Core type definitions for the MCP server, database adapters,
 * OAuth 2.1 authentication, and tool filtering.
 *
 * Re-exports all types from modular files.
 */

// Database types (connection, pool, query results)
export type {
  DatabaseType,
  DatabaseConfig,
  PostgresOptions,
  PoolConfig,
  PoolStats,
  HealthStatus,
  QueryResult,
  ColumnInfo,
  FieldInfo,
  TableInfo,
} from "./database.js";

// Schema metadata types
export type { SchemaInfo, IndexInfo } from "./schema.js";

// MCP server types
export type { TransportType } from "./mcp.js";

// OAuth types
export type {
  OAuthConfig,
  OAuthScope,
  TokenClaims,
  RequestContext,
} from "./oauth.js";

// Tool filtering types
export type {
  ToolGroup,
  ToolFilterRule,
  ToolFilterConfig,
} from "./filtering.js";

// Adapter types
export type {
  AdapterCapabilities,
  ToolAnnotations,
  ToolIcon,
  ToolDefinition,
  ResourceDefinition,
  ResourceAnnotations,
  PromptDefinition,
} from "./adapters.js";

// Error types (categories, response structure, context)
export { ErrorCategory } from "./error-types.js";
export type { ErrorResponse, ErrorContext } from "./error-types.js";

// Error classes
export {
  PostgresMcpError,
  ConnectionError,
  PoolError,
  QueryError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  TransactionError,
  ExtensionNotAvailableError,
} from "./errors.js";
