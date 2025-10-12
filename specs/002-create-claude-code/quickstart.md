# Quick Start: Claude Code Hooks

Get Claude Code hooks up and running in under 2 minutes!

## Prerequisites

- **code-index CLI**: Install via `npm install -g @squirrelogic/code-index`
- **Claude Code**: Available at [claude.ai/code](https://claude.ai/code)
- **OS**: macOS, Linux, or Windows 10+

## Installation

### macOS/Linux

```bash
# Download and run installer
curl -sSL https://raw.githubusercontent.com/squirrelogic/code-index/main/claude-hooks/installers/install.sh | bash

# Or clone and install locally
git clone https://github.com/squirrelogic/code-index.git
cd code-index/claude-hooks/installers
./install.sh
```

### Windows

```powershell
# Download and run installer
iwr -useb https://raw.githubusercontent.com/squirrelogic/code-index/main/claude-hooks/installers/install.ps1 | iex

# Or clone and install locally
git clone https://github.com/squirrelogic/code-index.git
cd code-index\claude-hooks\installers
.\install.ps1
```

## What Gets Installed

The installer creates:

```
your-project/
├── .claude/
│   ├── hooks/
│   │   ├── pre-tool-use.*      # Policy enforcement hook
│   │   ├── post-tool-use.*     # Index refresh hook
│   │   └── session-start.*     # Cache warming hook
│   ├── settings.json            # Hook registration
│   └── policies.json           # Default policies
└── .codeindex/
    └── logs/                    # Hook logs directory
```

## Basic Usage

### 1. Index Your Project

First, initialize and index your codebase:

```bash
# Initialize code-index
code-index init

# Index all files
code-index index
```

### 2. Start Claude Code

Open Claude Code in your project directory. The SessionStart hook will automatically:
- Warm the index cache
- Check system health
- Load project context

### 3. Configure Policies (Optional)

Edit `.claude/policies.json` to customize tool policies:

```json
{
  "version": "1.0.0",
  "rules": [
    {
      "id": "no-sudo",
      "name": "Block sudo commands",
      "enabled": true,
      "tools": ["Bash"],
      "patterns": ["^sudo\\s+"],
      "action": "deny",
      "message": "Sudo commands are not allowed"
    },
    {
      "id": "protect-env",
      "name": "Protect environment files",
      "enabled": true,
      "tools": ["Write", "Edit"],
      "paths": [".env", ".env.local"],
      "action": "warn",
      "message": "Modifying environment files"
    }
  ]
}
```

## How Hooks Work

### PreToolUse Hook
- **Fires**: Before Claude Code uses any tool
- **Purpose**: Enforce project policies
- **Example**: Block dangerous commands, protect sensitive files

### PostToolUse Hook
- **Fires**: After file modifications
- **Purpose**: Keep index synchronized
- **Example**: Auto-refresh index when files change

### SessionStart Hook
- **Fires**: When Claude Code session begins
- **Purpose**: Optimize performance
- **Example**: Pre-load frequently accessed data

## Testing Your Installation

### Verify Hooks Are Active

```bash
# Check installation status
ls -la .claude/hooks/

# View hook registration
cat .claude/settings.json | jq .hooks

# Test policy enforcement (should be blocked)
echo "Ask Claude to run: sudo rm -rf /"
```

### Monitor Hook Activity

```bash
# Watch real-time logs (Unix)
tail -f .codeindex/logs/pre-tool-use.log

# View recent activity
cat .codeindex/logs/session-start.log | tail -20
```

## Troubleshooting

### Hooks Not Firing

1. **Check registration**: Ensure hooks are in `.claude/settings.json`
2. **Verify permissions**: Unix hooks need execute permission (`chmod +x`)
3. **Review logs**: Check `.codeindex/logs/` for errors

### CLI Not Found

If hooks report "code-index not found":

1. **Verify installation**: Run `code-index --version`
2. **Check PATH**: Ensure code-index is in your system PATH
3. **Use skip mode**: Hooks will still install but won't block operations

### Windows Execution Policy

If PowerShell blocks scripts:

```powershell
# Allow local scripts (admin required)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or bypass for single session
powershell -ExecutionPolicy Bypass -File install.ps1
```

## Advanced Configuration

### Custom Timeout

Adjust hook timeout in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/pre-tool-use.sh",
        "timeout": 30
      }]
    }]
  }
}
```

### Selective Tool Matching

Apply hooks only to specific tools:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{
        "type": "command",
        "command": ".claude/hooks/post-tool-use.sh"
      }]
    }]
  }
}
```

### Disable Specific Hooks

Temporarily disable a hook without uninstalling:

```json
{
  "hooks": {
    "SessionStart": []
  }
}
```

## Uninstallation

### Remove All Hooks

```bash
# Unix/Linux/macOS
./claude-hooks/installers/uninstall.sh

# Windows
.\claude-hooks\installers\uninstall.ps1
```

### Keep Policies and Logs

```bash
# Preserve configurations
./uninstall.sh --keep-policies --keep-logs
```

## Examples

### Example: Block Production Deployments

```json
{
  "rules": [{
    "id": "no-prod-deploy",
    "name": "Block production deployments",
    "enabled": true,
    "tools": ["Bash"],
    "patterns": ["deploy.*--prod", "kubectl.*production"],
    "action": "deny",
    "message": "Production deployments must be done manually"
  }]
}
```

### Example: Audit File Access

```json
{
  "rules": [{
    "id": "audit-sensitive",
    "name": "Audit sensitive file access",
    "enabled": true,
    "tools": ["Read"],
    "paths": ["**/secrets/**", "**/*.key", "**/*.pem"],
    "action": "warn",
    "severity": "high"
  }]
}
```

### Example: Require Approval for Deletions

```json
{
  "rules": [{
    "id": "confirm-delete",
    "name": "Confirm file deletions",
    "enabled": true,
    "tools": ["Bash"],
    "patterns": ["rm\\s+", "del\\s+", "unlink"],
    "action": "ask",
    "message": "Confirm deletion operation"
  }]
}
```

## Next Steps

- 📚 Read the [full documentation](./README.md)
- 🔧 Customize your [policies.json](.claude/policies.json)
- 📊 Monitor hook activity in [logs](.codeindex/logs/)
- 🐛 Report issues on [GitHub](https://github.com/squirrelogic/code-index/issues)

## Support

- **Documentation**: See [specs/002-create-claude-code/](.)
- **Issues**: [GitHub Issues](https://github.com/squirrelogic/code-index/issues)
- **Discord**: Join our community server (coming soon)

---

**Happy coding with Claude Code hooks! 🚀**