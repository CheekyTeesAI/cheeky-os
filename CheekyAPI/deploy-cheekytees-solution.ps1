<#
PowerShell deployment script for CheekyTeesAutomation solution using Power Platform CLI (pac).

This script will:
  - Verify pac is installed
  - Pack the SolutionPackager folder into a .zip
  - Authenticate to Power Platform (interactive or service principal)
  - Import the solution into the target environment
  - Publish customizations

Usage:
  - Interactive auth: run this script and follow the browser sign-in.
  - Service principal: set the environment variables below (CLIENT_ID, CLIENT_SECRET, TENANT_ID) and set $UseServicePrincipal = $true

Note: After import you must map connection references in the target environment (Dataverse, Office365, OneDrive, HTTP) via the Power Platform admin center or the pac CLI (if supported by your pac version).
#>

param(
    [string]$SolutionFolder = "CheekyTeesAutomationSolution",
    [string]$ZipPath = "CheekyTeesAutomation.zip"
)

function Throw-IfLastExitCodeNonZero($message) {
    if ($LASTEXITCODE -ne 0) {
        Write-Error $message
        Exit 1
    }
}

# Ensure pac CLI is available
if (-not (Get-Command pac -ErrorAction SilentlyContinue)) {
    Write-Error "Power Platform CLI (pac) not found on PATH. Install from https://aka.ms/PowerPlatformCLI and try again."
    Exit 1
}

# Resolve paths relative to the script location
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$solutionFolderFull = Join-Path -Path $scriptRoot -ChildPath $SolutionFolder
$zipFullPath = Join-Path -Path $scriptRoot -ChildPath $ZipPath

Write-Host "Script root: $scriptRoot"
Write-Host "Solution folder (target): $solutionFolderFull"
Write-Host "Zip file: $zipFullPath"

# 1. Make sure the old folder is gone
if (Test-Path -Path $solutionFolderFull) {
    Write-Host "Removing existing folder: $solutionFolderFull"
    try {
        Remove-Item -Path $solutionFolderFull -Recurse -Force -ErrorAction Stop
        Write-Host "Remove-Item succeeded"
    }
    catch {
        Write-Error "Failed to remove folder '$solutionFolderFull': $_"
        Exit 1
    }
} else {
    Write-Host "Folder does not exist, nothing to remove."
}

# 2. Confirm the folder is truly gone
if (Test-Path -Path $solutionFolderFull) {
    Write-Error "Folder still exists after removal attempt: $solutionFolderFull"
    Exit 1
} else {
    Write-Host "Confirmed: folder not present."
}

# 3. Run PAC unpack (PAC will create the folder automatically)
if (-not (Test-Path -Path $zipFullPath)) {
    Write-Error "Zip file not found: $zipFullPath"
    Exit 1
}

Write-Host "Running: pac solution unpack --zipfile '$zipFullPath' --folder '$solutionFolderFull' --packagetype Unmanaged --verbose"
pac solution unpack --zipfile "$zipFullPath" --folder "$solutionFolderFull" --packagetype Unmanaged --verbose
Throw-IfLastExitCodeNonZero "pac solution unpack failed."

Write-Host "Unpack completed. Folder created at: $solutionFolderFull"
