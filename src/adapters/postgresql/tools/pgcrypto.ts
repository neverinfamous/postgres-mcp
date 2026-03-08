/**
 * PostgreSQL pgcrypto Extension Tools
 * 9 tools total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { formatPostgresError } from "./core/error-helpers.js";
import {
  PgcryptoHashSchema,
  PgcryptoHashSchemaBase,
  PgcryptoHmacSchema,
  PgcryptoHmacSchemaBase,
  PgcryptoEncryptSchema,
  PgcryptoEncryptSchemaBase,
  PgcryptoDecryptSchema,
  PgcryptoDecryptSchemaBase,
  PgcryptoRandomBytesSchema,
  PgcryptoRandomBytesSchemaBase,
  PgcryptoGenSaltSchema,
  PgcryptoGenSaltSchemaBase,
  PgcryptoCryptSchemaBase,
  PgcryptoCryptSchema,
  // Output schemas
  PgcryptoCreateExtensionOutputSchema,
  PgcryptoHashOutputSchema,
  PgcryptoHmacOutputSchema,
  PgcryptoEncryptOutputSchema,
  PgcryptoDecryptOutputSchema,
  PgcryptoGenRandomUuidOutputSchema,
  PgcryptoGenRandomBytesOutputSchema,
  PgcryptoGenSaltOutputSchema,
  PgcryptoCryptOutputSchema,
} from "../schemas/index.js";

export function getPgcryptoTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createPgcryptoExtensionTool(adapter),
    createPgcryptoHashTool(adapter),
    createPgcryptoHmacTool(adapter),
    createPgcryptoEncryptTool(adapter),
    createPgcryptoDecryptTool(adapter),
    createPgcryptoGenRandomUuidTool(adapter),
    createPgcryptoGenRandomBytesTool(adapter),
    createPgcryptoGenSaltTool(adapter),
    createPgcryptoCryptTool(adapter),
  ];
}

function createPgcryptoExtensionTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_create_extension",
    description: "Enable the pgcrypto extension for cryptographic functions.",
    group: "pgcrypto",
    inputSchema: z.object({}),
    outputSchema: PgcryptoCreateExtensionOutputSchema,
    annotations: write("Create Pgcrypto Extension"),
    icons: getToolIcons("pgcrypto", write("Create Pgcrypto Extension")),
    handler: async (_params: unknown, _context: RequestContext) => {
      await adapter.executeQuery("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      return { success: true, message: "pgcrypto extension enabled" };
    },
  };
}

function createPgcryptoHashTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_hash",
    description:
      "Hash data using various algorithms (SHA-256, SHA-512, MD5, etc.).",
    group: "pgcrypto",
    inputSchema: PgcryptoHashSchemaBase,
    outputSchema: PgcryptoHashOutputSchema,
    annotations: readOnly("Hash Data"),
    icons: getToolIcons("pgcrypto", readOnly("Hash Data")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { data, algorithm, encoding } = PgcryptoHashSchema.parse(params);
        const enc = encoding ?? "hex";
        const encodeFunc =
          enc === "base64"
            ? "encode(digest($1, $2), 'base64')"
            : "encode(digest($1, $2), 'hex')";
        const result = await adapter.executeQuery(
          `SELECT ${encodeFunc} as hash`,
          [data, algorithm],
        );
        return {
          success: true,
          algorithm,
          encoding: enc,
          hash: result.rows?.[0]?.["hash"] as string,
          inputLength: data.length,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_hash",
          }),
        };
      }
    },
  };
}

function createPgcryptoHmacTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_hmac",
    description: "Compute HMAC for data with a secret key.",
    group: "pgcrypto",
    inputSchema: PgcryptoHmacSchemaBase,
    outputSchema: PgcryptoHmacOutputSchema,
    annotations: readOnly("HMAC"),
    icons: getToolIcons("pgcrypto", readOnly("HMAC")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { data, key, algorithm, encoding } =
          PgcryptoHmacSchema.parse(params);
        const enc = encoding ?? "hex";
        const encodeFunc =
          enc === "base64"
            ? "encode(hmac($1, $2, $3), 'base64')"
            : "encode(hmac($1, $2, $3), 'hex')";
        const result = await adapter.executeQuery(
          `SELECT ${encodeFunc} as hmac`,
          [data, key, algorithm],
        );
        return {
          success: true,
          algorithm,
          encoding: enc,
          hmac: result.rows?.[0]?.["hmac"] as string,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_hmac",
          }),
        };
      }
    },
  };
}

function createPgcryptoEncryptTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_encrypt",
    description: "Encrypt data using PGP symmetric encryption.",
    group: "pgcrypto",
    inputSchema: PgcryptoEncryptSchemaBase,
    outputSchema: PgcryptoEncryptOutputSchema,
    annotations: readOnly("Encrypt Data"),
    icons: getToolIcons("pgcrypto", readOnly("Encrypt Data")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema with alias resolution for validation
        const { data, password, options } = PgcryptoEncryptSchema.parse(params);
        const sql =
          options !== undefined
            ? `SELECT encode(pgp_sym_encrypt($1, $2, $3), 'base64') as encrypted`
            : `SELECT encode(pgp_sym_encrypt($1, $2), 'base64') as encrypted`;
        const queryParams =
          options !== undefined ? [data, password, options] : [data, password];
        const result = await adapter.executeQuery(sql, queryParams);
        return {
          success: true,
          encrypted: result.rows?.[0]?.["encrypted"] as string,
          encoding: "base64",
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_encrypt",
          }),
        };
      }
    },
  };
}

function createPgcryptoDecryptTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_decrypt",
    description: "Decrypt data that was encrypted with pg_pgcrypto_encrypt.",
    group: "pgcrypto",
    inputSchema: PgcryptoDecryptSchemaBase,
    outputSchema: PgcryptoDecryptOutputSchema,
    annotations: readOnly("Decrypt Data"),
    icons: getToolIcons("pgcrypto", readOnly("Decrypt Data")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Use transformed schema with alias resolution for validation
        const { encryptedData, password } = PgcryptoDecryptSchema.parse(params);
        const result = await adapter.executeQuery(
          `SELECT pgp_sym_decrypt(decode($1, 'base64'), $2) as decrypted`,
          [encryptedData, password],
        );
        const decrypted = result.rows?.[0]?.["decrypted"];

        // Return error for decryption failure (wrong password or corrupted data)
        if (decrypted === undefined || decrypted === null) {
          return {
            success: false,
            error: "Decryption failed — wrong password or corrupted data",
          };
        }

        return {
          success: true,
          decrypted: decrypted as string,
          verified: true,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_decrypt",
          }),
        };
      }
    },
  };
}

function createPgcryptoGenRandomUuidTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  // Base schema for MCP visibility (count parameter exposed to clients, relaxed)
  const GenUuidSchemaBase = z.object({
    count: z.coerce
      .number()
      .optional()
      .describe("Number of UUIDs to generate (default: 1, max: 100)"),
  });

  // Full schema with strict validation for handler parsing
  const GenUuidSchema = z
    .object({
      count: z.coerce
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of UUIDs to generate (default: 1, max: 100)"),
    })
    .default({});

  return {
    name: "pg_pgcrypto_gen_random_uuid",
    description: "Generate a cryptographically secure UUID v4.",
    group: "pgcrypto",
    inputSchema: GenUuidSchemaBase,
    outputSchema: PgcryptoGenRandomUuidOutputSchema,
    annotations: readOnly("Generate UUID"),
    icons: getToolIcons("pgcrypto", readOnly("Generate UUID")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        // Parse via Zod to enforce count validation (max 100)
        const parsed = GenUuidSchema.parse(params);
        const generateCount = parsed.count ?? 1;
        const result = await adapter.executeQuery(
          `SELECT gen_random_uuid()::text as uuid FROM generate_series(1, $1)`,
          [generateCount],
        );
        const uuids = (result.rows ?? []).map((r) => r["uuid"] as string);
        // Add convenience 'uuid' property for single UUID requests
        const response: Record<string, unknown> = {
          success: true,
          uuids,
          count: uuids.length,
        };
        if (uuids.length === 1) {
          response["uuid"] = uuids[0];
        }
        return response;
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_gen_random_uuid",
          }),
        };
      }
    },
  };
}

function createPgcryptoGenRandomBytesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_pgcrypto_gen_random_bytes",
    description: "Generate cryptographically secure random bytes.",
    group: "pgcrypto",
    inputSchema: PgcryptoRandomBytesSchemaBase,
    outputSchema: PgcryptoGenRandomBytesOutputSchema,
    annotations: readOnly("Generate Random Bytes"),
    icons: getToolIcons("pgcrypto", readOnly("Generate Random Bytes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { length, encoding } = PgcryptoRandomBytesSchema.parse(params);
        const enc = encoding ?? "hex";
        const encodeFormat = enc === "base64" ? "base64" : "hex";
        const result = await adapter.executeQuery(
          `SELECT encode(gen_random_bytes($1), $2) as random_bytes`,
          [length, encodeFormat],
        );
        return {
          success: true,
          randomBytes: result.rows?.[0]?.["random_bytes"] as string,
          length,
          encoding: enc,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_gen_random_bytes",
          }),
        };
      }
    },
  };
}

function createPgcryptoGenSaltTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_gen_salt",
    description: "Generate a salt for use with crypt() password hashing.",
    group: "pgcrypto",
    inputSchema: PgcryptoGenSaltSchemaBase,
    outputSchema: PgcryptoGenSaltOutputSchema,
    annotations: readOnly("Generate Salt"),
    icons: getToolIcons("pgcrypto", readOnly("Generate Salt")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { type, iterations } = PgcryptoGenSaltSchema.parse(params);
        const result =
          iterations !== undefined && (type === "bf" || type === "xdes")
            ? await adapter.executeQuery(`SELECT gen_salt($1, $2) as salt`, [
                type,
                iterations,
              ])
            : await adapter.executeQuery(`SELECT gen_salt($1) as salt`, [type]);
        return {
          success: true,
          salt: result.rows?.[0]?.["salt"] as string,
          type,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_gen_salt",
          }),
        };
      }
    },
  };
}

function createPgcryptoCryptTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_pgcrypto_crypt",
    description: "Hash a password using crypt() with a salt from gen_salt().",
    group: "pgcrypto",
    inputSchema: PgcryptoCryptSchemaBase,
    outputSchema: PgcryptoCryptOutputSchema,
    annotations: readOnly("Crypt Password"),
    icons: getToolIcons("pgcrypto", readOnly("Crypt Password")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { password, salt } = PgcryptoCryptSchema.parse(params);
        const result = await adapter.executeQuery(
          `SELECT crypt($1, $2) as hash`,
          [password, salt],
        );
        const hash = result.rows?.[0]?.["hash"] as string;
        const algorithm =
          salt.startsWith("$2a$") || salt.startsWith("$2b$")
            ? "bcrypt"
            : salt.startsWith("$1$")
              ? "md5"
              : salt.startsWith("_")
                ? "xdes"
                : "des";
        return { success: true, hash, algorithm };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: `Validation error: ${error.issues.map((i) => i.message).join(", ")}`,
          };
        }
        return {
          success: false,
          error: formatPostgresError(error, {
            tool: "pg_pgcrypto_crypt",
          }),
        };
      }
    },
  };
}
