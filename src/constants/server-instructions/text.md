# Text Tools

- `pg_text_search`/`pg_text_rank`: Column must be `text` type—pre-built `tsvector` columns are **not** supported (wrap with `to_tsvector()` fails on tsvector input). Use `pg_read_query` with raw FTS SQL for tsvector columns
- `pg_create_fts_index`: Returns `{success, index, config, skipped}`. `skipped: true` = index already existed (IF NOT EXISTS). `ifNotExists` defaults to `true`

Defaults: `threshold`=0.3 (use 0.1-0.2 for partial), `maxDistance`=3 (use 5+ for longer strings)

- All text tools support `schema.table` format (auto-parsed, embedded schema takes priority over explicit `schema` param)
- `pg_text_search`: Supports both `column` (singular string) and `columns` (array). Either is valid—`column` auto-converts to array
- 📦 **AI-Optimized Payloads**: All row-returning text tools (`pg_text_search`, `pg_text_rank`, `pg_text_headline`, `pg_trigram_similarity`, `pg_fuzzy_match`, `pg_regexp_match`, `pg_like_search`) default to 100 results. Returns `truncated: true` + `hint` when capped. Use `limit: 0` for all rows
- `pg_fuzzy_match`: Levenshtein returns distance (lower=better). Soundex/metaphone return phonetic codes (exact match only). ⛔ Invalid `method` values throw error with valid options
- `pg_text_normalize`: Removes accents only (unaccent). Does NOT lowercase/trim
- 📍 **Table vs Standalone**: `normalize`, `sentiment`, `toVector`, `toQuery`, `searchConfig` are standalone (text input only). For phonetic matching: use `pg_fuzzy_match` with `method: 'soundex'|'metaphone'` (direct MCP), or `pg.text.soundex()`/`pg.text.metaphone()` (Code Mode convenience wrappers that call fuzzyMatch internally)

**Top-Level Aliases**: `pg.textSearch()`, `pg.textRank()`, `pg.textHeadline()`, `pg.textNormalize()`, `pg.textSentiment()`, `pg.textToVector()`, `pg.textToQuery()`, `pg.textSearchConfig()`, `pg.textTrigramSimilarity()`, `pg.textFuzzyMatch()`, `pg.textLikeSearch()`, `pg.textRegexpMatch()`, `pg.textCreateFtsIndex()`
