#!/usr/bin/env python3
"""
Simple script to start the postgres-mcp server locally for Cursor MCP integration.
"""
import sys
import os

# Add the src directory to Python path
src_path = os.path.join(os.path.dirname(__file__), 'src')
sys.path.insert(0, src_path)

# Import and run the main function
from postgres_mcp import main

if __name__ == "__main__":
    main()
