# Contributing to PostgreSQL MCP Server

Thank you for your interest in contributing to the PostgreSQL MCP Server! This document provides guidelines for contributing to the project.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples** with code snippets if applicable
- **Describe the behavior you observed** and what you expected
- **Include environment details** (OS, Python version, PostgreSQL version)

### Suggesting Enhancements

Enhancement suggestions are welcome! Please provide:

- **A clear and descriptive title**
- **A detailed description** of the proposed enhancement
- **Use cases** that would benefit from this enhancement
- **Examples** of how the enhancement would be used

### Security Vulnerabilities

**Do not report security vulnerabilities through public GitHub issues.** Please follow our [Security Policy](SECURITY.md) for responsible disclosure.

## Development Process

### Setting Up Development Environment

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/neverinfamous/postgres-mcp.git
   cd postgres-mcp
   ```

2. **Set up Python environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -e .
   ```

3. **Install development dependencies**
   ```bash
   pip install -r requirements-dev.txt
   ```

4. **Set up PostgreSQL for testing**
   ```bash
   # Using Docker (recommended)
   docker run --name postgres-test -e POSTGRES_PASSWORD=test -p 5432:5432 -d postgres:latest
   ```

### Running Tests

```bash
# Run all tests
python -m pytest tests/

# Run security tests
python run_security_test.py

# Run specific test file
python -m pytest tests/test_specific.py

# Run with coverage
python -m pytest --cov=src tests/
```

### Code Style

We follow Python best practices:

- **PEP 8** for code style
- **Type hints** for function signatures
- **Docstrings** for all public functions and classes
- **Black** for code formatting
- **isort** for import sorting

```bash
# Format code
black src/ tests/
isort src/ tests/

# Check formatting
black --check src/ tests/
isort --check-only src/ tests/
```

### Commit Guidelines

- Use clear and meaningful commit messages
- Follow conventional commit format when possible:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `test:` for test additions/changes
  - `refactor:` for code refactoring
  - `security:` for security-related changes

Example:
```
feat: add parameter binding support to execute_sql

- Adds params parameter for SQL injection prevention
- Maintains backward compatibility
- Includes comprehensive tests
```

## Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the development guidelines

3. **Add or update tests** for your changes

4. **Run the test suite** to ensure everything passes

5. **Update documentation** if needed

6. **Create a pull request** with:
   - Clear title and description
   - Reference to related issues
   - List of changes made
   - Screenshots/examples if applicable

### Pull Request Requirements

- All tests must pass
- Code coverage should not decrease
- Security tests must pass
- Documentation must be updated for new features
- Commit messages should be clear and descriptive

## Development Guidelines

### Adding New Tools

When adding new MCP tools:

1. **Define the tool** in `src/postgres_mcp/server.py`
2. **Add comprehensive tests** in `tests/`
3. **Update documentation** with examples
4. **Consider security implications** and add appropriate validation
5. **Test with both restricted and unrestricted modes**

### Security Considerations

- Always use parameter binding for user input
- Validate SQL queries in restricted mode
- Sanitize error messages to prevent information disclosure
- Add security tests for new functionality
- Follow the principle of least privilege

### Testing Guidelines

- Write tests for both success and failure cases
- Include edge cases and boundary conditions
- Test security implications thoroughly
- Use descriptive test names and docstrings
- Mock external dependencies appropriately

## Documentation

- Update README.md for significant changes
- Add docstrings for all new functions and classes
- Include examples in docstrings
- Update security documentation for security-related changes
- Keep CHANGELOG.md updated

## Community

- Be respectful and inclusive
- Help others learn and contribute
- Share knowledge and best practices
- Provide constructive feedback
- Follow the Code of Conduct

## Questions?

If you have questions about contributing, please:

1. Check existing documentation and issues
2. Ask in GitHub Discussions
3. Contact the maintainers at admin@adamic.tech

Thank you for contributing to PostgreSQL MCP Server!
