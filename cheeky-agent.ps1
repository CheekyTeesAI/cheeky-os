<#
cheeky-agent.ps1 - Self-healing deployment CLI for CheekyTeesAutomation.
Commands: deploy | fix | doctor | rebuild | logs
#>
param()

$AgentRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $AgentRoot

# -- Logging ---------------------------------------------------------------
$LogDir = Join-Path $AgentRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$LogFile = Join-Path $LogDir 'cheeky.log'

function Write-CLog {
    param([string]$Message, [string]$Level = 'INFO')
    $ts = Get-Date -Format o
    $line = "[${ts}] [${Level}] ${Message}"
    try { Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Level) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

# -- Config helpers ---------------------------------------------------------
$ConfigPath = Join-Path $AgentRoot 'deployment-config.json'

function Get-DeployConfig {
    if (-not (Test-Path $ConfigPath)) { return $null }
    try { return (Get-Content -Path $ConfigPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Repair-Config {
    Write-CLog "Validating deployment-config.json"
    $cfg = Get-DeployConfig
    $dirty = $false

    if (-not $cfg) {
        Write-CLog 'deployment-config.json missing or unparseable - recreating' 'WARN'
        $cfg = [PSCustomObject]@{
            SolutionZip        = (Join-Path $AgentRoot 'CheekyTeesAutomation.zip')
            SolutionName       = 'CheekyTeesAutomation'
            Environment        = 'Default'
            UnpackFolder       = (Join-Path $AgentRoot '_solution_unpacked')
            TeamsWebhookUrl    = ''
            AutoExportIfMissing = $true
        }
        $dirty = $true
    }

    # Fix SolutionZip path if it points nowhere useful
    if (-not $cfg.SolutionZip -or [string]::IsNullOrWhiteSpace($cfg.SolutionZip)) {
        $cfg.SolutionZip = Join-Path $AgentRoot 'CheekyTeesAutomation.zip'
        $dirty = $true
        Write-CLog "Repaired SolutionZip path" 'WARN'
    }
    if (-not $cfg.SolutionName) { $cfg.SolutionName = 'CheekyTeesAutomation'; $dirty = $true }
    if (-not $cfg.UnpackFolder) { $cfg.UnpackFolder = Join-Path $AgentRoot '_solution_unpacked'; $dirty = $true }

    if ($dirty) {
        ($cfg | ConvertTo-Json -Depth 5) | Set-Content -Path $ConfigPath -Force
        Write-CLog "deployment-config.json saved"
    } else {
        Write-CLog "deployment-config.json OK"
    }
}

# -- Doctor checks ----------------------------------------------------------
function Test-PacInstalled {
    $found = Get-Command pac -ErrorAction SilentlyContinue
    if ($found) { Write-CLog ('[PASS] PAC CLI found: ' + $found.Source) 'SUCCESS'; return $true }
    Write-CLog '[FAIL] PAC CLI not found' 'ERROR'; return $false
}

function Test-PacAuth {
    try {
        $out = pac auth whoami 2>&1
        if ($LASTEXITCODE -eq 0) { Write-CLog '[PASS] PAC auth active' 'SUCCESS'; return $true }
    } catch { }
    Write-CLog '[FAIL] PAC auth not active' 'ERROR'; return $false
}

function Test-SolutionZip {
    $cfg = Get-DeployConfig
    if ($cfg -and $cfg.SolutionZip -and (Test-Path -Path $cfg.SolutionZip)) {
        Write-CLog ('[PASS] Solution zip exists: ' + $cfg.SolutionZip) 'SUCCESS'; return $true
    }
    Write-CLog '[FAIL] Solution zip missing' 'ERROR'; return $false
}

function Test-EnvUrl {
    if ($env:ENV_URL -and -not [string]::IsNullOrWhiteSpace($env:ENV_URL)) {
        Write-CLog ('[PASS] ENV_URL = ' + $env:ENV_URL) 'SUCCESS'; return $true
    }
    Write-CLog '[FAIL] ENV_URL not set' 'ERROR'; return $false
}

function Test-ConfigFields {
    $cfg = Get-DeployConfig
    if (-not $cfg) { Write-CLog '[FAIL] deployment-config.json missing' 'ERROR'; return $false }
    $ok = $true
    if (-not $cfg.SolutionZip)   { Write-CLog '[FAIL] SolutionZip missing in config' 'ERROR'; $ok = $false }
    if (-not $cfg.SolutionName)  { Write-CLog '[FAIL] SolutionName missing in config' 'ERROR'; $ok = $false }
    if (-not $cfg.UnpackFolder)  { Write-CLog '[FAIL] UnpackFolder missing in config' 'ERROR'; $ok = $false }
    if ($ok) { Write-CLog '[PASS] Config fields valid' 'SUCCESS' }
    return $ok
}

# -- Fix actions ------------------------------------------------------------
function Fix-PacCli {
    if (Test-PacInstalled) { return }
    Write-CLog "Attempting to install PAC CLI via dotnet tool"
    try {
        dotnet tool install --global Microsoft.PowerApps.CLI.Tool 2>&1 | Out-Null
        if (Test-PacInstalled) { Write-CLog "PAC CLI installed" 'SUCCESS' }
        else { Write-CLog "PAC CLI install may require a new terminal session" 'WARN' }
    } catch { Write-CLog "Could not auto-install PAC CLI: $($_.Exception.Message)" 'ERROR' }
}

function Fix-Auth {
    if (Test-PacAuth) { return }
    if (-not (Test-EnvUrl)) { Fix-EnvUrl }
    if (-not $env:ENV_URL) { Write-CLog "Cannot fix auth without ENV_URL" 'ERROR'; return }
    Write-CLog "Running pac auth create --url ${env:ENV_URL}"
    try {
        pac auth create --name "cheeky-auto" --url $env:ENV_URL --interactive
        if ($LASTEXITCODE -eq 0) { Write-CLog "Auth created" 'SUCCESS' }
        else { Write-CLog "pac auth create returned non-zero" 'WARN' }
    } catch { Write-CLog "Auth fix failed: $($_.Exception.Message)" 'ERROR' }
}

function Fix-EnvUrl {
    if (Test-EnvUrl) { return }
    $url = Read-Host 'Enter your Dataverse environment URL (e.g. https://org143bbb56.api.crm.dynamics.com)'
    if ($url -and -not [string]::IsNullOrWhiteSpace($url)) {
        $env:ENV_URL = $url
        try { setx ENV_URL $url | Out-Null; Write-CLog "ENV_URL persisted: ${url}" 'SUCCESS' } catch { Write-CLog "Could not persist ENV_URL" 'WARN' }
    }
}

function Fix-SolutionZip {
    if (Test-SolutionZip) { return }
    $cfg = Get-DeployConfig
    if (-not $cfg) { Repair-Config; $cfg = Get-DeployConfig }
    if (-not (Test-EnvUrl)) { Fix-EnvUrl }
    if (-not $env:ENV_URL) { Write-CLog "Cannot export without ENV_URL" 'ERROR'; return }
    $sn = $cfg.SolutionName
    $sp = $cfg.SolutionZip
    Write-CLog "Exporting solution ${sn} to ${sp}"
    pac solution export --name $sn --path $sp --environment $env:ENV_URL
    if ($LASTEXITCODE -eq 0) { Write-CLog "Export complete" 'SUCCESS' }
    else { Write-CLog "Export failed" 'ERROR' }
}

# -- Commands ---------------------------------------------------------------
function Invoke-Deploy {
    Write-CLog "=== DEPLOY START ==="
    $deployCmd = Join-Path $AgentRoot 'deploy-cheeky-solution.cmd'
    if (-not (Test-Path $deployCmd)) {
        Write-CLog "deploy-cheeky-solution.cmd not found" 'ERROR'; return
    }
    $output = & cmd.exe /c "`"${deployCmd}`"" 2>&1
    $output | ForEach-Object { Write-CLog $_ }
    if ($LASTEXITCODE -ne 0) {
        Write-CLog 'Deploy failed - retrying once after self-heal' 'WARN'
        Invoke-Fix
        $output2 = & cmd.exe /c "`"${deployCmd}`"" 2>&1
        $output2 | ForEach-Object { Write-CLog $_ }
        if ($LASTEXITCODE -ne 0) { Write-CLog "Deploy failed after retry" 'ERROR' }
        else { Write-CLog "=== DEPLOY SUCCESS (after retry) ===" 'SUCCESS' }
    } else {
        Write-CLog "=== DEPLOY SUCCESS ===" 'SUCCESS'
    }
}

function Invoke-Fix {
    Write-CLog "=== FIX START ==="
    Fix-PacCli
    Fix-EnvUrl
    Fix-Auth
    Repair-Config
    Fix-SolutionZip
    Write-CLog "=== FIX COMPLETE ===" 'SUCCESS'
}

function Invoke-Doctor {
    Write-CLog "=== DOCTOR START ==="
    $results = @()
    $results += @{ Check = 'PAC CLI';    Pass = (Test-PacInstalled) }
    $results += @{ Check = 'PAC Auth';   Pass = (Test-PacAuth) }
    $results += @{ Check = 'ENV_URL';    Pass = (Test-EnvUrl) }
    $results += @{ Check = 'Solution Zip'; Pass = (Test-SolutionZip) }
    $results += @{ Check = 'Config Fields'; Pass = (Test-ConfigFields) }

    Write-Host ""
    Write-Host '---- DOCTOR SUMMARY ----' -ForegroundColor White
    foreach ($r in $results) {
        $icon = if ($r.Pass) { 'OK' } else { '!!' }
        $color = if ($r.Pass) { 'Green' } else { 'Red' }
        Write-Host ('  [' + $icon + '] ' + $r.Check) -ForegroundColor $color
    }
    Write-Host '------------------------' -ForegroundColor White

    $failed = ($results | Where-Object { -not $_.Pass }).Count
    if ($failed -gt 0) { Write-CLog "${failed} check(s) failed. Run: cheeky fix" 'WARN' }
    else { Write-CLog "All checks passed" 'SUCCESS' }
    Write-CLog "=== DOCTOR COMPLETE ==="
}

function Invoke-Rebuild {
    Write-CLog "=== REBUILD START ==="
    $cfg = Get-DeployConfig
    if ($cfg -and $cfg.SolutionZip -and (Test-Path -Path $cfg.SolutionZip)) {
        Remove-Item -Path $cfg.SolutionZip -Force -ErrorAction SilentlyContinue
        Write-CLog "Deleted existing zip: $($cfg.SolutionZip)"
    }
    Fix-SolutionZip
    Invoke-Deploy
    Write-CLog "=== REBUILD COMPLETE ===" 'SUCCESS'
}

function Invoke-Logs {
    if (Test-Path $LogDir) {
        Write-CLog "Opening logs folder: ${LogDir}"
        Start-Process explorer.exe -ArgumentList $LogDir
    } else {
        Write-CLog "Logs folder does not exist" 'WARN'
    }
}

# -- Entry point ------------------------------------------------------------
$command = if ($args.Count -gt 0) { $args[0].ToLower() } else { '' }

switch ($command) {
    'deploy'  { Invoke-Deploy }
    'fix'     { Invoke-Fix }
    'doctor'  { Invoke-Doctor }
    'rebuild' { Invoke-Rebuild }
    'logs'    { Invoke-Logs }
    default {
        Write-Host ""
        Write-Host "  Cheeky Deployment CLI" -ForegroundColor Cyan
        Write-Host '  Usage:  cheeky <command>' -ForegroundColor White
        Write-Host ""
        Write-Host "  Commands:" -ForegroundColor White
        Write-Host "    deploy   Run full deployment pipeline"
        Write-Host "    fix      Auto-detect and repair common issues"
        Write-Host '    doctor   Health check - verify all prerequisites'
        Write-Host "    rebuild  Delete zip, re-export, redeploy"
        Write-Host "    logs     Open the logs folder"
        Write-Host ""
    }
}
