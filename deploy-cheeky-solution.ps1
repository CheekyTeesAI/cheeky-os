<#
Enhanced production-grade deployment script for CheekyTeesAutomation.
Self-healing behaviors added: auto-export if zip missing, auto-auth, retry loops, connection reference injection hooks, log rotation, environment detection.
#>
param(
    [string]$ConfigPath = "",
    [switch]$UseServicePrincipal,
    [switch]$SkipPack,
    [switch]$NoPrompt
)

# Resolve script location reliably
$ScriptFullPath = $MyInvocation.MyCommand.Path
$ScriptRoot = Split-Path -Parent $ScriptFullPath
Set-Location -LiteralPath $ScriptRoot

# Load or create logs folder
$timestamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$LogDir = Join-Path $ScriptRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$LogFileBase = "deploy-${timestamp}.log"
$LogFile = Join-Path $LogDir $LogFileBase

function New-LogFileIfLocked {
    param([string]$Path)
    try {
        # Attempt to open for append
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $fs.Close()
    } catch {
        # File locked, create new file with index
        for ($i = 1; $i -le 100; $i++) {
            $candidate = Join-Path $LogDir ("deploy-${timestamp}-${i}.log")
            try {
                $fs2 = [System.IO.File]::Open($candidate, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
                $fs2.Close()
                return $candidate
            } catch { continue }
        }
        throw "Unable to create log file"
    }
    return $Path
}

$LogFile = New-LogFileIfLocked -Path $LogFile

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $time = Get-Date -Format o
    $line = "[$time] [$Level] $Message"
    try { Add-Content -Path $LogFile -Value $line } catch { Write-Host "WARNING: Could not write to log file: $($_.Exception.Message)" -ForegroundColor Yellow }
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line -ForegroundColor Green }
    }
}

function Exit-WithError {
    param([string]$Message, [int]$Code = 1)
    Write-Log "${Message}" 'ERROR'
    Send-PanicNotification -Message $Message -Level 'ERROR'
    Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
    Exit $Code
}

function Invoke-WithRetry {
    param(
        [scriptblock]$ScriptBlock,
        [int]$MaxAttempts = 3,
        [int]$DelaySeconds = 30
    )
    $attempt = 0
    while ($attempt -lt $MaxAttempts) {
        $attempt++
        try {
            Write-Log "Attempt ${attempt}/${MaxAttempts}"
            & $ScriptBlock
            return $true
        } catch {
            Write-Log "Attempt ${attempt} failed: $($_.Exception.Message)" 'WARN'
            if ($attempt -ge $MaxAttempts) {
                Write-Log "All ${MaxAttempts} attempts failed." 'ERROR'
                return $false
            }
            Start-Sleep -Seconds $DelaySeconds
        }
    }
}

function Send-PanicNotification {
    param([string]$Message, [string]$Level = 'ERROR')
    if ($Global:Config -and $Global:Config.TeamsWebhookUrl) {
        try {
            $payload = @{ title = "CheekyTees Deployment ${Level}"; text = $Message }
            Invoke-RestMethod -Uri $Global:Config.TeamsWebhookUrl -Method Post -Body (ConvertTo-Json $payload) -ContentType 'application/json' -ErrorAction Stop
            Write-Log "Sent Teams notification." 'INFO'
        } catch {
            Write-Log "Failed to send Teams notification: $($_.Exception.Message)" 'WARN'
        }
    }
}

function Audit-Log { param([string]$Action, [string]$Details) $entry = @{ Time = (Get-Date).ToString('o'); Action = $Action; Details = $Details }; $auditFile = Join-Path $ScriptRoot 'deployment-audit.log'; Add-Content -Path $auditFile -Value (ConvertTo-Json $entry) }

# Default configuration (safe paths)
$DefaultConfig = @{
    SolutionZip = (Join-Path $ScriptRoot 'CheekyTeesAutomation.zip');
    SolutionName = 'CheekyTeesAutomation';
    Environment = 'Default';
    UnpackFolder = (Join-Path $ScriptRoot '_solution_unpacked');
    TeamsWebhookUrl = '';
    AutoExportIfMissing = $true;
    ConnectionReferencePrefix = 'shared_commondataserviceforapps';
}

# Load config if provided or from repository default
if (-not $ConfigPath) {
    $ConfigPath = Join-Path $ScriptRoot 'deployment-config.json'
}

if ($ConfigPath -and (Test-Path $ConfigPath)) {
    try {
        $cfgText = Get-Content -Path $ConfigPath -Raw
        $cfg = ConvertFrom-Json $cfgText
        $Global:Config = $cfg
        Write-Log "Loaded config from ${ConfigPath}"
    } catch {
        Write-Log "Failed to parse config ${ConfigPath}: $($_.Exception.Message)" 'WARN'
        $Global:Config = $DefaultConfig
    }
} else {
    if ($ConfigPath) { Write-Log "Config path provided but not found: ${ConfigPath}" 'WARN' }
    Write-Log "Using default configuration." 'INFO'
    $Global:Config = $DefaultConfig
}

# Ensure ENV_URL is available
if (-not $env:ENV_URL -or [string]::IsNullOrWhiteSpace($env:ENV_URL)) {
    if ($Global:Config.EnvUrl) { $env:ENV_URL = $Global:Config.EnvUrl }
    if (-not $env:ENV_URL) {
        if (-not $NoPrompt) {
            $input = Read-Host 'Enter your environment URL (e.g. https://orgxxxx.crm.dynamics.com)'
            if ($input) { $env:ENV_URL = $input; try { setx ENV_URL $input | Out-Null; Write-Log "Persisted ENV_URL" } catch { Write-Log "Could not persist ENV_URL: $($_.Exception.Message)" 'WARN' } }
        }
    }
}

$SolutionName = $Global:Config.SolutionName
$EnvironmentName = $Global:Config.Environment
$UnpackFolder = $Global:Config.UnpackFolder

# Read target zip path from config and validate
$targetZip = $Global:Config.SolutionZip
if (-not $targetZip -or [string]::IsNullOrWhiteSpace($targetZip)) {
    Write-Log "SolutionZip path missing in deployment-config.json" 'ERROR'
    Exit-WithError "[ERROR] SolutionZip path missing in deployment-config.json"
}
# Resolve to full path if possible
try {
    $resolved = Resolve-Path -LiteralPath $targetZip -ErrorAction SilentlyContinue
    if ($resolved) { $targetZip = $resolved.Path }
} catch { }
Write-Log "Using solution zip: ${targetZip}"

function Check-Prereqs {
    Write-Log "Checking prerequisites..."
    if (-not (Get-Command pac -ErrorAction SilentlyContinue)) { Exit-WithError "pac CLI not found. Install Power Platform CLI." }
    $pacCmd = Get-Command pac -ErrorAction SilentlyContinue
    Write-Log "Found pac: ${pacCmd}"
}

function Ensure-Auth {
    try { pac auth whoami | Out-Null; Write-Log "pac auth OK"; return $true } catch {
        Write-Log "pac auth failed: $($_.Exception.Message)" 'WARN'
        # Try service principal auth using env vars
        if ($env:CLIENT_ID -and $env:CLIENT_SECRET -and $env:TENANT_ID -and $env:ENV_URL) {
            $create = { pac auth create --name "svc-sp-cheeky" --clientId $env:CLIENT_ID --clientSecret $env:CLIENT_SECRET --tenant $env:TENANT_ID --url $env:ENV_URL }
            $ok = Invoke-WithRetry -ScriptBlock $create -MaxAttempts 3 -DelaySeconds 10
            if ($ok) { pac auth select --name "svc-sp-cheeky"; Throw-IfLastExitCodeNonZero "pac auth select failed"; Write-Log "Authenticated via service principal"; return $true }
        }
        Write-Log "Interactive pac login required" 'WARN'
        try { pac auth login --interactive; return $true } catch { Write-Log "Interactive pac auth failed: $($_.Exception.Message)" 'ERROR'; return $false }
    }
}

function Throw-IfLastExitCodeNonZero($message) { if ($LASTEXITCODE -ne 0) { Exit-WithError $message } }

function AutoExportIfMissing {
    param([string]$SolutionName, [string]$TargetZip)
    Write-Log "Checking solution package"
    if ($Global:Config.AutoExportIfMissing -and (-not (Test-Path -Path $TargetZip))) {
        Write-Log "Exporting solution because zip is missing"
        if (-not $env:ENV_URL) { Write-Log "ENV_URL not set; cannot export" 'ERROR'; return $false }
        $export = {
            Write-Log "Running pac solution export --name ${SolutionName} --path ${TargetZip} --environment ${env:ENV_URL}"
            & pac solution export --name $SolutionName --path $TargetZip --environment $env:ENV_URL
        }
        $ok = Invoke-WithRetry -ScriptBlock $export -MaxAttempts 3 -DelaySeconds 10
        if (-not $ok) { Write-Log "Auto-export failed" 'WARN'; return $false }
        Write-Log "Exported solution to ${TargetZip}"
        return $true
    }
    return $true
}

function Recreate-ConnectionReferences {
    param([string]$UnpackPath)
    # Best-effort: scan for flow definitions and ensure connectionReferences block exists
    $flows = Get-ChildItem -Path $UnpackPath -Filter '*.flow.json' -Recurse -ErrorAction SilentlyContinue
    foreach ($f in $flows) {
        try {
            $json = Get-Content -Path $f.FullName -Raw | ConvertFrom-Json
            if (-not $json.connectionReferences) {
                Write-Log "Adding placeholder connectionReferences to ${($f.FullName)}"
                $json | Add-Member -MemberType NoteProperty -Name connectionReferences -Value @{}
                ($json | ConvertTo-Json -Depth 10) | Set-Content -Path $f.FullName
            }
        } catch { Write-Log "Flow parse failed ${($f.FullName)}: $($_.Exception.Message)" 'WARN' }
    }
}

# High-level flow
function Run-Deploy {
    Check-Prereqs
    if (-not (Ensure-Auth)) { Exit-WithError "Unable to authenticate pac" }

    $okExport = AutoExportIfMissing -SolutionName $SolutionName -TargetZip $targetZip
    if (-not $okExport) { Exit-WithError "Solution export failed and no zip available" }

    Unpack-Solution -ZipPath $targetZip -OutFolder $UnpackFolder
    Recreate-ConnectionReferences -UnpackPath $UnpackFolder

    if (-not $SkipPack) { Pack-Solution -SourceFolder $UnpackFolder -ZipPath $targetZip }

    Write-Log "Importing solution"
    Import-Solution -ZipPath $targetZip
    Publish-Solution
}

# Import/Export/Pack functions reuse previous implementations
function Unpack-Solution { param([string]$ZipPath, [string]$OutFolder) if (Test-Path $OutFolder) { Remove-Item -LiteralPath $OutFolder -Recurse -Force -ErrorAction SilentlyContinue } New-Item -Path $OutFolder -ItemType Directory -Force | Out-Null; $unpack = { pac solution unpack --zipfile "${ZipPath}" --folder "${OutFolder}" --packagetype Unmanaged --verbose }; $ok = Invoke-WithRetry -ScriptBlock $unpack -MaxAttempts 3 -DelaySeconds 10; if (-not $ok) { Exit-WithError "pac solution unpack failed after retries." } }
function Pack-Solution { param([string]$SourceFolder, [string]$ZipPath) $pack = { pac solution pack --folder "${SourceFolder}" --zipfile "${ZipPath}" }; $ok = Invoke-WithRetry -ScriptBlock $pack -MaxAttempts 3 -DelaySeconds 10; if (-not $ok) { Exit-WithError "pac solution pack failed after retries." } }
function Import-Solution { param([string]$ZipPath) if (-not $env:ENV_URL) { Exit-WithError "ENV_URL not set; cannot import solution" } $envUrl = $env:ENV_URL; $import = { pac solution import --path "${ZipPath}" --environment $envUrl }; $ok = Invoke-WithRetry -ScriptBlock $import -MaxAttempts 3 -DelaySeconds 10; if (-not $ok) { Exit-WithError "pac solution import failed after retries." } }
function Publish-Solution { try { if (-not $env:ENV_URL) { Write-Log "ENV_URL not set; skipping publish" 'WARN'; return } Write-Log "Publishing customizations to ${env:ENV_URL}"; pac solution publish --environment $env:ENV_URL; if ($LASTEXITCODE -ne 0) { Write-Log "pac solution publish returned non-zero exit." 'WARN' } } catch { Write-Log "Publish failed: $($_.Exception.Message)" 'WARN' } }

# Simple CLI for deployment commands
if ($MyInvocation.BoundParameters.Count -eq 0 -and $args.Count -gt 0) {
    $cmd = $args[0].ToLower()
    switch ($cmd) {
        'deploy' { Run-Deploy }
        'redeploy' { Run-Deploy }
        'repair' { Run-Deploy }
        default { Write-Host "Unknown command: ${cmd}" }
    }
} else {
    # If script called directly without commands, run deploy
    Run-Deploy
}
