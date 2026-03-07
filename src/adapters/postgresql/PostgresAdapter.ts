/**
 * postgres-mcp - PostgreSQL Adapter
 *
 * Main PostgreSQL database adapter with connection pooling,
 * query execution, and tool registration.
 */

import type { PoolClient } from "pg";
import { DatabaseAdapter } from "../DatabaseAdapter.js";
import { ConnectionPool } from "../../pool/ConnectionPool.js";
import type {
  DatabaseConfig,
  QueryResult,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  HealthStatus,
  AdapterCapabilities,
  ToolDefinition,
  ResourceDefinition,
  PromptDefinition,
  ToolGroup,
} from "../../types/index.js";
import {
  ConnectionError,
  QueryError,
  TransactionError,
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { quoteIdentifier } from "../../utils/identifiers.js";
import { parsePostgresError } from "./tools/core/error-helpers.js";
import { VERSION } from "../../utils/version.js";

import { getCoreTools } from "./tools/core/index.js";
import { getTransactionTools } from "./tools/transactions.js";
import { getJsonbTools } from "./tools/jsonb/index.js";
import { getTextTools } from "./tools/text/index.js";
import { getPerformanceTools } from "./tools/performance/index.js";
import { getAdminTools } from "./tools/admin.js";
import { getMonitoringTools } from "./tools/monitoring/index.js";
import { getBackupTools } from "./tools/backup/index.js";
import { getSchemaTools } from "./tools/schema/index.js";
import { getVectorTools } from "./tools/vector/index.js";
import { getPostgisTools } from "./tools/postgis/index.js";
import { getPartitioningTools } from "./tools/partitioning/index.js";
import { getStatsTools } from "./tools/stats/index.js";
import { getCronTools } from "./tools/cron.js";
import { getPartmanTools } from "./tools/partman/index.js";
import { getKcacheTools } from "./tools/kcache.js";
import { getCitextTools } from "./tools/citext/index.js";
import { getLtreeTools } from "./tools/ltree.js";
import { getPgcryptoTools } from "./tools/pgcrypto.js";
import { getIntrospectionTools } from "./tools/introspection/index.js";
import { getCodeModeTools } from "./tools/codemode/index.js";
import { getPostgresResources } from "./resources/index.js";
import { getPostgresPrompts } from "./prompts/index.js";

/**
 * Metadata cache entry with TTL support
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Default cache TTL in milliseconds (configurable via METADATA_CACHE_TTL_MS env var)
 */
const DEFAULT_CACHE_TTL_MS = parseInt(
  process.env["METADATA_CACHE_TTL_MS"] ?? "30000",
  10,
);

export class PostgresAdapter extends DatabaseAdapter {
  readonly type = "postgresql" as const;
  readonly name = "PostgreSQL Adapter";
  readonly version = VERSION;

  private pool: ConnectionPool | null = null;
  private activeTransactions = new Map<string, PoolClient>();

  // Performance optimization: cache tool definitions (immutable after creation)
  private cachedToolDefinitions: ToolDefinition[] | null = null;

  // Performance optimization: cache metadata with TTL
  private metadataCache = new Map<string, CacheEntry<unknown>>();
  private cacheTtlMs = DEFAULT_CACHE_TTL_MS;

  /**
   * Get cached value if not expired
   */
  private getCached(key: string): unknown {
    const entry = this.metadataCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > this.cacheTtlMs) {
      this.metadataCache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  /**
   * Set cache value
   */
  private setCache(key: string, data: unknown): void {
    this.metadataCache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Clear all cached metadata (useful after schema changes)
   */
  clearMetadataCache(): void {
    this.metadataCache.clear();
  }

  // =========================================================================
  // Connection Lifecycle
  // =========================================================================

  async connect(config: DatabaseConfig): Promise<void> {
    if (this.connected) {
      logger.warn("Already connected");
      return;
    }

    // Build pool configuration
    const poolConfig = {
      host: config.host ?? "localhost",
      port: config.port ?? 5432,
      user: config.username ?? "postgres",
      password: config.password ?? "",
      database: config.database ?? "postgres",
      pool: config.pool,
      ssl: config.options?.ssl as boolean | undefined,
      statementTimeout: config.options?.statementTimeout,
      applicationName: config.options?.applicationName ?? "postgres-mcp",
    };

    this.pool = new ConnectionPool(poolConfig);

    try {
      await this.pool.initialize();
      this.connected = true;
      logger.info("PostgreSQL adapter connected", {
        host: poolConfig.host,
        port: poolConfig.port,
        database: poolConfig.database,
      });
    } catch (error) {
      this.pool = null;
      throw new ConnectionError(`Failed to connect: ${String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.pool) {
      return;
    }

    // Close any active transactions
    for (const [id, client] of this.activeTransactions) {
      try {
        await client.query("ROLLBACK");
        client.release();
        logger.warn(`Rolled back orphaned transaction: ${id}`);
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.activeTransactions.clear();

    await this.pool.shutdown();
    this.pool = null;
    this.connected = false;
    logger.info("PostgreSQL adapter disconnected");
  }

  async getHealth(): Promise<HealthStatus> {
    if (!this.pool) {
      return {
        connected: false,
        error: "Not connected",
      };
    }

    return this.pool.checkHealth();
  }

  // =========================================================================
  // Query Execution
  // =========================================================================

  async executeReadQuery(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult> {
    this.validateQuery(sql, true);
    return this.executeQuery(sql, params);
  }

  async executeWriteQuery(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult> {
    this.validateQuery(sql, false);
    return this.executeQuery(sql, params);
  }

  async executeQuery(sql: string, params?: unknown[]): Promise<QueryResult> {
    if (!this.pool) {
      throw new ConnectionError("Not connected to database");
    }

    const startTime = Date.now();

    try {
      const result = await this.pool.query(sql, params);
      const executionTimeMs = Date.now() - startTime;

      return {
        rows: result.rows,
        rowsAffected: result.rowCount ?? undefined,
        command: result.command,
        executionTimeMs,
        fields: result.fields?.map((f) => ({
          name: f.name,
          tableID: f.tableID,
          columnID: f.columnID,
          dataTypeID: f.dataTypeID,
          dataTypeSize: f.dataTypeSize,
          dataTypeModifier: f.dataTypeModifier,
          format: f.format,
        })),
      };
    } catch (error) {
      const err = error as Error;
      throw new QueryError(`Query failed: ${err.message}`, { sql });
    }
  }

  /**
   * Execute a query on a specific connection (for transactions)
   */
  async executeOnConnection(
    client: PoolClient,
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const result = await client.query(sql, params);
      const executionTimeMs = Date.now() - startTime;

      return {
        rows: result.rows as Record<string, unknown>[],
        rowsAffected: result.rowCount ?? undefined,
        command: result.command,
        executionTimeMs,
      };
    } catch (error) {
      const err = error as Error;
      throw new QueryError(`Query failed: ${err.message}`, { sql });
    }
  }

  // =========================================================================
  // Transaction Support
  // =========================================================================

  /**
   * Begin a transaction
   */
  async beginTransaction(isolationLevel?: string): Promise<string> {
    if (!this.pool) {
      throw new ConnectionError("Not connected");
    }

    const client = await this.pool.getConnection();
    const transactionId = crypto.randomUUID();

    try {
      let beginCmd = "BEGIN";
      if (isolationLevel) {
        beginCmd = `BEGIN ISOLATION LEVEL ${isolationLevel}`;
      }
      await client.query(beginCmd);
      this.activeTransactions.set(transactionId, client);
      return transactionId;
    } catch (error) {
      client.release();
      throw new TransactionError(
        `Failed to begin transaction: ${String(error)}`,
      );
    }
  }

  /**
   * Commit a transaction
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      throw new TransactionError(`Transaction not found: ${transactionId}`);
    }

    try {
      // Probe for aborted transaction state before committing.
      // In PostgreSQL, if any statement in a transaction fails, the transaction
      // enters an "aborted" state where only ROLLBACK is accepted. A COMMIT on
      // an aborted transaction silently performs a ROLLBACK — this probe detects
      // that situation and reports it clearly instead of lying with "committed".
      try {
        await client.query("SELECT 1");
      } catch (probeError) {
        const pgCode = (probeError as Record<string, unknown>)["code"] as
          | string
          | undefined;
        if (
          pgCode === "25P02" ||
          (probeError instanceof Error &&
            /current transaction is aborted/i.test(probeError.message))
        ) {
          // Transaction is aborted — rollback and report accurately.
          // Note: client.release() and Map cleanup are handled by the outer finally block.
          try {
            await client.query("ROLLBACK");
          } catch {
            // Ignore rollback failure — cleanup happens in finally
          }
          throw new TransactionError(
            "Transaction is in an aborted state and cannot be committed. " +
              "PostgreSQL has discarded all changes. " +
              "A previous statement in this transaction failed, putting it into an error state. " +
              "The transaction has been rolled back.",
          );
        }
        // Non-aborted probe error — let it fall through to COMMIT
      }

      await client.query("COMMIT");
    } finally {
      client.release();
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Rollback a transaction
   */
  async rollbackTransaction(transactionId: string): Promise<void> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      throw new TransactionError(`Transaction not found: ${transactionId}`);
    }

    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Create a savepoint
   */
  async createSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      throw new TransactionError(`Transaction not found: ${transactionId}`);
    }

    try {
      await client.query(`SAVEPOINT ${quoteIdentifier(savepointName)}`);
    } catch (error) {
      throw parsePostgresError(error, {
        tool: "pg_transaction_savepoint",
      });
    }
  }

  /**
   * Release a savepoint
   */
  async releaseSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      throw new TransactionError(`Transaction not found: ${transactionId}`);
    }

    try {
      await client.query(`RELEASE SAVEPOINT ${quoteIdentifier(savepointName)}`);
    } catch (error) {
      throw parsePostgresError(error, {
        tool: "pg_transaction_release",
      });
    }
  }

  /**
   * Rollback to a savepoint
   */
  async rollbackToSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      throw new TransactionError(`Transaction not found: ${transactionId}`);
    }

    try {
      await client.query(
        `ROLLBACK TO SAVEPOINT ${quoteIdentifier(savepointName)}`,
      );
    } catch (error) {
      throw parsePostgresError(error, {
        tool: "pg_transaction_rollback_to",
      });
    }
  }

  /**
   * Get connection for a transaction
   */
  getTransactionConnection(transactionId: string): PoolClient | undefined {
    return this.activeTransactions.get(transactionId);
  }

  /**
   * Get all active transaction IDs
   * Used by code mode to track transactions started during execution
   */
  getActiveTransactionIds(): string[] {
    return Array.from(this.activeTransactions.keys());
  }

  /**
   * Rollback and cleanup a specific transaction by ID
   * Used for cleaning up orphaned transactions after code mode errors
   *
   * @param transactionId - The transaction ID to cleanup
   * @returns true if transaction was found and cleaned up, false if not found
   */
  async cleanupTransaction(transactionId: string): Promise<boolean> {
    const client = this.activeTransactions.get(transactionId);
    if (!client) {
      return false;
    }

    try {
      await client.query("ROLLBACK");
      client.release();
      this.activeTransactions.delete(transactionId);
      logger.warn(
        `Cleaned up orphaned transaction during code mode error recovery: ${transactionId}`,
        { module: "CODEMODE" as const },
      );
      return true;
    } catch (error) {
      // Best effort cleanup - log and continue
      logger.error("Failed to cleanup orphaned transaction", {
        module: "CODEMODE" as const,
        error: error instanceof Error ? error.message : String(error),
        transactionId,
      });
      // Still try to release the client
      try {
        client.release(true); // Force release with error
        this.activeTransactions.delete(transactionId);
      } catch {
        // Ignore - connection may be broken
      }
      return false;
    }
  }

  // =========================================================================
  // Schema Operations
  // =========================================================================

  async getSchema(): Promise<SchemaInfo> {
    const tables = await this.listTables();
    const views = tables.filter((t) => t.type === "view");
    const materializedViews = tables.filter(
      (t) => t.type === "materialized_view",
    );
    const realTables = tables.filter(
      (t) => t.type === "table" || t.type === "partitioned_table",
    );

    // Performance optimization: fetch all indexes in a single query instead of N+1
    const indexes = await this.getAllIndexes();

    return {
      tables: realTables,
      views,
      materializedViews,
      indexes,
    };
  }

  /**
   * Get all indexes across all user tables in a single query
   * Performance optimization: eliminates N+1 query pattern
   * Public so it can be used by pg_get_indexes when no table is specified
   */
  async getAllIndexes(): Promise<IndexInfo[]> {
    // Check cache first
    const cached = this.getCached("all_indexes") as IndexInfo[] | undefined;
    if (cached) return cached;

    const result = await this.executeQuery(`
            SELECT
                i.relname as name,
                t.relname as table_name,
                n.nspname as schema_name,
                am.amname as type,
                ix.indisunique as is_unique,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns,
                pg_relation_size(i.oid) as size_bytes,
                COALESCE(pg_stat_get_numscans(i.oid), 0) as num_scans,
                COALESCE(pg_stat_get_tuples_returned(i.oid), 0) as tuples_read,
                COALESCE(pg_stat_get_tuples_fetched(i.oid), 0) as tuples_fetched
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname !~ '^pg_toast'
            GROUP BY i.relname, t.relname, n.nspname, am.amname, ix.indisunique, ix.indexrelid, i.oid
            ORDER BY n.nspname, t.relname, i.relname
        `);

    const indexes = (result.rows ?? []).map((row) => {
      const rawColumns = this.parseColumnsArray(row["columns"]);
      const definition = row["definition"] as string;
      const indexType = row["type"] as IndexInfo["type"];
      return {
        name: row["name"] as string,
        tableName: row["table_name"] as string,
        schemaName: row["schema_name"] as string,
        columns: this.extractIndexColumns(rawColumns, definition),
        unique: row["is_unique"] as boolean,
        type: indexType,
        sizeBytes: Number(row["size_bytes"]) || undefined,
        numberOfScans: Number(row["num_scans"]) || undefined,
        tuplesRead: Number(row["tuples_read"]) || undefined,
        tuplesFetched: Number(row["tuples_fetched"]) || undefined,
      };
    });

    this.setCache("all_indexes", indexes);
    return indexes;
  }

  /**
   * Parse columns from PostgreSQL array format
   * Handles both native arrays and string representations like "{col1,col2}"
   */
  private parseColumnsArray(columns: unknown): string[] {
    if (Array.isArray(columns)) {
      return columns as string[];
    }
    if (typeof columns === "string") {
      // Handle PostgreSQL array string format: "{col1,col2}"
      const trimmed = columns.replace(/^{|}$/g, "");
      if (trimmed === "") return [];
      return trimmed.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    }
    return [];
  }

  /**
   * Extract expression columns from index definition when column names are NULL.
   * Expression indexes (like LOWER(name)) have attnum=0 which returns NULL from pg_attribute.
   * This method parses the index definition to extract the actual expressions.
   */
  private extractIndexColumns(columns: string[], definition: string): string[] {
    // If no NULL columns, return as-is
    if (!columns.some((c) => c === null || c === "NULL" || c === "")) {
      return columns;
    }

    // Find the expression portion with balanced parentheses
    // Format: CREATE [UNIQUE] INDEX name ON table USING method (col1, expr1, ...) [WHERE ...]
    const exprPart = this.extractIndexExpressionPart(definition);
    if (!exprPart) {
      return columns;
    }

    // Parse the column expressions, handling nested parentheses
    const exprs = this.parseIndexExpressions(exprPart);

    // If counts don't match, something is off - return original
    if (exprs.length !== columns.length) {
      return columns;
    }

    // Replace NULL columns with the parsed expressions
    return columns.map((col, i) => {
      if (col === null || col === "NULL" || col === "") {
        return exprs[i]?.trim() ?? col;
      }
      return col;
    });
  }

  /**
   * Extract the column expression part from an index definition, handling nested parentheses.
   * E.g., "CREATE INDEX idx ON tbl USING btree (lower(name))" → "lower(name)"
   */
  private extractIndexExpressionPart(definition: string): string | null {
    // Find "USING method (" or just the first "(" after ON
    const usingMatch = /USING\s+\w+\s*\(/i.exec(definition);
    if (!usingMatch) {
      return null;
    }

    const startIdx = usingMatch.index + usingMatch[0].length - 1; // Position of opening paren
    let depth = 0;
    let endIdx = -1;

    for (let i = startIdx; i < definition.length; i++) {
      if (definition[i] === "(") {
        depth++;
      } else if (definition[i] === ")") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1) {
      return null;
    }

    return definition.substring(startIdx + 1, endIdx);
  }

  /**
   * Parse index expressions from the column list, handling nested parentheses.
   * E.g., "LOWER(name), id, UPPER(TRIM(email))" → ["LOWER(name)", "id", "UPPER(TRIM(email))"]
   */
  private parseIndexExpressions(columnList: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;

    for (const char of columnList) {
      if (char === "(") {
        depth++;
        current += char;
      } else if (char === ")") {
        depth--;
        current += char;
      } else if (char === "," && depth === 0) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }

    return result;
  }

  async listTables(): Promise<TableInfo[]> {
    // Performance optimization: return cached result if within TTL
    const cached = this.getCached("list_tables") as TableInfo[] | undefined;
    if (cached) return cached;

    const result = await this.executeQuery(`
            SELECT
                c.relname as name,
                n.nspname as schema,
                CASE c.relkind
                    WHEN 'r' THEN 'table'
                    WHEN 'v' THEN 'view'
                    WHEN 'm' THEN 'materialized_view'
                    WHEN 'f' THEN 'foreign_table'
                    WHEN 'p' THEN 'partitioned_table'
                END as type,
                pg_catalog.pg_get_userbyid(c.relowner) as owner,
                CASE WHEN c.reltuples = -1 THEN NULL ELSE c.reltuples END::bigint as row_count,
                COALESCE(s.n_live_tup, 0)::bigint as live_row_estimate,
                (c.reltuples = -1) as stats_stale,
                pg_catalog.pg_table_size(c.oid) as size_bytes,
                pg_catalog.pg_total_relation_size(c.oid) as total_size_bytes,
                obj_description(c.oid, 'pg_class') as comment
            FROM pg_catalog.pg_class c
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
            WHERE c.relkind IN ('r', 'v', 'm', 'f', 'p')
              AND n.nspname NOT IN ('pg_catalog', 'information_schema')
              AND n.nspname !~ '^pg_toast'
            ORDER BY n.nspname, c.relname
        `);

    const tables = (result.rows ?? []).map((row) => {
      const rowCount = row["row_count"];
      const liveRowEstimate = Number(row["live_row_estimate"]) || 0;
      const statsStale = row["stats_stale"] === true;

      // Use live_row_estimate as fallback when stats are stale
      const effectiveRowCount =
        rowCount !== null ? Number(rowCount) : liveRowEstimate;

      return {
        name: row["name"] as string,
        schema: row["schema"] as string,
        type: row["type"] as TableInfo["type"],
        owner: row["owner"] as string,
        rowCount: effectiveRowCount,
        sizeBytes: Number(row["size_bytes"]) || undefined,
        totalSizeBytes: Number(row["total_size_bytes"]) || undefined,
        comment: row["comment"] as string | undefined,
        statsStale,
      };
    });

    this.setCache("list_tables", tables);
    return tables;
  }

  async describeTable(
    tableName: string,
    schemaName = "public",
  ): Promise<TableInfo> {
    // Performance optimization: return cached result if within TTL
    const cacheKey = `describe:${schemaName}.${tableName}`;
    const cached = this.getCached(cacheKey) as TableInfo | undefined;
    if (cached) return cached;

    // Get column information including foreign key references
    const columnsResult = await this.executeQuery(
      `
            SELECT
                a.attname as name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) as type,
                NOT a.attnotnull as nullable,
                COALESCE(
                    (SELECT true FROM pg_constraint c
                     WHERE c.conrelid = a.attrelid
                     AND a.attnum = ANY(c.conkey)
                     AND c.contype = 'p'),
                    false
                ) as primary_key,
                pg_get_expr(d.adbin, d.adrelid) as default_value,
                a.attgenerated != '' as is_generated,
                pg_get_expr(d.adbin, d.adrelid) as generated_expression,
                col_description(a.attrelid, a.attnum) as comment,
                -- Foreign key reference for this column
                (SELECT json_build_object(
                    'table', ref_t.relname,
                    'schema', ref_n.nspname,
                    'column', ref_a.attname
                )
                FROM pg_constraint c
                JOIN pg_class ref_t ON ref_t.oid = c.confrelid
                JOIN pg_namespace ref_n ON ref_n.oid = ref_t.relnamespace
                JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid
                    AND ref_a.attnum = c.confkey[array_position(c.conkey, a.attnum)]
                WHERE c.conrelid = a.attrelid
                  AND a.attnum = ANY(c.conkey)
                  AND c.contype = 'f'
                LIMIT 1
                ) as foreign_key
            FROM pg_catalog.pg_attribute a
            LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid, d.adnum)
            WHERE a.attrelid = ($1 || '.' || $2)::regclass
              AND a.attnum > 0
              AND NOT a.attisdropped
            ORDER BY a.attnum
        `,
      [schemaName, tableName],
    );

    const columns: ColumnInfo[] = (columnsResult.rows ?? []).map((row) => {
      const isGenerated = row["is_generated"] as boolean;
      const fkRef = row["foreign_key"] as {
        table: string;
        schema: string;
        column: string;
      } | null;
      const nullable = row["nullable"] as boolean;
      return {
        name: row["name"] as string,
        type: row["type"] as string,
        nullable,
        notNull: !nullable, // Alias for consistency with createTable API
        primaryKey: row["primary_key"] as boolean,
        defaultValue: row["default_value"],
        isGenerated,
        // Only set generatedExpression for actual generated columns
        generatedExpression: isGenerated
          ? (row["generated_expression"] as string | undefined)
          : undefined,
        comment: row["comment"] as string | undefined,
        // Include foreign key reference if present
        foreignKey: fkRef
          ? {
              table: fkRef.table,
              schema: fkRef.schema,
              column: fkRef.column,
            }
          : undefined,
      };
    });

    // Get table info
    const tableResult = await this.executeQuery(
      `
            SELECT
                CASE c.relkind
                    WHEN 'r' THEN 'table'
                    WHEN 'v' THEN 'view'
                    WHEN 'm' THEN 'materialized_view'
                    WHEN 'f' THEN 'foreign_table'
                    WHEN 'p' THEN 'partitioned_table'
                END as type,
                pg_catalog.pg_get_userbyid(c.relowner) as owner,
                CASE WHEN c.reltuples = -1 THEN NULL ELSE c.reltuples END::bigint as row_count,
                COALESCE(s.n_live_tup, 0)::bigint as live_row_estimate,
                (c.reltuples = -1) as stats_stale,
                obj_description(c.oid, 'pg_class') as comment,
                c.relkind = 'p' as is_partitioned,
                pg_get_partkeydef(c.oid) as partition_key
            FROM pg_catalog.pg_class c
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
            WHERE c.relname = $1
              AND n.nspname = $2
        `,
      [tableName, schemaName],
    );

    const tableRow = tableResult.rows?.[0];

    // Get indexes for this table
    const indexesResult = await this.executeQuery(
      `
            SELECT
                i.relname as name,
                am.amname as type,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1 AND n.nspname = $2
            GROUP BY i.relname, am.amname, ix.indisunique, ix.indisprimary, ix.indexrelid
            ORDER BY i.relname
        `,
      [tableName, schemaName],
    );

    const indexes = (indexesResult.rows ?? []).map((row) => {
      const rawColumns = this.parseColumnsArray(row["columns"]);
      const definition = row["definition"] as string;
      return {
        name: row["name"] as string,
        type: row["type"] as string,
        isUnique: row["is_unique"] as boolean,
        isPrimary: row["is_primary"] as boolean,
        columns: this.extractIndexColumns(rawColumns, definition),
        definition,
      };
    });

    // Get constraints (CHECK, UNIQUE, PRIMARY KEY, EXCLUSION - FK handled separately)
    const constraintsResult = await this.executeQuery(
      `
            SELECT
                c.conname as name,
                CASE c.contype
                    WHEN 'p' THEN 'primary_key'
                    WHEN 'c' THEN 'check'
                    WHEN 'u' THEN 'unique'
                    WHEN 'x' THEN 'exclusion'
                END as type,
                pg_get_constraintdef(c.oid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) FILTER (WHERE a.attname IS NOT NULL) as columns
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS x(attnum, ordinality) ON true
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1
              AND n.nspname = $2
              AND c.contype IN ('p', 'c', 'u', 'x')
            GROUP BY c.conname, c.contype, c.oid
            ORDER BY
                CASE c.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 ELSE 3 END,
                c.conname
        `,
      [tableName, schemaName],
    );

    const constraints = (constraintsResult.rows ?? []).map((row) => ({
      name: row["name"] as string,
      type: row["type"] as string,
      definition: row["definition"] as string,
      columns: this.parseColumnsArray(row["columns"]),
    }));

    // Add NOT NULL "constraints" from column info (synthetic constraint entries)
    const notNullConstraints: typeof constraints = [];
    for (const col of columns) {
      if (!col.nullable && !col.primaryKey) {
        // Skip primary key columns as they have inherent NOT NULL
        notNullConstraints.push({
          name: `${col.name}_not_null`,
          type: "not_null",
          definition: `NOT NULL`,
          columns: [col.name],
        });
      }
    }

    // Get foreign keys
    const foreignKeysResult = await this.executeQuery(
      `
            SELECT
                c.conname as name,
                a.attname as column,
                ref_t.relname as referenced_table,
                ref_n.nspname as referenced_schema,
                ref_a.attname as referenced_column,
                CASE c.confupdtype
                    WHEN 'a' THEN 'NO ACTION'
                    WHEN 'r' THEN 'RESTRICT'
                    WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL'
                    WHEN 'd' THEN 'SET DEFAULT'
                END as on_update,
                CASE c.confdeltype
                    WHEN 'a' THEN 'NO ACTION'
                    WHEN 'r' THEN 'RESTRICT'
                    WHEN 'c' THEN 'CASCADE'
                    WHEN 'n' THEN 'SET NULL'
                    WHEN 'd' THEN 'SET DEFAULT'
                END as on_delete
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
            JOIN pg_class ref_t ON ref_t.oid = c.confrelid
            JOIN pg_namespace ref_n ON ref_n.oid = ref_t.relnamespace
            JOIN pg_attribute ref_a ON ref_a.attrelid = ref_t.oid AND ref_a.attnum = ANY(c.confkey)
            WHERE t.relname = $1
              AND n.nspname = $2
              AND c.contype = 'f'
            ORDER BY c.conname
        `,
      [tableName, schemaName],
    );

    const foreignKeys = (foreignKeysResult.rows ?? []).map((row) => ({
      name: row["name"] as string,
      column: row["column"] as string,
      referencedTable: row["referenced_table"] as string,
      referencedSchema: row["referenced_schema"] as string,
      referencedColumn: row["referenced_column"] as string,
      onUpdate: row["on_update"] as string,
      onDelete: row["on_delete"] as string,
    }));

    // Extract primary key columns from constraints for convenience
    const pkConstraint = constraints.find((c) => c.type === "primary_key");
    const primaryKey = pkConstraint?.columns ?? null;

    const tableInfo: TableInfo = {
      name: tableName,
      schema: schemaName,
      type: (tableRow?.["type"] as TableInfo["type"]) ?? "table",
      owner: tableRow?.["owner"] as string | undefined,
      rowCount: (() => {
        const rc = tableRow?.["row_count"];
        const liveEst = Number(tableRow?.["live_row_estimate"]) || 0;
        return rc !== null && rc !== undefined ? Number(rc) : liveEst;
      })(),
      comment: tableRow?.["comment"] as string | undefined,
      isPartitioned: tableRow?.["is_partitioned"] as boolean,
      partitionKey: tableRow?.["partition_key"] as string | undefined,
      columns,
      primaryKey,
      indexes,
      constraints: [...constraints, ...notNullConstraints],
      foreignKeys,
    };

    this.setCache(cacheKey, tableInfo);
    return tableInfo;
  }

  async listSchemas(): Promise<string[]> {
    const result = await this.executeQuery(`
            SELECT nspname
            FROM pg_catalog.pg_namespace
            WHERE nspname NOT IN ('pg_catalog', 'information_schema')
              AND nspname !~ '^pg_toast'
              AND nspname !~ '^pg_temp'
            ORDER BY nspname
        `);
    return (result.rows ?? []).map((row) => row["nspname"] as string);
  }

  /**
   * Get indexes for a table
   */
  async getTableIndexes(
    tableName: string,
    schemaName = "public",
  ): Promise<IndexInfo[]> {
    const result = await this.executeQuery(
      `
            SELECT
                i.relname as name,
                am.amname as type,
                ix.indisunique as is_unique,
                pg_get_indexdef(ix.indexrelid) as definition,
                array_agg(a.attname ORDER BY x.ordinality) as columns,
                pg_relation_size(i.oid) as size_bytes,
                COALESCE(pg_stat_get_numscans(i.oid), 0) as num_scans,
                COALESCE(pg_stat_get_tuples_returned(i.oid), 0) as tuples_read,
                COALESCE(pg_stat_get_tuples_fetched(i.oid), 0) as tuples_fetched
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
            LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
            WHERE t.relname = $1
              AND n.nspname = $2
            GROUP BY i.relname, am.amname, ix.indisunique, ix.indexrelid, i.oid
            ORDER BY i.relname
        `,
      [tableName, schemaName],
    );

    return (result.rows ?? []).map((row) => {
      const rawColumns = this.parseColumnsArray(row["columns"]);
      const definition = row["definition"] as string;
      const indexType = row["type"] as IndexInfo["type"];
      return {
        name: row["name"] as string,
        tableName,
        schemaName,
        columns: this.extractIndexColumns(rawColumns, definition),
        unique: row["is_unique"] as boolean,
        type: indexType,
        sizeBytes: Number(row["size_bytes"]) || undefined,
        numberOfScans: Number(row["num_scans"]) || undefined,
        tuplesRead: Number(row["tuples_read"]) || undefined,
        tuplesFetched: Number(row["tuples_fetched"]) || undefined,
      };
    });
  }

  /**
   * Check if an extension is available
   */
  async isExtensionAvailable(extensionName: string): Promise<boolean> {
    const result = await this.executeQuery(
      `
            SELECT EXISTS(
                SELECT 1 FROM pg_extension WHERE extname = $1
            ) as available
        `,
      [extensionName],
    );
    return (result.rows?.[0]?.["available"] as boolean) ?? false;
  }

  // =========================================================================
  // Capabilities
  // =========================================================================

  getCapabilities(): AdapterCapabilities {
    return {
      json: true,
      fullTextSearch: true,
      vector: true, // With pgvector extension
      geospatial: true, // With PostGIS extension
      transactions: true,
      preparedStatements: true,
      connectionPooling: true,
      partitioning: true,
      replication: true,
      cte: true,
      windowFunctions: true,
    };
  }

  getSupportedToolGroups(): ToolGroup[] {
    return [
      "core",
      "transactions",
      "jsonb",
      "text",
      "performance",
      "admin",
      "monitoring",
      "backup",
      "schema",
      "vector",
      "postgis",
      "partitioning",
      "stats",
      "cron",
      "partman",
      "kcache",
      "citext",
      "ltree",
      "pgcrypto",
      "introspection",
      "codemode",
    ];
  }

  // =========================================================================
  // Tool/Resource/Prompt Registration
  // =========================================================================

  getToolDefinitions(): ToolDefinition[] {
    // Performance optimization: cache tool definitions (immutable after creation)
    if (this.cachedToolDefinitions) {
      return this.cachedToolDefinitions;
    }

    this.cachedToolDefinitions = [
      ...getCoreTools(this),
      ...getTransactionTools(this),
      ...getJsonbTools(this),
      ...getTextTools(this),
      ...getPerformanceTools(this),
      ...getAdminTools(this),
      ...getMonitoringTools(this),
      ...getBackupTools(this),
      ...getSchemaTools(this),
      ...getVectorTools(this),
      ...getPostgisTools(this),
      ...getPartitioningTools(this),
      ...getStatsTools(this),
      ...getCronTools(this),
      ...getPartmanTools(this),
      ...getKcacheTools(this),
      ...getCitextTools(this),
      ...getLtreeTools(this),
      ...getPgcryptoTools(this),
      ...getIntrospectionTools(this),
      ...getCodeModeTools(this),
    ];

    return this.cachedToolDefinitions;
  }

  getResourceDefinitions(): ResourceDefinition[] {
    return getPostgresResources(this);
  }

  getPromptDefinitions(): PromptDefinition[] {
    return getPostgresPrompts(this);
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  /**
   * Get the connection pool (for monitoring tools)
   */
  getPool(): ConnectionPool | null {
    return this.pool;
  }
}
