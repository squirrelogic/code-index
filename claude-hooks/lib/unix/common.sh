#!/bin/bash
# Claude Code Hooks - Common Bash Utilities
# Shared functions for Unix/Linux/macOS hook implementations

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Log levels
readonly LOG_ERROR=0
readonly LOG_WARN=1
readonly LOG_INFO=2
readonly LOG_DEBUG=3

# Default log level
LOG_LEVEL=${LOG_LEVEL:-$LOG_INFO}

# Log directory
readonly LOG_DIR="${CODEINDEX_ROOT:-.codeindex}/logs"

#######################################
# Log an informational message
# Arguments:
#   $1 - Message to log
# Outputs:
#   Writes to stderr with timestamp and color
#######################################
log_info() {
    local message="$1"
    if [ "$LOG_LEVEL" -ge "$LOG_INFO" ]; then
        echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $message" >&2
    fi
    _write_json_log "info" "$message"
}

#######################################
# Log an error message
# Arguments:
#   $1 - Message to log
# Outputs:
#   Writes to stderr with timestamp and color
#######################################
log_error() {
    local message="$1"
    if [ "$LOG_LEVEL" -ge "$LOG_ERROR" ]; then
        echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $message" >&2
    fi
    _write_json_log "error" "$message"
}

#######################################
# Log a warning message
# Arguments:
#   $1 - Message to log
# Outputs:
#   Writes to stderr with timestamp and color
#######################################
log_warn() {
    local message="$1"
    if [ "$LOG_LEVEL" -ge "$LOG_WARN" ]; then
        echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $message" >&2
    fi
    _write_json_log "warn" "$message"
}

#######################################
# Log a debug message
# Arguments:
#   $1 - Message to log
# Outputs:
#   Writes to stderr with timestamp and color
#######################################
log_debug() {
    local message="$1"
    if [ "$LOG_LEVEL" -ge "$LOG_DEBUG" ]; then
        echo -e "${BLUE}[DEBUG]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $message" >&2
    fi
    _write_json_log "debug" "$message"
}

#######################################
# Write JSON log to file
# Arguments:
#   $1 - Log level
#   $2 - Message
# Outputs:
#   Appends to log file
#######################################
_write_json_log() {
    local level="$1"
    local message="$2"
    local log_file="$LOG_DIR/hooks-$(date '+%Y%m%d').jsonl"

    # Create log directory if it doesn't exist
    mkdir -p "$LOG_DIR" 2>/dev/null || true

    # Write JSON log entry
    if [ -w "$LOG_DIR" ] || [ ! -e "$LOG_DIR" ]; then
        echo "{\"timestamp\":\"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\",\"level\":\"$level\",\"hook\":\"${HOOK_NAME:-unknown}\",\"message\":\"$message\",\"session_id\":\"${SESSION_ID:-}\"}" >> "$log_file" 2>/dev/null || true
    fi
}

#######################################
# Check if CLI tool is available
# Arguments:
#   $1 - CLI tool name/command
# Returns:
#   0 if available, 1 if not
#######################################
check_cli_available() {
    local cli_name="$1"
    if command -v "$cli_name" >/dev/null 2>&1; then
        log_debug "CLI tool '$cli_name' is available"
        return 0
    else
        log_warn "CLI tool '$cli_name' is not available"
        return 1
    fi
}

#######################################
# Acquire file lock for exclusive operations
# Arguments:
#   $1 - Lock file path
#   $2 - Timeout in seconds (optional, default 5)
# Returns:
#   0 on success, 1 on failure
# Outputs:
#   File descriptor number on stdout
#######################################
acquire_lock() {
    local lock_file="$1"
    local timeout="${2:-5}"
    local lock_dir=$(dirname "$lock_file")

    # Create lock directory if needed
    mkdir -p "$lock_dir" 2>/dev/null || true

    # Try to acquire lock with timeout
    local elapsed=0
    local fd=200

    while [ $elapsed -lt $timeout ]; do
        if (set -C; echo $$ > "$lock_file") 2>/dev/null; then
            log_debug "Acquired lock: $lock_file"
            echo $fd
            return 0
        fi
        sleep 0.1
        elapsed=$((elapsed + 1))
    done

    log_warn "Failed to acquire lock: $lock_file (timeout: ${timeout}s)"
    return 1
}

#######################################
# Release file lock
# Arguments:
#   $1 - Lock file path
#   $2 - File descriptor (optional)
# Returns:
#   0 on success
#######################################
release_lock() {
    local lock_file="$1"
    local fd="${2:-200}"

    if [ -f "$lock_file" ]; then
        rm -f "$lock_file" 2>/dev/null || true
        log_debug "Released lock: $lock_file"
    fi

    # Close file descriptor if it exists
    eval "exec $fd>&-" 2>/dev/null || true

    return 0
}

#######################################
# Parse JSON field from input
# Arguments:
#   $1 - JSON string
#   $2 - Field name to extract
# Returns:
#   Field value on stdout, empty if not found
# Note: Requires jq to be installed
#######################################
parse_json() {
    local json="$1"
    local field="$2"

    if ! check_cli_available "jq"; then
        # Fallback to grep/sed if jq not available
        echo "$json" | grep -o "\"$field\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed "s/.*\"$field\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/"
        return 0
    fi

    echo "$json" | jq -r ".$field // empty" 2>/dev/null || echo ""
}


#######################################
# Detect operating system
# Returns:
#   OS type string on stdout: "macos", "linux", or error
#######################################
detect_os() {
    case "$(uname -s)" in
        Darwin*)
            echo "macos"
            ;;
        Linux*)
            echo "linux"
            ;;
        *)
            log_error "Unsupported operating system: $(uname -s)"
            return 1
            ;;
    esac
}

#######################################
# Find project root directory
# Returns:
#   Project root path on stdout
#######################################
find_project_root() {
    local current_dir="${1:-$(pwd)}"

    # First try git root
    if git_root=$(git -C "$current_dir" rev-parse --show-toplevel 2>/dev/null); then
        echo "$git_root"
        return 0
    fi

    # Look for .claude directory
    while [ "$current_dir" != "/" ]; do
        if [ -d "$current_dir/.claude" ]; then
            echo "$current_dir"
            return 0
        fi
        current_dir=$(dirname "$current_dir")
    done

    # Default to current directory
    echo "$(pwd)"
}

#######################################
# Fail-open wrapper for hook execution
# Arguments:
#   $@ - Command to execute
# Returns:
#   Always returns 0 (fail-open)
#######################################
fail_open_exec() {
    "$@" || {
        local exit_code=$?
        log_error "Command failed with exit code $exit_code: $*"
        log_info "Failing open to prevent blocking Claude Code"
        exit 0
    }
}

#######################################
# Parse hook event with enhanced error handling
# Arguments:
#   $1 - Optional JSON input (defaults to stdin)
# Returns:
#   0 on success, 1 on failure
# Sets multiple global variables for use in hooks
#######################################
parse_hook_event() {
    local json_input="${1:-}"

    # Read from stdin if no argument provided
    if [ -z "$json_input" ]; then
        json_input=$(cat)
    fi

    # Store full JSON for reference
    HOOK_EVENT_JSON="$json_input"

    if [ -z "$HOOK_EVENT_JSON" ]; then
        log_error "No input received"
        return 1
    fi

    # Extract common fields
    HOOK_EVENT_NAME=$(parse_json "$HOOK_EVENT_JSON" "hook_event_name")
    SESSION_ID=$(parse_json "$HOOK_EVENT_JSON" "session_id")
    CWD=$(parse_json "$HOOK_EVENT_JSON" "cwd")
    TRANSCRIPT_PATH=$(parse_json "$HOOK_EVENT_JSON" "transcript_path")

    # Extract event-specific fields
    case "$HOOK_EVENT_NAME" in
        PreToolUse|PostToolUse)
            TOOL_NAME=$(parse_json "$HOOK_EVENT_JSON" "tool_name")
            TOOL_INPUT=$(parse_json "$HOOK_EVENT_JSON" "tool_input")
            if [ "$HOOK_EVENT_NAME" = "PostToolUse" ]; then
                TOOL_RESPONSE=$(parse_json "$HOOK_EVENT_JSON" "tool_response")
            fi
            ;;
        SessionStart)
            SOURCE=$(parse_json "$HOOK_EVENT_JSON" "source")
            ;;
        UserPromptSubmit)
            PROMPT=$(parse_json "$HOOK_EVENT_JSON" "prompt")
            ;;
        Notification)
            MESSAGE=$(parse_json "$HOOK_EVENT_JSON" "message")
            ;;
        Stop|SubagentStop)
            STOP_HOOK_ACTIVE=$(parse_json "$HOOK_EVENT_JSON" "stop_hook_active")
            ;;
        PreCompact)
            TRIGGER=$(parse_json "$HOOK_EVENT_JSON" "trigger")
            CUSTOM_INSTRUCTIONS=$(parse_json "$HOOK_EVENT_JSON" "custom_instructions")
            ;;
        SessionEnd)
            REASON=$(parse_json "$HOOK_EVENT_JSON" "reason")
            ;;
    esac

    # Set hook name for logging
    HOOK_NAME="${HOOK_EVENT_NAME:-unknown}"

    log_debug "Parsed hook event: type=$HOOK_EVENT_NAME, session=$SESSION_ID, tool=$TOOL_NAME"
    return 0
}

# Export functions for use in hooks
export -f log_info log_error log_warn log_debug
export -f check_cli_available acquire_lock release_lock
export -f parse_json parse_hook_event
export -f detect_os find_project_root fail_open_exec