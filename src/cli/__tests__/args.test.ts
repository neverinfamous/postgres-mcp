/**
 * postgres-mcp - CLI Arguments Parser Tests
 *
 * Comprehensive coverage for all CLI flags, env var fallbacks,
 * connection string parsing, OAuth config, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs, printHelp } from "../args.js";

describe("parseArgs", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset env to avoid leakage between tests
    process.env = { ...originalEnv };
    delete process.env["MCP_HOST"];
    delete process.env["HOST"];
    delete process.env["PGHOST"];
    delete process.env["POSTGRES_HOST"];
    delete process.env["PGPORT"];
    delete process.env["POSTGRES_PORT"];
    delete process.env["PGUSER"];
    delete process.env["POSTGRES_USER"];
    delete process.env["PGPASSWORD"];
    delete process.env["POSTGRES_PASSWORD"];
    delete process.env["PGDATABASE"];
    delete process.env["POSTGRES_DATABASE"];
    delete process.env["POSTGRES_TOOL_FILTER"];
    delete process.env["MCP_TOOL_FILTER"];
    delete process.env["LOG_LEVEL"];
    delete process.env["OAUTH_ENABLED"];
    delete process.env["OAUTH_ISSUER"];
    delete process.env["OAUTH_AUDIENCE"];
    delete process.env["OAUTH_JWKS_URI"];
    delete process.env["OAUTH_CLOCK_TOLERANCE"];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Server Host
  // ===========================================================================

  describe("--server-host", () => {
    it("should parse --server-host flag", () => {
      const result = parseArgs(["--server-host", "0.0.0.0"]);
      expect(result.serverHost).toBe("0.0.0.0");
    });

    it("should leave serverHost undefined when not provided", () => {
      const result = parseArgs([]);
      expect(result.serverHost).toBeUndefined();
    });

    it("should fall back to MCP_HOST env var", () => {
      process.env["MCP_HOST"] = "0.0.0.0";
      const result = parseArgs([]);
      expect(result.serverHost).toBe("0.0.0.0");
    });

    it("should fall back to HOST env var", () => {
      process.env["HOST"] = "127.0.0.1";
      const result = parseArgs([]);
      expect(result.serverHost).toBe("127.0.0.1");
    });

    it("should prioritize MCP_HOST over HOST env var", () => {
      process.env["MCP_HOST"] = "0.0.0.0";
      process.env["HOST"] = "127.0.0.1";
      const result = parseArgs([]);
      expect(result.serverHost).toBe("0.0.0.0");
    });

    it("should prioritize CLI flag over env vars", () => {
      process.env["MCP_HOST"] = "10.0.0.1";
      process.env["HOST"] = "10.0.0.2";
      const result = parseArgs(["--server-host", "192.168.1.1"]);
      expect(result.serverHost).toBe("192.168.1.1");
    });
  });

  // ===========================================================================
  // Database Host (--host)
  // ===========================================================================

  describe("--host (PostgreSQL database host)", () => {
    it("should parse --host as database host, not server host", () => {
      const result = parseArgs(["--host", "db.example.com"]);
      expect(result.database?.host).toBe("db.example.com");
      expect(result.serverHost).toBeUndefined();
    });

    it("should allow --host and --server-host simultaneously", () => {
      const result = parseArgs([
        "--host",
        "db.example.com",
        "--server-host",
        "0.0.0.0",
      ]);
      expect(result.database?.host).toBe("db.example.com");
      expect(result.serverHost).toBe("0.0.0.0");
    });
  });

  // ===========================================================================
  // Transport & Port
  // ===========================================================================

  describe("transport and port", () => {
    it("should default transport to stdio", () => {
      const result = parseArgs([]);
      expect(result.transport).toBe("stdio");
    });

    it("should parse --transport flag", () => {
      const result = parseArgs(["--transport", "http"]);
      expect(result.transport).toBe("http");
    });

    it("should parse -t short flag", () => {
      const result = parseArgs(["-t", "sse"]);
      expect(result.transport).toBe("sse");
    });

    it("should parse --port flag", () => {
      const result = parseArgs(["--port", "8080"]);
      expect(result.port).toBe(8080);
    });

    it("should parse -p short flag", () => {
      const result = parseArgs(["-p", "9090"]);
      expect(result.port).toBe(9090);
    });
  });

  // ===========================================================================
  // PostgreSQL Connection String (--postgres)
  // ===========================================================================

  describe("--postgres connection string", () => {
    it("should parse a full connection string", () => {
      const result = parseArgs([
        "--postgres",
        "postgres://admin:secret@db.host.com:5433/mydb",
      ]);
      expect(result.database).toBeDefined();
      expect(result.database?.host).toBe("db.host.com");
      expect(result.database?.port).toBe(5433);
      expect(result.database?.username).toBe("admin");
      expect(result.database?.password).toBe("secret");
      expect(result.database?.database).toBe("mydb");
      expect(result.database?.type).toBe("postgresql");
    });

    it("should parse connection string with defaults for missing parts", () => {
      const result = parseArgs(["--postgres", "postgres://localhost/"]);
      expect(result.database?.host).toBe("localhost");
      expect(result.database?.port).toBe(5432);
      expect(result.database?.username).toBe("postgres");
      expect(result.database?.database).toBe("postgres");
    });

    it("should parse connection string with ssl=true query param", () => {
      const result = parseArgs([
        "--postgres",
        "postgres://localhost/mydb?ssl=true",
      ]);
      expect(result.database?.options?.ssl).toBe(true);
    });

    it("should parse connection string with sslmode=require query param", () => {
      const result = parseArgs([
        "--postgres",
        "postgres://localhost/mydb?sslmode=require",
      ]);
      expect(result.database?.options?.ssl).toBe(true);
    });

    it("should not set SSL when ssl param is absent", () => {
      const result = parseArgs(["--postgres", "postgres://localhost/mydb"]);
      expect(result.database?.options?.ssl).toBeUndefined();
    });

    it("should apply --pool-max to connection string config", () => {
      const result = parseArgs([
        "--postgres",
        "postgres://localhost/mydb",
        "--pool-max",
        "25",
      ]);
      expect(result.database?.pool?.max).toBe(25);
    });
  });

  // ===========================================================================
  // Individual PostgreSQL Connection Params
  // ===========================================================================

  describe("individual PostgreSQL params", () => {
    it("should parse --pg-port", () => {
      const result = parseArgs(["--host", "localhost", "--pg-port", "5433"]);
      expect(result.database?.port).toBe(5433);
    });

    it("should parse --user", () => {
      const result = parseArgs(["--host", "localhost", "--user", "admin"]);
      expect(result.database?.username).toBe("admin");
    });

    it("should parse --password", () => {
      const result = parseArgs([
        "--host",
        "localhost",
        "--password",
        "s3cret",
      ]);
      expect(result.database?.password).toBe("s3cret");
    });

    it("should parse --database", () => {
      const result = parseArgs([
        "--host",
        "localhost",
        "--database",
        "production",
      ]);
      expect(result.database?.database).toBe("production");
    });

    it("should parse --ssl flag", () => {
      const result = parseArgs(["--host", "localhost", "--ssl"]);
      expect(result.database?.options?.ssl).toBe(true);
    });

    it("should parse --pool-max with individual params", () => {
      const result = parseArgs([
        "--host",
        "localhost",
        "--pool-max",
        "20",
      ]);
      expect(result.database?.pool?.max).toBe(20);
    });

    it("should not set pool when pool-max is 0", () => {
      const result = parseArgs([
        "--host",
        "localhost",
        "--pool-max",
        "0",
      ]);
      expect(result.database?.pool).toBeUndefined();
    });

    it("should combine multiple individual params into a complete config", () => {
      const result = parseArgs([
        "--host",
        "db.example.com",
        "--pg-port",
        "5433",
        "--user",
        "admin",
        "--password",
        "secret",
        "--database",
        "production",
        "--ssl",
        "--pool-max",
        "15",
      ]);
      expect(result.database).toEqual({
        type: "postgresql",
        host: "db.example.com",
        port: 5433,
        username: "admin",
        password: "secret",
        database: "production",
        options: { ssl: true },
        pool: { max: 15 },
      });
    });
  });

  // ===========================================================================
  // Environment Variable Fallbacks for Database Config
  // ===========================================================================

  describe("database env var fallbacks", () => {
    it("should fall back to PGHOST when no CLI flags", () => {
      process.env["PGHOST"] = "pg-host.example.com";
      const result = parseArgs([]);
      expect(result.database?.host).toBe("pg-host.example.com");
    });

    it("should fall back to POSTGRES_HOST when no CLI flags or PGHOST", () => {
      process.env["POSTGRES_HOST"] = "docker-host.example.com";
      const result = parseArgs([]);
      expect(result.database?.host).toBe("docker-host.example.com");
    });

    it("should fall back to PGUSER", () => {
      process.env["PGHOST"] = "localhost";
      process.env["PGUSER"] = "pg_admin";
      const result = parseArgs([]);
      expect(result.database?.username).toBe("pg_admin");
    });

    it("should fall back to POSTGRES_USER", () => {
      process.env["PGHOST"] = "localhost";
      process.env["POSTGRES_USER"] = "docker_admin";
      const result = parseArgs([]);
      expect(result.database?.username).toBe("docker_admin");
    });

    it("should fall back to PGPASSWORD", () => {
      process.env["PGHOST"] = "localhost";
      process.env["PGPASSWORD"] = "env-password";
      const result = parseArgs([]);
      expect(result.database?.password).toBe("env-password");
    });

    it("should fall back to POSTGRES_PASSWORD", () => {
      process.env["PGHOST"] = "localhost";
      process.env["POSTGRES_PASSWORD"] = "docker-password";
      const result = parseArgs([]);
      expect(result.database?.password).toBe("docker-password");
    });

    it("should fall back to PGDATABASE", () => {
      process.env["PGHOST"] = "localhost";
      process.env["PGDATABASE"] = "env-db";
      const result = parseArgs([]);
      expect(result.database?.database).toBe("env-db");
    });

    it("should fall back to POSTGRES_DATABASE", () => {
      process.env["PGHOST"] = "localhost";
      process.env["POSTGRES_DATABASE"] = "docker-db";
      const result = parseArgs([]);
      expect(result.database?.database).toBe("docker-db");
    });

    it("should fall back to PGPORT", () => {
      process.env["PGHOST"] = "localhost";
      process.env["PGPORT"] = "5433";
      const result = parseArgs([]);
      expect(result.database?.port).toBe(5433);
    });

    it("should fall back to POSTGRES_PORT", () => {
      process.env["PGHOST"] = "localhost";
      process.env["POSTGRES_PORT"] = "5434";
      const result = parseArgs([]);
      expect(result.database?.port).toBe(5434);
    });

    it("should not create database config when no params or env vars set", () => {
      const result = parseArgs([]);
      expect(result.database).toBeUndefined();
    });
  });

  // ===========================================================================
  // Tool Filter
  // ===========================================================================

  describe("--tool-filter", () => {
    it("should parse --tool-filter flag", () => {
      const result = parseArgs(["--tool-filter", "core,jsonb"]);
      expect(result.toolFilter).toBe("core,jsonb");
    });

    it("should parse -f short flag", () => {
      const result = parseArgs(["-f", "core"]);
      expect(result.toolFilter).toBe("core");
    });

    it("should handle tool filter values that start with dash", () => {
      // Tool filter values can start with '-' (e.g., "-base,-extensions,+starter")
      const result = parseArgs(["-f", "-base,-extensions,+starter"]);
      expect(result.toolFilter).toBe("-base,-extensions,+starter");
    });

    it("should fall back to POSTGRES_TOOL_FILTER env var", () => {
      process.env["POSTGRES_TOOL_FILTER"] = "core,admin";
      const result = parseArgs([]);
      expect(result.toolFilter).toBe("core,admin");
    });

    it("should fall back to MCP_TOOL_FILTER env var", () => {
      process.env["MCP_TOOL_FILTER"] = "core";
      const result = parseArgs([]);
      expect(result.toolFilter).toBe("core");
    });

    it("should prioritize CLI flag over env var", () => {
      process.env["POSTGRES_TOOL_FILTER"] = "env-filter";
      const result = parseArgs(["-f", "cli-filter"]);
      expect(result.toolFilter).toBe("cli-filter");
    });
  });

  // ===========================================================================
  // Log Level
  // ===========================================================================

  describe("--log-level", () => {
    it("should parse --log-level flag", () => {
      const result = parseArgs(["--log-level", "debug"]);
      expect(result.logLevel).toBe("debug");
    });

    it("should accept all valid log levels", () => {
      for (const level of [
        "debug",
        "info",
        "notice",
        "warning",
        "error",
        "critical",
        "alert",
        "emergency",
      ]) {
        const result = parseArgs(["--log-level", level]);
        expect(result.logLevel).toBe(level);
      }
    });

    it("should fall back to LOG_LEVEL env var", () => {
      process.env["LOG_LEVEL"] = "warning";
      const result = parseArgs([]);
      expect(result.logLevel).toBe("warning");
    });

    it("should prioritize CLI flag over env var", () => {
      process.env["LOG_LEVEL"] = "warning";
      const result = parseArgs(["--log-level", "debug"]);
      expect(result.logLevel).toBe("debug");
    });
  });

  // ===========================================================================
  // OAuth Options
  // ===========================================================================

  describe("OAuth options", () => {
    it("should parse --oauth-enabled / -o flag", () => {
      const result = parseArgs(["--oauth-enabled"]);
      expect(result.oauth).toBeDefined();
      expect(result.oauth?.enabled).toBe(true);
    });

    it("should parse -o short flag", () => {
      const result = parseArgs(["-o"]);
      expect(result.oauth?.enabled).toBe(true);
    });

    it("should parse --oauth-issuer", () => {
      const result = parseArgs([
        "-o",
        "--oauth-issuer",
        "https://auth.example.com",
      ]);
      expect(result.oauth?.issuer).toBe("https://auth.example.com");
      expect(result.oauth?.authorizationServerUrl).toBe(
        "https://auth.example.com",
      );
    });

    it("should parse --oauth-audience", () => {
      const result = parseArgs([
        "-o",
        "--oauth-audience",
        "my-api",
      ]);
      expect(result.oauth?.audience).toBe("my-api");
    });

    it("should parse --oauth-jwks-uri", () => {
      const result = parseArgs([
        "-o",
        "--oauth-jwks-uri",
        "https://auth.example.com/.well-known/jwks.json",
      ]);
      expect(result.oauth?.jwksUri).toBe(
        "https://auth.example.com/.well-known/jwks.json",
      );
    });

    it("should parse --oauth-clock-tolerance", () => {
      const result = parseArgs([
        "-o",
        "--oauth-clock-tolerance",
        "30",
      ]);
      expect(result.oauth?.clockTolerance).toBe(30);
    });

    it("should fall back to OAUTH_ENABLED env var", () => {
      process.env["OAUTH_ENABLED"] = "true";
      const result = parseArgs([]);
      expect(result.oauth?.enabled).toBe(true);
    });

    it("should fall back to OAUTH_ISSUER env var", () => {
      process.env["OAUTH_ENABLED"] = "true";
      process.env["OAUTH_ISSUER"] = "https://env-auth.example.com";
      const result = parseArgs([]);
      expect(result.oauth?.issuer).toBe("https://env-auth.example.com");
    });

    it("should fall back to OAUTH_AUDIENCE env var", () => {
      process.env["OAUTH_ENABLED"] = "true";
      process.env["OAUTH_AUDIENCE"] = "env-api";
      const result = parseArgs([]);
      expect(result.oauth?.audience).toBe("env-api");
    });

    it("should fall back to OAUTH_JWKS_URI env var", () => {
      process.env["OAUTH_ENABLED"] = "true";
      process.env["OAUTH_JWKS_URI"] = "https://env-auth.example.com/jwks";
      const result = parseArgs([]);
      expect(result.oauth?.jwksUri).toBe(
        "https://env-auth.example.com/jwks",
      );
    });

    it("should fall back to OAUTH_CLOCK_TOLERANCE env var", () => {
      process.env["OAUTH_ENABLED"] = "true";
      process.env["OAUTH_CLOCK_TOLERANCE"] = "120";
      const result = parseArgs([]);
      expect(result.oauth?.clockTolerance).toBe(120);
    });

    it("should not create oauth config when not enabled", () => {
      const result = parseArgs([]);
      expect(result.oauth).toBeUndefined();
    });

    it("should combine all OAuth options", () => {
      const result = parseArgs([
        "-o",
        "--oauth-issuer",
        "https://auth.example.com",
        "--oauth-audience",
        "my-api",
        "--oauth-jwks-uri",
        "https://auth.example.com/jwks",
        "--oauth-clock-tolerance",
        "60",
      ]);
      expect(result.oauth).toEqual({
        enabled: true,
        authorizationServerUrl: "https://auth.example.com",
        issuer: "https://auth.example.com",
        audience: "my-api",
        jwksUri: "https://auth.example.com/jwks",
        clockTolerance: 60,
      });
    });
  });

  // ===========================================================================
  // Help and Version
  // ===========================================================================

  describe("--help and --version", () => {
    it("should set shouldExit for --version", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      const result = parseArgs(["--version"]);
      expect(result.shouldExit).toBe(true);
      spy.mockRestore();
    });

    it("should set shouldExit for -v", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      const result = parseArgs(["-v"]);
      expect(result.shouldExit).toBe(true);
      spy.mockRestore();
    });

    it("should set shouldExit for --help", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      const result = parseArgs(["--help"]);
      expect(result.shouldExit).toBe(true);
      spy.mockRestore();
    });

    it("should set shouldExit for -h", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      const result = parseArgs(["-h"]);
      expect(result.shouldExit).toBe(true);
      spy.mockRestore();
    });

    it("--version should return early without processing other flags", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      const result = parseArgs(["--version", "--port", "9999"]);
      expect(result.shouldExit).toBe(true);
      // Port should not be set since --version causes early return
      expect(result.port).toBeUndefined();
      spy.mockRestore();
    });
  });

  // ===========================================================================
  // Unknown Options
  // ===========================================================================

  describe("unknown options", () => {
    it("should exit on unknown options starting with dash", () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => { });
      const exitSpy = vi
        .spyOn(process, "exit")
        .mockImplementation(() => undefined as never);

      parseArgs(["--unknown-flag"]);

      expect(exitSpy).toHaveBeenCalledWith(1);
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  // ===========================================================================
  // printHelp
  // ===========================================================================

  describe("printHelp", () => {
    it("should output help text to stderr", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => { });
      printHelp();
      expect(spy).toHaveBeenCalled();
      const output = spy.mock.calls[0]?.[0] as string;
      expect(output).toContain("postgres-mcp");
      expect(output).toContain("--transport");
      expect(output).toContain("--postgres");
      expect(output).toContain("--oauth-enabled");
      spy.mockRestore();
    });
  });
});
