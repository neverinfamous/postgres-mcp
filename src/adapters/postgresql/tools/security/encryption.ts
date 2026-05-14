/**
 * PostgreSQL Security - Encryption and SSL Tools
 *
 * Tools for SSL/TLS monitoring, encryption status, and password validation.
 * 3 tools total.
 */

import { ZodError } from "zod";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, admin } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  SSLStatusSchemaBase,
  SSLStatusSchema,
  EncryptionStatusSchemaBase,
  EncryptionStatusSchema,
  PasswordValidateSchemaBase,
  PasswordValidateSchema,
  // Output schemas
  SSLStatusOutputSchema,
  EncryptionStatusOutputSchema,
  PasswordValidateOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_security_ssl_status
// =============================================================================

/**
 * Get SSL/TLS connection status
 */
export function createSecuritySSLStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_ssl_status",
    description:
      "Get SSL/TLS connection and certificate status for active connections.",
    group: "security",
    inputSchema: SSLStatusSchemaBase,
    outputSchema: SSLStatusOutputSchema,
    annotations: readOnly("SSL Status"),
    icons: getToolIcons("security", readOnly("SSL Status")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        SSLStatusSchema.parse(_params);

        // Check if ssl is enabled
        const sslSettingResult = await adapter.executeQuery(
          `SELECT current_setting('ssl', true) as ssl_enabled`,
        );
        const sslEnabled = sslSettingResult.rows?.[0]?.["ssl_enabled"] === "on";

        // Try to get SSL connection details from pg_stat_ssl
        try {
          const sslResult = await adapter.executeQuery(`
            SELECT
              s.pid,
              s.ssl,
              s.version,
              s.cipher,
              s.client_dn
            FROM pg_stat_ssl s
            JOIN pg_stat_activity a ON s.pid = a.pid
            WHERE a.state IS NOT NULL
            ORDER BY s.ssl DESC, s.pid
            LIMIT 50
          `);

          const connections = sslResult.rows ?? [];
          const sslCount = connections.filter(
            (r: Record<string, unknown>) => r["ssl"] === true,
          ).length;

          // Get SSL configuration
          const configResult = await adapter.executeQuery(`
            SELECT name, setting
            FROM pg_settings
            WHERE name IN (
              'ssl', 'ssl_ca_file', 'ssl_cert_file', 'ssl_key_file',
              'ssl_crl_file', 'ssl_ciphers', 'ssl_min_protocol_version',
              'ssl_max_protocol_version'
            )
            ORDER BY name
          `);

          const configuration: Record<string, unknown> = Object.fromEntries(
            (configResult.rows ?? []).map((r: Record<string, unknown>) => [
              r["name"] as string,
              r["setting"],
            ]),
          );

          return {
            success: true,
            sslEnabled,
            sslConnections: connections,
            configuration,
            totalConnections: connections.length,
            sslConnectionCount: sslCount,
          };
        } catch {
          // pg_stat_ssl not available (PG < 9.5 or permissions)
          return {
            success: true,
            sslEnabled,
            sslConnections: [],
            configuration: {},
            totalConnections: 0,
            sslConnectionCount: 0,
            message:
              "pg_stat_ssl not accessible. SSL is " +
              (sslEnabled ? "enabled" : "disabled") +
              " at the server level.",
          };
        }
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_security_ssl_status",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_ssl_status",
        });
      }
    },
  };
}

// =============================================================================
// pg_security_encryption_status
// =============================================================================

/**
 * Check encryption and certificate configuration
 */
export function createSecurityEncryptionStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_encryption_status",
    description:
      "Get encryption status including SSL configuration, password encryption method, and pgcrypto availability.",
    group: "security",
    inputSchema: EncryptionStatusSchemaBase,
    outputSchema: EncryptionStatusOutputSchema,
    annotations: admin("Encryption Status"),
    icons: getToolIcons("security", admin("Encryption Status")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        EncryptionStatusSchema.parse(_params);

        // Get encryption-related settings
        const settingsResult = await adapter.executeQuery(`
          SELECT name, setting
          FROM pg_settings
          WHERE name IN (
            'ssl', 'password_encryption',
            'ssl_ca_file', 'ssl_cert_file', 'ssl_key_file', 'ssl_crl_file',
            'ssl_ciphers', 'ssl_min_protocol_version', 'ssl_max_protocol_version'
          )
          ORDER BY name
        `);

        const settings: Record<string, unknown> = Object.fromEntries(
          (settingsResult.rows ?? []).map((r: Record<string, unknown>) => [
            r["name"] as string,
            r["setting"],
          ]),
        );

        const sslEnabled = settings["ssl"] === "on";
        const passwordEncryption =
          (settings["password_encryption"] as string) ?? "unknown";

        // Extract certificate paths
        const certificates = {
          ssl_ca_file: (settings["ssl_ca_file"] as string) ?? "",
          ssl_cert_file: (settings["ssl_cert_file"] as string) ?? "",
          ssl_key_file: (settings["ssl_key_file"] as string) ?? "",
          ssl_crl_file: (settings["ssl_crl_file"] as string) ?? "",
        };

        // Check if pgcrypto is available
        let pgcryptoAvailable = false;
        try {
          const pgcryptoResult = await adapter.executeQuery(`
            SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
          `);
          pgcryptoAvailable = (pgcryptoResult.rows?.length ?? 0) > 0;
        } catch {
          // Extension catalog not accessible
        }

        // Build encryption settings (excluding cert paths already extracted)
        const encryptionSettings: Record<string, unknown> = {
          ssl: settings["ssl"],
          password_encryption: passwordEncryption,
          ssl_ciphers: settings["ssl_ciphers"],
          ssl_min_protocol_version: settings["ssl_min_protocol_version"],
          ssl_max_protocol_version: settings["ssl_max_protocol_version"],
        };

        return {
          success: true,
          sslEnabled,
          passwordEncryption,
          pgcryptoAvailable,
          encryptionSettings,
          certificates,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_security_encryption_status",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_encryption_status",
        });
      }
    },
  };
}

// =============================================================================
// pg_security_password_validate
// =============================================================================

/**
 * Common password patterns to check against
 */
const COMMON_PASSWORDS = new Set([
  "password",
  "123456",
  "12345678",
  "qwerty",
  "abc123",
  "monkey",
  "master",
  "dragon",
  "111111",
  "baseball",
  "iloveyou",
  "trustno1",
  "sunshine",
  "letmein",
  "welcome",
  "admin",
  "login",
  "princess",
  "football",
  "shadow",
]);

/**
 * Validate password strength (pure JS, no database)
 */
export function createSecurityPasswordValidateTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_password_validate",
    description:
      "Validate password strength against configurable policy. Uses local analysis (no database query).",
    group: "security",
    inputSchema: PasswordValidateSchemaBase,
    outputSchema: PasswordValidateOutputSchema,
    annotations: readOnly("Password Validate"),
    icons: getToolIcons("security", readOnly("Password Validate")),
    handler: (params: unknown, _context: RequestContext): Promise<unknown> => {
      try {
        const { password } = PasswordValidateSchema.parse(params);

        if (password.length === 0) {
          return Promise.resolve({
            success: false,
            error: "Validation error: Password cannot be empty",
            code: "VALIDATION_ERROR",
            category: "validation",
            recoverable: false,
          });
        }

        const policy = {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireDigit: true,
          requireSpecial: true,
        };

        const checks: Record<string, boolean> = {
          minLength: password.length >= policy.minLength,
          hasUppercase: /[A-Z]/.test(password),
          hasLowercase: /[a-z]/.test(password),
          hasDigit: /\d/.test(password),
          hasSpecial: /[^A-Za-z0-9]/.test(password),
          notCommon: !COMMON_PASSWORDS.has(password.toLowerCase()),
          noRepeatingChars: !/(.)\1{2,}/.test(password),
          noSequentialChars: !hasSequentialChars(password),
        };

        // Calculate strength score (0-100)
        let strength = 0;

        // Length scoring (up to 30 points)
        strength += Math.min(30, password.length * 3);

        // Character class scoring (up to 40 points)
        if (checks["hasUppercase"]) strength += 10;
        if (checks["hasLowercase"]) strength += 10;
        if (checks["hasDigit"]) strength += 10;
        if (checks["hasSpecial"]) strength += 10;

        // Penalty scoring (up to -30)
        if (!checks["notCommon"]) strength -= 30;
        if (!checks["noRepeatingChars"]) strength -= 10;
        if (!checks["noSequentialChars"]) strength -= 10;

        // Bonus for length > 12
        if (password.length > 12) strength += 10;
        if (password.length > 16) strength += 10;

        // Clamp to 0-100
        strength = Math.max(0, Math.min(100, strength));

        let interpretation: string;
        if (strength >= 80) interpretation = "Very Strong";
        else if (strength >= 60) interpretation = "Strong";
        else if (strength >= 40) interpretation = "Medium";
        else if (strength >= 20) interpretation = "Weak";
        else interpretation = "Very Weak";

        return Promise.resolve({
          success: true,
          strength,
          interpretation,
          meetsPolicy: strength >= 50,
          policy,
          checks,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return Promise.resolve(
            formatHandlerErrorResponse(error, {
              tool: "pg_security_password_validate",
            }),
          );
        }
        return Promise.resolve(
          formatHandlerErrorResponse(error, {
            tool: "pg_security_password_validate",
          }),
        );
      }
    },
  };
}

/**
 * Check for sequential character patterns (e.g., "abc", "123")
 */
function hasSequentialChars(password: string): boolean {
  const lower = password.toLowerCase();
  for (let i = 0; i < lower.length - 2; i++) {
    const c1 = lower.charCodeAt(i);
    const c2 = lower.charCodeAt(i + 1);
    const c3 = lower.charCodeAt(i + 2);
    if (c2 === c1 + 1 && c3 === c2 + 1) return true;
    if (c2 === c1 - 1 && c3 === c2 - 1) return true;
  }
  return false;
}
