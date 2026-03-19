/**
 * postgres-mcp - Code Mode Security
 *
 * Input validation, rate limiting, and audit logging for code execution.
 */

import { logger } from "../utils/logger.js";
import {
  DEFAULT_SECURITY_CONFIG,
  type SecurityConfig,
  type ValidationResult,
  type ExecutionRecord,
  type SandboxResult,
} from "./types.js";

/**
 * Security manager for Code Mode executions
 */
export class CodeModeSecurityManager {
  private readonly config: SecurityConfig;
  private readonly rateLimitMap = new Map<
    string,
    { count: number; resetTime: number }
  >();

  constructor(config?: Partial<SecurityConfig>) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
  }

  /**
   * Validate code before execution
   */
  validateCode(code: string): ValidationResult {
    const errors: string[] = [];

    // Check code length
    if (!code || typeof code !== "string") {
      errors.push("Code must be a non-empty string");
      return { valid: false, errors };
    }

    if (code.length > this.config.maxCodeLength) {
      errors.push(
        `Code exceeds maximum length of ${String(this.config.maxCodeLength)} bytes`,
      );
      return { valid: false, errors };
    }

    // Check for blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(code)) {
        errors.push(`Blocked pattern detected: ${pattern.source}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check rate limit for a client
   * @returns true if within limits, false if rate limited
   */
  checkRateLimit(clientId: string): boolean {
    const now = Date.now();
    const windowMs = this.config.rateLimitWindowMs;

    const existing = this.rateLimitMap.get(clientId);

    if (!existing || now >= existing.resetTime) {
      // Start new window
      this.rateLimitMap.set(clientId, {
        count: 1,
        resetTime: now + windowMs,
      });
      return true;
    }

    if (existing.count >= this.config.maxExecutionsPerMinute) {
      return false;
    }

    existing.count++;
    return true;
  }

  /**
   * Get remaining rate limit for a client
   */
  getRateLimitRemaining(clientId: string): number {
    const existing = this.rateLimitMap.get(clientId);
    if (!existing || Date.now() >= existing.resetTime) {
      return this.config.maxExecutionsPerMinute;
    }
    return Math.max(0, this.config.maxExecutionsPerMinute - existing.count);
  }

  /**
   * Sanitize and truncate result if too large
   */
  sanitizeResult(result: unknown): unknown {
    try {
      const serialized = JSON.stringify(result);
      if (serialized.length > this.config.maxResultSize) {
        return {
          _truncated: true,
          _originalSize: serialized.length,
          _maxSize: this.config.maxResultSize,
          preview:
            serialized.substring(0, this.config.resultPreviewLength) + "...",
        };
      }
      return result;
    } catch {
      return {
        _error: "Result could not be serialized",
        _type: typeof result,
      };
    }
  }

  /**
   * Log execution for audit purposes
   */
  auditLog(execution: ExecutionRecord): void {
    const { id, clientId, codePreview, result, readonly } = execution;

    const logContext = {
      module: "CODEMODE" as const,
      operation: "execute",
      entityId: id,
      clientId: clientId ?? "anonymous",
      readonly,
      success: result.success,
      wallTimeMs: result.metrics.wallTimeMs,
      memoryUsedMb: result.metrics.memoryUsedMb,
    };

    if (result.success) {
      logger.info(
        `Code execution completed: ${codePreview.substring(0, 50)}...`,
        logContext,
      );
    } else {
      const errorContext = {
        ...logContext,
        ...(result.error !== undefined ? { error: result.error } : {}),
        ...(result.stack !== undefined ? { stack: result.stack } : {}),
      };
      logger.warning(
        `Code execution failed: ${result.error ?? "unknown error"}`,
        errorContext,
      );
    }
  }

  /**
   * Create execution record for audit
   */
  createExecutionRecord(
    code: string,
    result: SandboxResult,
    readonly: boolean,
    clientId?: string,
  ): ExecutionRecord {
    return {
      id: crypto.randomUUID(),
      clientId,
      timestamp: new Date(),
      codePreview: code.length > 200 ? code.substring(0, 200) + "..." : code,
      result,
      readonly,
    };
  }

  /**
   * Clean up old rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [clientId, entry] of this.rateLimitMap) {
      if (now >= entry.resetTime) {
        this.rateLimitMap.delete(clientId);
      }
    }
  }
}
