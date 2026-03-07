/**
 * PostgreSQL Backup Tools - Dump Operations
 *
 * Core backup tools: dump_table, dump_schema, copy_export, copy_import.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";
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
  DumpSchemaSchema,
  // Output schemas
  DumpTableOutputSchema,
  DumpSchemaOutputSchema,
  CopyExportOutputSchema,
  CopyImportOutputSchema,
} from "../../schemas/index.js";
import { formatPostgresError } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeIdentifiers,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";

export function createDumpTableTool(adapter: PostgresAdapter): ToolDefinition {
  return {
    name: "pg_dump_table",
    description:
      "Generate DDL for a table or sequence. Returns CREATE TABLE for tables, CREATE SEQUENCE for sequences.",
    group: "backup",
    inputSchema: z.object({
      table: z.string().describe("Table or sequence name"),
      schema: z.string().optional().describe("Schema name (default: public)"),
      includeData: z
        .boolean()
        .optional()
        .describe("Include INSERT statements for table data"),
      limit: z.coerce
        .number()
        .optional()
        .describe(
          "Maximum rows to include when includeData is true (default: 500, use 0 for all rows)",
        ),
    }),
    outputSchema: DumpTableOutputSchema,
    annotations: readOnly("Dump Table"),
    icons: getToolIcons("backup", readOnly("Dump Table")),
    handler: async (params: unknown, _context: RequestContext) => {
      try {
        const parsed = params as {
          table: string;
          schema?: string;
          includeData?: boolean;
          limit?: number;
        };

        // Validate required table parameter
        if (!parsed.table || parsed.table.trim() === "") {
          throw new Error("table parameter is required");
        }

        // Parse schema.table format (e.g., 'public.users' -> schema='public', table='users')
        // If table contains a dot, always parse it as schema.table (embedded schema takes priority)
        let tableName = parsed.table;
        let schemaName = parsed.schema ?? "public";

        if (parsed.table.includes(".")) {
          const parts = parsed.table.split(".");
          if (parts.length === 2 && parts[0] && parts[1]) {
            schemaName = parts[0];
            tableName = parts[1];
          }
        }

        // Check if it's a sequence by querying pg_class
        const relkindResult = await adapter.executeQuery(
          `
                SELECT relkind FROM pg_class c
                JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = $1 AND c.relname = $2
            `,
          [schemaName, tableName],
        );
        const relkind = relkindResult.rows?.[0]?.["relkind"];

        // relkind 'S' = sequence
        if (relkind === "S") {
          // Use pg_sequence system catalog (works in all PostgreSQL versions 10+)
          // Fallback to basic DDL if query fails
          try {
            const seqInfo = await adapter.executeQuery(
              `
                        SELECT s.seqstart as start_value, s.seqincrement as increment_by,
                               s.seqmin as min_value, s.seqmax as max_value, s.seqcycle as cycle
                        FROM pg_sequence s
                        JOIN pg_class c ON s.seqrelid = c.oid
                        JOIN pg_namespace n ON c.relnamespace = n.oid
                        WHERE n.nspname = $1 AND c.relname = $2
                    `,
              [schemaName, tableName],
            );
            const seq = seqInfo.rows?.[0];
            if (seq !== undefined) {
              const startVal =
                typeof seq["start_value"] === "number" ||
                typeof seq["start_value"] === "bigint"
                  ? String(seq["start_value"])
                  : null;
              const incrVal =
                typeof seq["increment_by"] === "number" ||
                typeof seq["increment_by"] === "bigint"
                  ? Number(seq["increment_by"])
                  : null;
              const minVal =
                typeof seq["min_value"] === "number" ||
                typeof seq["min_value"] === "bigint"
                  ? String(seq["min_value"])
                  : null;
              const maxVal =
                typeof seq["max_value"] === "number" ||
                typeof seq["max_value"] === "bigint"
                  ? String(seq["max_value"])
                  : null;

              const startValue = startVal !== null ? ` START ${startVal}` : "";
              const increment =
                incrVal !== null && incrVal !== 1
                  ? ` INCREMENT ${String(incrVal)}`
                  : "";
              const minValue = minVal !== null ? ` MINVALUE ${minVal}` : "";
              const maxValue = maxVal !== null ? ` MAXVALUE ${maxVal}` : "";
              const cycle = seq["cycle"] === true ? " CYCLE" : "";
              const ddl = `CREATE SEQUENCE ${sanitizeTableName(tableName, schemaName)}${startValue}${increment}${minValue}${maxValue}${cycle};`;
              return {
                ddl,
                type: "sequence",
                note: "Use pg_list_sequences to see all sequences.",
                ...(parsed.includeData === true && {
                  warning:
                    "includeData is ignored for sequences - sequences have no row data to export",
                }),
              };
            }
          } catch {
            // Query failed, use basic DDL
          }
          // Fallback if pg_sequence query fails
          return {
            ddl: `CREATE SEQUENCE ${sanitizeTableName(tableName, schemaName)};`,
            type: "sequence",
            note: "Basic CREATE SEQUENCE. Use pg_list_sequences for details.",
            ...(parsed.includeData === true && {
              warning:
                "includeData is ignored for sequences - sequences have no row data to export",
            }),
          };
        }

        // relkind 'v' = view, 'm' = materialized view
        if (relkind === "v" || relkind === "m") {
          try {
            const viewDefResult = await adapter.executeQuery(
              `
                        SELECT definition FROM pg_views
                        WHERE schemaname = $1 AND viewname = $2
                    `,
              [schemaName, tableName],
            );
            const definition = viewDefResult.rows?.[0]?.["definition"];
            if (typeof definition === "string") {
              const createType = relkind === "m" ? "MATERIALIZED VIEW" : "VIEW";
              const ddl = `CREATE ${createType} ${sanitizeTableName(tableName, schemaName)} AS\n${definition.trim()}`;
              return {
                ddl,
                type: relkind === "m" ? "materialized_view" : "view",
                note: `Use pg_list_views to see all views.`,
              };
            }
          } catch {
            // Query failed, use basic DDL
          }
          // Fallback for views
          const createType = relkind === "m" ? "MATERIALIZED VIEW" : "VIEW";
          return {
            ddl: `-- Unable to retrieve ${createType.toLowerCase()} definition\nCREATE ${createType} ${sanitizeTableName(tableName, schemaName)} AS SELECT ...;`,
            type: relkind === "m" ? "materialized_view" : "view",
            note: "View definition could not be retrieved. Use pg_list_views for details.",
          };
        }

        // Check if it's a partitioned table (relkind 'p') and get partition info
        let partitionClause = "";
        const isPartitionedTable = relkind === "p";

        if (isPartitionedTable) {
          try {
            // Query pg_partitioned_table to get partition strategy and key columns
            const partInfo = await adapter.executeQuery(
              `
            SELECT pt.partstrat,
                   array_agg(a.attname ORDER BY partattrs.ord) as partition_columns
            FROM pg_partitioned_table pt
            JOIN pg_class c ON pt.partrelid = c.oid
            JOIN pg_namespace n ON c.relnamespace = n.oid
            CROSS JOIN LATERAL unnest(pt.partattrs) WITH ORDINALITY AS partattrs(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = partattrs.attnum
            WHERE n.nspname = $1 AND c.relname = $2
            GROUP BY pt.partstrat
          `,
              [schemaName, tableName],
            );

            const partRow = partInfo.rows?.[0];
            if (partRow) {
              const strategy = partRow["partstrat"];
              const columns = partRow["partition_columns"];

              // Map strategy code to keyword
              const strategyMap: Record<string, string> = {
                r: "RANGE",
                l: "LIST",
                h: "HASH",
              };
              const strategyKeyword =
                typeof strategy === "string"
                  ? (strategyMap[strategy] ?? "RANGE")
                  : "RANGE";

              // Build column list - PostgreSQL returns array_agg as string like "{col1,col2}"
              let columnList = "";
              if (Array.isArray(columns)) {
                columnList = columns
                  .map((c) => sanitizeIdentifier(String(c)))
                  .join(", ");
              } else if (typeof columns === "string") {
                // Parse PostgreSQL array literal format: "{col1,col2}" -> ["col1", "col2"]
                const parsed = columns
                  .replace(/^\{/, "")
                  .replace(/\}$/, "")
                  .split(",")
                  .filter((c) => c.length > 0);
                columnList = parsed
                  .map((c) => sanitizeIdentifier(c.trim()))
                  .join(", ");
              }

              if (columnList) {
                partitionClause = ` PARTITION BY ${strategyKeyword} (${columnList})`;
              }
            }
          } catch {
            // Partition info query failed, continue without partition clause
          }
        }

        const tableInfo = await adapter.describeTable(tableName, schemaName);

        const columns =
          tableInfo.columns
            ?.map((col) => {
              let def = `    ${sanitizeIdentifier(col.name)} ${col.type}`;
              if (col.defaultValue !== undefined && col.defaultValue !== null) {
                let defaultStr: string;
                if (typeof col.defaultValue === "object") {
                  defaultStr = JSON.stringify(col.defaultValue);
                } else if (
                  typeof col.defaultValue === "string" ||
                  typeof col.defaultValue === "number" ||
                  typeof col.defaultValue === "boolean"
                ) {
                  defaultStr = String(col.defaultValue);
                } else {
                  defaultStr = JSON.stringify(col.defaultValue);
                }
                def += ` DEFAULT ${defaultStr}`;
              }
              if (!col.nullable) def += " NOT NULL";
              return def;
            })
            .join(",\n") ?? "";

        const createTable = `CREATE TABLE ${sanitizeTableName(tableName, schemaName)} (\n${columns}\n)${partitionClause};`;

        const result: {
          ddl: string;
          type?: string;
          insertStatements?: string;
          note: string;
        } = {
          ddl: createTable,
          type: isPartitionedTable ? "partitioned_table" : "table",
          note: isPartitionedTable
            ? "For partition children use pg_list_partitions, for indexes use pg_get_indexes, for constraints use pg_get_constraints."
            : "Basic CREATE TABLE only. For indexes use pg_get_indexes, for constraints use pg_get_constraints.",
        };

        if (parsed.includeData) {
          // Default limit is 500 to prevent large payloads, 0 means no limit
          const effectiveLimit =
            parsed.limit === 0 ? null : (parsed.limit ?? 500);
          const limitClause =
            effectiveLimit !== null ? ` LIMIT ${String(effectiveLimit)}` : "";
          const dataResult = await adapter.executeQuery(
            `SELECT * FROM ${sanitizeTableName(tableName, schemaName)}${limitClause}`,
          );
          if (dataResult.rows !== undefined && dataResult.rows.length > 0) {
            const firstRow = dataResult.rows[0];
            if (firstRow === undefined) return result;
            const cols = Object.keys(firstRow)
              .map((c) => sanitizeIdentifier(c))
              .join(", ");
            const inserts = dataResult.rows
              .map((row) => {
                const vals = Object.entries(row)
                  .map(([, value]) => {
                    if (value === null) return "NULL";
                    // Handle Date objects - format as PostgreSQL timestamp
                    if (value instanceof Date) {
                      const iso = value.toISOString();
                      // Convert ISO 8601 to PostgreSQL format: 'YYYY-MM-DD HH:MM:SS.mmm'
                      const pgTimestamp = iso
                        .replace("T", " ")
                        .replace("Z", "");
                      return `'${pgTimestamp}'`;
                    }
                    if (typeof value === "string") {
                      // Escape backslashes first, then single quotes (PostgreSQL string literal escaping)
                      const escaped = value
                        .replace(/\\/g, "\\\\")
                        .replace(/'/g, "''");
                      // Check if string looks like an ISO timestamp
                      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                        // Convert ISO format to PostgreSQL format
                        const pgTimestamp = value
                          .replace("T", " ")
                          .replace("Z", "")
                          .replace(/\.\d+$/, "");
                        return `'${pgTimestamp.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
                      }
                      return `'${escaped}'`;
                    }
                    if (typeof value === "number" || typeof value === "boolean")
                      return String(value);
                    // For objects (JSONB, arrays), use PostgreSQL JSONB literal
                    return `'${JSON.stringify(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'::jsonb`;
                  })
                  .join(", ");
                return `INSERT INTO ${sanitizeTableName(tableName, schemaName)} (${cols}) VALUES (${vals});`;
              })
              .join("\n");
            result.insertStatements = inserts;
          }
        }

        return result;
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_dump_table" }),
        };
      }
    },
  };
}

export function createDumpSchemaTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_dump_schema",
    description: "Get the pg_dump command for a schema or database.",
    group: "backup",
    inputSchema: DumpSchemaSchema,
    outputSchema: DumpSchemaOutputSchema,
    annotations: readOnly("Dump Schema"),
    icons: getToolIcons("backup", readOnly("Dump Schema")),
    handler: (params: unknown, _context: RequestContext) => {
      const { table, schema, filename } = DumpSchemaSchema.parse(params);

      let command = "pg_dump";
      command += " --format=custom";
      command += " --verbose";

      if (schema) {
        command += ` --schema="${schema}"`;
      }
      if (table) {
        command += ` --table="${table}"`;
      }

      // Warn if filename ends with .sql since custom format is binary
      const outputFilename = filename ?? "backup.dump";
      const sqlExtWarning = outputFilename.endsWith(".sql")
        ? "Warning: Using .sql extension with --format=custom produces binary output. Use .dump extension or --format=plain for SQL text output."
        : undefined;

      command += ` --file="${outputFilename}"`;
      command += " $POSTGRES_CONNECTION_STRING";

      return Promise.resolve({
        command,
        ...(schema !== undefined &&
          table !== undefined && {
            warning:
              "Both --schema and --table specified. The --table flag may match tables in other schemas if not schema-qualified.",
          }),
        ...(sqlExtWarning !== undefined && { formatWarning: sqlExtWarning }),
        notes: [
          "Replace $POSTGRES_CONNECTION_STRING with your connection string",
          "Use --format=plain for SQL output (recommended for .sql extension)",
          "Add --data-only to exclude schema",
          "Add --schema-only to exclude data",
        ],
      });
    },
  };
}

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
      } catch (error) {
        return {
          success: false,
          error: formatPostgresError(error, { tool: "pg_copy_export" }),
        };
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
      table: z.string(),
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
      return Promise.resolve().then(() => {
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
        if (parsed.delimiter) options.push(`DELIMITER '${parsed.delimiter}'`);

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
      });
    },
  };
}
