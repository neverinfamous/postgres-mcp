/**
 * postgres-mcp — Adapter Metadata Cache
 *
 * TTL-based in-memory cache for schema metadata (table descriptions,
 * index lists). Extracted from `postgres-adapter.ts` to keep that file
 * under the 500-line target.
 *
 * Exported helpers are used exclusively by `PostgresAdapter`.
 */

/**
 * Default cache TTL in milliseconds (configurable via METADATA_CACHE_TTL_MS env var).
 */
export const DEFAULT_CACHE_TTL_MS = parseInt(
  process.env["METADATA_CACHE_TTL_MS"] ?? "30000",
  10,
);

/**
 * Metadata cache entry with TTL support.
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export type MetadataCache = Map<string, CacheEntry<unknown>>;

/**
 * Retrieve a cached value if it has not yet expired.
 * Returns `undefined` on a cache miss or TTL expiry.
 */
export function getCached(
  cache: MetadataCache,
  key: string,
  ttlMs: number,
): unknown {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

/**
 * Store a value in the metadata cache with the current timestamp.
 */
export function setCache(
  cache: MetadataCache,
  key: string,
  data: unknown,
): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Invalidate cached metadata for a specific table.
 * Called after DDL operations that change table structure.
 */
export function invalidateTableCache(
  cache: MetadataCache,
  tableName: string,
  schemaName = "public",
): void {
  cache.delete(`describe:${schemaName}.${tableName}`);
  cache.delete("list_tables");
  cache.delete("all_indexes");
}

/**
 * Invalidate all schema-related metadata caches.
 * Used when the specific affected table cannot be determined.
 */
export function invalidateSchemaCache(cache: MetadataCache): void {
  for (const key of cache.keys()) {
    if (
      key.startsWith("describe:") ||
      key === "list_tables" ||
      key === "all_indexes"
    ) {
      cache.delete(key);
    }
  }
}

/**
 * Detect DDL statements and invalidate the appropriate cache entries.
 * Extracts the table name from common DDL patterns; falls back to
 * full schema cache invalidation for ambiguous statements.
 */
export function invalidateCacheForDdl(cache: MetadataCache, sql: string): void {
  const normalized = sql.replace(/\s+/g, " ").trim().toUpperCase();

  // Match: ALTER TABLE, CREATE TABLE, DROP TABLE
  const tableMatch =
    /^(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:"([^"]+)"\.)?("([^"]+)"|([a-z_][a-z0-9_]*))/i.exec(
      sql.replace(/\s+/g, " ").trim(),
    );
  if (tableMatch) {
    const schema = tableMatch[1] ?? "public";
    const table = tableMatch[3] ?? tableMatch[4] ?? "";
    if (table) {
      invalidateTableCache(cache, table, schema);
      return;
    }
  }

  // Match: TRUNCATE [TABLE]
  const truncateMatch =
    /^TRUNCATE\s+(?:TABLE\s+)?(?:"([^"]+)"\.)?("([^"]+)"|([a-z_][a-z0-9_]*))/i.exec(
      sql.replace(/\s+/g, " ").trim(),
    );
  if (truncateMatch) {
    const schema = truncateMatch[1] ?? "public";
    const table = truncateMatch[3] ?? truncateMatch[4] ?? "";
    if (table) {
      invalidateTableCache(cache, table, schema);
      return;
    }
  }

  // Match: CREATE/DROP INDEX — invalidate all (index targets are harder to parse)
  if (
    normalized.startsWith("CREATE INDEX") ||
    normalized.startsWith("CREATE UNIQUE INDEX") ||
    normalized.startsWith("DROP INDEX")
  ) {
    invalidateSchemaCache(cache);
    return;
  }

  // Any other DDL-like statement: broad invalidation as safety net
  if (
    normalized.startsWith("ALTER ") ||
    normalized.startsWith("CREATE ") ||
    normalized.startsWith("DROP ")
  ) {
    invalidateSchemaCache(cache);
  }
}
