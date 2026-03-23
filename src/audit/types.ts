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

  /** Pre-mutation backup configuration (Phase 2) */
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

