/**
 * PostgreSQL Role Management - Privilege Tools
 *
 * Tools for granting/revoking privileges and role membership.
 * 4 tools total.
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
  RoleGrantsSchemaBase,
  RoleGrantsSchema,
  RoleGrantSchemaBase,
  RoleGrantSchema,
  RoleAssignSchemaBase,
  RoleAssignSchema,
  RoleRevokeSchemaBase,
  RoleRevokeSchema,
  // Output schemas
  RoleGrantsOutputSchema,
  RoleGrantOutputSchema,
  RoleAssignOutputSchema,
  RoleRevokeOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// Helpers
// =============================================================================

/** Validate a SQL identifier to prevent injection */
function validateIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(name);
}

/** Check if a role exists via pg_roles */
async function roleExists(
  adapter: PostgresAdapter,
  roleName: string,
): Promise<boolean> {
  const result = await adapter.executeQuery(
    `SELECT 1 FROM pg_roles WHERE rolname = $1`,
    [roleName],
  );
  return (result.rows?.length ?? 0) > 0;
}

/** Valid PostgreSQL privilege names */
const VALID_PRIVILEGES = new Set([
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "CREATE",
  "CONNECT",
  "TEMPORARY",
  "TEMP",
  "EXECUTE",
  "USAGE",
  "ALL",
  "ALL PRIVILEGES",
]);

/** Validate privilege names against the allowlist */
function validatePrivileges(
  privileges: string[],
): { valid: true } | { valid: false; invalid: string[] } {
  const invalid = privileges.filter(
    (p) => !VALID_PRIVILEGES.has(p.toUpperCase()),
  );
  if (invalid.length > 0) {
    return { valid: false, invalid };
  }
  return { valid: true };
}

// =============================================================================
// pg_role_grants
// =============================================================================

/**
 * Show privileges granted to a role
 */
export function createRoleGrantsTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_grants",
    description:
      "Show privileges and memberships for a PostgreSQL role. Includes role attributes, membership in other roles, and optionally table-level grants.",
    group: "roles",
    inputSchema: RoleGrantsSchemaBase,
    outputSchema: RoleGrantsOutputSchema,
    annotations: readOnly("Role Grants"),
    icons: getToolIcons("roles", readOnly("Role Grants")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleGrantsSchema.parse(params) as {
          role: string;
          includeTableGrants?: boolean;
        };

        const includeTableGrants = parsed.includeTableGrants ?? true;

        // P154: Check role existence
        const exists = await roleExists(adapter, parsed.role);
        if (!exists) {
          return {
            success: true,
            exists: false,
            role: parsed.role,
            error: `Role '${parsed.role}' does not exist`,
          };
        }

        // Get role memberships (roles this role is a member of)
        const memberResult = await adapter.executeQuery(
          `SELECT
            r.rolname AS role,
            m.admin_option AS "adminOption"
          FROM pg_auth_members m
          JOIN pg_roles r ON r.oid = m.roleid
          JOIN pg_roles u ON u.oid = m.member
          WHERE u.rolname = $1
          ORDER BY r.rolname`,
          [parsed.role],
        );

        const memberOf = (memberResult.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            role: row["role"] as string,
            adminOption: row["adminOption"] as boolean,
          }),
        );

        // Get table-level grants if requested
        let tableGrants: Record<string, unknown>[] | undefined;
        if (includeTableGrants) {
          const grantsResult = await adapter.executeQuery(
            `SELECT
              table_schema,
              table_name,
              privilege_type,
              is_grantable
            FROM information_schema.role_table_grants
            WHERE grantee = $1
            ORDER BY table_schema, table_name, privilege_type`,
            [parsed.role],
          );
          tableGrants = grantsResult.rows ?? [];
        }

        return {
          success: true,
          exists: true,
          role: parsed.role,
          memberOf,
          tableGrants,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_grants" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_grants" });
      }
    },
  };
}

// =============================================================================
// pg_role_grant
// =============================================================================

/**
 * Grant privileges on objects to a role
 */
export function createRoleGrantTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_grant",
    description:
      "Grant privileges (SELECT, INSERT, UPDATE, DELETE, ALL, etc.) on tables, schemas, sequences, or functions to a PostgreSQL role.",
    group: "roles",
    inputSchema: RoleGrantSchemaBase,
    outputSchema: RoleGrantOutputSchema,
    annotations: admin("Grant Privileges"),
    icons: getToolIcons("roles", admin("Grant Privileges")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleGrantSchema.parse(params) as {
          role: string;
          privileges: string[];
          schema?: string;
          table?: string;
          objectType?: string;
          withGrantOption?: boolean;
        };

        const schema = parsed.schema ?? "public";
        const withGrantOption = parsed.withGrantOption ?? false;

        if (!validateIdentifier(parsed.role)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid role name: '${parsed.role}'`),
            { tool: "pg_role_grant" },
          );
        }

        // P154: Check role existence
        const exists = await roleExists(adapter, parsed.role);
        if (!exists) {
          return {
            success: false,
            exists: false,
            role: parsed.role,
            error: `Role '${parsed.role}' does not exist`,
          };
        }

        // Validate privileges
        const privCheck = validatePrivileges(parsed.privileges);
        if (!privCheck.valid) {
          return formatHandlerErrorResponse(
            new Error(
              `Invalid privilege(s): ${privCheck.invalid.join(", ")}. Valid: ${[...VALID_PRIVILEGES].join(", ")}`,
            ),
            { tool: "pg_role_grant" },
          );
        }

        const privList = parsed.privileges
          .map((p) => p.toUpperCase())
          .join(", ");

        // Determine target
        let target: string;
        const objType = (parsed.objectType ?? "TABLE").toUpperCase();

        if (
          objType === "ALL TABLES IN SCHEMA" ||
          (parsed.table === "*" && objType === "TABLE")
        ) {
          if (!validateIdentifier(schema)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid schema name: '${schema}'`),
              { tool: "pg_role_grant" },
            );
          }
          target = `ALL TABLES IN SCHEMA "${schema}"`;
        } else if (objType === "ALL SEQUENCES IN SCHEMA") {
          if (!validateIdentifier(schema)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid schema name: '${schema}'`),
              { tool: "pg_role_grant" },
            );
          }
          target = `ALL SEQUENCES IN SCHEMA "${schema}"`;
        } else if (objType === "SCHEMA") {
          if (!validateIdentifier(schema)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid schema name: '${schema}'`),
              { tool: "pg_role_grant" },
            );
          }
          target = `SCHEMA "${schema}"`;
        } else if (parsed.table) {
          if (!validateIdentifier(parsed.table)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid table name: '${parsed.table}'`),
              { tool: "pg_role_grant" },
            );
          }
          if (!validateIdentifier(schema)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid schema name: '${schema}'`),
              { tool: "pg_role_grant" },
            );
          }
          target = `TABLE "${schema}"."${parsed.table}"`;
        } else {
          return formatHandlerErrorResponse(
            new Error(
              "Either 'table' or 'objectType' of SCHEMA/ALL TABLES IN SCHEMA is required",
            ),
            { tool: "pg_role_grant" },
          );
        }

        let sql = `GRANT ${privList} ON ${target} TO "${parsed.role}"`;
        if (withGrantOption) {
          sql += " WITH GRANT OPTION";
        }

        await adapter.executeQuery(sql);

        return {
          success: true,
          role: parsed.role,
          privileges: parsed.privileges,
          target,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_grant" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_grant" });
      }
    },
  };
}

// =============================================================================
// pg_role_assign
// =============================================================================

/**
 * Grant role membership to a user/role
 */
export function createRoleAssignTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_assign",
    description:
      "Assign (grant) a role to a user/role, establishing role membership. Optionally with ADMIN OPTION to allow re-granting.",
    group: "roles",
    inputSchema: RoleAssignSchemaBase,
    outputSchema: RoleAssignOutputSchema,
    annotations: admin("Assign Role"),
    icons: getToolIcons("roles", admin("Assign Role")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleAssignSchema.parse(params) as {
          role: string;
          user: string;
          withAdminOption?: boolean;
          withSet?: boolean;
        };

        const withAdminOption = parsed.withAdminOption ?? false;

        if (!validateIdentifier(parsed.role)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid role name: '${parsed.role}'`),
            { tool: "pg_role_assign" },
          );
        }
        if (!validateIdentifier(parsed.user)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid user name: '${parsed.user}'`),
            { tool: "pg_role_assign" },
          );
        }

        // P154: Check both roles exist
        const roleExistsVal = await roleExists(adapter, parsed.role);
        if (!roleExistsVal) {
          return {
            success: false,
            exists: false,
            role: parsed.role,
            error: `Role '${parsed.role}' does not exist`,
          };
        }

        const userExistsVal = await roleExists(adapter, parsed.user);
        if (!userExistsVal) {
          return {
            success: false,
            exists: false,
            user: parsed.user,
            error: `User/role '${parsed.user}' does not exist`,
          };
        }

        let sql = `GRANT "${parsed.role}" TO "${parsed.user}"`;
        if (withAdminOption) {
          sql += " WITH ADMIN OPTION";
        }

        await adapter.executeQuery(sql);

        return {
          success: true,
          role: parsed.role,
          user: parsed.user,
          withAdminOption,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_assign" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_assign" });
      }
    },
  };
}

// =============================================================================
// pg_role_revoke
// =============================================================================

/**
 * Revoke role membership or privileges from a user/role
 */
export function createRoleRevokeTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_revoke",
    description:
      "Revoke role membership from a user, or revoke specific privileges on objects from a role. For membership: provide role + user. For privileges: provide role + privileges + table/schema.",
    group: "roles",
    inputSchema: RoleRevokeSchemaBase,
    outputSchema: RoleRevokeOutputSchema,
    annotations: admin("Revoke Role/Privileges"),
    icons: getToolIcons("roles", admin("Revoke Role/Privileges")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleRevokeSchema.parse(params) as {
          role: string;
          user?: string;
          privileges?: string[];
          schema?: string;
          table?: string;
          objectType?: string;
        };

        if (!validateIdentifier(parsed.role)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid role name: '${parsed.role}'`),
            { tool: "pg_role_revoke" },
          );
        }

        // P154: Check role existence
        const roleExistsVal = await roleExists(adapter, parsed.role);
        if (!roleExistsVal) {
          return {
            success: false,
            exists: false,
            role: parsed.role,
            error: `Role '${parsed.role}' does not exist`,
          };
        }

        // Determine revocation mode: membership vs privileges
        if (parsed.privileges && parsed.privileges.length > 0) {
          // Object privilege revocation
          const privCheck = validatePrivileges(parsed.privileges);
          if (!privCheck.valid) {
            return formatHandlerErrorResponse(
              new Error(
                `Invalid privilege(s): ${privCheck.invalid.join(", ")}`,
              ),
              { tool: "pg_role_revoke" },
            );
          }

          const schema = parsed.schema ?? "public";
          const privList = parsed.privileges
            .map((p) => p.toUpperCase())
            .join(", ");

          let target: string;
          const objType = (parsed.objectType ?? "TABLE").toUpperCase();

          if (objType === "ALL TABLES IN SCHEMA") {
            if (!validateIdentifier(schema)) {
              return formatHandlerErrorResponse(
                new Error(`Invalid schema name: '${schema}'`),
                { tool: "pg_role_revoke" },
              );
            }
            target = `ALL TABLES IN SCHEMA "${schema}"`;
          } else if (objType === "ALL SEQUENCES IN SCHEMA") {
            if (!validateIdentifier(schema)) {
              return formatHandlerErrorResponse(
                new Error(`Invalid schema name: '${schema}'`),
                { tool: "pg_role_revoke" },
              );
            }
            target = `ALL SEQUENCES IN SCHEMA "${schema}"`;
          } else if (objType === "SCHEMA") {
            if (!validateIdentifier(schema)) {
              return formatHandlerErrorResponse(
                new Error(`Invalid schema name: '${schema}'`),
                { tool: "pg_role_revoke" },
              );
            }
            target = `SCHEMA "${schema}"`;
          } else if (parsed.table) {
            if (!validateIdentifier(parsed.table)) {
              return formatHandlerErrorResponse(
                new Error(`Invalid table name: '${parsed.table}'`),
                { tool: "pg_role_revoke" },
              );
            }
            if (!validateIdentifier(schema)) {
              return formatHandlerErrorResponse(
                new Error(`Invalid schema name: '${schema}'`),
                { tool: "pg_role_revoke" },
              );
            }
            target = `TABLE "${schema}"."${parsed.table}"`;
          } else {
            return formatHandlerErrorResponse(
              new Error(
                "Either 'table' or 'objectType' is required for privilege revocation",
              ),
              { tool: "pg_role_revoke" },
            );
          }

          await adapter.executeQuery(
            `REVOKE ${privList} ON ${target} FROM "${parsed.role}"`,
          );

          return {
            success: true,
            role: parsed.role,
            privileges: parsed.privileges,
            target,
          };
        } else if (parsed.user) {
          // Role membership revocation
          if (!validateIdentifier(parsed.user)) {
            return formatHandlerErrorResponse(
              new Error(`Invalid user name: '${parsed.user}'`),
              { tool: "pg_role_revoke" },
            );
          }

          // Check user exists
          const userExistsVal = await roleExists(adapter, parsed.user);
          if (!userExistsVal) {
            return {
              success: false,
              exists: false,
              user: parsed.user,
              error: `User/role '${parsed.user}' does not exist`,
            };
          }

          // Check membership exists
          const memberCheck = await adapter.executeQuery(
            `SELECT 1
            FROM pg_auth_members m
            JOIN pg_roles r ON r.oid = m.roleid
            JOIN pg_roles u ON u.oid = m.member
            WHERE r.rolname = $1 AND u.rolname = $2`,
            [parsed.role, parsed.user],
          );

          if ((memberCheck.rows?.length ?? 0) === 0) {
            return {
              success: false,
              role: parsed.role,
              user: parsed.user,
              error: `Role '${parsed.role}' is not currently assigned to '${parsed.user}'`,
            };
          }

          await adapter.executeQuery(
            `REVOKE "${parsed.role}" FROM "${parsed.user}"`,
          );

          return {
            success: true,
            role: parsed.role,
            user: parsed.user,
          };
        } else {
          return formatHandlerErrorResponse(
            new Error(
              "Either 'user' (for membership revocation) or 'privileges' (for object privilege revocation) is required",
            ),
            { tool: "pg_role_revoke" },
          );
        }
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_revoke" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_revoke" });
      }
    },
  };
}
