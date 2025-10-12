#!/bin/bash
# Claude Code Hooks Installer for Unix/Linux/macOS
# Installs hooks and configures .claude/settings.json

set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_ROOT="$(dirname "$SCRIPT_DIR")"

# Source common functions
source "$HOOKS_ROOT/lib/unix/common.sh"

# Configuration
readonly VERSION="1.0.0"
readonly CLAUDE_DIR=".claude"
readonly HOOKS_SUBDIR="hooks"
readonly CODEINDEX_DIR=".codeindex"
readonly LOGS_SUBDIR="logs"

# Installation flags
FORCE_INSTALL=false
SKIP_BACKUP=false
VERBOSE=false

#######################################
# Display usage information
#######################################
usage() {
    cat << EOF
Claude Code Hooks Installer v$VERSION

Usage: $0 [OPTIONS]

Options:
    -f, --force         Force installation, overwrite existing files
    -s, --skip-backup   Skip backing up existing configuration
    -v, --verbose       Enable verbose output
    -h, --help          Show this help message

Example:
    $0                  # Standard installation
    $0 --force          # Force overwrite existing hooks
    $0 --verbose        # Show detailed installation progress

EOF
    exit 0
}

#######################################
# Parse command line arguments
#######################################
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                FORCE_INSTALL=true
                shift
                ;;
            -s|--skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                LOG_LEVEL=$LOG_DEBUG
                shift
                ;;
            -h|--help)
                usage
                ;;
            *)
                log_error "Unknown option: $1"
                usage
                ;;
        esac
    done
}

#######################################
# Detect and verify operating system
#######################################
verify_os() {
    local os=$(detect_os)

    if [ -z "$os" ]; then
        log_error "Failed to detect operating system"
        exit 1
    fi

    log_info "Detected operating system: $os"

    # Check for required tools
    if ! check_cli_available "jq"; then
        log_warn "jq is not installed - JSON operations will use fallback methods"
        log_info "For better performance, install jq: https://stedolan.github.io/jq/download/"
    fi

    return 0
}

#######################################
# Find and validate project root
#######################################
find_installation_root() {
    local root=$(find_project_root)

    if [ -z "$root" ]; then
        log_error "Could not determine project root directory"
        exit 1
    fi

    cd "$root"
    log_info "Installing hooks in: $root"

    return 0
}

#######################################
# Create required directories
#######################################
create_directories() {
    log_info "Creating directory structure..."

    # Create .claude directory structure
    mkdir -p "$CLAUDE_DIR/$HOOKS_SUBDIR" || {
        log_error "Failed to create $CLAUDE_DIR/$HOOKS_SUBDIR"
        exit 1
    }

    # Create .codeindex directory structure
    mkdir -p "$CODEINDEX_DIR/$LOGS_SUBDIR" || {
        log_error "Failed to create $CODEINDEX_DIR/$LOGS_SUBDIR"
        exit 1
    }

    # Set appropriate permissions
    chmod 755 "$CLAUDE_DIR" "$CLAUDE_DIR/$HOOKS_SUBDIR"
    chmod 755 "$CODEINDEX_DIR" "$CODEINDEX_DIR/$LOGS_SUBDIR"

    log_info "Directory structure created successfully"
    return 0
}

#######################################
# Backup existing configuration
#######################################
backup_existing_config() {
    if [ "$SKIP_BACKUP" = true ]; then
        log_debug "Skipping backup (--skip-backup flag)"
        return 0
    fi

    local backup_dir="$CLAUDE_DIR/backup-$(date +%Y%m%d-%H%M%S)"
    local needs_backup=false

    # Check if backup is needed
    if [ -f "$CLAUDE_DIR/settings.json" ] || [ -f "$CLAUDE_DIR/policies.json" ] || [ -d "$CLAUDE_DIR/$HOOKS_SUBDIR" ]; then
        needs_backup=true
    fi

    if [ "$needs_backup" = true ]; then
        log_info "Backing up existing configuration to $backup_dir"
        mkdir -p "$backup_dir"

        # Backup settings.json if it exists
        if [ -f "$CLAUDE_DIR/settings.json" ]; then
            cp "$CLAUDE_DIR/settings.json" "$backup_dir/settings.json"
            log_debug "Backed up settings.json"
        fi

        # Backup policies.json if it exists
        if [ -f "$CLAUDE_DIR/policies.json" ]; then
            cp "$CLAUDE_DIR/policies.json" "$backup_dir/policies.json"
            log_debug "Backed up policies.json"
        fi

        # Backup existing hooks
        if [ -d "$CLAUDE_DIR/$HOOKS_SUBDIR" ] && [ "$(ls -A "$CLAUDE_DIR/$HOOKS_SUBDIR" 2>/dev/null)" ]; then
            cp -r "$CLAUDE_DIR/$HOOKS_SUBDIR" "$backup_dir/hooks"
            log_debug "Backed up existing hooks"
        fi
    fi

    return 0
}

#######################################
# Copy hook files
#######################################
copy_hook_files() {
    log_info "Installing hook scripts..."

    local os=$(detect_os)
    local source_dir="$HOOKS_ROOT/hooks/unix"
    local target_dir="$CLAUDE_DIR/$HOOKS_SUBDIR"

    # List of hook files to install
    local hooks=(
        "pre-tool-use.sh"
        "post-tool-use.sh"
        "session-start.sh"
    )

    for hook in "${hooks[@]}"; do
        local source_file="$source_dir/$hook"
        local target_file="$target_dir/$hook"

        # Check if source file exists (it might not be implemented yet)
        if [ ! -f "$source_file" ]; then
            log_warn "Hook not found, skipping: $hook"
            continue
        fi

        # Check if target exists and handle accordingly
        if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
            log_warn "Hook already exists, skipping: $hook (use --force to overwrite)"
            continue
        fi

        # Copy the hook file
        cp "$source_file" "$target_file" || {
            log_error "Failed to copy $hook"
            exit 1
        }

        # Make executable
        chmod +x "$target_file" || {
            log_error "Failed to set permissions on $hook"
            exit 1
        }

        log_debug "Installed: $hook"
    done

    # Copy common library
    cp "$HOOKS_ROOT/lib/unix/common.sh" "$target_dir/common.sh" || {
        log_warn "Failed to copy common.sh library"
    }

    log_info "Hook scripts installed successfully"
    return 0
}

#######################################
# Copy policy template
#######################################
copy_policies() {
    log_info "Installing policy configuration..."

    local source_file="$HOOKS_ROOT/templates/policies.json"
    local target_file="$CLAUDE_DIR/policies.json"

    # Only install if it doesn't exist or force flag is set
    if [ -f "$target_file" ] && [ "$FORCE_INSTALL" = false ]; then
        log_info "Policies file already exists, keeping existing configuration"
        return 0
    fi

    cp "$source_file" "$target_file" || {
        log_error "Failed to copy policies.json"
        exit 1
    }

    log_info "Policy configuration installed"
    return 0
}

#######################################
# Update settings.json with hook registration
#######################################
update_settings() {
    log_info "Updating hook registration in settings.json..."

    local settings_file="$CLAUDE_DIR/settings.json"
    local template_file="$HOOKS_ROOT/templates/settings.json"
    local timestamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    # If settings.json doesn't exist, copy from template
    if [ ! -f "$settings_file" ]; then
        log_debug "Creating new settings.json from template"
        cp "$template_file" "$settings_file" || {
            log_error "Failed to create settings.json"
            exit 1
        }

        # Update metadata timestamps using sed (portable)
        if [ "$(uname)" = "Darwin" ]; then
            # macOS sed requires backup extension
            sed -i '' "s/\"installed_at\": \"\"/\"installed_at\": \"$timestamp\"/" "$settings_file"
            sed -i '' "s/\"last_updated\": \"\"/\"last_updated\": \"$timestamp\"/" "$settings_file"
        else
            # GNU sed
            sed -i "s/\"installed_at\": \"\"/\"installed_at\": \"$timestamp\"/" "$settings_file"
            sed -i "s/\"last_updated\": \"\"/\"last_updated\": \"$timestamp\"/" "$settings_file"
        fi
    else
        # Merge with existing settings
        log_info "Merging with existing settings.json"

        if check_cli_available "jq"; then
            # Use jq for proper JSON merging
            local temp_file="${settings_file}.tmp"

            jq --slurpfile template "$template_file" '
                . as $existing |
                $template[0] as $new |
                $existing * {
                    hooks: ($existing.hooks // {} | . * $new.hooks),
                    metadata: {
                        installed_by: "code-index-hooks-installer",
                        installed_at: ($existing.metadata.installed_at // "'$timestamp'"),
                        last_updated: "'$timestamp'"
                    }
                }
            ' "$settings_file" > "$temp_file" && mv "$temp_file" "$settings_file"
        else
            log_warn "Cannot merge settings without jq - manual configuration may be required"
            log_info "Please review $settings_file and ensure hooks are registered"
        fi
    fi

    log_info "Hook registration updated successfully"
    return 0
}

#######################################
# Verify installation
#######################################
verify_installation() {
    log_info "Verifying installation..."

    local errors=0

    # Check directories
    if [ ! -d "$CLAUDE_DIR" ]; then
        log_error "Missing directory: $CLAUDE_DIR"
        ((errors++))
    fi

    if [ ! -d "$CLAUDE_DIR/$HOOKS_SUBDIR" ]; then
        log_error "Missing directory: $CLAUDE_DIR/$HOOKS_SUBDIR"
        ((errors++))
    fi

    if [ ! -d "$CODEINDEX_DIR/$LOGS_SUBDIR" ]; then
        log_error "Missing directory: $CODEINDEX_DIR/$LOGS_SUBDIR"
        ((errors++))
    fi

    # Check settings file
    if [ ! -f "$CLAUDE_DIR/settings.json" ]; then
        log_error "Missing file: $CLAUDE_DIR/settings.json"
        ((errors++))
    fi

    # Check policies file
    if [ ! -f "$CLAUDE_DIR/policies.json" ]; then
        log_error "Missing file: $CLAUDE_DIR/policies.json"
        ((errors++))
    fi

    # Check for at least one hook
    if [ -z "$(ls -A "$CLAUDE_DIR/$HOOKS_SUBDIR"/*.sh 2>/dev/null)" ]; then
        log_warn "No hook scripts found in $CLAUDE_DIR/$HOOKS_SUBDIR"
    fi

    if [ $errors -gt 0 ]; then
        log_error "Installation verification failed with $errors errors"
        return 1
    fi

    log_info "Installation verified successfully"
    return 0
}

#######################################
# Display installation summary
#######################################
show_summary() {
    cat << EOF

========================================
Claude Code Hooks Installation Complete!
========================================

Installed components:
  ✓ Hook scripts in .claude/hooks/
  ✓ Policy configuration in .claude/policies.json
  ✓ Hook registration in .claude/settings.json
  ✓ Logging directory in .codeindex/logs/

Available hooks:
  • PreToolUse  - Policy enforcement before tool execution
  • PostToolUse - Index refresh after file modifications
  • SessionStart - Cache warming at session start

Next steps:
  1. Review and customize .claude/policies.json for your project
  2. Ensure code-index CLI is installed and available in PATH
  3. Restart Claude Code to activate hooks

For more information, see claude-hooks/README.md

EOF
}

#######################################
# Main installation flow
#######################################
main() {
    log_info "Starting Claude Code Hooks installation v$VERSION"

    # Parse command line arguments
    parse_args "$@"

    # Verify operating system
    verify_os

    # Find installation root
    find_installation_root

    # Create directory structure
    create_directories

    # Backup existing configuration
    backup_existing_config

    # Copy hook files
    copy_hook_files

    # Copy policy template
    copy_policies

    # Update settings.json
    update_settings

    # Verify installation
    verify_installation

    # Show summary
    show_summary

    log_info "Installation completed successfully!"

    exit 0
}

# Run main function
main "$@"