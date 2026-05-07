/**
 * PostgreSQL Role Management Tools
 *
 * Tools for role CRUD, privilege management, membership,
 * session role switching, and row-level security.
 * 12 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from submodules
import {
  createRoleListTool,
  createRoleCreateTool,
  createRoleDropTool,
  createRoleAttributesTool,
} from "./management.js";

import {
  createRoleGrantsTool,
  createRoleGrantTool,
  createRoleAssignTool,
  createRoleRevokeTool,
} from "./privileges.js";

import {
  createUserRolesTool,
  createRoleSetTool,
  createRoleRlsEnableTool,
  createRoleRlsPoliciesTool,
} from "./session.js";

/**
 * Get all role management tools
 */
export function getRoleTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createRoleListTool(adapter),
    createRoleCreateTool(adapter),
    createRoleDropTool(adapter),
    createRoleAttributesTool(adapter),
    createRoleGrantsTool(adapter),
    createRoleGrantTool(adapter),
    createRoleAssignTool(adapter),
    createRoleRevokeTool(adapter),
    createUserRolesTool(adapter),
    createRoleSetTool(adapter),
    createRoleRlsEnableTool(adapter),
    createRoleRlsPoliciesTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createRoleListTool,
  createRoleCreateTool,
  createRoleDropTool,
  createRoleAttributesTool,
  createRoleGrantsTool,
  createRoleGrantTool,
  createRoleAssignTool,
  createRoleRevokeTool,
  createUserRolesTool,
  createRoleSetTool,
  createRoleRlsEnableTool,
  createRoleRlsPoliciesTool,
};
