/**
 * PostgreSQL Role Management - CRUD Tools
 *
 * Tools for listing, creating, dropping, and inspecting roles.
 * 4 tools total.
 */

import { ZodError } from "zod";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import { QueryError, ValidationError } from "../../../../types/errors.js";
import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { readOnly, admin, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  RoleListSchemaBase,
  RoleListSchema,
  RoleCreateSchemaBase,
  RoleCreateSchema,
  RoleDropSchemaBase,
  RoleDropSchema,
  RoleAttributesSchemaBase,
  RoleAttributesSchema,
  // Output schemas
  RoleListOutputSchema,
  RoleCreateOutputSchema,
  RoleDropOutputSchema,
  RoleAttributesOutputSchema,
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
// pg_role_list
// =============================================================================

/**
 * List all roles with optional pattern filter
 */
export function createRoleListTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_role_list",
    description:
      "List PostgreSQL roles with attributes (login, superuser, createdb, etc.) and optional name filtering.",
    group: "roles",
    inputSchema: RoleListSchemaBase,
    outputSchema: RoleListOutputSchema,
    annotations: readOnly("List Roles"),
    icons: getToolIcons("roles", readOnly("List Roles")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleListSchema.parse(params) as {
          pattern?: string;
          includeSystem?: boolean;
          limit?: number;
        };
        const includeSystem = parsed.includeSystem ?? false;
        const limit = parsed.limit ?? 50;

        let query = `
          SELECT
            rolname AS name,
            rolcanlogin AS login,
            rolsuper AS superuser,
            rolcreatedb AS createdb,
            rolcreaterole AS createrole,
            rolreplication AS replication,
            rolbypassrls AS bypassrls,
            rolconnlimit AS "connectionLimit",
            rolvaliduntil AS "validUntil"
          FROM pg_roles
        `;

        const conditions: string[] = [];
        const queryParams: string[] = [];

        if (!includeSystem) {
          conditions.push(`rolname NOT LIKE 'pg_%'`);
        }

        if (parsed.pattern) {
          queryParams.push(parsed.pattern);
          conditions.push(`rolname LIKE $${String(queryParams.length)}`);
        }

        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY rolname";
        query += ` LIMIT ${String(limit)}`;

        const result = await adapter.executeQuery(query, queryParams);
        const roles = (result.rows ?? []).map(
          (row: Record<string, unknown>) => ({
            name: row["name"] as string,
            login: row["login"] as boolean,
            superuser: row["superuser"] as boolean,
            createdb: row["createdb"] as boolean,
            createrole: row["createrole"] as boolean,
            replication: row["replication"] as boolean,
            bypassrls: row["bypassrls"] as boolean,
            connectionLimit: Number(row["connectionLimit"] ?? -1),
            validUntil: row["validUntil"] as string | null,
          }),
        );

        return {
          success: true,
          roles,
          count: roles.length,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_list" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_list" });
      }
    },
  };
}

// =============================================================================
// pg_role_create
// =============================================================================

/**
 * Create a new PostgreSQL role with optional attributes
 */
export function createRoleCreateTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_role_create",
    description:
      "Create a new PostgreSQL role with optional attributes (LOGIN, PASSWORD, SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS, CONNECTION LIMIT, VALID UNTIL).",
    group: "roles",
    inputSchema: RoleCreateSchemaBase,
    outputSchema: RoleCreateOutputSchema,
    annotations: admin("Create Role"),
    icons: getToolIcons("roles", admin("Create Role")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleCreateSchema.parse(params) as {
          name: string;
          ifNotExists?: boolean;
          login?: boolean;
          password?: string;
          superuser?: boolean;
          createdb?: boolean;
          createrole?: boolean;
          replication?: boolean;
          bypassrls?: boolean;
          connectionLimit?: number;
          validUntil?: string;
          inRoles?: string[];
        };

        const ifNotExists = parsed.ifNotExists ?? true;

        if (!validateIdentifier(parsed.name)) {
          return formatHandlerErrorResponse(
            new ValidationError(
              `Invalid role name: '${parsed.name}' — must start with a letter or underscore and contain only alphanumeric characters, underscores, or dollar signs`,
            ),
            { tool: "pg_role_create" },
          );
        }

        // P154: Check existence first
        const exists = await roleExists(adapter, parsed.name);
        if (exists) {
          if (ifNotExists) {
            return {
              success: true,
              name: parsed.name,
              skipped: true,
              reason: "Role already exists",
            };
          }
          return formatHandlerErrorResponse(
            new QueryError(`Role '${parsed.name}' already exists`),
            { tool: "pg_role_create" },
          );
        }

        // Build CREATE ROLE statement
        const attributes: string[] = [];

        if (parsed.login === true) attributes.push("LOGIN");
        if (parsed.login === false) attributes.push("NOLOGIN");
        if (parsed.superuser === true) attributes.push("SUPERUSER");
        if (parsed.superuser === false) attributes.push("NOSUPERUSER");
        if (parsed.createdb === true) attributes.push("CREATEDB");
        if (parsed.createdb === false) attributes.push("NOCREATEDB");
        if (parsed.createrole === true) attributes.push("CREATEROLE");
        if (parsed.createrole === false) attributes.push("NOCREATEROLE");
        if (parsed.replication === true) attributes.push("REPLICATION");
        if (parsed.replication === false) attributes.push("NOREPLICATION");
        if (parsed.bypassrls === true) attributes.push("BYPASSRLS");
        if (parsed.bypassrls === false) attributes.push("NOBYPASSRLS");

        if (parsed.connectionLimit !== undefined) {
          attributes.push(
            `CONNECTION LIMIT ${String(parsed.connectionLimit)}`,
          );
        }

        if (parsed.validUntil) {
          // Use parameterized query for the timestamp value
          attributes.push(`VALID UNTIL '${parsed.validUntil.replace(/'/g, "''")}'`);
        }

        if (parsed.password) {
          attributes.push(`PASSWORD '${parsed.password.replace(/'/g, "''")}'`);
        }

        // Validate inRoles identifiers
        if (parsed.inRoles) {
          for (const roleName of parsed.inRoles) {
            if (!validateIdentifier(roleName)) {
              return formatHandlerErrorResponse(
                new ValidationError(
                  `Invalid role name in inRoles: '${roleName}'`,
                ),
                { tool: "pg_role_create" },
              );
            }
          }
          attributes.push(
            `IN ROLE ${parsed.inRoles.map((r) => `"${r}"`).join(", ")}`,
          );
        }

        const attrClause =
          attributes.length > 0 ? " " + attributes.join(" ") : "";
        await adapter.executeQuery(
          `CREATE ROLE "${parsed.name}"${attrClause}`,
        );

        return {
          success: true,
          name: parsed.name,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_create" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_create" });
      }
    },
  };
}

// =============================================================================
// pg_role_drop
// =============================================================================

/**
 * Drop a PostgreSQL role
 */
export function createRoleDropTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_role_drop",
    description:
      "Drop a PostgreSQL role. Use ifExists (default: true) to skip gracefully if the role does not exist.",
    group: "roles",
    inputSchema: RoleDropSchemaBase,
    outputSchema: RoleDropOutputSchema,
    annotations: destructive("Drop Role"),
    icons: getToolIcons("roles", destructive("Drop Role")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleDropSchema.parse(params) as {
          name: string;
          ifExists?: boolean;
        };

        const ifExists = parsed.ifExists ?? true;

        if (!validateIdentifier(parsed.name)) {
          return formatHandlerErrorResponse(
            new ValidationError(
              `Invalid role name: '${parsed.name}'`,
            ),
            { tool: "pg_role_drop" },
          );
        }

        // P154: Check existence first
        const exists = await roleExists(adapter, parsed.name);
        if (!exists) {
          if (ifExists) {
            return {
              success: true,
              name: parsed.name,
              skipped: true,
              reason: "Role did not exist",
            };
          }
          return formatHandlerErrorResponse(
            new QueryError(`Role '${parsed.name}' does not exist`),
            { tool: "pg_role_drop" },
          );
        }

        await adapter.executeQuery(`DROP ROLE "${parsed.name}"`);

        return {
          success: true,
          name: parsed.name,
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, { tool: "pg_role_drop" });
        }
        return formatHandlerErrorResponse(err, { tool: "pg_role_drop" });
      }
    },
  };
}

// =============================================================================
// pg_role_attributes
// =============================================================================

/**
 * Get detailed role attributes
 */
export function createRoleAttributesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_role_attributes",
    description:
      "Get detailed attributes for a PostgreSQL role: login, superuser, createdb, createrole, replication, bypassrls, inherit, connection limit, expiration, and OID.",
    group: "roles",
    inputSchema: RoleAttributesSchemaBase,
    outputSchema: RoleAttributesOutputSchema,
    annotations: readOnly("Role Attributes"),
    icons: getToolIcons("roles", readOnly("Role Attributes")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = RoleAttributesSchema.parse(params);

        const result = await adapter.executeQuery(
          `SELECT
            rolname AS name,
            rolcanlogin AS login,
            rolsuper AS superuser,
            rolcreatedb AS createdb,
            rolcreaterole AS createrole,
            rolreplication AS replication,
            rolbypassrls AS bypassrls,
            rolinherit AS inherit,
            rolconnlimit AS "connectionLimit",
            rolvaliduntil AS "validUntil",
            oid
          FROM pg_roles
          WHERE rolname = $1`,
          [parsed.role],
        );

        if ((result.rows?.length ?? 0) === 0) {
          return formatHandlerErrorResponse(
            new QueryError(`Role '${parsed.role}' does not exist`),
            { tool: "pg_role_attributes" },
          );
        }

        const row = (result.rows ?? [])[0];

        if (!row) {
          return formatHandlerErrorResponse(
            new QueryError(`Role '${parsed.role}' does not exist`),
            { tool: "pg_role_attributes" },
          );
        }

        return {
          success: true,
          exists: true,
          role: {
            name: row["name"] as string,
            login: row["login"] as boolean,
            superuser: row["superuser"] as boolean,
            createdb: row["createdb"] as boolean,
            createrole: row["createrole"] as boolean,
            replication: row["replication"] as boolean,
            bypassrls: row["bypassrls"] as boolean,
            inherit: row["inherit"] as boolean,
            connectionLimit: Number(row["connectionLimit"] ?? -1),
            validUntil: row["validUntil"] as string | null,
            oid: Number(row["oid"]),
          },
        };
      } catch (err) {
        if (err instanceof ZodError) {
          return formatHandlerErrorResponse(err, {
            tool: "pg_role_attributes",
          });
        }
        return formatHandlerErrorResponse(err, {
          tool: "pg_role_attributes",
        });
      }
    },
  };
}
