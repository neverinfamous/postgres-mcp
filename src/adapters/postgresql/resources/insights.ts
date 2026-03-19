/**
 * Insights Resource
 *
 * Exposes the business insights memo via the postgres://insights URI.
 * Insights are collected via the pg_append_insight tool.
 */

import type {
  ResourceDefinition,
  RequestContext,
} from "../../../types/index.js";
import { ASSISTANT_FOCUSED } from "../../../utils/resource-annotations.js";
import { insightsManager } from "../../../utils/insights-manager.js";

export function createInsightsResource(): ResourceDefinition {
  return {
    uri: "postgres://insights",
    name: "Business Insights Memo",
    description:
      "Synthesized memo of business insights discovered during database analysis. Populated via pg_append_insight tool.",
    mimeType: "text/plain",
    annotations: ASSISTANT_FOCUSED,
    handler: async (_uri: string, _context: RequestContext) => {
      const memo = await Promise.resolve(insightsManager.synthesizeMemo());
      return memo;
    },
  };
}
