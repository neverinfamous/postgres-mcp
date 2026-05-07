/**
 * PostgreSQL Role Management - Session & RLS Tools
 *
 * Tools for user role inspection, session role switching,
 * and row-level security management.
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
  UserRolesSchemaBase,
  UserRolesSchema,
  RoleSetSchemaBase,
  RoleSetSchema,
  RoleRlsEnableSchemaBase,
  RoleRlsEnableSchema,
  RoleRlsPoliciesSchemaBase,
  RoleRlsPoliciesSchema,
  // Output schemas
  UserRolesOutputSchema,
  RoleSetOutputSchema,
  RoleRlsEnableOutputSchema,
  RoleRlsPoliciesOutputSchema,
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

// =============================================================================
// pg_user_roles
// =============================================================================

/**
 * List roles assigned to a user/role
 */
export function createUserRolesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_user_roles",
    description:
      "List all roles assigned to a user/role, including admin option and SET option (PG 16+).",
    group: "roles",
    inputSchema: UserRolesSchemaBase,
    outputSchema: UserRolesOutputSchema,
    annotations: readOnly("User Roles"),
    icons: getToolIcons("roles", readOnly("User Roles")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = UserRolesSchema.parse(params);

        // P154: Check user existence
        const exists = await roleExists(adapter, parsed.user);
        if (!exists) {
          return {
            success: false,
            exists: false,
            user: parsed.user,
            error: `User/role '${parsed.user}' does not exist`,
          };
        }

        // Query role membership with admin_option
        // set_option is PG 16+, so we use a try/catch to handle older versions
        let roles: { role: string; adminOption: boolean; setOption?: boolean }[];

        try {
          const result = await adapter.executeQuery(
            `SELECT
              r.rolname AS role,
              m.admin_option AS "adminOption",
              m.set_option AS "setOption"
            FROM pg_auth_members m
            JOIN pg_roles r ON r.oid = m.roleid
            JOIN pg_roles u ON u.oid = m.member
            WHERE u.rolname = $1
            ORDER BY r.rolname`,
            [parsed.user],
          );

          roles = (result.rows ?? []).map(
            (row: Record<string, unknown>) => ({
              role: row["role"] as string,
              adminOption: row["adminOption"] as boolean,
              setOption: row["setOption"] as boolean,
            }),
          );
        } catch {
          // Fallback for PG < 16 (no set_option column)
          const result = await adapter.executeQuery(
            `SELECT
              r.rolname AS role,
              m.admin_option AS "adminOption"
            FROM pg_auth_members m
            JOIN pg_roles r ON r.oid = m.roleid
            JOIN pg_roles u ON u.oid = m.member
            WHERE u.rolname = $1
            ORDER BY r.rolname`,
            [parsed.user],
          );

          roles = (result.rows ?? []).map(
            (row: Record<string, unknown>) => ({
              role: row["role"] as string,
              adminOption: row["adminOption"] as boolean,
            }),
          );
        }

        return {
          success: true,
          exists: true,
          user: parsed.user,
          roles,
          count: roles.length,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_user_roles" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_user_roles" });
      }
    },
  };
}

// =============================================================================
// pg_role_set
// =============================================================================

/**
 * Set the session's active role
 */
export function createRoleSetTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_set",
    description:
      "Set the session's active role using SET ROLE, or reset to the original session role with RESET ROLE. Session-scoped and reversible.",
    group: "roles",
    inputSchema: RoleSetSchemaBase,
    outputSchema: RoleSetOutputSchema,
    annotations: admin("Set Role"),
    icons: getToolIcons("roles", admin("Set Role")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleSetSchema.parse(params) as {
          role?: string;
          reset?: boolean;
        };

        // Get current role before change
        const currentResult = await adapter.executeQuery(
          `SELECT current_user AS current_role`,
        );
        const currentRow = currentResult.rows?.[0];
        const previousRole = (currentRow?.["current_role"] ?? "") as string;

        if (parsed.reset || !parsed.role) {
          // RESET ROLE — restore original session role
          await adapter.executeQuery(`RESET ROLE`);

          const afterResult = await adapter.executeQuery(
            `SELECT current_user AS current_role`,
          );
          const afterRow = afterResult.rows?.[0];
          const newRole = (afterRow?.["current_role"] ?? "") as string;

          return {
            success: true,
            currentRole: newRole,
            previousRole,
            reset: true,
          };
        }

        // SET ROLE
        if (!validateIdentifier(parsed.role)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid role name: '${parsed.role}'`),
            { tool: "pg_role_set" },
          );
        }

        // P154: Check role exists
        const exists = await roleExists(adapter, parsed.role);
        if (!exists) {
          return {
            success: false,
            error: `Role '${parsed.role}' does not exist`,
            previousRole,
          };
        }

        await adapter.executeQuery(`SET ROLE "${parsed.role}"`);

        const afterResult2 = await adapter.executeQuery(
          `SELECT current_user AS current_role`,
        );
        const afterRow2 = afterResult2.rows?.[0];
        const newRole = (afterRow2?.["current_role"] ?? "") as string;

        return {
          success: true,
          currentRole: newRole,
          previousRole,
          reset: false,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_set" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_set" });
      }
    },
  };
}

// =============================================================================
// pg_role_rls_enable
// =============================================================================

/**
 * Enable or disable row-level security on a table
 */
export function createRoleRlsEnableTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_rls_enable",
    description:
      "Enable or disable row-level security (RLS) on a table. Optionally use FORCE to apply RLS even to the table owner.",
    group: "roles",
    inputSchema: RoleRlsEnableSchemaBase,
    outputSchema: RoleRlsEnableOutputSchema,
    annotations: admin("RLS Enable/Disable"),
    icons: getToolIcons("roles", admin("RLS Enable/Disable")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleRlsEnableSchema.parse(params) as {
          table: string;
          schema?: string;
          enable?: boolean;
          force?: boolean;
        };

        const schema = parsed.schema ?? "public";
        const enable = parsed.enable ?? true;
        const force = parsed.force ?? false;

        if (!validateIdentifier(parsed.table)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid table name: '${parsed.table}'`),
            { tool: "pg_role_rls_enable" },
          );
        }
        if (!validateIdentifier(schema)) {
          return formatHandlerErrorResponse(
            new Error(`Invalid schema name: '${schema}'`),
            { tool: "pg_role_rls_enable" },
          );
        }

        // P154: Check table exists
        const tableCheck = await adapter.executeQuery(
          `SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2`,
          [schema, parsed.table],
        );
        if ((tableCheck.rows?.length ?? 0) === 0) {
          return formatHandlerErrorResponse(
            new Error(
              `Table '${schema}.${parsed.table}' does not exist`,
            ),
            { tool: "pg_role_rls_enable" },
          );
        }

        const qualifiedName = `"${schema}"."${parsed.table}"`;

        if (enable) {
          await adapter.executeQuery(
            `ALTER TABLE ${qualifiedName} ENABLE ROW LEVEL SECURITY`,
          );
          if (force) {
            await adapter.executeQuery(
              `ALTER TABLE ${qualifiedName} FORCE ROW LEVEL SECURITY`,
            );
          }
        } else {
          await adapter.executeQuery(
            `ALTER TABLE ${qualifiedName} DISABLE ROW LEVEL SECURITY`,
          );
          // Also remove FORCE if disabling
          await adapter.executeQuery(
            `ALTER TABLE ${qualifiedName} NO FORCE ROW LEVEL SECURITY`,
          );
        }

        // Verify current state
        const stateResult = await adapter.executeQuery(
          `SELECT
            relrowsecurity AS rls_enabled,
            relforcerowsecurity AS rls_forced
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = $2`,
          [schema, parsed.table],
        );

        const stateRow = stateResult.rows?.[0];

        return {
          success: true,
          table: parsed.table,
          schema,
          enabled: (stateRow?.["rls_enabled"] as boolean) ?? enable,
          forced: (stateRow?.["rls_forced"] as boolean) ?? force,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_role_rls_enable",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_role_rls_enable",
        });
      }
    },
  };
}

// =============================================================================
// pg_role_rls_policies
// =============================================================================

/**
 * List RLS policies on a table
 */
export function createRoleRlsPoliciesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_rls_policies",
    description:
      "List row-level security (RLS) policies for a table or all tables in a schema. Shows policy name, command, roles, USING/WITH CHECK expressions, and permissive/restrictive type.",
    group: "roles",
    inputSchema: RoleRlsPoliciesSchemaBase,
    outputSchema: RoleRlsPoliciesOutputSchema,
    annotations: readOnly("RLS Policies"),
    icons: getToolIcons("roles", readOnly("RLS Policies")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleRlsPoliciesSchema.parse(params) as {
          table?: string;
          schema?: string;
        };

        const schema = parsed.schema ?? "public";

        if (parsed.table) {
          // P154: Check table exists
          const tableCheck = await adapter.executeQuery(
            `SELECT 1 FROM information_schema.tables
            WHERE table_schema = $1 AND table_name = $2`,
            [schema, parsed.table],
          );
          if ((tableCheck.rows?.length ?? 0) === 0) {
            return formatHandlerErrorResponse(
              new Error(
                `Table '${schema}.${parsed.table}' does not exist`,
              ),
              { tool: "pg_role_rls_policies" },
            );
          }
        }

        let query = `
          SELECT
            pol.polname AS "policyName",
            cls.relname AS "tableName",
            nsp.nspname AS "schemaName",
            CASE pol.polcmd
              WHEN 'r' THEN 'SELECT'
              WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE'
              WHEN 'd' THEN 'DELETE'
              WHEN '*' THEN 'ALL'
              ELSE pol.polcmd::text
            END AS command,
            CASE pol.polpermissive
              WHEN true THEN 'PERMISSIVE'
              ELSE 'RESTRICTIVE'
            END AS permissive,
            ARRAY(
              SELECT rolname FROM pg_roles
              WHERE oid = ANY(pol.polroles)
            ) AS roles,
            pg_get_expr(pol.polqual, pol.polrelid) AS "usingExpr",
            pg_get_expr(pol.polwithcheck, pol.polrelid) AS "withCheckExpr"
          FROM pg_policy pol
          JOIN pg_class cls ON cls.oid = pol.polrelid
          JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
          WHERE nsp.nspname = $1
        `;

        const queryParams: string[] = [schema];

        if (parsed.table) {
          queryParams.push(parsed.table);
          query += ` AND cls.relname = $${String(queryParams.length)}`;
        }

        query += ` ORDER BY nsp.nspname, cls.relname, pol.polname`;

        const result = await adapter.executeQuery(query, queryParams);

        const policies = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            policyName: row["policyName"] as string,
            tableName: row["tableName"] as string,
            schemaName: row["schemaName"] as string,
            command: row["command"] as string,
            permissive: row["permissive"] as string,
            roles: row["roles"] as string[],
            usingExpr: row["usingExpr"] as string | null,
            withCheckExpr: row["withCheckExpr"] as string | null,
          }),
        );

        return {
          success: true,
          policies,
          count: policies.length,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_role_rls_policies",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_role_rls_policies",
        });
      }
    },
  };
}
