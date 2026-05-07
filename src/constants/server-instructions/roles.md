# Role Management Tools

PostgreSQL role CRUD, privilege management, membership, session control, and row-level security.

## Tools (12)

| Tool | Description |
|------|-------------|
| `pg_role_list` | List all roles with optional pattern filter and attributes |
| `pg_role_create` | Create a new role with optional attributes (LOGIN, PASSWORD, SUPERUSER, etc.) |
| `pg_role_drop` | Drop a role (with IF EXISTS safety by default) |
| `pg_role_attributes` | Get detailed role attributes and settings (OID, inherit, connection limit, expiration) |
| `pg_role_grants` | Show privileges and memberships for a role |
| `pg_role_grant` | Grant privileges (SELECT, INSERT, ALL, etc.) on tables/schemas/sequences to a role |
| `pg_role_assign` | Grant role membership to a user/role (with optional ADMIN OPTION) |
| `pg_role_revoke` | Revoke role membership or object privileges from a user/role |
| `pg_user_roles` | List roles assigned to a user (including admin and SET options) |
| `pg_role_set` | Set session's active role (SET ROLE / RESET ROLE) |
| `pg_role_rls_enable` | Enable/disable row-level security on a table (with optional FORCE) |
| `pg_role_rls_policies` | List RLS policies for a table (name, command, USING/WITH CHECK expressions) |

## Key Concepts

- **Unified Role Model**: PostgreSQL uses roles for both users and groups. A role with `LOGIN` is a "user"; a role without is a "group." Use `pg_role_create` with `login: true` for user-like roles.
- **Role Attributes**: `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`, `LOGIN`, `INHERIT`, `CONNECTION LIMIT`, `VALID UNTIL`.
- **Membership**: `pg_role_assign` grants membership (equivalent to MySQL's role assignment). Use `withAdminOption: true` to allow re-granting.
- **Row-Level Security (RLS)**: Must be enabled per-table with `pg_role_rls_enable`. Use `force: true` to apply RLS even to the table owner. Policies are created via SQL and inspected via `pg_role_rls_policies`.
- **SET ROLE**: Temporarily switch the session's effective role. Reversible with `pg_role_set({ reset: true })`.

## Code Mode

```javascript
// List all roles
const roles = await pg.roles.list();

// Create a login role
await pg.roles.create({ name: "webapp", login: true, password: "secure123" });

// Create a group role
await pg.roles.create({ name: "readonly" });

// Grant SELECT on all tables in public schema
await pg.roles.grant({ role: "readonly", privileges: ["SELECT"], table: "*" });

// Assign role to user
await pg.roles.assign({ role: "readonly", user: "webapp" });

// Inspect role memberships
const memberships = await pg.roles.userRoles({ user: "webapp" });

// Inspect role attributes
const attrs = await pg.roles.attributes({ role: "webapp" });

// Revoke membership
await pg.roles.revoke({ role: "readonly", user: "webapp" });

// Enable RLS on a table
await pg.roles.rlsEnable({ table: "users" });

// List RLS policies
const policies = await pg.roles.rlsPolicies({ table: "users" });

// Switch session role
await pg.roles.set({ role: "readonly" });
await pg.roles.set({ reset: true }); // restore original
```

## Permissions

- `pg_role_list`, `pg_role_attributes`, `pg_role_grants`, `pg_user_roles`, `pg_role_rls_policies`: Require **read** scope
- `pg_role_create`, `pg_role_drop`, `pg_role_grant`, `pg_role_assign`, `pg_role_revoke`, `pg_role_set`, `pg_role_rls_enable`: Require **admin** scope
- All tools perform existence checks (P154) before executing mutations
