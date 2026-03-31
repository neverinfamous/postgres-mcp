# Postgres-MCP Advanced Stress Tests

> **This document is optimized for AI agent consumption.** It provides context and execution rules for the advanced stress testing suite located in this directory.

This directory contains the "Second-Pass" advanced tests for the `postgres-mcp` tool groups. These tests simulate complex, edge-case, and boundary interactions using exclusively **Code Mode** (`pg_execute_code`).

## Pre-requisites

1. Basic deterministic tool group checklists (located in `../test-tool-groups/*.md`) MUST be successfully passed before running these advanced tests.
2. The testing database MUST be freshly seeded or reset to the baseline schema utilizing the `../reset-database.ps1` script to ensure deterministic results.

## Execution Parts

The original monolithic advanced stress testing suite was split into 22 granular parts to preserve agent attention spans and prevent LLM context window exhaustion. Each file strictly tests one major domain or cross-domain group.

| File | Primary Focus | Key Validations |
| ---- | ------------- | --------------- |
| `test-tools-advanced-core.md` | Core | Idempotent DDL bounds, boundary logic, state pollution testing. |
| `test-tools-advanced-transactions.md` | Transactions | Transaction rollback recovery, abandoned transactions, rapid state transitions. |
| `test-tools-advanced-jsonb.md` | JSONB | JSON object path mutation workflows, nested key operations. |
| `test-tools-advanced-text.md` | Text | Full-text search edge cases, dictionary normalization limits. |
| `test-tools-advanced-stats.md` | Stats | Statistical analysis edge cases, Top-N token payloads. |
| `test-tools-advanced-admin.md` | Admin | Query logging bounds, insight memo truncation handling. |
| `test-tools-advanced-vector.md` | Vector | Geometric correlations, HNSW index parameter limits. |
| `test-tools-advanced-performance.md` | Performance | Anomaly detection thresholds, explain plan payload truncations. |
| `test-tools-advanced-postgis.md` | PostGIS | Geometric out-of-bounds validations. |
| `test-tools-advanced-ltree.md` | Ltree | Path hierarchy node boundaries, missing l-nodes. |
| `test-tools-advanced-pgcrypto.md` | pgcrypto | Structured crypto errors, algorithm boundary validations. |
| `test-tools-advanced-citext.md` | Citext | Case-insensitive extension parity edge cases. |
| `test-tools-advanced-cron.md` | Cron | Missing schema boundaries for cron job triggers. |
| `test-tools-advanced-kcache.md` | KCache | KCache token exhaustion safeguards. |
| `test-tools-advanced-partman.md` | Partman | Idempotent partman schema routing logic boundaries. |
| `test-tools-advanced-introspection.md` | Introspection | Object discovery filters, non-existent relation handling. |
| `test-tools-advanced-migration.md` | Migration | Record-vs-apply tracking logic, self-referencing cascades. |
| `test-tools-advanced-backup.md` | Backup | V2 Backup volumeDrift parameters, missing snapshot checks. |
| `test-tools-advanced-cross-group.md` | Cross-Group | Multi-group memory retention limits, cross-domain integrity chaining. |
| `test-tools-advanced-monitoring.md` | Monitoring | Extreme limits testing for resource usage and dynamic alert thresholds limits. |
| `test-tools-advanced-schema.md` | Schema | Cascaded object dropping bounds, deep dependency checking, and extreme generation boundaries. |
| `test-tools-advanced-partitioning.md` | Partitioning | Deep partition structures, edge limits for range/list boundaries, massive attach routines. |

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
