#!/bin/bash
# Claude Code PostToolUse Hook - Index Refresh
# Automatically refreshes code index after file modifications

# Get the directory of this script
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source common functions (try local copy first, then lib directory)
if [ -f "$HOOK_DIR/common.sh" ]; then
    source "$HOOK_DIR/common.sh"
elif [ -f "$(dirname "$(dirname "$HOOK_DIR")")/lib/unix/common.sh" ]; then
    source "$(dirname "$(dirname "$HOOK_DIR")")/lib/unix/common.sh"
else
    echo "ERROR: Could not find common.sh library" >&2
    exit 0  # Fail open
fi

# Set hook name for logging
export HOOK_NAME="post-tool-use"

# Lock file for index refresh
LOCK_FILE="${CODEINDEX_ROOT:-.codeindex}/.refresh.lock"

#######################################
# Check if tool modifies files
#######################################
is_file_modifying_tool() {
    local tool_name="$1"

    case "$tool_name" in
        Write|Edit|MultiEdit|NotebookEdit)
            return 0
            ;;
        Bash)
            # Check if bash command might modify files
            local command=$(echo "$TOOL_INPUT" | parse_json "command")
            if echo "$command" | grep -qE "(>|>>|tee|sed -i|awk.*>|echo.*>|cat.*>|cp|mv|rm|touch|mkdir)"; then
                return 0
            fi
            ;;
    esac

    return 1
}

#######################################
# Extract modified files from tool response
#######################################
extract_modified_files() {
    local tool_name="$1"
    local tool_response="$2"
    local modified_files=""

    case "$tool_name" in
        Write|Edit|MultiEdit)
            # Extract file_path from tool input
            local file_path=$(echo "$TOOL_INPUT" | parse_json "file_path")
            if [ -z "$file_path" ]; then
                file_path=$(echo "$TOOL_INPUT" | parse_json "path")
            fi
            if [ -n "$file_path" ]; then
                modified_files="$file_path"
            fi
            ;;
        NotebookEdit)
            # Extract notebook_path from tool input
            local notebook_path=$(echo "$TOOL_INPUT" | parse_json "notebook_path")
            if [ -n "$notebook_path" ]; then
                modified_files="$notebook_path"
            fi
            ;;
        Bash)
            # Try to extract file paths from command output
            # This is a best-effort approach
            if echo "$tool_response" | grep -q "File.*created\|File.*updated\|File.*modified"; then
                log_debug "Detected file modification in bash command output"
                modified_files="<multiple>"
            fi
            ;;
    esac

    echo "$modified_files"
}

#######################################
# Trigger index refresh
#######################################
trigger_index_refresh() {
    local modified_files="$1"

    # Check if code-index CLI is available
    if ! check_cli_available "code-index"; then
        log_warn "code-index CLI not found in PATH, skipping index refresh"
        return 1
    fi

    # Acquire lock to prevent concurrent refreshes
    log_debug "Acquiring lock for index refresh"

    if ! acquire_lock "$LOCK_FILE" 2; then
        log_warn "Another index refresh is in progress, skipping"
        return 1
    fi

    # Run index refresh in background
    log_info "Triggering index refresh for modified files: $modified_files"

    {
        # Small delay to ensure file operations are complete
        sleep 0.5

        # Run refresh command
        if code-index refresh 2>&1 | while IFS= read -r line; do
            log_debug "code-index: $line"
        done; then
            log_info "Index refresh completed successfully"
        else
            log_error "Index refresh failed"
        fi

        # Release lock
        release_lock "$LOCK_FILE"
    } &

    # Return immediately (don't wait for refresh to complete)
    return 0
}

#######################################
# Check if index needs refresh
#######################################
should_refresh_index() {
    # Check if index database exists
    if [ ! -f "${CODEINDEX_ROOT:-.codeindex}/index.db" ]; then
        log_debug "Index database not found, skipping refresh"
        return 1
    fi

    # Check if we've refreshed recently (avoid too frequent refreshes)
    local last_refresh_file="${CODEINDEX_ROOT:-.codeindex}/.last_refresh"
    if [ -f "$last_refresh_file" ]; then
        local last_refresh=$(stat -c %Y "$last_refresh_file" 2>/dev/null || stat -f %m "$last_refresh_file" 2>/dev/null || echo 0)
        local current_time=$(date +%s)
        local time_diff=$((current_time - last_refresh))

        if [ $time_diff -lt 5 ]; then
            log_debug "Index was refreshed ${time_diff}s ago, skipping"
            return 1
        fi
    fi

    # Update last refresh time
    touch "$last_refresh_file" 2>/dev/null || true

    return 0
}

#######################################
# Main hook logic
#######################################
main() {
    # Parse hook event from stdin
    if ! parse_hook_event; then
        log_error "Failed to parse hook event"
        exit 0  # Fail open
    fi

    log_info "PostToolUse hook triggered for tool: $TOOL_NAME"

    # Check if this is a file-modifying tool
    if ! is_file_modifying_tool "$TOOL_NAME"; then
        log_debug "Tool does not modify files, skipping index refresh"
        exit 0
    fi

    # Extract modified files
    local modified_files=$(extract_modified_files "$TOOL_NAME" "$TOOL_RESPONSE")

    if [ -z "$modified_files" ]; then
        log_debug "No modified files detected"
        exit 0
    fi

    log_info "Detected file modifications: $modified_files"

    # Check if index should be refreshed
    if ! should_refresh_index; then
        log_debug "Index refresh not needed"
        exit 0
    fi

    # Trigger index refresh
    trigger_index_refresh "$modified_files"

    # Return success (don't block on refresh)
    log_debug "PostToolUse hook completed"

    exit 0
}

# Use fail-open wrapper
fail_open_exec main