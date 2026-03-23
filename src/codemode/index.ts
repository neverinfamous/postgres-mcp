/**
 * postgres-mcp - Code Mode Module
 *
 * Exports for the sandboxed code execution environment.
 */

// Types
export type {
  SandboxOptions,
  PoolOptions,
  SandboxResult,
  ExecutionMetrics,
  SecurityConfig,
  ValidationResult,
  ExecutionRecord,
  ExecuteCodeOptions,
  ExecuteCodeResult,
  GroupApi,
  RpcRequest,
  RpcResponse,
} from "./types.js";

export {
  DEFAULT_SANDBOX_OPTIONS,
  DEFAULT_POOL_OPTIONS,
  DEFAULT_SECURITY_CONFIG,
} from "./types.js";

// Sandbox (VM-based)
export { CodeModeSandbox, SandboxPool } from "./sandbox.js";

// Sandbox (Worker-thread-based)
export { WorkerSandbox, WorkerSandboxPool } from "./worker-sandbox.js";

// Sandbox Factory
export {
  createSandbox,
  createSandboxPool,
  setDefaultSandboxMode,
  getDefaultSandboxMode,
  getAvailableSandboxModes,
  getSandboxModeInfo,
} from "./sandbox-factory.js";
export type {
  SandboxMode,
  ISandbox,
  ISandboxPool,
  SandboxModeInfo,
} from "./sandbox-factory.js";

// Security
export { CodeModeSecurityManager } from "./security.js";

// API
export { PgApi, createPgApi } from "./api/index.js";

