# PostgreSQL MCP Tests

This directory contains tests for the PostgreSQL MCP package.

## Running Tests

To run all tests:

```bash
uv run pytest
```

To run a specific test file:

```bash
uv run pytest tests/unit/test_obfuscate_password.py
```

To run a specific test:

```bash
uv run pytest tests/unit/test_db_conn_pool.py::test_pool_connect_success
```

## Test Structure

- **Unit Tests** (`tests/unit/`): Tests for individual components and functions
  - `test_obfuscate_password.py`: Tests for password obfuscation functionality
  - `test_db_conn_pool.py`: Tests for database connection pool
  - `test_sql_driver.py`: Tests for SQL driver and transaction handling

- **Integration Tests** (`tests/integration/`): Tests against live PostgreSQL instances
  - Runs automatically against PostgreSQL 13 (oldest supported) and 17 (latest stable)
  - Uses Docker containers with HypoPG extension for testing

## PostgreSQL Version Testing

Integration tests are automatically run against:
- **PostgreSQL 13**: Oldest supported version (minimum compatibility)
- **PostgreSQL 18**: Latest stable version (current production recommendation)

The test fixture builds custom Docker images with the `hypopg` extension for index optimization testing. Default version for manual testing is PostgreSQL 18 (see `tests/Dockerfile.postgres-hypopg`).

**Note**: Integration tests are automatically skipped on Windows due to known compatibility issues between psycopg's `AsyncConnectionPool` and Windows event loops. All unit tests pass on Windows. Integration tests run successfully on Linux and macOS.
