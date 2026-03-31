# Postgres-MCP Advanced Stress Tests

> **This document is optimized for AI agent consumption.** It provides context and execution rules for the advanced stress testing suite located in this directory.

This directory contains the "Second-Pass" advanced tests for the `postgres-mcp` tool groups. These tests simulate complex, edge-case, and boundary interactions using exclusively **Code Mode** (`pg_execute_code`).

## Pre-requisites

1. Basic deterministic tool group checklists (located in `../test-tool-groups/*.md`) MUST be successfully passed before running these advanced tests.
2. The testing database MUST be freshly seeded or reset to the baseline schema utilizing the `../reset-database.ps1` script to ensure deterministic results.

## Execution Parts

The original monolithic advanced stress testing suite was split into eight manageable parts to preserve agent attention spans and prevent LLM context window exhaustion.

| File | Primary Focus | Key Validations |
| ---- | ------------- | --------------- |
| `test-tools-advanced-1.md` | Core, Transactions | Transaction rollback recovery, idempotent DDL bounds, boundary logic, state pollution testing. |
| `test-tools-advanced-2.md` | JSONB, Text | JSON object path mutation workflows, full-text search parameters edge-cases. |
| `test-tools-advanced-3.md` | Stats, Admin | Statistical analysis edge cases, Top-N token payloads, admin query logging bounds. |
| `test-tools-advanced-4.md` | Vector, Performance | Anomaly detection thresholds, geometric correlations, HNSW index parameter limits. |
| `test-tools-advanced-5.md` | PostGIS, Ltree, pgcrypto | Geometric out-of-bounds validations, path hierarchy boundaries, structured crypto errors. |
| `test-tools-advanced-6.md` | Citext, Cron, KCache, Partman | KCache token exhaustion safeguards, idempotent partman schema routing logic boundaries. |
| `test-tools-advanced-7.md` | Introspection, Migration | Object discovery filters, record-vs-apply tracking logic, self-referencing cascades. |
| `test-tools-advanced-8.md` | Backup, Cross-Group | V2 Backup volumeDrift parameters, audit interceptor code-mode coverage, multi-group memory retention limits. |

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
