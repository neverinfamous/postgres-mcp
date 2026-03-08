/**
 * postgres-mcp - Code Mode API
 *
 * Main API class exposing all 21 tool groups organized for the
 * sandboxed code execution environment.
 */

import type { PostgresAdapter } from "../../adapters/postgresql/PostgresAdapter.js";
import type { ToolDefinition } from "../../types/index.js";
import { METHOD_ALIASES, GROUP_EXAMPLES } from "./maps.js";
import { TOP_LEVEL_ALIASES } from "./aliases.js";
import { createGroupApi, toolNameToMethodName } from "./group-api.js";

/**
 * Main API class exposing all tool groups
 */
export class PgApi {
  readonly core: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly transactions: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  readonly jsonb: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly text: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly performance: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  readonly admin: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly monitoring: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly backup: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly schema: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly vector: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly postgis: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly partitioning: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;
  readonly stats: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly cron: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly partman: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly kcache: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly citext: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly ltree: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly pgcrypto: Record<string, (...args: unknown[]) => Promise<unknown>>;
  readonly introspection: Record<
    string,
    (...args: unknown[]) => Promise<unknown>
  >;

  private readonly toolsByGroup: Map<string, ToolDefinition[]>;

  constructor(adapter: PostgresAdapter) {
    // Get all tool definitions and group them
    const allTools = adapter.getToolDefinitions();
    this.toolsByGroup = this.groupTools(allTools);

    // Create group-specific APIs
    this.core = createGroupApi(
      adapter,
      "core",
      this.toolsByGroup.get("core") ?? [],
    );
    this.transactions = createGroupApi(
      adapter,
      "transactions",
      this.toolsByGroup.get("transactions") ?? [],
    );
    this.jsonb = createGroupApi(
      adapter,
      "jsonb",
      this.toolsByGroup.get("jsonb") ?? [],
    );
    this.text = createGroupApi(
      adapter,
      "text",
      this.toolsByGroup.get("text") ?? [],
    );
    this.performance = createGroupApi(
      adapter,
      "performance",
      this.toolsByGroup.get("performance") ?? [],
    );
    this.admin = createGroupApi(
      adapter,
      "admin",
      this.toolsByGroup.get("admin") ?? [],
    );
    this.monitoring = createGroupApi(
      adapter,
      "monitoring",
      this.toolsByGroup.get("monitoring") ?? [],
    );
    this.backup = createGroupApi(
      adapter,
      "backup",
      this.toolsByGroup.get("backup") ?? [],
    );
    this.schema = createGroupApi(
      adapter,
      "schema",
      this.toolsByGroup.get("schema") ?? [],
    );
    this.vector = createGroupApi(
      adapter,
      "vector",
      this.toolsByGroup.get("vector") ?? [],
    );
    this.postgis = createGroupApi(
      adapter,
      "postgis",
      this.toolsByGroup.get("postgis") ?? [],
    );
    this.partitioning = createGroupApi(
      adapter,
      "partitioning",
      this.toolsByGroup.get("partitioning") ?? [],
    );
    this.stats = createGroupApi(
      adapter,
      "stats",
      this.toolsByGroup.get("stats") ?? [],
    );
    this.cron = createGroupApi(
      adapter,
      "cron",
      this.toolsByGroup.get("cron") ?? [],
    );
    this.partman = createGroupApi(
      adapter,
      "partman",
      this.toolsByGroup.get("partman") ?? [],
    );
    this.kcache = createGroupApi(
      adapter,
      "kcache",
      this.toolsByGroup.get("kcache") ?? [],
    );
    this.citext = createGroupApi(
      adapter,
      "citext",
      this.toolsByGroup.get("citext") ?? [],
    );
    this.ltree = createGroupApi(
      adapter,
      "ltree",
      this.toolsByGroup.get("ltree") ?? [],
    );
    this.pgcrypto = createGroupApi(
      adapter,
      "pgcrypto",
      this.toolsByGroup.get("pgcrypto") ?? [],
    );
    this.introspection = createGroupApi(
      adapter,
      "introspection",
      this.toolsByGroup.get("introspection") ?? [],
    );
  }

  /**
   * Group tools by their tool group
   */
  private groupTools(tools: ToolDefinition[]): Map<string, ToolDefinition[]> {
    const grouped = new Map<string, ToolDefinition[]>();

    for (const tool of tools) {
      const group = tool.group;
      const existing = grouped.get(group);
      if (existing) {
        existing.push(tool);
      } else {
        grouped.set(group, [tool]);
      }
    }

    return grouped;
  }

  /**
   * Get list of available groups and their method counts
   */
  getAvailableGroups(): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const [group, tools] of this.toolsByGroup) {
      groups[group] = tools.length;
    }
    return groups;
  }

  /**
   * Get list of methods available in a group
   */
  getGroupMethods(groupName: string): string[] {
    const groupApi = this[groupName as keyof PgApi];
    if (typeof groupApi === "object" && groupApi !== null) {
      return Object.keys(groupApi as Record<string, unknown>);
    }
    return [];
  }

  /**
   * Get help information listing all groups and their methods.
   * Call pg.help() in code mode to discover available APIs.
   *
   * @returns Object with group names as keys and arrays of method names as values
   */
  help(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [group, tools] of this.toolsByGroup) {
      // Skip codemode group itself
      if (group === "codemode") continue;
      result[group] = tools.map((t) => toolNameToMethodName(t.name, group));
    }
    return result;
  }

  /**
   * Create a serializable API binding for the sandbox
   * This creates references that can be called from isolated-vm
   */
  createSandboxBindings(): Record<string, unknown> {
    const bindings: Record<string, unknown> = {};

    const groupNames = [
      "core",
      "transactions",
      "jsonb",
      "text",
      "performance",
      "admin",
      "monitoring",
      "backup",
      "schema",
      "vector",
      "postgis",
      "partitioning",
      "stats",
      "cron",
      "partman",
      "kcache",
      "citext",
      "ltree",
      "pgcrypto",
      "introspection",
    ] as const;

    for (const groupName of groupNames) {
      const groupApi = this[groupName];
      // Capture all method names including aliases
      const allMethodNames = Object.keys(groupApi);

      // Separate canonical methods from aliases for structured help output
      const aliases = METHOD_ALIASES[groupName] ?? {};
      const aliasNames = new Set(Object.keys(aliases));
      const canonicalMethodNames = allMethodNames.filter(
        (name) => !aliasNames.has(name),
      );

      // Filter aliases to only show useful shorthand aliases in help output
      // Exclude redundant prefix aliases (e.g., partmanShowConfig, cronListJobs) that
      // just add the group name prefix - these are fallback catches, not intended API
      const usefulAliases = allMethodNames.filter((name) => {
        if (!aliasNames.has(name)) return false;
        // Exclude aliases that start with the group name (redundant prefixes)
        const lowerGroupName = groupName.toLowerCase();
        const lowerAlias = name.toLowerCase();
        return !lowerAlias.startsWith(lowerGroupName);
      });

      // Add all methods plus a 'help' property that lists them
      bindings[groupName] = {
        ...groupApi,
        // Help returns all methods - canonical first, then method aliases, plus examples
        // Note: methodAliases are alternate names within THIS group (e.g., pg.partman.analyzeHealth → pg.partman.analyzePartitionHealth)
        // They are NOT top-level pg.* aliases. Redundant prefix aliases (e.g., partmanShowConfig) are excluded.
        help: () => ({
          methods: canonicalMethodNames,
          methodAliases: usefulAliases,
          examples: GROUP_EXAMPLES[groupName],
        }),
      };
    }

    // Add top-level help as directly callable pg.help()
    bindings["help"] = () => this.help();

    // Add all top-level aliases from the data-driven constant
    for (const { group, bindingName, methodName } of TOP_LEVEL_ALIASES) {
      const groupApi = bindings[group] as
        | Record<string, (...args: unknown[]) => Promise<unknown>>
        | undefined;
      if (groupApi?.[methodName] !== undefined) {
        bindings[bindingName] = groupApi[methodName];
      }
    }

    return bindings;
  }
}

/**
 * Create a PgApi instance for an adapter
 */
export function createPgApi(adapter: PostgresAdapter): PgApi {
  return new PgApi(adapter);
}
