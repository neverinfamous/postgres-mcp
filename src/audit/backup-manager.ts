/**
 * postgres-mcp — Backup Manager
 *
 * Pre-mutation snapshot capture for the audit trail.
 * Creates DDL snapshots (+ optional data) of database objects
 * before write/admin tools modify them. Snapshots are stored
 * as gzip-compressed JSON files in a `snapshots/` directory
 * alongside the audit log.
 *
 * §3: Captures row_count + total_size_bytes from pg_class at snapshot time
 *     for semantic diffing (volume drift detection).
 * §4: Gzip compression, size-bounded data capture, and async fire-and-forget writes.
 *
 * Non-throwing by design: snapshot failures log to stderr
 * but never block tool execution.
 */

import { writeFile, readFile, readdir, mkdir, stat, unlink } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { gunzipSync, gzip as gzipCb } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzipCb);
import type {
  BackupConfig,
  SnapshotMetadata,
  SnapshotContent,
} from "./types.js";

/**
 * Tools that should receive pre-mutation snapshots, mapped to the
 * argument key that identifies the target object.
 *
 * Tools not in this map are audited but don't trigger snapshots.
 */
const SNAPSHOT_TOOL_ARGS: Record<string, { targetKey: string; schemaKey?: string }> = {
  // Core group — destructive (admin scope via override)
  pg_drop_table: { targetKey: "table", schemaKey: "schema" },
  pg_drop_index: { targetKey: "index", schemaKey: "schema" },
  pg_truncate: { targetKey: "table", schemaKey: "schema" },

  // Admin group
  pg_vacuum: { targetKey: "table", schemaKey: "schema" },
  pg_reindex: { targetKey: "table", schemaKey: "schema" },
  pg_cluster: { targetKey: "table", schemaKey: "schema" },

  // Backup group — import overwrites
  pg_copy_import: { targetKey: "table", schemaKey: "schema" },

  // Schema group — destructive
  pg_drop_schema: { targetKey: "schema" },
  pg_drop_view: { targetKey: "view", schemaKey: "schema" },
  pg_drop_sequence: { targetKey: "sequence", schemaKey: "schema" },

  // Partitioning group
  pg_detach_partition: { targetKey: "partition", schemaKey: "schema" },

  // Migration group — full-schema snapshots
  pg_migration_apply: { targetKey: "sql" },
  pg_migration_rollback: { targetKey: "id" },
};

/** File extension for compressed snapshot files */
const SNAPSHOT_EXT = ".snapshot.json.gz";

/** Legacy uncompressed extension for backward compatibility */
const SNAPSHOT_EXT_LEGACY = ".snapshot.json";

/** How many data rows to include in snapshot samples */
const MAX_SAMPLE_ROWS = 100;

/** Default max data size for snapshot data capture (50 MB) */
const DEFAULT_MAX_DATA_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Interface for database queries needed by the backup manager.
 * Avoids circular imports from the full adapter.
 */
export interface SnapshotQueryAdapter {
  executeQuery(sql: string, params?: unknown[]): Promise<{
    rows?: Record<string, unknown>[];
  }>;
  describeTable(table: string, schema?: string): Promise<{
    columns?: { name: string; type: string; nullable: boolean; defaultValue?: unknown }[];
  }>;
}

export class BackupManager {
  readonly config: BackupConfig;
  private readonly snapshotDir: string;
  private dirEnsured = false;
  private readonly pendingWrites = new Set<Promise<void>>();

  constructor(config: BackupConfig, auditLogPath: string) {
    this.config = config;
    // Snapshots live alongside the audit log file
    const logDir = dirname(auditLogPath);
    this.snapshotDir = join(logDir, "snapshots");
  }

  /**
   * Check if a tool should receive a pre-mutation snapshot.
   */
  shouldSnapshot(toolName: string): boolean {
    return this.config.enabled && toolName in SNAPSHOT_TOOL_ARGS;
  }

  /**
   * Create a pre-mutation snapshot of the target object.
   *
   * @returns Relative path to the snapshot file, or undefined if skipped/failed
   */
  async createSnapshot(
    toolName: string,
    args: Record<string, unknown>,
    requestId: string,
    adapter: SnapshotQueryAdapter,
  ): Promise<string | undefined> {
    if (!this.shouldSnapshot(toolName)) return undefined;

    try {
      const mapping = SNAPSHOT_TOOL_ARGS[toolName];
      if (!mapping) return undefined;

      const rawTarget = args[mapping.targetKey];
      const target = typeof rawTarget === "string" ? rawTarget : "unknown";
      const rawSchema = mapping.schemaKey ? args[mapping.schemaKey] : undefined;
      const schema = typeof rawSchema === "string" ? rawSchema : "public";

      // Migration tools get a full-schema snapshot
      if (toolName === "pg_migration_apply" || toolName === "pg_migration_rollback") {
        return await this.captureSchemaSnapshot(toolName, target, requestId);
      }

      // Schema drop gets a schema-level snapshot
      if (toolName === "pg_drop_schema") {
        return await this.captureSchemaDropSnapshot(target, requestId, adapter);
      }

      // All others get a table/object DDL snapshot
      return await this.captureObjectSnapshot(
        toolName,
        target,
        schema,
        requestId,
        adapter,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[AUDIT-BACKUP] Snapshot failed for ${toolName}: ${message}\n`);
      return undefined;
    }
  }

  /**
   * List available snapshots with metadata.
   */
  async listSnapshots(): Promise<SnapshotMetadata[]> {
    try {
      await this.ensureDirectory();
      const files = await readdir(this.snapshotDir);
      const snapshots: SnapshotMetadata[] = [];

      for (const file of files) {
        if (!file.endsWith(SNAPSHOT_EXT) && !file.endsWith(SNAPSHOT_EXT_LEGACY)) continue;
        try {
          const parsed = await this.readSnapshotFile(file);
          if (parsed) {
            snapshots.push({ ...parsed.metadata, filename: file });
          }
        } catch {
          // Skip corrupt snapshot files
        }
      }

      // Sort newest first
      snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return snapshots;
    } catch {
      // Intentional: listSnapshots is best-effort — return empty on error
      return [];
    }
  }

  /**
   * Read a specific snapshot by filename.
   */
  async getSnapshot(filename: string): Promise<SnapshotContent | null> {
    try {
      // Sanitize: only allow the basename to prevent path traversal
      const safe = basename(filename);
      return await this.readSnapshotFile(safe);
    } catch {
      // Intentional: getSnapshot is best-effort — return null on corrupt/missing file
      return null;
    }
  }

  /**
   * Apply retention policy — delete oldest snapshots that exceed limits.
   */
  async cleanup(): Promise<number> {
    if (!this.config.enabled) return 0;

    try {
      const files = await readdir(this.snapshotDir);
      const snapshotFiles = files.filter(
        (f) => f.endsWith(SNAPSHOT_EXT) || f.endsWith(SNAPSHOT_EXT_LEGACY),
      );

      if (snapshotFiles.length === 0) return 0;

      // Gather file info
      const fileInfos: { name: string; mtime: Date; path: string }[] = [];
      for (const file of snapshotFiles) {
        const filePath = join(this.snapshotDir, file);
        try {
          const stats = await stat(filePath);
          fileInfos.push({ name: file, mtime: stats.mtime, path: filePath });
        } catch {
          // Skip inaccessible files
        }
      }

      // Sort oldest first
      fileInfos.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

      let deleted = 0;
      const now = Date.now();
      const maxAgeMs = this.config.maxAgeDays * 24 * 60 * 60 * 1000;

      for (const info of fileInfos) {
        const age = now - info.mtime.getTime();
        const overAge = age > maxAgeMs;
        const overCount = fileInfos.length - deleted > this.config.maxCount;

        if (overAge || overCount) {
          try {
            await unlink(info.path);
            deleted++;
          } catch {
            // Skip undeletable files
          }
        }
      }

      if (deleted > 0) {
        process.stderr.write(`[AUDIT-BACKUP] Cleaned up ${String(deleted)} snapshot(s)\n`);
      }

      return deleted;
    } catch {
      // Intentional: cleanup is best-effort — don't fail on inaccessible directory
      return 0;
    }
  }

  /**
   * Flush all pending async snapshot writes.
   * Call during graceful shutdown to ensure all snapshots are persisted.
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.size > 0) {
      await Promise.allSettled(this.pendingWrites);
    }
  }

  async getStats(): Promise<{ count: number; oldestAge?: string; totalSizeKB: number }> {
    try {
      const files = await readdir(this.snapshotDir);
      const snapshotFiles = files.filter(
        (f) => f.endsWith(SNAPSHOT_EXT) || f.endsWith(SNAPSHOT_EXT_LEGACY),
      );
      let totalSize = 0;
      let oldestMtime: Date | undefined;

      for (const file of snapshotFiles) {
        try {
          const stats = await stat(join(this.snapshotDir, file));
          totalSize += stats.size;
          if (!oldestMtime || stats.mtime < oldestMtime) {
            oldestMtime = stats.mtime;
          }
        } catch {
          // Skip
        }
      }

      return {
        count: snapshotFiles.length,
        ...(oldestMtime && { oldestAge: oldestMtime.toISOString() }),
        totalSizeKB: Math.round(totalSize / 1024),
      };
    } catch {
      // Intentional: stats gathering is best-effort — return zero counts
      return { count: 0, totalSizeKB: 0 };
    }
  }

  // =========================================================================
  // Private snapshot capture methods
  // =========================================================================

  private async captureObjectSnapshot(
    toolName: string,
    target: string,
    schema: string,
    requestId: string,
    adapter: SnapshotQueryAdapter,
  ): Promise<string | undefined> {
    // Parse schema.table format
    let tableName = target;
    let schemaName = schema;
    if (target.includes(".")) {
      const parts = target.split(".");
      if (parts.length === 2 && parts[0] && parts[1]) {
        schemaName = parts[0];
        tableName = parts[1];
      }
    }

    // Capture DDL via describeTable
    const tableInfo = await adapter.describeTable(tableName, schemaName);
    const columns = tableInfo.columns ?? [];

    const ddlLines = columns.map((col) => {
      let line = `    "${col.name}" ${col.type}`;
      if (col.defaultValue !== undefined && col.defaultValue !== null) {
        const defVal = typeof col.defaultValue === "object"
          ? JSON.stringify(col.defaultValue)
          : String(col.defaultValue as string | number | boolean);
        line += ` DEFAULT ${defVal}`;
      }
      if (!col.nullable) line += " NOT NULL";
      return line;
    });

    const ddl = `CREATE TABLE "${schemaName}"."${tableName}" (\n${ddlLines.join(",\n")}\n);`;

    // §3: Capture volume metadata from pg_class (near-zero cost catalog reads)
    let rowCount: number | undefined;
    let totalSizeBytes: number | undefined;
    try {
      const sizeResult = await adapter.executeQuery(
        `SELECT reltuples::bigint AS row_count,
                relpages * current_setting('block_size')::int AS total_size_bytes
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = $1 AND n.nspname = $2`,
        [tableName, schemaName],
      );
      const sizeRow = sizeResult.rows?.[0] as { row_count?: number | string; total_size_bytes?: number } | undefined;
      if (sizeRow) {
        // reltuples::bigint is sent as a string by the pg driver — must parse
        rowCount = sizeRow.row_count !== undefined ? parseInt(String(sizeRow.row_count), 10) : undefined;
        totalSizeBytes = typeof sizeRow.total_size_bytes === "number" ? sizeRow.total_size_bytes : undefined;
      }
    } catch {
      // Volume metadata is best-effort — don't fail the snapshot
    }

    // §4: Size-bounded data capture
    let data: string | undefined;
    let dataSkipped = false;
    let dataSkippedReason: string | undefined;
    const maxDataSize = this.config.maxDataSizeBytes || DEFAULT_MAX_DATA_SIZE_BYTES;

    if (this.config.includeData) {
      // Check estimated size before capturing data
      if (totalSizeBytes !== undefined && totalSizeBytes > maxDataSize) {
        dataSkipped = true;
        const sizeMB = Math.round(totalSizeBytes / (1024 * 1024));
        const thresholdMB = Math.round(maxDataSize / (1024 * 1024));
        dataSkippedReason = `Table size ~${String(sizeMB)}MB exceeds ${String(thresholdMB)}MB threshold`;
      } else {
        try {
          const result = await adapter.executeQuery(
            `SELECT * FROM "${schemaName}"."${tableName}" LIMIT ${String(MAX_SAMPLE_ROWS)}`,
          );
          if (result.rows && result.rows.length > 0) {
            const firstRow = result.rows[0];
            if (firstRow) {
              const cols = Object.keys(firstRow).map((c) => `"${c}"`).join(", ");
              data = result.rows
                .map((row) => {
                  const vals = Object.values(row)
                    .map((v) => {
                      if (v === null) return "NULL";
                      if (typeof v === "string") return `'${v.replace(/'/g, "''")}'`;
                      if (typeof v === "number" || typeof v === "boolean") return String(v);
                      return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                    })
                    .join(", ");
                  return `INSERT INTO "${schemaName}"."${tableName}" (${cols}) VALUES (${vals});`;
                })
                .join("\n");
            }
          }
        } catch {
          // Data capture is best-effort
        }
      }
    }

    return this.writeSnapshot(
      toolName, tableName, schemaName, requestId, ddl, data,
      {
        ...(rowCount !== undefined && { rowCount }),
        ...(totalSizeBytes !== undefined && { totalSizeBytes }),
        ...(dataSkipped && { dataSkipped }),
        ...(dataSkippedReason !== undefined && { dataSkippedReason }),
      },
    );
  }

  private async captureSchemaSnapshot(
    toolName: string,
    target: string,
    requestId: string,
  ): Promise<string | undefined> {
    // For migration tools, we just record the migration context
    const ddl = `-- Pre-migration schema snapshot\n-- Tool: ${toolName}\n-- Target: ${target}\n-- Timestamp: ${new Date().toISOString()}\n-- Note: Full schema capture requires pg_dump; this is a marker for audit correlation.`;

    return this.writeSnapshot(toolName, target, "migration", requestId, ddl);
  }

  private async captureSchemaDropSnapshot(
    schema: string,
    requestId: string,
    adapter: SnapshotQueryAdapter,
  ): Promise<string | undefined> {
    // List all objects in the schema before it's dropped
    let ddl = `-- Pre-drop snapshot of schema "${schema}"\n`;
    try {
      const tables = await adapter.executeQuery(
        `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
        [schema],
      );
      if (tables.rows) {
        ddl += `-- Tables: ${tables.rows.map((r) => String(r["tablename"])).join(", ")}\n`;
      }
      const views = await adapter.executeQuery(
        `SELECT viewname FROM pg_views WHERE schemaname = $1`,
        [schema],
      );
      if (views.rows) {
        ddl += `-- Views: ${views.rows.map((r) => String(r["viewname"])).join(", ")}\n`;
      }
    } catch {
      ddl += "-- Could not enumerate schema objects\n";
    }

    return this.writeSnapshot("pg_drop_schema", schema, schema, requestId, ddl);
  }

  private async writeSnapshot(
    tool: string,
    target: string,
    schema: string,
    requestId: string,
    ddl: string,
    data?: string,
    volumeMeta?: {
      rowCount?: number;
      totalSizeBytes?: number;
      dataSkipped?: boolean;
      dataSkippedReason?: string;
    },
  ): Promise<string | undefined> {
    await this.ensureDirectory();

    const timestamp = new Date().toISOString();
    const safeTarget = target.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeTool = tool.replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${timestamp.replace(/[:.]/g, "-")}_${safeTool}_${safeTarget}${SNAPSHOT_EXT}`;

    const content: SnapshotContent = {
      metadata: {
        timestamp,
        tool,
        target,
        schema,
        type: data ? "ddl+data" : "ddl",
        requestId,
        sizeBytes: 0, // Updated after serialization
        ...(volumeMeta?.rowCount !== undefined && { rowCount: volumeMeta.rowCount }),
        ...(volumeMeta?.totalSizeBytes !== undefined && { totalSizeBytes: volumeMeta.totalSizeBytes }),
        ...(volumeMeta?.dataSkipped && { dataSkipped: true }),
        ...(volumeMeta?.dataSkippedReason && { dataSkippedReason: volumeMeta.dataSkippedReason }),
      },
      ddl,
      data,
    };

    // Serialize once, compute byte length, then patch sizeBytes inline
    const json = JSON.stringify(content, null, 2);
    const sizeBytes = Buffer.byteLength(json, "utf-8");
    const finalJson = json.replace(
      '"sizeBytes": 0',
      `"sizeBytes": ${String(sizeBytes)}`,
    );

    // §4: Async gzip compress + fire-and-forget write
    const compressed = await gzipAsync(Buffer.from(finalJson, "utf-8"));
    const filePath = join(this.snapshotDir, filename);

    const writePromise = writeFile(filePath, compressed).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[AUDIT-BACKUP] Async write failed for ${filename}: ${msg}\n`);
    });
    this.pendingWrites.add(writePromise);
    void writePromise.finally(() => { this.pendingWrites.delete(writePromise); });

    return filename;
  }

  /**
   * Read and decompress a snapshot file (supports both gzip and legacy JSON).
   */
  private async readSnapshotFile(filename: string): Promise<SnapshotContent | null> {
    const filePath = join(this.snapshotDir, filename);
    const raw = await readFile(filePath);

    // Gzip files start with 0x1f 0x8b magic bytes
    if (raw[0] === 0x1f && raw[1] === 0x8b) {
      const decompressed = gunzipSync(raw);
      return JSON.parse(decompressed.toString("utf-8")) as SnapshotContent;
    }

    // Legacy uncompressed JSON
    return JSON.parse(raw.toString("utf-8")) as SnapshotContent;
  }

  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return;
    try {
      await mkdir(this.snapshotDir, { recursive: true });
      this.dirEnsured = true;
    } catch {
      // Intentional: directory already exists or permission error — proceed regardless
      this.dirEnsured = true;
    }
  }
}
