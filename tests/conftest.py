import asyncio
from typing import Any, Generator

import pytest
from dotenv import load_dotenv
from utils import create_postgres_container

from postgres_mcp.sql import reset_postgres_version_cache

load_dotenv()


# Define a custom event loop policy that handles cleanup better
@pytest.fixture(scope="session")
def event_loop_policy() -> asyncio.DefaultEventLoopPolicy:
    """Create and return a custom event loop policy for tests."""
    return asyncio.DefaultEventLoopPolicy()


@pytest.fixture(scope="class", params=["postgres:15", "postgres:16"])
def test_postgres_connection_string(request: Any) -> Generator[tuple[str, str], None, None]:
    yield from create_postgres_container(str(request.param))


@pytest.fixture(autouse=True)
def reset_pg_version_cache() -> Generator[None, None, None]:
    """Reset the PostgreSQL version cache before each test."""
    reset_postgres_version_cache()
    yield
