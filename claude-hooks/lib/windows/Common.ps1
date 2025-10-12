# Claude Code Hooks - Common PowerShell Utilities
# Shared functions for Windows hook implementations

# Log levels
$script:LogLevels = @{
    ERROR = 0
    WARN  = 1
    INFO  = 2
    DEBUG = 3
}

# Default log level
$script:LogLevel = if ($env:LOG_LEVEL) { $env:LOG_LEVEL } else { $script:LogLevels.INFO }

# Log directory
$script:LogDir = if ($env:CODEINDEX_ROOT) {
    Join-Path $env:CODEINDEX_ROOT "logs"
} else {
    ".codeindex\logs"
}

<#
.SYNOPSIS
    Log an informational message
.PARAMETER Message
    The message to log
#>
function Write-LogInfo {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )

    if ($script:LogLevel -ge $script:LogLevels.INFO) {
        Write-Host "[INFO] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" -ForegroundColor Green
    }
    Write-JsonLog -Level "info" -Message $Message
}

<#
.SYNOPSIS
    Log an error message
.PARAMETER Message
    The error message to log
#>
function Write-LogError {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )

    if ($script:LogLevel -ge $script:LogLevels.ERROR) {
        Write-Host "[ERROR] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" -ForegroundColor Red
    }
    Write-JsonLog -Level "error" -Message $Message
}

<#
.SYNOPSIS
    Log a warning message
.PARAMETER Message
    The warning message to log
#>
function Write-LogWarn {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )

    if ($script:LogLevel -ge $script:LogLevels.WARN) {
        Write-Host "[WARN] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" -ForegroundColor Yellow
    }
    Write-JsonLog -Level "warn" -Message $Message
}

<#
.SYNOPSIS
    Log a debug message
.PARAMETER Message
    The debug message to log
#>
function Write-LogDebug {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message
    )

    if ($script:LogLevel -ge $script:LogLevels.DEBUG) {
        Write-Host "[DEBUG] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message" -ForegroundColor Cyan
    }
    Write-JsonLog -Level "debug" -Message $Message
}

<#
.SYNOPSIS
    Write JSON log to file
.PARAMETER Level
    The log level
.PARAMETER Message
    The log message
#>
function Write-JsonLog {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Level,
        [Parameter(Mandatory=$true)]
        [string]$Message
    )

    $logFile = Join-Path $script:LogDir "hooks-$(Get-Date -Format 'yyyyMMdd').jsonl"

    # Create log directory if it doesn't exist
    if (-not (Test-Path $script:LogDir)) {
        New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
    }

    # Create JSON log entry
    $logEntry = @{
        timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
        level = $Level
        hook = if ($env:HOOK_NAME) { $env:HOOK_NAME } else { "unknown" }
        message = $Message
        session_id = if ($env:SESSION_ID) { $env:SESSION_ID } else { "" }
    } | ConvertTo-Json -Compress

    # Append to log file
    try {
        Add-Content -Path $logFile -Value $logEntry -ErrorAction SilentlyContinue
    } catch {
        # Silently fail if we can't write to log
    }
}

<#
.SYNOPSIS
    Check if a CLI tool is available
.PARAMETER CliName
    The name of the CLI tool to check
.RETURNS
    $true if available, $false otherwise
#>
function Test-CliAvailable {
    param(
        [Parameter(Mandatory=$true)]
        [string]$CliName
    )

    $command = Get-Command -Name $CliName -ErrorAction SilentlyContinue
    if ($command) {
        Write-LogDebug "CLI tool '$CliName' is available"
        return $true
    } else {
        Write-LogWarn "CLI tool '$CliName' is not available"
        return $false
    }
}

<#
.SYNOPSIS
    Acquire a file lock for exclusive operations
.PARAMETER LockName
    The name of the lock (will be used to create mutex)
.PARAMETER TimeoutSeconds
    Timeout in seconds (default 5)
.RETURNS
    Mutex object on success, $null on failure
#>
function Get-FileLock {
    param(
        [Parameter(Mandatory=$true)]
        [string]$LockName,
        [int]$TimeoutSeconds = 5
    )

    $mutexName = "Global\ClaudeHooks_$LockName"
    $mutex = New-Object System.Threading.Mutex($false, $mutexName)

    try {
        $acquired = $mutex.WaitOne($TimeoutSeconds * 1000)
        if ($acquired) {
            Write-LogDebug "Acquired lock: $LockName"
            return $mutex
        } else {
            Write-LogWarn "Failed to acquire lock: $LockName (timeout: ${TimeoutSeconds}s)"
            $mutex.Dispose()
            return $null
        }
    } catch {
        Write-LogError "Error acquiring lock: $_"
        if ($mutex) { $mutex.Dispose() }
        return $null
    }
}

<#
.SYNOPSIS
    Release a file lock
.PARAMETER Mutex
    The mutex object to release
#>
function Release-FileLock {
    param(
        [Parameter(Mandatory=$true)]
        [System.Threading.Mutex]$Mutex
    )

    try {
        $Mutex.ReleaseMutex()
        $Mutex.Dispose()
        Write-LogDebug "Released lock"
    } catch {
        Write-LogError "Error releasing lock: $_"
    }
}

<#
.SYNOPSIS
    Safely convert JSON string to object
.PARAMETER JsonString
    The JSON string to parse
.RETURNS
    Parsed object or $null on error
#>
function ConvertFrom-JsonSafe {
    param(
        [Parameter(Mandatory=$true)]
        [string]$JsonString
    )

    try {
        return $JsonString | ConvertFrom-Json
    } catch {
        Write-LogError "Failed to parse JSON: $_"
        return $null
    }
}

<#
.SYNOPSIS
    Parse hook event from stdin with enhanced error handling
.PARAMETER InputJson
    Optional JSON input (defaults to stdin)
.RETURNS
    Parsed event object or $null on error
#>
function Parse-HookEvent {
    param(
        [string]$InputJson = ""
    )

    # Read JSON from stdin if not provided
    if ([string]::IsNullOrWhiteSpace($InputJson)) {
        $InputJson = [Console]::In.ReadToEnd()
    }

    if ([string]::IsNullOrWhiteSpace($InputJson)) {
        Write-LogError "No input received"
        return $null
    }

    $event = ConvertFrom-JsonSafe -JsonString $InputJson

    if ($event) {
        # Set global variables for easy access - common fields
        $global:HookEventJson = $InputJson
        $global:HookEventName = $event.hook_event_name
        $global:SessionId = $event.session_id
        $global:Cwd = $event.cwd
        $global:TranscriptPath = $event.transcript_path

        # Set event-specific fields
        switch ($event.hook_event_name) {
            { $_ -in "PreToolUse", "PostToolUse" } {
                $global:ToolName = $event.tool_name
                $global:ToolInput = $event.tool_input
                if ($event.hook_event_name -eq "PostToolUse") {
                    $global:ToolResponse = $event.tool_response
                }
            }
            "SessionStart" {
                $global:Source = $event.source
            }
            "UserPromptSubmit" {
                $global:Prompt = $event.prompt
            }
            "Notification" {
                $global:Message = $event.message
            }
            { $_ -in "Stop", "SubagentStop" } {
                $global:StopHookActive = $event.stop_hook_active
            }
            "PreCompact" {
                $global:Trigger = $event.trigger
                $global:CustomInstructions = $event.custom_instructions
            }
            "SessionEnd" {
                $global:Reason = $event.reason
            }
        }

        # Set hook name for logging
        $env:HOOK_NAME = $event.hook_event_name

        Write-LogDebug "Parsed hook event: type=$($event.hook_event_name), session=$($event.session_id), tool=$($event.tool_name)"
    }

    return $event
}

<#
.SYNOPSIS
    Find the project root directory
.PARAMETER StartPath
    The starting path for the search
.RETURNS
    Project root path
#>
function Find-ProjectRoot {
    param(
        [string]$StartPath = (Get-Location).Path
    )

    # First try git root
    try {
        $gitRoot = & git -C $StartPath rev-parse --show-toplevel 2>$null
        if ($LASTEXITCODE -eq 0 -and $gitRoot) {
            return $gitRoot
        }
    } catch {
        # Git command failed, continue to next method
    }

    # Look for .claude directory
    $currentDir = $StartPath
    while ($currentDir -ne [System.IO.Path]::GetPathRoot($currentDir)) {
        if (Test-Path (Join-Path $currentDir ".claude")) {
            return $currentDir
        }
        $currentDir = Split-Path -Parent $currentDir
    }

    # Default to current directory
    return Get-Location
}

<#
.SYNOPSIS
    Fail-open wrapper for hook execution
.PARAMETER ScriptBlock
    The script block to execute
.DESCRIPTION
    Executes the script block and always exits with 0 to prevent blocking Claude Code
#>
function Invoke-FailOpen {
    param(
        [Parameter(Mandatory=$true)]
        [ScriptBlock]$ScriptBlock
    )

    try {
        & $ScriptBlock
    } catch {
        Write-LogError "Command failed: $_"
        Write-LogInfo "Failing open to prevent blocking Claude Code"
        exit 0
    }
}

# Export module members
Export-ModuleMember -Function Write-LogInfo, Write-LogError, Write-LogWarn, Write-LogDebug
Export-ModuleMember -Function Test-CliAvailable, Get-FileLock, Release-FileLock
Export-ModuleMember -Function ConvertFrom-JsonSafe, Parse-HookEvent
Export-ModuleMember -Function Find-ProjectRoot, Invoke-FailOpen