/**
 * PostgreSQL Security Tools
 *
 * Tools for security auditing, SSL monitoring, data masking,
 * privilege analysis, and compliance.
 * 9 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type { ToolDefinition } from "../../../../types/index.js";

// Import from submodules
import {
  createSecurityAuditTool,
  createSecurityFirewallStatusTool,
  createSecurityFirewallRulesTool,
} from "./audit.js";

import {
  createSecuritySSLStatusTool,
  createSecurityEncryptionStatusTool,
  createSecurityPasswordValidateTool,
} from "./encryption.js";

import {
  createSecurityMaskDataTool,
  createSecurityUserPrivilegesTool,
  createSecuritySensitiveTablesTool,
} from "./data-protection.js";

/**
 * Get all security tools
 */
export function getSecurityTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createSecurityAuditTool(adapter),
    createSecurityFirewallStatusTool(adapter),
    createSecurityFirewallRulesTool(adapter),
    createSecurityMaskDataTool(adapter),
    createSecurityPasswordValidateTool(adapter),
    createSecuritySSLStatusTool(adapter),
    createSecurityUserPrivilegesTool(adapter),
    createSecuritySensitiveTablesTool(adapter),
    createSecurityEncryptionStatusTool(adapter),
  ];
}

// Re-export individual tool creators for direct imports
export {
  createSecurityAuditTool,
  createSecurityFirewallStatusTool,
  createSecurityFirewallRulesTool,
  createSecurityMaskDataTool,
  createSecurityUserPrivilegesTool,
  createSecuritySensitiveTablesTool,
  createSecuritySSLStatusTool,
  createSecurityEncryptionStatusTool,
  createSecurityPasswordValidateTool,
};
