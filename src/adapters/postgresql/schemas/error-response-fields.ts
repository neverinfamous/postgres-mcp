/**
 * Shared Error Response Fields for Output Schemas
 *
 * Defines the ErrorResponseFields Zod schema fragment that gets merged into
 * every output schema. This ensures formatHandlerError() responses pass
 * output schema validation (MCP SDK enforces additionalProperties: false).
 */

import { z } from "zod";

/**
 * Standard error response fields returned by formatHandlerError().
 * Merge this into every output schema:
 *   export const MyOutputSchema = z.object({ ... }).extend(ErrorResponseFields.shape);
 */
export const ErrorResponseFields = z.object({
  code: z
    .string()
    .optional()
    .describe("Error code (e.g. VALIDATION_ERROR, QUERY_ERROR)"),
  category: z
    .string()
    .optional()
    .describe("Error category (validation, query, connection, internal)"),
  recoverable: z
    .boolean()
    .optional()
    .describe("Whether the error is recoverable"),
  suggestion: z
    .string()
    .optional()
    .describe("Suggested fix for the error"),
  details: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Additional error context"),
});
