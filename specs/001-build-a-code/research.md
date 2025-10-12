# Research Document: Code-Index CLI Tool

**Date**: 2025-01-12
**Feature**: Code-Index CLI Tool
**Branch**: `001-build-a-code`

## Overview

This document captures all research decisions and technology choices for the code-index CLI tool implementation, resolving all NEEDS CLARIFICATION items from the implementation plan.

## Technology Decisions

### 1. SQLite Driver

**Decision**: `better-sqlite3`

**Rationale**:
- **Performance**: 3-24x faster than alternatives for bulk operations (critical for SC-002: 1,000 files/sec)
- **Zero dependencies**: Aligns with offline-first requirement (FR-012)
- **Synchronous API**: Perfect for CLI tools where blocking is acceptable
- **Production-ready**: Used by 170k+ GitHub projects, actively maintained
- **TypeScript support**: Excellent type definitions via @types/better-sqlite3

**Alternatives considered**:
- `sqlite3`: Slower (async overhead), less maintained (last update 2 years ago)
- `node:sqlite`: Too new (experimental), requires Node.js flags, API may change

**Implementation details**:
```bash
npm install better-sqlite3
npm install --save-dev @types/better-sqlite3
```

### 2. CLI Framework

**Decision**: `commander`

**Rationale**:
- **Zero dependencies**: Minimal footprint (208 kB unpacked), fastest startup
- **Maturity**: 14 years old, 222M+ weekly downloads, proven reliability
- **Built-in TypeScript**: Native type declarations, no external packages needed
- **Simple API**: Intuitive fluent interface for subcommands and options
- **Cross-platform**: Works identically on Windows, macOS, Linux (SC-009)
- **Help generation**: Built-in support for FR-013 (--help flag requirement)

**Alternatives considered**:
- `clipanion`: Strong TypeScript support but smaller community, RC version
- `oclif`: Too heavy (18 dependencies), overkill for single-purpose tool
- `yargs`: 6 dependencies, external TypeScript types needed
- `stricli`: Too new (released Oct 2024), smaller ecosystem

### 3. Gitignore Parser

**Decision**: `ignore`

**Rationale**:
- **Best spec compliance**: 500+ tests verified against git check-ignore
- **Industry standard**: Used by eslint, prettier (110M+ weekly downloads)
- **Minimal size**: Only 2 kB gzipped, zero dependencies
- **Built-in TypeScript**: Native type declarations included
- **Flexibility**: Control over directory walking for performance optimization

**Alternatives considered**:
- `@npmcli/ignore-walk`: Higher-level but less control over traversal
- `gitignore-parser`: Unmaintained (last update 11 years ago)
- `fast-ignore`: Low adoption, less proven

**Implementation note**: Will implement nested .gitignore handling manually during directory traversal for maximum control and performance.

### 4. Testing Framework

**Decision**: `vitest`

**Rationale**:
- **TypeScript native**: Zero configuration needed, works out of the box
- **Fast execution**: 10-20x faster than Jest in watch mode
- **Jest-compatible**: Familiar API, easy learning curve
- **Complete features**: Built-in mocking, coverage, snapshots, parallel execution
- **Modern architecture**: ESM-first design aligns with Node.js 20+
- **Active maintenance**: Part of Vite ecosystem, rapid development

**Alternatives considered**:
- `node:test`: Good but missing snapshots, timer mocking
- `jest`: Not TypeScript native, large dependency footprint (277+ deps)
- `mocha`: Requires additional libraries for assertions and mocking

## Additional Technology Choices

### 5. Package Manager

**Decision**: `npm` (default with Node.js)

**Rationale**: Universal availability, no additional installation needed, aligns with npm package distribution (@squirrelogic/code-index).

### 6. Build Tool

**Decision**: `tsc` (TypeScript Compiler) directly

**Rationale**: Simple CLI tool doesn't need bundling complexity. TypeScript compiler is sufficient for transpilation.

### 7. Code Formatter

**Decision**: `prettier`

**Rationale**: Industry standard, zero-config approach, excellent TypeScript support.

### 8. Linter

**Decision**: `eslint` with TypeScript plugin

**Rationale**: Most comprehensive linting, excellent TypeScript integration, widely adopted.

## Dependencies Summary

### Production Dependencies
```json
{
  "better-sqlite3": "^11.0.0",
  "commander": "^14.0.0",
  "ignore": "^7.0.0"
}
```

### Development Dependencies
```json
{
  "@types/better-sqlite3": "^7.6.0",
  "@types/node": "^20.0.0",
  "@typescript-eslint/eslint-plugin": "^8.0.0",
  "@typescript-eslint/parser": "^8.0.0",
  "eslint": "^9.0.0",
  "prettier": "^3.0.0",
  "typescript": "^5.0.0",
  "vitest": "^1.0.0",
  "@vitest/ui": "^1.0.0"
}
```

## Performance Considerations

1. **SQLite with WAL mode**: Enable Write-Ahead Logging for better concurrency
2. **Prepared statements**: Use for all database operations
3. **Batch transactions**: Group file indexing operations
4. **Lazy command loading**: Use dynamic imports in CLI entry point
5. **Synchronous I/O**: Leverage better-sqlite3's sync API for simplicity and speed

## Security Considerations

1. **SQL injection prevention**: Use parameterized queries exclusively
2. **Path traversal protection**: Validate all file paths are within project root
3. **File permissions**: Check read permissions before indexing
4. **Signal handling**: Graceful shutdown on SIGINT/SIGTERM (FR-016)

## Cross-Platform Compatibility

1. **Path handling**: Use Node.js `path` module for all path operations
2. **Line endings**: Handle both LF and CRLF in text files
3. **File system**: Account for case sensitivity differences
4. **Binary distributions**: better-sqlite3 provides prebuilt binaries for all platforms

## Next Steps

With all technology decisions resolved, proceed to Phase 1:
1. Generate data-model.md with entity definitions
2. Create API contracts for CLI interface
3. Generate quickstart.md for usage documentation
4. Update agent context files

All NEEDS CLARIFICATION items from the implementation plan have been resolved:
- ✅ Primary Dependencies: better-sqlite3, commander, ignore
- ✅ Testing: vitest
- All other technical context confirmed from specification