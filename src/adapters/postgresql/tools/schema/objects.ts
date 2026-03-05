/**
 * PostgreSQL Schema Tools - Object Management
 *
 * Schema DDL operations: schemas, sequences, and constraint listing.
 * 6 tools total.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import { sanitizeIdentifier } from "../../../../utils/identifiers.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  CreateSchemaSchema,
  DropSchemaSchema,
  CreateSequenceSchemaBase,
  CreateSequenceSchema,
  DropSequenceSchemaBase,
  DropSequenceSchema,
  // Output schemas
  ListSchemasOutputSchema,
  CreateSchemaOutputSchema,
  DropSchemaOutputSchema,
  ListSequencesOutputSchema,
  CreateSequenceOutputSchema,
  DropSequenceOutputSchema,
} from "../../schemas/index.js";

// =============================================================================
// pg_list_schemas
// =============================================================================

export function createListSchemasTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_schemas",
    description: "List all schemas in the database.",
    group: "schema",
    inputSchema: z.object({}),
    outputSchema: ListSchemasOutputSchema,
    annotations: readOnly("List Schemas"),
    icons: getToolIcons("schema", readOnly("List Schemas")),
    handler: async (_params: unknown, _context: RequestContext) => {
      const schemas = await adapter.listSchemas();
      return { schemas, count: schemas.length };
    },
  };
}

// =============================================================================
// pg_create_schema
// =============================================================================

export function createCreateSchemaTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_create_schema",
    description: "Create a new schema.",
    group: "schema",
    inputSchema: CreateSchemaSchema,
    outputSchema: CreateSchemaOutputSchema,
    annotations: write("Create Schema"),
    icons: getToolIcons("schema", write("Create Schema")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, authorization, ifNotExists } =
          CreateSchemaSchema.parse(params);

        // Check if schema already exists when ifNotExists is true
        let alreadyExisted: boolean | undefined;
        if (ifNotExists === true) {
          const existsResult = await adapter.executeQuery(
            `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
            [name],
          );
          alreadyExisted = (existsResult.rows?.length ?? 0) > 0;
        }

        const ifNotExistsClause = ifNotExists ? "IF NOT EXISTS " : "";
        const schemaName = sanitizeIdentifier(name);
        const authClause = authorization
          ? ` AUTHORIZATION ${sanitizeIdentifier(authorization)}`
          : "";

        const sql = `CREATE SCHEMA ${ifNotExistsClause}${schemaName}${authClause}`;
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_create_schema",
              schema: name,
              objectType: "schema",
            }),
          };
        }

        const result: Record<string, unknown> = { success: true, schema: name };
        if (alreadyExisted !== undefined) {
          result["alreadyExisted"] = alreadyExisted;
        }
        return result;
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_create_schema" }),
        };
      }
    },
  };
}

// =============================================================================
// pg_drop_schema
// =============================================================================

export function createDropSchemaTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_schema",
    description: "Drop a schema (optionally with all objects).",
    group: "schema",
    inputSchema: DropSchemaSchema,
    outputSchema: DropSchemaOutputSchema,
    annotations: destructive("Drop Schema"),
    icons: getToolIcons("schema", destructive("Drop Schema")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, cascade, ifExists } = DropSchemaSchema.parse(params);

        // Check if schema exists before dropping (for accurate response)
        const existsResult = await adapter.executeQuery(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [name],
        );
        const existed = (existsResult.rows?.length ?? 0) > 0;

        const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
        const cascadeClause = cascade === true ? " CASCADE" : "";
        const schemaName = sanitizeIdentifier(name);

        const sql = `DROP SCHEMA ${ifExistsClause}${schemaName}${cascadeClause}`;
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_drop_schema",
              schema: name,
            }),
          };
        }
        return {
          success: true,
          schema: name,
          existed,
          note: existed
            ? undefined
            : `Schema '${name}' did not exist (ifExists: true)`,
        };
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_drop_schema" }),
        };
      }
    },
  };
}

// =============================================================================
// pg_list_sequences
// =============================================================================

export function createListSequencesTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_list_sequences",
    description: "List all sequences in the database.",
    group: "schema",
    inputSchema: z
      .object({
        schema: z.string().optional(),
        limit: z
          .number()
          .optional()
          .describe(
            "Maximum number of sequences to return (default: 50). Use 0 for all.",
          ),
      })
      .default({}),
    outputSchema: ListSequencesOutputSchema,
    annotations: readOnly("List Sequences"),
    icons: getToolIcons("schema", readOnly("List Sequences")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as {
        schema?: string;
        limit?: number;
      };
      const queryParams: unknown[] = [];

      // Validate schema existence when filtering by schema
      if (parsed.schema) {
        const schemaCheck = await adapter.executeQuery(
          `SELECT 1 FROM pg_namespace WHERE nspname = $1`,
          [parsed.schema],
        );
        if ((schemaCheck.rows?.length ?? 0) === 0) {
          return {
            success: false,
            error: `Schema '${parsed.schema}' does not exist. Use pg_list_schemas to see available schemas.`,
          };
        }
      }

      const schemaClause = parsed.schema
        ? (queryParams.push(parsed.schema),
          `AND n.nspname = $${String(queryParams.length)}`)
        : "";

      // Default limit: 50, 0 = no limit
      const limitVal = parsed.limit ?? 50;
      const limitClause = limitVal > 0 ? `LIMIT ${String(limitVal + 1)}` : "";

      // Use subquery for owned_by to avoid duplicate rows from JOINs
      const sql = `SELECT n.nspname as schema, c.relname as name,
                        (SELECT tc.relname || '.' || a.attname
                         FROM pg_depend d
                         JOIN pg_class tc ON tc.oid = d.refobjid
                         JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = d.refobjsubid
                         WHERE d.objid = c.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'a'
                         LIMIT 1) as owned_by
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind = 'S'
                        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ${schemaClause}
                        ORDER BY n.nspname, c.relname
                        ${limitClause}`;

      const result =
        queryParams.length > 0
          ? await adapter.executeQuery(sql, queryParams)
          : await adapter.executeQuery(sql);
      let sequences = result.rows ?? [];

      // Check if there are more results than the limit
      const hasMore = limitVal > 0 && sequences.length > limitVal;
      if (hasMore) {
        sequences = sequences.slice(0, limitVal);
      }

      const response: Record<string, unknown> = {
        sequences,
        count: sequences.length,
      };

      // Always include truncated field for consistent response structure
      response["truncated"] = hasMore;
      if (hasMore) {
        // Get total count
        const countParams: unknown[] = [];
        const countSchemaClause = parsed.schema
          ? (countParams.push(parsed.schema),
            `AND n.nspname = $${String(countParams.length)}`)
          : "";
        const countSql = `SELECT COUNT(*)::int as total FROM pg_class c
                          JOIN pg_namespace n ON n.oid = c.relnamespace
                          WHERE c.relkind = 'S'
                          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                          ${countSchemaClause}`;
        const countResult =
          countParams.length > 0
            ? await adapter.executeQuery(countSql, countParams)
            : await adapter.executeQuery(countSql);
        response["totalCount"] =
          countResult.rows?.[0]?.["total"] ?? sequences.length;
        response["note"] =
          `Results limited to ${String(limitVal)}. Use 'limit: 0' for all sequences.`;
      }

      return response;
    },
  };
}

// =============================================================================
// pg_create_sequence
// =============================================================================

export function createCreateSequenceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_create_sequence",
    description:
      "Create a new sequence with optional START, INCREMENT, MIN/MAX, CACHE, CYCLE, and OWNED BY.",
    group: "schema",
    inputSchema: CreateSequenceSchemaBase,
    outputSchema: CreateSequenceOutputSchema,
    annotations: write("Create Sequence"),
    icons: getToolIcons("schema", write("Create Sequence")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const {
          name,
          schema,
          start,
          increment,
          minValue,
          maxValue,
          cache,
          cycle,
          ownedBy,
          ifNotExists,
        } = CreateSequenceSchema.parse(params);

        const schemaName = schema ?? "public";

        // Check if sequence already exists when ifNotExists is true
        let alreadyExisted: boolean | undefined;
        if (ifNotExists === true) {
          const existsResult = await adapter.executeQuery(
            `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = $1 AND c.relname = $2`,
            [schemaName, name],
          );
          alreadyExisted = (existsResult.rows?.length ?? 0) > 0;
        }

        const schemaPrefix = schema ? `${sanitizeIdentifier(schema)}.` : "";
        const ifNotExistsClause = ifNotExists === true ? "IF NOT EXISTS " : "";
        const parts = [
          `CREATE SEQUENCE ${ifNotExistsClause}${schemaPrefix}${sanitizeIdentifier(name)}`,
        ];

        if (start !== undefined) parts.push(`START WITH ${String(start)}`);
        if (increment !== undefined)
          parts.push(`INCREMENT BY ${String(increment)}`);
        if (minValue !== undefined) parts.push(`MINVALUE ${String(minValue)}`);
        if (maxValue !== undefined) parts.push(`MAXVALUE ${String(maxValue)}`);
        if (cache !== undefined) parts.push(`CACHE ${String(cache)}`);
        if (cycle) parts.push("CYCLE");
        if (ownedBy !== undefined) {
          // Validate and sanitize ownedBy: table.column or schema.table.column
          const ownedByParts = ownedBy.split(".");
          if (ownedByParts.length < 2 || ownedByParts.length > 3) {
            return {
              success: false,
              error: `Invalid ownedBy format: '${ownedBy}'. Expected 'table.column' or 'schema.table.column'.`,
            };
          }
          const sanitizedOwnedBy = ownedByParts
            .map((p) => sanitizeIdentifier(p))
            .join(".");
          parts.push(`OWNED BY ${sanitizedOwnedBy}`);
        }

        const sql = parts.join(" ");
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_create_sequence",
              objectType: "sequence",
              ...(schema !== undefined && { schema }),
            }),
          };
        }

        const result: Record<string, unknown> = {
          success: true,
          sequence: `${schemaName}.${name}`,
          ifNotExists: ifNotExists ?? false,
        };
        if (alreadyExisted !== undefined) {
          result["alreadyExisted"] = alreadyExisted;
        }
        return result;
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_create_sequence" }),
        };
      }
    },
  };
}

// =============================================================================
// pg_drop_sequence
// =============================================================================

// DropSequenceSchema is now imported from schemas/schema-mgmt.js

export function createDropSequenceTool(
  adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_drop_sequence",
    description: "Drop a sequence. Supports IF EXISTS and CASCADE options.",
    group: "schema",
    inputSchema: DropSequenceSchemaBase,
    outputSchema: DropSequenceOutputSchema,
    annotations: destructive("Drop Sequence"),
    icons: getToolIcons("schema", destructive("Drop Sequence")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const { name, schema, ifExists, cascade } =
          DropSequenceSchema.parse(params);

        const schemaName = schema ?? "public";

        // Check if sequence exists before dropping (for accurate response)
        const existsResult = await adapter.executeQuery(
          `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = $1 AND c.relname = $2`,
          [schemaName, name],
        );
        const existed = (existsResult.rows?.length ?? 0) > 0;

        const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
        const cascadeClause = cascade === true ? " CASCADE" : "";

        const sql = `DROP SEQUENCE ${ifExistsClause}"${schemaName}"."${name}"${cascadeClause}`;
        try {
          await adapter.executeQuery(sql);
        } catch (error: unknown) {
          return {
            success: false,
            error: formatPostgresError(error, {
              tool: "pg_drop_sequence",
              ...(schema !== undefined && { schema }),
            }),
          };
        }
        return { success: true, sequence: `${schemaName}.${name}`, existed };
      } catch (error: unknown) {
        return {
          success: false,
          error:
            error instanceof z.ZodError
              ? error.issues.map((i) => i.message).join("; ")
              : formatPostgresError(error, { tool: "pg_drop_sequence" }),
        };
      }
    },
  };
}
