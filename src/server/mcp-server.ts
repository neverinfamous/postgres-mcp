/**
 * postgres-mcp - MCP Server Wrapper
 *
 * Wraps the MCP SDK server with database adapter integration,
 * tool filtering, logging capabilities, and graceful shutdown support.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { DatabaseAdapter } from "../adapters/database-adapter.js";
import type { ToolFilterConfig, ToolGroup } from "../types/index.js";
import { parseToolFilter, getEnabledGroups } from "../filtering/tool-filter.js";
import { logger } from "../utils/logger.js";
import { generateInstructions, HELP_CONTENT } from "../constants/server-instructions.js";
import type { InstructionLevel } from "../constants/server-instructions.js";
import { AuditLogger, createAuditInterceptor, BackupManager } from "../audit/index.js";
import type { AuditConfig, SnapshotQueryAdapter } from "../audit/index.js";

export interface ServerConfig {
  name: string;
  version: string;
  adapter: DatabaseAdapter;
  toolFilter?: string | undefined;
  instructionLevel?: InstructionLevel | undefined;
  auditConfig?: AuditConfig | undefined;
}

/**
 * PostgreSQL MCP Server
 */
export class PostgresMcpServer {
  private mcpServer: McpServer;
  private adapter: DatabaseAdapter;
  private filterConfig: ToolFilterConfig;
  private transport: StdioServerTransport | null = null;
  private auditLogger: AuditLogger | null = null;
  private backupManager: BackupManager | null = null;

  constructor(config: ServerConfig) {
    this.adapter = config.adapter;
    this.filterConfig = parseToolFilter(config.toolFilter);

    // Generate dynamic instructions based on enabled tool groups and level
    const enabledGroups = getEnabledGroups(this.filterConfig.enabledTools);
    const level = config.instructionLevel ?? 'standard';
    const instructions = generateInstructions(
      enabledGroups,
      level,
      this.filterConfig.enabledTools.size,
    );

    // Create MCP server with contextual instructions
    this.mcpServer = new McpServer(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          logging: {},
        },
        instructions,
      },
    );

    // Connect the logger to the underlying MCP server for protocol logging
    logger.setMcpServer(this.mcpServer);
    logger.setLoggerName(config.name);

    logger.info("MCP Server initialized", {
      name: config.name,
      version: config.version,
      toolFilter: config.toolFilter ?? "none",
      instructionLevel: level,
      capabilities: ["logging"],
    });

    // Set up audit logging if configured
    if (config.auditConfig?.enabled) {
      this.auditLogger = new AuditLogger(config.auditConfig);

      // Set up backup manager if configured
      if (config.auditConfig.backup?.enabled && config.auditConfig.logPath !== "stderr") {
        this.backupManager = new BackupManager(
          config.auditConfig.backup,
          config.auditConfig.logPath,
        );
        // Pass backup manager to adapter so audit backup tools can access it
        if ("setBackupManager" in this.adapter) {
          (this.adapter as { setBackupManager: (m: BackupManager) => void })
            .setBackupManager(this.backupManager);
        }
      }

      const interceptor = createAuditInterceptor(
        this.auditLogger,
        this.backupManager ?? undefined,
        // The adapter implements SnapshotQueryAdapter (executeQuery + describeTable)
        this.adapter as unknown as SnapshotQueryAdapter,
      );
      this.adapter.setAuditInterceptor(interceptor);
      logger.info("Audit logging enabled", {
        path: config.auditConfig.logPath,
        redact: config.auditConfig.redact,
        backup: config.auditConfig.backup?.enabled ?? false,
        backupData: config.auditConfig.backup?.includeData ?? false,
      });
    }
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

    // Register audit resource
    this.registerAuditResource();

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
    // Derive enabled groups using the centralized utility
    const enabledGroups = getEnabledGroups(this.filterConfig.enabledTools);

    const helpContent = HELP_CONTENT;

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
      if (!enabledGroups.has(key as ToolGroup)) continue; // Skip disabled groups

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
      if (this.auditLogger) {
        await this.auditLogger.close();
      }
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

  /**
   * Register the postgres://audit resource for agent-readable audit trail.
   * Returns recent audit entries when audit is enabled, or a disabled message.
   */
  private registerAuditResource(): void {
    const auditLogger = this.auditLogger;
    const backupMgr = this.backupManager;

    this.mcpServer.registerResource(
      "postgres_audit",
      "postgres://audit",
      {
        description:
          "Recent audit log entries — write/admin tool invocations with user identity, timing, and outcome",
        mimeType: "application/json",
      },
      async () => {
        if (!auditLogger) {
          return {
            contents: [
              {
                uri: "postgres://audit",
                mimeType: "application/json",
                text: JSON.stringify({
                  entries: [],
                  message:
                    "Audit logging not enabled. Start with --audit-log <path> to enable.",
                }),
              },
            ],
          };
        }

        const entries = await auditLogger.recent();
        const backups = backupMgr ? await backupMgr.getStats() : undefined;
        return {
          contents: [
            {
              uri: "postgres://audit",
              mimeType: "application/json",
              text: JSON.stringify({
                entries,
                total: entries.length,
                ...(backups && { backups }),
              }),
            },
          ],
        };
      },
    );
  }
}
