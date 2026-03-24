/**
 * postgres-mcp — Audit Log Types
 *
 * Types and configuration for the JSONL audit trail.
 * Records write/admin tool invocations with OAuth identity,
 * timing, and outcome for forensic-grade team visibility.
 */

/** Category of the audited operation */
export type AuditCategory = "read" | "write" | "admin" | "auth" | "error";

/**
 * Single audit log entry — serialised as one line of JSONL.
 *
 * The `backup` field holds the relative path to the pre-mutation snapshot
 * file when audit backup is enabled, or `undefined` when disabled.
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

  /** Relative path to the pre-mutation snapshot file; undefined when audit backup is disabled. */
  backup?: string | undefined;

  /** Estimated token count of the tool response (~4 bytes per token) */
  tokenEstimate?: number | undefined;
}

/** Audit log configuration */
export interface AuditConfig {
  /** Master switch — false means no interceptor is created */
  enabled: boolean;

  /** Absolute path to the JSONL output file */
  logPath: string;

  /** When true, tool arguments are omitted from entries */
  redact: boolean;

  /** When true, read-scoped tools are also logged (default: false) */
  auditReads: boolean;

  /** Maximum log file size in bytes before rotation (default: 10MB). 0 = no rotation. */
  maxSizeBytes: number;

  /** Pre-mutation backup configuration (optional — backup disabled when absent). */
  backup?: BackupConfig | undefined;
}

/** Pre-mutation backup configuration */
export interface BackupConfig {
  /** Enable pre-mutation snapshots */
  enabled: boolean;

  /** Include sample data rows in snapshots (default: schema-only) */
  includeData: boolean;

  /** Maximum snapshot age in days before cleanup (default: 30) */
  maxAgeDays: number;

  /** Maximum number of snapshots to retain (default: 1000) */
  maxCount: number;

  /** Maximum table size in bytes for data capture (default: 50MB). Tables exceeding this get DDL-only snapshots. */
  maxDataSizeBytes: number;
}

/** Snapshot metadata stored alongside the DDL capture */
export interface SnapshotMetadata {
  /** ISO 8601 timestamp */
  timestamp: string;

  /** Tool that triggered the snapshot */
  tool: string;

  /** Target object (table, index, schema) */
  target: string;

  /** Schema of the target object */
  schema: string;

  /** Snapshot type: ddl-only or ddl+data */
  type: "ddl" | "ddl+data";

  /** Original audit requestId for correlation */
  requestId: string;

  /** Size of snapshot file in bytes */
  sizeBytes: number;

  /** Snapshot filename (populated by listSnapshots for getSnapshot lookup) */
  filename?: string;

  /** Approximate row count at snapshot time (from pg_class.reltuples) */
  rowCount?: number;

  /** Approximate total size in bytes at snapshot time (from pg_class) */
  totalSizeBytes?: number;

  /** Whether data capture was skipped due to size exceeding threshold */
  dataSkipped?: boolean;

  /** Reason data capture was skipped (e.g., "Table exceeds 50MB threshold") */
  dataSkippedReason?: string;
}

/** Stored snapshot file content */
export interface SnapshotContent {
  /** Snapshot metadata */
  metadata: SnapshotMetadata;

  /** CREATE TABLE / CREATE INDEX / etc. DDL */
  ddl: string;

  /** Optional INSERT statements for sample data */
  data?: string | undefined;
}

// =============================================================================
// Default configuration constants
// =============================================================================

/** Default maximum JSONL audit log size before rotation (10 MB). */
export const DEFAULT_AUDIT_LOG_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Default maximum table size for data capture in snapshots (50 MB). */
export const DEFAULT_AUDIT_BACKUP_MAX_DATA_SIZE_BYTES = 50 * 1024 * 1024;

/** Default maximum snapshot age in days before cleanup. */
export const DEFAULT_AUDIT_BACKUP_MAX_AGE_DAYS = 30;

/** Default maximum number of snapshots to retain. */
export const DEFAULT_AUDIT_BACKUP_MAX_COUNT = 1_000;

