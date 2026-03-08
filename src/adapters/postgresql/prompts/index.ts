/**
 * PostgreSQL MCP Prompts
 *
 * AI-powered prompts for query building, schema design, and optimization.
 * 19 prompts total.
 */

import type { PostgresAdapter } from "../PostgresAdapter.js";
import type {
  PromptDefinition,
  RequestContext,
  ToolDefinition,
} from "../../../types/index.js";

// Import modular prompts
import { createDatabaseHealthCheckPrompt } from "./health.js";
import { createBackupStrategyPrompt } from "./backup.js";
import { createIndexTuningPrompt } from "./indexTuning.js";
import { createExtensionSetupPrompt } from "./extensionSetup.js";
import { createSetupPgvectorPrompt } from "./pgvector.js";
import { createSetupPostgisPrompt } from "./postgis.js";
import { createSetupPgcronPrompt } from "./pgcron.js";
import { createSetupPartmanPrompt } from "./partman.js";
import { createSetupKcachePrompt } from "./kcache.js";
import { createSetupCitextPrompt } from "./citext.js";
import { createSetupLtreePrompt } from "./ltree.js";
import { createSetupPgcryptoPrompt } from "./pgcrypto.js";

/**
 * Get all PostgreSQL prompts
 */
export function getPostgresPrompts(
  adapter: PostgresAdapter,
): PromptDefinition[] {
  const allToolDefinitions = adapter.getToolDefinitions();
  return [
    // Original prompts
    createQueryBuilderPrompt(),
    createSchemaDesignPrompt(),
    createPerformanceAnalysisPrompt(),
    createMigrationPrompt(),
    createToolIndexPrompt(allToolDefinitions),
    createQuickQueryPrompt(),
    createQuickSchemaPrompt(),
    // DBA and extension prompts
    createDatabaseHealthCheckPrompt(),
    createBackupStrategyPrompt(),
    createIndexTuningPrompt(),
    createExtensionSetupPrompt(),
    createSetupPgvectorPrompt(),
    createSetupPostgisPrompt(),
    // Extension setup prompts
    createSetupPgcronPrompt(),
    createSetupPartmanPrompt(),
    createSetupKcachePrompt(),
    createSetupCitextPrompt(),
    createSetupLtreePrompt(),
    createSetupPgcryptoPrompt(),
  ];
}

function createQueryBuilderPrompt(): PromptDefinition {
  return {
    name: "pg_query_builder",
    description:
      "Build a PostgreSQL query based on requirements. Specify tables and operation type.",
    arguments: [
      {
        name: "tables",
        description: "Comma-separated list of tables",
        required: true,
      },
      {
        name: "operation",
        description:
          "Operation type: SELECT, INSERT, UPDATE, DELETE, JOIN, CTE",
        required: true,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const tables = args["tables"] ?? "";
      const operation = args["operation"] ?? "";
      return Promise.resolve(`Please construct a PostgreSQL query for the following requirements:

**Tables:** ${tables}
**Operation:** ${operation}

Consider these PostgreSQL best practices:
1. Use parameterized queries ($1, $2, etc.) for all user input
2. Include appropriate WHERE clauses to limit results
3. Use RETURNING clause for INSERT/UPDATE/DELETE when appropriate
4. Consider using CTEs (WITH queries) for complex logic
5. Add LIMIT for SELECT queries when full results aren't needed
6. Use proper index hints if performance is critical

Please provide the SQL query with explanations for each part.`);
    },
  };
}

function createSchemaDesignPrompt(): PromptDefinition {
  return {
    name: "pg_schema_design",
    description: "Design a database schema for a given use case.",
    arguments: [
      {
        name: "useCase",
        description: "Description of the use case or domain",
        required: true,
      },
      {
        name: "requirements",
        description: "Specific requirements or constraints",
        required: false,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const useCase = args["useCase"] ?? "";
      const requirements = args["requirements"] ?? "";
      return Promise.resolve(`Please design a PostgreSQL database schema for the following use case:

**Use Case:** ${useCase}
${requirements ? `**Requirements:** ${requirements}` : ""}

Consider these PostgreSQL-specific features:
1. Use appropriate data types (JSONB for flexible data, UUID for IDs, TIMESTAMPTZ for dates)
2. Define proper primary keys and foreign key relationships
3. Add CHECK constraints for data validation
4. Consider using SERIAL or IDENTITY for auto-increment columns
5. Plan for indexes on frequently queried columns
6. Use schemas (namespaces) to organize related tables
7. Consider table partitioning for large tables

Please provide:
- CREATE TABLE statements
- Index recommendations
- Constraint definitions
- Any relevant views or functions`);
    },
  };
}

function createPerformanceAnalysisPrompt(): PromptDefinition {
  return {
    name: "pg_performance_analysis",
    description: "Analyze a slow query and suggest optimizations.",
    arguments: [
      {
        name: "query",
        description: "The SQL query to analyze",
        required: true,
      },
      {
        name: "context",
        description: "Additional context (table sizes, current indexes, etc.)",
        required: false,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const query = args["query"] ?? "";
      const context = args["context"] ?? "";
      return Promise.resolve(`Please analyze this PostgreSQL query for performance issues:

\`\`\`sql
${query}
\`\`\`
${context ? `\n**Context:** ${context}` : ""}

Use these PostgreSQL tools to investigate:
1. \`pg_explain_analyze\` - Get execution plan with timing
2. \`pg_explain_buffers\` - Check buffer usage
3. \`pg_index_stats\` - Check if indexes are being used
4. \`pg_table_stats\` - Check table access patterns
5. \`pg_bloat_check\` - Check for table bloat

Please analyze and recommend:
- Missing indexes
- Query rewrites
- Configuration changes
- Maintenance operations (VACUUM, ANALYZE)`);
    },
  };
}

function createMigrationPrompt(): PromptDefinition {
  return {
    name: "pg_migration",
    description: "Generate a migration plan for a schema change.",
    arguments: [
      {
        name: "change",
        description: "Description of the change",
        required: true,
      },
      { name: "table", description: "Target table name", required: false },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const change = args["change"] ?? "";
      const table = args["table"] ?? "";
      return Promise.resolve(`Please create a PostgreSQL migration plan for:

**Change:** ${change}
${table ? `**Table:** ${table}` : ""}

Provide:
1. **Up Migration** - SQL to apply the change
2. **Down Migration** - SQL to rollback
3. **Safety Considerations**:
   - Will this lock the table?
   - Should this use CONCURRENTLY?
   - What's the estimated impact on production?
4. **Testing Steps** - How to verify the migration worked
5. **Rollback Plan** - Steps if something goes wrong

Use PostgreSQL-specific features like:
- ALTER TABLE ... ADD COLUMN ... (with DEFAULT for non-nullable)
- CREATE INDEX CONCURRENTLY
- Transaction wrappers where appropriate`);
    },
  };
}

function createToolIndexPrompt(tools: ToolDefinition[]): PromptDefinition {
  return {
    name: "pg_tool_index",
    description:
      "Get a compact index of all available PostgreSQL tools for discovery.",
    arguments: [],
    handler: (
      _args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const grouped = new Map<string, { name: string; desc: string }[]>();

      for (const tool of tools) {
        const group = tool.group;
        const groupTools = grouped.get(group) ?? [];
        const firstSentence =
          tool.description.split(".")[0] ?? tool.description;
        groupTools.push({
          name: tool.name,
          desc: firstSentence,
        });
        grouped.set(group, groupTools);
      }

      const lines: string[] = [
        `# PostgreSQL MCP Tools (${String(tools.length)} total)`,
        "",
        "Use specific tool names when needed. Ask for details about any tool.",
        "",
      ];

      for (const [group, groupTools] of grouped) {
        lines.push(`## ${group} (${String(groupTools.length)})`);
        for (const t of groupTools) {
          lines.push(`- \`${t.name}\`: ${t.desc}`);
        }
        lines.push("");
      }

      return Promise.resolve(lines.join("\n"));
    },
  };
}

function createQuickQueryPrompt(): PromptDefinition {
  return {
    name: "pg_quick_query",
    description: "Quick SQL query guidance for common operations.",
    arguments: [
      {
        name: "action",
        description: 'What you want to do (e.g., "find users by email")',
        required: true,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const action = args["action"] ?? "";
      return Promise.resolve(`To "${action}" in PostgreSQL, use:

**Tool:** \`pg_read_query\` for SELECT, \`pg_write_query\` for INSERT/UPDATE/DELETE

**Example pattern:**
\`\`\`sql
-- For read operations
SELECT * FROM table_name WHERE condition = $1;

-- For write operations
INSERT INTO table_name (col1, col2) VALUES ($1, $2) RETURNING *;
UPDATE table_name SET col1 = $1 WHERE condition = $2 RETURNING *;
DELETE FROM table_name WHERE condition = $1 RETURNING *;
\`\`\`

Provide your specific requirements and I'll help construct the exact query.`);
    },
  };
}

function createQuickSchemaPrompt(): PromptDefinition {
  return {
    name: "pg_quick_schema",
    description: "Quick reference for exploring database schema.",
    arguments: [],
    handler: (
      _args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      return Promise.resolve(`# Quick Schema Exploration

**List all tables:**
\`pg_list_tables\`

**Describe a table:**
\`pg_describe_table\` with table name

**List schemas:**
\`pg_list_schemas\`

**View indexes:**
\`pg_get_indexes\` with table name

**Full schema export:**
Access resource: \`postgres://schema\`

**Schema statistics:**
Access resource: \`postgres://stats\`

What would you like to explore?`);
    },
  };
}
