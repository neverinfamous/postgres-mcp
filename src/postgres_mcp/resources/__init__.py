"""PostgreSQL MCP Server Resources & Prompts.

This module provides MCP Resources for database meta-awareness and 
MCP Prompts for guided workflows.
"""

from .database_resources import register_resources
from .prompt_handlers import register_prompts

__all__ = ["register_resources", "register_prompts"]

