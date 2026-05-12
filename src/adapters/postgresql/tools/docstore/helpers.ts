/**
 * PostgreSQL Document Store - Shared Helpers
 *
 * Utilities for document collection tools: identifier validation,
 * filter parsing, collection existence checks, and table reference escaping.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";

export const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Valid JSON path: $, $.field, $.field.sub, $.field[0], $[0], $[*]
export const JSON_PATH_RE =
  /^(\$)((\.([a-zA-Z_][a-zA-Z0-9_]*))((\[\d+\])|(\[\*\]))?)*((\[\d+\])|(\[\*\]))?$/;

/**
 * Parse filter string into a WHERE clause with parameterized queries.
 * Supports:
 * - _id match: 32-char hex string → WHERE _id = $1
 * - JSON object: {"name":"Alice"} → WHERE doc->>'name' = $1
 * - Field equality: name=Alice → WHERE doc->>'name' = $1
 * - JSON path existence: $.name → WHERE doc ? 'name'
 */
export function parseDocFilter(
  filter: string,
  paramOffset = 0,
): {
  where: string;
  params: unknown[];
} {
  // Check if it's a direct _id (32-char hex)
  if (/^[a-f0-9]{32}$/i.test(filter)) {
    return { where: `_id = $${String(paramOffset + 1)}`, params: [filter] };
  }

  // Check if it's a stringified JSON object (e.g. {"name":"Alice"})
  if (filter.trim().startsWith("{") && filter.trim().endsWith("}")) {
    try {
      const parsed = JSON.parse(filter) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        const record = parsed as Record<string, unknown>;
        const keys = Object.keys(record);
        const field = keys[0];
        if (typeof field === "string" && IDENTIFIER_RE.test(field)) {
          const value = record[field];
          
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            const opObj = value as Record<string, unknown>;
            const opKeys = Object.keys(opObj);
            if (opKeys.length === 1 && typeof opKeys[0] === "string" && opKeys[0].startsWith("$")) {
              const op = opKeys[0];
              const opVal = opObj[op];
              let sqlOp = "=";
              let isArrayOp = false;
              if (op === "$gt") sqlOp = ">";
              else if (op === "$gte") sqlOp = ">=";
              else if (op === "$lt") sqlOp = "<";
              else if (op === "$lte") sqlOp = "<=";
              else if (op === "$ne") sqlOp = "!=";
              else if (op === "$in") { sqlOp = "IN"; isArrayOp = true; }
              else if (op === "$nin") { sqlOp = "NOT IN"; isArrayOp = true; }
              
              if (sqlOp !== "=" && !isArrayOp) {
                if (typeof opVal === "number") {
                  return {
                    where: `(doc->>'${field}')::float ${sqlOp} $${String(paramOffset + 1)}::float`,
                    params: [String(opVal)],
                  };
                } else {
                  return {
                    where: `doc->>'${field}' ${sqlOp} $${String(paramOffset + 1)}`,
                    params: [String(opVal)],
                  };
                }
              } else if (isArrayOp && Array.isArray(opVal) && opVal.length > 0) {
                if (opVal.every(v => typeof v === "number")) {
                  const placeholders = opVal.map((_, i) => `$${String(paramOffset + 1 + i)}::float`).join(", ");
                  return {
                    where: `(doc->>'${field}')::float ${sqlOp} (${placeholders})`,
                    params: opVal.map(String)
                  };
                } else {
                  const placeholders = opVal.map((_, i) => `$${String(paramOffset + 1 + i)}`).join(", ");
                  return {
                    where: `doc->>'${field}' ${sqlOp} (${placeholders})`,
                    params: opVal.map(String)
                  };
                }
              }
            }
            
            // Nested object without a matching operator -> containment check
            return {
              where: `doc @> $${String(paramOffset + 1)}::jsonb`,
              params: [JSON.stringify(record)],
            };
          }
          
          // Support multiple keys if present using containment check,
          // otherwise use simple equality for the single field
          if (keys.length > 1) {
            return {
              where: `doc @> $${String(paramOffset + 1)}::jsonb`,
              params: [JSON.stringify(record)],
            };
          }
          
          return {
            where: `doc->>'${field}' = $${String(paramOffset + 1)}`,
            params: [String(value)],
          };
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Unsupported filter structure")) {
        throw e;
      }
      // Ignore parse error and fall through
    }
  }

  // Check for simple field=value pattern
  const eqMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)=(.+)$/.exec(filter);
  if (eqMatch) {
    const field = eqMatch[1] ?? "";
    const value = eqMatch[2] ?? "";
    if (!IDENTIFIER_RE.test(field)) {
      throw new Error(
        `Invalid field name in filter: "${field}". Field names must be valid identifiers.`,
      );
    }
    return {
      where: `doc->>'${field}' = $${String(paramOffset + 1)}`,
      params: [value],
    };
  }

  // Default: treat as JSON path existence check
  if (!filter.startsWith("$")) {
    throw new Error(
      `Invalid filter: "${filter}". Use JSON path ($.field), _id value, or field=value format.`,
    );
  }

  // Validate JSON path against allowlist regex
  if (!JSON_PATH_RE.test(filter)) {
    throw new Error(
      `Invalid JSON path: "${filter}". Only alphanumeric field names, array indices, and dot notation are allowed.`,
    );
  }

  // Extract the top-level key from the path for the ? operator
  // $.name → 'name', $.address.city → use @> containment
  const pathParts = filter
    .substring(2) // strip "$."
    .split(".");

  if (pathParts.length === 1 && pathParts[0] !== undefined && pathParts[0] !== "") {
    // Simple top-level key: doc ? 'key'
    return {
      where: `doc ? $${String(paramOffset + 1)}`,
      params: [pathParts[0]],
    };
  }

  // Nested path: use jsonb_extract_path_text IS NOT NULL
  const pathArgs = pathParts
    .map((_p, i) => `$${String(paramOffset + 1 + i)}`)
    .join(", ");
  return {
    where: `jsonb_extract_path_text(doc, ${pathArgs}) IS NOT NULL`,
    params: pathParts,
  };
}

/**
 * Check if a collection (table with doc JSONB + _id column) exists.
 * Returns a discriminated result distinguishing schema-not-found from collection-not-found.
 */
export async function checkCollectionExists(
  adapter: PostgresAdapter,
  collection: string,
  schema?: string,
): Promise<
  | { exists: true }
  | { exists: false; reason: "schema" | "collection"; name: string }
> {
  // When schema is explicitly provided, check schema existence first
  if (schema) {
    const schemaCheck = await adapter.executeQuery(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [schema],
    );
    if (!schemaCheck.rows || schemaCheck.rows.length === 0) {
      return { exists: false, reason: "schema", name: schema };
    }
  }

  const result = await adapter.executeQuery(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = COALESCE($1, current_schema()) AND table_name = $2`,
    [schema ?? null, collection],
  );
  if ((result.rows?.length ?? 0) > 0) {
    return { exists: true };
  }
  return { exists: false, reason: "collection", name: collection };
}

/**
 * Build a double-quoted PostgreSQL table reference.
 */
export function escapeTableRef(name: string, schema?: string): string {
  return schema ? `"${schema}"."${name}"` : `"${name}"`;
}
