/**
 * postgres-mcp - Security Tool Schemas
 *
 * Input validation and output schemas for security tools.
 * 9 tools: audit, firewall status/rules, mask data, user privileges,
 * sensitive tables, SSL status, encryption status, password validate.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// =============================================================================
// Input Schemas (Split Schema pattern: Base for MCP, Preprocessed for handler)
// =============================================================================

/**
 * pg_security_audit — comprehensive security posture check
 */
export const SecurityAuditSchemaBase = z.object({
  limit: z
    .number()
    .optional()
    .describe("Maximum number of findings to return (default: 20)"),
  includeHba: z
    .boolean()
    .optional()
    .describe(
      "Include pg_hba.conf rules in audit (requires superuser, default: true)",
    ),
});

export const SecurityAuditSchema = z.preprocess(
  defaultToEmpty,
  SecurityAuditSchemaBase,
);

/**
 * pg_security_firewall_status — pg_hba.conf summary
 */
export const FirewallStatusSchemaBase = z.object({}).strict();

export const FirewallStatusSchema = z.preprocess(
  defaultToEmpty,
  FirewallStatusSchemaBase,
);

/**
 * pg_security_firewall_rules — detailed pg_hba.conf listing
 */
export const FirewallRulesSchemaBase = z.object({
  user: z.string().optional().describe("Filter by username"),
  type: z.string().optional().describe("Filter by rule type (host, local, etc.)"),
});

export const FirewallRulesSchema = z.preprocess(
  defaultToEmpty,
  FirewallRulesSchemaBase,
);

/**
 * pg_security_mask_data — data masking (pure JS, no DB)
 */
export const MaskDataSchemaBase = z.object({
  value: z.string().describe("Value to mask"),
  type: z.string().describe("Masking type (email, phone, ssn, credit_card, partial)"),
  keepFirst: z
    .number()
    .default(0)
    .describe("Characters to keep from start (partial type)"),
  keepLast: z
    .number()
    .default(0)
    .describe("Characters to keep from end (partial type)"),
  maskChar: z
    .string()
    .default("*")
    .describe("Character to use for masking"),
});

export const MaskDataSchema = z.preprocess(
  defaultToEmpty,
  MaskDataSchemaBase,
);

/**
 * pg_security_user_privileges — role/privilege report
 */
export const UserPrivilegesSchemaBase = z.object({
  user: z.string().optional().describe("Filter by role name"),
  includeRoles: z
    .boolean()
    .default(true)
    .describe("Include role membership information"),
  summary: z
    .boolean()
    .default(false)
    .describe(
      "Return condensed summary (privilege counts) instead of full details",
    ),
  includeGrants: z
    .boolean()
    .default(false)
    .describe("Include up to 100 object-level table grants per role"),
});

export const UserPrivilegesSchema = z.preprocess(
  defaultToEmpty,
  UserPrivilegesSchemaBase,
);

/**
 * pg_security_sensitive_tables — detect columns with sensitive data
 */
export const SensitiveTablesSchemaBase = z.object({
  schema: z
    .string()
    .optional()
    .describe("Schema to scan (defaults to 'public')"),
  patterns: z
    .array(z.string())
    .optional()
    .describe("Column name patterns to consider sensitive"),
  limit: z
    .number()
    .optional()
    .describe(
      "Maximum number of tables to return (default: 20). Set higher for full scan.",
    ),
});

export const SensitiveTablesSchema = z.preprocess(
  defaultToEmpty,
  SensitiveTablesSchemaBase.transform((data) => ({
    schema: data.schema,
    patterns: data.patterns ?? [
      "password",
      "secret",
      "token",
      "key",
      "ssn",
      "credit",
      "card",
      "phone",
      "email",
      "address",
      "salary",
      "medical",
      "health",
    ],
    limit: data.limit ?? 20,
  })),
);

/**
 * pg_security_ssl_status — SSL/TLS connection status
 */
export const SSLStatusSchemaBase = z.object({}).strict();

export const SSLStatusSchema = z.preprocess(
  defaultToEmpty,
  SSLStatusSchemaBase,
);

/**
 * pg_security_encryption_status — encryption configuration
 */
export const EncryptionStatusSchemaBase = z.object({}).strict();

export const EncryptionStatusSchema = z.preprocess(
  defaultToEmpty,
  EncryptionStatusSchemaBase,
);

/**
 * pg_security_password_validate — password strength check (pure JS)
 */
export const PasswordValidateSchemaBase = z.object({
  password: z.string().describe("Password to validate"),
});

export const PasswordValidateSchema = z.preprocess(
  defaultToEmpty,
  PasswordValidateSchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * pg_security_audit output
 */
export const SecurityAuditOutputSchema = z
  .object({
    findings: z
      .array(
        z.object({
          check: z.string().describe("Security check name"),
          severity: z.string().describe("Finding severity (info, warning, critical)"),
          status: z.string().describe("Check status (pass, warn, fail)"),
          message: z.string().describe("Finding description"),
          recommendation: z.string().optional().describe("Suggested remediation"),
        }),
      )
      .optional()
      .describe("Security audit findings"),
    summary: z
      .object({
        total: z.number().describe("Total checks performed"),
        passed: z.number().describe("Checks passed"),
        warnings: z.number().describe("Warning-level findings"),
        critical: z.number().describe("Critical-level findings"),
      })
      .optional()
      .describe("Audit summary"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_firewall_status output
 */
export const FirewallStatusOutputSchema = z
  .object({
    available: z
      .boolean()
      .optional()
      .describe("Whether pg_hba_file_rules is accessible"),
    totalRules: z.number().optional().describe("Total number of HBA rules"),
    rulesByType: z
      .record(z.string(), z.number())
      .optional()
      .describe("Rule count by type (local, host, hostssl, etc.)"),
    authMethods: z
      .record(z.string(), z.number())
      .optional()
      .describe("Rule count by authentication method"),
    hostsslEnforced: z
      .boolean()
      .optional()
      .describe("Whether hostssl is enforced for remote connections"),
    message: z.string().optional().describe("Status message"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_firewall_rules output
 */
export const FirewallRulesOutputSchema = z
  .object({
    rules: z
      .array(
        z.object({
          line_number: z.number().optional().describe("Line number in pg_hba.conf"),
          type: z.string().optional().describe("Rule type (local, host, hostssl)"),
          database: z.unknown().optional().describe("Database(s)"),
          user_name: z.unknown().optional().describe("User(s)"),
          address: z.string().nullable().optional().describe("Client address"),
          netmask: z.string().nullable().optional().describe("Netmask"),
          auth_method: z.string().optional().describe("Authentication method"),
          options: z.unknown().optional().describe("Additional auth options"),
        }),
      )
      .optional()
      .describe("HBA rules"),
    count: z.number().optional().describe("Number of rules returned"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_mask_data output
 */
export const MaskDataOutputSchema = z
  .object({
    original: z.string().optional().describe("Original value"),
    masked: z.string().optional().describe("Masked value"),
    type: z.string().optional().describe("Masking type applied"),
    warning: z.string().optional().describe("Warning if masking was ineffective"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_user_privileges output
 */
export const UserPrivilegesOutputSchema = z
  .object({
    users: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("User privilege details"),
    count: z.number().optional().describe("Number of users returned"),
    summary: z.boolean().optional().describe("Whether summary mode was used"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_sensitive_tables output
 */
export const SensitiveTablesOutputSchema = z
  .object({
    sensitiveTables: z
      .array(
        z.object({
          table: z.string().describe("Table name"),
          sensitiveColumns: z
            .array(z.record(z.string(), z.unknown()))
            .describe("Columns matching sensitive patterns"),
          columnCount: z.number().describe("Number of sensitive columns"),
        }),
      )
      .optional()
      .describe("Tables with sensitive columns"),
    tableCount: z.number().optional().describe("Number of tables returned"),
    totalSensitiveColumns: z
      .number()
      .optional()
      .describe("Total sensitive columns found"),
    patternsUsed: z
      .array(z.string())
      .optional()
      .describe("Column name patterns used"),
    limited: z
      .boolean()
      .optional()
      .describe("Whether results were truncated"),
    totalAvailable: z
      .number()
      .optional()
      .describe("Total tables available if truncated"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_ssl_status output
 */
export const SSLStatusOutputSchema = z
  .object({
    sslEnabled: z.boolean().optional().describe("Whether SSL is enabled"),
    sslConnections: z
      .array(
        z.object({
          pid: z.number().optional().describe("Backend process ID"),
          ssl: z.boolean().optional().describe("Using SSL"),
          version: z.string().nullable().optional().describe("TLS version"),
          cipher: z.string().nullable().optional().describe("Cipher suite"),
          client_dn: z.string().nullable().optional().describe("Client cert DN"),
        }),
      )
      .optional()
      .describe("Active SSL connections"),
    configuration: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("SSL configuration settings"),
    totalConnections: z
      .number()
      .optional()
      .describe("Total active connections"),
    sslConnectionCount: z
      .number()
      .optional()
      .describe("Connections using SSL"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_encryption_status output
 */
export const EncryptionStatusOutputSchema = z
  .object({
    sslEnabled: z.boolean().optional().describe("Whether SSL is enabled"),
    passwordEncryption: z
      .string()
      .optional()
      .describe("Password encryption method (scram-sha-256, md5)"),
    pgcryptoAvailable: z
      .boolean()
      .optional()
      .describe("Whether pgcrypto extension is installed"),
    encryptionSettings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Encryption-related settings"),
    certificates: z
      .object({
        ssl_ca_file: z.string().optional().describe("CA certificate file"),
        ssl_cert_file: z.string().optional().describe("Server certificate file"),
        ssl_key_file: z.string().optional().describe("Server key file"),
        ssl_crl_file: z.string().optional().describe("Certificate revocation list"),
      })
      .optional()
      .describe("SSL certificate paths"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_security_password_validate output
 */
export const PasswordValidateOutputSchema = z
  .object({
    strength: z.number().optional().describe("Password strength score (0-100)"),
    interpretation: z
      .string()
      .optional()
      .describe("Human-readable strength label"),
    meetsPolicy: z
      .boolean()
      .optional()
      .describe("Whether password meets minimum strength"),
    policy: z
      .object({
        minLength: z.number().describe("Minimum length requirement"),
        requireUppercase: z.boolean().describe("Requires uppercase letter"),
        requireLowercase: z.boolean().describe("Requires lowercase letter"),
        requireDigit: z.boolean().describe("Requires digit"),
        requireSpecial: z.boolean().describe("Requires special character"),
      })
      .optional()
      .describe("Password policy used for validation"),
    checks: z
      .record(z.string(), z.boolean())
      .optional()
      .describe("Individual check results"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);
