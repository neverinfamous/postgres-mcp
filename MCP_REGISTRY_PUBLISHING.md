# PostgreSQL MCP Server - MCP Registry Publishing Guide

*Last Updated October 13, 2025*

This document outlines how the PostgreSQL MCP Server is configured for publication to the [MCP Registry](https://registry.modelcontextprotocol.io/).

## 📋 Overview

The PostgreSQL MCP Server is configured for **hybrid deployment** with multiple package types:

- **PyPI Package**: `postgres-mcp-enhanced` v1.1.1
- **Docker Image**: `writenotenow/postgres-mcp-enhanced` v1.1.1
- **MCP Registry**: `io.github.neverinfamous/postgres-mcp-server`

## ✅ Configuration Complete

All necessary configuration for MCP Registry publishing has been completed:

### 1. Server Configuration (`server.json`)
- ✅ Created with MCP registry schema validation
- ✅ Defines both PyPI and Docker packages
- ✅ Version: 1.1.1
- ✅ Namespace: `io.github.neverinfamous/postgres-mcp-server`

### 2. Validation Markers

**PyPI Validation:**
- ✅ README.md contains: `<!-- mcp-name: io.github.neverinfamous/postgres-mcp-server -->`
- Location: Line 5 of README.md
- Purpose: MCP Registry validates ownership via PyPI package description

**Docker Validation:**
- ✅ Dockerfile contains: `LABEL io.modelcontextprotocol.server.name="io.github.neverinfamous/postgres-mcp-server"`
- Location: Line 57 of Dockerfile
- Purpose: MCP Registry validates ownership via Docker image labels

### 3. GitHub Actions Workflow

The existing `publish-pypi.yml` workflow has been enhanced with MCP Registry publishing:

**Workflow Structure:**
1. **Job 1: build-and-publish** - Publishes to PyPI
2. **Job 2: publish-to-mcp-registry** - Publishes to MCP Registry (depends on Job 1)

**Workflow Features:**
- ✅ Validates server.json version matches release version
- ✅ Verifies MCP validation markers in README and Dockerfile
- ✅ Checks PyPI package availability before MCP publishing
- ✅ Uses GitHub OIDC authentication (no manual token needed)
- ✅ Provides comprehensive publication summary

### 4. README Corrections

Fixed inconsistent Docker image references:
- ❌ Old: `neverinfamous/postgres-mcp:latest`
- ✅ New: `writenotenow/postgres-mcp-enhanced:latest`

## 🚀 Publishing Process

### Automated Publishing (Recommended)

The complete publishing process is automated via GitHub Actions:

```bash
# 1. Update version in pyproject.toml
# Current: version = "1.1.1"

# 2. Update version in server.json
# Current: "version": "1.1.1"

# 3. Commit and push changes
git add pyproject.toml server.json
git commit -m "chore: Bump version to 1.1.2"
git push origin main

# 4. Create and push version tag
git tag v1.1.2
git push origin v1.1.2

# 5. Create GitHub Release
gh release create v1.1.2 --title "v1.1.2" --notes "Release notes here"
```

### What the Workflow Does

When you create a GitHub release:

1. **PyPI Publishing:**
   - Builds Python package
   - Publishes to PyPI as `postgres-mcp-enhanced`
   - Verifies publication

2. **MCP Registry Publishing:**
   - Waits for PyPI package availability
   - Validates server.json schema
   - Verifies MCP markers in README and Dockerfile
   - Installs MCP Publisher CLI
   - Publishes to MCP Registry using GitHub OIDC
   - Verifies publication in registry

### Manual Publishing (Alternative)

If you need to publish manually:

```bash
# 1. Ensure you're on the correct version
grep version pyproject.toml
jq .version server.json

# 2. Install MCP Publisher CLI
curl -L "https://github.com/modelcontextprotocol/registry/releases/download/v1.0.0/mcp-publisher_1.0.0_windows_amd64.tar.gz" | tar xz
mv mcp-publisher.exe C:\Windows\System32\  # or add to PATH

# 3. Authenticate with GitHub
mcp-publisher login github

# 4. Publish to registry
mcp-publisher publish --verbose
```

## 📦 Package Information

### PyPI Package: `postgres-mcp-enhanced`
- **Current Version**: 1.1.1
- **Registry**: https://pypi.org/project/postgres-mcp-enhanced/
- **Installation**: `pip install postgres-mcp-enhanced`

### Docker Image: `writenotenow/postgres-mcp-enhanced`
- **Current Version**: v1.1.1, latest
- **Registry**: https://hub.docker.com/r/writenotenow/postgres-mcp-enhanced
- **Usage**: `docker pull writenotenow/postgres-mcp-enhanced:latest`

### MCP Registry: `io.github.neverinfamous/postgres-mcp-server`
- **Registry**: https://registry.modelcontextprotocol.io/
- **Search**: `io.github.neverinfamous/postgres-mcp-server`

## 🔍 Verification

### Check PyPI Package
```bash
pip index versions postgres-mcp-enhanced
curl -s "https://pypi.org/pypi/postgres-mcp-enhanced/json" | jq '.info.version'
```

### Check Docker Image
```bash
docker pull writenotenow/postgres-mcp-enhanced:latest
docker inspect writenotenow/postgres-mcp-enhanced:latest | jq '.[0].Config.Labels'
```

### Check MCP Registry
```bash
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.neverinfamous/postgres-mcp-server" | jq .
```

## 🐛 Troubleshooting

### Common Issues

**"Package validation failed"**
- Verify PyPI package contains MCP name in README
- Verify Docker image has correct label
- Check package versions match server.json

**"Authentication failed"**
- Ensure GitHub Actions has `id-token: write` permission
- Verify repository is under `neverinfamous` namespace
- Check GitHub OIDC token is available

**"Version already exists"**
- MCP Registry doesn't allow version overwrites
- Increment version in both pyproject.toml and server.json
- Create new release tag

**"PyPI package not found"**
- Wait 30-60 seconds for PyPI to index
- Workflow includes automatic retry logic
- Verify PyPI publishing succeeded first

### Verification Commands

```bash
# Validate server.json
python -m json.tool server.json

# Check MCP markers
grep "mcp-name:" README.md
grep "io.modelcontextprotocol.server.name" Dockerfile

# Test workflow locally (requires act)
gh act release -e .github/workflows/test-release.json
```

## 📚 Resources

- **MCP Registry**: https://registry.modelcontextprotocol.io/
- **MCP Documentation**: https://modelcontextprotocol.io/docs/
- **Publishing Guide**: https://github.com/modelcontextprotocol/registry/blob/main/docs/guides/publishing/publish-server.md
- **GitHub Actions Guide**: https://github.com/modelcontextprotocol/registry/blob/main/docs/guides/publishing/github-actions.md
- **Server Schema**: https://static.modelcontextprotocol.io/schemas/2025-09-16/server.schema.json

## 🎯 Next Steps

The configuration is complete and ready for publishing. To publish:

1. **Test First**: Create a test release with workflow_dispatch
2. **Verify**: Check all three registries (PyPI, Docker Hub, MCP)
3. **Document**: Update changelog and release notes
4. **Announce**: Share on social media, Reddit, HN, etc.

## 📝 Notes

- The MCP Registry publishing is integrated into the existing PyPI workflow
- No separate workflow needed - everything runs on release creation
- GitHub OIDC authentication is automatic in GitHub Actions
- All validation checks run before attempting to publish
- Comprehensive summary provided in GitHub Actions output

---

*Configuration completed October 13, 2025*

