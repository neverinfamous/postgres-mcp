/**
 * pgcrypto Status Resource
 *
 * Provides pgcrypto extension availability and usage information.
 */

import type { PostgresAdapter } from "../postgres-adapter.js";
import type { ResourceDefinition } from "../../../types/index.js";
import { LOW_PRIORITY } from "../../../utils/resource-annotations.js";
import { toStr } from "../../../utils/query-helpers.js";

interface CryptoResourceData {
  extensionInstalled: boolean;
  extensionVersion: string | null;
  availableAlgorithms: {
    hashing: {
      secure: string[];
      legacy: string[];
    };
    hmac: string[];
    encryption: string[];
  };
  securityNotes: {
    legacyAlgorithms: string;
    passwordHashing?: string;
  } | null;
  uuid: {
    genRandomUuidAvailable: boolean;
    uuidColumns: {
      schema: string;
      table: string;
      column: string;
      hasDefault: boolean;
    }[];
  };
  passwordHashing: {
    status: "detected" | "none_found" | "not_checked";
    detectedColumns: {
      schema: string;
      table: string;
      column: string;
    }[];
  };
  encryptedColumns: {
    schema: string;
    table: string;
    column: string;
    byteaType: boolean;
  }[];
  recommendations: string[];
}

export function createCryptoResource(
  adapter: PostgresAdapter,
): ResourceDefinition {
  return {
    uri: "postgres://crypto",
    name: "pgcrypto Status",
    description:
      "pgcrypto extension availability, algorithms, and security recommendations",
    mimeType: "application/json",
    annotations: LOW_PRIORITY,
    handler: async (): Promise<string> => {
      const result: CryptoResourceData = {
        extensionInstalled: false,
        extensionVersion: null,
        availableAlgorithms: {
          hashing: { secure: [], legacy: [] },
          hmac: [],
          encryption: [],
        },
        securityNotes: null,
        uuid: {
          genRandomUuidAvailable: false,
          uuidColumns: [],
        },
        passwordHashing: {
          status: "not_checked",
          detectedColumns: [],
        },
        encryptedColumns: [],
        recommendations: [],
      };

      // Check if pgcrypto is installed (outside try-catch for correct error messaging)
      const extCheck = await adapter.executeQuery(
        `SELECT extversion FROM pg_extension WHERE extname = 'pgcrypto'`,
      );

      if (!extCheck.rows || extCheck.rows.length === 0) {
        result.recommendations.push(
          "pgcrypto extension is not installed. Use pg_pgcrypto_create_extension to enable cryptographic functions.",
        );
        return JSON.stringify(result, null, 2);
      }

      result.extensionInstalled = true;
      const extVersion = extCheck.rows[0]?.["extversion"];
      result.extensionVersion =
        typeof extVersion === "string" ? extVersion : null;

      // Set available algorithms (these are built into pgcrypto)
      // Categorize by security status to avoid conflating "exists" with "recommended"
      result.availableAlgorithms = {
        hashing: {
          secure: ["sha256", "sha384", "sha512"],
          legacy: ["md5", "sha1", "sha224"], // Available but not recommended for security
        },
        hmac: ["md5", "sha1", "sha256", "sha384", "sha512"],
        encryption: ["bf", "aes128", "aes192", "aes256", "3des", "cast5"],
      };

      try {
        // Check if gen_random_uuid is available (can be from pgcrypto or PostgreSQL 13+)
        try {
          await adapter.executeQuery(`SELECT gen_random_uuid()`);
          result.uuid.genRandomUuidAvailable = true;
        } catch {
          result.uuid.genRandomUuidAvailable = false;
        }

        // Find UUID columns
        const uuidResult = await adapter.executeQuery(
          `SELECT 
                        n.nspname as schema_name,
                        c.relname as table_name,
                        a.attname as column_name,
                        d.adbin IS NOT NULL as has_default
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     JOIN pg_type t ON a.atttypid = t.oid
                     LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
                     WHERE t.typname = 'uuid'
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                       AND a.attnum > 0
                       AND NOT a.attisdropped
                     ORDER BY n.nspname, c.relname, a.attname`,
        );

        if (uuidResult.rows) {
          for (const row of uuidResult.rows) {
            result.uuid.uuidColumns.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              column: toStr(row["column_name"]),
              hasDefault: Boolean(row["has_default"]),
            });
          }
        }

        // Detect password hashing (columns with names like password_hash, pwd_hash, etc.)
        const pwdHashResult = await adapter.executeQuery(
          `SELECT n.nspname as schema_name, c.relname as table_name, a.attname as column_name
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     WHERE (
                         a.attname ILIKE '%password%hash%' OR
                         a.attname ILIKE '%pwd%hash%' OR
                         a.attname ILIKE '%pass%hash%' OR
                         a.attname = 'password_digest' OR
                         a.attname = 'encrypted_password'
                     )
                     AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                     AND a.attnum > 0
                     AND NOT a.attisdropped
                     LIMIT 20`,
        );

        if (pwdHashResult.rows && pwdHashResult.rows.length > 0) {
          result.passwordHashing.status = "detected";
          for (const row of pwdHashResult.rows) {
            result.passwordHashing.detectedColumns.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              column: toStr(row["column_name"]),
            });
          }
        } else {
          result.passwordHashing.status = "none_found";
        }

        // Find potential encrypted columns (bytea columns that might contain encrypted data)
        const byteaResult = await adapter.executeQuery(
          `SELECT 
                        n.nspname as schema_name,
                        c.relname as table_name,
                        a.attname as column_name
                     FROM pg_attribute a
                     JOIN pg_class c ON a.attrelid = c.oid
                     JOIN pg_namespace n ON c.relnamespace = n.oid
                     JOIN pg_type t ON a.atttypid = t.oid
                     WHERE t.typname = 'bytea'
                       AND (
                           a.attname ILIKE '%encrypt%' OR
                           a.attname ILIKE '%secret%' OR
                           a.attname ILIKE '%secure%' OR
                           a.attname ILIKE '%cipher%'
                       )
                       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                       AND a.attnum > 0
                       AND NOT a.attisdropped
                     ORDER BY n.nspname, c.relname, a.attname
                     LIMIT 20`,
        );

        if (byteaResult.rows) {
          for (const row of byteaResult.rows) {
            result.encryptedColumns.push({
              schema: toStr(row["schema_name"]),
              table: toStr(row["table_name"]),
              column: toStr(row["column_name"]),
              byteaType: true,
            });
          }
        }

        // Generate recommendations
        if (!result.uuid.genRandomUuidAvailable) {
          result.recommendations.push(
            "gen_random_uuid() not available. Upgrade PostgreSQL to 13+ or ensure pgcrypto is properly installed.",
          );
        }

        const uuidColumnsWithoutDefault = result.uuid.uuidColumns.filter(
          (c) => !c.hasDefault,
        );
        if (uuidColumnsWithoutDefault.length > 0) {
          result.recommendations.push(
            `${String(uuidColumnsWithoutDefault.length)} UUID columns without default. Consider adding DEFAULT gen_random_uuid().`,
          );
        }

        if (result.passwordHashing.status === "none_found") {
          result.recommendations.push(
            "No password hash columns detected. For auth systems, use crypt() + gen_salt('bf') for secure password storage.",
          );
        }

        // Set security notes (informational, not warnings)
        // These describe capabilities and best practices, not active issues
        const passwordHashingNote =
          result.passwordHashing.status === "detected"
            ? "Password hash columns detected. Verify bcrypt (gen_salt('bf')) or SCRAM-SHA-256 is used for storage."
            : null;

        result.securityNotes = passwordHashingNote
          ? {
              legacyAlgorithms:
                "MD5 and SHA-1 are available for compatibility but not recommended for security-sensitive hashing. Use SHA-256+ or bcrypt for new applications.",
              passwordHashing: passwordHashingNote,
            }
          : {
              legacyAlgorithms:
                "MD5 and SHA-1 are available for compatibility but not recommended for security-sensitive hashing. Use SHA-256+ or bcrypt for new applications.",
            };

        // Only add security best practices as a recommendation if no password columns detected
        if (result.passwordHashing.status === "none_found") {
          result.recommendations.push(
            "Security best practices: Use bcrypt (gen_salt('bf')) for passwords, SHA-256+ for data integrity, AES-256 for encryption.",
          );
        }
      } catch {
        // Extension is installed but data queries failed
        result.recommendations.push(
          "Error querying pgcrypto data. Check permissions.",
        );
      }

      return JSON.stringify(result, null, 2);
    },
  };
}
