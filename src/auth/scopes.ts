/**
 * postgres-mcp - OAuth Scopes
 *
 * Scope definitions and utilities for PostgreSQL MCP OAuth 2.1.
 */

import type { ToolGroup } from "../types/index.js";

// =============================================================================
// Scope Definitions
// =============================================================================

/**
 * Standard OAuth scopes for postgres-mcp
 */
export const SCOPES = {
  /** Read-only access to all databases */
  READ: "read",

  /** Read and write access to all databases */
  WRITE: "write",

  /** Administrative access (VACUUM, ANALYZE, etc.) */
  ADMIN: "admin",

  /** Full access to all operations */
  FULL: "full",
} as const;

export type StandardScope = (typeof SCOPES)[keyof typeof SCOPES];

/**
 * All supported scopes including patterns
 */
export const ALL_SCOPES = [
  SCOPES.READ,
  SCOPES.WRITE,
  SCOPES.ADMIN,
  SCOPES.FULL,
  // Pattern scopes: db:{name}, schema:{name}, table:{schema}:{table}
] as const;

/**
 * Base scopes supported by the server (without dynamic patterns)
 */
export const BASE_SCOPES = ["read", "write", "admin", "full"] as const;

/**
 * Regex patterns for validating dynamic scope strings
 */
export const SCOPE_PATTERNS = {
  /** Database-specific access pattern: db:{name} */
  DATABASE: /^db:([a-zA-Z0-9_-]+)$/,
  /** Schema-specific access pattern: schema:{name} */
  SCHEMA: /^schema:([a-zA-Z0-9_-]+)$/,
  /** Table-specific access pattern: table:{schema}:{table} */
  TABLE: /^table:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)$/,
} as const;

// =============================================================================
// Tool Group to Scope Mapping
// =============================================================================

/**
 * Map PostgreSQL tool groups to required minimum scopes
 */
export const TOOL_GROUP_SCOPES: Record<ToolGroup, StandardScope> = {
  // Core database operations
  core: SCOPES.READ,
  transactions: SCOPES.WRITE,
  jsonb: SCOPES.READ,
  text: SCOPES.READ,
  stats: SCOPES.READ,

  // Performance and monitoring
  performance: SCOPES.READ,
  monitoring: SCOPES.READ,

  // Administrative operations
  admin: SCOPES.ADMIN,
  backup: SCOPES.ADMIN,
  schema: SCOPES.READ,
  partitioning: SCOPES.ADMIN,

  // Extensions
  vector: SCOPES.READ,
  postgis: SCOPES.READ,
  cron: SCOPES.ADMIN,
  partman: SCOPES.ADMIN,
  kcache: SCOPES.READ,
  citext: SCOPES.READ,
  ltree: SCOPES.READ,
  pgcrypto: SCOPES.READ,

  // Introspection (read-only analysis tools)
  introspection: SCOPES.READ,

  // Migration tracking (write operations)
  migration: SCOPES.WRITE,

  // Code Mode (requires admin - can execute arbitrary operations)
  codemode: SCOPES.ADMIN,
};

/**
 * Per-tool scope overrides.
 *
 * The group-level mapping above is the default. These overrides raise
 * individual tools to the correct scope when the group default is too
 * permissive — most notably the `core` group, which contains both
 * read-only and destructive tools.
 *
 * BREAKING CHANGE: OAuth users with only `read` scope will lose access
 * to write/destructive core tools. They need `write` or `admin` scope.
 */
export const TOOL_SCOPE_OVERRIDES: Partial<Record<string, StandardScope>> = {
  // Core group — write operations
  pg_write_query: SCOPES.WRITE,
  pg_create_table: SCOPES.WRITE,
  pg_create_index: SCOPES.WRITE,
  pg_upsert: SCOPES.WRITE,
  pg_batch_insert: SCOPES.WRITE,

  // Core group — destructive operations
  pg_drop_table: SCOPES.ADMIN,
  pg_drop_index: SCOPES.ADMIN,
  pg_truncate: SCOPES.ADMIN,

  // Backup group — read-only audit tools (group default is admin)
  pg_audit_list_backups: SCOPES.READ,
  pg_audit_diff_backup: SCOPES.READ,
};

// =============================================================================
// Scope Utilities
// =============================================================================

/**
 * Parse scope string into array
 */
export function parseScopes(scopeString: string | undefined): string[] {
  if (!scopeString) return [];
  return scopeString.split(" ").filter((s) => s.length > 0);
}

/**
 * Check if granted scopes include the required scope
 */
export function hasScope(
  grantedScopes: string[],
  requiredScope: string,
): boolean {
  // Full scope grants everything
  if (grantedScopes.includes(SCOPES.FULL)) {
    return true;
  }

  // Direct match
  if (grantedScopes.includes(requiredScope)) {
    return true;
  }

  // Admin scope includes write and read
  if (requiredScope === SCOPES.READ || requiredScope === SCOPES.WRITE) {
    if (grantedScopes.includes(SCOPES.ADMIN)) {
      return true;
    }
  }

  // Write scope includes read
  if (requiredScope === SCOPES.READ) {
    if (grantedScopes.includes(SCOPES.WRITE)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if granted scopes include any of the required scopes
 */
export function hasAnyScope(
  grantedScopes: string[],
  requiredScopes: string[],
): boolean {
  return requiredScopes.some((scope) => hasScope(grantedScopes, scope));
}

/**
 * Check if granted scopes include all of the required scopes
 */
export function hasAllScopes(
  grantedScopes: string[],
  requiredScopes: string[],
): boolean {
  return requiredScopes.every((scope) => hasScope(grantedScopes, scope));
}

/**
 * Get the required scope for a tool group
 */
export function getScopeForToolGroup(group: ToolGroup): StandardScope {
  return TOOL_GROUP_SCOPES[group] ?? SCOPES.READ;
}

/**
 * Check if database-specific scope matches
 */
export function hasDatabaseScope(
  grantedScopes: string[],
  database: string,
): boolean {
  // Full or admin grants all databases
  if (
    grantedScopes.includes(SCOPES.FULL) ||
    grantedScopes.includes(SCOPES.ADMIN)
  ) {
    return true;
  }

  // Check for db:{name} pattern
  const dbScope = `db:${database}`;
  return grantedScopes.includes(dbScope);
}

/**
 * Check if schema-specific scope matches
 */
export function hasSchemaScope(
  grantedScopes: string[],
  schema: string,
): boolean {
  // Full or admin grants all schemas
  if (
    grantedScopes.includes(SCOPES.FULL) ||
    grantedScopes.includes(SCOPES.ADMIN)
  ) {
    return true;
  }

  // Check for schema:{name} pattern
  const schemaScope = `schema:${schema}`;
  return grantedScopes.includes(schemaScope);
}

/**
 * Check if table-specific scope matches
 */
export function hasTableScope(
  grantedScopes: string[],
  schema: string,
  table: string,
): boolean {
  // Full or admin grants all tables
  if (
    grantedScopes.includes(SCOPES.FULL) ||
    grantedScopes.includes(SCOPES.ADMIN)
  ) {
    return true;
  }

  // Check for schema:{name} scope (grants access to all tables in schema)
  if (hasSchemaScope(grantedScopes, schema)) {
    return true;
  }

  // Check for table:{schema}:{table} pattern
  const tableScope = `table:${schema}:${table}`;
  return grantedScopes.includes(tableScope);
}

/**
 * Get scope display name
 */
export function getScopeDisplayName(scope: string): string {
  switch (scope) {
    case SCOPES.READ:
      return "Read Only";
    case SCOPES.WRITE:
      return "Read/Write";
    case SCOPES.ADMIN:
      return "Administrative";
    case SCOPES.FULL:
      return "Full Access";
    default:
      if (scope.startsWith("db:")) {
        return `Database: ${scope.slice(3)}`;
      }
      if (scope.startsWith("schema:")) {
        return `Schema: ${scope.slice(7)}`;
      }
      if (scope.startsWith("table:")) {
        return `Table: ${scope.slice(6)}`;
      }
      return scope;
  }
}
