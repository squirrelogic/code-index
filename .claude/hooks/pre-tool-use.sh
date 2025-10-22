#!/bin/bash
# Claude Code PreToolUse Hook - Policy Enforcement
# Validates tool usage against project policies before execution

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
export HOOK_NAME="pre-tool-use"

# Policy file location
POLICIES_FILE="${CLAUDE_DIR:-.claude}/policies.json"

#######################################
# Load and validate policies
#######################################
load_policies() {
    if [ ! -f "$POLICIES_FILE" ]; then
        log_warn "Policies file not found: $POLICIES_FILE"
        return 1
    fi

    if ! check_cli_available "jq"; then
        log_warn "jq not available - policy enforcement limited"
        return 1
    fi

    # Validate JSON structure
    if ! jq empty "$POLICIES_FILE" 2>/dev/null; then
        log_error "Invalid JSON in policies file"
        return 1
    fi

    log_debug "Loaded policies from $POLICIES_FILE"
    return 0
}

#######################################
# Check if path matches pattern
#######################################
path_matches_pattern() {
    local path="$1"
    local pattern="$2"

    # Handle empty pattern
    if [ -z "$pattern" ]; then
        return 1
    fi

    # Use bash pattern matching instead of regex conversion
    # This is simpler and more reliable for glob patterns
    case "$path" in
        $pattern)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

#######################################
# Check if path is in allowlist
#######################################
is_path_allowed() {
    local path="$1"

    if ! check_cli_available "jq"; then
        return 1  # Not in allowlist if we can't check
    fi

    local allowlist=$(jq -r '.allowlist.patterns[]?' "$POLICIES_FILE" 2>/dev/null)

    while IFS= read -r pattern; do
        if [ -n "$pattern" ] && path_matches_pattern "$path" "$pattern"; then
            log_debug "Path matches allowlist pattern: $pattern"
            return 0
        fi
    done <<< "$allowlist"

    return 1
}

#######################################
# Check tool against policies
#######################################
check_tool_policies() {
    local tool_name="$1"
    local tool_input="$2"

    # Check if policies are enabled
    local enabled=$(jq -r '.settings.enabled // true' "$POLICIES_FILE" 2>/dev/null)
    if [ "$enabled" = "false" ]; then
        log_debug "Policies are disabled"
        return 0
    fi

    # Get rules for this tool
    local rules=$(jq -c ".rules[] | select((.tool == \"$tool_name\" or .tools[]? == \"$tool_name\") and .enabled == true)" "$POLICIES_FILE" 2>/dev/null)

    if [ -z "$rules" ]; then
        log_debug "No active rules for tool: $tool_name"
        return 0
    fi

    # Process each rule
    while IFS= read -r rule; do
        if [ -z "$rule" ]; then
            continue
        fi

        local rule_id=$(echo "$rule" | jq -r '.id')
        local action=$(echo "$rule" | jq -r '.action')
        local message=$(echo "$rule" | jq -r '.message')

        # Check patterns for Bash commands
        if [ "$tool_name" = "Bash" ]; then
            # Extract command directly from the hook event JSON
            local command=$(echo "$HOOK_EVENT_JSON" | jq -r '.tool_input.command // ""' 2>/dev/null)

            if [ -n "$command" ]; then
                local patterns=$(echo "$rule" | jq -r '.patterns[]?' 2>/dev/null)

                while IFS= read -r pattern; do
                    if [ -n "$pattern" ] && echo "$command" | grep -qE "$pattern"; then
                        log_info "Rule $rule_id matched: $message"

                        case "$action" in
                            "block")
                                log_error "Blocking tool execution: $message"
                                echo "{\"decision\":\"block\",\"reason\":\"$message\"}"
                                exit 2  # Block execution
                                ;;
                            "warn")
                                log_warn "Warning: $message"
                                # Continue execution but log warning
                                ;;
                            *)
                                log_debug "Unknown action: $action"
                                ;;
                        esac
                    fi
                done <<< "$patterns"
            fi
        fi

        # Check paths for file operations
        if [ "$tool_name" = "Write" ] || [ "$tool_name" = "Edit" ] || [ "$tool_name" = "MultiEdit" ]; then
            # Extract file_path directly from the hook event JSON
            local file_path=$(echo "$HOOK_EVENT_JSON" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null)

            if [ -n "$file_path" ]; then
                # Check if path is in allowlist first
                if is_path_allowed "$file_path"; then
                    log_debug "Path is in allowlist, skipping policy checks: $file_path"
                    continue
                fi

                local paths=$(echo "$rule" | jq -r '.paths[]?' 2>/dev/null)

                while IFS= read -r path_pattern; do
                    if [ -n "$path_pattern" ] && path_matches_pattern "$file_path" "$path_pattern"; then
                        log_info "Rule $rule_id matched for path: $file_path"

                        case "$action" in
                            "block")
                                log_error "Blocking file operation: $message"
                                echo "{\"decision\":\"block\",\"reason\":\"$message\"}"
                                exit 2  # Block execution
                                ;;
                            "warn")
                                log_warn "Warning: $message"
                                # Continue execution but log warning
                                ;;
                            *)
                                log_debug "Unknown action: $action"
                                ;;
                        esac
                    fi
                done <<< "$paths"
            fi
        fi
    done <<< "$rules"

    return 0
}

#######################################
# Main hook logic
#######################################
main() {
    # Debug: Log that hook was called
    echo "[DEBUG] PreToolUse hook started" >&2

    # Read stdin and save for debugging
    local stdin_content
    stdin_content=$(cat)

    # Debug: Log what we received
    echo "[DEBUG] Received $(echo "$stdin_content" | wc -c) bytes" >&2
    echo "[DEBUG] First 100 chars: ${stdin_content:0:100}" >&2

    # Parse hook event from the captured stdin
    if ! parse_hook_event "$stdin_content"; then
        log_error "Failed to parse hook event"
        echo "[DEBUG] Parse failed, stdin was: $stdin_content" >&2
        exit 0  # Fail open
    fi

    log_info "PreToolUse hook triggered for tool: $TOOL_NAME"

    # Load policies
    if ! load_policies; then
        log_debug "Policies not available, allowing tool execution"
        exit 0  # Fail open
    fi

    # Check tool against policies
    check_tool_policies "$TOOL_NAME" "$TOOL_INPUT"

    # If we get here, tool is allowed
    log_debug "Tool execution allowed: $TOOL_NAME"

    # Return success response
    echo "{\"decision\":\"allow\",\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"allow\"}}"

    exit 0
}

# Use fail-open wrapper
fail_open_exec main