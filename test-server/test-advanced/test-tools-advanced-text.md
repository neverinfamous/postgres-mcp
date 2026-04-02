# Advanced Stress Test — postgres-mcp — text Group

**ESSENTIAL INSTRUCTIONS**

- Execute **EVERY** numbered stress test below using code mode (`pg_execute_code`).
- Do not use scripts or terminal to replace planned tests.
- Do not modify or skip tests.
- Do not run any other test files.
- All changes **MUST** be consistent with other postgres-mcp tools and `code-map.md`.
- Do not do anything other than these tests. Ignore distractions in terminal.
- Please let me handle Lint, typecheck, vitest, and playwright. You cannot restart the server in antigravity as the cache has to be refreshed manually.

## Code Mode Execution

All tests should be executed via `pg_execute_code` code mode. Tests are written in direct tool call syntax for readability — translate to code mode:

| Direct Tool Call                                     | Code Mode Equivalent                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `pg_text_search(...)`                                | `pg.text.search(...)`                                          |
| `pg_regexp_match(...)`                               | `pg.text.regexpMatch(...)`                                     |
| `pg_trigram_similarity(...)`                         | `pg.text.trigramSimilarity(...)`                               |
| `pg_*(...)`                                          | `pg.text.*(...)`                                               |

**Key rules:**
- Use `pg.<group>.help()` to discover method names and parameters for each group
- State **persists** across `pg_execute_code` calls
- Group multiple related tests into a single code mode call when practical

## Naming & Cleanup

- **Temporary testing states**: Prefix testing structures with `stress_text_`
- **Cleanup**: `pg_drop_table` on cleanly populated items.

## Reporting Format

- ❌ Fail: Tool errors or produces incorrect results (include error message)
- ⚠️ Issue: Unexpected behavior or improvement opportunity
- 📦 Payload: Unnecessarily large response that should be optimized. **You MUST monitor `metrics.tokenEstimate` for every operation**. Report the response size in tokens/KB and suggest a concrete optimization.
- ✅ Confirmed: Edge case handled correctly (use only inline during testing).

### Error Code Consistency

When rating errors, flag any generic code (`RESOURCE_ERROR`, `UNKNOWN_ERROR`) that should be a specific code (e.g., `VALIDATION_ERROR`, `COLUMN_NOT_FOUND`, `TABLE_NOT_FOUND`, `EXTENSION_MISSING`).

## Post-Test Procedures

1. **Fix EVERY finding** — not just ❌ Fails, but also ⚠️ Issues including behavioral improvements, missing warnings, error code consistency, inaccuracies in this prompt (test-tools-advanced-text.md) and 📦 Payload problems (responses that should be truncated or offer a `limit` param).
2. Update the changelog if there are any changes made (being careful not to create duplicate headers) and commit without pushing.
3. **Token Audit**: Sum the `metrics.tokenEstimate` from all your `pg_execute_code` executions and report the **Total Tokens Used** for this test pass, not counting this testing prompt itself. Highlight the single most expensive code mode block.
4. Stop and briefly summarize the testing results and fixes, ensuring the total token count is prominently displayed.

---

## text Group Advanced Tests

### text Group Tools (13 + 1 code mode)

1. `pg_text_search`
2. `pg_text_rank`
3. `pg_trigram_similarity`
4. `pg_fuzzy_match`
5. `pg_regexp_match`
6. `pg_like_search`
7. `pg_text_headline`
8. `pg_create_fts_index`
9. `pg_text_normalize`
10. `pg_text_sentiment`
11. `pg_text_to_vector`
12. `pg_text_to_query`
13. `pg_text_search_config`
14. `pg_execute_code` (auto-added)

### Category 1: Boundary Values & Empty States

Test tools against extreme characters, non-applicable parameters, and zero-state topologies.

1. `pg_text_search` → Execute query search mappings natively parsing explicitly perfectly empty queries (`query: ""`). Check Postgres bounds behavior natively versus trapping mappings inside Zod.
2. `pg_trigram_similarity` → Pass explicitly negative mapping thresholds dynamically `threshold: -0.5`. Verify parameters bounds assert locally mapped Zod formats correctly natively tracking bounds limits correctly before throwing parsing anomalies cleanly.
3. `pg_fuzzy_match` → Test explicitly massive bounds checks. Map execution mappings against `maxDistance: 99999999`.

### Category 2: State Pollution & Idempotency

Ensure tools execute safely when repeated identically multiple times.

4. `pg_create_fts_index` → Double-execute cleanly on identical active code test columns to securely natively verify the query handler correctly bypasses `IF NOT EXISTS` style logic tracking gracefully safely natively.

### Category 3: Alias & Parameter Combinations

Test parametric fallback modes and configuration matrices.

5. `pg_fuzzy_match` → Swap internal method algorithms parametrically checking `levenshtein` natively mapping back dynamically to `damerau-levenshtein` directly querying matching sets. Confirm identical variables compute properly safely natively.
6. `pg_text_headline` → Dynamically manipulate config mapping dictionaries locally pushing custom language mappings. Verify standard English configurations execute boundaries across parser mapping properties accurately smoothly natively.

### Category 4: Error Message Quality

Ensure tools predictably return typed `VALIDATION_ERROR`, etc.

7. `pg_text_search` → Map text FTS queries natively pushing explicit targets against purely numeric structural columns (e.g., `BIGINT` ID mappings). Confirm typed exception driver map parsing traps strictly inside generic mapping types (`VALIDATION_ERROR`).
8. `pg_regexp_match` → Inject intentionally invalid regex structures (`pattern: "[invalid]("`) securely into the mapping mapping logic directly natively natively natively safely gracefully wrapping parsing limits cleanly over engine syntax crash wrappers softly natively mapping exception codes natively.

### Category 5: Complex Flow Architectures

Verify that complex native functions execute logic correctly dynamically.

9. Multi-Step Query Flow -> Use Javascript within Sandbox layer seamlessly natively safely gracefully wrapping mapping boundaries cleanly over execution layers:
    a) Construct `pg_text_to_query` from a raw phrase dynamically mapping cleanly.
    b) Pass that dynamically mapped variable perfectly cleanly directly into `pg_text_search` purely across internal Javascript layers securely natively tracking maps dynamically mapped safely efficiently wrapping variables limits perfectly tracking parsing variables securely locally smoothly securely gracefully safely efficiently securely perfectly dynamically natively natively purely securely natively safely boundaries directly parsing correctly inside memory purely seamlessly. Validate token sizes correctly safely natively cleanly mapping mappings internally. 

### Category 6: Extended Cross-Schema Formatting

10. `pg_text_search_config` → Trace execution mappings spanning non-default indexing dictionaries correctly seamlessly bounding mappings logically locally purely securely dynamically properly wrapped seamlessly logic correctly parsing natively.

### Category 7: Large Payload & Truncation Verification

Ensure sweeping reads cap context window exposure.

11. `pg_like_search` → Map universal search mapping properties (`%`) against the highest row count database table available safely mapped perfectly natively bounded flawlessly against `.limit` properties explicitly confirming default token window mappings native restrictions accurately (`metrics.tokenEstimate`). Does the payload logic clip mapping data accurately perfectly securely natively properly smartly natively securely cleanly smartly dynamically correctly smoothly natively?

### Final Cleanup

12. Native Execution -> Drop any experimental tables or FTS structures natively created.
