## [Unreleased]

### Fixed
- Fixed an error parsing inconsistency in `pg_jsonb_diff` where providing missing parameters yielded a confusing validation error about arrays and primitive values instead of accurately reporting missing parameters.
