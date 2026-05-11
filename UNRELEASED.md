## [Unreleased]

### Fixed
- Fixed an error parsing inconsistency in `pg_jsonb_diff` where providing missing parameters yielded a confusing validation error about arrays and primitive values instead of accurately reporting missing parameters.
- Clamped `limit` parameter to 100 max internally in `kcache` group tools instead of throwing a validation error for values > 100.
- Cast BIGINT fields (`reads`, `writes`, `read_bytes`) and NUMERIC percentages (`user_cpu_percent`, `cpu_time_percent`) to `float8` in `kcache` tools to ensure precise JS numerical formatting instead of returning string values.
- Fixed a cross-schema scoping inconsistency in the `migration` tools by adding support for and passing down the optional `schema` parameter to all internal tracking table queries rather than implicitly defaulting to `public` during execution.
- Fixed an internal handler error where Zod validation failures were leaking as raw JSON error strings instead of structured error responses (`isZodLikeError` function was failing `instanceof Error` checks across modules).
- Fixed a parameter alias resolution bug in the `schema` tools where the `sequence` alias was not natively mapping through Zod preprocessing on the backend, leading to incorrect validation failures during `pg_create_sequence` and `pg_drop_sequence` operations.
- Fixed a PostgreSQL error parsing miss where sequence boundary breaches (error code 2200H) were returned as unhandled `QUERY_ERROR` exceptions instead of mapping into structured `VALIDATION_ERROR` responses with correct user suggestions.
- Fixed a sequence bounds alias resolution bug in the `schema` tools where the `maxvalue` and `minvalue` lowercased SQL-native aliases were ignored during `pg_create_sequence` preprocessing.
- Clamped `limit` and `n` parameters in `stats` group tools (`pg_stats_top_n`, `pg_stats_distinct`, `pg_stats_frequency`) to their maximum allowed values instead of throwing validation errors.
