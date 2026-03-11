/**
 * PostgreSQL pg_stat_kcache - Shared Helpers
 *
 * Version-aware column name detection for pg_stat_kcache.
 */

import type { PostgresAdapter } from "../../PostgresAdapter.js";

/**
 * Column naming in pg_stat_kcache changed in version 2.2:
 * - Old (< 2.2): user_time, system_time, reads, writes
 * - New (>= 2.2): exec_user_time, exec_system_time, exec_reads, exec_writes
 *
 * These column names are shared between the pg_stat_kcache VIEW and
 * the pg_stat_kcache() FUNCTION. The VIEW also has _blks variants,
 * but the byte-based names work for both contexts.
 */
export interface KcacheColumns {
  userTime: string;
  systemTime: string;
  reads: string; // bytes (not blocks!)
  writes: string; // bytes (not blocks!)
  minflts: string;
  majflts: string;
}

export async function getKcacheColumnNames(
  adapter: PostgresAdapter,
): Promise<KcacheColumns> {
  const result = await adapter.executeQuery(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'pg_stat_kcache' AND column_name = 'exec_user_time'
    `);
  const isNewVersion = (result.rows?.length ?? 0) > 0;

  if (isNewVersion) {
    return {
      userTime: "exec_user_time",
      systemTime: "exec_system_time",
      reads: "exec_reads", // function returns bytes, not blocks
      writes: "exec_writes", // function returns bytes, not blocks
      minflts: "exec_minflts",
      majflts: "exec_majflts",
    };
  }
  return {
    userTime: "user_time",
    systemTime: "system_time",
    reads: "reads",
    writes: "writes",
    minflts: "minflts",
    majflts: "majflts",
  };
}
