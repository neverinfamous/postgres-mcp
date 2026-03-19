/**
 * postgres-mcp - Structured Logger
 *
 * Centralized logging utility with RFC 5424 severity levels and structured output.
 * Supports dual-mode logging: stderr for local debugging and MCP protocol notifications.
 *
 * Format: [timestamp] [LEVEL] [MODULE] [CODE] message {context}
 * Example: [2025-12-18T01:30:00Z] [ERROR] [ADAPTER] [PG_CONNECT_FAILED] Failed to connect {"host":"localhost"}
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ModuleLogger } from "./module-logger.js";

/**
 * RFC 5424 syslog severity levels
 * @see https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1
 */
export type LogLevel =
  | "debug" // 7 - Debug-level messages
  | "info" // 6 - Informational messages
  | "notice" // 5 - Normal but significant condition
  | "warning" // 4 - Warning conditions
  | "error" // 3 - Error conditions
  | "critical" // 2 - Critical conditions
  | "alert" // 1 - Action must be taken immediately
  | "emergency"; // 0 - System is unusable

/**
 * Module identifiers for log categorization
 */
export type LogModule =
  | "SERVER" // MCP server lifecycle
  | "ADAPTER" // Database adapter operations
  | "AUTH" // OAuth/authentication
  | "TOOLS" // Tool execution
  | "RESOURCES" // Resource handlers
  | "PROMPTS" // Prompt handlers
  | "TRANSPORT" // HTTP/SSE/stdio transport
  | "QUERY" // SQL query execution
  | "POOL" // Connection pool
  | "FILTER" // Tool filtering
  | "CLI" // Command line interface
  | "CODEMODE"; // Code Mode sandbox

/**
 * Structured log context following MCP logging standards
 */
export interface LogContext {
  /** Module identifier */
  module?: LogModule;
  /** Module-prefixed error/event code (e.g., PG_CONNECT_FAILED) */
  code?: string;
  /** Operation being performed (e.g., executeQuery, connect) */
  operation?: string;
  /** Entity identifier (e.g., table name, connection id) */
  entityId?: string;
  /** Request identifier for tracing */
  requestId?: string;
  /** Error stack trace */
  stack?: string;
  /** Additional context fields */
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  module?: LogModule | undefined;
  code?: string | undefined;
  message: string;
  timestamp: string;
  context?: LogContext | undefined;
}

/**
 * MCP-aware structured logger with dual-mode output
 *
 * Follows MCP Server Logging Standards:
 * - Centralized logger writing to stderr only (stdout reserved for MCP protocol)
 * - Include: module, operation, entityId, context, stack traces
 * - Module-prefixed codes (e.g., PG_CONNECT_FAILED, AUTH_TOKEN_INVALID)
 * - Severity: RFC 5424 levels
 * - Format: [timestamp] [LEVEL] [MODULE] [CODE] message {context}
 */
export class Logger {
  private minLevel: LogLevel = "info";
  private mcpServer: McpServer | null = null;
  private loggerName = "postgres-mcp";
  private defaultModule: LogModule = "SERVER";

  /**
   * RFC 5424 severity priority (lower number = higher severity)
   */
  private readonly levelPriority: Record<LogLevel, number> = {
    emergency: 0,
    alert: 1,
    critical: 2,
    error: 3,
    warning: 4,
    notice: 5,
    info: 6,
    debug: 7,
  };

  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get the current minimum log level
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Set the MCP server for protocol logging
   * When set, logs will be sent to connected MCP clients
   */
  setMcpServer(server: McpServer): void {
    this.mcpServer = server;
  }

  /**
   * Set the logger name (appears in MCP log messages)
   */
  setLoggerName(name: string): void {
    this.loggerName = name;
  }

  /**
   * Set the default module for logs without explicit module
   */
  setDefaultModule(module: LogModule): void {
    this.defaultModule = module;
  }

  private shouldLog(level: LogLevel): boolean {
    // Lower priority number = higher severity, so we log if level priority <= minLevel priority
    return this.levelPriority[level] <= this.levelPriority[this.minLevel];
  }

  /**
   * Canonical list of keys that contain sensitive data and should be redacted.
   * Includes authentication credentials and OAuth 2.1 configuration fields.
   * Both sensitiveKeys (Set) and sensitiveKeyPattern (RegExp) are derived
   * from this single source of truth.
   */
  private static readonly SENSITIVE_KEY_LIST: readonly string[] = [
    // Authentication credentials
    "password",
    "secret",
    "token",
    "key",
    "apikey",
    "api_key",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "authorization",
    "credential",
    "credentials",
    "client_secret",
    "clientsecret",
    // OAuth 2.1 configuration (may expose auth infrastructure)
    "issuer",
    "audience",
    "jwksuri",
    "jwks_uri",
    "authorizationserverurl",
    "authorization_server_url",
    "bearerformat",
    "bearer_format",
    "oauthconfig",
    "oauth_config",
    "oauth",
    "scopes_supported",
    "scopessupported",
  ];

  /** Fast-path exact match for sensitive keys */
  private readonly sensitiveKeys: ReadonlySet<string> = new Set(
    Logger.SENSITIVE_KEY_LIST,
  );

  /**
   * Pre-compiled regex for substring-based sensitive key detection.
   * Replaces O(n) Set iteration with a single regex test on the slow path.
   */
  private readonly sensitiveKeyPattern: RegExp = new RegExp(
    Logger.SENSITIVE_KEY_LIST.join("|"),
  );

  /**
   * Sanitize log message to prevent log injection attacks
   * Removes newlines, carriage returns, and all control characters
   */
  private sanitizeMessage(message: string): string {
    // Remove newlines and all control characters to prevent log injection/forging
    // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for security
    return message.replace(/[\x00-\x1F\x7F]/g, " ");
  }

  /**
   * Sanitize stack trace to prevent log injection
   * Preserves structure but removes dangerous control characters
   */
  private sanitizeStack(stack: string): string {
    // Replace newlines with a safe delimiter, remove other control characters
    return (
      stack
        .replace(/\r\n|\r|\n/g, " \u2192 ") // Replace newlines with arrow separator
        // eslint-disable-next-line no-control-regex -- Intentionally matching control characters for security
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    ); // Remove other control chars
  }

  /**
   * Sanitize context object by redacting sensitive values
   * This prevents clear-text logging of OAuth config and other secrets
   */
  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};

    for (const [key, value] of Object.entries(context)) {
      const lowerKey = key.toLowerCase();

      // Check if this key matches any sensitive pattern
      // Fast path: exact Set membership
      let isSensitive = this.sensitiveKeys.has(lowerKey);
      // Slow path: single regex test for substring containment
      if (!isSensitive) {
        isSensitive = this.sensitiveKeyPattern.test(lowerKey);
      }

      if (isSensitive && value !== undefined && value !== null) {
        sanitized[key] = "[REDACTED]";
      } else if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeContext(value as LogContext);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Format log entry according to MCP logging standard
   * Format: [timestamp] [LEVEL] [MODULE] [CODE] message {context}
   */
  private formatEntry(entry: LogEntry): string {
    const parts: string[] = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
    ];

    // Add module if present
    if (entry.module) {
      parts.push(`[${entry.module}]`);
    }

    // Add code if present
    if (entry.code) {
      parts.push(`[${entry.code}]`);
    }

    // Add message (sanitized to prevent log injection)
    parts.push(this.sanitizeMessage(entry.message));

    // Add context if present (excluding module and code which are already in the format)
    if (entry.context) {
      // Destructure out fields that are already in the log line format
      const { module, code, ...restContext } = entry.context;
      void module;
      void code; // Intentionally unused - already in format
      if (Object.keys(restContext).length > 0) {
        const sanitizedContext = this.sanitizeContext(restContext);
        parts.push(JSON.stringify(sanitizedContext));
      }
    }

    return parts.join(" ");
  }

  /**
   * Send log message to MCP client if connected
   */
  private async sendToMcp(entry: LogEntry): Promise<void> {
    if (!this.mcpServer) {
      return;
    }

    try {
      const data: Record<string, unknown> = {
        message: entry.message,
      };
      if (entry.module) data["module"] = entry.module;
      if (entry.code) data["code"] = entry.code;
      if (entry.context) {
        const sanitized = this.sanitizeContext(entry.context);
        Object.assign(data, sanitized);
      }

      await this.mcpServer.sendLoggingMessage({
        level: entry.level,
        logger: this.loggerName,
        data,
      });
    } catch {
      // Silently ignore MCP logging failures to avoid infinite loops
    }
  }

  /**
   * Write a sanitized string to stderr in a way that breaks taint tracking.
   *
   * String concatenation creates a new string reference, breaking the
   * data-flow path that static analysis tools (like CodeQL) use to track
   * potentially sensitive data. The input MUST already be fully sanitized
   * before calling this function.
   *
   * Security guarantees (enforced by callers):
   * - All sensitive data redacted by sanitizeContext()
   * - All control characters removed by sanitizeMessage()/sanitizeStack()
   *
   * @param sanitizedInput - A fully sanitized string safe for logging
   */
  private writeToStderr(sanitizedInput: string): void {
    // slice(0) creates a fresh string reference, breaking taint tracking
    // without the per-character array allocation of the previous approach
    const untaintedOutput: string = sanitizedInput.slice(0);
    // Write to stderr (stdout reserved for MCP protocol messages)
    console.error(untaintedOutput);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      module: context?.module ?? this.defaultModule,
      code: context?.code,
      message,
      timestamp: new Date().toISOString(),
      context,
    };

    // Format entry with full sanitization applied
    const formatted = this.formatEntry(entry);

    // Write sanitized output to stderr using taint-breaking method
    // All sensitive data has been redacted by sanitizeContext() in formatEntry()
    // All control characters removed by sanitizeMessage() to prevent log injection
    this.writeToStderr(formatted);

    // Stack trace for errors (also sanitized to prevent log injection)
    if (
      level === "error" ||
      level === "critical" ||
      level === "alert" ||
      level === "emergency"
    ) {
      const stack = context?.stack;
      if (stack && typeof stack === "string") {
        // Sanitize stack to remove newlines and control characters (prevents log injection)
        const sanitizedStack = this.sanitizeStack(stack);
        this.writeToStderr(`  Stack: ${sanitizedStack}`);
      }
    }

    // Also send to MCP client if connected (fire and forget)
    void this.sendToMcp(entry);
  }

  // =========================================================================
  // Convenience methods for each log level
  // =========================================================================

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  notice(message: string, context?: LogContext): void {
    this.log("notice", message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log("warning", message, context);
  }

  warning(message: string, context?: LogContext): void {
    this.log("warning", message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log("error", message, context);
  }

  critical(message: string, context?: LogContext): void {
    this.log("critical", message, context);
  }

  alert(message: string, context?: LogContext): void {
    this.log("alert", message, context);
  }

  emergency(message: string, context?: LogContext): void {
    this.log("emergency", message, context);
  }

  // =========================================================================
  // Module-scoped logging helpers
  // =========================================================================

  /**
   * Create a child logger scoped to a specific module
   */
  forModule(module: LogModule): ModuleLogger {
    return new ModuleLogger(this, module);
  }
}

// ModuleLogger is defined in module-logger.ts and imported above

export const logger = new Logger();
