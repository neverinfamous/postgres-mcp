# Security Tools

PostgreSQL security auditing, monitoring, and data protection.

## Tools (9)

| Tool | Description |
|------|-------------|
| `pg_security_audit` | Comprehensive security posture audit (SSL, password encryption, superusers, logging, HBA rules) |
| `pg_security_firewall_status` | pg_hba.conf rule summary — PostgreSQL's host-based authentication firewall |
| `pg_security_firewall_rules` | Detailed pg_hba.conf rule listing with user/type filtering |
| `pg_security_ssl_status` | SSL/TLS connection status for active connections |
| `pg_security_encryption_status` | Encryption configuration (SSL settings, password encryption, pgcrypto) |
| `pg_security_password_validate` | Password strength validation (local analysis, no DB query) |
| `pg_security_mask_data` | Data masking for email, phone, SSN, credit card, partial formats |
| `pg_security_user_privileges` | Role privilege report (attributes, membership, object grants) |
| `pg_security_sensitive_tables` | Detect columns with potentially sensitive data by name pattern |

## Key Concepts

- **pg_hba.conf**: PostgreSQL's host-based authentication file controls who can connect and how. The firewall tools read `pg_hba_file_rules` (PG 10+, requires superuser).
- **SSL/TLS**: PostgreSQL supports native SSL. `pg_stat_ssl` shows per-connection SSL details.
- **Password Encryption**: `scram-sha-256` is the recommended method (PG 10+). `md5` is legacy.
- **Role System**: PostgreSQL uses roles (not separate users/groups). Roles can have LOGIN, SUPERUSER, CREATEDB, CREATEROLE, REPLICATION, BYPASSRLS attributes.

## Code Mode

```javascript
// Quick audit
const audit = await pg.security.audit();

// Check SSL status
const ssl = await pg.security.sslStatus();

// Mask sensitive data
const masked = await pg.security.maskData({ value: "user@example.com", type: "email" });

// Check user privileges
const privs = await pg.security.userPrivileges({ user: "webapp" });

// Find sensitive columns
const sensitive = await pg.security.sensitiveTables({ schema: "public" });

// HBA rules
const hba = await pg.security.firewallStatus();
const rules = await pg.security.firewallRules({ type: "hostssl" });

// Password strength
const strength = await pg.security.passwordValidate({ password: "MyP@ssw0rd!" });
```

## Permissions

- `pg_security_audit`, `pg_security_encryption_status`, `pg_security_user_privileges`, `pg_security_firewall_rules`: Require **admin** scope
- `pg_security_ssl_status`, `pg_security_firewall_status`, `pg_security_mask_data`, `pg_security_sensitive_tables`, `pg_security_password_validate`: Require **read** scope
- HBA tools gracefully degrade if the user lacks superuser or `pg_read_all_settings` role
