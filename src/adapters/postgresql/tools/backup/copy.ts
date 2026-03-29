/**
 * PostgreSQL Backup Tools - COPY Operations
 *
 * COPY-based data export and import tools.
 * 2 tools total.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly, write } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  buildProgressContext,
  sendProgress,
} from "../../../../utils/progress-utils.js";
import {
  CopyExportSchema,
  CopyExportSchemaBase,
  // Output schemas
  CopyExportOutputSchema,
  CopyImportOutputSchema,
} from "../../schemas/index.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";

export function createCopyExportTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_copy_export",
    description:
      "Export query results using COPY TO. Use query/sql for custom query or table for SELECT *.",
    group: "backup",
    inputSchema: CopyExportSchemaBase, // Use base schema for MCP visibility
    outputSchema: CopyExportOutputSchema,
    annotations: readOnly("Copy Export"),
    icons: getToolIcons("backup", readOnly("Copy Export")),
    handler: async (params: unknown, context: RequestContext) => {
      try {
        const progress = buildProgressContext(context);
        await sendProgress(progress, 1, 3, "Preparing COPY export...");

        const {
          query,
          format,
          header,
          delimiter,
          conflictWarning,
          effectiveLimit,
        } = CopyExportSchema.parse(params); // Use transform for validation

        const options: string[] = [];
        options.push(`FORMAT ${format ?? "csv"}`);
        if (header !== false) options.push("HEADER");
        if (delimiter) options.push(`DELIMITER '${delimiter}'`);

        const copyCommand = `COPY (${query}) TO STDOUT WITH (${options.join(", ")})`;
        void copyCommand;

        await sendProgress(progress, 2, 3, "Executing query...");
        const result = await adapter.executeQuery(query);

        // Handle CSV format (default)
        if (format === "csv" || format === undefined) {
          if (result.rows === undefined || result.rows.length === 0) {
            return {
              data: "",
              rowCount: 0,
              note: "Query returned no rows. Headers omitted for empty results.",
              ...(conflictWarning !== undefined
                ? { warning: conflictWarning }
                : {}),
            };
          }

          const firstRowData = result.rows[0];
          if (firstRowData === undefined) {
            return {
              data: "",
              rowCount: 0,
              note: "Query returned no rows. Headers omitted for empty results.",
              ...(conflictWarning !== undefined
                ? { warning: conflictWarning }
                : {}),
            };
          }
          const headers = Object.keys(firstRowData);
          const delim = delimiter ?? ",";
          const lines: string[] = [];

          if (header !== false) {
            lines.push(headers.join(delim));
          }

          for (const row of result.rows) {
            lines.push(
              headers
                .map((h) => {
                  const v = row[h];
                  if (v === null) return "";
                  if (v instanceof Date) return v.toISOString();
                  if (typeof v === "object") return JSON.stringify(v);
                  if (
                    typeof v !== "string" &&
                    typeof v !== "number" &&
                    typeof v !== "boolean"
                  ) {
                    return JSON.stringify(v);
                  }
                  const s = String(v);
                  return s.includes(delim) ||
                    s.includes('"') ||
                    s.includes("\n")
                    ? `"${s.replace(/"/g, '""')}"`
                    : s;
                })
                .join(delim),
            );
          }

          // Mark as truncated if any limit was applied AND rows returned equals that limit
          // This indicates there are likely more rows available
          const isTruncated =
            effectiveLimit !== undefined &&
            result.rows.length === effectiveLimit;

          await sendProgress(progress, 3, 3, "Export complete");

          return {
            data: lines.join("\n"),
            rowCount: result.rows.length,
            ...(isTruncated ? { truncated: true, limit: effectiveLimit } : {}),
            ...(conflictWarning !== undefined
              ? { warning: conflictWarning }
              : {}),
          };
        }

        // Handle TEXT format - tab-delimited with \N for NULLs
        if (format === "text") {
          if (result.rows === undefined || result.rows.length === 0) {
            return {
              data: "",
              rowCount: 0,
              note: "Query returned no rows. Headers omitted for empty results.",
              ...(conflictWarning !== undefined
                ? { warning: conflictWarning }
                : {}),
            };
          }

          const firstRowData = result.rows[0];
          if (firstRowData === undefined) {
            return {
              data: "",
              rowCount: 0,
              note: "Query returned no rows. Headers omitted for empty results.",
              ...(conflictWarning !== undefined
                ? { warning: conflictWarning }
                : {}),
            };
          }
          const headers = Object.keys(firstRowData);
          const delim = delimiter ?? "\t";
          const lines: string[] = [];

          if (header !== false) {
            lines.push(headers.join(delim));
          }

          for (const row of result.rows) {
            lines.push(
              headers
                .map((h) => {
                  const v = row[h];
                  if (v === null) return "\\N"; // PostgreSQL NULL representation in text format
                  if (v instanceof Date) return v.toISOString();
                  if (typeof v === "object") return JSON.stringify(v);
                  if (
                    typeof v === "string" ||
                    typeof v === "number" ||
                    typeof v === "boolean"
                  ) {
                    return String(v);
                  }
                  // Fallback for any other type
                  return JSON.stringify(v);
                })
                .join(delim),
            );
          }

          // Mark as truncated if any limit was applied AND rows returned equals that limit
          // This indicates there are likely more rows available
          const isTruncated =
            effectiveLimit !== undefined &&
            result.rows.length === effectiveLimit;

          await sendProgress(progress, 3, 3, "Export complete");

          return {
            data: lines.join("\n"),
            rowCount: result.rows.length,
            ...(isTruncated ? { truncated: true, limit: effectiveLimit } : {}),
            ...(conflictWarning !== undefined
              ? { warning: conflictWarning }
              : {}),
          };
        }

        // Handle BINARY format - not supported via MCP protocol
        // Binary data cannot be safely serialized to JSON without corruption
        throw new Error(
          'Binary format is not supported via MCP protocol. Use format: "csv" or "text" instead. For binary export, use pg_dump_schema to generate a pg_dump command.',
        );
      } catch (error: unknown) {
        return formatHandlerErrorResponse(error, { tool: "pg_copy_export" });
      }
    },
  };
}

export function createCopyImportTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_copy_import",
    description: "Generate COPY FROM command for importing data.",
    group: "backup",
    inputSchema: z.object({
      table: z.string().optional(),
      schema: z.string().optional(),
      filePath: z
        .string()
        .optional()
        .describe("Path to import file (default: /path/to/file.csv)"),
      format: z.enum(["csv", "text", "binary"]).optional(),
      header: z.boolean().optional(),
      delimiter: z.string().optional(),
      columns: z.array(z.string()).optional(),
    }),
    outputSchema: CopyImportOutputSchema,
    annotations: write("Copy Import"),
    icons: getToolIcons("backup", write("Copy Import")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        return Promise.resolve()
          .then(() => {
            const rawParams = params as {
              table?: string;
              tableName?: string; // Alias for table
              schema?: string;
              filePath?: string;
              format?: string;
              header?: boolean;
              delimiter?: string;
              columns?: string[];
            };

            // Resolve tableName alias to table
            const tableValue = rawParams.table ?? rawParams.tableName;
            if (!tableValue) {
              throw new Error("table parameter is required");
            }

            const parsed = {
              ...rawParams,
              table: tableValue,
            };

            // Parse schema.table format (e.g., 'public.users' -> schema='public', table='users')
            // If table contains a dot, always parse it as schema.table (embedded schema takes priority)
            let tableNamePart = parsed.table;
            let schemaNamePart = parsed.schema;

            if (parsed.table.includes(".")) {
              const parts = parsed.table.split(".");
              if (parts.length === 2 && parts[0] && parts[1]) {
                schemaNamePart = parts[0];
                tableNamePart = parts[1];
              }
            }

            const tableName = sanitizeTableName(tableNamePart, schemaNamePart);

            const columnClause =
              parsed.columns !== undefined && parsed.columns.length > 0
                ? ` (${sanitizeIdentifiers(parsed.columns).join(", ")})`
                : "";

            const options: string[] = [];
            options.push(`FORMAT ${parsed.format ?? "csv"}`);
            if (parsed.header) options.push("HEADER");
            if (parsed.delimiter)
              options.push(`DELIMITER '${parsed.delimiter}'`);

            // Use provided filePath or generate placeholder with appropriate extension
            const ext =
              parsed.format === "text"
                ? "txt"
                : parsed.format === "binary"
                  ? "bin"
                  : "csv";
            const filePath = parsed.filePath ?? `/path/to/file.${ext}`;

            return {
              command: `COPY ${tableName}${columnClause} FROM '${filePath}' WITH (${options.join(", ")})`,
              stdinCommand: `COPY ${tableName}${columnClause} FROM STDIN WITH (${options.join(", ")})`,
              notes: "Use \\copy in psql for client-side files",
            };
          })
          .catch((error: unknown) => formatHandlerErrorResponse(error, { tool: "pg_copy_import" }));
      } catch (error: unknown) {
        return Promise.resolve(formatHandlerErrorResponse(error, { tool: "pg_copy_import" }));
      }
    },
  };
}
