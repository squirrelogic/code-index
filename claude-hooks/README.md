# Claude Code Hooks for code-index

Automated hooks that integrate the `code-index` CLI tool with Claude Code, providing policy enforcement, automatic index updates, and performance optimization.

## Overview

This package provides three types of hooks for Claude Code:

1. **PreToolUse Hook** - Enforces security policies before tool execution
2. **PostToolUse Hook** - Automatically refreshes the code index after file modifications
3. **SessionStart Hook** - Warms caches and performs health checks at session start

All hooks follow a fail-open approach, ensuring Claude Code operations continue even if a hook encounters an error.

## Features

- 🔒 **Security Policy Enforcement** - Block dangerous commands and protect sensitive files
- 🔄 **Automatic Index Refresh** - Keep your code index up-to-date as files change
- 🚀 **Performance Optimization** - Warm caches at session start for faster searches
- 🌍 **Cross-Platform Support** - Native scripts for Windows, macOS, and Linux
- 📝 **Comprehensive Logging** - Structured JSON logs for debugging and audit
- ⚡ **Fail-Open Design** - Never blocks Claude Code operations on errors

## Prerequisites

- Claude Code (claude.ai/code or VS Code extension)
- Node.js 20+ and npm
- `code-index` CLI installed (`npm install -g @squirrelogic/code-index`)
- Bash 3.2+ (macOS/Linux) or PowerShell 5.1+ (Windows)
- Optional: `jq` for better JSON processing on Unix systems

## Installation

### Quick Install

#### Unix/Linux/macOS
```bash
# Clone or download the hooks
cd your-project-root

# Run the installer
./claude-hooks/installers/install.sh

# Optional: Force overwrite existing hooks
./claude-hooks/installers/install.sh --force
```

#### Windows
```powershell
# Clone or download the hooks
cd your-project-root

# Run the installer
.\claude-hooks\installers\install.ps1

# Optional: Force overwrite existing hooks
.\claude-hooks\installers\install.ps1 -Force
```

### What Gets Installed

The installer creates the following structure in your project:

```
your-project/
├── .claude/
│   ├── hooks/
│   │   ├── pre-tool-use.sh    # PreToolUse hook (Unix)
│   │   ├── post-tool-use.sh   # PostToolUse hook (Unix)
│   │   ├── session-start.sh   # SessionStart hook (Unix)
│   │   └── common.sh          # Shared utilities
│   ├── settings.json          # Hook registration
│   └── policies.json          # Security policies
└── .codeindex/
    └── logs/                  # Hook execution logs
```

## Configuration

### Security Policies

Edit `.claude/policies.json` to customize security rules:

```json
{
  "rules": [
    {
      "id": "block-sudo",
      "description": "Block commands requiring elevated privileges",
      "enabled": true,
      "tool": "Bash",
      "patterns": ["^sudo\\s+", "^doas\\s+"],
      "action": "block",
      "message": "Elevated privileges not allowed"
    }
  ],
  "allowlist": {
    "patterns": ["**/test/**", "**/.claude/**"]
  }
}
```

Policy actions:
- `block` - Prevents tool execution with exit code 2
- `warn` - Logs warning but allows execution
- `allow` - Explicitly allows (via allowlist)

### Hook Settings

The `.claude/settings.json` file controls which hooks are active:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Write|Edit|Bash",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/pre-tool-use.sh",
        "timeout": 60
      }]
    }]
  }
}
```

## Usage Examples

### PreToolUse Hook - Policy Enforcement

The PreToolUse hook validates commands before execution:

```bash
# This will be blocked by default policies
$ sudo rm -rf /

# This will trigger a warning
$ npm install unknown-package

# This is allowed (in test directory)
$ echo "test" > ./test/output.txt
```

### PostToolUse Hook - Index Refresh

The PostToolUse hook automatically updates the index after file changes:

```bash
# Claude Code writes a file
Write: src/new-feature.js

# Hook automatically triggers
code-index refresh

# Index is now up-to-date for searches
```

### SessionStart Hook - Cache Warming

The SessionStart hook optimizes performance when a session begins:

```
[INFO] New session started (ID: abc123)
[INFO] Project root: /Users/dev/my-project
[INFO] Index contains 1,234 files
[INFO] System health check passed
[INFO] Cache warming completed
💡 Tip: Use 'code-index search <query>' to search your codebase
```

## Monitoring and Debugging

### View Hook Logs

Hooks write structured logs to `.codeindex/logs/`:

```bash
# View today's logs
cat .codeindex/logs/hooks-$(date +%Y%m%d).jsonl | jq

# Filter for errors
cat .codeindex/logs/hooks-*.jsonl | jq 'select(.level == "error")'

# Watch logs in real-time
tail -f .codeindex/logs/hooks-$(date +%Y%m%d).jsonl | jq
```

### Check Hook Status

```bash
# Verify hooks are registered
cat .claude/settings.json | jq '.hooks'

# Test a hook manually
echo '{"hook_event_name":"SessionStart","session_id":"test"}' | .claude/hooks/session-start.sh
```

## Uninstallation

### Remove All Hooks

#### Unix/Linux/macOS
```bash
# Interactive uninstall
./claude-hooks/installers/uninstall.sh

# Keep policies but remove hooks
./claude-hooks/installers/uninstall.sh --keep-policies

# Automatic confirmation
./claude-hooks/installers/uninstall.sh --yes
```

#### Windows
```powershell
# Interactive uninstall
.\claude-hooks\installers\uninstall.ps1

# Keep policies but remove hooks
.\claude-hooks\installers\uninstall.ps1 -KeepPolicies

# Automatic confirmation
.\claude-hooks\installers\uninstall.ps1 -Yes
```

## Troubleshooting

### Hooks Not Triggering

1. **Check Registration**: Ensure hooks are registered in `.claude/settings.json`
2. **Verify Permissions**: Hooks must be executable (`chmod +x` on Unix)
3. **Review Logs**: Check `.codeindex/logs/` for error messages
4. **Test Manually**: Run hooks directly with test input

### Performance Issues

1. **Disable Cache Warming**: Comment out cache warming in `session-start.sh`
2. **Increase Timeouts**: Adjust timeout values in `settings.json`
3. **Check Index Size**: Run `code-index doctor` to check database health

### Policy Not Working

1. **Validate JSON**: Ensure `policies.json` is valid JSON
2. **Check Patterns**: Test regex patterns with online tools
3. **Review Allowlist**: Ensure paths aren't inadvertently allowed
4. **Enable Debug Logging**: Set `LOG_LEVEL=DEBUG` environment variable

## Advanced Usage

### Custom Policies

Create project-specific policies:

```json
{
  "rules": [{
    "id": "protect-production-config",
    "tools": ["Write", "Edit"],
    "paths": ["**/production.env", "**/prod-*.json"],
    "action": "block",
    "message": "Production configs are read-only"
  }]
}
```

### Hook Chaining

Run multiple hooks for the same event:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": ".*",
        "hooks": [
          {"command": ".claude/hooks/pre-tool-use.sh"},
          {"command": ".claude/hooks/custom-validator.sh"}
        ]
      }
    ]
  }
}
```

### Environment Variables

Control hook behavior with environment variables:

```bash
# Set log level
export LOG_LEVEL=DEBUG

# Custom paths
export CODEINDEX_ROOT=/custom/path
export CLAUDE_DIR=/custom/.claude

# Run Claude Code
claude-code
```

## Security Considerations

- Hooks run with the same permissions as Claude Code
- Policies are advisory - they can be bypassed if hooks are disabled
- Always review hook scripts before installation
- Keep `policies.json` in version control for team consistency
- Regularly review logs for policy violations

## Contributing

Contributions are welcome! Areas for improvement:

- Additional policy rules for common security patterns
- Performance optimizations for large repositories
- Integration with other development tools
- Enhanced logging and monitoring capabilities

## License

This project follows the same license as the code-index CLI tool.

## Support

For issues specific to:
- **Hooks**: Open an issue in this repository
- **code-index CLI**: See [@squirrelogic/code-index](https://www.npmjs.com/package/@squirrelogic/code-index)
- **Claude Code**: Contact Anthropic support

---

*Built with ❤️ for the Claude Code community*