/**
 * postgres-mcp - Database Adapter Interface
 *
 * Abstract base class that all database adapters must implement.
 * Provides a consistent interface for database operations.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { logger } from "../utils/logger.js";
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
import { getAuthContext } from "../auth/auth-context.js";
import { getRequiredScope } from "../auth/scope-map.js";
import { requireScope } from "../auth/middleware.js";
import type { AuditInterceptor } from "../audit/index.js";

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
    const tools = this.getToolDefinitions();
    let registered = 0;

    for (const tool of tools) {
      if (enabledTools.has(tool.name)) {
        this.registerTool(server, tool);
        registered++;
      }
    }

    logger.info(
      `Registered ${String(registered)}/${String(tools.length)} tools from ${this.name}`,
      { module: "SERVER" },
    );
  }

  /**
   * Register a single tool with the MCP server
   * Uses modern registerTool() API for MCP 2025-11-25 compliance
   */
  protected registerTool(server: McpServer, tool: ToolDefinition): void {
    // Build tool options for registerTool()
    const toolOptions: Record<string, unknown> = {
      description: tool.description,
    };

    // MCP 2025-11-25: title is a top-level tool field, not inside annotations
    if (tool.annotations?.title) {
      toolOptions["title"] = tool.annotations.title;
    }

    // Pass full inputSchema (not just .shape) for proper validation
    if (tool.inputSchema !== undefined) {
      toolOptions["inputSchema"] = tool.inputSchema;
    }

    // MCP 2025-11-25: Pass outputSchema for structured responses
    if (tool.outputSchema !== undefined) {
      toolOptions["outputSchema"] = tool.outputSchema;
    }

    // MCP 2025-11-25: Pass annotations for behavioral hints
    if (tool.annotations) {
      toolOptions["annotations"] = tool.annotations;
    }

    // Pass icons if defined (SDK 1.25+)
    if (tool.icons && tool.icons.length > 0) {
      toolOptions["icons"] = tool.icons;
    }

    // Track whether tool has outputSchema for response handling
    const hasOutputSchema = Boolean(tool.outputSchema);

    server.registerTool(
      tool.name,
      toolOptions as {
        description?: string;
        inputSchema?: z.ZodType;
        outputSchema?: z.ZodType;
      },
      async (args: unknown, extra: unknown) => {
        try {
          // Enforce OAuth scope if auth context is present
          const authCtx = getAuthContext();
          if (authCtx?.authenticated) {
            const requiredScope = getRequiredScope(tool.name);
            requireScope(authCtx, requiredScope);
          }

          // Extract progressToken from extra._meta (SDK passes RequestHandlerExtra)
          const extraMeta = extra as {
            _meta?: { progressToken?: string | number };
          };
          const progressToken = extraMeta?._meta?.progressToken;

          // Create context with progress support
          const context = this.createContext(undefined, server, progressToken);
          const result = this.auditInterceptor
            ? await this.auditInterceptor.around(
                tool.name,
                args,
                context.requestId,
                () => tool.handler(args, context),
              )
            : await tool.handler(args, context);

          // MCP 2025-11-25: Return structuredContent if outputSchema present
          // P154 errors ({success: false, error: "..."}) are sent as structuredContent
          // rather than isError: true, so AG receives parseable structured JSON.
          // All output schemas accommodate both success and error shapes.
          // _meta is injected into text only — structuredContent stays schema-pure.
          if (hasOutputSchema) {
            // Serialize once with placeholder, compute byte length, then
            // patch the estimate via string replacement (~4 bytes per token).
            const enriched = JSON.stringify({
              ...(result as object),
              _meta: { tokenEstimate: 0 },
            });
            const tokenEstimate = Math.ceil(
              Buffer.byteLength(enriched, "utf8") / 4,
            );
            const finalText = enriched.replace(
              '"tokenEstimate":0',
              `"tokenEstimate":${String(tokenEstimate)}`,
            );
            return {
              content: [
                {
                  type: "text" as const,
                  text: finalText,
                },
              ],
              structuredContent: result as Record<string, unknown>,
            };
          }

          // Standard text content response
          if (typeof result === "object" && result !== null) {
            // Single serialize with _meta included, then compute token
            // estimate from the already-serialized string.
            const withMeta = JSON.stringify(
              { ...result, _meta: { tokenEstimate: 0 } },
              null,
              2,
            );
            const tokenEstimate = Math.ceil(
              Buffer.byteLength(withMeta, "utf8") / 4,
            );
            const finalText = withMeta.replace(
              '"tokenEstimate": 0',
              `"tokenEstimate": ${String(tokenEstimate)}`,
            );
            return {
              content: [{ type: "text" as const, text: finalText }],
            };
          }
          // Plain strings pass through unchanged
          return {
            content: [
              {
                type: "text" as const,
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (hasOutputSchema) {
            const errorResult = {
              success: false,
              error: errorMessage,
              code: "INTERNAL_ERROR",
              category: "internal",
              recoverable: false,
            };
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(errorResult),
                },
              ],
              structuredContent: errorResult,
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: `Error: ${errorMessage}`,
              },
            ],
            isError: true,
          };
        }
      },
    );
  }

  /**
   * Register resources with the MCP server
   */
  registerResources(server: McpServer): void {
    const resources = this.getResourceDefinitions();
    for (const resource of resources) {
      this.registerResource(server, resource);
    }
    logger.info(
      `Registered ${String(resources.length)} resources from ${this.name}`,
      { module: "SERVER" },
    );
  }

  /**
   * Register a single resource with the MCP server
   */
  protected registerResource(
    server: McpServer,
    resource: ResourceDefinition,
  ): void {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        description: resource.description,
        mimeType: resource.mimeType ?? "application/json",
        // Pass annotations if defined (SDK 1.25+)
        ...(resource.annotations && { annotations: resource.annotations }),
      },
      async (uri: URL) => {
        const context = this.createContext();
        const result = await resource.handler(uri.toString(), context);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: resource.mimeType ?? "application/json",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
              // Include annotations in contents response for resource reads
              ...(resource.annotations && {
                annotations: resource.annotations,
              }),
            },
          ],
        };
      },
    );
  }

  /**
   * Register prompts with the MCP server
   */
  registerPrompts(server: McpServer): void {
    const prompts = this.getPromptDefinitions();
    for (const prompt of prompts) {
      this.registerPrompt(server, prompt);
    }
    logger.info(
      `Registered ${String(prompts.length)} prompts from ${this.name}`,
      { module: "SERVER" },
    );
  }

  /**
   * Register a single prompt with the MCP server
   */
  protected registerPrompt(server: McpServer, prompt: PromptDefinition): void {
    // Never set argsSchema on prompts.
    //
    // SDK gotcha: argsSchema triggers z.object(shape).parse(request.params.arguments)
    // which rejects `undefined`. Current MCP clients (AntiGravity/Go) always send
    // `undefined` for the arguments field in prompts/get requests, even when the user
    // provides args inline (e.g., `/pg_query_builder tables:users operation:JOIN`).
    // Without argsSchema, the SDK uses the no-args callback path: cb(extra).
    //
    // All prompt handlers already gracefully default missing args via ?? "".
    server.registerPrompt(
      prompt.name,
      { description: prompt.description },
      async (providedArgs) => {
        const context = this.createContext();
        const args = (providedArgs ?? {}) as Record<string, string>;
        const result = await prompt.handler(args, context);
        return {
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text:
                  typeof result === "string"
                    ? result
                    : JSON.stringify(result, null, 2),
              },
            },
          ],
        };
      },
    );
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
    if (!sql || typeof sql !== "string") {
      throw new Error("Query must be a non-empty string");
    }

    const normalizedSql = sql.trim().toUpperCase();

    // Check for dangerous patterns
    const dangerousPatterns = [
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+/i,
      /;\s*TRUNCATE\s+/i,
      /;\s*INSERT\s+/i,
      /;\s*UPDATE\s+/i,
      /--\s*$/m,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        throw new Error("Query contains potentially dangerous patterns");
      }
    }

    // Enforce read-only for SELECT queries
    if (isReadOnly) {
      const writeKeywords = [
        "INSERT",
        "UPDATE",
        "DELETE",
        "DROP",
        "CREATE",
        "ALTER",
        "TRUNCATE",
        "GRANT",
        "REVOKE",
      ];
      for (const keyword of writeKeywords) {
        if (normalizedSql.startsWith(keyword)) {
          throw new Error(
            `Read-only mode: ${keyword} statements are not allowed`,
          );
        }
      }
    }
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
