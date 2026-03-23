/**
 * postgres-mcp — Audit Log Types
 *
 * Types and configuration for the JSONL audit trail.
 * Records write/admin tool invocations with OAuth identity,
 * timing, and outcome for forensic-grade team visibility.
 */

/** Category of the audited operation */
export type AuditCategory = "write" | "admin" | "auth" | "error";

/**
 * Single audit log entry — serialised as one line of JSONL.
 *
 * The `backup` field is reserved for Phase 2 (pre-mutation backup linking)
 * and is always `undefined` in Phase 1.
 */
export interface AuditEntry {
  /** ISO 8601 timestamp */
  timestamp: string;

  /** Correlates with RequestContext.requestId */
  requestId: string;

  /** MCP tool name (e.g. "pg_write_query") */
  tool: string;

  /** Operation category */
  category: AuditCategory;

  /** OAuth scope required for this tool */
  scope: string;

  /** OAuth subject claim — null when OAuth is not configured */
  user: string | null;

  /** All scopes present on the calling token */
  scopes: string[];

  /** Execution duration in milliseconds */
  durationMs: number;

  /** Whether the tool executed successfully */
  success: boolean;

  /** Error message when success is false */
  error?: string | undefined;

  /** Tool input arguments (omitted in redact mode) */
  args?: Record<string, unknown> | undefined;

  /** Phase 2: path to the pre-mutation backup file */
  backup?: string | undefined;
}

/** Audit log configuration */
export interface AuditConfig {
  /** Master switch — false means no interceptor is created */
  enabled: boolean;

  /** Absolute path to the JSONL output file */
  logPath: string;

  /** When true, tool arguments are omitted from entries */
  redact: boolean;
}
