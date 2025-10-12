# Claude Code PostToolUse Hook - Index Refresh
# Automatically refreshes code index after file modifications

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
$env:HOOK_NAME = "post-tool-use"

# Lock name for index refresh
$LockName = "CodeIndexRefresh"

<#
.SYNOPSIS
    Check if tool modifies files
#>
function Test-FileModifyingTool {
    param(
        [string]$ToolName,
        [object]$ToolInput
    )

    switch ($ToolName) {
        { $_ -in @("Write", "Edit", "MultiEdit", "NotebookEdit") } {
            return $true
        }
        "Bash" {
            # Check if bash command might modify files
            $command = if ($ToolInput.command) { $ToolInput.command } else { "" }
            if ($command -match "(>|>>|tee|sed\s+-i|awk.*>|echo.*>|cat.*>|cp|mv|rm|touch|mkdir)") {
                return $true
            }
        }
    }

    return $false
}

<#
.SYNOPSIS
    Extract modified files from tool response
#>
function Get-ModifiedFiles {
    param(
        [string]$ToolName,
        [object]$ToolInput,
        [object]$ToolResponse
    )

    $modifiedFiles = @()

    switch ($ToolName) {
        { $_ -in @("Write", "Edit", "MultiEdit") } {
            # Extract file_path from tool input
            $filePath = if ($ToolInput.file_path) {
                $ToolInput.file_path
            } elseif ($ToolInput.path) {
                $ToolInput.path
            }

            if ($filePath) {
                $modifiedFiles += $filePath
            }
        }
        "NotebookEdit" {
            # Extract notebook_path from tool input
            if ($ToolInput.notebook_path) {
                $modifiedFiles += $ToolInput.notebook_path
            }
        }
        "Bash" {
            # Try to detect file modifications from command output
            $responseText = if ($ToolResponse) { $ToolResponse | Out-String } else { "" }
            if ($responseText -match "File.*created|File.*updated|File.*modified") {
                Write-LogDebug "Detected file modification in bash command output"
                $modifiedFiles += "<multiple>"
            }
        }
    }

    return $modifiedFiles
}

<#
.SYNOPSIS
    Check if index needs refresh
#>
function Test-IndexRefreshNeeded {
    # Check if index database exists
    $indexDb = Join-Path (Get-Location) ".codeindex\index.db"
    if (-not (Test-Path $indexDb)) {
        Write-LogDebug "Index database not found, skipping refresh"
        return $false
    }

    # Check if we've refreshed recently (avoid too frequent refreshes)
    $lastRefreshFile = Join-Path (Get-Location) ".codeindex\.last_refresh"
    if (Test-Path $lastRefreshFile) {
        $lastRefresh = (Get-Item $lastRefreshFile).LastWriteTime
        $timeDiff = (Get-Date) - $lastRefresh

        if ($timeDiff.TotalSeconds -lt 5) {
            Write-LogDebug "Index was refreshed $($timeDiff.TotalSeconds)s ago, skipping"
            return $false
        }
    }

    # Update last refresh time
    New-Item -ItemType File -Path $lastRefreshFile -Force | Out-Null

    return $true
}

<#
.SYNOPSIS
    Trigger index refresh
#>
function Start-IndexRefresh {
    param(
        [string[]]$ModifiedFiles
    )

    # Check if code-index CLI is available
    if (-not (Test-CliAvailable "code-index")) {
        Write-LogWarn "code-index CLI not found in PATH, skipping index refresh"
        return
    }

    # Acquire lock to prevent concurrent refreshes
    Write-LogDebug "Acquiring lock for index refresh"

    $mutex = Get-FileLock -LockName $LockName -TimeoutSeconds 2
    if (-not $mutex) {
        Write-LogWarn "Another index refresh is in progress, skipping"
        return
    }

    try {
        Write-LogInfo "Triggering index refresh for modified files: $($ModifiedFiles -join ', ')"

        # Run refresh in background job
        $job = Start-Job -ScriptBlock {
            param($LogDir, $HookName)

            # Small delay to ensure file operations are complete
            Start-Sleep -Milliseconds 500

            # Run refresh command
            try {
                $output = & code-index refresh 2>&1
                $success = $LASTEXITCODE -eq 0

                # Log output
                $logFile = Join-Path $LogDir "hooks-$(Get-Date -Format 'yyyyMMdd').jsonl"
                $logEntry = @{
                    timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
                    level = if ($success) { "info" } else { "error" }
                    hook = $HookName
                    message = if ($success) {
                        "Index refresh completed successfully"
                    } else {
                        "Index refresh failed: $output"
                    }
                } | ConvertTo-Json -Compress

                Add-Content -Path $logFile -Value $logEntry -ErrorAction SilentlyContinue
            } catch {
                # Log error
                $logFile = Join-Path $LogDir "hooks-$(Get-Date -Format 'yyyyMMdd').jsonl"
                $logEntry = @{
                    timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
                    level = "error"
                    hook = $HookName
                    message = "Index refresh failed: $_"
                } | ConvertTo-Json -Compress

                Add-Content -Path $logFile -Value $logEntry -ErrorAction SilentlyContinue
            }
        } -ArgumentList $script:LogDir, $env:HOOK_NAME

        Write-LogDebug "Index refresh job started (ID: $($job.Id))"
    } finally {
        # Release lock
        Release-FileLock -Mutex $mutex
    }
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

    Write-LogInfo "PostToolUse hook triggered for tool: $ToolName"

    # Check if this is a file-modifying tool
    if (-not (Test-FileModifyingTool -ToolName $ToolName -ToolInput $ToolInput)) {
        Write-LogDebug "Tool does not modify files, skipping index refresh"
        exit 0
    }

    # Extract modified files
    $modifiedFiles = Get-ModifiedFiles -ToolName $ToolName -ToolInput $ToolInput -ToolResponse $ToolResponse

    if ($modifiedFiles.Count -eq 0) {
        Write-LogDebug "No modified files detected"
        exit 0
    }

    Write-LogInfo "Detected file modifications: $($modifiedFiles -join ', ')"

    # Check if index should be refreshed
    if (-not (Test-IndexRefreshNeeded)) {
        Write-LogDebug "Index refresh not needed"
        exit 0
    }

    # Trigger index refresh
    Start-IndexRefresh -ModifiedFiles $modifiedFiles

    # Return success (don't block on refresh)
    Write-LogDebug "PostToolUse hook completed"

    exit 0
}

# Use fail-open wrapper
Invoke-FailOpen -ScriptBlock { Main }