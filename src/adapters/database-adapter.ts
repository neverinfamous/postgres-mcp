/**
 * postgres-mcp - Database Adapter Interface
 *
 * Abstract base class that all database adapters must implement.
 * Provides a consistent interface for database operations.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  DatabaseType,
  DatabaseConfig,
  QueryResult,
  SchemaInfo,
  TableInfo,
  HealthStatus,
  AdapterCapabilities,
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
  RequestContext,
  ToolGroup,
} from "../types/index.js";
import {
  registerAdapterTools,
  registerAdapterResources,
  registerAdapterPrompts,
} from "./mcp-registry.js";
import type { AuditInterceptor } from "../audit/index.js";
import { validateQuery as doValidateQuery } from "../utils/query-validation.js";

/**
 * Abstract base class for database adapters
 */
export abstract class DatabaseAdapter {
  /** Database type identifier */
  abstract readonly type: DatabaseType;

  /** Human-readable adapter name */
  abstract readonly name: string;

  /** Adapter version */
  abstract readonly version: string;

  /** Connection state */
  protected connected = false;

  /** Optional audit interceptor for write/admin tools */
  private auditInterceptor: AuditInterceptor | null = null;

  /**
   * Set the audit interceptor for write/admin tool logging.
   * Called by PostgresMcpServer when audit is enabled.
   */
  setAuditInterceptor(interceptor: AuditInterceptor): void {
    this.auditInterceptor = interceptor;
  }

  /**
   * Get the audit interceptor for wrapping tool calls in Code Mode.
   * Returns null if audit is not enabled.
   */
  getAuditInterceptor(): AuditInterceptor | null {
    return this.auditInterceptor;
  }

  // =========================================================================
  // Connection Lifecycle
  // =========================================================================

  /**
   * Connect to the database
   * @param config - Database connection configuration
   */
  abstract connect(config: DatabaseConfig): Promise<void>;

  /**
   * Disconnect from the database
   */
  abstract disconnect(): Promise<void>;

  /**
   * Check if connected to the database
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get health status of the database connection
   */
  abstract getHealth(): Promise<HealthStatus>;

  // =========================================================================
  // Query Execution
  // =========================================================================

  /**
   * Execute a read-only query (SELECT)
   * @param sql - SQL query string
   * @param params - Query parameters for prepared statements
   */
  abstract executeReadQuery(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult>;

  /**
   * Execute a write query (INSERT, UPDATE, DELETE)
   * @param sql - SQL query string
   * @param params - Query parameters for prepared statements
   */
  abstract executeWriteQuery(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult>;

  /**
   * Execute any query (for admin operations)
   * @param sql - SQL query string
   * @param params - Query parameters for prepared statements
   */
  abstract executeQuery(sql: string, params?: unknown[]): Promise<QueryResult>;

  // =========================================================================
  // Schema Operations
  // =========================================================================

  /**
   * Get full database schema information
   */
  abstract getSchema(): Promise<SchemaInfo>;

  /**
   * List all tables in the database
   */
  abstract listTables(): Promise<TableInfo[]>;

  /**
   * Describe a specific table's structure
   * @param tableName - Name of the table
   */
  abstract describeTable(tableName: string): Promise<TableInfo>;

  /**
   * List available schemas/databases
   */
  abstract listSchemas(): Promise<string[]>;

  // =========================================================================
  // Capabilities
  // =========================================================================

  /**
   * Get adapter capabilities
   */
  abstract getCapabilities(): AdapterCapabilities;

  /**
   * Get supported tool groups for this adapter
   */
  abstract getSupportedToolGroups(): ToolGroup[];

  // =========================================================================
  // MCP Registration
  // =========================================================================

  /**
   * Get all tool definitions for this adapter
   */
  abstract getToolDefinitions(): ToolDefinition[];

  /**
   * Get all resource definitions for this adapter
   */
  abstract getResourceDefinitions(): ResourceDefinition[];

  /**
   * Get all prompt definitions for this adapter
   */
  abstract getPromptDefinitions(): PromptDefinition[];

  /**
   * Register tools with the MCP server
   * @param server - MCP server instance
   * @param enabledTools - Set of enabled tool names (from filtering)
   */
  registerTools(server: McpServer, enabledTools: Set<string>): void {
    registerAdapterTools(this, server, enabledTools);
  }

  /**
   * Register resources with the MCP server
   */
  registerResources(server: McpServer): void {
    registerAdapterResources(this, server);
  }

  /**
   * Register prompts with the MCP server
   */
  registerPrompts(server: McpServer): void {
    registerAdapterPrompts(this, server);
  }

  /**
   * Validate full query for safety (SQL statement injection prevention)
   * Note: This intentionally uses a less restrictive blocklist than
   * `where-clause.ts` because full queries legitimately contain constructs
   * (like UNION, SELECT, file ops) that are dangerous in a WHERE fragment.
   * Parameterized queries provide the primary defense against data-level injection.
   *
   * @param sql - SQL query to validate
   * @param isReadOnly - Whether to enforce read-only restrictions
   */
  validateQuery(sql: string, isReadOnly: boolean): void {
    doValidateQuery(sql, isReadOnly);
  }

  /**
   * Create a request context for tool execution
   * @param requestId Optional request ID for tracing
   * @param server Optional MCP Server instance for progress notifications
   * @param progressToken Optional progress token from client request _meta
   */
  createContext(
    requestId?: string,
    server?: unknown,
    progressToken?: string | number,
  ): RequestContext {
    const context: RequestContext = {
      timestamp: new Date(),
      requestId: requestId ?? crypto.randomUUID(),
    };
    if (server !== undefined) {
      context.server = server;
    }
    if (progressToken !== undefined) {
      context.progressToken = progressToken;
    }
    return context;
  }
}
