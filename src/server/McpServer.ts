/**
 * postgres-mcp - MCP Server Wrapper
 *
 * Wraps the MCP SDK server with database adapter integration,
 * tool filtering, logging capabilities, and graceful shutdown support.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { DatabaseAdapter } from "../adapters/DatabaseAdapter.js";
import type { ToolFilterConfig } from "../types/index.js";
import { parseToolFilter } from "../filtering/ToolFilter.js";
import { logger } from "../utils/logger.js";
import { SERVER_INSTRUCTIONS } from "../constants/ServerInstructions.js";

export interface ServerConfig {
  name: string;
  version: string;
  adapter: DatabaseAdapter;
  toolFilter?: string | undefined;
}

/**
 * PostgreSQL MCP Server
 */
export class PostgresMcpServer {
  private mcpServer: McpServer;
  private adapter: DatabaseAdapter;
  private filterConfig: ToolFilterConfig;
  private transport: StdioServerTransport | null = null;

  constructor(config: ServerConfig) {
    this.adapter = config.adapter;
    this.filterConfig = parseToolFilter(config.toolFilter);

    // Create MCP server with logging capability enabled and server instructions
    this.mcpServer = new McpServer(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          logging: {},
        },
        instructions: SERVER_INSTRUCTIONS,
      },
    );

    // Connect the logger to the underlying MCP server for protocol logging
    // The McpServer.server property exposes the low-level Server instance
    logger.setMcpServer(this.mcpServer.server);
    logger.setLoggerName(config.name);

    logger.info("MCP Server initialized", {
      name: config.name,
      version: config.version,
      toolFilter: config.toolFilter ?? "none",
      capabilities: ["logging"],
    });
  }

  /**
   * Register all tools, resources, and prompts
   */
  public registerComponents(): void {
    // Register tools (with filtering)
    this.adapter.registerTools(this.mcpServer, this.filterConfig.enabledTools);

    // Register resources
    this.adapter.registerResources(this.mcpServer);

    // Register prompts
    this.adapter.registerPrompts(this.mcpServer);

    const toolCount = this.filterConfig.enabledTools.size;
    const resourceCount = this.adapter.getResourceDefinitions().length;
    const promptCount = this.adapter.getPromptDefinitions().length;

    logger.info("Components registered", {
      tools: toolCount,
      resources: resourceCount,
      prompts: promptCount,
    });
  }

  /**
   * Start the server with stdio transport
   */
  async start(): Promise<void> {
    // Register all components
    this.registerComponents();

    // Create and connect transport
    this.transport = new StdioServerTransport();

    await this.mcpServer.connect(this.transport);

    logger.info("MCP Server started with stdio transport");
  }

  /**
   * Gracefully stop the server
   */
  async stop(): Promise<void> {
    logger.info("Stopping MCP Server...");

    try {
      await this.mcpServer.close();
      logger.info("MCP Server stopped");
    } catch (error) {
      logger.error("Error stopping server", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get the underlying MCP server instance
   */
  getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get the database adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter;
  }

  /**
   * Get filter configuration
   */
  getFilterConfig(): ToolFilterConfig {
    return this.filterConfig;
  }
}
