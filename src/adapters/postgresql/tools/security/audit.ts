/**
 * PostgreSQL Security - Audit and Firewall Tools
 *
 * Tools for security auditing, HBA/firewall monitoring, and compliance.
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
  SecurityAuditSchemaBase,
  SecurityAuditSchema,
  FirewallStatusSchemaBase,
  FirewallStatusSchema,
  FirewallRulesSchemaBase,
  FirewallRulesSchema,
  // Output schemas
  SecurityAuditOutputSchema,
  FirewallStatusOutputSchema,
  FirewallRulesOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Types
// =============================================================================

interface AuditFinding {
  check: string;
  severity: "info" | "warning" | "critical";
  status: "pass" | "warn" | "fail";
  message: string;
  recommendation?: string | undefined;
}

// =============================================================================
// pg_security_audit
// =============================================================================

/**
 * Comprehensive security posture audit
 */
export function createSecurityAuditTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_audit",
    description:
      "Run a comprehensive security audit checking SSL, password encryption, superuser exposure, logging, and HBA rules.",
    group: "security",
    inputSchema: SecurityAuditSchemaBase,
    outputSchema: SecurityAuditOutputSchema,
    annotations: admin("Security Audit"),
    icons: getToolIcons("security", admin("Security Audit")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = SecurityAuditSchema.parse(params) as {
          limit?: number;
          includeHba?: boolean;
        };
        const limit = parsed.limit ?? 20;
        const includeHba = parsed.includeHba ?? true;

        const findings: AuditFinding[] = [];

        // 1. Check SSL status
        try {
          const sslResult = await adapter.executeQuery(
            `SELECT current_setting('ssl', true) as ssl_enabled`,
          );
          const sslEnabled =
            sslResult.rows?.[0]?.["ssl_enabled"] === "on";
          findings.push({
            check: "SSL/TLS",
            severity: sslEnabled ? "info" : "critical",
            status: sslEnabled ? "pass" : "fail",
            message: sslEnabled
              ? "SSL is enabled"
              : "SSL is not enabled — connections are unencrypted",
            recommendation: sslEnabled
              ? undefined
              : "Enable SSL by setting ssl = on in postgresql.conf and configuring certificates",
          });
        } catch {
          findings.push({
            check: "SSL/TLS",
            severity: "warning",
            status: "warn",
            message: "Could not determine SSL status",
          });
        }

        // 2. Check password encryption method
        try {
          const encResult = await adapter.executeQuery(
            `SELECT current_setting('password_encryption', true) as method`,
          );
          const method =
            (encResult.rows?.[0]?.["method"] as string) ?? "unknown";
          const isScram = method === "scram-sha-256";
          findings.push({
            check: "Password Encryption",
            severity: isScram ? "info" : "warning",
            status: isScram ? "pass" : "warn",
            message: `Password encryption method: ${method}`,
            recommendation: isScram
              ? undefined
              : "Upgrade to scram-sha-256: ALTER SYSTEM SET password_encryption = 'scram-sha-256'",
          });
        } catch {
          findings.push({
            check: "Password Encryption",
            severity: "warning",
            status: "warn",
            message: "Could not determine password encryption method",
          });
        }

        // 3. Check connection logging
        try {
          const logResult = await adapter.executeQuery(`
            SELECT name, setting
            FROM pg_settings
            WHERE name IN ('log_connections', 'log_disconnections')
          `);
          const settings: Record<string, string> = Object.fromEntries(
            (logResult.rows ?? []).map((r: Record<string, unknown>) => [
              r["name"] as string,
              r["setting"] as string,
            ]),
          );
          const logConn = settings["log_connections"] === "on";
          const logDisconn = settings["log_disconnections"] === "on";
          findings.push({
            check: "Connection Logging",
            severity: logConn && logDisconn ? "info" : "warning",
            status: logConn && logDisconn ? "pass" : "warn",
            message: `log_connections: ${logConn ? "on" : "off"}, log_disconnections: ${logDisconn ? "on" : "off"}`,
            recommendation:
              logConn && logDisconn
                ? undefined
                : "Enable connection auditing: ALTER SYSTEM SET log_connections = on; ALTER SYSTEM SET log_disconnections = on",
          });
        } catch {
          // Skip if settings not accessible
        }

        // 4. Check superuser count
        try {
          const superResult = await adapter.executeQuery(`
            SELECT count(*) as cnt FROM pg_roles WHERE rolsuper = true
          `);
          const superCount = Number(
            superResult.rows?.[0]?.["cnt"] ?? 0,
          );
          findings.push({
            check: "Superuser Exposure",
            severity: superCount > 2 ? "warning" : "info",
            status: superCount > 2 ? "warn" : "pass",
            message: `${String(superCount)} superuser role(s) found`,
            recommendation:
              superCount > 2
                ? "Minimize superuser roles. Use GRANT for specific privileges instead."
                : undefined,
          });
        } catch {
          // Skip if roles not accessible
        }

        // 5. Check for roles with no password
        try {
          const noPwResult = await adapter.executeQuery(`
            SELECT count(*) as cnt
            FROM pg_authid
            WHERE rolcanlogin = true
              AND rolpassword IS NULL
          `);
          const noPwCount = Number(
            noPwResult.rows?.[0]?.["cnt"] ?? 0,
          );
          if (noPwCount > 0) {
            findings.push({
              check: "Passwordless Login Roles",
              severity: "critical",
              status: "fail",
              message: `${String(noPwCount)} login role(s) have no password set`,
              recommendation:
                "Set passwords for all login roles or disable login: ALTER ROLE rolename NOLOGIN",
            });
          } else {
            findings.push({
              check: "Passwordless Login Roles",
              severity: "info",
              status: "pass",
              message: "All login roles have passwords set",
            });
          }
        } catch {
          // pg_authid requires superuser — skip gracefully
          findings.push({
            check: "Passwordless Login Roles",
            severity: "info",
            status: "warn",
            message:
              "Cannot check pg_authid (requires superuser). Skipped.",
          });
        }

        // 6. Check pg_hba.conf rules if requested
        if (includeHba) {
          try {
            const hbaResult = await adapter.executeQuery(`
              SELECT type, auth_method, count(*) as cnt
              FROM pg_hba_file_rules
              WHERE error IS NULL
              GROUP BY type, auth_method
              ORDER BY type, auth_method
            `);

            const trustRules = (hbaResult.rows ?? []).filter(
              (r: Record<string, unknown>) =>
                r["auth_method"] === "trust",
            );
            const trustCount = trustRules.reduce(
              (sum: number, r: Record<string, unknown>) =>
                sum + Number(r["cnt"] ?? 0),
              0,
            );

            if (trustCount > 0) {
              findings.push({
                check: "HBA Trust Authentication",
                severity: "critical",
                status: "fail",
                message: `${String(trustCount)} pg_hba.conf rule(s) use 'trust' authentication (no password required)`,
                recommendation:
                  "Replace 'trust' with 'scram-sha-256' or 'md5' in pg_hba.conf",
              });
            } else {
              findings.push({
                check: "HBA Trust Authentication",
                severity: "info",
                status: "pass",
                message: "No 'trust' authentication rules found",
              });
            }
          } catch {
            findings.push({
              check: "HBA Rules",
              severity: "info",
              status: "warn",
              message:
                "Cannot read pg_hba_file_rules (requires superuser or pg_read_all_settings). Skipped.",
            });
          }
        }

        // Limit findings
        const limitedFindings = findings.slice(0, limit);

        // Build summary
        const summaryObj = {
          total: limitedFindings.length,
          passed: limitedFindings.filter((f) => f.status === "pass").length,
          warnings: limitedFindings.filter((f) => f.status === "warn").length,
          critical: limitedFindings.filter((f) => f.status === "fail").length,
        };

        return {
          success: true,
          findings: limitedFindings,
          summary: summaryObj,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_security_audit",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_audit",
        });
      }
    },
  };
}

// =============================================================================
// pg_security_firewall_status
// =============================================================================

/**
 * Get pg_hba.conf rules summary (firewall equivalent)
 */
export function createSecurityFirewallStatusTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_firewall_status",
    description:
      "Get PostgreSQL host-based authentication (pg_hba.conf) summary — the PostgreSQL equivalent of a firewall.",
    group: "security",
    inputSchema: FirewallStatusSchemaBase,
    outputSchema: FirewallStatusOutputSchema,
    annotations: readOnly("HBA/Firewall Status"),
    icons: getToolIcons("security", readOnly("HBA/Firewall Status")),
    handler: async (_params: unknown, _context: RequestContext) => {
      try {
        FirewallStatusSchema.parse(_params);

        // Try to read pg_hba_file_rules
        try {
          const hbaResult = await adapter.executeQuery(`
            SELECT type, auth_method, count(*) as cnt
            FROM pg_hba_file_rules
            WHERE error IS NULL
            GROUP BY type, auth_method
            ORDER BY type, auth_method
          `);

          const rows = hbaResult.rows ?? [];

          // Aggregate by type
          const rulesByType: Record<string, number> = {};
          const authMethods: Record<string, number> = {};
          let totalRules = 0;

          for (const row of rows) {
            const r = row;
            const type = r["type"] as string;
            const method = r["auth_method"] as string;
            const cnt = Number(r["cnt"] ?? 0);

            rulesByType[type] = (rulesByType[type] ?? 0) + cnt;
            authMethods[method] = (authMethods[method] ?? 0) + cnt;
            totalRules += cnt;
          }

          // Check if hostssl is enforced for remote
          const hostRules = rulesByType["host"] ?? 0;
          const hostsslRules = rulesByType["hostssl"] ?? 0;
          const hostsslEnforced = hostRules === 0 && hostsslRules > 0;

          return {
            success: true,
            available: true,
            totalRules,
            rulesByType,
            authMethods,
            hostsslEnforced,
          };
        } catch {
          return {
            success: true,
            available: false,
            totalRules: 0,
            rulesByType: {},
            authMethods: {},
            hostsslEnforced: false,
            message:
              "pg_hba_file_rules not accessible. Requires superuser or pg_read_all_settings role.",
          };
        }
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_security_firewall_status",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_firewall_status",
        });
      }
    },
  };
}

// =============================================================================
// pg_security_firewall_rules
// =============================================================================

/**
 * List pg_hba.conf rules (detailed)
 */
export function createSecurityFirewallRulesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_firewall_rules",
    description:
      "List detailed pg_hba.conf authentication rules with optional filtering by user or rule type.",
    group: "security",
    inputSchema: FirewallRulesSchemaBase,
    outputSchema: FirewallRulesOutputSchema,
    annotations: admin("HBA/Firewall Rules"),
    icons: getToolIcons("security", admin("HBA/Firewall Rules")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = FirewallRulesSchema.parse(params) as {
          user?: string;
          type?: string;
        };
        const { user, type } = parsed;

        // Validate type if provided
        const validTypes = [
          "local",
          "host",
          "hostssl",
          "hostnossl",
          "hostgssenc",
          "hostnogssenc",
        ] as const;
        if (
          type &&
          !validTypes.includes(type as (typeof validTypes)[number])
        ) {
          return formatHandlerErrorResponse(
            new Error(
              `Invalid type: '${type}' — expected one of: ${validTypes.join(", ")}`,
            ),
            { tool: "pg_security_firewall_rules" },
          );
        }

        try {
          let query = `
            SELECT
              line_number,
              type,
              database,
              user_name,
              address,
              netmask,
              auth_method,
              options
            FROM pg_hba_file_rules
            WHERE error IS NULL
          `;

          const conditions: string[] = [];
          const queryParams: string[] = [];

          if (user) {
            queryParams.push(user);
            conditions.push(
              `$${String(queryParams.length)} = ANY(user_name)`,
            );
          }
          if (type) {
            queryParams.push(type);
            conditions.push(`type = $${String(queryParams.length)}`);
          }

          if (conditions.length > 0) {
            query += " AND " + conditions.join(" AND ");
          }

          query += " ORDER BY line_number";

          const result = await adapter.executeQuery(query, queryParams);

          return {
            success: true,
            rules: result.rows ?? [],
            count: result.rows?.length ?? 0,
          };
        } catch {
          return {
            success: true,
            rules: [],
            count: 0,
            error:
              "pg_hba_file_rules not accessible. Requires superuser or pg_read_all_settings role.",
          };
        }
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_security_firewall_rules",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_firewall_rules",
        });
      }
    },
  };
}
