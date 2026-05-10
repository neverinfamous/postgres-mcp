## [Unreleased]

### Fixed
- Fixed an error parsing inconsistency in `pg_jsonb_diff` where providing missing parameters yielded a confusing validation error about arrays and primitive values instead of accurately reporting missing parameters.
- Clamped `limit` parameter to 100 max internally in `kcache` group tools instead of throwing a validation error for values > 100.
- Cast BIGINT fields (`reads`, `writes`, `read_bytes`) and NUMERIC percentages (`user_cpu_percent`, `cpu_time_percent`) to `float8` in `kcache` tools to ensure precise JS numerical formatting instead of returning string values.
