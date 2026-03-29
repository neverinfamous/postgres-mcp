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

      const thresholds: Record<
        string,
        { warning: string; critical: string; description: string }
      > = {
        connection_usage: {
          warning: "70%",
          critical: "90%",
          description: "Percentage of max_connections in use",
        },
        cache_hit_ratio: {
          warning: "< 95%",
          critical: "< 80%",
          description: "Buffer cache hit ratio - lower is worse",
        },
        replication_lag: {
          warning: "> 1 minute",
          critical: "> 5 minutes",
          description: "Replication lag from primary to replica",
        },
        dead_tuples: {
          warning: "> 10% of live tuples",
          critical: "> 25% of live tuples",
          description: "Dead tuples indicating need for VACUUM",
        },
        long_running_queries: {
          warning: "> 5 minutes",
          critical: "> 30 minutes",
          description: "Queries running longer than threshold",
        },
        lock_wait_time: {
          warning: "> 30 seconds",
          critical: "> 5 minutes",
          description: "Time spent waiting for locks",
        },
      };

      if (parsed.metric && thresholds[parsed.metric]) {
        return Promise.resolve({
          metric: parsed.metric,
          threshold: thresholds[parsed.metric],
        });
      }

      return Promise.resolve({
        thresholds,
        note: "These are recommended starting thresholds. Adjust based on your specific workload and requirements.",
      });
      } catch (error: unknown) {
        return Promise.resolve(
          formatHandlerErrorResponse(error, { tool: "pg_alert_threshold_set" })
        );
      }
    },
  };
}