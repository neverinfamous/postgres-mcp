# MCP Server Pre-Flight Check — postgres-mcp

> **Purpose:** Validate that slim instructions, help resources, and data resources are working correctly before running full test passes. Run this in a fresh conversation with the server enabled.

Do NOT read any files from disk. Answer using ONLY what you received via MCP initialization and resource reads.

## Step 1: Instructions Audit

Report exactly what you received in the MCP server instructions during initialization:

- Paste the FULL raw text you received (use a code block)
- Character count of the instructions
- Does it mention help resources? If so, what URIs?
- Does it contain detailed tool parameter tables or response structure docs? (It should NOT)

## Step 2: Help Resource Access

Read the main help resource `postgres://help`. Report:

- Did it succeed?
- Approximate character count of the content
- First 3 lines of content

Then read ONE group-specific help resource (e.g., `postgres://help/core`, `postgres://help/jsonb`, or whichever is available). Report:

- Which URI did you read?
- Did it succeed?
- Does it contain tool-specific parameter details and response structures?

## Step 3: Data Resource Access

Read the schema resource `postgres://schema`. Report:

- Did it succeed?
- How many tables are listed?

## Step 4: Tool Inventory

List the tool groups you see and count of tools per group. Do NOT call any tools — just report what's in your tool list.

## Step 5: Verdict

Based on steps 1-4, answer:

| #   | Check                                                      | Result   |
| --- | ---------------------------------------------------------- | -------- |
| 1   | Instructions are slim (<1000 chars), not monolithic        | ✅ or ❌ |
| 2   | Instructions reference help resources (`postgres://help`)  | ✅ or ❌ |
| 3   | Main help resource is readable                             | ✅ or ❌ |
| 4   | Group-specific help resource is readable                   | ✅ or ❌ |
| 5   | Data resources are readable                                | ✅ or ❌ |
| 6   | Tool count matches expected for configured `--tool-filter` | ✅ or ❌ |
| 7   | No detailed parameter tables leaked into instructions      | ✅ or ❌ |
