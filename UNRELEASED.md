# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Connection Pool**: `initializationSql` config to execute session setup queries once per connection checkout. Uses `WeakSet` for zero-GC-overhead deduplication. Applies to both `getConnection()` and `query()` paths.
