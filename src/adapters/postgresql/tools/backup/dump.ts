/**
 * PostgreSQL Backup Tools - Dump Operations
 *
 * DDL generation tools: dump_table, dump_schema.
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import type {
  ToolDefinition,
  RequestContext,
} from "../../../../types/index.js";
import { z } from "zod";
import { readOnly } from "../../../../utils/annotations.js";
import { getToolIcons } from "../../../../utils/icons.js";
import {
  DumpSchemaSchema,
  // Output schemas
  DumpTableOutputSchema,
  DumpSchemaOutputSchema,
} from "../../schemas/index.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";
import {
  sanitizeIdentifier,
  sanitizeTableName,
} from "../../../../utils/identifiers.js";
import { coerceNumber } from "../../../../utils/query-helpers.js";

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
      limit: z
        .preprocess(coerceNumber, z.number().optional())
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
        return formatHandlerErrorResponse(error, { tool: "pg_dump_table" });
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
      try {
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
      } catch (error: unknown) {
        return Promise.resolve(formatHandlerErrorResponse(error, { tool: "pg_dump_schema" }));
      }
    },
  };
}

