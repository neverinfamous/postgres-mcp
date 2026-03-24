#!/usr/bin/env node
/**
 * postgres-mcp - CLI Entry Point
 *
 * Command-line interface for the PostgreSQL MCP server.
 * Supports stdio, HTTP, and SSE transports with OAuth 2.1 authentication.
 */

import { Command } from "commander";
import { PostgresAdapter } from "./adapters/postgresql/index.js";
import { parseToolFilter, getFilterSummary } from "./filtering/tool-filter.js";
import { logger } from "./utils/logger.js";
import type { TransportType } from "./types/index.js";
import type { InstructionLevel } from "./constants/server-instructions.js";
import { VERSION } from "./utils/version.js";
import { buildDatabaseConfig, buildOAuthConfig } from "./cli/config.js";
import { startStdioServer, startHttpServer } from "./cli/server.js";
import {
  DEFAULT_AUDIT_LOG_MAX_SIZE_BYTES,
  DEFAULT_AUDIT_BACKUP_MAX_DATA_SIZE_BYTES,
  DEFAULT_AUDIT_BACKUP_MAX_AGE_DAYS,
  DEFAULT_AUDIT_BACKUP_MAX_COUNT,
} from "./audit/index.js";

interface CliOptions {
  postgres?: string;
  host?: string;
  pgPort?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  poolMax?: number;
  toolFilter?: string;
  instructionLevel?: InstructionLevel;
  logLevel?:
    | "debug"
    | "info"
    | "notice"
    | "warning"
    | "error"
    | "critical"
    | "alert"
    | "emergency";
  transport?: TransportType;
  port?: number;
  serverHost?: string;
  authToken?: string;
  stateless?: boolean;
  enableHsts?: boolean;
  oauthEnabled?: boolean;
  oauthIssuer?: string;
  oauthAudience?: string;
  oauthJwksUri?: string;
  oauthClockTolerance?: number;
  trustProxy?: boolean;
  auditLog?: string;
  auditRedact?: boolean;
  auditReads?: boolean;
  auditLogMaxSize?: number;
  auditBackup?: boolean;
  auditBackupData?: boolean;
  auditBackupMaxAge?: number;
  auditBackupMaxCount?: number;
  auditBackupMaxDataSize?: number;
}

interface ListToolsOptions {
  filter?: string;
  group?: string;
}

const program = new Command();

program
  .name("postgres-mcp")
  .description(
    "PostgreSQL MCP Server - Full-featured database tools for AI with OAuth 2.1",
  )
  .version(VERSION);

program
  // Connection options
  .option(
    "--postgres <url>",
    "PostgreSQL connection string (postgres://user:pass@host:port/database)",
  )
  .option("--host <host>", "PostgreSQL host (default: localhost)")
  .option("--pg-port <port>", "PostgreSQL port (default: 5432)", parseInt)
  .option("--user <user>", "PostgreSQL username")
  .option(
    "--password <password>",
    "PostgreSQL password (prefer PGPASSWORD env var to avoid process list exposure)",
  )
  .option("--database <database>", "PostgreSQL database name")
  .option("--ssl", "Enable SSL connection")
  .option(
    "--pool-max <size>",
    "Maximum pool connections (default: 10)",
    parseInt,
  )
  // Server options
  .option(
    "--transport, -t <type>",
    "Transport type: stdio, http, sse (default: stdio)",
  )
  .option(
    "--port, -p <port>",
    "HTTP port for http/sse transports (default: 3000)",
    parseInt,
  )
  .option(
    "--server-host <host>",
    "Server bind host for http/sse transports (default: localhost)",
  )
  .option(
    "--tool-filter <filter>",
    'Tool filter string (e.g., "-vector,-postgis")',
  )
  .option(
    "--log-level <level>",
    "Log level: debug, info, notice, warning, error, critical, alert, emergency (default: info)",
  )
  .option(
    "--instruction-level <level>",
    "Instruction detail level: essential, standard, full (default: standard)",
  )
  // OAuth options
  .option("--oauth-enabled, -o", "Enable OAuth 2.1 authentication")
  .option("--oauth-issuer <url>", "Authorization server URL (issuer)")
  .option("--oauth-audience <aud>", "Expected token audience")
  .option(
    "--oauth-jwks-uri <url>",
    "JWKS URI (auto-discovered from issuer if not set)",
  )
  .option(
    "--oauth-clock-tolerance <seconds>",
    "Clock tolerance in seconds (default: 60)",
    parseInt,
  )
  .option(
    "--trust-proxy",
    "Trust X-Forwarded-For header for client IP (enable behind reverse proxy)",
  )
  .option(
    "--auth-token <token>",
    "Simple bearer token for HTTP authentication (env: MCP_AUTH_TOKEN)",
  )
  .option(
    "--stateless",
    "Enable stateless HTTP mode (no sessions, no SSE, suitable for serverless)",
  )
  .option(
    "--enable-hsts",
    "Enable HSTS header for HTTP transport (use when behind HTTPS, env: MCP_ENABLE_HSTS)",
  )
  // Audit options
  .option(
    "--audit-log <path>",
    "Enable audit logging to the specified JSONL file path (env: AUDIT_LOG_PATH)",
  )
  .option(
    "--audit-redact",
    "Redact tool arguments from audit entries (env: AUDIT_REDACT)",
  )
  .option(
    "--audit-backup",
    "Enable pre-mutation snapshots for destructive operations (env: AUDIT_BACKUP)",
  )
  .option(
    "--audit-backup-data",
    "Include sample data rows in backup snapshots (env: AUDIT_BACKUP_DATA)",
  )
  .option(
    "--audit-backup-max-age <days>",
    "Maximum snapshot age in days (default: 30, env: AUDIT_BACKUP_MAX_AGE)",
    parseInt,
  )
  .option(
    "--audit-backup-max-count <count>",
    "Maximum number of snapshots to retain (default: 1000, env: AUDIT_BACKUP_MAX_COUNT)",
    parseInt,
  )
  .option(
    "--audit-backup-max-data-size <bytes>",
    "Maximum table size in bytes for data capture in snapshots (default: 52428800 / 50MB, env: AUDIT_BACKUP_MAX_DATA_SIZE)",
    parseInt,
  )
  .option(
    "--audit-reads",
    "Enable audit logging for read-scoped tool calls (default: off, env: AUDIT_READS)",
  )
  .option(
    "--audit-log-max-size <bytes>",
    "Maximum audit log file size in bytes before rotation (default: 10485760 / 10MB, env: AUDIT_LOG_MAX_SIZE)",
    parseInt,
  )
  .action(async (options: CliOptions) => {
    // Set log level
    const logLevel =
      options.logLevel ?? (process.env["LOG_LEVEL"] as typeof options.logLevel);
    if (logLevel) {
      logger.setLevel(logLevel);
    }

    // Build database config
    const dbConfig = buildDatabaseConfig(options);

    // Build OAuth config
    const oauthConfig = await buildOAuthConfig(options);

    // Create adapter and connect
    const adapter = new PostgresAdapter();

    try {
      await adapter.connect(dbConfig);

      // Get tool filter from option or environment
      const toolFilter =
        options.toolFilter ??
        process.env["POSTGRES_TOOL_FILTER"] ??
        process.env["MCP_TOOL_FILTER"];

      if (toolFilter) {
        const filterConfig = parseToolFilter(toolFilter);
        logger.info(getFilterSummary(filterConfig));
      }

      // Log OAuth status
      if (oauthConfig?.enabled) {
        logger.info("OAuth 2.1 authentication enabled", {
          issuer: oauthConfig.issuer,
        });
      }

      // Build audit config from CLI options + env
      const auditLogPath =
        options.auditLog ?? process.env["AUDIT_LOG_PATH"];
      const auditRedact =
        options.auditRedact ?? process.env["AUDIT_REDACT"] === "true";
      const auditReads =
        options.auditReads ?? process.env["AUDIT_READS"] === "true";
      const auditLogMaxSize =
        options.auditLogMaxSize ?? Number(process.env["AUDIT_LOG_MAX_SIZE"] ?? DEFAULT_AUDIT_LOG_MAX_SIZE_BYTES);
      const auditConfig = auditLogPath
        ? {
            enabled: true,
            logPath: auditLogPath,
            redact: auditRedact,
            auditReads,
            maxSizeBytes: auditLogMaxSize,
            backup: (options.auditBackup ?? process.env["AUDIT_BACKUP"] === "true")
              ? {
                  enabled: true,
                  includeData: options.auditBackupData ?? process.env["AUDIT_BACKUP_DATA"] === "true",
                  maxAgeDays: options.auditBackupMaxAge ?? Number(process.env["AUDIT_BACKUP_MAX_AGE"] ?? DEFAULT_AUDIT_BACKUP_MAX_AGE_DAYS),
                  maxCount: options.auditBackupMaxCount ?? Number(process.env["AUDIT_BACKUP_MAX_COUNT"] ?? DEFAULT_AUDIT_BACKUP_MAX_COUNT),
                  maxDataSizeBytes: options.auditBackupMaxDataSize ?? Number(process.env["AUDIT_BACKUP_MAX_DATA_SIZE"] ?? DEFAULT_AUDIT_BACKUP_MAX_DATA_SIZE_BYTES),
                }
              : undefined,
          }
        : undefined;

      // Determine transport type
      const transport = (options.transport ??
        process.env["MCP_TRANSPORT"] ??
        "stdio") as TransportType;

        // Determine instruction level
        const instructionLevel = (options.instructionLevel ??
          process.env["MCP_INSTRUCTION_LEVEL"] ??
          "standard") as InstructionLevel;

        if (transport === "http" || transport === "sse") {
          if (!oauthConfig?.enabled && !options.authToken && !process.env["MCP_AUTH_TOKEN"]) {
            logger.warn(
              "HTTP transport started WITHOUT authentication — all clients have unrestricted access. " +
                "Enable OAuth with --oauth-enabled or use --auth-token for simple bearer auth.",
            );
          }
          // Start with HTTP transport
          await startHttpServer(adapter, toolFilter, instructionLevel, oauthConfig, options, auditConfig);
        } else {
          // Start with stdio transport (default)
          await startStdioServer(adapter, toolFilter, instructionLevel, auditConfig);
        }
    } catch (error: unknown) {
      logger.error("Failed to start server", {
        error: error instanceof Error ? error.message : String(error),
      });
      await adapter.disconnect();
      process.exit(1);
    }
  });

// List tools command
program
  .command("list-tools")
  .description("List all available tools")
  .option("--filter <filter>", "Apply tool filter")
  .option("--group <group>", "Filter by tool group")
  .action((options: ListToolsOptions) => {
    const adapter = new PostgresAdapter();
    const tools = adapter.getToolDefinitions();

    const filterConfig = parseToolFilter(options.filter);

    let filteredTools = tools;
    if (options.group) {
      filteredTools = tools.filter((t) => t.group === options.group);
    }

    filteredTools = filteredTools.filter((t) =>
      filterConfig.enabledTools.has(t.name),
    );

    // Use stderr for all output - stdout is reserved for MCP protocol
    console.error(
      `\nPostgreSQL MCP Tools (${String(filteredTools.length)}/${String(tools.length)}):\n`,
    );

    // Group by category
    const grouped = new Map<string, typeof tools>();
    for (const tool of filteredTools) {
      const groupTools = grouped.get(tool.group) ?? [];
      groupTools.push(tool);
      grouped.set(tool.group, groupTools);
    }

    for (const [group, groupTools] of grouped) {
      console.error(`[${group}] (${String(groupTools.length)})`);
      for (const tool of groupTools) {
        const desc = tool.description.split(".")[0] ?? "";
        console.error(`  - ${tool.name}: ${desc}`);
      }
      console.error("");
    }
  });

// Print tool count
program
  .command("info")
  .description("Show server information")
  .action(() => {
    const adapter = new PostgresAdapter();
    const tools = adapter.getToolDefinitions();
    const resources = adapter.getResourceDefinitions();
    const prompts = adapter.getPromptDefinitions();
    const groups = adapter.getSupportedToolGroups();

    // Use stderr for all output - stdout is reserved for MCP protocol
    console.error("\nPostgreSQL MCP Server");
    console.error("=====================");
    console.error(`Version: ${VERSION}`);
    console.error(`Tools: ${String(tools.length)}`);
    console.error(`Resources: ${String(resources.length)}`);
    console.error(`Prompts: ${String(prompts.length)}`);
    console.error(`Tool Groups: ${groups.join(", ")}`);
    console.error("\nTransports: stdio (default), http, sse");
    console.error("OAuth 2.1: Supported (RFC 9728/8414)");
    console.error("\nCapabilities:");
    const caps = adapter.getCapabilities();
    for (const [cap, enabled] of Object.entries(caps)) {
      console.error(`  ${cap}: ${enabled ? "✓" : "✗"}`);
    }
  });

program.parse();
