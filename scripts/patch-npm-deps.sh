#!/bin/sh
# postgres-mcp — Patch npm bundled dependencies
#
# Single source of truth for all CVE-related npm bundled dependency patches.
# Called from both builder and production stages to avoid drift.
#
# Usage: sh scripts/patch-npm-deps.sh [--clean-cache]
#   --clean-cache  Also purge npm cache and /root/.npm after patching

set -eu

NPM_DIR=/usr/local/lib/node_modules/npm

# Fix GHSA-73rr-hh4g-fpgx: diff → 9.0.0
cd "$NPM_DIR"
npm pack diff@9.0.0
rm -rf node_modules/diff
tar -xzf diff-9.0.0.tgz
mv package node_modules/diff
rm diff-9.0.0.tgz

# Fix CVE-2026-25547: @isaacs/brace-expansion → 5.0.1
cd "$NPM_DIR"
npm pack @isaacs/brace-expansion@5.0.1
rm -rf node_modules/@isaacs/brace-expansion
mkdir -p node_modules/@isaacs
tar -xzf isaacs-brace-expansion-5.0.1.tgz
mv package node_modules/@isaacs/brace-expansion
rm isaacs-brace-expansion-5.0.1.tgz

# Fix CVE-2026-23950, CVE-2026-24842: tar → 7.5.15
cd "$NPM_DIR"
npm pack tar@7.5.15
rm -rf node_modules/tar
tar -xzf tar-7.5.15.tgz
mv package node_modules/tar
rm tar-7.5.15.tgz

# Fix CVE-2026-27904, CVE-2026-27903: minimatch → 10.2.5
cd "$NPM_DIR"
npm pack minimatch@10.2.5
rm -rf node_modules/minimatch
tar -xzf minimatch-10.2.5.tgz
mv package node_modules/minimatch
rm minimatch-10.2.5.tgz

# Fix CVE-2026-33671, CVE-2026-33672: picomatch → 4.0.4 (top-level + nested in tinyglobby)
cd "$NPM_DIR"
npm pack picomatch@4.0.4
rm -rf node_modules/picomatch
rm -rf node_modules/tinyglobby/node_modules/picomatch
tar -xzf picomatch-4.0.4.tgz
cp -a package node_modules/picomatch
mkdir -p node_modules/tinyglobby/node_modules
cp -a package node_modules/tinyglobby/node_modules/picomatch
rm -rf package picomatch-4.0.4.tgz

# Fix CVE-2026-33750: brace-expansion → 5.0.6
cd "$NPM_DIR"
npm pack brace-expansion@5.0.6
rm -rf node_modules/brace-expansion
tar -xzf brace-expansion-5.0.6.tgz
mv package node_modules/brace-expansion
rm brace-expansion-5.0.6.tgz

# Optional cache cleanup (used in production stage to keep image lean)
if [ "${1:-}" = "--clean-cache" ]; then
  npm cache clean --force
  rm -rf /root/.npm
fi
