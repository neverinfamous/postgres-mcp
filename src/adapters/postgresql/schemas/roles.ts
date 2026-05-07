/**
 * postgres-mcp - Role Management Tool Schemas
 *
 * Input validation and output schemas for role management tools.
 * 12 tools: list, create, drop, attributes, grants, grant, assign,
 * revoke, user_roles, set, rls_enable, rls_policies.
 */

import { z } from "zod";
import { ErrorResponseFields } from "./error-response-fields.js";

// Helper to handle undefined params (allows tools to be called without {})
const defaultToEmpty = (val: unknown): unknown => val ?? {};

// =============================================================================
// Input Schemas (Split Schema pattern: Base for MCP, Preprocessed for handler)
// =============================================================================

/**
 * pg_role_list — list all roles with optional pattern filter
 */
export const RoleListSchemaBase = z.object({
  pattern: z
    .string()
    .optional()
    .describe("Filter roles by name pattern (SQL LIKE syntax, e.g. 'admin%')"),
  includeSystem: z
    .boolean()
    .optional()
    .describe("Include system roles (pg_* prefixed, default: false)"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of roles to return (default: 50)"),
});

export const RoleListSchema = z.preprocess(defaultToEmpty, RoleListSchemaBase);

/**
 * pg_role_create — create a new role with optional attributes
 */
export const RoleCreateSchemaBase = z.object({
  name: z.string().describe("Name for the new role"),
  ifNotExists: z
    .boolean()
    .optional()
    .describe("Skip without error if role already exists (default: true)"),
  login: z
    .boolean()
    .optional()
    .describe("Allow role to log in (default: false)"),
  password: z.string().optional().describe("Password for login roles"),
  superuser: z
    .boolean()
    .optional()
    .describe("Grant superuser privilege (default: false)"),
  createdb: z
    .boolean()
    .optional()
    .describe("Allow creating databases (default: false)"),
  createrole: z
    .boolean()
    .optional()
    .describe("Allow creating other roles (default: false)"),
  replication: z
    .boolean()
    .optional()
    .describe("Allow replication connections (default: false)"),
  bypassrls: z
    .boolean()
    .optional()
    .describe("Bypass row-level security (default: false)"),
  connectionLimit: z
    .number()
    .optional()
    .describe("Maximum concurrent connections (-1 = unlimited)"),
  validUntil: z
    .string()
    .optional()
    .describe("Password expiration timestamp (ISO 8601)"),
  inRoles: z
    .array(z.string())
    .optional()
    .describe("Roles to grant membership in upon creation"),
});

export const RoleCreateSchema = RoleCreateSchemaBase;

/**
 * pg_role_drop — drop a role
 */
export const RoleDropSchemaBase = z.object({
  name: z.string().describe("Name of the role to drop"),
  ifExists: z
    .boolean()
    .optional()
    .describe("Skip without error if role does not exist (default: true)"),
});

export const RoleDropSchema = RoleDropSchemaBase;

/**
 * pg_role_attributes — get detailed role attributes
 */
export const RoleAttributesSchemaBase = z.object({
  role: z.string().describe("Role name to inspect"),
});

export const RoleAttributesSchema = RoleAttributesSchemaBase;

/**
 * pg_role_grants — show privileges granted to a role
 */
export const RoleGrantsSchemaBase = z.object({
  role: z.string().describe("Role name to inspect"),
  includeTableGrants: z
    .boolean()
    .optional()
    .describe(
      "Include object-level (table/schema) grants (default: true)",
    ),
});

export const RoleGrantsSchema = RoleGrantsSchemaBase;

/**
 * pg_role_grant — grant privileges on objects to a role
 */
export const RoleGrantSchemaBase = z.object({
  role: z
    .string()
    .describe("Role to grant privileges to"),
  privileges: z
    .array(z.string())
    .describe(
      "Privileges to grant (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, CREATE, CONNECT, TEMPORARY, EXECUTE, USAGE, ALL PRIVILEGES)",
    ),
  schema: z
    .string()
    .optional()
    .describe("Schema containing the target object (default: 'public')"),
  table: z
    .string()
    .optional()
    .describe(
      "Table name or '*' for all tables in schema. Omit for schema-level grants.",
    ),
  objectType: z
    .string()
    .optional()
    .describe(
      "Object type: 'TABLE' (default), 'SCHEMA', 'SEQUENCE', 'FUNCTION', 'ALL TABLES IN SCHEMA', 'ALL SEQUENCES IN SCHEMA'",
    ),
  withGrantOption: z
    .boolean()
    .optional()
    .describe("Allow grantee to re-grant the privilege (default: false)"),
});

export const RoleGrantSchema = RoleGrantSchemaBase;

/**
 * pg_role_assign — grant role membership to another role/user
 */
export const RoleAssignSchemaBase = z.object({
  role: z.string().describe("Role to grant (the membership)"),
  user: z.string().describe("User/role that receives the membership"),
  withAdminOption: z
    .boolean()
    .optional()
    .describe(
      "Allow the user to grant/revoke this role to/from others (default: false)",
    ),
  withSet: z
    .boolean()
    .optional()
    .describe(
      "Allow the user to SET ROLE to this role (PG 16+, default: true)",
    ),
});

export const RoleAssignSchema = RoleAssignSchemaBase;

/**
 * pg_role_revoke — revoke role or privileges from a user/role
 */
export const RoleRevokeSchemaBase = z.object({
  role: z
    .string()
    .describe(
      "Role to revoke membership of, OR role to revoke privileges from (when privileges are specified)",
    ),
  user: z
    .string()
    .optional()
    .describe(
      "User/role to revoke from (for membership revocation). Required when revoking role membership.",
    ),
  privileges: z
    .array(z.string())
    .optional()
    .describe(
      "Privileges to revoke (when revoking object privileges instead of membership)",
    ),
  schema: z
    .string()
    .optional()
    .describe("Schema containing the target object (default: 'public')"),
  table: z
    .string()
    .optional()
    .describe("Table name for object-level privilege revocation"),
  objectType: z
    .string()
    .optional()
    .describe(
      "Object type for privilege revocation: 'TABLE' (default), 'SCHEMA', 'SEQUENCE', 'FUNCTION', 'ALL TABLES IN SCHEMA', 'ALL SEQUENCES IN SCHEMA'",
    ),
});

export const RoleRevokeSchema = RoleRevokeSchemaBase;

/**
 * pg_user_roles — list roles assigned to a user/role
 */
export const UserRolesSchemaBase = z.object({
  user: z.string().describe("User/role name to inspect"),
});

export const UserRolesSchema = UserRolesSchemaBase;

/**
 * pg_role_set — set session's active role
 */
export const RoleSetSchemaBase = z.object({
  role: z
    .string()
    .optional()
    .describe("Role to switch to. Omit (or use reset: true) to reset."),
  reset: z
    .boolean()
    .optional()
    .describe("Reset to the original session role (default: false)"),
});

export const RoleSetSchema = z.preprocess(defaultToEmpty, RoleSetSchemaBase);

/**
 * pg_role_rls_enable — enable/disable row-level security on a table
 */
export const RoleRlsEnableSchemaBase = z.object({
  table: z.string().describe("Table name to enable/disable RLS on"),
  schema: z
    .string()
    .optional()
    .describe("Schema name (default: 'public')"),
  enable: z
    .boolean()
    .optional()
    .describe("Enable (true) or disable (false) RLS (default: true)"),
  force: z
    .boolean()
    .optional()
    .describe(
      "When true, RLS applies even to the table owner (FORCE ROW LEVEL SECURITY). Default: false.",
    ),
});

export const RoleRlsEnableSchema = RoleRlsEnableSchemaBase;

/**
 * pg_role_rls_policies — list RLS policies on a table
 */
export const RoleRlsPoliciesSchemaBase = z.object({
  table: z
    .string()
    .optional()
    .describe("Table name to list policies for. Omit for all tables."),
  schema: z
    .string()
    .optional()
    .describe("Schema name (default: 'public')"),
});

export const RoleRlsPoliciesSchema = z.preprocess(
  defaultToEmpty,
  RoleRlsPoliciesSchemaBase,
);

// =============================================================================
// Output Schemas
// =============================================================================

/**
 * pg_role_list output
 */
export const RoleListOutputSchema = z
  .object({
    roles: z
      .array(
        z.object({
          name: z.string().describe("Role name"),
          login: z.boolean().describe("Can log in"),
          superuser: z.boolean().describe("Is superuser"),
          createdb: z.boolean().describe("Can create databases"),
          createrole: z.boolean().describe("Can create roles"),
          replication: z.boolean().describe("Can replicate"),
          bypassrls: z.boolean().describe("Can bypass RLS"),
          connectionLimit: z.number().describe("Max connections (-1=unlimited)"),
          validUntil: z
            .string()
            .nullable()
            .optional()
            .describe("Password expiration"),
        }),
      )
      .optional()
      .describe("Matching roles"),
    count: z.number().optional().describe("Number of roles returned"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_create output
 */
export const RoleCreateOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether role was created"),
    name: z.string().optional().describe("Created role name"),
    skipped: z
      .boolean()
      .optional()
      .describe("True if role already existed (with ifNotExists)"),
    reason: z
      .string()
      .optional()
      .describe("Reason for skipping, if applicable"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_drop output
 */
export const RoleDropOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether role was dropped"),
    name: z.string().optional().describe("Dropped role name"),
    skipped: z
      .boolean()
      .optional()
      .describe("True if role did not exist (with ifExists)"),
    reason: z
      .string()
      .optional()
      .describe("Reason for skipping, if applicable"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_attributes output
 */
export const RoleAttributesOutputSchema = z
  .object({
    exists: z.boolean().optional().describe("Whether the role exists"),
    role: z
      .object({
        name: z.string().describe("Role name"),
        login: z.boolean().describe("Can log in"),
        superuser: z.boolean().describe("Is superuser"),
        createdb: z.boolean().describe("Can create databases"),
        createrole: z.boolean().describe("Can create roles"),
        replication: z.boolean().describe("Can replicate"),
        bypassrls: z.boolean().describe("Can bypass RLS"),
        inherit: z.boolean().describe("Inherits privileges from member roles"),
        connectionLimit: z.number().describe("Max connections (-1=unlimited)"),
        validUntil: z
          .string()
          .nullable()
          .optional()
          .describe("Password expiration"),
        oid: z.number().describe("Role OID"),
      })
      .optional()
      .describe("Role attributes"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_grants output
 */
export const RoleGrantsOutputSchema = z
  .object({
    exists: z.boolean().optional().describe("Whether the role exists"),
    role: z.string().optional().describe("Role name"),
    memberOf: z
      .array(
        z.object({
          role: z.string().describe("Parent role name"),
          adminOption: z.boolean().describe("Has admin option"),
        }),
      )
      .optional()
      .describe("Roles this role is a member of"),
    tableGrants: z
      .array(z.record(z.string(), z.unknown()))
      .optional()
      .describe("Object-level grants"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_grant output
 */
export const RoleGrantOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether grant succeeded"),
    role: z.string().optional().describe("Role that received privileges"),
    privileges: z
      .array(z.string())
      .optional()
      .describe("Privileges granted"),
    target: z.string().optional().describe("Target object"),
    exists: z
      .boolean()
      .optional()
      .describe("Whether target role exists (false if not found)"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_assign output
 */
export const RoleAssignOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether assignment succeeded"),
    role: z.string().optional().describe("Role assigned"),
    user: z.string().optional().describe("User that received membership"),
    withAdminOption: z
      .boolean()
      .optional()
      .describe("Whether admin option was granted"),
    exists: z
      .boolean()
      .optional()
      .describe("Whether target user/role exists"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_revoke output
 */
export const RoleRevokeOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether revocation succeeded"),
    role: z.string().optional().describe("Role revoked"),
    user: z
      .string()
      .optional()
      .describe("User that lost membership/privileges"),
    privileges: z
      .array(z.string())
      .optional()
      .describe("Privileges revoked (for object-level revocation)"),
    target: z
      .string()
      .optional()
      .describe("Target object (for object-level revocation)"),
    exists: z
      .boolean()
      .optional()
      .describe("Whether target role/user exists"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_user_roles output
 */
export const UserRolesOutputSchema = z
  .object({
    exists: z.boolean().optional().describe("Whether the user/role exists"),
    user: z.string().optional().describe("User/role name"),
    roles: z
      .array(
        z.object({
          role: z.string().describe("Granted role name"),
          adminOption: z.boolean().describe("Has admin option"),
          setOption: z
            .boolean()
            .optional()
            .describe("Has SET option (PG 16+)"),
        }),
      )
      .optional()
      .describe("Roles assigned to the user"),
    count: z.number().optional().describe("Number of roles"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_set output
 */
export const RoleSetOutputSchema = z
  .object({
    success: z.boolean().optional().describe("Whether SET ROLE succeeded"),
    currentRole: z
      .string()
      .optional()
      .describe("Active role after the operation"),
    previousRole: z
      .string()
      .optional()
      .describe("Role before the operation"),
    reset: z.boolean().optional().describe("Whether RESET ROLE was performed"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_rls_enable output
 */
export const RoleRlsEnableOutputSchema = z
  .object({
    success: z
      .boolean()
      .optional()
      .describe("Whether RLS was enabled/disabled"),
    table: z.string().optional().describe("Table name"),
    schema: z.string().optional().describe("Schema name"),
    enabled: z
      .boolean()
      .optional()
      .describe("Current RLS enabled state after operation"),
    forced: z
      .boolean()
      .optional()
      .describe("Whether FORCE ROW LEVEL SECURITY is active"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);

/**
 * pg_role_rls_policies output
 */
export const RoleRlsPoliciesOutputSchema = z
  .object({
    policies: z
      .array(
        z.object({
          policyName: z.string().describe("Policy name"),
          tableName: z.string().describe("Table name"),
          schemaName: z.string().describe("Schema name"),
          command: z
            .string()
            .describe("Command (SELECT, INSERT, UPDATE, DELETE, ALL)"),
          permissive: z
            .string()
            .describe("PERMISSIVE or RESTRICTIVE"),
          roles: z
            .array(z.string())
            .describe("Roles this policy applies to"),
          usingExpr: z
            .string()
            .nullable()
            .optional()
            .describe("USING expression"),
          withCheckExpr: z
            .string()
            .nullable()
            .optional()
            .describe("WITH CHECK expression"),
        }),
      )
      .optional()
      .describe("RLS policies"),
    count: z.number().optional().describe("Number of policies returned"),
    success: z.boolean().optional().describe("Whether operation succeeded"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .extend(ErrorResponseFields.shape);
