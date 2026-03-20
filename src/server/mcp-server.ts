/**
 * postgres-mcp - MCP Server Wrapper
 *
 * Wraps the MCP SDK server with database adapter integration,
 * tool filtering, logging capabilities, and graceful shutdown support.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { DatabaseAdapter } from "../adapters/database-adapter.js";
import type { ToolFilterConfig } from "../types/index.js";
import { TOOL_GROUPS, parseToolFilter } from "../filtering/tool-filter.js";
import type { ToolGroup } from "../types/index.js";
import { logger } from "../utils/logger.js";
import { INSTRUCTIONS, getHelpContent } from "../constants/server-instructions.js";

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

    // Create MCP server with slim instructions pointing to postgres://help resources
    this.mcpServer = new McpServer(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          logging: {},
        },
        instructions: INSTRUCTIONS,
      },
    );

    // Connect the logger to the underlying MCP server for protocol logging
    logger.setMcpServer(this.mcpServer);
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

    // Register help resources (filtered by enabled tool groups)
    this.registerHelpResources();

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
   * Register postgres://help resources for on-demand reference documentation.
   * Always registers postgres://help (gotchas). Group-specific help is filtered
   * by the tool filter configuration.
   */
  private registerHelpResources(): void {
    // Derive enabled groups from the enabled tool names
    const enabledGroups = new Set<string>();
    for (const [group, tools] of Object.entries(TOOL_GROUPS) as [ToolGroup, string[]][]) {
      if (tools.some((tool) => this.filterConfig.enabledTools.has(tool))) {
        enabledGroups.add(group);
      }
    }

    const helpContent = getHelpContent();

    // Always register postgres://help (gotchas + response structures + Code Mode API)
    const gotchasContent = helpContent.get("gotchas");
    if (gotchasContent) {
      this.mcpServer.registerResource(
        "postgres_help",
        "postgres://help",
        {
          description: "Critical gotchas, response structures, and Code Mode API reference",
          mimeType: "text/markdown",
        },
        () => ({
          contents: [{
            uri: "postgres://help",
            mimeType: "text/markdown",
            text: gotchasContent,
          }],
        }),
      );
    }

    // Register group-specific help resources based on tool filter
    const registeredHelp = ["postgres://help"];
    for (const [key, content] of helpContent) {
      if (key === "gotchas") continue; // Already registered above
      if (!enabledGroups.has(key)) continue; // Skip disabled groups

      this.mcpServer.registerResource(
        `postgres_help_${key}`,
        `postgres://help/${key}`,
        {
          description: `Tool reference for the ${key} tool group`,
          mimeType: "text/markdown",
        },
        () => ({
          contents: [{
            uri: `postgres://help/${key}`,
            mimeType: "text/markdown",
            text: content,
          }],
        }),
      );
      registeredHelp.push(`postgres://help/${key}`);
    }

    logger.info(`Help resources: ${registeredHelp.join(", ")}`);
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
