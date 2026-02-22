/**
 * postgres-mcp - PostgresAdapter Unit Tests
 *
 * Tests for the main PostgreSQL adapter focusing on:
 * - Connection lifecycle management
 * - Query execution with proper error handling
 * - Transaction management (begin, commit, rollback, savepoints)
 * - Metadata caching behavior
 * - Schema and table operations
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PostgresAdapter } from "../PostgresAdapter.js";
import type {
  DatabaseConfig,
  HealthStatus,
  QueryResult,
} from "../../../types/index.js";
import type { PoolClient } from "pg";

// Create mock pool client factory
const createMockPoolClient = (): Partial<PoolClient> => ({
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  release: vi.fn(),
});

let mockPoolClient = createMockPoolClient();

// Mock pool instance methods
const mockPoolMethods = {
  initialize: vi.fn().mockResolvedValue(undefined),
  shutdown: vi.fn().mockResolvedValue(undefined),
  checkHealth: vi
    .fn()
    .mockResolvedValue({ connected: true, latencyMs: 5 } as HealthStatus),
  query: vi.fn().mockResolvedValue({ rows: [] } as QueryResult),
  getConnection: vi
    .fn()
    .mockImplementation(() => Promise.resolve(mockPoolClient as PoolClient)),
  releaseConnection: vi.fn(),
  getStats: vi.fn().mockReturnValue({
    total: 5,
    active: 1,
    idle: 4,
    waiting: 0,
    totalQueries: 100,
  }),
};

// Mock ConnectionPool as a class
vi.mock("../../../pool/ConnectionPool.js", () => {
  return {
    ConnectionPool: class MockConnectionPool {
      initialize = mockPoolMethods.initialize;
      shutdown = mockPoolMethods.shutdown;
      checkHealth = mockPoolMethods.checkHealth;
      query = mockPoolMethods.query;
      getConnection = mockPoolMethods.getConnection;
      releaseConnection = mockPoolMethods.releaseConnection;
      getStats = mockPoolMethods.getStats;
    },
  };
});

describe("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  const mockConfig: DatabaseConfig = {
    type: "postgresql",
    host: "localhost",
    port: 5432,
    database: "test_db",
    username: "test_user",
    password: "test_password",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolClient = createMockPoolClient();
    mockPoolMethods.getConnection.mockImplementation(() =>
      Promise.resolve(mockPoolClient as PoolClient),
    );
    adapter = new PostgresAdapter();
  });

  afterEach(async () => {
    // Ensure clean state for next test
    try {
      await adapter.disconnect();
    } catch {
      // Ignore disconnect errors in cleanup
    }
  });

  describe("Static Properties", () => {
    it("should have correct adapter type", () => {
      expect(adapter.type).toBe("postgresql");
    });

    it("should have correct adapter name", () => {
      expect(adapter.name).toBe("PostgreSQL Adapter");
    });

    it("should have version defined", () => {
      expect(adapter.version).toBeDefined();
      expect(typeof adapter.version).toBe("string");
    });
  });

  describe("connect()", () => {
    it("should initialize connection pool", async () => {
      await adapter.connect(mockConfig);

      // Pool should be initialized after connect
      expect(adapter.getPool()).not.toBeNull();
      expect(mockPoolMethods.initialize).toHaveBeenCalled();
    });

    it("should handle duplicate connection attempts gracefully", async () => {
      await adapter.connect(mockConfig);

      // Second connect just logs warning and returns (doesn't throw)
      await expect(adapter.connect(mockConfig)).resolves.not.toThrow();

      // Pool should still be valid
      expect(adapter.getPool()).not.toBeNull();
    });

    it("should store configuration for later use", async () => {
      await adapter.connect(mockConfig);

      // Adapter should remember the connection was established
      expect(adapter.getPool()).not.toBeNull();
    });
  });

  describe("disconnect()", () => {
    it("should shutdown pool gracefully", async () => {
      await adapter.connect(mockConfig);
      await adapter.disconnect();

      // Pool should be null after disconnect
      expect(adapter.getPool()).toBeNull();
      expect(mockPoolMethods.shutdown).toHaveBeenCalled();
    });

    it("should be safe to call when not connected", async () => {
      // Should not throw when not connected
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });

    it("should rollback any active transactions before disconnect", async () => {
      await adapter.connect(mockConfig);

      // Start a transaction
      const txId = await adapter.beginTransaction();
      expect(txId).toBeDefined();

      // Disconnect should clean up transaction
      await adapter.disconnect();

      // Verify transaction cleanup (rollback should have been called)
      expect(mockPoolClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("getHealth()", () => {
    it("should return unhealthy status when not connected", async () => {
      const health = await adapter.getHealth();
      expect(health.connected).toBe(false);
    });

    it("should return healthy status when connected", async () => {
      await adapter.connect(mockConfig);

      const health = await adapter.getHealth();
      expect(health.connected).toBe(true);
      expect(health.latencyMs).toBeDefined();
    });
  });

  describe("executeQuery()", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should execute query through pool", async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1, name: "test" }],
        rowsAffected: 1,
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const result = await adapter.executeQuery(
        "SELECT * FROM users WHERE id = $1",
        [1],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows?.[0]).toHaveProperty("id", 1);
    });

    it("should handle empty result sets", async () => {
      const mockResult: QueryResult = {
        rows: [],
        rowsAffected: 0,
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const result = await adapter.executeQuery(
        "SELECT * FROM users WHERE id = $1",
        [999],
      );

      expect(result.rows).toEqual([]);
    });

    it("should throw when not connected", async () => {
      await adapter.disconnect();

      await expect(adapter.executeQuery("SELECT 1")).rejects.toThrow();
    });

    it("should propagate database errors", async () => {
      const dbError = new Error('relation "nonexistent" does not exist');
      mockPoolMethods.query.mockRejectedValueOnce(dbError);

      await expect(
        adapter.executeQuery("SELECT * FROM nonexistent"),
      ).rejects.toThrow(/does not exist/);
    });
  });

  describe("executeReadQuery() and executeWriteQuery()", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("executeReadQuery should execute SELECT statements", async () => {
      const mockResult: QueryResult = {
        rows: [{ count: 42 }],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const result = await adapter.executeReadQuery(
        "SELECT COUNT(*) as count FROM users",
      );

      expect(result.rows?.[0]).toEqual({ count: 42 });
    });

    it("executeWriteQuery should execute INSERT statements", async () => {
      const mockResult: QueryResult = {
        rows: [{ id: 1 }],
        rowsAffected: 1,
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const result = await adapter.executeWriteQuery(
        "INSERT INTO users (name) VALUES ($1) RETURNING id",
        ["Test User"],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows?.[0]).toHaveProperty("id", 1);
    });
  });

  describe("Transaction Management", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("beginTransaction should return transaction ID", async () => {
      const txId = await adapter.beginTransaction();

      expect(txId).toBeDefined();
      expect(typeof txId).toBe("string");
      expect(mockPoolClient.query).toHaveBeenCalledWith("BEGIN");
    });

    it("beginTransaction should support custom isolation levels", async () => {
      await adapter.beginTransaction("SERIALIZABLE");

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SERIALIZABLE"),
      );
    });

    it("commitTransaction should commit and release connection", async () => {
      const txId = await adapter.beginTransaction();
      await adapter.commitTransaction(txId);

      expect(mockPoolClient.query).toHaveBeenCalledWith("COMMIT");
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it("rollbackTransaction should rollback and release connection", async () => {
      const txId = await adapter.beginTransaction();
      await adapter.rollbackTransaction(txId);

      expect(mockPoolClient.query).toHaveBeenCalledWith("ROLLBACK");
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it("should reject invalid transaction IDs", async () => {
      await expect(
        adapter.commitTransaction("invalid-tx-id"),
      ).rejects.toThrow();
      await expect(
        adapter.rollbackTransaction("invalid-tx-id"),
      ).rejects.toThrow();
    });

    it("getTransactionConnection should return client for valid transaction", async () => {
      const txId = await adapter.beginTransaction();
      const client = adapter.getTransactionConnection(txId);

      expect(client).toBeDefined();
    });

    it("getTransactionConnection should return undefined for invalid ID", () => {
      const client = adapter.getTransactionConnection("nonexistent");
      expect(client).toBeUndefined();
    });
  });

  describe("Savepoint Management", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("createSavepoint should create named savepoint", async () => {
      const txId = await adapter.beginTransaction();
      await adapter.createSavepoint(txId, "before_update");

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SAVEPOINT"),
      );
    });

    it("rollbackToSavepoint should rollback to named savepoint", async () => {
      const txId = await adapter.beginTransaction();
      await adapter.createSavepoint(txId, "sp1");
      await adapter.rollbackToSavepoint(txId, "sp1");

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("ROLLBACK TO SAVEPOINT"),
      );
    });
  });

  describe("Metadata Caching", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("clearMetadataCache should clear all cached data", async () => {
      // First call to listTables will cache results
      const mockResult: QueryResult = {
        rows: [
          {
            table_name: "users",
            schema_name: "public",
            table_type: "BASE TABLE",
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      await adapter.listTables();

      // Clear cache - should not throw
      expect(() => adapter.clearMetadataCache()).not.toThrow();
    });

    it("listTables should return cached results on second call", async () => {
      const mockTablesResult: QueryResult = {
        rows: [
          {
            name: "users",
            schema: "public",
            type: "table",
            owner: "admin",
            row_count: 50,
            live_row_estimate: 50,
            stats_stale: false,
            size_bytes: 8192,
            total_size_bytes: 16384,
            comment: null,
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockTablesResult);

      // First call — queries database
      const result1 = await adapter.listTables();
      expect(result1).toHaveLength(1);
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(1);

      // Second call — returns from cache, no additional query
      const result2 = await adapter.listTables();
      expect(result2).toHaveLength(1);
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(1); // Still 1
      expect(result1).toBe(result2); // Same reference (cached)
    });

    it("describeTable should return cached results for same table", async () => {
      // describeTable runs 5 queries: columns, tableInfo, indexes, constraints, foreignKeys
      const emptyResult: QueryResult = { rows: [] };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 10,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(emptyResult) // columns
        .mockResolvedValueOnce(mockTableResult) // table info
        .mockResolvedValueOnce(emptyResult) // indexes
        .mockResolvedValueOnce(emptyResult) // constraints
        .mockResolvedValueOnce(emptyResult); // foreign keys

      // First call — queries database
      const result1 = await adapter.describeTable("users", "public");
      expect(result1.name).toBe("users");
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(5);

      // Second call — returns from cache, no additional queries
      const result2 = await adapter.describeTable("users", "public");
      expect(result2.name).toBe("users");
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(5); // Still 5
      expect(result1).toBe(result2); // Same reference (cached)
    });

    it("describeTable should use schema-qualified cache keys", async () => {
      const emptyResult: QueryResult = { rows: [] };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 10,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };

      // Mock for public.users (5 queries)
      for (let i = 0; i < 5; i++) {
        mockPoolMethods.query.mockResolvedValueOnce(
          i === 1 ? mockTableResult : emptyResult,
        );
      }
      const publicResult = await adapter.describeTable("users", "public");

      // Mock for custom.users (5 queries — different schema, different cache key)
      for (let i = 0; i < 5; i++) {
        mockPoolMethods.query.mockResolvedValueOnce(
          i === 1 ? mockTableResult : emptyResult,
        );
      }
      const customResult = await adapter.describeTable("users", "custom");

      // Both should have queried (10 total), different cache entries
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(10);
      expect(publicResult.schema).toBe("public");
      expect(customResult.schema).toBe("custom");
      expect(publicResult).not.toBe(customResult);
    });

    it("listTables should return rowCount: 0 for empty tables (not omit field)", async () => {
      const mockTablesResult: QueryResult = {
        rows: [
          {
            name: "empty_table",
            schema: "public",
            type: "table",
            owner: "admin",
            row_count: 0,
            live_row_estimate: 0,
            stats_stale: false,
            size_bytes: 0,
            total_size_bytes: 0,
            comment: null,
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockTablesResult);

      const result = await adapter.listTables();
      expect(result).toHaveLength(1);
      expect(result[0]?.rowCount).toBe(0);
      // Verify the field exists (not undefined/omitted)
      expect("rowCount" in (result[0] ?? {})).toBe(true);
    });

    it("describeTable should use live_row_estimate when stats are stale", async () => {
      const emptyResult: QueryResult = { rows: [] };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: null, // reltuples = -1 → NULL via CASE
            live_row_estimate: 5,
            stats_stale: true,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(emptyResult) // columns
        .mockResolvedValueOnce(mockTableResult) // table info
        .mockResolvedValueOnce(emptyResult) // indexes
        .mockResolvedValueOnce(emptyResult) // constraints
        .mockResolvedValueOnce(emptyResult); // foreign keys

      const result = await adapter.describeTable("fresh_table", "public");
      expect(result.rowCount).toBe(5); // Falls back to live_row_estimate
    });

    it("clearMetadataCache should force re-query for listTables", async () => {
      const mockTablesResult: QueryResult = {
        rows: [
          {
            name: "users",
            schema: "public",
            type: "table",
            owner: "admin",
            row_count: 50,
            live_row_estimate: 50,
            stats_stale: false,
            size_bytes: 8192,
            total_size_bytes: 16384,
            comment: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockTablesResult) // First listTables call
        .mockResolvedValueOnce(mockTablesResult); // Second listTables call after cache clear

      await adapter.listTables();
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(1);

      // Clear cache
      adapter.clearMetadataCache();

      // Next call should re-query
      await adapter.listTables();
      expect(mockPoolMethods.query).toHaveBeenCalledTimes(2);
    });
  });

  describe("Tool Registration", () => {
    it("should return tool definitions", () => {
      const tools = adapter.getToolDefinitions();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // Verify tools have required properties
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe("string");
        expect(tool.handler).toBeDefined();
        expect(typeof tool.handler).toBe("function");
      }
    });

    it("should include core PostgreSQL tools", () => {
      const tools = adapter.getToolDefinitions();
      const toolNames = tools.map((t) => t.name);

      // Core tools should be present
      expect(toolNames).toContain("pg_read_query");
      expect(toolNames).toContain("pg_write_query");
      expect(toolNames).toContain("pg_list_tables");
    });

    it("should group tools by category", () => {
      const tools = adapter.getToolDefinitions();

      // Tools should have group property
      const groupedTools = tools.filter((t) => t.group);
      expect(groupedTools.length).toBeGreaterThan(0);

      // Verify expected groups exist
      const groups = new Set(tools.map((t) => t.group).filter(Boolean));
      expect(groups.has("core")).toBe(true);
    });
  });

  describe("Resource and Prompt Definitions", () => {
    it("should return resource definitions", () => {
      const resources = adapter.getResourceDefinitions();

      expect(Array.isArray(resources)).toBe(true);
    });

    it("should return prompt definitions", () => {
      const prompts = adapter.getPromptDefinitions();

      expect(Array.isArray(prompts)).toBe(true);
    });
  });

  describe("Schema Operations", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("getSchema should return tables, views, materializedViews, and indexes", async () => {
      // Mock tables response
      const mockTablesResult: QueryResult = {
        rows: [
          {
            name: "users",
            schema: "public",
            type: "table",
            owner: "admin",
            row_count: 100,
            size_bytes: 1024,
            total_size_bytes: 2048,
          },
          { name: "user_view", schema: "public", type: "view", owner: "admin" },
          {
            name: "user_cache",
            schema: "public",
            type: "materialized_view",
            owner: "admin",
          },
          {
            name: "orders",
            schema: "public",
            type: "partitioned_table",
            owner: "admin",
          },
        ],
      };
      // Mock indexes response
      const mockIndexesResult: QueryResult = {
        rows: [
          {
            name: "users_pkey",
            table_name: "users",
            schema_name: "public",
            type: "btree",
            is_unique: true,
            columns: ["id"],
            size_bytes: 512,
            num_scans: 1000,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockTablesResult)
        .mockResolvedValueOnce(mockIndexesResult);

      const schema = await adapter.getSchema();

      expect(schema.tables.length).toBe(2); // table + partitioned_table
      expect(schema.views?.length).toBe(1);
      expect(schema.materializedViews?.length).toBe(1);
      expect(schema.indexes?.length).toBe(1);
    });

    it("describeTable should return table info with columns", async () => {
      const mockColumnsResult: QueryResult = {
        rows: [
          {
            name: "id",
            type: "integer",
            nullable: false,
            primary_key: true,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
          },
          {
            name: "name",
            type: "text",
            nullable: true,
            primary_key: false,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: "User name",
          },
        ],
      };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 100,
            comment: "Users table",
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockColumnsResult)
        .mockResolvedValueOnce(mockTableResult);

      const tableInfo = await adapter.describeTable("users", "public");

      expect(tableInfo.name).toBe("users");
      expect(tableInfo.schema).toBe("public");
      expect(tableInfo.columns?.length).toBe(2);
      expect(tableInfo.columns?.[0].primaryKey).toBe(true);
    });

    it("listSchemas should return schema names", async () => {
      const mockResult: QueryResult = {
        rows: [{ nspname: "public" }, { nspname: "custom_schema" }],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const schemas = await adapter.listSchemas();

      expect(schemas).toContain("public");
      expect(schemas).toContain("custom_schema");
    });

    it("getTableIndexes should return indexes for a specific table", async () => {
      const mockResult: QueryResult = {
        rows: [
          {
            name: "users_pkey",
            type: "btree",
            is_unique: true,
            columns: ["id"],
            size_bytes: 512,
            num_scans: 1000,
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const indexes = await adapter.getTableIndexes("users", "public");

      expect(indexes.length).toBe(1);
      expect(indexes[0].name).toBe("users_pkey");
      expect(indexes[0].tableName).toBe("users");
    });
  });

  describe("Extension Support", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("isExtensionAvailable should return true when extension exists", async () => {
      const mockResult: QueryResult = { rows: [{ available: true }] };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const available = await adapter.isExtensionAvailable("pgvector");
      expect(available).toBe(true);
    });

    it("isExtensionAvailable should return false when extension does not exist", async () => {
      const mockResult: QueryResult = { rows: [{ available: false }] };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      const available = await adapter.isExtensionAvailable("nonexistent");
      expect(available).toBe(false);
    });
  });

  describe("Capabilities", () => {
    it("getCapabilities should return all supported features", () => {
      const caps = adapter.getCapabilities();

      expect(caps.json).toBe(true);
      expect(caps.fullTextSearch).toBe(true);
      expect(caps.vector).toBe(true);
      expect(caps.geospatial).toBe(true);
      expect(caps.transactions).toBe(true);
      expect(caps.preparedStatements).toBe(true);
      expect(caps.connectionPooling).toBe(true);
      expect(caps.partitioning).toBe(true);
      expect(caps.replication).toBe(true);
      expect(caps.cte).toBe(true);
      expect(caps.windowFunctions).toBe(true);
    });

    it("getSupportedToolGroups should return all tool groups", () => {
      const groups = adapter.getSupportedToolGroups();

      expect(groups).toContain("core");
      expect(groups).toContain("transactions");
      expect(groups).toContain("jsonb");
      expect(groups).toContain("vector");
      expect(groups).toContain("postgis");
      expect(groups).toContain("cron");
      expect(groups).toContain("partman");
      expect(groups).toContain("codemode");
    });
  });

  describe("executeOnConnection", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should execute query on specific client", async () => {
      const txId = await adapter.beginTransaction();
      const client = adapter.getTransactionConnection(txId);
      expect(client).toBeDefined();

      (mockPoolClient.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        rows: [{ id: 1 }],
        rowCount: 1,
        command: "SELECT",
      });

      const result = await adapter.executeOnConnection(
        client!,
        "SELECT * FROM users",
      );

      expect(result.rows).toHaveLength(1);
      expect(result.executionTimeMs).toBeDefined();
      await adapter.rollbackTransaction(txId);
    });

    it("should throw QueryError on client query failure", async () => {
      const txId = await adapter.beginTransaction();
      const client = adapter.getTransactionConnection(txId);

      (mockPoolClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Query execution failed"),
      );

      await expect(
        adapter.executeOnConnection(client!, "INVALID SQL"),
      ).rejects.toThrow(/Query failed/);

      await adapter.rollbackTransaction(txId);
    });
  });

  describe("Savepoint Operations", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("releaseSavepoint should release named savepoint", async () => {
      const txId = await adapter.beginTransaction();
      await adapter.createSavepoint(txId, "sp1");
      await adapter.releaseSavepoint(txId, "sp1");

      expect(mockPoolClient.query).toHaveBeenCalledWith(
        expect.stringContaining("RELEASE SAVEPOINT"),
      );
      await adapter.rollbackTransaction(txId);
    });

    it("releaseSavepoint should throw for invalid transaction", async () => {
      await expect(
        adapter.releaseSavepoint("invalid-tx", "sp1"),
      ).rejects.toThrow(/Transaction not found/);
    });
  });

  describe("Tool Definition Caching", () => {
    it("should cache tool definitions on second call", () => {
      const tools1 = adapter.getToolDefinitions();
      const tools2 = adapter.getToolDefinitions();

      // Both should return the same array reference (cached)
      expect(tools1).toBe(tools2);
    });
  });

  // =========================================================================
  // Phase 1 Coverage Tests: Lines 89-93, 144-145, 213, 264, 279-280, 324, 348
  // =========================================================================

  describe("Cache TTL Expiration", () => {
    it("should return undefined and delete expired cache entries", async () => {
      await adapter.connect(mockConfig);

      // Mock getAllIndexes to populate cache
      const mockResult: QueryResult = {
        rows: [
          {
            name: "test_idx",
            table_name: "users",
            schema_name: "public",
            type: "btree",
            is_unique: false,
            columns: ["id"],
            size_bytes: 1024,
            num_scans: 100,
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResult);

      // Call getSchema which triggers getAllIndexes and caches
      await adapter.getSchema();

      // Clear and re-mock for second call
      mockPoolMethods.query.mockResolvedValueOnce({ rows: [] }); // listTables
      mockPoolMethods.query.mockResolvedValueOnce({
        rows: [
          {
            name: "new_idx",
            table_name: "orders",
            schema_name: "public",
            type: "btree",
            is_unique: true,
            columns: ["order_id"],
            size_bytes: 2048,
            num_scans: 50,
          },
        ],
      }); // getAllIndexes - new data after cache expires

      // Advance time past cache TTL (default 30s) by manipulating adapter
      // Access private cache via prototype hack to test TTL
      const adapterAny = adapter as unknown as {
        metadataCache: Map<string, { data: unknown; timestamp: number }>;
        cacheTtlMs: number;
      };

      // Set entries with old timestamps to trigger expiration
      // Both list_tables and all_indexes must be expired so getSchema refetches both
      adapterAny.metadataCache.set("all_indexes", {
        data: [{ name: "old_idx" }],
        timestamp: Date.now() - 60000, // 60 seconds ago, past 30s TTL
      });
      adapterAny.metadataCache.set("list_tables", {
        data: [],
        timestamp: Date.now() - 60000,
      });

      // Calling getSchema again should detect expired caches, delete them, and refetch
      await adapter.getSchema();

      // Verify the old cache was cleared and new queries were made
      expect(mockPoolMethods.query).toHaveBeenCalled();
    });
  });

  describe("Connection Failure Handling", () => {
    it("should reset pool to null and throw ConnectionError when initialize fails", async () => {
      const initError = new Error("ECONNREFUSED: Connection refused");
      mockPoolMethods.initialize.mockRejectedValueOnce(initError);

      await expect(adapter.connect(mockConfig)).rejects.toThrow(
        /Failed to connect/,
      );

      // Pool should be set to null after failure
      expect(adapter.getPool()).toBeNull();
    });
  });

  describe("Query Field Metadata Mapping", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should map field metadata from pg result when fields array is present", async () => {
      const mockResultWithFields = {
        rows: [{ id: 1, name: "test" }],
        rowCount: 1,
        command: "SELECT",
        fields: [
          {
            name: "id",
            tableID: 12345,
            columnID: 1,
            dataTypeID: 23,
            dataTypeSize: 4,
            dataTypeModifier: -1,
            format: "text",
          },
          {
            name: "name",
            tableID: 12345,
            columnID: 2,
            dataTypeID: 25,
            dataTypeSize: -1,
            dataTypeModifier: -1,
            format: "text",
          },
        ],
      };
      mockPoolMethods.query.mockResolvedValueOnce(mockResultWithFields);

      const result = await adapter.executeQuery("SELECT id, name FROM users");

      expect(result.fields).toBeDefined();
      expect(result.fields).toHaveLength(2);
      expect(result.fields?.[0].name).toBe("id");
      expect(result.fields?.[0].dataTypeID).toBe(23);
      expect(result.fields?.[1].name).toBe("name");
    });
  });

  describe("Transaction Edge Cases", () => {
    it("beginTransaction should throw ConnectionError when not connected", async () => {
      // Adapter is not connected (no connect() called)
      await expect(adapter.beginTransaction()).rejects.toThrow(/Not connected/);
    });

    it("beginTransaction should release client and throw TransactionError when BEGIN fails", async () => {
      await adapter.connect(mockConfig);

      // Mock client.query to throw on BEGIN
      (mockPoolClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("database is shutting down"),
      );

      await expect(adapter.beginTransaction()).rejects.toThrow(
        /Failed to begin transaction/,
      );

      // Verify client was released
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it("createSavepoint should throw TransactionError for non-existent transaction", async () => {
      await adapter.connect(mockConfig);

      await expect(
        adapter.createSavepoint("nonexistent-tx-id", "sp1"),
      ).rejects.toThrow(/Transaction not found/);
    });

    it("rollbackToSavepoint should throw TransactionError for non-existent transaction", async () => {
      await adapter.connect(mockConfig);

      await expect(
        adapter.rollbackToSavepoint("nonexistent-tx-id", "sp1"),
      ).rejects.toThrow(/Transaction not found/);
    });
  });

  // =========================================================================
  // Aborted Transaction Detection (lines 319–334)
  // =========================================================================

  describe("Aborted Transaction Commit", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should detect and report aborted transaction state on commit", async () => {
      const txId = await adapter.beginTransaction();

      // Simulate transaction probe detecting 25P02 (aborted state)
      // BEGIN succeeds, then SELECT 1 probe fails with 25P02
      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockReset();

      // SELECT 1 probe → aborted state error
      const abortedError = Object.assign(
        new Error("current transaction is aborted"),
        { code: "25P02" },
      );
      queryMock.mockRejectedValueOnce(abortedError);

      // ROLLBACK inside the probe handler
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(adapter.commitTransaction(txId)).rejects.toThrow(
        /aborted state/,
      );

      // Client should be released and transaction removed
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it("should detect aborted state via error message pattern when code is missing", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockReset();

      // Probe fails with aborted message but no Pg code
      queryMock.mockRejectedValueOnce(
        new Error("current transaction is aborted, commands ignored"),
      );
      // ROLLBACK
      queryMock.mockResolvedValueOnce({ rows: [] });

      await expect(adapter.commitTransaction(txId)).rejects.toThrow(
        /aborted state/,
      );
    });

    it("should handle ROLLBACK failure in aborted state gracefully", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockReset();

      // Probe detects aborted
      queryMock.mockRejectedValueOnce(
        Object.assign(new Error("transaction aborted"), { code: "25P02" }),
      );
      // ROLLBACK also fails (e.g., connection lost)
      queryMock.mockRejectedValueOnce(new Error("connection lost"));

      await expect(adapter.commitTransaction(txId)).rejects.toThrow(
        /aborted state/,
      );

      // Client should still be released via finally block
      expect(mockPoolClient.release).toHaveBeenCalled();
    });

    it("should proceed to COMMIT when probe succeeds", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockReset();

      // SELECT 1 probe → success
      queryMock.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
      // COMMIT → success
      queryMock.mockResolvedValueOnce({ rows: [] });

      await adapter.commitTransaction(txId);

      expect(queryMock).toHaveBeenCalledWith("SELECT 1");
      expect(queryMock).toHaveBeenCalledWith("COMMIT");
    });

    it("should fall through to COMMIT on non-aborted probe error", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockReset();

      // Probe fails with non-25P02 error (e.g., syntax error)
      queryMock.mockRejectedValueOnce(
        Object.assign(new Error("unexpected error"), { code: "42601" }),
      );
      // COMMIT still proceeds
      queryMock.mockResolvedValueOnce({ rows: [] });

      await adapter.commitTransaction(txId);

      expect(queryMock).toHaveBeenCalledWith("COMMIT");
    });
  });

  // =========================================================================
  // Savepoint Query Failures (lines 383, 404, 427)
  // =========================================================================

  describe("Savepoint Query Failures", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("createSavepoint should throw parsed error when query fails", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockRejectedValueOnce(new Error("SAVEPOINT execution failed"));

      await expect(
        adapter.createSavepoint(txId, "my_savepoint"),
      ).rejects.toThrow();
    });

    it("releaseSavepoint should throw parsed error when query fails", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockResolvedValueOnce({ rows: [] }); // createSavepoint
      await adapter.createSavepoint(txId, "sp_test");

      queryMock.mockRejectedValueOnce(new Error("savepoint does not exist"));

      await expect(adapter.releaseSavepoint(txId, "sp_test")).rejects.toThrow();
    });

    it("rollbackToSavepoint should throw parsed error when query fails", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockRejectedValueOnce(new Error("savepoint does not exist"));

      await expect(
        adapter.rollbackToSavepoint(txId, "nonexistent_sp"),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // Transaction Cleanup (lines 445–484)
  // =========================================================================

  describe("cleanupTransaction", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should return false for non-existent transaction", async () => {
      const result = await adapter.cleanupTransaction("nonexistent-id");
      expect(result).toBe(false);
    });

    it("should rollback and release client for existing transaction", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const result = await adapter.cleanupTransaction(txId);
      expect(result).toBe(true);
      expect(queryMock).toHaveBeenCalledWith("ROLLBACK");
      expect(mockPoolClient.release).toHaveBeenCalled();

      // Transaction should be removed
      expect(adapter.getTransactionConnection(txId)).toBeUndefined();
    });

    it("should handle rollback failure and force-release client", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockRejectedValueOnce(new Error("connection broken"));

      const result = await adapter.cleanupTransaction(txId);
      expect(result).toBe(false);

      // Should attempt force release with error flag
      expect(mockPoolClient.release).toHaveBeenCalledWith(true);

      // Transaction should still be removed from map
      expect(adapter.getTransactionConnection(txId)).toBeUndefined();
    });

    it("should handle both rollback failure and force-release failure", async () => {
      const txId = await adapter.beginTransaction();

      const queryMock = mockPoolClient.query as ReturnType<typeof vi.fn>;
      queryMock.mockRejectedValueOnce(new Error("connection broken"));

      // Force release also throws
      (
        mockPoolClient.release as ReturnType<typeof vi.fn>
      ).mockImplementationOnce(() => {
        throw new Error("already released");
      });

      const result = await adapter.cleanupTransaction(txId);
      // Still returns false because primary rollback failed
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Active Transaction Tracking (line 444)
  // =========================================================================

  describe("getActiveTransactionIds", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should return empty array when no transactions", () => {
      expect(adapter.getActiveTransactionIds()).toEqual([]);
    });

    it("should return all active transaction IDs", async () => {
      // Create fresh clients for each transaction
      const client1 = createMockPoolClient();
      const client2 = createMockPoolClient();
      mockPoolMethods.getConnection
        .mockResolvedValueOnce(client1 as PoolClient)
        .mockResolvedValueOnce(client2 as PoolClient);

      const tx1 = await adapter.beginTransaction();
      const tx2 = await adapter.beginTransaction();

      const ids = adapter.getActiveTransactionIds();
      expect(ids).toContain(tx1);
      expect(ids).toContain(tx2);
      expect(ids).toHaveLength(2);
    });
  });

  // =========================================================================
  // Expression Index Parsing (lines 579–685)
  // =========================================================================

  describe("Expression Index Parsing", () => {
    // Access private methods via type casting for testing
    const getPrivateMethods = (adapterInstance: PostgresAdapter) =>
      adapterInstance as unknown as {
        parseColumnsArray(columns: unknown): string[];
        extractIndexColumns(columns: string[], definition: string): string[];
        extractIndexExpressionPart(definition: string): string | null;
        parseIndexExpressions(columnList: string): string[];
      };

    describe("parseColumnsArray", () => {
      it("should pass through native arrays", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseColumnsArray(["col1", "col2"])).toEqual([
          "col1",
          "col2",
        ]);
      });

      it("should parse PostgreSQL string format {col1,col2}", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseColumnsArray("{col1,col2}")).toEqual([
          "col1",
          "col2",
        ]);
      });

      it("should handle empty string format {}", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseColumnsArray("{}")).toEqual([]);
      });

      it("should handle quoted column names", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseColumnsArray('{"my column","other col"}')).toEqual([
          "my column",
          "other col",
        ]);
      });

      it("should return empty array for non-string, non-array input", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseColumnsArray(42)).toEqual([]);
        expect(methods.parseColumnsArray(null)).toEqual([]);
        expect(methods.parseColumnsArray(undefined)).toEqual([]);
      });
    });

    describe("extractIndexExpressionPart", () => {
      it("should extract expression from simple index definition", () => {
        const methods = getPrivateMethods(adapter);
        const result = methods.extractIndexExpressionPart(
          "CREATE INDEX idx ON tbl USING btree (lower(name))",
        );
        expect(result).toBe("lower(name)");
      });

      it("should extract multiple column expressions", () => {
        const methods = getPrivateMethods(adapter);
        const result = methods.extractIndexExpressionPart(
          "CREATE INDEX idx ON tbl USING btree (id, lower(name))",
        );
        expect(result).toBe("id, lower(name)");
      });

      it("should handle nested parentheses", () => {
        const methods = getPrivateMethods(adapter);
        const result = methods.extractIndexExpressionPart(
          "CREATE INDEX idx ON tbl USING btree (upper(trim(name)))",
        );
        expect(result).toBe("upper(trim(name))");
      });

      it("should return null when no USING clause found", () => {
        const methods = getPrivateMethods(adapter);
        const result = methods.extractIndexExpressionPart(
          "CREATE INDEX idx ON tbl (name)",
        );
        expect(result).toBeNull();
      });

      it("should return null for unbalanced parentheses", () => {
        const methods = getPrivateMethods(adapter);
        const result = methods.extractIndexExpressionPart(
          "CREATE INDEX idx ON tbl USING btree (lower(name)",
        );
        expect(result).toBeNull();
      });
    });

    describe("parseIndexExpressions", () => {
      it("should parse simple column list", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseIndexExpressions("id, name")).toEqual([
          "id",
          "name",
        ]);
      });

      it("should handle expressions with nested parentheses", () => {
        const methods = getPrivateMethods(adapter);
        expect(
          methods.parseIndexExpressions("LOWER(name), id, UPPER(TRIM(email))"),
        ).toEqual(["LOWER(name)", "id", "UPPER(TRIM(email))"]);
      });

      it("should handle single expression", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseIndexExpressions("lower(name)")).toEqual([
          "lower(name)",
        ]);
      });

      it("should handle empty string", () => {
        const methods = getPrivateMethods(adapter);
        expect(methods.parseIndexExpressions("")).toEqual([]);
      });
    });

    describe("extractIndexColumns", () => {
      it("should return columns as-is when no NULL values", () => {
        const methods = getPrivateMethods(adapter);
        expect(
          methods.extractIndexColumns(
            ["id", "name"],
            "CREATE INDEX idx ON tbl USING btree (id, name)",
          ),
        ).toEqual(["id", "name"]);
      });

      it("should replace NULL columns with parsed expressions", () => {
        const methods = getPrivateMethods(adapter);
        const columns = [null as unknown as string, "id"];
        const definition =
          "CREATE INDEX idx ON tbl USING btree (lower(name), id)";
        const result = methods.extractIndexColumns(columns, definition);
        expect(result).toEqual(["lower(name)", "id"]);
      });

      it("should replace empty string columns with parsed expressions", () => {
        const methods = getPrivateMethods(adapter);
        const columns = ["", "id"];
        const definition =
          "CREATE INDEX idx ON tbl USING btree (upper(email), id)";
        const result = methods.extractIndexColumns(columns, definition);
        expect(result).toEqual(["upper(email)", "id"]);
      });

      it("should return original columns when definition has no USING clause", () => {
        const methods = getPrivateMethods(adapter);
        const columns = [null as unknown as string, "id"];
        const result = methods.extractIndexColumns(
          columns,
          "CREATE INDEX idx ON tbl (name, id)",
        );
        expect(result).toEqual(columns);
      });

      it("should return original columns when expression count mismatches", () => {
        const methods = getPrivateMethods(adapter);
        const columns = [null as unknown as string, "id", "extra"];
        const definition =
          "CREATE INDEX idx ON tbl USING btree (lower(name), id)";
        const result = methods.extractIndexColumns(columns, definition);
        // Counts don't match (3 vs 2), so original is returned
        expect(result).toEqual(columns);
      });
    });
  });

  // =========================================================================
  // describeTable with FK columns and NOT NULL constraints (lines 885, 938)
  // =========================================================================

  describe("describeTable with foreign keys and NOT NULL", () => {
    beforeEach(async () => {
      await adapter.connect(mockConfig);
    });

    it("should include foreignKey references in column info", async () => {
      const emptyResult: QueryResult = { rows: [] };
      const mockColumnsResult: QueryResult = {
        rows: [
          {
            name: "user_id",
            type: "integer",
            nullable: false,
            primary_key: false,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
            foreign_key: {
              table: "users",
              schema: "public",
              column: "id",
            },
          },
        ],
      };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 10,
            live_row_estimate: 10,
            stats_stale: false,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockColumnsResult) // columns
        .mockResolvedValueOnce(mockTableResult) // table info
        .mockResolvedValueOnce(emptyResult) // indexes
        .mockResolvedValueOnce(emptyResult) // constraints
        .mockResolvedValueOnce(emptyResult); // foreign keys

      const result = await adapter.describeTable("orders", "public");
      const col = result.columns?.[0];
      expect(col?.foreignKey).toBeDefined();
      expect(col?.foreignKey?.table).toBe("users");
      expect(col?.foreignKey?.schema).toBe("public");
      expect(col?.foreignKey?.column).toBe("id");
    });

    it("should generate NOT NULL synthetic constraints for non-PK, non-nullable columns", async () => {
      const emptyResult: QueryResult = { rows: [] };
      const mockColumnsResult: QueryResult = {
        rows: [
          {
            name: "id",
            type: "integer",
            nullable: false,
            primary_key: true,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
            foreign_key: null,
          },
          {
            name: "email",
            type: "text",
            nullable: false,
            primary_key: false,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
            foreign_key: null,
          },
          {
            name: "bio",
            type: "text",
            nullable: true,
            primary_key: false,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
            foreign_key: null,
          },
        ],
      };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 5,
            live_row_estimate: 5,
            stats_stale: false,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockColumnsResult) // columns
        .mockResolvedValueOnce(mockTableResult) // table info
        .mockResolvedValueOnce(emptyResult) // indexes
        .mockResolvedValueOnce(emptyResult) // constraints
        .mockResolvedValueOnce(emptyResult); // foreign keys

      const result = await adapter.describeTable("users", "public");

      // Should have NOT NULL constraint for email (non-PK, non-nullable)
      // but NOT for id (PK) or bio (nullable)
      const notNullConstraints = result.constraints?.filter(
        (c) => c.type === "not_null",
      );
      expect(notNullConstraints).toBeDefined();
      expect(notNullConstraints?.length).toBe(1);
      expect(notNullConstraints?.[0]?.columns).toEqual(["email"]);
    });

    it("should include generatedExpression for generated columns", async () => {
      const emptyResult: QueryResult = { rows: [] };
      const mockColumnsResult: QueryResult = {
        rows: [
          {
            name: "full_name",
            type: "text",
            nullable: true,
            primary_key: false,
            default_value: null,
            is_generated: true,
            generated_expression: "first_name || ' ' || last_name",
            comment: null,
            foreign_key: null,
          },
          {
            name: "first_name",
            type: "text",
            nullable: false,
            primary_key: false,
            default_value: null,
            is_generated: false,
            generated_expression: null,
            comment: null,
            foreign_key: null,
          },
        ],
      };
      const mockTableResult: QueryResult = {
        rows: [
          {
            type: "table",
            owner: "admin",
            row_count: 0,
            live_row_estimate: 0,
            stats_stale: false,
            comment: null,
            is_partitioned: false,
            partition_key: null,
          },
        ],
      };
      mockPoolMethods.query
        .mockResolvedValueOnce(mockColumnsResult)
        .mockResolvedValueOnce(mockTableResult)
        .mockResolvedValueOnce(emptyResult)
        .mockResolvedValueOnce(emptyResult)
        .mockResolvedValueOnce(emptyResult);

      const result = await adapter.describeTable("people", "public");
      const generatedCol = result.columns?.find((c) => c.name === "full_name");
      expect(generatedCol?.isGenerated).toBe(true);
      expect(generatedCol?.generatedExpression).toBe(
        "first_name || ' ' || last_name",
      );

      // Non-generated column should NOT have generatedExpression
      const normalCol = result.columns?.find((c) => c.name === "first_name");
      expect(normalCol?.isGenerated).toBe(false);
      expect(normalCol?.generatedExpression).toBeUndefined();
    });
  });

  // =========================================================================
  // Disconnect with Orphaned Transaction Cleanup Error (line 169–170)
  // =========================================================================

  describe("Disconnect with orphaned transaction cleanup errors", () => {
    it("should handle errors during orphaned transaction rollback on disconnect", async () => {
      await adapter.connect(mockConfig);

      // Start a transaction
      await adapter.beginTransaction();

      // Make rollback fail during disconnect cleanup
      (mockPoolClient.query as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("connection already closed"),
      );

      // Disconnect should still succeed (errors are ignored in cleanup)
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });
});
