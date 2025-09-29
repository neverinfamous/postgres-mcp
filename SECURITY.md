# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 2025.x  | :white_check_mark: |
| < 2025  | :x:                |

## Reporting a Vulnerability

We take the security of the PostgreSQL MCP Server seriously. If you believe you have found a security vulnerability, please report it to us as described below.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please send an email to admin@adamic.tech with the following information:

- Type of issue (e.g. SQL injection, authentication bypass, privilege escalation, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

## Response Timeline

We will acknowledge receipt of your vulnerability report within 48 hours and will send a more detailed response within 72 hours indicating the next steps in handling your report.

After the initial reply to your report, we will keep you informed of the progress towards a fix and may ask for additional information or guidance.

## Security Best Practices

When using the PostgreSQL MCP Server:

### Database Security
1. **Connection Security**: Always use encrypted connections (SSL/TLS) for PostgreSQL databases
2. **Authentication**: Use strong authentication methods (password, certificate, or LDAP)
3. **Access Control**: Implement proper role-based access control (RBAC) in PostgreSQL
4. **Network Security**: Restrict database access to authorized networks only
5. **Database Permissions**: Follow the principle of least privilege for database users

### Application Security
1. **Parameter Binding**: Always use parameterized queries to prevent SQL injection
2. **Input Validation**: Validate and sanitize all input data before database operations
3. **Error Handling**: Avoid exposing sensitive database information in error messages
4. **Logging**: Enable appropriate logging for security monitoring and audit trails
5. **Regular Updates**: Keep the MCP server and PostgreSQL dependencies up to date

### Deployment Security
1. **Container Security**: Use official, updated base images and scan for vulnerabilities
2. **Secrets Management**: Store database credentials securely (environment variables, secrets managers)
3. **Resource Limits**: Set appropriate resource limits to prevent DoS attacks
4. **Monitoring**: Implement security monitoring and alerting for suspicious activities

## Security Features

### Built-in Protections
- **SQL Injection Prevention**: Parameter binding with automatic sanitization
- **Query Validation**: SQL parsing and validation in restricted mode
- **Access Control**: Configurable restricted/unrestricted modes
- **Error Sanitization**: Safe error messages that don't leak sensitive information

### Security Modes
- **Restricted Mode (Recommended)**: Uses SafeSqlDriver with comprehensive SQL validation
- **Unrestricted Mode**: Direct SQL execution with parameter binding protection
- **Custom Restrictions**: Configurable allowlists for statements, functions, and extensions

## Vulnerability History

### Fixed Vulnerabilities
- **CVE-2025-001** (September 2025): SQL injection in execute_sql function
  - **Impact**: Critical - Complete database compromise in unrestricted mode
  - **Fix**: Added parameter binding support with backward compatibility
  - **Status**: ✅ Fixed in version 2025.09.29

## Security Testing

We maintain comprehensive security testing including:
- **Automated SQL injection testing** with 20+ attack vectors
- **Parameter binding validation** for all query types
- **Access control testing** for restricted/unrestricted modes
- **Error handling validation** to prevent information disclosure

### Running Security Tests
```bash
# Run comprehensive security test suite
python run_security_test.py

# Test specific vulnerability fix
python test_security_fix.py

# Demonstrate vulnerability (educational purposes)
python demonstrate_vulnerability.py
```

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine the affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all releases still under support
4. Release new versions as quickly as possible
5. Credit the reporter (unless they prefer to remain anonymous)
6. Publish security advisories for significant vulnerabilities

## Security Contacts

- **Primary Contact**: admin@adamic.tech
- **Security Team**: Chris LeRoux (neverinfamous)
- **Response Time**: 48-72 hours
- **PGP Key**: Available upon request

## Acknowledgments

We would like to thank the following individuals for responsibly disclosing security vulnerabilities:

- **neverinfamous** - SQL injection vulnerability discovery and fix (September 2025)

Thank you for helping keep the PostgreSQL MCP Server and its users safe!

---

*This security policy is part of our commitment to maintaining a secure and reliable PostgreSQL MCP Server for the community.*
