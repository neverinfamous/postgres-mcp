/**
 * postgres-mcp - Connection Pool Manager
 *
 * Wraps pg connection pooling with health monitoring,
 * statistics tracking, and graceful shutdown support.
 */

import pg from "pg";
import type { PoolClient, QueryResult as PgQueryResult } from "pg";
import type { PoolConfig, PoolStats, HealthStatus } from "../types/index.js";
import { PoolError, ConnectionError } from "../types/index.js";
import { logger } from "../utils/logger.js";

/**
 * Default statement timeout in milliseconds.
 * Prevents runaway agent queries from holding connections indefinitely.
 * Set to 0 to disable (not recommended for production).
 */
const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

/**
 * Connection pool configuration with defaults
 */
export interface ConnectionPoolConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  pool?: PoolConfig | undefined;
  ssl?: pg.ConnectionConfig["ssl"] | undefined;
  statementTimeout?: number | undefined;
  applicationName?: string | undefined;
}

/**
 * Connection pool wrapper with statistics and health monitoring
 */
export class ConnectionPool {
  private pool: pg.Pool | null = null;
  private config: ConnectionPoolConfig;
  private stats: PoolStats = {
    total: 0,
    active: 0,
    idle: 0,
    waiting: 0,
    totalQueries: 0,
  };
  private shuttingDown = false;

  constructor(config: ConnectionPoolConfig) {
    this.config = config;
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    if (this.pool !== null) {
      logger.warn("Connection pool already initialized");
      return;
    }

    logger.info("Initializing PostgreSQL connection pool", {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
    });

    try {
      const poolConfig: pg.PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        max: this.config.pool?.max ?? 10,
        min: this.config.pool?.min ?? 0,
        idleTimeoutMillis: this.config.pool?.idleTimeoutMillis ?? 10000,
        connectionTimeoutMillis:
          this.config.pool?.connectionTimeoutMillis ?? 10000,
        allowExitOnIdle: this.config.pool?.allowExitOnIdle ?? true,
        application_name: this.config.applicationName ?? "postgres-mcp",
      };

      if (this.config.ssl === true) {
        poolConfig.ssl = { rejectUnauthorized: true };
      } else if (this.config.ssl !== undefined && this.config.ssl !== false) {
        poolConfig.ssl = this.config.ssl;
      }

      // Apply statement timeout: defaults to 30s to prevent runaway queries.
      // Explicit 0 disables it; explicit positive value overrides the default.
      const timeout = this.config.statementTimeout ?? DEFAULT_STATEMENT_TIMEOUT_MS;
      if (timeout > 0) {
        poolConfig.statement_timeout = timeout;
      }

      this.pool = new pg.Pool(poolConfig);

      // Set up event handlers
      this.pool.on("connect", () => {
        this.stats.total++;
        logger.debug("New connection established");
      });

      this.pool.on("acquire", () => {
        this.stats.active++;
        this.stats.idle = Math.max(0, this.stats.idle - 1);
      });

      this.pool.on("release", () => {
        this.stats.active = Math.max(0, this.stats.active - 1);
        this.stats.idle++;
      });

      this.pool.on("remove", () => {
        this.stats.total = Math.max(0, this.stats.total - 1);
        this.stats.idle = Math.max(0, this.stats.idle - 1);
      });

      this.pool.on("error", (err) => {
        logger.error("Pool error", { error: err.message });
      });

      // Test connection
      const client = await this.pool.connect();
      const result = await client.query("SELECT version()");
      client.release();

      const version = result.rows[0] as { version?: string } | undefined;
      logger.info("PostgreSQL connection pool initialized", {
        version: version?.version ?? "unknown",
      });
    } catch (error: unknown) {
      // Clean up pool on initialization failure
      if (this.pool !== null) {
        try {
          await this.pool.end();
        } catch {
          // Ignore cleanup errors
        }
        this.pool = null;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to initialize connection pool", { error: message });
      throw new ConnectionError(`Failed to connect to PostgreSQL: ${message}`);
    }
  }

  /**
   * Get a connection from the pool
   */
  async getConnection(): Promise<PoolClient> {
    if (this.pool === null) {
      throw new PoolError("Connection pool not initialized");
    }

    if (this.shuttingDown) {
      throw new PoolError("Connection pool is shutting down");
    }

    try {
      this.stats.waiting++;
      const client = await this.pool.connect();
      this.stats.waiting = Math.max(0, this.stats.waiting - 1);
      return client;
    } catch (error: unknown) {
      this.stats.waiting = Math.max(0, this.stats.waiting - 1);
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new PoolError(`Failed to acquire connection: ${message}`);
    }
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(client: PoolClient): void {
    try {
      client.release();
    } catch (error: unknown) {
      logger.warn("Error releasing connection", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Execute a query using a pooled connection
   */
  async query<T extends Record<string, unknown>[]>(
    sql: string,
    params?: unknown[],
  ): Promise<PgQueryResult<T[number]>> {
    if (this.pool === null) {
      throw new PoolError("Connection pool not initialized");
    }

    const startTime = Date.now();
    this.stats.totalQueries++;

    try {
      const result = await this.pool.query<T[number]>(sql, params);

      logger.debug("Query executed", {
        sql: sql.substring(0, 100),
        rowCount: result.rowCount,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Query failed", {
        sql: sql.substring(0, 100),
        error: message,
      });
      throw error;
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    if (this.pool !== null) {
      // Update stats from pool if available
      this.stats.total = this.pool.totalCount;
      this.stats.idle = this.pool.idleCount;
      this.stats.waiting = this.pool.waitingCount;
      this.stats.active = this.stats.total - this.stats.idle;
    }
    return { ...this.stats };
  }

  /**
   * Check pool health
   */
  async checkHealth(): Promise<HealthStatus> {
    if (this.pool === null || this.shuttingDown) {
      return {
        connected: false,
        error: this.shuttingDown
          ? "Pool is shutting down"
          : "Pool not initialized",
      };
    }

    const startTime = Date.now();

    try {
      const result = await this.pool.query(
        "SELECT version(), current_database()",
      );
      const latencyMs = Date.now() - startTime;
      const row = result.rows[0] as
        | { version?: string; current_database?: string }
        | undefined;

      return {
        connected: true,
        latencyMs,
        version: row?.version ?? undefined,
        poolStats: this.getStats(),
        details: {
          database: row?.current_database,
        },
      };
    } catch (error: unknown) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : "Unknown error",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Gracefully shutdown the pool
   */
  async shutdown(): Promise<void> {
    if (this.pool === null) {
      return;
    }

    logger.info("Shutting down connection pool...");
    this.shuttingDown = true;

    try {
      await this.pool.end();
      this.pool = null;
      logger.info("Connection pool shut down successfully");
    } catch (error: unknown) {
      logger.error("Error during pool shutdown", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Check if pool is initialized
   */
  isInitialized(): boolean {
    return this.pool !== null && !this.shuttingDown;
  }

  /**
   * Check if pool is shutting down
   */
  isClosing(): boolean {
    return this.shuttingDown;
  }
}
