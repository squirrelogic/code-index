# Claude Code PreToolUse Hook - Policy Enforcement
# Validates tool usage against project policies before execution

[CmdletBinding()]
param()

# Get the directory of this script
$HookDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Import common functions (try local copy first, then lib directory)
$CommonPath = Join-Path $HookDir "Common.ps1"
if (-not (Test-Path $CommonPath)) {
    $CommonPath = Join-Path (Split-Path -Parent (Split-Path -Parent $HookDir)) "lib\windows\Common.ps1"
}

if (Test-Path $CommonPath) {
    Import-Module $CommonPath -Force
} else {
    Write-Host "ERROR: Could not find Common.ps1 library" -ForegroundColor Red
    exit 0  # Fail open
}

# Set hook name for logging
$env:HOOK_NAME = "pre-tool-use"

# Policy file location
$ClaudeDir = if ($env:CLAUDE_DIR) { $env:CLAUDE_DIR } else { ".claude" }
$PoliciesFile = Join-Path (Get-Location) "$ClaudeDir\policies.json"

<#
.SYNOPSIS
    Load and validate policies
#>
function Get-Policies {
    if (-not (Test-Path $PoliciesFile)) {
        Write-LogWarn "Policies file not found: $PoliciesFile"
        return $null
    }

    try {
        $policies = Get-Content $PoliciesFile -Raw | ConvertFrom-Json
        Write-LogDebug "Loaded policies from $PoliciesFile"
        return $policies
    } catch {
        Write-LogError "Failed to load policies: $_"
        return $null
    }
}

<#
.SYNOPSIS
    Check if path matches pattern
#>
function Test-PathPattern {
    param(
        [string]$Path,
        [string]$Pattern
    )

    # Convert glob pattern to regex
    $regex = $Pattern -replace '\*\*', '.*' -replace '\*', '[^/\\]*'
    $regex = "^$regex$"

    return $Path -match $regex
}

<#
.SYNOPSIS
    Check if path is in allowlist
#>
function Test-PathAllowed {
    param(
        [string]$Path,
        [object]$Policies
    )

    if (-not $Policies.allowlist -or -not $Policies.allowlist.patterns) {
        return $false
    }

    foreach ($pattern in $Policies.allowlist.patterns) {
        if (Test-PathPattern -Path $Path -Pattern $pattern) {
            Write-LogDebug "Path matches allowlist pattern: $pattern"
            return $true
        }
    }

    return $false
}

<#
.SYNOPSIS
    Check tool against policies
#>
function Test-ToolPolicies {
    param(
        [string]$ToolName,
        [object]$ToolInput,
        [object]$Policies
    )

    # Check if policies are enabled
    if ($Policies.settings -and $Policies.settings.enabled -eq $false) {
        Write-LogDebug "Policies are disabled"
        return @{ allowed = $true }
    }

    # Get rules for this tool
    $applicableRules = $Policies.rules | Where-Object {
        $_.enabled -eq $true -and
        (($_.tool -eq $ToolName) -or ($_.tools -contains $ToolName))
    }

    if ($applicableRules.Count -eq 0) {
        Write-LogDebug "No active rules for tool: $ToolName"
        return @{ allowed = $true }
    }

    # Process each rule
    foreach ($rule in $applicableRules) {
        $ruleId = $rule.id
        $action = $rule.action
        $message = $rule.message

        # Check patterns for Bash commands
        if ($ToolName -eq "Bash" -and $rule.patterns) {
            $command = if ($ToolInput.command) { $ToolInput.command } else { "" }

            if ($command) {
                foreach ($pattern in $rule.patterns) {
                    if ($command -match $pattern) {
                        Write-LogInfo "Rule $ruleId matched: $message"

                        switch ($action) {
                            "block" {
                                Write-LogError "Blocking tool execution: $message"
                                return @{
                                    allowed = $false
                                    reason = $message
                                }
                            }
                            "warn" {
                                Write-LogWarn "Warning: $message"
                                # Continue execution but log warning
                            }
                            default {
                                Write-LogDebug "Unknown action: $action"
                            }
                        }
                    }
                }
            }
        }

        # Check paths for file operations
        if (($ToolName -in @("Write", "Edit", "MultiEdit")) -and $rule.paths) {
            $filePath = if ($ToolInput.file_path) {
                $ToolInput.file_path
            } elseif ($ToolInput.path) {
                $ToolInput.path
            } else {
                ""
            }

            if ($filePath) {
                # Normalize path separators
                $filePath = $filePath -replace '\\', '/'

                # Check if path is in allowlist first
                if (Test-PathAllowed -Path $filePath -Policies $Policies) {
                    Write-LogDebug "Path is in allowlist, skipping policy checks: $filePath"
                    continue
                }

                foreach ($pathPattern in $rule.paths) {
                    if (Test-PathPattern -Path $filePath -Pattern $pathPattern) {
                        Write-LogInfo "Rule $ruleId matched for path: $filePath"

                        switch ($action) {
                            "block" {
                                Write-LogError "Blocking file operation: $message"
                                return @{
                                    allowed = $false
                                    reason = $message
                                }
                            }
                            "warn" {
                                Write-LogWarn "Warning: $message"
                                # Continue execution but log warning
                            }
                            default {
                                Write-LogDebug "Unknown action: $action"
                            }
                        }
                    }
                }
            }
        }
    }

    return @{ allowed = $true }
}

<#
.SYNOPSIS
    Main hook logic
#>
function Main {
    # Parse hook event from stdin
    $event = Parse-HookEvent
    if (-not $event) {
        Write-LogError "Failed to parse hook event"
        exit 0  # Fail open
    }

    Write-LogInfo "PreToolUse hook triggered for tool: $ToolName"

    # Load policies
    $policies = Get-Policies
    if (-not $policies) {
        Write-LogDebug "Policies not available, allowing tool execution"
        exit 0  # Fail open
    }

    # Check tool against policies
    $result = Test-ToolPolicies -ToolName $ToolName -ToolInput $ToolInput -Policies $policies

    if (-not $result.allowed) {
        # Block execution
        $response = @{
            decision = "block"
            reason = $result.reason
        } | ConvertTo-Json -Compress

        Write-Output $response
        exit 2  # Block execution
    }

    # Tool is allowed
    Write-LogDebug "Tool execution allowed: $ToolName"

    # Return success response
    $response = @{
        decision = "allow"
        hookSpecificOutput = @{
            hookEventName = "PreToolUse"
            permissionDecision = "allow"
        }
    } | ConvertTo-Json -Compress

    Write-Output $response
    exit 0
}

# Use fail-open wrapper
Invoke-FailOpen -ScriptBlock { Main }