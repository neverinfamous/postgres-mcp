/**
 * PostgreSQL Schema Management Tools
 *
 * Schema DDL operations: schemas, sequences, views, functions, triggers.
 * 12 tools total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type { ToolDefinition, RequestContext } from "../../../types/index.js";
import { z } from "zod";
import { readOnly, write, destructive } from "../../../utils/annotations.js";
import { getToolIcons } from "../../../utils/icons.js";
import { sanitizeIdentifier } from "../../../utils/identifiers.js";
import { parsePostgresError } from "./core/error-helpers.js";
import {
  CreateSchemaSchema,
  DropSchemaSchema,
  CreateSequenceSchemaBase,
  CreateSequenceSchema,
  DropSequenceSchemaBase,
  DropSequenceSchema,
  CreateViewSchemaBase,
  CreateViewSchema,
  DropViewSchemaBase,
  DropViewSchema,
  ListFunctionsSchemaBase,
  ListFunctionsSchema,
  // Output schemas
  ListSchemasOutputSchema,
  CreateSchemaOutputSchema,
  DropSchemaOutputSchema,
  ListSequencesOutputSchema,
  CreateSequenceOutputSchema,
  DropSequenceOutputSchema,
  ListViewsOutputSchema,
  CreateViewOutputSchema,
  DropViewOutputSchema,
  ListFunctionsOutputSchema,
  ListTriggersOutputSchema,
  ListConstraintsOutputSchema,
} from "../schemas/index.js";

/**
 * Well-known aliases for PostgreSQL extension names.
 * Users naturally write "pgvector" but the extension registers as "vector".
 * This map normalizes user input so exclude filters work correctly.
 */
const EXTENSION_ALIASES: Record<string, string> = {
  pgvector: "vector",
  partman: "pg_partman",
  fuzzymatch: "fuzzystrmatch",
  fuzzy: "fuzzystrmatch",
};

/**
 * Get all schema management tools
 */
export function getSchemaTools(adapter: PostgresAdapter): ToolDefinition[] {
  return [
    createListSchemasTool(adapter),
    createCreateSchemaTool(adapter),
    createDropSchemaTool(adapter),
    createListSequencesTool(adapter),
    createCreateSequenceTool(adapter),
    createDropSequenceTool(adapter),
    createListViewsTool(adapter),
    createCreateViewTool(adapter),
    createDropViewTool(adapter),
    createListFunctionsTool(adapter),
    createListTriggersTool(adapter),
    createListConstraintsTool(adapter),
  ];
}

function createListSchemasTool(adapter: PostgresAdapter): ToolDefinition {
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

function createCreateSchemaTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_create_schema",
    description: "Create a new schema.",
    group: "schema",
    inputSchema: CreateSchemaSchema,
    outputSchema: CreateSchemaOutputSchema,
    annotations: write("Create Schema"),
    icons: getToolIcons("schema", write("Create Schema")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { name, authorization, ifNotExists } =
        CreateSchemaSchema.parse(params);

      // Check if schema already exists when ifNotExists is true
      let alreadyExisted: boolean | undefined;
      if (ifNotExists === true) {
        const existsResult = await adapter.executeQuery(
          `SELECT 1 FROM pg_namespace WHERE nspname = '${name}'`,
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
        throw parsePostgresError(error, {
          tool: "pg_create_schema",
          schema: name,
        });
      }

      const result: Record<string, unknown> = { success: true, schema: name };
      if (alreadyExisted !== undefined) {
        result["alreadyExisted"] = alreadyExisted;
      }
      return result;
    },
  };
}

function createDropSchemaTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_schema",
    description: "Drop a schema (optionally with all objects).",
    group: "schema",
    inputSchema: DropSchemaSchema,
    outputSchema: DropSchemaOutputSchema,
    annotations: destructive("Drop Schema"),
    icons: getToolIcons("schema", destructive("Drop Schema")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { name, cascade, ifExists } = DropSchemaSchema.parse(params);

      // Check if schema exists before dropping (for accurate response)
      const existsResult = await adapter.executeQuery(
        `SELECT 1 FROM pg_namespace WHERE nspname = '${name}'`,
      );
      const existed = (existsResult.rows?.length ?? 0) > 0;

      const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
      const cascadeClause = cascade === true ? " CASCADE" : "";
      const schemaName = sanitizeIdentifier(name);

      const sql = `DROP SCHEMA ${ifExistsClause}${schemaName}${cascadeClause}`;
      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        throw parsePostgresError(error, {
          tool: "pg_drop_schema",
          schema: name,
        });
      }
      return {
        success: true,
        schema: name,
        existed,
        note: existed
          ? undefined
          : `Schema '${name}' did not exist (ifExists: true)`,
      };
    },
  };
}

function createListSequencesTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_sequences",
    description: "List all sequences in the database.",
    group: "schema",
    inputSchema: z
      .object({
        schema: z.string().optional(),
      })
      .default({}),
    outputSchema: ListSequencesOutputSchema,
    annotations: readOnly("List Sequences"),
    icons: getToolIcons("schema", readOnly("List Sequences")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as { schema?: string };
      const schemaClause = parsed.schema
        ? `AND n.nspname = '${parsed.schema}'`
        : "";

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
                        ORDER BY n.nspname, c.relname`;

      const result = await adapter.executeQuery(sql);
      return { sequences: result.rows, count: result.rows?.length ?? 0 };
    },
  };
}

function createCreateSequenceTool(adapter: PostgresAdapter): ToolDefinition {
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
          `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = '${schemaName}' AND c.relname = '${name}'`,
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
      if (ownedBy !== undefined) parts.push(`OWNED BY ${ownedBy}`);

      const sql = parts.join(" ");
      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        throw parsePostgresError(error, {
          tool: "pg_create_sequence",
          ...(schema !== undefined && { schema }),
        });
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
    },
  };
}

// DropSequenceSchema is now imported from schemas/schema-mgmt.js

function createDropSequenceTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_sequence",
    description: "Drop a sequence. Supports IF EXISTS and CASCADE options.",
    group: "schema",
    inputSchema: DropSequenceSchemaBase,
    outputSchema: DropSequenceOutputSchema,
    annotations: destructive("Drop Sequence"),
    icons: getToolIcons("schema", destructive("Drop Sequence")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { name, schema, ifExists, cascade } =
        DropSequenceSchema.parse(params);

      const schemaName = schema ?? "public";

      // Check if sequence exists before dropping (for accurate response)
      const existsResult = await adapter.executeQuery(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND n.nspname = '${schemaName}' AND c.relname = '${name}'`,
      );
      const existed = (existsResult.rows?.length ?? 0) > 0;

      const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
      const cascadeClause = cascade === true ? " CASCADE" : "";

      const sql = `DROP SEQUENCE ${ifExistsClause}"${schemaName}"."${name}"${cascadeClause}`;
      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        throw parsePostgresError(error, {
          tool: "pg_drop_sequence",
          ...(schema !== undefined && { schema }),
        });
      }
      return { success: true, sequence: `${schemaName}.${name}`, existed };
    },
  };
}

function createListViewsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_views",
    description: "List all views and materialized views.",
    group: "schema",
    inputSchema: z.object({
      schema: z.string().optional(),
      includeMaterialized: z.boolean().optional(),
      truncateDefinition: z
        .number()
        .optional()
        .describe(
          "Max length for view definitions (default: 500). Use 0 for no truncation.",
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Maximum number of views to return (default: 50). Use 0 for all views.",
        ),
    }),
    outputSchema: ListViewsOutputSchema,
    annotations: readOnly("List Views"),
    icons: getToolIcons("schema", readOnly("List Views")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as {
        schema?: string;
        includeMaterialized?: boolean;
        truncateDefinition?: number;
        limit?: number;
      };
      const schemaClause = parsed.schema
        ? `AND n.nspname = '${parsed.schema}'`
        : "";
      const kindClause =
        parsed.includeMaterialized !== false ? "IN ('v', 'm')" : "= 'v'";

      // Default truncation: 500 chars, 0 = no truncation
      const truncateLimit = parsed.truncateDefinition ?? 500;

      // Default limit: 50, 0 = no limit
      const limitVal = parsed.limit ?? 50;
      const limitClause = limitVal > 0 ? `LIMIT ${String(limitVal + 1)}` : "";

      const sql = `SELECT n.nspname as schema, c.relname as name,
                        CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view' END as type,
                        TRIM(pg_get_viewdef(c.oid, true)) as definition
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind ${kindClause}
                        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
                        ${schemaClause}
                        ORDER BY n.nspname, c.relname
                        ${limitClause}`;

      const result = await adapter.executeQuery(sql);
      let views = result.rows ?? [];

      // Check if there are more results than the limit
      const hasMore = limitVal > 0 && views.length > limitVal;
      if (hasMore) {
        views = views.slice(0, limitVal);
      }

      // Truncate definitions if limit is set
      let truncatedCount = 0;
      if (truncateLimit > 0) {
        views = views.map((v: Record<string, unknown>) => {
          const def = v["definition"];
          if (typeof def === "string" && def.length > truncateLimit) {
            truncatedCount++;
            return {
              ...v,
              definition: def.slice(0, truncateLimit) + "...",
              definitionTruncated: true,
            };
          }
          return v;
        });
      }

      const hasMatViews = views.some(
        (v: Record<string, unknown>) => v["type"] === "materialized_view",
      );

      const response: Record<string, unknown> = {
        views,
        count: views.length,
        hasMatViews,
      };
      if (truncatedCount > 0) {
        response["truncatedDefinitions"] = truncatedCount;
      }
      // Always include truncated field for consistent response structure
      response["truncated"] = hasMore;
      if (hasMore) {
        response["note"] =
          `Results limited to ${String(limitVal)}. Use 'limit: 0' for all views.`;
      }
      return response;
    },
  };
}

function createCreateViewTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_create_view",
    description: "Create a view or materialized view.",
    group: "schema",
    inputSchema: CreateViewSchemaBase,
    outputSchema: CreateViewOutputSchema,
    annotations: write("Create View"),
    icons: getToolIcons("schema", write("Create View")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { name, schema, query, materialized, orReplace, checkOption } =
        CreateViewSchema.parse(params);

      const schemaName = schema ?? "public";

      // Check if view already exists when orReplace is true (for informational response)
      let alreadyExisted: boolean | undefined;
      if (orReplace === true) {
        const relkind = materialized === true ? "'m'" : "'v'";
        const existsResult = await adapter.executeQuery(
          `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = ${relkind} AND n.nspname = '${schemaName}' AND c.relname = '${name}'`,
        );
        alreadyExisted = (existsResult.rows?.length ?? 0) > 0;
      }

      const schemaPrefix = schema ? `${sanitizeIdentifier(schema)}.` : "";
      const replaceClause = orReplace && !materialized ? "OR REPLACE " : "";
      const matClause = materialized ? "MATERIALIZED " : "";
      const viewName = sanitizeIdentifier(name);

      // WITH CHECK OPTION clause (not available for materialized views)
      let checkClause = "";
      if (checkOption && checkOption !== "none" && !materialized) {
        checkClause = ` WITH ${checkOption.toUpperCase()} CHECK OPTION`;
      }

      const sql = `CREATE ${replaceClause}${matClause}VIEW ${schemaPrefix}${viewName} AS ${query}${checkClause}`;
      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        throw parsePostgresError(error, {
          tool: "pg_create_view",
          ...(schema !== undefined && { schema }),
        });
      }

      const result: Record<string, unknown> = {
        success: true,
        view: `${schemaName}.${name}`,
        materialized: !!materialized,
      };
      if (alreadyExisted !== undefined) {
        result["alreadyExisted"] = alreadyExisted;
      }
      return result;
    },
  };
}

// DropViewSchema is now imported from schemas/schema-mgmt.js

function createDropViewTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_drop_view",
    description:
      "Drop a view or materialized view. Supports IF EXISTS and CASCADE options.",
    group: "schema",
    inputSchema: DropViewSchemaBase,
    outputSchema: DropViewOutputSchema,
    annotations: destructive("Drop View"),
    icons: getToolIcons("schema", destructive("Drop View")),
    handler: async (params: unknown, _context: RequestContext) => {
      const { name, schema, materialized, ifExists, cascade } =
        DropViewSchema.parse(params);

      const schemaName = schema ?? "public";

      // Check if view exists before dropping (for accurate response)
      const relkind = materialized === true ? "'m'" : "'v'";
      const existsResult = await adapter.executeQuery(
        `SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = ${relkind} AND n.nspname = '${schemaName}' AND c.relname = '${name}'`,
      );
      const existed = (existsResult.rows?.length ?? 0) > 0;

      const matClause = materialized === true ? "MATERIALIZED " : "";
      const ifExistsClause = ifExists === true ? "IF EXISTS " : "";
      const cascadeClause = cascade === true ? " CASCADE" : "";

      const sql = `DROP ${matClause}VIEW ${ifExistsClause}"${schemaName}"."${name}"${cascadeClause}`;
      try {
        await adapter.executeQuery(sql);
      } catch (error: unknown) {
        throw parsePostgresError(error, {
          tool: "pg_drop_view",
          ...(schema !== undefined && { schema }),
        });
      }
      return {
        success: true,
        view: `${schemaName}.${name}`,
        materialized: materialized ?? false,
        existed,
      };
    },
  };
}

function createListFunctionsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_functions",
    description:
      "List user-defined functions with optional filtering. Use exclude (array) to filter out extension functions. Default limit=500 may need increasing for busy databases.",
    group: "schema",
    // Use base schema for MCP visibility - ensures parameters are visible in Direct Tool Calls
    inputSchema: ListFunctionsSchemaBase,
    outputSchema: ListFunctionsOutputSchema,
    annotations: readOnly("List Functions"),
    icons: getToolIcons("schema", readOnly("List Functions")),
    handler: async (params: unknown, _context: RequestContext) => {
      // Use full schema with preprocessing for validation
      const parsed = ListFunctionsSchema.parse(params);
      const conditions: string[] = [
        "n.nspname NOT IN ('pg_catalog', 'information_schema')",
      ];

      if (parsed.schema !== undefined) {
        conditions.push(`n.nspname = '${parsed.schema}'`);
      }

      if (parsed.exclude !== undefined && parsed.exclude.length > 0) {
        // Expand well-known aliases (e.g. "pgvector" -> ["pgvector", "vector"])
        const normalizedExclude = parsed.exclude.flatMap((s) => {
          const alias = EXTENSION_ALIASES[s];
          return alias ? [s, alias] : [s];
        });
        const excludeList = normalizedExclude.map((s) => `'${s}'`).join(", ");
        // Exclude by schema name
        conditions.push(`n.nspname NOT IN (${excludeList})`);
        // Also exclude extension-owned functions (e.g., ltree functions in public schema)
        conditions.push(`NOT EXISTS (
                    SELECT 1 FROM pg_depend d
                    JOIN pg_extension e ON d.refobjid = e.oid
                    WHERE d.objid = p.oid
                    AND d.deptype = 'e'
                    AND e.extname IN (${excludeList})
                )`);
      }

      if (parsed.language !== undefined) {
        conditions.push(`l.lanname = '${parsed.language}'`);
      }

      const limitVal = parsed.limit ?? 500;

      const sql = `SELECT n.nspname as schema, p.proname as name,
                        pg_get_function_arguments(p.oid) as arguments,
                        pg_get_function_result(p.oid) as returns,
                        l.lanname as language,
                        p.provolatile as volatility
                        FROM pg_proc p
                        JOIN pg_namespace n ON n.oid = p.pronamespace
                        JOIN pg_language l ON l.oid = p.prolang
                        WHERE ${conditions.join(" AND ")}
                        ORDER BY n.nspname, p.proname
                        LIMIT ${String(limitVal)}`;

      const result = await adapter.executeQuery(sql);
      return {
        functions: result.rows,
        count: result.rows?.length ?? 0,
        limit: limitVal,
        note:
          (result.rows?.length ?? 0) >= limitVal
            ? `Results limited to ${String(limitVal)}. Use 'limit' param for more, or 'exclude' to filter out extension schemas.`
            : undefined,
      };
    },
  };
}

function createListTriggersTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_triggers",
    description: "List all triggers.",
    group: "schema",
    inputSchema: z.object({
      schema: z.string().optional(),
      table: z.string().optional(),
    }),
    outputSchema: ListTriggersOutputSchema,
    annotations: readOnly("List Triggers"),
    icons: getToolIcons("schema", readOnly("List Triggers")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as { schema?: string; table?: string };
      let whereClause = "n.nspname NOT IN ('pg_catalog', 'information_schema')";
      if (parsed.schema) whereClause += ` AND n.nspname = '${parsed.schema}'`;
      if (parsed.table) whereClause += ` AND c.relname = '${parsed.table}'`;

      const sql = `SELECT n.nspname as schema, c.relname as table_name, t.tgname as name,
                        CASE t.tgtype::int & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END as timing,
                        array_remove(ARRAY[
                            CASE WHEN t.tgtype::int & 4 = 4 THEN 'INSERT' END,
                            CASE WHEN t.tgtype::int & 8 = 8 THEN 'DELETE' END,
                            CASE WHEN t.tgtype::int & 16 = 16 THEN 'UPDATE' END,
                            CASE WHEN t.tgtype::int & 32 = 32 THEN 'TRUNCATE' END
                        ], NULL) as events,
                        p.proname as function_name,
                        t.tgenabled != 'D' as enabled
                        FROM pg_trigger t
                        JOIN pg_class c ON c.oid = t.tgrelid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        JOIN pg_proc p ON p.oid = t.tgfoid
                        WHERE NOT t.tgisinternal
                        AND ${whereClause}
                        ORDER BY n.nspname, c.relname, t.tgname`;

      const result = await adapter.executeQuery(sql);
      return { triggers: result.rows, count: result.rows?.length ?? 0 };
    },
  };
}

function createListConstraintsTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_list_constraints",
    description:
      "List table constraints (primary keys, foreign keys, unique, check).",
    group: "schema",
    inputSchema: z.object({
      table: z.string().optional(),
      schema: z.string().optional(),
      type: z
        .enum(["primary_key", "foreign_key", "unique", "check"])
        .optional(),
    }),
    outputSchema: ListConstraintsOutputSchema,
    annotations: readOnly("List Constraints"),
    icons: getToolIcons("schema", readOnly("List Constraints")),
    handler: async (params: unknown, _context: RequestContext) => {
      const parsed = (params ?? {}) as {
        table?: string;
        schema?: string;
        type?: string;
      };

      let whereClause =
        "n.nspname NOT IN ('pg_catalog', 'information_schema') AND con.contype != 'n'";
      if (parsed.schema) whereClause += ` AND n.nspname = '${parsed.schema}'`;
      if (parsed.table) whereClause += ` AND c.relname = '${parsed.table}'`;
      if (parsed.type) {
        const typeMap: Record<string, string> = {
          primary_key: "p",
          foreign_key: "f",
          unique: "u",
          check: "c",
        };
        whereClause += ` AND con.contype = '${typeMap[parsed.type] ?? ""}'`;
      }

      const sql = `SELECT n.nspname as schema, c.relname as table_name, con.conname as name,
                        CASE con.contype 
                            WHEN 'p' THEN 'primary_key'
                            WHEN 'f' THEN 'foreign_key'
                            WHEN 'u' THEN 'unique'
                            WHEN 'c' THEN 'check'
                            WHEN 'n' THEN 'not_null'
                            ELSE con.contype
                        END as type,
                        pg_get_constraintdef(con.oid) as definition
                        FROM pg_constraint con
                        JOIN pg_class c ON c.oid = con.conrelid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE ${whereClause}
                        ORDER BY n.nspname, c.relname, con.conname`;

      const result = await adapter.executeQuery(sql);
      return { constraints: result.rows, count: result.rows?.length ?? 0 };
    },
  };
}
