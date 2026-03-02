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
  | "starter" // 🌟 Recommended default (core, transactions, jsonb, schema) 59 tools
  | "essential" // Minimal footprint (core, transactions, jsonb) 47 tools
  // Developer Workloads
  | "dev-schema" // Dev Schema & Migrations (core, trans, schema, introspection) 52 tools
  | "dev-analytics" // Dev Analytics (core, trans, stats, partitioning) 42 tools
  // AI Workloads
  | "ai-data" // AI Data Analyst (core, jsonb, text, transactions) 60 tools
  | "ai-vector" // AI/ML with pgvector (core, vector, trans, partitioning) 50 tools
  // DBA Workloads
  | "dba-monitor" // DBA Monitoring (core, monitoring, performance, trans) 59 tools
  | "dba-schema" // DBA Schema (core, schema, introspection) 45 tools
  | "dba-infra" // DBA Infrastructure (core, admin, backup, partitioning) 46 tools
  | "dba-stats" // DBA Stats (core, admin, monitoring, trans, stats) 57 tools
  // Specialty
  | "geo" // Geospatial Workloads (core, postgis, transactions) 43 tools
  // Building Blocks
  | "base-ops" // Operations Block (admin, monitoring, backup, part, stats, citext) 51 tools
  // Extension Bundles
  | "ext-ai" // Extension: AI/Security (vector, pgcrypto) 26 tools
  | "ext-geo" // Extension: Spatial/Hierarchical (postgis, ltree) 24 tools
  | "ext-schedule" // Extension: Scheduling (cron, partman) 19 tools
  | "ext-perf"; // Extension: Performance/Analysis (kcache, performance) 28 tools

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
