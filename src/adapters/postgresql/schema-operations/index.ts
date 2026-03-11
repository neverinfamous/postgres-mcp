/**
 * postgres-mcp — Schema Operations Barrel
 *
 * Re-exports all schema operation types, helpers, and query functions.
 */

// Types and parsing helpers
export type { QueryExecutor, CacheHelpers } from "./describe.js";
export {
  parseColumnsArray,
  extractIndexColumns,
  extractIndexExpressionPart,
  parseIndexExpressions,
  queryDescribeTable,
} from "./describe.js";

// List/query functions
export {
  getSchemaInfo,
  queryAllIndexes,
  queryListTables,
  queryListSchemas,
  queryTableIndexes,
  queryIsExtensionAvailable,
} from "./list.js";
