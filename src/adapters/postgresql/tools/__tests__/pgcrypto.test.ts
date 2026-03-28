/**
 * postgres-mcp - pgcrypto Extension Tools Unit Tests
 *
 * Tests for cryptographic function tools.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import {
  createMockPostgresAdapter,
  createMockRequestContext,
} from "../../../../__tests__/mocks/index.js";
import { getPgcryptoTools } from "../pgcrypto.js";

describe("Pgcrypto Tools", () => {
  let mockAdapter: ReturnType<typeof createMockPostgresAdapter>;
  let mockContext: ReturnType<typeof createMockRequestContext>;
  let tools: ReturnType<typeof getPgcryptoTools>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapter = createMockPostgresAdapter();
    mockContext = createMockRequestContext();
    tools = getPgcryptoTools(mockAdapter as unknown as PostgresAdapter);
  });

  const findTool = (name: string) => tools.find((t) => t.name === name);

  describe("pg_pgcrypto_create_extension", () => {
    it("should create pgcrypto extension", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({ rows: [] });

      const tool = findTool("pg_pgcrypto_create_extension");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        message: string;
      };

      expect(result.success).toBe(true);
      expect(result.message).toContain("pgcrypto");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("CREATE EXTENSION IF NOT EXISTS pgcrypto"),
      );
    });
  });

  describe("pg_pgcrypto_hash", () => {
    it("should hash data with SHA-256", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [
          {
            hash: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
          },
        ],
      });

      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        {
          data: "Hello World",
          algorithm: "sha256",
        },
        mockContext,
      )) as { success: boolean; algorithm: string; hash: string };

      expect(result.success).toBe(true);
      expect(result.algorithm).toBe("sha256");
      expect(result.hash).toBeDefined();
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("digest($1, $2)"),
        ["Hello World", "sha256"],
      );
    });

    it("should use base64 encoding when specified", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "base64encodedstring" }],
      });

      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        {
          data: "test",
          algorithm: "md5",
          encoding: "base64",
        },
        mockContext,
      )) as { encoding: string };

      expect(result.encoding).toBe("base64");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("'base64'"),
        expect.anything(),
      );
    });

    it("should default to hex encoding", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "abcdef" }],
      });

      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        {
          data: "test",
          algorithm: "sha512",
        },
        mockContext,
      )) as { encoding: string };

      expect(result.encoding).toBe("hex");
    });

    it("should return structured error for invalid algorithm", async () => {
      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        {
          data: "test",
          algorithm: "invalid_algo",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return structured error for invalid encoding", async () => {
      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        {
          data: "test",
          algorithm: "sha256",
          encoding: "invalid_enc",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_hmac", () => {
    it("should compute HMAC with secret key", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hmac: "hmac_result_here" }],
      });

      const tool = findTool("pg_pgcrypto_hmac");
      const result = (await tool!.handler(
        {
          data: "message",
          key: "secret",
          algorithm: "sha256",
        },
        mockContext,
      )) as { success: boolean; hmac: string };

      expect(result.success).toBe(true);
      expect(result.hmac).toBeDefined();
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("hmac($1, $2, $3)"),
        ["message", "secret", "sha256"],
      );
    });

    it("should support base64 encoding", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hmac: "base64hmac" }],
      });

      const tool = findTool("pg_pgcrypto_hmac");
      await tool!.handler(
        {
          data: "msg",
          key: "key",
          algorithm: "sha256",
          encoding: "base64",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("encode(hmac($1, $2, $3), 'base64')"),
        expect.anything(),
      );
    });

    it("should return structured error for invalid algorithm", async () => {
      const tool = findTool("pg_pgcrypto_hmac");
      const result = (await tool!.handler(
        {
          data: "msg",
          key: "key",
          algorithm: "invalid_algo",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_encrypt", () => {
    it("should encrypt data with password", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ encrypted: "encrypted_base64_data" }],
      });

      const tool = findTool("pg_pgcrypto_encrypt");
      const result = (await tool!.handler(
        {
          data: "secret message",
          password: "mypassword",
        },
        mockContext,
      )) as { success: boolean; encryptedData: string; encoding: string };

      expect(result.success).toBe(true);
      expect(result.encryptedData).toBeDefined();
      expect(result.encoding).toBe("base64");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("pgp_sym_encrypt"),
        ["secret message", "mypassword"],
      );
    });

    it("should support encryption options", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ encrypted: "encrypted_data" }],
      });

      const tool = findTool("pg_pgcrypto_encrypt");
      await tool!.handler(
        {
          data: "message",
          password: "pass",
          options: "compress-algo=1",
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("pgp_sym_encrypt($1, $2, $3)"),
        ["message", "pass", "compress-algo=1"],
      );
    });

    it("should return structured error for unsupported cipher algorithm", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("Unsupported cipher algorithm"),
      );

      const tool = findTool("pg_pgcrypto_encrypt");
      const result = (await tool!.handler(
        {
          data: "secret",
          password: "pass",
          options: "cipher-algo=invalid",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_decrypt", () => {
    it("should decrypt data with correct password", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ decrypted: "original message" }],
      });

      const tool = findTool("pg_pgcrypto_decrypt");
      const result = (await tool!.handler(
        {
          encryptedData: "encrypted_base64",
          password: "mypassword",
        },
        mockContext,
      )) as { success: boolean; decrypted: string };

      expect(result.success).toBe(true);
      expect(result.decrypted).toBe("original message");
    });

    it("should return structured error for wrong key", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("Wrong key or corrupt data"),
      );

      const tool = findTool("pg_pgcrypto_decrypt");
      const result = (await tool!.handler(
        {
          encryptedData: "invalid_data",
          password: "wrong_password",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return structured error for corrupt base64 data", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error('invalid symbol "-" found while decoding base64 sequence'),
      );

      const tool = findTool("pg_pgcrypto_decrypt");
      const result = (await tool!.handler(
        {
          encryptedData: "not-valid-base64!!!",
          password: "password",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_gen_random_uuid", () => {
    it("should generate a single UUID by default", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ uuid: "550e8400-e29b-41d4-a716-446655440000" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({}, mockContext)) as {
        success: boolean;
        uuids: string[];
        count: number;
      };

      expect(result.success).toBe(true);
      expect(result.uuids).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it("should handle undefined params (zero-argument call)", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ uuid: "550e8400-e29b-41d4-a716-446655440000" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      // Pass undefined to simulate calling without arguments
      const result = (await tool!.handler(undefined, mockContext)) as {
        success: boolean;
        uuids: string[];
        count: number;
      };

      expect(result.success).toBe(true);
      expect(result.uuids).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it("should generate multiple UUIDs when count specified", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ uuid: "uuid-1" }, { uuid: "uuid-2" }, { uuid: "uuid-3" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({ count: 3 }, mockContext)) as {
        uuids: string[];
        count: number;
      };

      expect(result.uuids).toHaveLength(3);
      expect(result.count).toBe(3);
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("generate_series(1, $1)"),
        [3],
      );
    });

    it("should return structured error for count 0", async () => {
      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({ count: 0 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return structured error for count 101", async () => {
      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({ count: 101 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_gen_random_bytes", () => {
    it("should generate random bytes in hex", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ random_bytes: "a1b2c3d4e5f6" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_bytes");
      const result = (await tool!.handler(
        {
          length: 16,
        },
        mockContext,
      )) as { success: boolean; randomBytes: string; encoding: string };

      expect(result.success).toBe(true);
      expect(result.encoding).toBe("hex");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("gen_random_bytes"),
        [16, "hex"],
      );
    });

    it("should support base64 encoding", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ random_bytes: "base64random==" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_bytes");
      const result = (await tool!.handler(
        {
          length: 32,
          encoding: "base64",
        },
        mockContext,
      )) as { encoding: string };

      expect(result.encoding).toBe("base64");
    });

    it("should return structured error for length 0", async () => {
      const tool = findTool("pg_pgcrypto_gen_random_bytes");
      const result = (await tool!.handler(
        {
          length: 0,
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return structured error for length 1025", async () => {
      const tool = findTool("pg_pgcrypto_gen_random_bytes");
      const result = (await tool!.handler(
        {
          length: 1025,
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_gen_salt", () => {
    it("should generate salt with default algorithm", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ salt: "$2a$06$abcdefghij" }],
      });

      const tool = findTool("pg_pgcrypto_gen_salt");
      const result = (await tool!.handler(
        {
          type: "bf",
        },
        mockContext,
      )) as { success: boolean; salt: string; type: string };

      expect(result.success).toBe(true);
      expect(result.salt).toBeDefined();
      expect(result.type).toBe("bf");
    });

    it("should support iterations for blowfish", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ salt: "$2a$12$somesaltvalue" }],
      });

      const tool = findTool("pg_pgcrypto_gen_salt");
      await tool!.handler(
        {
          type: "bf",
          iterations: 12,
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("gen_salt($1, $2)"),
        ["bf", 12],
      );
    });

    it("should not pass iterations for md5", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ salt: "$1$abcdefgh" }],
      });

      const tool = findTool("pg_pgcrypto_gen_salt");
      await tool!.handler(
        {
          type: "md5",
          iterations: 10, // Should be ignored
        },
        mockContext,
      );

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("gen_salt($1)"),
        ["md5"],
      );
    });

    it("should return structured error for invalid type", async () => {
      const tool = findTool("pg_pgcrypto_gen_salt");
      const result = (await tool!.handler(
        {
          type: "invalid_type",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("pg_pgcrypto_crypt", () => {
    it("should hash password with bcrypt salt", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "$2a$06$hashedpassword" }],
      });

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        {
          password: "mypassword",
          salt: "$2a$06$somesaltvalue",
        },
        mockContext,
      )) as { success: boolean; hash: string; algorithm: string };

      expect(result.success).toBe(true);
      expect(result.algorithm).toBe("bcrypt");
      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("crypt($1, $2)"),
        ["mypassword", "$2a$06$somesaltvalue"],
      );
    });

    it("should detect md5 algorithm from salt", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "$1$salt$hash" }],
      });

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        {
          password: "pass",
          salt: "$1$saltval$",
        },
        mockContext,
      )) as { algorithm: string };

      expect(result.algorithm).toBe("md5");
    });

    it("should detect xdes algorithm from salt", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "_hashvalue" }],
      });

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        {
          password: "pass",
          salt: "_saltvalu",
        },
        mockContext,
      )) as { algorithm: string };

      expect(result.algorithm).toBe("xdes");
    });

    it("should detect des algorithm for other salts", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "hashvalue" }],
      });

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        {
          password: "pass",
          salt: "ab",
        },
        mockContext,
      )) as { algorithm: string };

      expect(result.algorithm).toBe("des");
    });
  });

  it("should export all 9 pgcrypto tools", () => {
    expect(tools).toHaveLength(9);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("pg_pgcrypto_create_extension");
    expect(toolNames).toContain("pg_pgcrypto_hash");
    expect(toolNames).toContain("pg_pgcrypto_hmac");
    expect(toolNames).toContain("pg_pgcrypto_encrypt");
    expect(toolNames).toContain("pg_pgcrypto_decrypt");
    expect(toolNames).toContain("pg_pgcrypto_gen_random_uuid");
    expect(toolNames).toContain("pg_pgcrypto_gen_random_bytes");
    expect(toolNames).toContain("pg_pgcrypto_gen_salt");
    expect(toolNames).toContain("pg_pgcrypto_crypt");
  });

  // ==========================================================================
  // DB-error paths (parsePostgresError catch blocks)
  // ==========================================================================

  describe("DB-error handling via parsePostgresError", () => {
    it("pg_pgcrypto_hash should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_hash");
      const result = (await tool!.handler(
        { data: "test", algorithm: "sha256" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_hmac should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_hmac");
      const result = (await tool!.handler(
        { data: "test", key: "secret", algorithm: "sha256" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_encrypt should return structured error for DB execution errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_encrypt");
      const result = (await tool!.handler(
        { data: "secret", password: "pass" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_decrypt should return structured error for DB execution errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_decrypt");
      const result = (await tool!.handler(
        { encryptedData: "abc", password: "pass" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_gen_random_uuid should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({ count: 1 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_gen_random_bytes should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_gen_random_bytes");
      const result = (await tool!.handler({ length: 16 }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_gen_salt should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_gen_salt");
      const result = (await tool!.handler({ type: "bf" }, mockContext)) as {
        success: boolean;
        error: string;
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("pg_pgcrypto_crypt should return structured error for DB errors", async () => {
      mockAdapter.executeQuery.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        { password: "pass", salt: "$2a$06$somesalt" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ==========================================================================
  // Edge-case branches
  // ==========================================================================

  describe("Edge-case branches", () => {
    it("pg_pgcrypto_decrypt should return error when decrypted value is null", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ decrypted: null }],
      });

      const tool = findTool("pg_pgcrypto_decrypt");
      const result = (await tool!.handler(
        { encryptedData: "somedata", password: "pass" },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain("Decryption failed");
    });

    it("pg_pgcrypto_gen_salt should pass iterations for xdes type", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ salt: "_J9..salt" }],
      });

      const tool = findTool("pg_pgcrypto_gen_salt");
      await tool!.handler({ type: "xdes", iterations: 725 }, mockContext);

      expect(mockAdapter.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining("gen_salt($1, $2)"),
        ["xdes", 725],
      );
    });

    it("pg_pgcrypto_gen_random_uuid should set uuid convenience property for single uuid", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ uuid: "550e8400-e29b-41d4-a716-446655440000" }],
      });

      const tool = findTool("pg_pgcrypto_gen_random_uuid");
      const result = (await tool!.handler({ count: 1 }, mockContext)) as {
        uuid: string;
        uuids: string[];
      };

      expect(result.uuid).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.uuids).toHaveLength(1);
    });

    it("pg_pgcrypto_crypt should detect $2b$ as bcrypt", async () => {
      mockAdapter.executeQuery.mockResolvedValueOnce({
        rows: [{ hash: "$2b$12$hashedpass" }],
      });

      const tool = findTool("pg_pgcrypto_crypt");
      const result = (await tool!.handler(
        { password: "pass", salt: "$2b$12$somesalt" },
        mockContext,
      )) as { algorithm: string };

      expect(result.algorithm).toBe("bcrypt");
    });

    it("pg_pgcrypto_hmac should return structured error for invalid encoding", async () => {
      const tool = findTool("pg_pgcrypto_hmac");
      const result = (await tool!.handler(
        {
          data: "msg",
          key: "key",
          algorithm: "sha256",
          encoding: "invalid_enc",
        },
        mockContext,
      )) as { success: boolean; error: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
