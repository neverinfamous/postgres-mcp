/**
 * PostgreSQL Security - Data Protection Tools
 *
 * Tools for data masking, privilege management, and sensitive data identification.
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
  MaskDataSchemaBase,
  MaskDataSchema,
  UserPrivilegesSchemaBase,
  UserPrivilegesSchema,
  SensitiveTablesSchemaBase,
  SensitiveTablesSchema,
  // Output schemas
  MaskDataOutputSchema,
  UserPrivilegesOutputSchema,
  SensitiveTablesOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_security_mask_data
// =============================================================================

/**
 * Mask sensitive data (pure JS, no database queries)
 */
export function createSecurityMaskDataTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_mask_data",
    description:
      "Apply data masking to sensitive values. Supports email, phone, SSN, credit card, and partial masking.",
    group: "security",
    inputSchema: MaskDataSchemaBase,
    outputSchema: MaskDataOutputSchema,
    annotations: readOnly("Data Masking"),
    icons: getToolIcons("security", readOnly("Data Masking")),
    handler: (params: unknown, _context: RequestContext): Promise<unknown> => {
      try {
        const { value, type, keepFirst, keepLast, maskChar } =
          MaskDataSchema.parse(params);

        const validTypes = [
          "email",
          "phone",
          "ssn",
          "credit_card",
          "partial",
        ] as const;
        if (!validTypes.includes(type as (typeof validTypes)[number])) {
          return Promise.resolve({
            success: false,
            error: `Invalid type: '${type}' — expected one of: ${validTypes.join(", ")}`,
            code: "VALIDATION_ERROR",
            category: "validation",
            recoverable: false
          });
        }

        let maskedValue: string;

        switch (type) {
          case "email": {
            const atIndex = value.indexOf("@");
            if (atIndex > 0) {
              const localPart = value.substring(0, atIndex);
              const domain = value.substring(atIndex);
              const maskedLocal =
                localPart.length > 2
                  ? (localPart[0] ?? "") +
                    maskChar.repeat(localPart.length - 2) +
                    (localPart[localPart.length - 1] ?? "")
                  : maskChar.repeat(localPart.length);
              maskedValue = maskedLocal + domain;
            } else {
              maskedValue = maskChar.repeat(value.length);
            }
            break;
          }
          case "phone": {
            const digits = value.replace(/\D/g, "");
            maskedValue =
              maskChar.repeat(Math.max(0, digits.length - 4)) +
              digits.slice(-4);
            break;
          }
          case "ssn": {
            const ssnDigits = value.replace(/\D/g, "");
            maskedValue = `${maskChar}${maskChar}${maskChar}-${maskChar}${maskChar}-${ssnDigits.slice(-4)}`;
            break;
          }
          case "credit_card": {
            const ccDigits = value.replace(/\D/g, "");
            if (ccDigits.length <= 8) {
              return Promise.resolve({
                success: true,
                original: value,
                masked: maskChar.repeat(value.length),
                type,
                warning:
                  "Value too short for credit_card format (expected more than 8 digits); fully masked instead",
              });
            }
            maskedValue =
              ccDigits.slice(0, 4) +
              maskChar.repeat(Math.max(0, ccDigits.length - 8)) +
              ccDigits.slice(-4);
            break;
          }
          case "partial": {
            if (keepFirst + keepLast >= value.length) {
              return Promise.resolve({
                success: true,
                original: value,
                masked: value,
                type,
                warning:
                  "Masking ineffective: keepFirst + keepLast covers entire value length; returned unchanged",
              });
            } else {
              const maskLength = value.length - keepFirst - keepLast;
              maskedValue =
                value.slice(0, keepFirst) +
                maskChar.repeat(maskLength) +
                (keepLast > 0 ? value.slice(-keepLast) : "");
            }
            break;
          }
          default:
            maskedValue = maskChar.repeat(value.length);
        }

        return Promise.resolve({
          success: true,
          original: value,
          masked: maskedValue,
          type,
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return Promise.resolve(
            formatHandlerErrorResponse(error, {
              tool: "pg_security_mask_data",
            }),
          );
        }
        return Promise.resolve(
          formatHandlerErrorResponse(error, {
            tool: "pg_security_mask_data",
          }),
        );
      }
    },
  };
}

// =============================================================================
// pg_security_user_privileges
// =============================================================================

/**
 * Get comprehensive user/role privileges
 */
export function createSecurityUserPrivilegesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_user_privileges",
    description:
      "Get comprehensive privilege report for PostgreSQL roles including attributes, membership, and object grants.",
    group: "security",
    inputSchema: UserPrivilegesSchemaBase,
    outputSchema: UserPrivilegesOutputSchema,
    annotations: admin("User Privileges"),
    icons: getToolIcons("security", admin("User Privileges")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { user, includeRoles, summary, includeGrants } =
          UserPrivilegesSchema.parse(params) as {
            user?: string;
            includeRoles: boolean;
            summary: boolean;
            includeGrants: boolean;
          };

        // P154: Validate role existence when explicitly provided
        if (user) {
          const roleCheck = await adapter.executeQuery(
            `SELECT 1 FROM pg_roles WHERE rolname = $1`,
            [user],
          );
          if (!roleCheck.rows || roleCheck.rows.length === 0) {
            return {
              success: false,
              error: `Role '${user}' does not exist.`,
              code: "OBJECT_NOT_FOUND",
              category: "resource",
              recoverable: false
            };
          }
        }

        // Get roles with their attributes
        let rolesQuery = `
          SELECT
            r.rolname as role_name,
            r.rolsuper as is_superuser,
            r.rolinherit as inherits,
            r.rolcreaterole as can_create_role,
            r.rolcreatedb as can_create_db,
            r.rolcanlogin as can_login,
            r.rolreplication as is_replication,
            r.rolbypassrls as bypass_rls,
            r.rolconnlimit as connection_limit,
            r.rolvaliduntil as valid_until
          FROM pg_roles r
        `;

        const queryParams: string[] = [];
        if (user) {
          rolesQuery += ` WHERE r.rolname = $1`;
          queryParams.push(user);
        } else {
          // Exclude system roles for cleaner output
          rolesQuery += ` WHERE r.rolname NOT LIKE 'pg_%'`;
        }
        rolesQuery += ` ORDER BY r.rolname`;

        const rolesResult = await adapter.executeQuery(rolesQuery, queryParams);

        const userPrivileges: Record<string, unknown>[] = [];

        for (const roleRow of rolesResult.rows ?? []) {
          const r = roleRow;
          const roleName = r["role_name"] as string;

          let memberOf: string[] = [];
          if (includeRoles) {
            try {
              const memberResult = await adapter.executeQuery(
                `
                SELECT b.rolname as granted_role
                FROM pg_auth_members m
                JOIN pg_roles a ON m.member = a.oid
                JOIN pg_roles b ON m.roleid = b.oid
                WHERE a.rolname = $1
                ORDER BY b.rolname
              `,
                [roleName],
              );

              memberOf = (memberResult.rows ?? []).map(
                (row: Record<string, unknown>) =>
                  row["granted_role"] as string,
              );
            } catch {
              // Membership info not accessible
            }
          }

          if (summary) {
            // Get grant count for summary mode
            let grantCount = 0;
            try {
              const grantsResult = await adapter.executeQuery(
                `
                SELECT count(*) as cnt
                FROM information_schema.role_table_grants
                WHERE grantee = $1
              `,
                [roleName],
              );
              grantCount = Number(grantsResult.rows?.[0]?.["cnt"] ?? 0);
            } catch {
              // Grant info not accessible
            }

            userPrivileges.push({
              role: roleName,
              isSuperuser: r["is_superuser"],
              canLogin: r["can_login"],
              canCreateDb: r["can_create_db"],
              canCreateRole: r["can_create_role"],
              isReplication: r["is_replication"],
              bypassRls: r["bypass_rls"],
              grantCount,
              roleCount: memberOf.length,
            });
          } else {
            let tableGrants: Record<string, unknown>[] = [];
            if (includeGrants) {
              try {
                const grantsResult = await adapter.executeQuery(
                  `
                  SELECT
                    table_schema as schema,
                    table_name,
                    privilege_type,
                    is_grantable
                  FROM information_schema.role_table_grants
                  WHERE grantee = $1
                  ORDER BY table_schema, table_name, privilege_type
                  LIMIT 100
                `,
                  [roleName],
                );
                tableGrants = grantsResult.rows ?? [];
              } catch {
                // Grant info not accessible
              }
            }

            userPrivileges.push({
              role: roleName,
              attributes: {
                isSuperuser: r["is_superuser"],
                canLogin: r["can_login"],
                canCreateDb: r["can_create_db"],
                canCreateRole: r["can_create_role"],
                isReplication: r["is_replication"],
                bypassRls: r["bypass_rls"],
                inherits: r["inherits"],
                connectionLimit: r["connection_limit"],
                validUntil: r["valid_until"],
              },
              memberOf,
              ...(includeGrants ? { tableGrants } : {}),
            });
          }
        }

        return {
          success: true,
          users: userPrivileges,
          count: userPrivileges.length,
          summary,
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_user_privileges",
        });
      }
    },
  };
}

// =============================================================================
// pg_security_sensitive_tables
// =============================================================================

/**
 * Identify tables with potentially sensitive data
 */
export function createSecuritySensitiveTablesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_security_sensitive_tables",
    description:
      "Identify tables and columns that may contain sensitive data based on column name patterns.",
    group: "security",
    inputSchema: SensitiveTablesSchemaBase,
    outputSchema: SensitiveTablesOutputSchema,
    annotations: readOnly("Sensitive Tables"),
    icons: getToolIcons("security", readOnly("Sensitive Tables")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = SensitiveTablesSchema.parse(params) as {
          schema?: string;
          patterns: string[];
          limit: number;
        };
        const { schema, patterns, limit } = parsed;

        // P154: Schema existence check when explicitly provided
        if (schema) {
          const schemaCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
            [schema],
          );
          if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
            return {
              success: false,
              error: `Schema '${schema}' does not exist. Use pg_list_schemas to see available schemas.`,
              code: "OBJECT_NOT_FOUND",
              category: "resource",
              recoverable: false
            };
          }
        }

        // Build pattern conditions using parameterized queries
        const schemaTarget = schema ?? "public";
        const patternConditions = patterns
          .map((_: string, i: number) => `column_name ILIKE $${String(i + 2)}`)
          .join(" OR ");
        const patternParams = patterns.map((p: string) => `%${p}%`);

        const query = `
          SELECT
            table_name,
            column_name,
            data_type,
            udt_name,
            is_nullable,
            column_default
          FROM information_schema.columns
          WHERE table_schema = $1
            AND (${patternConditions})
          ORDER BY table_name, column_name
        `;

        const result = await adapter.executeQuery(query, [
          schemaTarget,
          ...patternParams,
        ]);

        // Group by table
        const tableMap = new Map<string, Record<string, unknown>[]>();
        for (const row of result.rows ?? []) {
          const r = row;
          const tableName = r["table_name"] as string;
          if (!tableMap.has(tableName)) {
            tableMap.set(tableName, []);
          }
          tableMap.get(tableName)?.push(r);
        }

        const allItems = Array.from(tableMap.entries()).map(
          ([table, columns]) => ({
            table,
            sensitiveColumns: columns,
            columnCount: columns.length,
          }),
        );

        const totalAvailable = allItems.length;
        const limited = totalAvailable > limit;
        const sensitiveItems = limited ? allItems.slice(0, limit) : allItems;

        return {
          success: true,
          sensitiveTables: sensitiveItems,
          tableCount: sensitiveItems.length,
          totalSensitiveColumns: result.rows?.length ?? 0,
          patternsUsed: patterns,
          ...(limited ? { limited: true, totalAvailable } : {}),
        };
      } catch (err) {
        return formatHandlerErrorResponse(err, {
          tool: "pg_security_sensitive_tables",
        });
      }
    },
  };
}
