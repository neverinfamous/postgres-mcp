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
import {
  getSchemaInfo,
  queryAllIndexes,
  queryListTables,
  queryDescribeTable,
  queryListSchemas,
  queryTableIndexes,
  queryIsExtensionAvailable,
} from "./schema-operations.js";
import type { CacheHelpers } from "./schema-operations.js";

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
  // Schema Operations (delegated to schema-operations.ts)
  // =========================================================================

  /**
   * Cache helpers object for schema operation functions
   */
  private get cacheHelpers(): CacheHelpers {
    return {
      getCached: (key: string) => this.getCached(key),
      setCache: (key: string, data: unknown) => {
        this.setCache(key, data);
      },
    };
  }

  async getSchema(): Promise<SchemaInfo> {
    return getSchemaInfo(
      (sql, params) => this.executeQuery(sql, params),
      this.cacheHelpers,
    );
  }

  /**
   * Get all indexes across all user tables in a single query
   * Performance optimization: eliminates N+1 query pattern
   * Public so it can be used by pg_get_indexes when no table is specified
   */
  async getAllIndexes(): Promise<IndexInfo[]> {
    return queryAllIndexes(
      (sql, params) => this.executeQuery(sql, params),
      this.cacheHelpers,
    );
  }

  async listTables(): Promise<TableInfo[]> {
    return queryListTables(
      (sql, params) => this.executeQuery(sql, params),
      this.cacheHelpers,
    );
  }

  async describeTable(
    tableName: string,
    schemaName = "public",
  ): Promise<TableInfo> {
    return queryDescribeTable(
      (sql, params) => this.executeQuery(sql, params),
      this.cacheHelpers,
      tableName,
      schemaName,
    );
  }

  async listSchemas(): Promise<string[]> {
    return queryListSchemas((sql, params) => this.executeQuery(sql, params));
  }

  /**
   * Get indexes for a table
   */
  async getTableIndexes(
    tableName: string,
    schemaName = "public",
  ): Promise<IndexInfo[]> {
    return queryTableIndexes(
      (sql, params) => this.executeQuery(sql, params),
      tableName,
      schemaName,
    );
  }

  /**
   * Check if an extension is available
   */
  async isExtensionAvailable(extensionName: string): Promise<boolean> {
    return queryIsExtensionAvailable(
      (sql, params) => this.executeQuery(sql, params),
      extensionName,
    );
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
