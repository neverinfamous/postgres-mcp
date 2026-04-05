/**
 * postgres-mcp - pgcrypto Extension Schemas
 *
 * Input validation and output schemas for pgcrypto tools.
 */

import { z } from "zod";
import { coerceNumber } from "../../../../utils/query-helpers.js";

// =============================================================================
// Input Schemas
// =============================================================================

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 */
export const PgcryptoCreateExtensionSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to install extension in (default: public)"),
});

/**
 * Schema for creating the pgcrypto extension.
 */
export const PgcryptoCreateExtensionSchema = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to install extension in (default: public)"),
});

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 * Valid algorithm values described in text for MCP clients.
 */
export const PgcryptoHashSchemaBase = z.object({
  data: z.string().optional().describe("Data to hash"),
  algorithm: z.string().optional().describe("Hash algorithm"),
  encoding: z.string().optional().describe("Output encoding (default: hex)"),
});

/**
 * Schema for hashing data with digest().
 */
export const PgcryptoHashSchema = z.object({
  data: z.string().describe("Data to hash"),
  algorithm: z
    .enum(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"])
    .describe("Hash algorithm"),
  encoding: z
    .enum(["hex", "base64"])
    .optional()
    .describe("Output encoding (default: hex)"),
});

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 */
export const PgcryptoHmacSchemaBase = z.object({
  data: z.string().optional().describe("Data to authenticate"),
  key: z.string().optional().describe("Secret key for HMAC"),
  algorithm: z.string().optional().describe("Hash algorithm"),
  encoding: z.string().optional().describe("Output encoding (default: hex)"),
});

/**
 * Schema for HMAC authentication.
 */
export const PgcryptoHmacSchema = z.object({
  data: z.string().describe("Data to authenticate"),
  key: z.string().describe("Secret key for HMAC"),
  algorithm: z
    .enum(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"])
    .describe("Hash algorithm"),
  encoding: z
    .enum(["hex", "base64"])
    .optional()
    .describe("Output encoding (default: hex)"),
});

/**
 * Schema for PGP symmetric encryption.
 * Accepts 'key' as alias for 'password'.
 *
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const PgcryptoEncryptSchemaBase = z.object({
  data: z.string().optional().describe("Data to encrypt"),
  password: z.string().optional().describe("Encryption password"),
  key: z.string().optional().describe("Alias for password"),
  options: z
    .string()
    .optional()
    .describe('PGP options (e.g., "compress-algo=1, cipher-algo=aes256")'),
});

export const PgcryptoEncryptSchema = PgcryptoEncryptSchemaBase.transform(
  (data) => {
    // Handle alias: key -> password
    const resolvedPassword = data.password ?? data.key;
    return {
      ...data,
      password: resolvedPassword,
    };
  },
)
  .refine((data) => data.data !== undefined, {
    message: "data is required",
  })
  .refine((data) => data.password !== undefined, {
    message: "password (or key alias) is required",
  });

/**
 * Schema for PGP symmetric decryption.
 * Accepts 'encryptedData' as alias for 'data', 'key' as alias for 'password'.
 *
 * Uses base schema for MCP exposure and transform schema for validation.
 */
export const PgcryptoDecryptSchemaBase = z.object({
  data: z.string().optional().describe("Encrypted data (base64 from encrypt)"),
  encryptedData: z.string().optional().describe("Alias for data"),
  password: z.string().optional().describe("Decryption password"),
  key: z.string().optional().describe("Alias for password"),
});

export const PgcryptoDecryptSchema = PgcryptoDecryptSchemaBase.transform(
  (payload) => {
    // Handle aliases
    const resolvedData = payload.data ?? payload.encryptedData;
    const resolvedPassword = payload.password ?? payload.key;
    return {
      data: resolvedData,
      password: resolvedPassword,
    };
  },
)
  .refine((payload) => payload.data !== undefined, {
    message: "data (or encryptedData alias) is required",
  })
  .refine((payload) => payload.password !== undefined, {
    message: "password (or key alias) is required",
  });

/**
 * Base schema for MCP visibility (count parameter exposed to clients, relaxed)
 */
export const PgcryptoGenRandomUuidSchemaBase = z.object({
  count: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("Number of UUIDs to generate (default: 1, max: 100)"),
});

/**
 * Schema for UUID generation with count parameter.
 */
export const PgcryptoGenRandomUuidSchema = z
  .object({
    count: z
      .preprocess(coerceNumber, z.number().optional())
      .describe("Number of UUIDs to generate (default: 1, max: 100)"),
  })
  .default({})
  .refine(
    (data) =>
      data.count === undefined || (data.count >= 1 && data.count <= 100),
    {
      message: "Number of UUIDs must be between 1 and 100",
      path: ["count"],
    },
  );

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 */
export const PgcryptoRandomBytesSchemaBase = z.object({
  length: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("Number of random bytes to generate (1-1024)"),
  encoding: z.string().optional().describe("Output encoding (default: hex)"),
});

/**
 * Schema for generating random bytes.
 */
export const PgcryptoRandomBytesSchema = z
  .object({
    length: z
      .preprocess(coerceNumber, z.number().optional())
      .describe("Number of random bytes to generate (1-1024)"),
    encoding: z
      .enum(["hex", "base64"])
      .optional()
      .describe("Output encoding (default: hex)"),
  })
  .refine((data) => data.length !== undefined, {
    message: "length is required",
    path: ["length"],
  })
  .refine(
    (data) =>
      data.length === undefined || (data.length >= 1 && data.length <= 1024),
    {
      message: "Number of random bytes must be between 1 and 1024",
      path: ["length"],
    },
  );

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 */
export const PgcryptoGenSaltSchemaBase = z.object({
  type: z
    .string()
    .optional()
    .describe("Salt type: bf (bcrypt, recommended), md5, xdes, or des"),
  iterations: z
    .preprocess(coerceNumber, z.number().optional())
    .optional()
    .describe("Iteration count (for bf: 4-31, for xdes: odd 1-16777215)"),
});

/**
 * Schema for generating password salt.
 */
export const PgcryptoGenSaltSchema = z.object({
  type: z
    .enum(["bf", "md5", "xdes", "des"])
    .describe("Salt type: bf (bcrypt, recommended), md5, xdes, or des"),
  iterations: z
    .preprocess(coerceNumber, z.number().optional())
    .describe("Iteration count (for bf: 4-31, for xdes: odd 1-16777215)"),
});

/**
 * Base schema for MCP visibility — shows all parameters with relaxed validation.
 */
export const PgcryptoCryptSchemaBase = z.object({
  password: z.string().optional().describe("Password to hash or verify"),
  salt: z
    .string()
    .optional()
    .describe("Salt from gen_salt() or stored hash for verification"),
});

/**
 * Schema for password hashing with crypt().
 */
export const PgcryptoCryptSchema = z.object({
  password: z.string().describe("Password to hash or verify"),
  salt: z
    .string()
    .describe("Salt from gen_salt() or stored hash for verification"),
});

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * Output schema for pg_pgcrypto_create_extension
 */
export const PgcryptoCreateExtensionOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether extension was enabled"),
    message: z.string().optional().describe("Status message"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("pgcrypto extension creation result");

/**
 * Output schema for pg_pgcrypto_hash
 */
export const PgcryptoHashOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether hash succeeded"),
    algorithm: z.string().optional().describe("Hash algorithm used"),
    encoding: z.string().optional().describe("Output encoding"),
    hash: z.string().optional().describe("Hash result"),
    inputLength: z.number().optional().describe("Input data length"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Hash result");

/**
 * Output schema for pg_pgcrypto_hmac
 */
export const PgcryptoHmacOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether HMAC succeeded"),
    algorithm: z.string().optional().describe("HMAC algorithm used"),
    encoding: z.string().optional().describe("Output encoding"),
    hmac: z.string().optional().describe("HMAC result"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("HMAC result");

/**
 * Output schema for pg_pgcrypto_encrypt
 */
export const PgcryptoEncryptOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether encryption succeeded"),
    encryptedData: z.string().optional().describe("Encrypted data"),
    encoding: z.string().optional().describe("Output encoding"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Encryption result");

/**
 * Output schema for pg_pgcrypto_decrypt
 */
export const PgcryptoDecryptOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether decryption succeeded"),
    decrypted: z.string().optional().describe("Decrypted data"),
    verified: z.boolean().optional().describe("Whether decryption verified"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Decryption result");

/**
 * Output schema for pg_pgcrypto_gen_random_uuid
 */
export const PgcryptoGenRandomUuidOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether generation succeeded"),
    uuids: z.array(z.string()).optional().describe("Generated UUIDs"),
    count: z.number().optional().describe("Number of UUIDs generated"),
    uuid: z.string().optional().describe("First UUID (for single requests)"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("UUID generation result");

/**
 * Output schema for pg_pgcrypto_gen_random_bytes
 */
export const PgcryptoGenRandomBytesOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether generation succeeded"),
    randomBytes: z.string().optional().describe("Random bytes"),
    length: z.number().optional().describe("Number of bytes"),
    encoding: z.string().optional().describe("Output encoding"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Random bytes generation result");

/**
 * Output schema for pg_pgcrypto_gen_salt
 */
export const PgcryptoGenSaltOutputSchema = z
  .object({
    success: z
      .boolean()
      .optional()
      .describe("Whether salt generation succeeded"),
    salt: z.string().optional().describe("Generated salt"),
    type: z.string().optional().describe("Salt type"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Salt generation result");

/**
 * Output schema for pg_pgcrypto_crypt
 */
export const PgcryptoCryptOutputSchema = z
  .object({
    success: z
      .boolean()
      .optional()
      .describe("Whether password hashing succeeded"),
    hash: z.string().optional().describe("Password hash"),
    algorithm: z.string().optional().describe("Detected algorithm"),
    error: z.string().optional().describe("Error message"),
  })
  .describe("Password crypt result");
