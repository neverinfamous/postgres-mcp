/**
 * postgres-mcp - Code Mode Parameter Normalization
 *
 * Normalizes positional arguments to named parameter objects.
 * Handles single positional args, multi positional args,
 * array wrapping, and object wrapping.
 */

import {
  POSITIONAL_PARAM_MAP,
  ARRAY_WRAP_MAP,
  OBJECT_WRAP_MAP,
} from "./maps.js";

/**
 * Normalize parameters to support positional arguments.
 * Handles both single positional args and multiple positional args.
 */
export function normalizeParams(methodName: string, args: unknown[]): unknown {
  // No args - pass through
  if (args.length === 0) return undefined;

  // Single arg handling
  if (args.length === 1) {
    const arg = args[0];

    // Object arg - check if we need to wrap it
    if (typeof arg === "object" && arg !== null && !Array.isArray(arg)) {
      const wrapConfig = OBJECT_WRAP_MAP[methodName];
      if (wrapConfig !== undefined) {
        const objArg = arg as Record<string, unknown>;
        // Only wrap if none of the skipKeys are present (avoid double-wrapping)
        const hasExpectedKey = wrapConfig.skipKeys.some((key) => key in objArg);
        if (!hasExpectedKey) {
          return { [wrapConfig.wrapKey]: arg };
        }
      }
      // Pass through normally (either no wrap config or already has expected structure)
      return arg;
    }

    // Array arg - check if we should wrap it
    if (Array.isArray(arg)) {
      const wrapKey = ARRAY_WRAP_MAP[methodName];
      if (wrapKey !== undefined) {
        return { [wrapKey]: arg };
      }
      // Return as-is (e.g., for rows parameter)
      return arg;
    }

    // String arg - use positional mapping
    if (typeof arg === "string") {
      const paramMapping = POSITIONAL_PARAM_MAP[methodName];
      if (typeof paramMapping === "string") {
        return { [paramMapping]: arg };
      }
      if (Array.isArray(paramMapping) && paramMapping[0] !== undefined) {
        return { [paramMapping[0]]: arg };
      }
      // Fallback: try common parameter names
      return { sql: arg, query: arg, table: arg, name: arg };
    }

    return arg;
  }

  // Multi-arg: check for array+options pattern first (e.g., execute([stmts], {isolationLevel}))
  if (args.length >= 1 && Array.isArray(args[0])) {
    const wrapKey = ARRAY_WRAP_MAP[methodName];
    if (wrapKey !== undefined) {
      const result: Record<string, unknown> = { [wrapKey]: args[0] };
      // Merge trailing options object
      if (args.length > 1) {
        const lastArg = args[args.length - 1];
        if (
          typeof lastArg === "object" &&
          lastArg !== null &&
          !Array.isArray(lastArg)
        ) {
          Object.assign(result, lastArg);
        }
      }
      return result;
    }
  }

  // Look up positional parameter mapping
  const paramMapping = POSITIONAL_PARAM_MAP[methodName];

  if (paramMapping === undefined) {
    return args[0];
  }

  // Single param mapping - merge trailing options if present
  if (typeof paramMapping === "string") {
    const result: Record<string, unknown> = { [paramMapping]: args[0] };
    // Merge trailing options object (e.g., truncate("table", { cascade: true }))
    if (args.length > 1) {
      const lastArg = args[args.length - 1];
      if (
        typeof lastArg === "object" &&
        lastArg !== null &&
        !Array.isArray(lastArg)
      ) {
        Object.assign(result, lastArg);
      }
    }
    return result;
  }

  // Multi-param mapping (array)
  const result: Record<string, unknown> = {};

  // Check if last arg is an options object that should be merged
  const lastArg = args[args.length - 1];
  const lastArgIsOptionsObject =
    typeof lastArg === "object" &&
    lastArg !== null &&
    !Array.isArray(lastArg) &&
    Object.keys(lastArg as Record<string, unknown>).some((k) =>
      paramMapping.includes(k),
    );

  // Map positional args to their keys, skipping options object if detected
  const argsToMap = lastArgIsOptionsObject ? args.length - 1 : args.length;
  for (let i = 0; i < paramMapping.length && i < argsToMap; i++) {
    const key = paramMapping[i];
    const arg = args[i];
    if (key !== undefined) {
      result[key] = arg;
    }
  }

  // Merge trailing options object (either beyond mapping length or detected options object)
  if (args.length > paramMapping.length || lastArgIsOptionsObject) {
    if (
      typeof lastArg === "object" &&
      lastArg !== null &&
      !Array.isArray(lastArg)
    ) {
      Object.assign(result, lastArg);
    }
  }

  return result;
}
