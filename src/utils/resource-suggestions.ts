/**
 * postgres-mcp — Resource Suggestion Utility
 *
 * §7: Appends actionable suggestions to resource responses based on
 * configurable thresholds. Each suggestion includes severity, message,
 * and an optional action string (SQL or tool call).
 *
 * This is NOT a singleton — each resource handler calls `generateVacuumSuggestions()`
 * explicitly with its own data. Designed for easy extension to other resources.
 */

// ============================================================================
// Types
// ============================================================================

/** A single actionable suggestion for agents */
export interface Suggestion {
  severity: "info" | "warning" | "critical";
  message: string;
  action?: string;
}

/** Vacuum-specific threshold configuration */
export interface VacuumThresholds {
  /** Dead tuple ratio threshold for warnings (default: 0.2 = 20%) */
  deadTupleRatioWarning: number;

  /** Dead tuple ratio threshold for critical (default: 0.5 = 50%) */
  deadTupleRatioCritical: number;

  /** Tables that have never been vacuumed trigger a warning */
  neverVacuumedWarning: boolean;

  /** Wraparound percentage considered critical (default: 75) */
  wraparoundCriticalPct: number;

  /** Wraparound percentage considered warning (default: 50) */
  wraparoundWarningPct: number;
}

/** Vacuum statistics row from the resource */
export interface VacuumStatsRow {
  schemaname: string;
  relname: string;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  n_dead_tup: number;
  n_live_tup: number;
  dead_tuple_percent: number;
}

/** Wraparound info from the resource */
export interface WraparoundStats {
  percent_toward_wraparound: number;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_VACUUM_THRESHOLDS: VacuumThresholds = {
  deadTupleRatioWarning: 0.2,
  deadTupleRatioCritical: 0.5,
  neverVacuumedWarning: true,
  wraparoundCriticalPct: 75,
  wraparoundWarningPct: 50,
};

// ============================================================================
// Suggestion Generators
// ============================================================================

/**
 * Generate actionable suggestions from vacuum resource data.
 * Deterministic, threshold-based, and terse for token efficiency.
 */
export function generateVacuumSuggestions(
  vacuumStats: VacuumStatsRow[],
  wraparound: WraparoundStats | null,
  thresholds: VacuumThresholds = DEFAULT_VACUUM_THRESHOLDS,
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // Wraparound checks (most critical first)
  if (wraparound) {
    const pct = wraparound.percent_toward_wraparound;
    if (pct > thresholds.wraparoundCriticalPct) {
      suggestions.push({
        severity: "critical",
        message: `Transaction ID wraparound at ${String(Math.round(pct))}% — database will shut down to prevent corruption`,
        action: "VACUUM FREEZE;",
      });
    } else if (pct > thresholds.wraparoundWarningPct) {
      suggestions.push({
        severity: "warning",
        message: `Transaction ID wraparound at ${String(Math.round(pct))}% — schedule maintenance`,
        action: "VACUUM FREEZE;",
      });
    }
  }

  // Per-table dead tuple checks
  for (const table of vacuumStats) {
    // Skip empty tables
    if (table.n_live_tup === 0 && table.n_dead_tup === 0) continue;

    const deadRatio =
      table.n_live_tup > 0
        ? table.n_dead_tup / table.n_live_tup
        : table.n_dead_tup > 0
          ? 1
          : 0;

    const qualified = `${table.schemaname}.${table.relname}`;

    if (deadRatio >= thresholds.deadTupleRatioCritical) {
      suggestions.push({
        severity: "critical",
        message: `${qualified}: ${String(Math.round(deadRatio * 100))}% dead tuples (${String(table.n_dead_tup)} dead / ${String(table.n_live_tup)} live)`,
        action: `VACUUM ANALYZE ${qualified};`,
      });
    } else if (deadRatio >= thresholds.deadTupleRatioWarning) {
      suggestions.push({
        severity: "warning",
        message: `${qualified}: ${String(Math.round(deadRatio * 100))}% dead tuples`,
        action: `VACUUM ANALYZE ${qualified};`,
      });
    }

    // Never-vacuumed warning
    if (
      thresholds.neverVacuumedWarning &&
      table.last_vacuum === null &&
      table.last_autovacuum === null &&
      table.n_live_tup > 100
    ) {
      suggestions.push({
        severity: "warning",
        message: `${qualified}: Never vacuumed (${String(table.n_live_tup)} live rows)`,
        action: `VACUUM ANALYZE ${qualified};`,
      });
    }
  }

  // Healthy state
  if (suggestions.length === 0) {
    suggestions.push({
      severity: "info",
      message: "Vacuum status is healthy — no action needed",
    });
  }

  return suggestions;
}
