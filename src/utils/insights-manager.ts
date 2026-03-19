/**
 * Insights Manager
 *
 * Singleton manager for business insights collected during database analysis.
 * Used by the pg_append_insight tool and postgres://insights resource.
 */

/**
 * Manages business insights collected during analysis sessions.
 * Insights are stored in memory and synthesized into a formatted memo.
 */
class InsightsManager {
  private insights: string[] = [];

  /**
   * Append a new business insight
   */
  append(insight: string): void {
    if (insight.trim()) {
      this.insights.push(insight.trim());
    }
  }

  /**
   * Get all insights
   */
  getAll(): string[] {
    return [...this.insights];
  }

  /**
   * Get insight count
   */
  count(): number {
    return this.insights.length;
  }

  /**
   * Clear all insights
   */
  clear(): void {
    this.insights = [];
  }

  /**
   * Synthesize insights into a formatted memo
   */
  synthesizeMemo(): string {
    if (this.insights.length === 0) {
      return "No business insights have been discovered yet.";
    }

    const insightsList = this.insights
      .map((insight) => `- ${insight}`)
      .join("\n");

    let memo = "📊 Business Intelligence Memo 📊\n\n";
    memo += "Key Insights Discovered:\n\n";
    memo += insightsList;

    if (this.insights.length > 1) {
      memo += "\n\nSummary:\n";
      memo += `Analysis has revealed ${String(this.insights.length)} key business insights that suggest opportunities for strategic optimization and growth.`;
    }

    return memo;
  }
}

/**
 * Singleton instance of the insights manager
 */
export const insightsManager = new InsightsManager();
