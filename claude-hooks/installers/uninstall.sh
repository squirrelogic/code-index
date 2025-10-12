#!/bin/bash
# Claude Code Hooks Uninstaller for Unix/Linux/macOS
# Removes hooks and cleans up configuration

set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_ROOT="$(dirname "$SCRIPT_DIR")"

# Source common functions
source "$HOOKS_ROOT/lib/unix/common.sh" 2>/dev/null || {
    # Fallback if common.sh is not available
    log_info() { echo "[INFO] $1"; }
    log_error() { echo "[ERROR] $1" >&2; }
    log_warn() { echo "[WARN] $1" >&2; }
    log_debug() { echo "[DEBUG] $1"; }
}

# Configuration
readonly VERSION="1.0.0"
readonly CLAUDE_DIR=".claude"
readonly HOOKS_SUBDIR="hooks"
readonly CODEINDEX_DIR=".codeindex"

# Uninstall flags
FORCE_REMOVE=false
KEEP_POLICIES=false
KEEP_LOGS=false
CONFIRM=true

#######################################
# Display usage information
#######################################
usage() {
    cat << EOF
Claude Code Hooks Uninstaller v$VERSION

Usage: $0 [OPTIONS]

Options:
    -f, --force         Force removal without confirmation
    -k, --keep-policies Keep policies.json file
    -l, --keep-logs     Keep log files
    -y, --yes           Skip confirmation prompt
    -h, --help          Show this help message

Example:
    $0                      # Interactive uninstall
    $0 --yes                # Uninstall with automatic confirmation
    $0 --keep-policies      # Uninstall but preserve policy configuration

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
                FORCE_REMOVE=true
                CONFIRM=false
                shift
                ;;
            -k|--keep-policies)
                KEEP_POLICIES=true
                shift
                ;;
            -l|--keep-logs)
                KEEP_LOGS=true
                shift
                ;;
            -y|--yes)
                CONFIRM=false
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
# Find project root
#######################################
find_installation_root() {
    local root=$(find_project_root 2>/dev/null || pwd)

    if [ -z "$root" ]; then
        log_error "Could not determine project root directory"
        exit 1
    fi

    cd "$root"
    log_info "Uninstalling hooks from: $root"

    return 0
}

#######################################
# Check what's installed
#######################################
check_installation() {
    local found_items=false

    echo
    echo "Found the following Claude Code hooks components:"
    echo

    # Check hooks directory
    if [ -d "$CLAUDE_DIR/$HOOKS_SUBDIR" ]; then
        local hook_count=$(ls -1 "$CLAUDE_DIR/$HOOKS_SUBDIR"/*.sh 2>/dev/null | wc -l)
        if [ $hook_count -gt 0 ]; then
            echo "  • $hook_count hook script(s) in $CLAUDE_DIR/$HOOKS_SUBDIR/"
            found_items=true
        fi
    fi

    # Check settings.json
    if [ -f "$CLAUDE_DIR/settings.json" ]; then
        echo "  • Hook registration in $CLAUDE_DIR/settings.json"
        found_items=true
    fi

    # Check policies.json
    if [ -f "$CLAUDE_DIR/policies.json" ]; then
        if [ "$KEEP_POLICIES" = true ]; then
            echo "  • Policy configuration in $CLAUDE_DIR/policies.json (will be kept)"
        else
            echo "  • Policy configuration in $CLAUDE_DIR/policies.json"
        fi
        found_items=true
    fi

    # Check logs
    if [ -d "$CODEINDEX_DIR/logs" ]; then
        local log_count=$(ls -1 "$CODEINDEX_DIR/logs"/*.jsonl 2>/dev/null | wc -l)
        if [ $log_count -gt 0 ]; then
            if [ "$KEEP_LOGS" = true ]; then
                echo "  • $log_count log file(s) in $CODEINDEX_DIR/logs/ (will be kept)"
            else
                echo "  • $log_count log file(s) in $CODEINDEX_DIR/logs/"
            fi
            found_items=true
        fi
    fi

    # Check backups
    local backup_count=$(ls -d "$CLAUDE_DIR"/backup-* 2>/dev/null | wc -l)
    if [ $backup_count -gt 0 ]; then
        echo "  • $backup_count backup folder(s) in $CLAUDE_DIR/"
        found_items=true
    fi

    if [ "$found_items" = false ]; then
        echo "  No Claude Code hooks components found."
        echo
        exit 0
    fi

    echo
    return 0
}

#######################################
# Confirm uninstallation
#######################################
confirm_uninstall() {
    if [ "$CONFIRM" = false ]; then
        return 0
    fi

    echo "⚠️  This will remove the Claude Code hooks from your project."
    echo

    read -p "Are you sure you want to continue? (y/N) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled"
        exit 0
    fi

    return 0
}

#######################################
# Remove hook files
#######################################
remove_hooks() {
    log_info "Removing hook scripts..."

    local hooks_dir="$CLAUDE_DIR/$HOOKS_SUBDIR"

    if [ -d "$hooks_dir" ]; then
        # Remove hook scripts
        rm -f "$hooks_dir"/*.sh 2>/dev/null || true
        rm -f "$hooks_dir"/*.ps1 2>/dev/null || true
        rm -f "$hooks_dir"/common.sh 2>/dev/null || true
        rm -f "$hooks_dir"/Common.ps1 2>/dev/null || true

        # Remove hooks directory if empty
        rmdir "$hooks_dir" 2>/dev/null || {
            log_warn "Could not remove $hooks_dir - directory not empty"
        }

        log_info "Hook scripts removed"
    else
        log_debug "Hooks directory not found"
    fi

    return 0
}

#######################################
# Clean settings.json
#######################################
clean_settings() {
    log_info "Cleaning hook registration from settings.json..."

    local settings_file="$CLAUDE_DIR/settings.json"

    if [ ! -f "$settings_file" ]; then
        log_debug "settings.json not found"
        return 0
    fi

    # Check if jq is available for proper JSON manipulation
    if check_cli_available "jq"; then
        # Remove hooks section from settings.json
        local temp_file="${settings_file}.tmp"

        jq 'del(.hooks)' "$settings_file" > "$temp_file" && mv "$temp_file" "$settings_file"

        log_info "Hook registration removed from settings.json"
    else
        log_warn "Cannot clean settings.json without jq - manual cleanup may be required"
    fi

    return 0
}

#######################################
# Remove policies
#######################################
remove_policies() {
    if [ "$KEEP_POLICIES" = true ]; then
        log_info "Keeping policies.json as requested"
        return 0
    fi

    log_info "Removing policies configuration..."

    if [ -f "$CLAUDE_DIR/policies.json" ]; then
        rm -f "$CLAUDE_DIR/policies.json"
        log_info "Policies removed"
    else
        log_debug "policies.json not found"
    fi

    return 0
}

#######################################
# Clean logs
#######################################
clean_logs() {
    if [ "$KEEP_LOGS" = true ]; then
        log_info "Keeping log files as requested"
        return 0
    fi

    log_info "Cleaning log files..."

    local logs_dir="$CODEINDEX_DIR/logs"

    if [ -d "$logs_dir" ]; then
        # Remove hook-specific log files
        rm -f "$logs_dir"/hooks-*.jsonl 2>/dev/null || true

        log_info "Log files cleaned"
    else
        log_debug "Logs directory not found"
    fi

    return 0
}

#######################################
# Clean backups
#######################################
clean_backups() {
    log_info "Cleaning backup folders..."

    local backup_count=$(ls -d "$CLAUDE_DIR"/backup-* 2>/dev/null | wc -l)

    if [ $backup_count -gt 0 ]; then
        rm -rf "$CLAUDE_DIR"/backup-*
        log_info "Removed $backup_count backup folder(s)"
    else
        log_debug "No backup folders found"
    fi

    return 0
}

#######################################
# Clean empty directories
#######################################
clean_empty_dirs() {
    log_debug "Cleaning empty directories..."

    # Try to remove hooks directory if empty
    rmdir "$CLAUDE_DIR/$HOOKS_SUBDIR" 2>/dev/null || true

    # Try to remove .claude directory if empty
    rmdir "$CLAUDE_DIR" 2>/dev/null || {
        log_debug ".claude directory not empty, keeping it"
    }

    # Try to remove logs directory if empty
    rmdir "$CODEINDEX_DIR/logs" 2>/dev/null || true

    return 0
}

#######################################
# Display summary
#######################################
show_summary() {
    cat << EOF

========================================
Claude Code Hooks Uninstallation Complete
========================================

The following components have been removed:
  ✓ Hook scripts from .claude/hooks/
  ✓ Hook registration from .claude/settings.json
EOF

    if [ "$KEEP_POLICIES" = false ]; then
        echo "  ✓ Policy configuration from .claude/policies.json"
    fi

    if [ "$KEEP_LOGS" = false ]; then
        echo "  ✓ Hook log files from .codeindex/logs/"
    fi

    cat << EOF
  ✓ Backup folders

Note: The code-index CLI itself has not been uninstalled.
To uninstall the CLI, run: npm uninstall -g @squirrelogic/code-index

To reinstall Claude Code hooks later, run:
  ./claude-hooks/installers/install.sh

EOF
}

#######################################
# Main uninstall flow
#######################################
main() {
    log_info "Starting Claude Code Hooks uninstaller v$VERSION"

    # Parse command line arguments
    parse_args "$@"

    # Find installation root
    find_installation_root

    # Check what's installed
    check_installation

    # Confirm uninstallation
    confirm_uninstall

    # Remove components
    remove_hooks
    clean_settings
    remove_policies
    clean_logs
    clean_backups
    clean_empty_dirs

    # Show summary
    show_summary

    log_info "Uninstallation completed successfully!"

    exit 0
}

# Run main function
main "$@"