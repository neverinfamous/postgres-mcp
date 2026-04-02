/**
 * postgres-mcp - Code Mode Types
 *
 * Type definitions for the sandboxed code execution environment.
 */

import type { ToolGroup } from "../types/index.js";

// =============================================================================
// Sandbox Configuration
// =============================================================================

/**
 * Options for sandbox execution
 */
export interface SandboxOptions {
  /** Memory limit in MB (default: 128) */
  memoryLimitMb?: number;
  /** Execution timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** CPU time limit in milliseconds (default: 10000) */
  cpuLimitMs?: number;
}

/**
 * Options for the sandbox pool
 */
export interface PoolOptions {
  /** Minimum instances to keep warm (default: 2) */
  minInstances?: number;
  /** Maximum instances in pool (default: 10) */
  maxInstances?: number;
  /** Idle timeout before disposing instance (default: 60000ms) */
  idleTimeoutMs?: number;
}

/**
 * Default sandbox configuration
 */
export const DEFAULT_SANDBOX_OPTIONS: Required<SandboxOptions> = {
  memoryLimitMb: 128,
  timeoutMs: 30000,
  cpuLimitMs: 10000,
};

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_OPTIONS: Required<PoolOptions> = {
  minInstances: 2,
  maxInstances: 10,
  idleTimeoutMs: 60000,
};

// =============================================================================
// Execution Results
// =============================================================================

/**
 * Metrics collected during sandbox execution
 */
export interface ExecutionMetrics {
  /** Wall clock time in milliseconds */
  wallTimeMs: number;
  /** CPU time consumed in milliseconds */
  cpuTimeMs: number;
  /** Peak memory usage in MB */
  memoryUsedMb: number;
}

/**
 * Result of sandbox code execution
 */
export interface SandboxResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Return value from the code (if successful) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string | undefined;
  /** Stack trace (if failed) */
  stack?: string | undefined;
  /** Execution metrics */
  metrics: ExecutionMetrics;
}

// =============================================================================
// Security Configuration
// =============================================================================

/**
 * Security configuration for code validation
 */
export interface SecurityConfig {
  /** Maximum code length in bytes (default: 50KB) */
  maxCodeLength: number;
  /** Maximum executions per minute per client (default: 60) */
  maxExecutionsPerMinute: number;
  /** Rate limit window in milliseconds (default: 60000 = 1 minute) */
  rateLimitWindowMs: number;
  /** Maximum result size in bytes (default: 10MB) */
  maxResultSize: number;
  /** Maximum characters to include in a truncated result preview */
  resultPreviewLength: number;
  /** Patterns to block in code */
  blockedPatterns: RegExp[];
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  maxCodeLength: 50 * 1024, // 50KB
  maxExecutionsPerMinute: 60,
  rateLimitWindowMs: 60000, // 1 minute
  maxResultSize: 100 * 1024, // 100KB (approx 25k tokens)
  resultPreviewLength: 1000,
  blockedPatterns: [
    /\brequire\s*\(/, // No require()
    /\bimport\s*\(/, // No dynamic import()
    /\bprocess\./, // No process access
    /\bglobal\./, // No global access
    /\bglobalThis\./, // No globalThis access
    /\beval\s*\(/, // No eval()
    /\bFunction\s*\(/, // No Function constructor
    /\b__proto__\b/, // No prototype pollution
    /\bconstructor\.constructor/, // No constructor chaining
    /\bchild_process/, // No child processes
    /\bfs\./, // No filesystem
    /\bnet\./, // No networking
    /\bhttp\./, // No HTTP
    /\bhttps\./, // No HTTPS
    /\bnew\s+Proxy\s*\(/, // No Proxy construction
    /\bReflect\./, // No Reflect API
    /\bSymbol\./, // No Symbol access
  ],
};

/**
 * Validation result from security checks
 */
export interface ValidationResult {
  /** Whether the code passed validation */
  valid: boolean;
  /** Validation errors (if any) */
  errors: string[];
}

/**
 * Execution record for audit logging
 */
export interface ExecutionRecord {
  /** Unique execution ID */
  id: string;
  /** Client identifier (for rate limiting) */
  clientId?: string | undefined;
  /** Timestamp of execution start */
  timestamp: Date;
  /** Code that was executed (truncated for logging) */
  codePreview: string;
  /** Execution result */
  result: SandboxResult;
  /** Whether code was in readonly mode */
  readonly: boolean;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Tool group API interface - each group exposes its tools as methods
 */
export interface GroupApi {
  /** Tool group name */
  readonly groupName: ToolGroup;
}

/**
 * Options passed to pg_execute_code tool
 */
export interface ExecuteCodeOptions {
  /** TypeScript code to execute */
  code: string;
  /** Timeout in milliseconds (max 30000) */
  timeout?: number;
  /** Restrict to read-only operations */
  readonly?: boolean;
}

/**
 * Result returned by pg_execute_code tool
 */
export interface ExecuteCodeResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Return value from the code */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
  /** Execution metrics */
  metrics: ExecutionMetrics;
}

// =============================================================================
// Worker RPC Types
// =============================================================================

/**
 * RPC request sent from worker thread to main thread via MessagePort.
 */
export interface RpcRequest {
  /** Unique request identifier */
  id: number;
  /** API group name (e.g., 'core', 'admin', or '_topLevel') */
  group: string;
  /** Method name within the group */
  method: string;
  /** Arguments to pass to the method */
  args: unknown[];
}

/**
 * RPC response sent from main thread back to worker thread.
 */
export interface RpcResponse {
  /** Matches the request id */
  id: number;
  /** Return value (if successful) */
  result?: unknown;
  /** Error message (if failed) */
  error?: string;
}

