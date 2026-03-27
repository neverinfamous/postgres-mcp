/**
 * postgres-mcp - PostgreSQL Adapter
 *
 * Main PostgreSQL database adapter with connection pooling,
 * query execution, and tool registration.
 *
 * Transaction operations are in ./transaction-operations.ts.
 */

import type { PoolClient } from "pg";
import { DatabaseAdapter } from "../database-adapter.js";
import {
  DEFAULT_CACHE_TTL_MS,
  type MetadataCache,
  getCached,
  setCache,
  invalidateTableCache,
  invalidateSchemaCache,
  invalidateCacheForDdl,
} from "./adapter-cache.js";
import { ConnectionPool } from "../../pool/connection-pool.js";
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
} from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { VERSION } from "../../utils/version.js";
import {
  getSchemaInfo,
  queryAllIndexes,
  queryListTables,
  queryDescribeTable,
  queryListSchemas,
  queryTableIndexes,
  queryIsExtensionAvailable,
} from "./schema-operations/index.js";
import type { CacheHelpers } from "./schema-operations/index.js";
import {
  beginTransaction as txBegin,
  commitTransaction as txCommit,
  rollbackTransaction as txRollback,
  createSavepoint as txCreateSavepoint,
  releaseSavepoint as txReleaseSavepoint,
  rollbackToSavepoint as txRollbackToSavepoint,
  cleanupTransaction as txCleanup,
} from "./transaction-operations.js";

import {
  getSupportedPostgresToolGroups,
  buildPostgresToolDefinitions,
  buildPostgresResourceDefinitions,
  buildPostgresPromptDefinitions,
} from "./tool-registry.js";
import type { BackupManager } from "../../audit/backup-manager.js";

export class PostgresAdapter extends DatabaseAdapter {
  readonly type = "postgresql" as const;
  readonly name = "PostgreSQL Adapter";
  readonly version = VERSION;

  private pool: ConnectionPool | null = null;
  private activeTransactions = new Map<string, PoolClient>();
  private backupManager: BackupManager | null = null;

  // Performance optimization: cache tool definitions (immutable after creation)
  private cachedToolDefinitions: ToolDefinition[] | null = null;

  // Performance optimization: cache metadata with TTL
  private metadataCache: MetadataCache = new Map();
  private cacheTtlMs = DEFAULT_CACHE_TTL_MS;

  /**
   * Invalidate cached metadata for a specific table.
   * Called after DDL operations that change table structure.
   */
  invalidateTableCache(tableName: string, schemaName = "public"): void {
    invalidateTableCache(this.metadataCache, tableName, schemaName);
  }

  /**
   * Invalidate all schema-related metadata caches.
   * Used when the specific affected table cannot be determined.
   */
  invalidateSchemaCache(): void {
    invalidateSchemaCache(this.metadataCache);
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
    } catch (error: unknown) {
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
    const result = await this.executeQuery(sql, params);
    // Invalidate metadata cache for DDL statements so subsequent
    // describeTable / listTables calls return fresh results
    invalidateCacheForDdl(this.metadataCache, sql);
    return result;
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new QueryError(
        `Query failed: ${message}`,
        { sql },
        error instanceof Error ? { cause: error } : undefined,
      );
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new QueryError(
        `Query failed: ${message}`,
        { sql },
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }

  // =========================================================================
  // Transaction Support (delegated to transaction-operations.ts)
  // =========================================================================

  async beginTransaction(isolationLevel?: string): Promise<string> {
    return txBegin(this.pool, this.activeTransactions, isolationLevel);
  }

  async commitTransaction(transactionId: string): Promise<void> {
    return txCommit(this.activeTransactions, transactionId);
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    return txRollback(this.activeTransactions, transactionId);
  }

  async createSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    return txCreateSavepoint(
      this.activeTransactions,
      transactionId,
      savepointName,
    );
  }

  async releaseSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    return txReleaseSavepoint(
      this.activeTransactions,
      transactionId,
      savepointName,
    );
  }

  async rollbackToSavepoint(
    transactionId: string,
    savepointName: string,
  ): Promise<void> {
    return txRollbackToSavepoint(
      this.activeTransactions,
      transactionId,
      savepointName,
    );
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
   */
  async cleanupTransaction(transactionId: string): Promise<boolean> {
    return txCleanup(this.activeTransactions, transactionId);
  }

  // =========================================================================
  // Schema Operations (delegated to schema-operations.ts)
  // =========================================================================

  /**
   * Cache helpers object for schema operation functions
   */
  private get cacheHelpers(): CacheHelpers {
    return {
      getCached: (key: string) => getCached(this.metadataCache, key, this.cacheTtlMs),
      setCache: (key: string, data: unknown) => {
        setCache(this.metadataCache, key, data);
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
    return getSupportedPostgresToolGroups();
  }

  // =========================================================================
  // Tool/Resource/Prompt Registration
  // =========================================================================

  getToolDefinitions(): ToolDefinition[] {
    // Performance optimization: cache tool definitions (immutable after creation)
    if (this.cachedToolDefinitions) {
      return this.cachedToolDefinitions;
    }

    this.cachedToolDefinitions = buildPostgresToolDefinitions(
      this,
      this.backupManager,
    );

    return this.cachedToolDefinitions;
  }

  getResourceDefinitions(): ResourceDefinition[] {
    return buildPostgresResourceDefinitions(this);
  }

  getPromptDefinitions(): PromptDefinition[] {
    return buildPostgresPromptDefinitions(this);
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

  /**
   * Set the backup manager reference for audit backup tools.
   * Called by PostgresMcpServer after creating the BackupManager.
   */
  setBackupManager(manager: BackupManager): void {
    this.backupManager = manager;
    // Invalidate cached tool definitions so new tools are included
    this.cachedToolDefinitions = null;
  }
}
