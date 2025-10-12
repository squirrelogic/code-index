# Claude Code Hooks Uninstaller for Windows
# Removes hooks and cleans up configuration

[CmdletBinding()]
param(
    [Parameter(HelpMessage="Force removal without confirmation")]
    [switch]$Force,

    [Parameter(HelpMessage="Keep policies.json file")]
    [switch]$KeepPolicies,

    [Parameter(HelpMessage="Keep log files")]
    [switch]$KeepLogs,

    [Parameter(HelpMessage="Skip confirmation prompt")]
    [Alias("y")]
    [switch]$Yes,

    [Parameter(HelpMessage="Show help message")]
    [switch]$Help
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Get the directory of this script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HooksRoot = Split-Path -Parent $ScriptDir

# Try to import common functions (may not exist if partially uninstalled)
try {
    Import-Module "$HooksRoot\lib\windows\Common.ps1" -Force -ErrorAction SilentlyContinue
} catch {
    # Define fallback logging functions
    function Write-LogInfo { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Green }
    function Write-LogError { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
    function Write-LogWarn { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
    function Write-LogDebug { param($Message) if ($VerbosePreference -ne 'SilentlyContinue') { Write-Host "[DEBUG] $Message" -ForegroundColor Cyan } }
}

# Configuration
$Version = "1.0.0"
$ClaudeDir = ".claude"
$HooksSubdir = "hooks"
$CodeIndexDir = ".codeindex"

# Set confirmation flag
$Confirm = -not ($Yes -or $Force)

<#
.SYNOPSIS
    Display usage information
#>
function Show-Usage {
    Write-Host @"
Claude Code Hooks Uninstaller v$Version

Usage: .\uninstall.ps1 [OPTIONS]

Options:
    -Force          Force removal without confirmation
    -KeepPolicies   Keep policies.json file
    -KeepLogs       Keep log files
    -Yes            Skip confirmation prompt
    -Help           Show this help message

Example:
    .\uninstall.ps1                    # Interactive uninstall
    .\uninstall.ps1 -Yes                # Uninstall with automatic confirmation
    .\uninstall.ps1 -KeepPolicies       # Uninstall but preserve policy configuration

"@
    exit 0
}

<#
.SYNOPSIS
    Find installation root
#>
function Find-InstallationRoot {
    # Try to find project root using common indicators
    $currentPath = Get-Location

    # Look for .claude directory
    while ($currentPath -ne [System.IO.Path]::GetPathRoot($currentPath)) {
        if (Test-Path (Join-Path $currentPath $ClaudeDir)) {
            Set-Location $currentPath
            Write-LogInfo "Uninstalling hooks from: $currentPath"
            return $currentPath
        }
        $currentPath = Split-Path -Parent $currentPath
    }

    # Default to current directory
    Set-Location (Get-Location)
    Write-LogInfo "Uninstalling from current directory: $(Get-Location)"
    return Get-Location
}

<#
.SYNOPSIS
    Check what's installed
#>
function Test-Installation {
    $foundItems = $false

    Write-Host ""
    Write-Host "Found the following Claude Code hooks components:"
    Write-Host ""

    # Check hooks directory
    $hooksPath = Join-Path (Get-Location) "$ClaudeDir\$HooksSubdir"
    if (Test-Path $hooksPath) {
        $hookFiles = Get-ChildItem -Path $hooksPath -Filter "*.sh","*.ps1" -ErrorAction SilentlyContinue
        if ($hookFiles.Count -gt 0) {
            Write-Host "  • $($hookFiles.Count) hook script(s) in $ClaudeDir\$HooksSubdir\"
            $foundItems = $true
        }
    }

    # Check settings.json
    $settingsPath = Join-Path (Get-Location) "$ClaudeDir\settings.json"
    if (Test-Path $settingsPath) {
        Write-Host "  • Hook registration in $ClaudeDir\settings.json"
        $foundItems = $true
    }

    # Check policies.json
    $policiesPath = Join-Path (Get-Location) "$ClaudeDir\policies.json"
    if (Test-Path $policiesPath) {
        if ($KeepPolicies) {
            Write-Host "  • Policy configuration in $ClaudeDir\policies.json (will be kept)"
        } else {
            Write-Host "  • Policy configuration in $ClaudeDir\policies.json"
        }
        $foundItems = $true
    }

    # Check logs
    $logsPath = Join-Path (Get-Location) "$CodeIndexDir\logs"
    if (Test-Path $logsPath) {
        $logFiles = Get-ChildItem -Path $logsPath -Filter "*.jsonl" -ErrorAction SilentlyContinue
        if ($logFiles.Count -gt 0) {
            if ($KeepLogs) {
                Write-Host "  • $($logFiles.Count) log file(s) in $CodeIndexDir\logs\ (will be kept)"
            } else {
                Write-Host "  • $($logFiles.Count) log file(s) in $CodeIndexDir\logs\"
            }
            $foundItems = $true
        }
    }

    # Check backups
    $backupDirs = Get-ChildItem -Path (Join-Path (Get-Location) $ClaudeDir) -Filter "backup-*" -Directory -ErrorAction SilentlyContinue
    if ($backupDirs.Count -gt 0) {
        Write-Host "  • $($backupDirs.Count) backup folder(s) in $ClaudeDir\"
        $foundItems = $true
    }

    if (-not $foundItems) {
        Write-Host "  No Claude Code hooks components found."
        Write-Host ""
        exit 0
    }

    Write-Host ""
    return $foundItems
}

<#
.SYNOPSIS
    Confirm uninstallation
#>
function Confirm-Uninstall {
    if (-not $Confirm) {
        return $true
    }

    Write-Host "⚠️  This will remove the Claude Code hooks from your project." -ForegroundColor Yellow
    Write-Host ""

    $response = Read-Host "Are you sure you want to continue? (y/N)"

    if ($response -notmatch "^[Yy]") {
        Write-LogInfo "Uninstallation cancelled"
        exit 0
    }

    return $true
}

<#
.SYNOPSIS
    Remove hook files
#>
function Remove-Hooks {
    Write-LogInfo "Removing hook scripts..."

    $hooksPath = Join-Path (Get-Location) "$ClaudeDir\$HooksSubdir"

    if (Test-Path $hooksPath) {
        # Remove hook scripts
        Get-ChildItem -Path $hooksPath -Include "*.sh","*.ps1","Common.ps1","common.sh" -File |
            Remove-Item -Force -ErrorAction SilentlyContinue

        # Remove hooks directory if empty
        if ((Get-ChildItem -Path $hooksPath -ErrorAction SilentlyContinue).Count -eq 0) {
            Remove-Item -Path $hooksPath -Force -ErrorAction SilentlyContinue
        } else {
            Write-LogWarn "Could not remove $hooksPath - directory not empty"
        }

        Write-LogInfo "Hook scripts removed"
    } else {
        Write-LogDebug "Hooks directory not found"
    }
}

<#
.SYNOPSIS
    Clean settings.json
#>
function Clear-Settings {
    Write-LogInfo "Cleaning hook registration from settings.json..."

    $settingsPath = Join-Path (Get-Location) "$ClaudeDir\settings.json"

    if (-not (Test-Path $settingsPath)) {
        Write-LogDebug "settings.json not found"
        return
    }

    try {
        # Load settings
        $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json

        # Remove hooks section
        if ($settings.PSObject.Properties.Name -contains "hooks") {
            $settings.PSObject.Properties.Remove("hooks")
        }

        # Save modified settings
        $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath

        Write-LogInfo "Hook registration removed from settings.json"
    } catch {
        Write-LogWarn "Could not clean settings.json: $_"
        Write-LogWarn "Manual cleanup may be required"
    }
}

<#
.SYNOPSIS
    Remove policies
#>
function Remove-Policies {
    if ($KeepPolicies) {
        Write-LogInfo "Keeping policies.json as requested"
        return
    }

    Write-LogInfo "Removing policies configuration..."

    $policiesPath = Join-Path (Get-Location) "$ClaudeDir\policies.json"

    if (Test-Path $policiesPath) {
        Remove-Item -Path $policiesPath -Force
        Write-LogInfo "Policies removed"
    } else {
        Write-LogDebug "policies.json not found"
    }
}

<#
.SYNOPSIS
    Clean logs
#>
function Clear-Logs {
    if ($KeepLogs) {
        Write-LogInfo "Keeping log files as requested"
        return
    }

    Write-LogInfo "Cleaning log files..."

    $logsPath = Join-Path (Get-Location) "$CodeIndexDir\logs"

    if (Test-Path $logsPath) {
        # Remove hook-specific log files
        Get-ChildItem -Path $logsPath -Filter "hooks-*.jsonl" |
            Remove-Item -Force -ErrorAction SilentlyContinue

        Write-LogInfo "Log files cleaned"
    } else {
        Write-LogDebug "Logs directory not found"
    }
}

<#
.SYNOPSIS
    Clean backups
#>
function Clear-Backups {
    Write-LogInfo "Cleaning backup folders..."

    $claudePath = Join-Path (Get-Location) $ClaudeDir
    $backupDirs = Get-ChildItem -Path $claudePath -Filter "backup-*" -Directory -ErrorAction SilentlyContinue

    if ($backupDirs.Count -gt 0) {
        $backupDirs | Remove-Item -Recurse -Force
        Write-LogInfo "Removed $($backupDirs.Count) backup folder(s)"
    } else {
        Write-LogDebug "No backup folders found"
    }
}

<#
.SYNOPSIS
    Clean empty directories
#>
function Clear-EmptyDirectories {
    Write-LogDebug "Cleaning empty directories..."

    # Try to remove hooks directory if empty
    $hooksPath = Join-Path (Get-Location) "$ClaudeDir\$HooksSubdir"
    if (Test-Path $hooksPath) {
        if ((Get-ChildItem -Path $hooksPath -ErrorAction SilentlyContinue).Count -eq 0) {
            Remove-Item -Path $hooksPath -Force -ErrorAction SilentlyContinue
        }
    }

    # Try to remove .claude directory if empty
    $claudePath = Join-Path (Get-Location) $ClaudeDir
    if (Test-Path $claudePath) {
        if ((Get-ChildItem -Path $claudePath -ErrorAction SilentlyContinue).Count -eq 0) {
            Remove-Item -Path $claudePath -Force -ErrorAction SilentlyContinue
        } else {
            Write-LogDebug ".claude directory not empty, keeping it"
        }
    }

    # Try to remove logs directory if empty
    $logsPath = Join-Path (Get-Location) "$CodeIndexDir\logs"
    if (Test-Path $logsPath) {
        if ((Get-ChildItem -Path $logsPath -ErrorAction SilentlyContinue).Count -eq 0) {
            Remove-Item -Path $logsPath -Force -ErrorAction SilentlyContinue
        }
    }
}

<#
.SYNOPSIS
    Display summary
#>
function Show-Summary {
    Write-Host @"

========================================
Claude Code Hooks Uninstallation Complete
========================================

The following components have been removed:
  ✓ Hook scripts from .claude\hooks\
  ✓ Hook registration from .claude\settings.json
"@

    if (-not $KeepPolicies) {
        Write-Host "  ✓ Policy configuration from .claude\policies.json"
    }

    if (-not $KeepLogs) {
        Write-Host "  ✓ Hook log files from .codeindex\logs\"
    }

    Write-Host @"
  ✓ Backup folders

Note: The code-index CLI itself has not been uninstalled.
To uninstall the CLI, run: npm uninstall -g @squirrelogic/code-index

To reinstall Claude Code hooks later, run:
  .\claude-hooks\installers\install.ps1

"@
}

#######################################
# Main uninstall flow
#######################################
function Main {
    Write-LogInfo "Starting Claude Code Hooks uninstaller v$Version"

    # Show help if requested
    if ($Help) {
        Show-Usage
    }

    # Find installation root
    Find-InstallationRoot

    # Check what's installed
    Test-Installation

    # Confirm uninstallation
    Confirm-Uninstall

    # Remove components
    Remove-Hooks
    Clear-Settings
    Remove-Policies
    Clear-Logs
    Clear-Backups
    Clear-EmptyDirectories

    # Show summary
    Show-Summary

    Write-LogInfo "Uninstallation completed successfully!"
}

# Run main function
Main