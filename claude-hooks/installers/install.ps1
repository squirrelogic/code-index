# Claude Code Hooks Installer for Windows
# Installs hooks and configures .claude/settings.json

[CmdletBinding()]
param(
    [Parameter(HelpMessage="Force installation, overwrite existing files")]
    [switch]$Force,

    [Parameter(HelpMessage="Skip backing up existing configuration")]
    [switch]$SkipBackup,

    [Parameter(HelpMessage="Enable verbose output")]
    [switch]$Verbose,

    [Parameter(HelpMessage="Show help message")]
    [switch]$Help
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Get the directory of this script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HooksRoot = Split-Path -Parent $ScriptDir

# Import common functions
Import-Module "$HooksRoot\lib\windows\Common.ps1" -Force

# Configuration
$Version = "1.0.0"
$ClaudeDir = ".claude"
$HooksSubdir = "hooks"
$CodeIndexDir = ".codeindex"
$LogsSubdir = "logs"

# Enable verbose logging if requested
if ($Verbose) {
    $script:LogLevel = $script:LogLevels.DEBUG
}

<#
.SYNOPSIS
    Display usage information
#>
function Show-Usage {
    Write-Host @"
Claude Code Hooks Installer v$Version

Usage: .\install.ps1 [OPTIONS]

Options:
    -Force          Force installation, overwrite existing files
    -SkipBackup     Skip backing up existing configuration
    -Verbose        Enable verbose output
    -Help           Show this help message

Example:
    .\install.ps1                  # Standard installation
    .\install.ps1 -Force            # Force overwrite existing hooks
    .\install.ps1 -Verbose          # Show detailed installation progress

"@
    exit 0
}

<#
.SYNOPSIS
    Verify operating system
#>
function Test-OperatingSystem {
    $os = [System.Environment]::OSVersion.Platform

    if ($os -ne [System.PlatformID]::Win32NT) {
        Write-LogError "This installer is for Windows only. Detected: $os"
        Write-LogInfo "For Unix/Linux/macOS, please use install.sh"
        exit 1
    }

    Write-LogInfo "Detected operating system: Windows"

    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-LogError "PowerShell 5.0 or higher is required. Current version: $($PSVersionTable.PSVersion)"
        exit 1
    }

    Write-LogDebug "PowerShell version: $($PSVersionTable.PSVersion)"
    return $true
}

<#
.SYNOPSIS
    Find and validate project root
#>
function Find-InstallationRoot {
    $root = Find-ProjectRoot

    if (-not $root) {
        Write-LogError "Could not determine project root directory"
        exit 1
    }

    Set-Location $root
    Write-LogInfo "Installing hooks in: $root"

    return $root
}

<#
.SYNOPSIS
    Create required directories
#>
function New-DirectoryStructure {
    Write-LogInfo "Creating directory structure..."

    # Create .claude directory structure
    $claudePath = Join-Path $PWD $ClaudeDir
    $hooksPath = Join-Path $claudePath $HooksSubdir

    if (-not (Test-Path $hooksPath)) {
        New-Item -ItemType Directory -Path $hooksPath -Force | Out-Null
        Write-LogDebug "Created: $hooksPath"
    }

    # Create .codeindex directory structure
    $codeindexPath = Join-Path $PWD $CodeIndexDir
    $logsPath = Join-Path $codeindexPath $LogsSubdir

    if (-not (Test-Path $logsPath)) {
        New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
        Write-LogDebug "Created: $logsPath"
    }

    Write-LogInfo "Directory structure created successfully"
    return $true
}

<#
.SYNOPSIS
    Backup existing configuration
#>
function Backup-ExistingConfig {
    if ($SkipBackup) {
        Write-LogDebug "Skipping backup (-SkipBackup flag)"
        return $true
    }

    $claudePath = Join-Path $PWD $ClaudeDir
    $backupDir = Join-Path $claudePath "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $needsBackup = $false

    # Check if backup is needed
    $settingsPath = Join-Path $claudePath "settings.json"
    $policiesPath = Join-Path $claudePath "policies.json"
    $hooksPath = Join-Path $claudePath $HooksSubdir

    if ((Test-Path $settingsPath) -or (Test-Path $policiesPath) -or (Test-Path $hooksPath)) {
        $needsBackup = $true
    }

    if ($needsBackup) {
        Write-LogInfo "Backing up existing configuration to $backupDir"
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

        # Backup settings.json if it exists
        if (Test-Path $settingsPath) {
            Copy-Item $settingsPath "$backupDir\settings.json"
            Write-LogDebug "Backed up settings.json"
        }

        # Backup policies.json if it exists
        if (Test-Path $policiesPath) {
            Copy-Item $policiesPath "$backupDir\policies.json"
            Write-LogDebug "Backed up policies.json"
        }

        # Backup existing hooks
        if (Test-Path $hooksPath) {
            $hookFiles = Get-ChildItem -Path $hooksPath -File
            if ($hookFiles.Count -gt 0) {
                Copy-Item -Path $hooksPath -Destination "$backupDir\hooks" -Recurse
                Write-LogDebug "Backed up existing hooks"
            }
        }
    }

    return $true
}

<#
.SYNOPSIS
    Copy hook files
#>
function Copy-HookFiles {
    Write-LogInfo "Installing hook scripts..."

    $sourceDir = Join-Path $HooksRoot "hooks\windows"
    $targetDir = Join-Path $PWD "$ClaudeDir\$HooksSubdir"

    # List of hook files to install
    $hooks = @(
        "pre-tool-use.ps1"
        "post-tool-use.ps1"
        "session-start.ps1"
    )

    foreach ($hook in $hooks) {
        $sourceFile = Join-Path $sourceDir $hook
        $targetFile = Join-Path $targetDir $hook

        # Check if source file exists (it might not be implemented yet)
        if (-not (Test-Path $sourceFile)) {
            Write-LogWarn "Hook not found, skipping: $hook"
            continue
        }

        # Check if target exists and handle accordingly
        if ((Test-Path $targetFile) -and -not $Force) {
            Write-LogWarn "Hook already exists, skipping: $hook (use -Force to overwrite)"
            continue
        }

        # Copy the hook file
        try {
            Copy-Item $sourceFile $targetFile -Force
            Write-LogDebug "Installed: $hook"
        } catch {
            Write-LogError "Failed to copy $hook : $_"
            exit 1
        }
    }

    # Copy common library
    $commonSource = Join-Path $HooksRoot "lib\windows\Common.ps1"
    $commonTarget = Join-Path $targetDir "Common.ps1"

    try {
        Copy-Item $commonSource $commonTarget -Force
        Write-LogDebug "Copied Common.ps1 library"
    } catch {
        Write-LogWarn "Failed to copy Common.ps1 library: $_"
    }

    Write-LogInfo "Hook scripts installed successfully"
    return $true
}

<#
.SYNOPSIS
    Copy policy template
#>
function Copy-Policies {
    Write-LogInfo "Installing policy configuration..."

    $sourceFile = Join-Path $HooksRoot "templates\policies.json"
    $targetFile = Join-Path $PWD "$ClaudeDir\policies.json"

    # Only install if it doesn't exist or force flag is set
    if ((Test-Path $targetFile) -and -not $Force) {
        Write-LogInfo "Policies file already exists, keeping existing configuration"
        return $true
    }

    try {
        Copy-Item $sourceFile $targetFile -Force
        Write-LogInfo "Policy configuration installed"
    } catch {
        Write-LogError "Failed to copy policies.json: $_"
        exit 1
    }

    return $true
}

<#
.SYNOPSIS
    Update settings.json with hook registration
#>
function Update-Settings {
    Write-LogInfo "Updating hook registration in settings.json..."

    $settingsFile = Join-Path $PWD "$ClaudeDir\settings.json"
    $templateFile = Join-Path $HooksRoot "templates\settings.json"
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"

    # If settings.json doesn't exist, copy from template
    if (-not (Test-Path $settingsFile)) {
        Write-LogDebug "Creating new settings.json from template"
        try {
            # Read template
            $content = Get-Content $templateFile -Raw

            # Update metadata timestamps
            $content = $content -replace '"installed_at": ""', "`"installed_at`": `"$timestamp`""
            $content = $content -replace '"last_updated": ""', "`"last_updated`": `"$timestamp`""

            # Write to file
            Set-Content -Path $settingsFile -Value $content
        } catch {
            Write-LogError "Failed to create settings.json: $_"
            exit 1
        }
    } else {
        # Merge with existing settings
        Write-LogInfo "Merging with existing settings.json"

        try {
            # Read existing settings
            $existing = Get-Content $settingsFile -Raw | ConvertFrom-Json

            # Read template
            $template = Get-Content $templateFile -Raw | ConvertFrom-Json

            # Merge hooks section
            if (-not $existing.hooks) {
                $existing | Add-Member -NotePropertyName "hooks" -NotePropertyValue $template.hooks
            } else {
                # Merge each hook type
                foreach ($hookType in $template.hooks.PSObject.Properties) {
                    if (-not $existing.hooks.PSObject.Properties[$hookType.Name]) {
                        $existing.hooks | Add-Member -NotePropertyName $hookType.Name -NotePropertyValue $hookType.Value
                    }
                }
            }

            # Update metadata
            if (-not $existing.metadata) {
                $existing | Add-Member -NotePropertyName "metadata" -NotePropertyValue @{
                    installed_by = "code-index-hooks-installer"
                    installed_at = $timestamp
                    last_updated = $timestamp
                }
            } else {
                $existing.metadata.last_updated = $timestamp
                if (-not $existing.metadata.installed_at) {
                    $existing.metadata.installed_at = $timestamp
                }
            }

            # Write back to file
            $existing | ConvertTo-Json -Depth 10 | Set-Content $settingsFile
        } catch {
            Write-LogError "Failed to merge settings: $_"
            Write-LogWarn "Manual configuration may be required"
            Write-LogInfo "Please review $settingsFile and ensure hooks are registered"
        }
    }

    # Fix paths to use forward slashes for cross-platform compatibility
    try {
        $content = Get-Content $settingsFile -Raw
        $content = $content -replace '\\', '/'
        Set-Content -Path $settingsFile -Value $content
    } catch {
        Write-LogWarn "Failed to normalize path separators: $_"
    }

    Write-LogInfo "Hook registration updated successfully"
    return $true
}

<#
.SYNOPSIS
    Verify installation
#>
function Test-Installation {
    Write-LogInfo "Verifying installation..."

    $errors = 0

    # Check directories
    $claudePath = Join-Path $PWD $ClaudeDir
    if (-not (Test-Path $claudePath)) {
        Write-LogError "Missing directory: $claudePath"
        $errors++
    }

    $hooksPath = Join-Path $claudePath $HooksSubdir
    if (-not (Test-Path $hooksPath)) {
        Write-LogError "Missing directory: $hooksPath"
        $errors++
    }

    $logsPath = Join-Path $PWD "$CodeIndexDir\$LogsSubdir"
    if (-not (Test-Path $logsPath)) {
        Write-LogError "Missing directory: $logsPath"
        $errors++
    }

    # Check settings file
    $settingsFile = Join-Path $claudePath "settings.json"
    if (-not (Test-Path $settingsFile)) {
        Write-LogError "Missing file: $settingsFile"
        $errors++
    }

    # Check policies file
    $policiesFile = Join-Path $claudePath "policies.json"
    if (-not (Test-Path $policiesFile)) {
        Write-LogError "Missing file: $policiesFile"
        $errors++
    }

    # Check for at least one hook
    $hookFiles = Get-ChildItem -Path $hooksPath -Filter "*.ps1" -ErrorAction SilentlyContinue
    if ($hookFiles.Count -eq 0) {
        Write-LogWarn "No hook scripts found in $hooksPath"
    }

    if ($errors -gt 0) {
        Write-LogError "Installation verification failed with $errors errors"
        return $false
    }

    Write-LogInfo "Installation verified successfully"
    return $true
}

<#
.SYNOPSIS
    Display installation summary
#>
function Show-Summary {
    Write-Host @"

========================================
Claude Code Hooks Installation Complete!
========================================

Installed components:
  ✓ Hook scripts in .claude\hooks\
  ✓ Policy configuration in .claude\policies.json
  ✓ Hook registration in .claude\settings.json
  ✓ Logging directory in .codeindex\logs\

Available hooks:
  • PreToolUse  - Policy enforcement before tool execution
  • PostToolUse - Index refresh after file modifications
  • SessionStart - Cache warming at session start

Next steps:
  1. Review and customize .claude\policies.json for your project
  2. Ensure code-index CLI is installed and available in PATH
  3. Restart Claude Code to activate hooks

For more information, see claude-hooks\README.md

"@
}

#######################################
# Main installation flow
#######################################
function Main {
    Write-LogInfo "Starting Claude Code Hooks installation v$Version"

    # Show help if requested
    if ($Help) {
        Show-Usage
    }

    # Verify operating system
    Test-OperatingSystem

    # Find installation root
    Find-InstallationRoot

    # Create directory structure
    New-DirectoryStructure

    # Backup existing configuration
    Backup-ExistingConfig

    # Copy hook files
    Copy-HookFiles

    # Copy policy template
    Copy-Policies

    # Update settings.json
    Update-Settings

    # Verify installation
    if (-not (Test-Installation)) {
        Write-LogError "Installation failed verification"
        exit 1
    }

    # Show summary
    Show-Summary

    Write-LogInfo "Installation completed successfully!"
}

# Run main function
Main