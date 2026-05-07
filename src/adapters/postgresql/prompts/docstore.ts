/**
 * PostgreSQL Prompt - Document Store Setup
 *
 * Complete Document Store setup guide for PostgreSQL JSONB collections.
 */
import type { PromptDefinition, RequestContext } from "../../../types/index.js";

export function createSetupDocstorePrompt(): PromptDefinition {
  return {
    name: "pg_setup_docstore",
    description: "Complete PostgreSQL Document Store setup guide using JSONB collections",
    arguments: [],
    handler: (_args: Record<string, string>, _context: RequestContext) => {
      return Promise.resolve(`# PostgreSQL Document Store Setup Guide

PostgreSQL Document Store provides a NoSQL-like document abstraction using native JSONB columns.
No extensions needed — JSONB is built into PostgreSQL.

## Prerequisites

1. **PostgreSQL 12+** (full JSONB support)
2. No additional extensions required

## Step 1: Create a Collection

Collections are tables with a \`doc JSONB\` column and a generated \`_id\` primary key:

\`\`\`sql
CREATE TABLE products (
    doc JSONB NOT NULL,
    _id TEXT GENERATED ALWAYS AS (doc->>'_id') STORED PRIMARY KEY
);
\`\`\`

Or use the MCP tool:
\`\`\`
pg_doc_create_collection({ name: "products" })
\`\`\`

## Step 2: Add Documents

\`\`\`
pg_doc_add({
    collection: "products",
    documents: [
        { "name": "Widget", "price": 9.99, "tags": ["sale"] },
        { "name": "Gadget", "price": 24.99, "category": "electronics" }
    ]
})
\`\`\`

Documents automatically get a 32-character hex \`_id\` if not provided.

## Step 3: Query Documents

\`\`\`
-- Find all documents
pg_doc_find({ collection: "products" })

-- Find by field value
pg_doc_find({ collection: "products", filter: "name=Widget" })

-- Find by JSON path existence
pg_doc_find({ collection: "products", filter: "$.tags" })

-- Find by _id
pg_doc_find({ collection: "products", filter: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" })
\`\`\`

## SQL Access to Collections

Collections are standard PostgreSQL tables:
\`\`\`sql
-- Direct JSONB queries
SELECT doc->>'name' AS name, (doc->>'price')::numeric AS price
FROM products
WHERE doc @> '{"category": "electronics"}';

-- Use JSONB containment
SELECT doc FROM products
WHERE doc ? 'tags';
\`\`\`

## Available MCP Tools

| Tool | Description |
|------|-------------|
| \`pg_doc_list_collections\` | List collections |
| \`pg_doc_create_collection\` | Create collection |
| \`pg_doc_drop_collection\` | Drop collection |
| \`pg_doc_find\` | Query documents |
| \`pg_doc_add\` | Add documents |
| \`pg_doc_modify\` | Update documents |
| \`pg_doc_remove\` | Delete documents |
| \`pg_doc_create_index\` | Create index |
| \`pg_doc_collection_info\` | Collection stats |

## Creating Indexes

\`\`\`
pg_doc_create_index({
    collection: "products",
    name: "idx_products_name",
    fields: [{ path: "name", type: "TEXT" }]
})
\`\`\`

For GIN indexes on entire documents (recommended for containment queries):
\`\`\`sql
CREATE INDEX idx_products_gin ON products USING GIN (doc);
\`\`\`

## Best Practices

1. **Add GIN indexes** on the \`doc\` column for containment queries (\`@>\`)
2. **Use expression indexes** on frequently queried fields via \`pg_doc_create_index\`
3. **Include \`_id\`** in documents for consistent identification
4. **Use JSONB operators** for complex queries: \`@>\`, \`?\`, \`->\`, \`->>\`
5. **Consider hybrid approach** — mix relational columns with JSONB for frequently queried fields

## Common Operations

1. **Modify documents**: \`pg_doc_modify({ collection: "products", filter: "name=Widget", set: { price: 12.99 } })\`
2. **Remove fields**: \`pg_doc_modify({ collection: "products", filter: "name=Widget", unset: ["category"] })\`
3. **Delete documents**: \`pg_doc_remove({ collection: "products", filter: "name=Widget" })\`

Start by listing collections with \`pg_doc_list_collections\`.`);
    },
  };
}
