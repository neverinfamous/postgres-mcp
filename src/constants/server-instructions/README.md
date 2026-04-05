# Server Instructions Overview

**🤖 AGENT OPTIMIZED README**

This directory contains the Markdown files that serve as the foundation for the `postgres-mcp` dynamic help system. These files are presented directly to AI agents making context-gathering queries.

## ⚠️ Critical Workflow

**DO NOT** edit `src/constants/server-instructions.ts` directly. It is auto-generated.

If you need to update a tool group's instructions or the general gotchas, follow these steps:

1. Modify the relevant `.md` file in this directory (e.g., `gotchas.md`, `core.md`, etc.).
2. Run the generator script to compile these markdown files into the TypeScript constant map:
   ```bash
   npm run generate:instructions
   ```
   _(or `npx tsx scripts/generate-server-instructions.ts`)_
3. The generator script converts your markdown into escaped strings embedded in the `server-instructions.ts` generated code.
4. **Never** attempt to add `README.md` into the generator logic. The generation script automatically ignores any file ending in `.md` and starting with `readme` (case-insensitive).

## File Structure

- `overview.md`: The minimal core instructions sent to all clients on initialization. Keep this extremely short (~150 tokens) to preserve context limits.
- `gotchas.md`: The core help payload returned for `postgres://help`. Contains critical usage patterns across the entire extension.
- `[group-name].md`: Group-specific hints returned by `postgres://help/[group-name]` (e.g., `postgres://help/jsonb`).

## Guidelines

- Write strictly for AI consumption (concise, rule-based, clear mappings).
- Use code blocks for specific exact schemas/examples.
- Watch payload sizes; do not put the entire documentation in here.
