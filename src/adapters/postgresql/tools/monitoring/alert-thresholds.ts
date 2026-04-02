/**
 * PostgreSQL Monitoring — Alert Thresholds
 */

import type { PostgresAdapter } from "../../postgres-adapter.js";
import { type ToolDefinition, type RequestContext, ValidationError } from "../../../../types/index.js";
import { readOnly } from "../../../../utils/annotations.js";

import { getToolIcons } from "../../../../utils/icons.js";
import {
  AlertThresholdSetSchemaBase,
  AlertThresholdSetSchema,
  AlertThresholdOutputSchema,
} from "../../schemas/index.js";
import { formatHandlerErrorResponse } from "../core/error-helpers.js";

export function createAlertThresholdSetTool(
  _adapter: PostgresAdapter,
): ToolDefinition {
  return {
    name: "pg_alert_threshold_set",
    description:
      "Get recommended alert thresholds for monitoring key database metrics. Note: This is informational only - returns suggested warning/critical thresholds for external monitoring tools. Does not configure alerts in PostgreSQL itself.",
    group: "monitoring",
    inputSchema: AlertThresholdSetSchemaBase,
    outputSchema: AlertThresholdOutputSchema,
    annotations: readOnly("Get Alert Thresholds"),
    icons: getToolIcons("monitoring", readOnly("Get Alert Thresholds")),
    handler: (params: unknown, _context: RequestContext) => {
      try {
        const parsed = AlertThresholdSetSchema.parse(params ?? {});

        const validMetrics = [
          "connection_usage",
          "cache_hit_ratio",
          "replication_lag",
          "dead_tuples",
          "long_running_queries",
          "lock_wait_time",
        ];

        if (parsed.metric && !validMetrics.includes(parsed.metric)) {
          throw new ValidationError(
            `Invalid metric "${parsed.metric}". Valid metrics: ${validMetrics.join(", ")}`
          );
        }

        // Validate constraint percentages
        const validatePercent = (val: string) => {
          if (val.includes('%')) {
            const num = parseFloat(val.replace(/[^\d.-]/g, ''));
            if (num < 0 || num > 100) {
              throw new ValidationError(`Threshold percentage must be between 0% and 100%, got ${val}`);
            }
          }
        };

        validatePercent(parsed.warningThreshold);
        validatePercent(parsed.criticalThreshold);

        return Promise.resolve({
          success: true,
          metric: parsed.metric,
          threshold: {
            warning: parsed.warningThreshold,
            critical: parsed.criticalThreshold,
            description: `Custom threshold configured for ${parsed.metric}`
          }
        });
      } catch (error: unknown) {
        return Promise.resolve(
          formatHandlerErrorResponse(error, { tool: "pg_alert_threshold_set" })
        );
      }
    },
  };
}