# Research: Claude Code Hooks and Installers

**Date**: 2025-10-12
**Feature**: Claude Code Hooks Integration

## Phase 0: Technology Research

### 1. Claude Code Hook Interface

**Decision**: Use JSON via stdin for hook communication with exit code control
**Rationale**: Claude Code provides structured JSON input via stdin with environment variables for context. Exit codes provide simple control flow (0=continue, 2=block).
**Alternatives considered**:
- Direct API calls: Not supported by Claude Code
- File-based communication: Too slow and complex for real-time hooks

### 2. Hook Event Data Format

**Decision**: Parse event-specific JSON fields based on `hook_event_name`
**Rationale**: Each hook type receives different fields relevant to its purpose (tool details for PreToolUse, session info for SessionStart)
**Key fields discovered**:
- Common: `session_id`, `transcript_path`, `cwd`, `hook_event_name`
- PreToolUse: `tool_name`, `tool_input`
- PostToolUse: `tool_name`, `tool_input`, `tool_response`
- SessionStart: `source` (startup/resume/clear/compact)

### 3. File Locking Strategy

**Decision**: Platform-specific locking mechanisms
- Unix/Linux/macOS: Use `flock` command or file descriptors
- Windows: Use PowerShell Mutex or exclusive file handles

**Rationale**: Native OS mechanisms are most reliable and don't require external dependencies
**Alternatives considered**:
- Database locking: Overkill for simple file operations
- No locking: Risk of data corruption with concurrent hooks
- Cross-platform library: Would require Python/Node.js runtime

### 4. Configuration Storage

**Decision**: Use `.claude/settings.json` for hook registration
**Rationale**: Claude Code expects this specific location and format for hook configuration
**Configuration structure**:
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/pre-tool-use.sh",
        "timeout": 60
      }]
    }]
  }
}
```

### 5. Fail-Open Implementation

**Decision**: Default to exit code 0 on all errors except critical security violations
**Rationale**: Prevents hooks from blocking Claude Code operations due to transient failures
**Implementation strategy**:
- Wrap all hook logic in try-catch/error handling
- Log errors to `.codeindex/logs/` for debugging
- Only use exit code 2 for deliberate blocking (policy violations)

### 6. Tool Name Matching

**Decision**: Use regex patterns in hook matcher configuration
**Rationale**: Allows flexible matching of multiple tools with single hook
**Common patterns discovered**:
- File operations: `"Write|Edit|MultiEdit"`
- Shell commands: `"Bash"`
- Web operations: `"WebFetch|WebSearch"`
- MCP tools: `"mcp__.*"`

### 7. Performance Optimization

**Decision**: Implement early exit checks and minimal processing
**Rationale**: Hooks have 60-second timeout but should complete much faster
**Strategies**:
- Check CLI availability first, exit immediately if missing
- Use lightweight JSON parsing (jq for bash, ConvertFrom-Json for PowerShell)
- Avoid network calls or heavy computation
- Cache policy decisions where possible

### 8. Logging Architecture

**Decision**: Structured JSON logging to `.codeindex/logs/` with rotation
**Rationale**: Aligns with existing code-index logging infrastructure
**Log format**:
```json
{
  "timestamp": "2025-10-12T10:30:00Z",
  "hook": "pre-tool-use",
  "event": "tool_blocked",
  "tool_name": "Bash",
  "reason": "Policy violation: sudo command",
  "session_id": "abc123"
}
```

### 9. Installation Process

**Decision**: Single-command installation with automatic OS detection
**Rationale**: Simplifies user experience and reduces installation errors
**Installation steps**:
1. Detect OS (uname for Unix, $env:OS for Windows)
2. Create `.claude/hooks/` directory structure
3. Copy appropriate hook scripts
4. Set executable permissions (Unix) or execution policy guidance (Windows)
5. Generate default `.claude/settings.json`
6. Create default `.claude/policies.json`

### 10. Testing Strategy

**Decision**: Mock Claude Code events for testing
**Rationale**: Can't rely on actual Claude Code for automated testing
**Test approach**:
- Create JSON test fixtures for each event type
- Use environment variable injection for CLAUDE_PROJECT_DIR
- Test both success and failure scenarios
- Verify exit codes and output format
- Test concurrent execution with file locking

## Key Technical Decisions Summary

| Component | Decision | Impact |
|-----------|----------|--------|
| Language | Native shell scripts (bash/PowerShell) | No runtime dependencies |
| Communication | JSON via stdin, exit codes for control | Simple, reliable interface |
| File Locking | OS-native mechanisms (flock/Mutex) | Prevents race conditions |
| Error Handling | Fail-open by default (exit 0) | Maintains Claude Code flow |
| Configuration | `.claude/settings.json` registration | Standard Claude Code pattern |
| Logging | JSON to `.codeindex/logs/` | Consistent with CLI logging |
| Installation | Auto-detect OS, single command | User-friendly setup |

## Resolved Clarifications

All technical unknowns from the implementation plan have been resolved:

1. ✅ Hook interface specification (JSON via stdin)
2. ✅ Event data formats for each hook type
3. ✅ File locking mechanisms for both platforms
4. ✅ Configuration registration requirements
5. ✅ Tool name matching patterns
6. ✅ Performance requirements and strategies
7. ✅ Testing approach without Claude Code dependency

## Next Steps

With all research complete, we can proceed to:
1. Define data models for hook events and configurations
2. Create API contracts for hook interfaces
3. Generate quickstart documentation
4. Begin implementation following the established patterns