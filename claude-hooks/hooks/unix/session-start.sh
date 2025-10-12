#!/bin/bash
# Claude Code SessionStart Hook - Cache Warming
# Optimizes initial performance by warming caches and checking system health

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
export HOOK_NAME="session-start"

# Cache directory
CACHE_DIR="${CODEINDEX_ROOT:-.codeindex}/cache"

#######################################
# Check system health
#######################################
check_system_health() {
    local warnings=0

    log_info "Performing system health checks..."

    # Check code-index CLI availability
    if ! check_cli_available "code-index"; then
        log_warn "code-index CLI not found in PATH"
        log_warn "Install with: npm install -g @squirrelogic/code-index"
        ((warnings++))
    else
        log_debug "code-index CLI is available"
    fi

    # Check disk space
    local available_space
    if [ "$(detect_os)" = "macos" ]; then
        available_space=$(df -k . | tail -1 | awk '{print $4}')
    else
        available_space=$(df -k . | tail -1 | awk '{print $4}')
    fi

    if [ -n "$available_space" ] && [ "$available_space" -lt 102400 ]; then
        log_warn "Low disk space: less than 100MB available"
        ((warnings++))
    else
        log_debug "Disk space OK: ${available_space}KB available"
    fi

    # Check index database
    local index_db="${CODEINDEX_ROOT:-.codeindex}/index.db"
    if [ -f "$index_db" ]; then
        local db_size=$(du -k "$index_db" | cut -f1)
        log_debug "Index database size: ${db_size}KB"

        # Check if database is accessible
        if ! [ -r "$index_db" ]; then
            log_warn "Index database is not readable"
            ((warnings++))
        fi

        # Check WAL file size (indicates pending writes)
        local wal_file="${index_db}-wal"
        if [ -f "$wal_file" ]; then
            local wal_size=$(du -k "$wal_file" | cut -f1)
            if [ "$wal_size" -gt 10240 ]; then
                log_warn "Large WAL file detected (${wal_size}KB) - consider running 'code-index doctor'"
                ((warnings++))
            fi
        fi
    else
        log_info "Index database not found - run 'code-index init' to create"
        ((warnings++))
    fi

    # Check log directory
    local log_dir="${CODEINDEX_ROOT:-.codeindex}/logs"
    if [ -d "$log_dir" ]; then
        # Clean up old log files (older than 7 days)
        find "$log_dir" -name "*.jsonl" -mtime +7 -delete 2>/dev/null || true
        log_debug "Log directory cleaned"
    fi

    return $warnings
}

#######################################
# Warm index cache
#######################################
warm_index_cache() {
    log_info "Warming index cache..."

    # Check if code-index is available
    if ! check_cli_available "code-index"; then
        log_debug "Skipping cache warming - code-index not available"
        return 1
    fi

    # Create cache directory if needed
    mkdir -p "$CACHE_DIR" 2>/dev/null || true

    # Run index statistics to warm cache
    log_debug "Loading index statistics..."
    if code-index stats 2>&1 | while IFS= read -r line; do
        log_debug "Stats: $line"
    done; then
        log_info "Index statistics loaded successfully"
    else
        log_warn "Failed to load index statistics"
    fi

    # Preload common search patterns
    local common_patterns=("function" "class" "import" "export" "TODO" "FIXME")
    for pattern in "${common_patterns[@]}"; do
        log_debug "Preloading search pattern: $pattern"
        code-index search "$pattern" --limit 1 >/dev/null 2>&1 || true
    done

    # Touch cache timestamp
    touch "$CACHE_DIR/.warmed" 2>/dev/null || true

    return 0
}

#######################################
# Display session info
#######################################
display_session_info() {
    local source="$1"

    # Format session source message
    local session_type="Session"
    case "$source" in
        startup)
            session_type="New session"
            ;;
        resume)
            session_type="Resumed session"
            ;;
        clear)
            session_type="Cleared session"
            ;;
        compact)
            session_type="Compacted session"
            ;;
    esac

    log_info "$session_type started (ID: $SESSION_ID)"

    # Get project info
    local project_root=$(find_project_root)
    log_info "Project root: $project_root"

    # Get index status
    if check_cli_available "code-index"; then
        local file_count=$(code-index stats 2>/dev/null | grep -E "Files:|Total files:" | sed 's/[^0-9]//g' | head -1)
        if [ -n "$file_count" ]; then
            log_info "Index contains $file_count files"
        fi
    fi

    return 0
}

#######################################
# Provide helpful tips
#######################################
show_tips() {
    # Only show tips for new sessions
    if [ "$SOURCE" != "startup" ]; then
        return 0
    fi

    # Check if we've shown tips recently
    local tips_file="${CACHE_DIR}/.tips_shown"
    if [ -f "$tips_file" ]; then
        local last_shown=$(stat -c %Y "$tips_file" 2>/dev/null || stat -f %m "$tips_file" 2>/dev/null || echo 0)
        local current_time=$(date +%s)
        local time_diff=$((current_time - last_shown))

        # Show tips at most once per day
        if [ $time_diff -lt 86400 ]; then
            return 0
        fi
    fi

    # Select a random tip
    local tips=(
        "Use 'code-index search <query>' to search your codebase"
        "Run 'code-index doctor' to check system health"
        "Use 'code-index refresh' to update the index after changes"
        "Edit .claude/policies.json to customize security policies"
        "Check .codeindex/logs/ for detailed hook execution logs"
    )

    local tip_index=$((RANDOM % ${#tips[@]}))
    log_info "💡 Tip: ${tips[$tip_index]}"

    # Update tips timestamp
    mkdir -p "$CACHE_DIR" 2>/dev/null || true
    touch "$tips_file" 2>/dev/null || true

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

    log_info "SessionStart hook triggered (source: $SOURCE)"

    # Display session information
    display_session_info "$SOURCE"

    # Check system health
    local health_warnings=0
    check_system_health || health_warnings=$?

    if [ $health_warnings -gt 0 ]; then
        log_warn "System health check found $health_warnings warning(s)"
    else
        log_info "System health check passed"
    fi

    # Warm cache for better performance
    if warm_index_cache; then
        log_info "Cache warming completed"
    else
        log_debug "Cache warming skipped"
    fi

    # Show helpful tips
    show_tips

    # Return additional context for Claude
    cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Code index is ready. Use 'code-index search' to search the codebase."
  }
}
EOF

    exit 0
}

# Use fail-open wrapper
fail_open_exec main