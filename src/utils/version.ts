/**
 * postgres-mcp - Package Version (SSoT)
 *
 * Reads the version from package.json at runtime so it never drifts.
 * Uses createRequire because package.json lives outside tsconfig rootDir.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

/** Package version sourced from package.json (single source of truth) */
export const VERSION: string = pkg.version;
