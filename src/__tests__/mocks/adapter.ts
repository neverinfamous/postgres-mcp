/**
 * postgres-mcp - PostgreSQL Adapter Mock
 *
 * Provides mock implementation of PostgresAdapter for testing
 * tools, resources, and prompts without database dependency.
 */

import { vi } from "vitest";
import type { PostgresAdapter } from "../../adapters/postgresql/postgres-adapter.js";
import type {
  QueryResult,
  TableInfo,
  IndexInfo,
  SchemaInfo,
  HealthStatus,
  ColumnInfo,
} from "../../types/index.js";
import { VERSION } from "../../utils/version.js";

/**
 * Create a mock query result
 */
export function createMockQueryResult(
  rows: Record<string, unknown>[] = [],
  affectedRows = 0,
): QueryResult {
  return {
    rows,
    rowsAffected: affectedRows,
    executionTimeMs: 5,
  };
}

/**
 * Create a mock column info
 */
export function createMockColumnInfo(
  name: string,
  type: string,
  nullable = true,
  primaryKey = false,
): ColumnInfo {
  return {
    name,
    type,
    nullable,
    primaryKey,
    defaultValue: null,
  };
}

/**
 * Create a mock table info
 */
export function createMockTableInfo(
  name: string,
  schemaName = "public",
  rowCount = 100,
): TableInfo {
  return {
    name,
    schema: schemaName,
    type: "table",
    columns: [
      createMockColumnInfo("id", "integer", false, true),
      createMockColumnInfo("name", "varchar(255)", true, false),
      createMockColumnInfo(
        "created_at",
        "timestamp with time zone",
        false,
        false,
      ),
    ],
    rowCount,
  };
}

/**
 * Create mock index info
 */
export function createMockIndexInfo(
  tableName: string,
  indexName: string,
  schemaName = "public",
): IndexInfo {
  return {
    name: indexName,
    tableName,
    schemaName,
    columns: ["id"],
    unique: indexName.endsWith("_pkey"),
    type: "btree",
  };
}

/**
 * Create mock schema info
 */
export function createMockSchemaInfo(): SchemaInfo {
  return {
    tables: [createMockTableInfo("users"), createMockTableInfo("products")],
    views: [],
    indexes: [createMockIndexInfo("users", "users_pkey")],
  };
}

/**
 * Create mock health status
 */
export function createMockHealthStatus(connected = true): HealthStatus {
  return {
    connected,
    latencyMs: 5,
    version: "16.1",
    poolStats: {
      total: 10,
      active: 2,
      idle: 8,
      waiting: 0,
      totalQueries: 100,
    },
  };
}

/**
 * Create a mock PostgresAdapter
 */
export function createMockPostgresAdapter(): Partial<PostgresAdapter> & {
  executeQuery: ReturnType<typeof vi.fn>;
  executeReadQuery: ReturnType<typeof vi.fn>;
  executeWriteQuery: ReturnType<typeof vi.fn>;
  getTableIndexes: ReturnType<typeof vi.fn>;
  getAllIndexes: ReturnType<typeof vi.fn>;
  describeTable: ReturnType<typeof vi.fn>;
  listTables: ReturnType<typeof vi.fn>;
  listSchemas: ReturnType<typeof vi.fn>;
  getSchema: ReturnType<typeof vi.fn>;
  executeOnConnection: ReturnType<typeof vi.fn>;
  invalidateTableCache: ReturnType<typeof vi.fn>;
} {
  const mockQueryResult = createMockQueryResult([{ id: 1, name: "test" }]);

  const executeQueryMock = vi.fn().mockResolvedValue(mockQueryResult);

  return {
    type: "postgresql" as const,
    name: "PostgreSQL Adapter",
    version: VERSION,

    // Connection methods
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getHealth: vi.fn().mockResolvedValue(createMockHealthStatus()),

    // Query execution
    executeQuery: executeQueryMock,
    executeReadQuery: vi.fn().mockResolvedValue(mockQueryResult),
    executeWriteQuery: vi.fn().mockResolvedValue(mockQueryResult),

    // Transaction methods
    beginTransaction: vi.fn().mockResolvedValue("txn-123"),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    createSavepoint: vi.fn().mockResolvedValue(undefined),
    releaseSavepoint: vi.fn().mockResolvedValue(undefined),
    rollbackToSavepoint: vi.fn().mockResolvedValue(undefined),
    getTransactionConnection: vi.fn().mockReturnValue({}),
    executeOnConnection: vi.fn().mockImplementation((_client, sql, params) => {
      return executeQueryMock(sql, params) as unknown as Promise<unknown>;
    }),
    invalidateSchemaCache: vi.fn(),
    invalidateTableCache: vi.fn(
      (_tableName: string, _schemaName?: string) => undefined,
    ),

    // Schema methods
    getSchema: vi.fn().mockResolvedValue(createMockSchemaInfo()),
    listTables: vi.fn().mockResolvedValue([createMockTableInfo("users")]),
    describeTable: vi.fn().mockResolvedValue(createMockTableInfo("users")),
    listSchemas: vi.fn().mockResolvedValue(["public", "pg_catalog"]),
    getTableIndexes: vi
      .fn()
      .mockResolvedValue([createMockIndexInfo("users", "users_pkey")]),
    getAllIndexes: vi
      .fn()
      .mockResolvedValue([createMockIndexInfo("users", "users_pkey")]),

    // Capabilities
    getCapabilities: vi.fn().mockReturnValue({
      json: true,
      fullTextSearch: true,
      vector: true,
      geospatial: true,
      transactions: true,
      preparedStatements: true,
      connectionPooling: true,
      partitioning: true,
      ltree: true,
      cron: true,
    }),
    getSupportedToolGroups: vi
      .fn()
      .mockReturnValue([
        "core",
        "transactions",
        "jsonb",
        "text",
        "fulltext",
        "performance",
        "admin",
        "monitoring",
        "backup",
        "vector",
        "postgis",
        "partitioning",
      ]),

    // Definition getters
    getToolDefinitions: vi.fn().mockReturnValue([]),
    getResourceDefinitions: vi.fn().mockReturnValue([]),
    getPromptDefinitions: vi.fn(),

    // Pool access
    getPool: vi.fn().mockReturnValue(null),
  };
}

/**
 * Create a mock RequestContext for handler testing
 */
export function createMockRequestContext(): {
  timestamp: Date;
  requestId: string;
} {
  return {
    timestamp: new Date(),
    requestId: "test-request-" + Math.random().toString(36).slice(2, 9),
  };
}

/**
 * Helper to configure mock adapter response for specific queries
 */
export function configureMockAdapterQuery(
  adapter: ReturnType<typeof createMockPostgresAdapter>,
  pattern: string,
  result: QueryResult,
): void {
  const originalImpl = adapter.executeQuery.getMockImplementation() as
    | ((sql: string) => Promise<QueryResult>)
    | undefined;

  const impl = (sql: string): Promise<QueryResult> => {
    if (sql.includes(pattern)) {
      return Promise.resolve(result);
    }
    if (typeof originalImpl === "function") {
      return originalImpl(sql);
    }
    return Promise.resolve(createMockQueryResult());
  };
  adapter.executeQuery.mockImplementation(
    impl as (...args: unknown[]) => unknown,
  );
}

/**
 * Create a mock PostgresAdapter that returns empty results
 */
export function createMockPostgresAdapterEmpty(): ReturnType<
  typeof createMockPostgresAdapter
> {
  const adapter = createMockPostgresAdapter();
  const emptyResult = createMockQueryResult([]);

  adapter.executeQuery.mockResolvedValue(emptyResult);
  adapter.executeReadQuery.mockResolvedValue(emptyResult);
  adapter.executeWriteQuery.mockResolvedValue({
    rows: [],
    rowsAffected: 0,
    executionTimeMs: 1,
  });

  return adapter;
}

/**
 * Create a mock PostgresAdapter that throws on query execution
 */
export function createMockPostgresAdapterWithError(
  errorMessage = "Database connection failed",
): ReturnType<typeof createMockPostgresAdapter> {
  const adapter = createMockPostgresAdapter();
  const dbError = new Error(errorMessage);

  adapter.executeQuery.mockRejectedValue(dbError);
  adapter.executeReadQuery.mockRejectedValue(dbError);
  adapter.executeWriteQuery.mockRejectedValue(dbError);
  (adapter.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(
    createMockHealthStatus(false),
  );

  return adapter;
}

/**
 * Create a mock adapter for transaction testing with a mock connection
 */
export function createMockPostgresAdapterWithTransaction(): ReturnType<
  typeof createMockPostgresAdapter
> & {
  mockConnection: {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };
} {
  const adapter = createMockPostgresAdapter();

  const mockConnection = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: vi.fn(),
  };

  (
    adapter.getTransactionConnection as ReturnType<typeof vi.fn>
  ).mockReturnValue(mockConnection);

  return { ...adapter, mockConnection };
}

/**
 * Type alias for the mock adapter return type
 */
export type MockPostgresAdapter = ReturnType<typeof createMockPostgresAdapter>;
