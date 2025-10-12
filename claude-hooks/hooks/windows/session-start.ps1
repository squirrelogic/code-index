# Claude Code SessionStart Hook - Cache Warming
# Optimizes initial performance by warming caches and checking system health

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
$env:HOOK_NAME = "session-start"

# Cache directory
$CodeIndexRoot = if ($env:CODEINDEX_ROOT) { $env:CODEINDEX_ROOT } else { ".codeindex" }
$CacheDir = Join-Path (Get-Location) "$CodeIndexRoot\cache"

<#
.SYNOPSIS
    Check system health
#>
function Test-SystemHealth {
    $warnings = 0

    Write-LogInfo "Performing system health checks..."

    # Check code-index CLI availability
    if (-not (Test-CliAvailable "code-index")) {
        Write-LogWarn "code-index CLI not found in PATH"
        Write-LogWarn "Install with: npm install -g @squirrelogic/code-index"
        $warnings++
    } else {
        Write-LogDebug "code-index CLI is available"
    }

    # Check disk space
    $drive = (Get-Location).Drive
    if ($drive) {
        $freeSpace = $drive.Free
        $freeSpaceMB = [math]::Round($freeSpace / 1MB, 2)

        if ($freeSpace -lt 100MB) {
            Write-LogWarn "Low disk space: ${freeSpaceMB}MB available"
            $warnings++
        } else {
            Write-LogDebug "Disk space OK: ${freeSpaceMB}MB available"
        }
    }

    # Check index database
    $indexDb = Join-Path (Get-Location) "$CodeIndexRoot\index.db"
    if (Test-Path $indexDb) {
        $dbInfo = Get-Item $indexDb
        $dbSizeMB = [math]::Round($dbInfo.Length / 1MB, 2)
        Write-LogDebug "Index database size: ${dbSizeMB}MB"

        # Check if database is accessible
        try {
            [System.IO.File]::OpenRead($indexDb).Close()
        } catch {
            Write-LogWarn "Index database is not accessible: $_"
            $warnings++
        }

        # Check WAL file size (indicates pending writes)
        $walFile = "${indexDb}-wal"
        if (Test-Path $walFile) {
            $walInfo = Get-Item $walFile
            $walSizeMB = [math]::Round($walInfo.Length / 1MB, 2)
            if ($walInfo.Length -gt 10MB) {
                Write-LogWarn "Large WAL file detected (${walSizeMB}MB) - consider running 'code-index doctor'"
                $warnings++
            }
        }
    } else {
        Write-LogInfo "Index database not found - run 'code-index init' to create"
        $warnings++
    }

    # Check log directory
    $logDir = Join-Path (Get-Location) "$CodeIndexRoot\logs"
    if (Test-Path $logDir) {
        # Clean up old log files (older than 7 days)
        Get-ChildItem -Path $logDir -Filter "*.jsonl" |
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
        Write-LogDebug "Log directory cleaned"
    }

    return $warnings
}

<#
.SYNOPSIS
    Warm index cache
#>
function Start-CacheWarming {
    Write-LogInfo "Warming index cache..."

    # Check if code-index is available
    if (-not (Test-CliAvailable "code-index")) {
        Write-LogDebug "Skipping cache warming - code-index not available"
        return $false
    }

    # Create cache directory if needed
    if (-not (Test-Path $CacheDir)) {
        New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
    }

    # Run index statistics to warm cache
    Write-LogDebug "Loading index statistics..."
    try {
        $stats = & code-index stats 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-LogInfo "Index statistics loaded successfully"
            $stats | ForEach-Object { Write-LogDebug "Stats: $_" }
        } else {
            Write-LogWarn "Failed to load index statistics"
        }
    } catch {
        Write-LogWarn "Error loading index statistics: $_"
    }

    # Preload common search patterns
    $commonPatterns = @("function", "class", "import", "export", "TODO", "FIXME")
    foreach ($pattern in $commonPatterns) {
        Write-LogDebug "Preloading search pattern: $pattern"
        try {
            & code-index search $pattern --limit 1 2>&1 | Out-Null
        } catch {
            # Ignore errors
        }
    }

    # Touch cache timestamp
    $warmedFile = Join-Path $CacheDir ".warmed"
    New-Item -ItemType File -Path $warmedFile -Force | Out-Null

    return $true
}

<#
.SYNOPSIS
    Display session information
#>
function Show-SessionInfo {
    param(
        [string]$Source
    )

    # Format session source message
    $sessionType = switch ($Source) {
        "startup" { "New session" }
        "resume" { "Resumed session" }
        "clear" { "Cleared session" }
        "compact" { "Compacted session" }
        default { "Session" }
    }

    Write-LogInfo "$sessionType started (ID: $SessionId)"

    # Get project info
    $projectRoot = Find-ProjectRoot
    Write-LogInfo "Project root: $projectRoot"

    # Get index status
    if (Test-CliAvailable "code-index") {
        try {
            $stats = & code-index stats 2>&1
            if ($LASTEXITCODE -eq 0) {
                $fileCount = if ($stats -match "Files:\s*(\d+)" -or $stats -match "Total files:\s*(\d+)") {
                    $Matches[1]
                }
                if ($fileCount) {
                    Write-LogInfo "Index contains $fileCount files"
                }
            }
        } catch {
            # Ignore errors
        }
    }
}

<#
.SYNOPSIS
    Provide helpful tips
#>
function Show-Tips {
    # Only show tips for new sessions
    if ($Source -ne "startup") {
        return
    }

    # Check if we've shown tips recently
    $tipsFile = Join-Path $CacheDir ".tips_shown"
    if (Test-Path $tipsFile) {
        $lastShown = (Get-Item $tipsFile).LastWriteTime
        $timeDiff = (Get-Date) - $lastShown

        # Show tips at most once per day
        if ($timeDiff.TotalHours -lt 24) {
            return
        }
    }

    # Select a random tip
    $tips = @(
        "Use 'code-index search <query>' to search your codebase"
        "Run 'code-index doctor' to check system health"
        "Use 'code-index refresh' to update the index after changes"
        "Edit .claude\policies.json to customize security policies"
        "Check .codeindex\logs\ for detailed hook execution logs"
    )

    $tip = $tips | Get-Random
    Write-LogInfo "💡 Tip: $tip"

    # Update tips timestamp
    if (-not (Test-Path $CacheDir)) {
        New-Item -ItemType Directory -Path $CacheDir -Force | Out-Null
    }
    New-Item -ItemType File -Path $tipsFile -Force | Out-Null
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

    Write-LogInfo "SessionStart hook triggered (source: $Source)"

    # Display session information
    Show-SessionInfo -Source $Source

    # Check system health
    $healthWarnings = Test-SystemHealth

    if ($healthWarnings -gt 0) {
        Write-LogWarn "System health check found $healthWarnings warning(s)"
    } else {
        Write-LogInfo "System health check passed"
    }

    # Warm cache for better performance
    if (Start-CacheWarming) {
        Write-LogInfo "Cache warming completed"
    } else {
        Write-LogDebug "Cache warming skipped"
    }

    # Show helpful tips
    Show-Tips

    # Return additional context for Claude
    $response = @{
        hookSpecificOutput = @{
            hookEventName = "SessionStart"
            additionalContext = "Code index is ready. Use 'code-index search' to search the codebase."
        }
    } | ConvertTo-Json -Compress

    Write-Output $response

    exit 0
}

# Use fail-open wrapper
Invoke-FailOpen -ScriptBlock { Main }