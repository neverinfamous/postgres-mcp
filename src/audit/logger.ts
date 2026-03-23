/**
 * postgres-mcp — Audit Logger
 *
 * Async-buffered JSONL writer for the audit trail. Appends one
 * JSON object per line to a configurable file path, or writes to
 * stderr for containerised deployments (`--audit-log stderr`).
 *
 * Non-throwing by design: audit failures log to stderr but never
 * propagate to tool callers.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type { AuditConfig, AuditEntry } from "./types.js";

/** Maximum entries to buffer before forcing a flush */
const BUFFER_HIGH_WATER = 50;

/** Auto-flush interval in milliseconds */
const FLUSH_INTERVAL_MS = 100;

/** Default number of recent entries returned by `recent()` */
const DEFAULT_RECENT_COUNT = 50;

/** Special logPath value that routes audit output to stderr */
const STDERR_SENTINEL = "stderr";

export class AuditLogger {
  readonly config: AuditConfig;

  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private closed = false;
  private dirEnsured = false;
  private readonly stderrMode: boolean;

  constructor(config: AuditConfig) {
    this.config = config;
    this.stderrMode =
      config.logPath.toLowerCase() === STDERR_SENTINEL;

    if (config.enabled) {
      // Use unref() so the timer doesn't keep the process alive
      this.flushTimer = setInterval(() => {
        void this.flush();
      }, FLUSH_INTERVAL_MS);
      this.flushTimer.unref();
    }
  }

  /**
   * Append an audit entry to the buffer.
   * Non-blocking — the entry is serialised and queued; the
   * actual file write happens on the next flush cycle.
   */
  log(entry: AuditEntry): void {
    if (this.closed || !this.config.enabled) return;

    this.buffer.push(JSON.stringify(entry));

    // Eagerly flush when the buffer is full
    if (this.buffer.length >= BUFFER_HIGH_WATER) {
      void this.flush();
    }
  }

  /**
   * Flush the buffer to disk.
   * Safe to call concurrently — serialises via `this.flushing` flag.
   */
  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;

    // Swap the buffer so new entries can accumulate while we write
    const lines = this.buffer;
    this.buffer = [];

    try {
      if (this.stderrMode) {
        // Stderr mode: write directly, no buffering to disk
        process.stderr.write(lines.join("\n") + "\n");
      } else {
        await this.ensureDirectory();
        // One appendFile call with all buffered lines — each terminated by \n
        await appendFile(this.config.logPath, lines.join("\n") + "\n", "utf-8");
      }
    } catch (err) {
      // Never throw — audit must not break tool execution
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[AUDIT] Write failed: ${message}\n`);
      // Re-queue the failed lines so they aren't lost
      this.buffer.unshift(...lines);
    } finally {
      this.flushing = false;
    }
  }

  /**
   * Gracefully close the logger — flush remaining entries and stop the timer.
   */
  async close(): Promise<void> {
    this.closed = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
  }

  /**
   * Read the most recent audit entries from the log file.
   * Used by the `postgres://audit` resource.
   *
   * @param count Maximum number of entries to return (default 50)
   */
  async recent(count: number = DEFAULT_RECENT_COUNT): Promise<AuditEntry[]> {
    // Stderr mode has no file to read from
    if (this.stderrMode) return [];

    try {
      const exists = await stat(this.config.logPath)
        .then(() => true)
        .catch(() => false);
      if (!exists) return [];

      const content = await readFile(this.config.logPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const tail = lines.slice(-count);

      return tail.map((line) => JSON.parse(line) as AuditEntry);
    } catch {
      return [];
    }
  }

  /**
   * Ensure the parent directory of the log file exists.
   */
  private async ensureDirectory(): Promise<void> {
    if (this.dirEnsured) return;
    try {
      await mkdir(dirname(this.config.logPath), { recursive: true });
      this.dirEnsured = true;
    } catch {
      // Directory may already exist — that's fine
      this.dirEnsured = true;
    }
  }
}
