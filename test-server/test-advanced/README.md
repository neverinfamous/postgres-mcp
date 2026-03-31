# Postgres-MCP Advanced Stress Tests

> **This document is optimized for AI agent consumption.** It provides context and execution rules for the advanced stress testing suite located in this directory.

This directory contains the "Second-Pass" advanced tests for the `postgres-mcp` tool groups. These tests simulate complex, edge-case, and boundary interactions using exclusively **Code Mode** (`pg_execute_code`).

## Pre-requisites

1. Basic deterministic tool group checklists (located in `../test-tool-groups/*.md`) MUST be successfully passed before running these advanced tests.
2. The testing database MUST be freshly seeded or reset to the baseline schema utilizing the `../reset-database.ps1` script to ensure deterministic results.

## Execution Parts

The original monolithic advanced stress testing suite was split into four manageable parts to preserve agent attention spans and prevent LLM context window exhaustion.

| File | Primary Focus | Key Validations |
| ---- | ------------- | --------------- |
| `test-tools-advanced-1.md` | Transactions, JSONB, Ltree, partial Core | Error propagation, boundary logic, rollback simulation, JSON object path extraction limits. |
| `test-tools-advanced-2.md` | Stats, Text, Vector, Admin | Maximum token/payload dimensions (Top N limits), Full-Text-Search edge cases, HNSW clustering constraints. |
| `test-tools-advanced-3.md` | Schema, Introspection, Performance, partial Core | Schema manipulation edge cases, memory footprint optimizations (e.g., `compact: true`), performance metric bounds. |
| `test-tools-advanced-4.md` | Partitioning, Partman, Cron, PostGIS, pgcrypto | Security/encryption bounds, geometric data handling timeouts, partman automated partition creation rollbacks. |

> **Note:** The exact tool group breakdown may shift over time. Always defer to the headings within the specific `.md` files to see what groups are covered in that pass.

## Agent Execution Protocol

When testing the contents of this directory, you MUST adhere to the following rules:

1. **Strict Code Mode Only:** All advanced stress tests must be executed entirely within the `node:worker_threads` sandbox via `pg_execute_code`. Direct component tool calls (e.g. `pg_schema_snapshot`) are explicitly forbidden here unless specifically instructed for baseline comparison.
2. **Sequential Grouping:** Because these operations are intensive, execute only **one markdown file at a time**. Report findings, fix errors, apply updates to the changelog, and commit the changes before advancing to the next file segment.
3. **Payload Optimization (Token Monitoring):** 
   - These tests deliberately trigger large responses and deep architectural nesting.
   - You MUST closely monitor the `metrics.tokenEstimate` value returned from the `pg_execute_code` payloads.
   - If extremely large unbounded responses are produced, this is flagged as a 📦 **Payload Issue**. You must halt and patch the source handler boundary constraints (e.g., restricting integer `limit` inputs or dynamically dropping table dimensions).
4. **Structured Error Adherence (`P154`):** When intentionally attempting boundary failure parameters (missing columns, invalid dimension types), assert that the adapter outputs a proper `PostgresMcpError` (e.g., `VALIDATION_ERROR` or `TABLE_NOT_FOUND`), rather than leaking raw postgres native syntax errors.
5. **No Persistent Pollution:** After finishing execution within a document, verify that all `stress_*` schema tables and functions generated within Code Mode have been safely `DROP`ped. No test state should bleed over into the next run.
