/**
 * ltree Setup Prompt
 *
 * Complete guide for setting up hierarchical data with ltree.
 */

import type { PromptDefinition, RequestContext } from "../../../types/index.js";

export function createSetupLtreePrompt(): PromptDefinition {
  return {
    name: "pg_setup_ltree",
    description:
      "Complete guide for setting up hierarchical tree-structured data with ltree for categories, org charts, and file paths.",
    arguments: [
      {
        name: "useCase",
        description: "Use case: categories, org_chart, file_paths, taxonomy",
        required: false,
      },
    ],
    handler: (
      args: Record<string, string>,
      _context: RequestContext,
    ): Promise<string> => {
      const useCase = args["useCase"] ?? "categories";

      let exampleTable: string;
      let exampleData: string;

      if (useCase === "categories") {
        exampleTable = `CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    path LTREE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);`;
        exampleData = `INSERT INTO categories (name, path) VALUES
('Electronics', 'electronics'),
('Computers', 'electronics.computers'),
('Laptops', 'electronics.computers.laptops'),
('Desktops', 'electronics.computers.desktops'),
('Phones', 'electronics.phones'),
('Smartphones', 'electronics.phones.smartphones'),
('Clothing', 'clothing'),
('Men', 'clothing.men'),
('Women', 'clothing.women');`;
      } else if (useCase === "org_chart") {
        exampleTable = `CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    title VARCHAR(100),
    org_path LTREE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);`;
        exampleData = `INSERT INTO employees (name, title, org_path) VALUES
('Alice', 'CEO', 'ceo'),
('Bob', 'CTO', 'ceo.cto'),
('Carol', 'CFO', 'ceo.cfo'),
('Dave', 'Engineering Manager', 'ceo.cto.eng'),
('Eve', 'Senior Developer', 'ceo.cto.eng.dev1'),
('Frank', 'Junior Developer', 'ceo.cto.eng.dev2'),
('Grace', 'Finance Manager', 'ceo.cfo.finance');`;
      } else if (useCase === "file_paths") {
        exampleTable = `CREATE TABLE files (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    path LTREE NOT NULL,
    size_bytes BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);`;
        exampleData = `INSERT INTO files (name, file_type, path, size_bytes) VALUES
('home', 'directory', 'home', 0),
('user1', 'directory', 'home.user1', 0),
('documents', 'directory', 'home.user1.documents', 0),
('report.pdf', 'file', 'home.user1.documents.report_pdf', 1024),
('photos', 'directory', 'home.user1.photos', 0),
('vacation.jpg', 'file', 'home.user1.photos.vacation_jpg', 2048);`;
      } else {
        exampleTable = `CREATE TABLE species (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    scientific_name VARCHAR(255),
    taxonomy LTREE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);`;
        exampleData = `INSERT INTO species (name, scientific_name, taxonomy) VALUES
('Animals', NULL, 'animalia'),
('Mammals', NULL, 'animalia.mammalia'),
('Primates', NULL, 'animalia.mammalia.primates'),
('Human', 'Homo sapiens', 'animalia.mammalia.primates.homo_sapiens'),
('Carnivora', NULL, 'animalia.mammalia.carnivora'),
('Dog', 'Canis familiaris', 'animalia.mammalia.carnivora.canis_familiaris'),
('Cat', 'Felis catus', 'animalia.mammalia.carnivora.felis_catus');`;
      }

      return Promise.resolve(`# ltree Setup Guide - ${useCase
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")}

## ltree Overview

ltree provides **hierarchical label tree** storage for PostgreSQL:
- Efficient ancestor/descendant queries
- Pattern matching with lquery
- Full-text search with ltxtquery
- GiST index support

**Perfect for:** Categories, org charts, threaded comments, file systems, taxonomies

## Setup Steps

### 1. Install ltree

\`\`\`sql
CREATE EXTENSION IF NOT EXISTS ltree;
SELECT * FROM pg_extension WHERE extname = 'ltree';
\`\`\`

### 2. Create Table with ltree

\`\`\`sql
${exampleTable}

-- Create GiST index for fast hierarchical queries
CREATE INDEX idx_path_gist ON ${useCase === "org_chart" ? "employees" : useCase === "file_paths" ? "files" : useCase === "taxonomy" ? "species" : "categories"} USING GIST (${useCase === "org_chart" ? "org_path" : useCase === "taxonomy" ? "taxonomy" : "path"});
\`\`\`

### 3. Insert Hierarchical Data

\`\`\`sql
${exampleData}
\`\`\`

### 4. Path Syntax

ltree labels:
- Use \`.\` as separator
- Labels can contain letters, numbers, underscores
- Case-sensitive
- Up to 256 labels per path

\`\`\`
electronics.computers.laptops.gaming
    ^          ^        ^        ^
    |          |        |        |
  level 1   level 2  level 3  level 4
\`\`\`

### 5. Hierarchical Queries

**Find all descendants (children, grandchildren, etc.):**
\`\`\`sql
-- All items under 'electronics.computers'
SELECT * FROM categories
WHERE path <@ 'electronics.computers';

-- Or using the tool:
-- pg_ltree_query(table_name: "categories", column_name: "path", 
--                base_path: "electronics.computers", query_type: "descendants")
\`\`\`

**Find all ancestors (parents, grandparents, etc.):**
\`\`\`sql
-- All parents of 'electronics.computers.laptops'
SELECT * FROM categories
WHERE path @> 'electronics.computers.laptops';

-- Or using the tool:
-- pg_ltree_query(..., query_type: "ancestors")
\`\`\`

**Find direct children only:**
\`\`\`sql
SELECT * FROM categories
WHERE path ~ 'electronics.*{1}';
\`\`\`

### 6. Pattern Matching (lquery)

lquery uses special syntax for pattern matching:

| Pattern | Meaning |
|---------|---------|
| \`*\` | Match any single label |
| \`*{n}\` | Match exactly n labels |
| \`*{n,}\` | Match n or more labels |
| \`*{n,m}\` | Match between n and m labels |
| \`word\` | Match exact label |
| \`word*\` | Match label starting with word |
| \`%word%\` | Match label containing word |

\`\`\`sql
-- Find all leaf nodes (no children)
SELECT path FROM categories c1
WHERE NOT EXISTS (
    SELECT 1 FROM categories c2 
    WHERE c2.path <@ c1.path AND c2.path != c1.path
);

-- Match pattern: electronics.*.laptops
SELECT * FROM categories WHERE path ~ 'electronics.*.laptops';

-- Match 2-3 levels deep under electronics
SELECT * FROM categories WHERE path ~ 'electronics.*{2,3}';
\`\`\`

Use \`pg_ltree_match\` for pattern matching.

### 7. Common Ancestor

\`\`\`sql
-- Find longest common ancestor of multiple paths
SELECT lca('electronics.computers.laptops', 'electronics.phones.smartphones');
-- Result: 'electronics'
\`\`\`

Use \`pg_ltree_lca\` for this operation.

### 8. Subpath Extraction

\`\`\`sql
-- Get subpath from position 1 for 2 labels
SELECT subpath('electronics.computers.laptops', 1, 2);
-- Result: 'computers.laptops'

-- Get number of labels
SELECT nlevel('electronics.computers.laptops');
-- Result: 3
\`\`\`

Use \`pg_ltree_subpath\` for extraction.

## Available Tools

| Tool | Purpose |
|------|---------|
| \`pg_ltree_create_extension\` | Enable ltree |
| \`pg_ltree_query\` | Query ancestors/descendants |
| \`pg_ltree_subpath\` | Extract path segments |
| \`pg_ltree_lca\` | Find common ancestor |
| \`pg_ltree_match\` | Pattern matching |
| \`pg_ltree_list_columns\` | List ltree columns |
| \`pg_ltree_convert_column\` | Convert text to ltree |
| \`pg_ltree_create_index\` | Create GiST index |

## Indexing

\`\`\`sql
-- GiST index for hierarchical queries (recommended)
CREATE INDEX ON categories USING GIST (path);

-- B-tree for exact matches and sorting
CREATE INDEX ON categories (path);

-- GIN for full-text search in paths
CREATE INDEX ON categories USING GIN (path);
\`\`\`

## Best Practices

1. **Use GiST indexes** — Essential for hierarchical queries
2. **Keep labels short** — Long labels impact performance
3. **Use underscores not spaces** — Labels can't contain spaces
4. **Normalize paths** — Lowercase recommended for consistency
5. **Validate input** — Ensure path format before insert
6. **Consider path length** — Very deep hierarchies can be slow

## Common Pitfalls

- ❌ Forgetting GiST index (queries become slow)
- ❌ Using spaces or special chars in labels
- ❌ Not validating path format on insert
- ❌ Circular references (ltree doesn't prevent them)
- ❌ Moving nodes without updating all descendants

## Comparison with Adjacency List

| Feature | ltree | Adjacency List (parent_id) |
|---------|-------|---------------------------|
| Find descendants | ✓ Fast with index | Slow (recursive CTE) |
| Find ancestors | ✓ Fast with index | Slow (recursive CTE) |
| Move subtree | Requires updating all paths | Update one parent_id |
| Storage | Path in each row | Single integer |
| Insert | Simple | Simple |

**Pro Tip:** For ${useCase}, ltree queries are 10-100x faster than recursive CTEs for large hierarchies!`);
    },
  };
}
