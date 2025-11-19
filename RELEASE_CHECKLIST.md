# AgentHub Release Checklist

This document provides a step-by-step guide for preparing and executing a release of AgentHub.

## Pre-Release Preparation

### 1. Version Bump Checklist ✅
Before creating a release, ensure ALL version numbers are updated consistently:

- [ ] **package.json**: `"version": "X.Y.Z"`
- [ ] **package-lock.json**: Run `npm install` after updating package.json
- [ ] **server.json**: Update BOTH version fields:
  - Root level: `"version": "X.Y.Z"`
  - Under packages: `"version": "X.Y.Z"`
- [ ] **CHANGELOG.md**: Add new version section with release date

### 2. Code Quality Checks
```bash
# Run all quality checks
npm run check

# Run all tests
npm test

# Build to verify
npm run build
```

### 3. Documentation Updates
- [ ] Update README.md if needed
- [ ] Update CHANGELOG.md with all changes
- [ ] Review and update API documentation

## Release Process

### Step 1: Create Feature Branch
```bash
git checkout -b feature/vX.Y.Z-release
```

### Step 2: Update All Version Files
```bash
# Update package version (without git tag)
npm version X.Y.Z --no-git-tag-version

# Manually update server.json (BOTH version fields!)
# Edit server.json and update:
# - "version": "X.Y.Z"
# - packages[0].version: "X.Y.Z"
```

### Step 3: Commit Version Changes
```bash
git add package.json package-lock.json server.json CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z"
```

### Step 4: Create Pull Request
```bash
git push -u origin feature/vX.Y.Z-release
gh pr create --title "chore: release vX.Y.Z" --body "Release vX.Y.Z with [brief description]"
```

### Step 5: After PR Merge
```bash
# Switch to main and pull
git checkout main
git pull origin main

# Create and push release tag
git tag -a vX.Y.Z -m "Release vX.Y.Z: [brief description]"
git push origin vX.Y.Z
```

### Step 6: Monitor Release Pipeline
```bash
# Watch the release workflow
gh run list --workflow=release.yml --limit=1
gh run watch [RUN_ID]
```

## Post-Release Verification

### 1. Verify npm Package
```bash
npm view @propstreet/agenthub@X.Y.Z
```

### 2. Verify MCP Registry
Check: https://registry.modelcontextprotocol.io/servers/io.github.propstreet/agenthub

### 3. Verify GitHub Release
Check: https://github.com/propstreet/agenthub/releases/tag/vX.Y.Z

## Common Issues & Solutions

### Issue: MCP Registry "duplicate version" error
**Cause**: server.json version not updated
**Solution**: Update both version fields in server.json and re-release

### Issue: npm publish fails with 403
**Cause**: OIDC authentication not configured
**Solution**: Ensure GitHub Actions has proper permissions in package.json publishConfig

### Issue: Release workflow fails at build
**Cause**: TypeScript or test errors
**Solution**: Run `npm run check` and `npm test` locally first

## Version Numbering Guidelines

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (0.Y.0): New features, backward compatible
- **PATCH** (0.0.Z): Bug fixes, backward compatible

## Files That Need Version Updates

| File | Fields to Update | Example |
|------|------------------|---------|
| package.json | `"version"` | `"version": "1.1.0"` |
| package-lock.json | Auto-updated via `npm install` | N/A |
| server.json | `"version"` (root) AND `packages[0].version` | `"version": "1.1.0"` |
| CHANGELOG.md | Add new version section | `## [1.1.0] - 2025-11-19` |

## Automation Notes

The release workflow (`/.github/workflows/release.yml`) is triggered by pushing a tag matching `v*.*.*`. It will:
1. Run all tests on Node 22, 24, 25
2. Build the project
3. Publish to npm via OIDC (no token needed)
4. Publish to MCP Registry
5. Create GitHub Release

**Important**: The workflow expects all version numbers to be consistent across files!

---
*Last updated: 2025-11-19*
*Lesson learned: Always update server.json versions before releasing!*