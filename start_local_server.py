#!/usr/bin/env python3
"""
Simple script to start the postgres-mcp server locally for Cursor MCP integration.
"""

import os
import sys

# Add the src directory to Python path
src_path = os.path.join(os.path.dirname(__file__), "src")
sys.path.insert(0, src_path)

# Import after path manipulation
from postgres_mcp import main  # noqa: E402

if __name__ == "__main__":
    main()
