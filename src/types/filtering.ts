/**
 * postgres-mcp - Tool Filtering Types
 *
 * Types for tool groups, meta-groups, and filtering configuration.
 */

/**
 * Tool group identifiers for PostgreSQL
 */
export type ToolGroup =
  | "core" // Basic CRUD, schema operations
  | "transactions" // Transaction control
  | "jsonb" // JSONB operations
  | "text" // Text processing, FTS, trigrams
  | "performance" // EXPLAIN, pg_stat_statements
  | "admin" // VACUUM, ANALYZE, REINDEX
  | "monitoring" // Sizes, connections, status
  | "backup" // COPY, dump commands
  | "schema" // DDL operations
  | "vector" // pgvector extension
  | "postgis" // PostGIS extension
  | "partitioning" // Partition management
  | "stats" // Statistical analysis
  | "cron" // pg_cron extension - job scheduling
  | "partman" // pg_partman extension - partition lifecycle
  | "kcache" // pg_stat_kcache extension - OS-level performance stats
  | "citext" // citext extension - case-insensitive text
  | "ltree" // ltree extension - hierarchical tree labels
  | "pgcrypto" // pgcrypto extension - cryptographic functions
  | "introspection" // Agent-optimized database analysis (read-only)
  | "migration" // Schema migration tracking & management
  | "codemode"; // Code Mode - sandboxed code execution

/**
 * Tool filter rule
 */
export interface ToolFilterRule {
  /** Rule type: include or exclude */
  type: "include" | "exclude";

  /** Target: group name or tool name */
  target: string;

  /** Whether target is a group (true) or individual tool (false) */
  isGroup: boolean;
}

/**
 * Parsed tool filter configuration
 */
export interface ToolFilterConfig {
  /** Original filter string */
  raw: string;

  /** Parsed rules in order */
  rules: ToolFilterRule[];

  /** Set of enabled tool names after applying rules */
  enabledTools: Set<string>;
}
