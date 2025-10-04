# Pull Request

## Description

<!-- Provide a clear and concise description of your changes -->

## Type of Change

<!-- Mark the relevant option with an "x" -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📚 Documentation update
- [ ] 🔒 Security fix
- [ ] ⚡ Performance improvement
- [ ] ♻️ Code refactoring
- [ ] ✅ Test update/addition
- [ ] 🔧 Configuration change
- [ ] 🏗️ Build/dependency update

## Related Issues

<!-- Link to related issues using keywords like "Fixes #123" or "Relates to #456" -->

Fixes #
Relates to #

## Changes Made

<!-- List the specific changes made in this PR -->

- 
- 
- 

## Motivation and Context

<!-- Why is this change required? What problem does it solve? -->

## Testing Performed

<!-- Describe the testing you've done to verify your changes -->

### Test Environment
- PostgreSQL Version: 
- Python Version: 
- OS: 
- Installation Method: 

### Test Results
- [ ] All existing tests pass
- [ ] New tests added and passing
- [ ] Manual testing completed
- [ ] Security testing performed (if applicable)

### Test Commands Run
```bash
# Example:
uv run pytest -v
python security/run_security_test.py
```

## Screenshots (if applicable)

<!-- Add screenshots to demonstrate visual changes -->

## Documentation

- [ ] Code comments added/updated
- [ ] Wiki documentation updated
- [ ] README.md updated (if needed)
- [ ] CHANGELOG updated (if applicable)
- [ ] Docstrings added/updated
- [ ] Type hints added/updated

## Security Checklist

<!-- For any changes that could affect security -->

- [ ] No SQL injection vulnerabilities introduced
- [ ] Parameter binding used for all dynamic queries
- [ ] Input validation implemented
- [ ] Security tests added/updated
- [ ] No sensitive information exposed in logs
- [ ] Access control properly enforced
- [ ] N/A - This PR doesn't affect security

## Performance Impact

<!-- Describe any performance implications of your changes -->

- [ ] No performance impact
- [ ] Performance improved
- [ ] Potential performance impact (explain below)
- [ ] Performance impact measured and acceptable

## Breaking Changes

<!-- If this is a breaking change, describe the impact and migration path -->

**Impact:**

**Migration Guide:**

## Backward Compatibility

- [ ] Fully backward compatible
- [ ] Deprecated features (with migration path)
- [ ] Breaking changes (documented above)

## Dependencies

<!-- List any new dependencies added or updated -->

- [ ] No new dependencies
- [ ] New dependencies added (list below)
- [ ] Dependencies updated (list below)

**New/Updated Dependencies:**

## Checklist

<!-- Ensure all items are checked before submitting -->

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings or errors
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published
- [ ] I have checked my code and corrected any misspellings
- [ ] I have read and followed the [Contributing Guidelines](../CONTRIBUTING.md)
- [ ] I have read and agree to the [Code of Conduct](../CODE_OF_CONDUCT.md)

## PostgreSQL Compatibility

<!-- Mark all versions you've tested with -->

- [ ] PostgreSQL 13
- [ ] PostgreSQL 14
- [ ] PostgreSQL 15
- [ ] PostgreSQL 16
- [ ] PostgreSQL 17

## Extension Compatibility

<!-- Mark if your changes affect or require specific extensions -->

- [ ] pg_stat_statements
- [ ] hypopg
- [ ] pgvector
- [ ] PostGIS
- [ ] pg_trgm
- [ ] fuzzystrmatch
- [ ] N/A - No extension dependencies

## Deployment Notes

<!-- Any special considerations for deploying this change? -->

## Additional Notes

<!-- Any additional information that reviewers should know -->

---

**By submitting this pull request, I confirm that my contribution is made under the terms of the MIT license.**

