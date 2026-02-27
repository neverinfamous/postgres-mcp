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
  | "introspection" // Agent-optimized database analysis & migration support
  | "codemode"; // Code Mode - sandboxed code execution

/**
 * Meta-group identifiers for common multi-group selections
 * These are shortcuts that expand to multiple ToolGroups
 *
 * STRICT LIMIT: All shortcuts must stay ≤50 tools
 */
export type MetaGroup =
  // General Use
  | "starter" // 🌟 Recommended default (core, transactions, jsonb, schema) ~49 tools
  | "essential" // Minimal footprint (core, transactions, jsonb) ~39 tools
  | "dev-power" // Power Developer (core, trans, schema, stats, part, backup) ~48 tools
  // AI Workloads
  | "ai-data" // AI Data Analyst (core, jsonb, text, transactions) ~50 tools
  | "ai-vector" // AI/ML with pgvector (core, vector, trans, schema, part) ~46 tools
  // DBA Workloads
  | "dba-monitor" // DBA Monitoring (core, monitoring, performance, trans) ~47 tools
  | "dba-manage" // DBA Management (core, admin, backup, part, schema) ~48 tools
  | "dba-stats" // DBA Stats/Security (core, admin, monitoring, trans, stats) ~49 tools
  // Specialty
  | "geo" // Geospatial Workloads (core, postgis, transactions) ~32 tools
  // Building Blocks
  | "base-core" // Base Core (core, jsonb, transactions, schema) ~49 tools
  | "base-ops" // Base Ops (admin, monitoring, backup, part, perf) ~50 tools
  // Extension Bundles
  | "ext-ai" // Extension: AI/Security (vector, pgcrypto) ~23 tools
  | "ext-geo" // Extension: Spatial/Hierarchical (postgis, ltree) ~20 tools
  | "ext-schedule" // Extension: Scheduling (cron, partman) ~18 tools
  | "ext-perf"; // Extension: Performance/Types (kcache, citext) ~13 tools

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
