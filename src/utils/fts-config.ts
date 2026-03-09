/**
 * postgres-mcp - FTS Configuration Validation
 *
 * Validates PostgreSQL full-text search configuration names
 * to prevent SQL injection via config parameter.
 */

/**
 * Error thrown when an invalid FTS configuration is provided
 */
export class InvalidFtsConfigError extends Error {
  constructor(config: string) {
    super(`Invalid FTS configuration name: "${config}"`);
    this.name = "InvalidFtsConfigError";
  }
}

/**
 * PostgreSQL identifier pattern (simplified for FTS configs)
 * Matches valid unquoted identifiers: starts with letter/underscore,
 * followed by letters, digits, underscores, or dollar signs.
 */
const VALID_CONFIG_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_$]*$/;

/**
 * Maximum length for PostgreSQL identifiers
 */
const MAX_CONFIG_LENGTH = 63;

/**
 * Validates a PostgreSQL full-text search configuration name.
 *
 * FTS configs must follow PostgreSQL identifier naming rules:
 * - Start with a letter or underscore
 * - Contain only letters, digits, underscores, or dollar signs
 * - Be at most 63 characters long
 *
 * @param config - The configuration name to validate
 * @throws InvalidFtsConfigError if the config name is invalid
 *
 * @example
 * validateFtsConfig("english");          // OK
 * validateFtsConfig("my_custom_config"); // OK
 * validateFtsConfig("english'; DROP");   // Throws InvalidFtsConfigError
 */
export function validateFtsConfig(config: string): void {
  if (!config || typeof config !== "string") {
    throw new InvalidFtsConfigError("undefined");
  }

  if (config.length > MAX_CONFIG_LENGTH) {
    throw new InvalidFtsConfigError(config);
  }

  if (!VALID_CONFIG_PATTERN.test(config)) {
    throw new InvalidFtsConfigError(config);
  }
}

/**
 * Validates and returns a safe FTS configuration name.
 *
 * @param config - The configuration name to sanitize
 * @returns The validated config name (unchanged if valid)
 * @throws InvalidFtsConfigError if the config name is invalid
 */
export function sanitizeFtsConfig(config: string): string {
  validateFtsConfig(config);
  return config;
}
