/**
 * postgres-mcp - Error Types Unit Tests
 *
 * Tests for custom error classes covering construction,
 * error codes, details, inheritance, and name properties.
 */

import { describe, it, expect } from "vitest";
import {
  PostgresMcpError,
  ConnectionError,
  PoolError,
  QueryError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  TransactionError,
  ExtensionNotAvailableError,
} from "../errors.js";
import { ErrorCategory } from "../error-types.js";

// =============================================================================
// PostgresMcpError (Base Class)
// =============================================================================

describe("PostgresMcpError", () => {
  it("should create error with message and code", () => {
    const error = new PostgresMcpError("Test error", "TEST_CODE", ErrorCategory.INTERNAL);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("PostgresMcpError");
    expect(error.details).toBeUndefined();
  });

  it("should create error with message, code, and details", () => {
    const details = { key: "value", number: 42 };
    const error = new PostgresMcpError("Test error", "TEST_CODE", ErrorCategory.INTERNAL, { details });

    expect(error.message).toBe("Test error");
    expect(error.code).toBe("TEST_CODE");
    expect(error.details).toEqual(details);
  });

  it("should have proper stack trace", () => {
    const error = new PostgresMcpError("Stack test", "STACK_CODE", ErrorCategory.INTERNAL);

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("PostgresMcpError");
  });

  it("should be throwable and catchable", () => {
    expect(() => {
      throw new PostgresMcpError("Thrown error", "THROWN_CODE", ErrorCategory.INTERNAL);
    }).toThrow(PostgresMcpError);
  });
});

// =============================================================================
// ConnectionError
// =============================================================================

describe("ConnectionError", () => {
  it("should create with message only", () => {
    const error = new ConnectionError("Connection failed");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(ConnectionError);
    expect(error.message).toBe("Connection failed");
    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.name).toBe("ConnectionError");
  });

  it("should create with message and details", () => {
    const error = new ConnectionError("Connection timeout", {
      host: "localhost",
      port: 5432,
      timeout: 30000,
    });

    expect(error.code).toBe("CONNECTION_ERROR");
    expect(error.details).toEqual({
      host: "localhost",
      port: 5432,
      timeout: 30000,
    });
  });
});

// =============================================================================
// PoolError
// =============================================================================

describe("PoolError", () => {
  it("should create with message only", () => {
    const error = new PoolError("Pool exhausted");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(PoolError);
    expect(error.message).toBe("Pool exhausted");
    expect(error.code).toBe("POOL_ERROR");
    expect(error.name).toBe("PoolError");
  });

  it("should create with details", () => {
    const error = new PoolError("No available connections", {
      maxConnections: 10,
      activeConnections: 10,
      waitingRequests: 5,
    });

    expect(error.details).toEqual({
      maxConnections: 10,
      activeConnections: 10,
      waitingRequests: 5,
    });
  });
});

// =============================================================================
// QueryError
// =============================================================================

describe("QueryError", () => {
  it("should create with message only", () => {
    const error = new QueryError("Query failed");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(QueryError);
    expect(error.message).toBe("Query failed");
    expect(error.code).toBe("QUERY_ERROR");
    expect(error.name).toBe("QueryError");
  });

  it("should create with SQL details", () => {
    const error = new QueryError("Syntax error", {
      sql: "SELECT * FORM users",
      position: 10,
      pgCode: "42601",
    });

    expect(error.details).toEqual({
      sql: "SELECT * FORM users",
      position: 10,
      pgCode: "42601",
    });
  });
});

// =============================================================================
// AuthenticationError
// =============================================================================

describe("AuthenticationError", () => {
  it("should create with message only", () => {
    const error = new AuthenticationError("Invalid credentials");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.message).toBe("Invalid credentials");
    expect(error.code).toBe("AUTHENTICATION_ERROR");
    expect(error.name).toBe("AuthenticationError");
  });

  it("should create with authentication details", () => {
    const error = new AuthenticationError("Password mismatch", {
      username: "testuser",
      method: "md5",
    });

    expect(error.details).toEqual({
      username: "testuser",
      method: "md5",
    });
  });
});

// =============================================================================
// AuthorizationError
// =============================================================================

describe("AuthorizationError", () => {
  it("should create with message only", () => {
    const error = new AuthorizationError("Insufficient permissions");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.message).toBe("Insufficient permissions");
    expect(error.code).toBe("AUTHORIZATION_ERROR");
    expect(error.name).toBe("AuthorizationError");
  });

  it("should create with permission details", () => {
    const error = new AuthorizationError("Cannot DROP table", {
      table: "users",
      requiredRole: "admin",
      currentRole: "readonly",
    });

    expect(error.details).toEqual({
      table: "users",
      requiredRole: "admin",
      currentRole: "readonly",
    });
  });
});

// =============================================================================
// ValidationError
// =============================================================================

describe("ValidationError", () => {
  it("should create with message only", () => {
    const error = new ValidationError("Invalid input");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe("Invalid input");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.name).toBe("ValidationError");
  });

  it("should create with validation details", () => {
    const error = new ValidationError("Table name invalid", {
      field: "tableName",
      value: "drop table users;--",
      reason: "contains SQL injection pattern",
    });

    expect(error.details).toEqual({
      field: "tableName",
      value: "drop table users;--",
      reason: "contains SQL injection pattern",
    });
  });
});

// =============================================================================
// TransactionError
// =============================================================================

describe("TransactionError", () => {
  it("should create with message only", () => {
    const error = new TransactionError("Transaction aborted");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(TransactionError);
    expect(error.message).toBe("Transaction aborted");
    expect(error.code).toBe("TRANSACTION_ERROR");
    expect(error.name).toBe("TransactionError");
  });

  it("should create with transaction details", () => {
    const error = new TransactionError("Deadlock detected", {
      transactionId: "txn-12345",
      isolationLevel: "SERIALIZABLE",
      conflictingTable: "orders",
    });

    expect(error.details).toEqual({
      transactionId: "txn-12345",
      isolationLevel: "SERIALIZABLE",
      conflictingTable: "orders",
    });
  });
});

// =============================================================================
// ExtensionNotAvailableError
// =============================================================================

describe("ExtensionNotAvailableError", () => {
  it("should create with extension name", () => {
    const error = new ExtensionNotAvailableError("pgvector");

    expect(error).toBeInstanceOf(PostgresMcpError);
    expect(error).toBeInstanceOf(ExtensionNotAvailableError);
    expect(error.message).toBe(
      "Extension 'pgvector' is not installed or enabled",
    );
    expect(error.code).toBe("EXTENSION_MISSING");
    expect(error.name).toBe("ExtensionNotAvailableError");
    expect(error.details).toEqual({ extension: "pgvector" });
  });

  it("should merge extension name with additional details", () => {
    const error = new ExtensionNotAvailableError("postgis", {
      requiredVersion: "3.3.0",
      suggestion: "Run CREATE EXTENSION postgis;",
    });

    expect(error.message).toBe(
      "Extension 'postgis' is not installed or enabled",
    );
    expect(error.details).toEqual({
      extension: "postgis",
      requiredVersion: "3.3.0",
      suggestion: "Run CREATE EXTENSION postgis;",
    });
  });

  it("should handle various extension names", () => {
    const extensions = ["pgcrypto", "citext", "ltree", "pg_trgm", "uuid-ossp"];

    for (const ext of extensions) {
      const error = new ExtensionNotAvailableError(ext);
      expect(error.message).toContain(ext);
      expect(error.details?.["extension"]).toBe(ext);
    }
  });
});

// =============================================================================
// Error Inheritance Chain
// =============================================================================

describe("Error Inheritance", () => {
  it("all custom errors should inherit from PostgresMcpError", () => {
    const errors = [
      new ConnectionError("test"),
      new PoolError("test"),
      new QueryError("test"),
      new AuthenticationError("test"),
      new AuthorizationError("test"),
      new ValidationError("test"),
      new TransactionError("test"),
      new ExtensionNotAvailableError("test"),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(PostgresMcpError);
      expect(error).toBeInstanceOf(Error);
    }
  });

  it("should be distinguishable by instanceof", () => {
    const connError = new ConnectionError("conn");
    const queryError = new QueryError("query");

    expect(connError).toBeInstanceOf(ConnectionError);
    expect(connError).not.toBeInstanceOf(QueryError);
    expect(queryError).toBeInstanceOf(QueryError);
    expect(queryError).not.toBeInstanceOf(ConnectionError);
  });
});

// =============================================================================
// Error Serialization
// =============================================================================

describe("Error Serialization", () => {
  it("should serialize error to JSON with relevant fields", () => {
    const error = new QueryError("Query timeout", {
      sql: "SELECT * FROM large_table",
      timeout: 30000,
    });

    const serialized = JSON.stringify({
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
    });

    const parsed = JSON.parse(serialized) as {
      name: string;
      message: string;
      code: string;
      details: Record<string, unknown>;
    };
    expect(parsed.name).toBe("QueryError");
    expect(parsed.message).toBe("Query timeout");
    expect(parsed.code).toBe("QUERY_ERROR");
    expect(parsed.details).toEqual({
      sql: "SELECT * FROM large_table",
      timeout: 30000,
    });
  });
});
