<#
copilot-agent.ps1 - Cheeky AI Execution Agent
Cheeky Tees LLC - Operational Intelligence System

PURPOSE:
  Protect cash. Enforce margin. Reduce admin load. Increase revenue efficiency.
  Self-healing deployment + business rule enforcement + pricing engine.

OPERATING MODE: EXECUTION
  No fluff. No explanations unless asked. Client-ready outputs first.
  Decisive responses only. Enforce rules without hesitation.

PowerShell 5.1 compatible. No Unicode.
#>
param(
    [string]$Action = 'heal',
    [string]$Input = ''
)

$ScriptFullPath = $MyInvocation.MyCommand.Path
$ScriptRoot = Split-Path -Parent $ScriptFullPath
$LogDir = Join-Path $ScriptRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$AgentLog = Join-Path $LogDir ('agent-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
$AuditFile = Join-Path $ScriptRoot 'business-audit.jsonl'

# Dot-source business rules if available
$brPath = Join-Path $ScriptRoot 'business-rules.ps1'
$dsPath = Join-Path $ScriptRoot 'dataverse-schema.ps1'
if (Test-Path $brPath) { . $brPath }
if (Test-Path $dsPath) { . $dsPath }

# ============================================================================
# LOGGING + AUDIT
# ============================================================================

function Write-Agent {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [CHEEKY-AI] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $AgentLog -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'BLOCK'   { Write-Host $line -ForegroundColor Magenta }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        'ENFORCE' { Write-Host $line -ForegroundColor DarkYellow }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Write-AgentAudit {
    param([string]$Command, [string]$Result, [string]$Notes = '')
    $entry = @{ timestamp = (Get-Date -Format o); agent = 'cheeky-ai'; command = $Command; result = $Result; notes = $Notes }
    try { Add-Content -Path $AuditFile -Value (ConvertTo-Json $entry -Compress -Depth 5) -ErrorAction SilentlyContinue } catch { }
}

# ============================================================================
# CONSTITUTION: CORE RULES (LOCKED)
# ============================================================================

$script:MARGIN_FLOOR       = 45
$script:MIN_ORDER_QTY      = 12
$script:SCREEN_PRINT_MIN   = 24
$script:DEPOSIT_PERCENT     = 50
$script:PPH_MINIMUM        = 50
$script:CAPACITY_GREEN     = 70
$script:CAPACITY_YELLOW    = 90
$script:CAPACITY_RED       = 100
$script:CAPACITY_BLACK     = 110

$script:DTF_SPECIAL_MIN    = 18
$script:DTF_SPECIAL_MAX    = 23
$script:DTF_SPECIAL_FB     = 23
$script:DTF_SPECIAL_BACK   = 18

# ============================================================================
# PRICING ENGINE
# ============================================================================

function Get-CheekyQuote {
    param(
        [int]$Quantity,
        [decimal]$CostPerUnit,
        [string]$PrintType = '',
        [string]$Material = '',
        [switch]$FrontAndBack,
        [switch]$BackOnly,
        [switch]$OverrideMargin
    )

    Write-Agent ('QUOTE REQUEST: Qty=' + $Quantity + ' Cost=$' + $CostPerUnit + ' Type=' + $PrintType)

    # Enforce minimum order
    if ($Quantity -lt $script:MIN_ORDER_QTY) {
        Write-Agent ('BLOCKED: Quantity ' + $Quantity + ' below minimum ' + $script:MIN_ORDER_QTY) 'BLOCK'
        Write-AgentAudit -Command 'quote' -Result 'blocked' -Notes ('Qty ' + $Quantity + ' < min ' + $script:MIN_ORDER_QTY)
        return @{ Status = 'BLOCKED'; Reason = 'Minimum order is ' + $script:MIN_ORDER_QTY + ' pieces per design' }
    }

    # Auto-route production type
    if (-not $PrintType) {
        if ($Quantity -ge $script:SCREEN_PRINT_MIN) {
            $PrintType = 'Screen Print'
        } else {
            $PrintType = 'DTG'
        }
        # Material override
        if ($Material -match '100.*poly') { $PrintType = 'DTF' }
        if ($Material -match 'triblend|tri.blend') { $PrintType = 'DTG' }
    }

    # DTF-O special pricing (18-23 pcs)
    $specialPricing = $false
    if ($PrintType -eq 'DTF' -and $Quantity -ge $script:DTF_SPECIAL_MIN -and $Quantity -le $script:DTF_SPECIAL_MAX) {
        $specialPricing = $true
        if ($BackOnly) {
            $pricePerUnit = $script:DTF_SPECIAL_BACK
        } else {
            $pricePerUnit = $script:DTF_SPECIAL_FB
        }
    } else {
        # Calculate price from cost + margin floor
        if ($CostPerUnit -le 0) { $CostPerUnit = 8.50 }
        $pricePerUnit = [math]::Ceiling($CostPerUnit / (1 - ($script:MARGIN_FLOOR / 100)))
    }

    $totalRevenue = $pricePerUnit * $Quantity
    $totalCost = $CostPerUnit * $Quantity
    $margin = 0
    if ($totalRevenue -gt 0) { $margin = [math]::Round((($totalRevenue - $totalCost) / $totalRevenue) * 100, 2) }

    # Margin gate
    if ($margin -lt $script:MARGIN_FLOOR -and -not $OverrideMargin) {
        Write-Agent ('BLOCKED: Margin ' + $margin + '% below ' + $script:MARGIN_FLOOR + '% floor. Requires margin override.') 'BLOCK'
        Write-AgentAudit -Command 'quote' -Result 'blocked' -Notes ('Margin ' + $margin + '% < ' + $script:MARGIN_FLOOR + '%')
        return @{
            Status = 'BLOCKED'
            Reason = 'Requires margin override'
            Margin = $margin
            Price = $pricePerUnit
            Total = $totalRevenue
        }
    }

    $deposit = [math]::Ceiling($totalRevenue * ($script:DEPOSIT_PERCENT / 100))

    $result = @{
        Status         = 'QUOTED'
        Price          = $pricePerUnit
        Method         = $PrintType
        Quantity       = $Quantity
        Total          = $totalRevenue
        Margin         = $margin
        MarginStatus   = if ($margin -ge $script:MARGIN_FLOOR) { 'PASS' } else { 'OVERRIDE' }
        DepositRequired = $deposit
        Timeline       = 'Turnaround begins after payment and approval.'
        SpecialPricing = $specialPricing
    }

    Write-Agent ('QUOTED: $' + $pricePerUnit + '/ea x ' + $Quantity + ' = $' + $totalRevenue + ' | ' + $PrintType + ' | Margin: ' + $margin + '%') 'SUCCESS'
    Write-AgentAudit -Command 'quote' -Result 'quoted' -Notes ('$' + $pricePerUnit + ' x ' + $Quantity + ' = $' + $totalRevenue + ' @ ' + $margin + '%')
    return $result
}

# ============================================================================
# INTAKE GATE: Can this job proceed?
# ============================================================================

function Test-IntakeGate {
    param(
        [string]$Scope = '',
        [int]$Quantity = 0,
        [string]$Garment = '',
        [string]$Design = '',
        [string]$DueDate = '',
        [decimal]$Revenue = 0,
        [decimal]$Cost = 0,
        [int]$CapacityPercent = 50
    )

    Write-Agent '=== INTAKE GATE CHECK ==='
    $blocks = @()

    if ([string]::IsNullOrWhiteSpace($Scope))   { $blocks += 'Scope not defined' }
    if ($Quantity -lt $script:MIN_ORDER_QTY)     { $blocks += ('Quantity ' + $Quantity + ' below minimum ' + $script:MIN_ORDER_QTY) }
    if ([string]::IsNullOrWhiteSpace($Garment))  { $blocks += 'Garment not confirmed' }
    if ([string]::IsNullOrWhiteSpace($Design))   { $blocks += 'Design not confirmed' }
    if ([string]::IsNullOrWhiteSpace($DueDate))  { $blocks += 'Due date not confirmed' }

    # Margin gate
    if ($Revenue -gt 0 -and $Cost -gt 0) {
        $margin = [math]::Round((($Revenue - $Cost) / $Revenue) * 100, 2)
        if ($margin -lt $script:MARGIN_FLOOR) {
            $blocks += ('Margin ' + $margin + '% below ' + $script:MARGIN_FLOOR + '% floor')
        }
    } elseif ($Revenue -gt 0 -or $Cost -gt 0) {
        $blocks += 'Both revenue and cost required for margin check'
    }

    # Capacity gate
    $capLevel = 'GREEN'
    if ($CapacityPercent -ge $script:CAPACITY_BLACK) { $capLevel = 'BLACK'; $blocks += 'Capacity BLACK (>110%). Intake FROZEN.' }
    elseif ($CapacityPercent -ge $script:CAPACITY_RED) { $capLevel = 'RED'; $blocks += 'Capacity RED (>100%). Throttled.' }
    elseif ($CapacityPercent -ge $script:CAPACITY_YELLOW) { $capLevel = 'YELLOW' }

    $passed = ($blocks.Count -eq 0)

    if ($passed) {
        Write-Agent 'INTAKE GATE: PASSED - All checks clear' 'SUCCESS'
    } else {
        Write-Agent ('INTAKE GATE: BLOCKED - ' + $blocks.Count + ' issue(s)') 'BLOCK'
        foreach ($b in $blocks) { Write-Agent ('  BLOCK: ' + $b) 'BLOCK' }
    }

    Write-AgentAudit -Command 'intake-gate' -Result $(if ($passed) { 'passed' } else { 'blocked' }) -Notes ($blocks -join '; ')

    return @{
        Passed = $passed
        Blocks = $blocks
        CapacityLevel = $capLevel
    }
}

# ============================================================================
# CLIENT FILTER: LRCS + PPH
# ============================================================================

function Test-ClientFilter {
    param(
        [int]$LrcsScore = 0,
        [decimal]$ProfitPerHour = 0
    )

    Write-Agent ('CLIENT FILTER: LRCS=' + $LrcsScore + ' PPH=$' + $ProfitPerHour)

    $action = 'PROCEED'
    $notes = @()

    # LRCS scoring
    if ($LrcsScore -ge 6) {
        $action = 'REJECT'
        $notes += ('LRCS ' + $LrcsScore + ' >= 6: REJECT client')
    } elseif ($LrcsScore -ge 3) {
        $action = 'HARDEN'
        $notes += ('LRCS ' + $LrcsScore + ' >= 3: Harden terms (100% prepay, no rush)')
    }

    # PPH check
    if ($ProfitPerHour -gt 0 -and $ProfitPerHour -lt $script:PPH_MINIMUM) {
        if ($action -ne 'REJECT') { $action = 'REPRICE' }
        $notes += ('PPH $' + $ProfitPerHour + ' < $' + $script:PPH_MINIMUM + ': Reprice or decline')
    } elseif ($ProfitPerHour -ge 90) {
        $notes += ('PPH $' + $ProfitPerHour + ': PRIORITY client')
    }

    $lvl = switch ($action) { 'REJECT' { 'BLOCK' } 'HARDEN' { 'WARN' } 'REPRICE' { 'WARN' } default { 'SUCCESS' } }
    Write-Agent ('CLIENT FILTER: ' + $action + ' | ' + ($notes -join ' | ')) $lvl
    Write-AgentAudit -Command 'client-filter' -Result $action -Notes ($notes -join '; ')

    return @{ Action = $action; Notes = $notes }
}

# ============================================================================
# PAYMENT RULES ENGINE
# ============================================================================

function Get-PaymentTerms {
    param(
        [switch]$FirstTimeCustomer,
        [switch]$RushJob,
        [switch]$CustomerSuppliedGarments,
        [string]$PrintType = 'DTG',
        [decimal]$TotalAmount = 0
    )

    $depositPercent = $script:DEPOSIT_PERCENT
    $reason = 'Standard terms: ' + $depositPercent + '% deposit'

    # 100% required scenarios
    $fullPayRequired = $false
    if ($FirstTimeCustomer) { $fullPayRequired = $true; $reason = 'First-time customer: 100% prepay required' }
    if ($RushJob) { $fullPayRequired = $true; $reason = 'Rush job: 100% prepay required' }
    if ($CustomerSuppliedGarments) { $fullPayRequired = $true; $reason = 'Customer-supplied garments: 100% prepay required' }
    if ($PrintType -eq 'DTG' -or $PrintType -eq 'DTF') {
        if (-not $fullPayRequired) {
            $reason = $PrintType + ' custom: standard ' + $depositPercent + '% deposit'
        }
    }

    if ($fullPayRequired) { $depositPercent = 100 }
    $depositAmount = if ($TotalAmount -gt 0) { [math]::Ceiling($TotalAmount * ($depositPercent / 100)) } else { 0 }

    Write-Agent ('PAYMENT TERMS: ' + $depositPercent + '% | ' + $reason) 'ENFORCE'
    return @{
        DepositPercent = $depositPercent
        DepositAmount = $depositAmount
        FullPayRequired = $fullPayRequired
        Reason = $reason
        Rule = 'No blanks ordered without payment. No production without payment.'
    }
}

# ============================================================================
# JOB STATUS OUTPUT
# ============================================================================

function Get-JobStatus {
    param(
        [string]$OrderName = '',
        [string]$PaymentStatus = 'Unpaid',
        [string]$ArtStatus = 'Not Submitted',
        [string]$ProductionMethod = '',
        [string]$CurrentStage = 'Intake'
    )

    $nextAction = switch ($CurrentStage) {
        'Intake'           { 'Confirm scope, garment, design, quantity, and due date' }
        'Quote Sent'       { 'Await customer approval and deposit' }
        'Deposit Paid'     { 'Submit artwork for approval' }
        'Production Ready' { 'Begin production' }
        'Printing'         { 'Complete production and QC' }
        'Completed'        { 'Deliver to customer (must be paid in full + QC passed)' }
        default            { 'Review order status' }
    }

    $output = @{
        JobStatus = $CurrentStage
        PaymentStatus = $PaymentStatus
        ArtStatus = $ArtStatus
        ProductionMethod = $ProductionMethod
        NextAction = $nextAction
    }

    Write-Agent ('JOB: ' + $OrderName + ' | Stage: ' + $CurrentStage + ' | Payment: ' + $PaymentStatus + ' | Art: ' + $ArtStatus) 'INFO'
    return $output
}

# ============================================================================
# SELF-HEALING: LOG ANALYSIS + AUTO-REPAIR
# ============================================================================

function Invoke-SelfHeal {
    Write-Agent '=== SELF-HEALING SCAN ==='

    $logFiles = Get-ChildItem -Path $LogDir -Filter '*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    $latest = $null
    foreach ($lf in $logFiles) {
        if ($lf.Name -notmatch '^agent-') { $latest = $lf; break }
    }
    if (-not $latest) { Write-Agent 'No operational logs found to analyze' 'WARN'; return }

    Write-Agent ('Analyzing: ' + $latest.FullName)
    $content = Get-Content -Path $latest.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { Write-Agent 'Log file empty' 'WARN'; return }

    $issues = @()

    # Deployment issues
    if ($content -match 'pac auth failed|Interactive pac auth failed|Unable to authenticate pac') { $issues += 'auth' }
    if ($content -match 'Solution zip not found|Solution zip does not exist') { $issues += 'missing-solution-zip' }
    if ($content -match 'connectionReferences') { $issues += 'connection-refs' }

    # Business module issues
    if ($content -match 'Square access token not configured|square-config.json not found') { $issues += 'missing-square-config' }
    if ($content -match 'ENV_URL not set') { $issues += 'missing-env-url' }
    if ($content -match 'email-config.json not found|Email not configured') { $issues += 'missing-email-config' }
    if ($content -match 'Invoice send failed|Invoice creation failed') { $issues += 'invoice-failure' }
    if ($content -match 'No payments found|Payment lookup failed') { $issues += 'payment-failure' }
    if ($content -match 'Already processed event|Duplicate event') { $issues += 'duplicate-webhook' }
    if ($content -match 'entity.*does not exist|cr4b4_cheekyorders.*404|crb_orders.*404') { $issues += 'missing-dataverse-table' }
    if ($content -match 'Failed to get Dataverse token') { $issues += 'dataverse-token' }

    # Cheeky OS specific issues
    if ($content -match 'margin.*below|MARGIN GATE FAILED') { $issues += 'margin-violation' }
    if ($content -match 'below minimum.*pieces|Quantity.*below') { $issues += 'minimum-violation' }
    if ($content -match 'provision.*failed|table creation.*failed') { $issues += 'provision-failure' }

    if ($issues.Count -eq 0) {
        Write-Agent 'No known issues detected.' 'SUCCESS'
        Write-AgentAudit -Command 'self-heal' -Result 'clean' -Notes 'No issues found'
        return
    }

    Write-Agent ('Detected ' + $issues.Count + ' issue(s): ' + ($issues -join ', ')) 'WARN'

    foreach ($issue in $issues) {
        switch ($issue) {
            'auth' {
                Write-Agent 'Attempting auth repair...' 'WARN'
                if ($env:CLIENT_ID -and $env:CLIENT_SECRET -and $env:TENANT_ID -and $env:ENV_URL) {
                    pac auth create --name 'svc-sp-cheeky' --clientId $env:CLIENT_ID --clientSecret $env:CLIENT_SECRET --tenant $env:TENANT_ID --url $env:ENV_URL
                    pac auth select --name 'svc-sp-cheeky'
                } elseif ($env:ENV_URL) {
                    pac auth create --name 'cheeky-auto' --url $env:ENV_URL --interactive
                } else {
                    Write-Agent 'Set ENV_URL and re-run. Or provide CLIENT_ID, CLIENT_SECRET, TENANT_ID.' 'ERROR'
                }
            }
            'missing-solution-zip' {
                Write-Agent 'Exporting solution...' 'WARN'
                $dcfg = Join-Path $ScriptRoot 'deployment-config.json'
                if (Test-Path $dcfg) {
                    $cfg = ConvertFrom-Json (Get-Content -Path $dcfg -Raw)
                    pac solution export --name $cfg.SolutionName --path $cfg.SolutionZip --environment $cfg.Environment
                }
            }
            'connection-refs' {
                Write-Agent 'Re-injecting connection references...' 'WARN'
                $ds = Join-Path $ScriptRoot 'deploy-cheeky-solution.ps1'
                if (Test-Path $ds) { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ds -SkipPack }
            }
            'missing-square-config' {
                Write-Agent 'Checking Square config...' 'WARN'
                $sqCfg = Join-Path $ScriptRoot 'square-config.json'
                if (-not (Test-Path $sqCfg)) {
                    $t = '{"squareAccessToken":"","locationId":"","environment":"production","webhookSignatureKey":""}'
                    Set-Content -Path $sqCfg -Value $t -Force
                    Write-Agent 'Created square-config.json template. Add credentials.' 'WARN'
                } else {
                    Write-Agent 'square-config.json exists. Fill in credentials.' 'WARN'
                }
            }
            'missing-env-url' {
                Write-Agent 'ENV_URL not set.' 'WARN'
                $dcfg = Join-Path $ScriptRoot 'deployment-config.json'
                if (Test-Path $dcfg) {
                    $cfg = ConvertFrom-Json (Get-Content -Path $dcfg -Raw)
                    if ($cfg.EnvUrl) { $env:ENV_URL = $cfg.EnvUrl; Write-Agent ('Loaded from config: ' + $cfg.EnvUrl) 'SUCCESS' }
                }
                if (-not $env:ENV_URL) { Write-Agent 'Set ENV_URL manually: $env:ENV_URL = "https://org143bbb56.crm.dynamics.com"' 'ERROR' }
            }
            'missing-email-config' {
                Write-Agent 'Checking email config...' 'WARN'
                $emCfg = Join-Path $ScriptRoot 'email-config.json'
                if (-not (Test-Path $emCfg)) {
                    $t = '{"imapServer":"","imapPort":993,"username":"","password":"","useSsl":true,"scanFolder":"INBOX","processedTag":"CheekyProcessed"}'
                    Set-Content -Path $emCfg -Value $t -Force
                    Write-Agent 'Created email-config.json template. Add IMAP credentials.' 'WARN'
                }
            }
            'invoice-failure'   { Write-Agent 'Invoice op failed. Verify Square credentials.' 'ERROR' }
            'payment-failure'   { Write-Agent 'Payment lookup failed. Verify Square credentials and date range.' 'ERROR' }
            'duplicate-webhook' { Write-Agent 'Duplicate webhook. Idempotent. No action needed.' 'INFO' }
            'missing-dataverse-table' {
                Write-Agent 'Dataverse table missing. Run: cheeky schema provision' 'ERROR'
            }
            'dataverse-token' {
                Write-Agent 'Dataverse token failure. Re-authenticating...' 'WARN'
                if ($env:ENV_URL) { pac auth create --name 'cheeky-auto' --url $env:ENV_URL --interactive }
                else { Write-Agent 'Set ENV_URL first.' 'ERROR' }
            }
            'margin-violation' {
                Write-Agent 'Margin violation detected in logs. Orders are flagged. Review in Cheeky OS dashboard.' 'ENFORCE'
            }
            'minimum-violation' {
                Write-Agent 'Minimum quantity violation detected. Blocked orders require qty >= 12 (screen print >= 24).' 'ENFORCE'
            }
            'provision-failure' {
                Write-Agent 'Table provisioning failed. Re-run: cheeky schema provision' 'ERROR'
            }
        }
    }

    Write-AgentAudit -Command 'self-heal' -Result ('resolved-' + $issues.Count) -Notes ($issues -join ', ')
    Write-Agent '=== SELF-HEALING COMPLETE ===' 'SUCCESS'
}

# ============================================================================
# SYSTEM STATUS
# ============================================================================

function Show-AgentStatus {
    Write-Host '' -ForegroundColor White
    Write-Host '  CHEEKY AI - EXECUTION AGENT' -ForegroundColor Cyan
    Write-Host '  ----------------------------' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '  CONSTITUTION:' -ForegroundColor White
    Write-Host ('    Margin Floor:      ' + $script:MARGIN_FLOOR + '%') -ForegroundColor Gray
    Write-Host ('    Min Order:         ' + $script:MIN_ORDER_QTY + ' pieces') -ForegroundColor Gray
    Write-Host ('    Screen Print Min:  ' + $script:SCREEN_PRINT_MIN + ' pieces') -ForegroundColor Gray
    Write-Host ('    Deposit Standard:  ' + $script:DEPOSIT_PERCENT + '%') -ForegroundColor Gray
    Write-Host ('    PPH Minimum:       $' + $script:PPH_MINIMUM + '/hr') -ForegroundColor Gray
    Write-Host ''
    Write-Host '  CAPACITY THRESHOLDS:' -ForegroundColor White
    Write-Host ('    Green:   <=' + $script:CAPACITY_GREEN + '%  (normal)') -ForegroundColor Green
    Write-Host ('    Yellow:  ' + $script:CAPACITY_GREEN + '-' + $script:CAPACITY_YELLOW + '%  (restrict rush)') -ForegroundColor Yellow
    Write-Host ('    Red:     ' + $script:CAPACITY_YELLOW + '-' + $script:CAPACITY_RED + '%  (throttle intake)') -ForegroundColor Red
    Write-Host ('    Black:   >' + $script:CAPACITY_BLACK + '%  (freeze intake)') -ForegroundColor DarkRed
    Write-Host ''
    Write-Host '  DTF-O SPECIAL (18-23 pcs):' -ForegroundColor White
    Write-Host ('    Front+Back: $' + $script:DTF_SPECIAL_FB) -ForegroundColor Gray
    Write-Host ('    Back Only:  $' + $script:DTF_SPECIAL_BACK) -ForegroundColor Gray
    Write-Host ''
    Write-Host '  PAYMENT RULES:' -ForegroundColor White
    Write-Host '    100% required: First-time, Rush, DTG/DTF custom, Customer garments' -ForegroundColor Gray
    Write-Host '    No blanks without payment. No production without payment.' -ForegroundColor Gray
    Write-Host ''
    Write-Host '  ACTIONS: heal | status | quote | intake | client | payment | job' -ForegroundColor White
    Write-Host '' -ForegroundColor White
}

# ============================================================================
# ENTRY POINT
# ============================================================================

switch ($Action.ToLower()) {
    'heal'    { Invoke-SelfHeal }
    'status'  { Show-AgentStatus }
    'quote'   {
        Write-Host '  Fast Quote Mode: ON' -ForegroundColor Cyan
        $qty = Read-Host '  Quantity'
        $cost = Read-Host '  Cost per unit ($)'
        $mat = Read-Host '  Material (100% Cotton, 100% Polyester, 50/50, Triblend, or blank)'
        $fb = Read-Host '  Front+Back? (y/n)'
        $isFB = ($fb -eq 'y')
        $isBO = $false
        if (-not $isFB) {
            $bo = Read-Host '  Back only? (y/n)'
            $isBO = ($bo -eq 'y')
        }
        if ($isFB) {
            Get-CheekyQuote -Quantity ([int]$qty) -CostPerUnit ([decimal]$cost) -Material $mat -FrontAndBack
        } elseif ($isBO) {
            Get-CheekyQuote -Quantity ([int]$qty) -CostPerUnit ([decimal]$cost) -Material $mat -BackOnly
        } else {
            Get-CheekyQuote -Quantity ([int]$qty) -CostPerUnit ([decimal]$cost) -Material $mat
        }
    }
    'intake' {
        Write-Host '  Intake Gate Check' -ForegroundColor Cyan
        $scope = Read-Host '  Scope (describe the job)'
        $qty = Read-Host '  Quantity'
        $garment = Read-Host '  Garment type'
        $design = Read-Host '  Design confirmed? (describe or blank)'
        $due = Read-Host '  Due date (yyyy-mm-dd)'
        $rev = Read-Host '  Revenue ($, 0 to skip margin)'
        $cost = Read-Host '  Cost ($, 0 to skip margin)'
        $cap = Read-Host '  Current capacity % (default 50)'
        if ([string]::IsNullOrWhiteSpace($cap)) { $cap = '50' }
        Test-IntakeGate -Scope $scope -Quantity ([int]$qty) -Garment $garment -Design $design -DueDate $due -Revenue ([decimal]$rev) -Cost ([decimal]$cost) -CapacityPercent ([int]$cap)
    }
    'client' {
        Write-Host '  Client Filter' -ForegroundColor Cyan
        $lrcs = Read-Host '  LRCS score (0-10)'
        $pph = Read-Host '  Profit per hour ($)'
        Test-ClientFilter -LrcsScore ([int]$lrcs) -ProfitPerHour ([decimal]$pph)
    }
    'payment' {
        Write-Host '  Payment Terms' -ForegroundColor Cyan
        $first = Read-Host '  First-time customer? (y/n)'
        $rush = Read-Host '  Rush job? (y/n)'
        $csg = Read-Host '  Customer-supplied garments? (y/n)'
        $pt = Read-Host '  Print type (DTG/DTF/Screen Print/Embroidery)'
        $total = Read-Host '  Total amount ($)'
        Get-PaymentTerms -FirstTimeCustomer:($first -eq 'y') -RushJob:($rush -eq 'y') -CustomerSuppliedGarments:($csg -eq 'y') -PrintType $pt -TotalAmount ([decimal]$total)
    }
    'job' {
        Write-Host '  Job Status' -ForegroundColor Cyan
        $name = Read-Host '  Order name'
        $pay = Read-Host '  Payment status (Unpaid/Deposit/Paid)'
        $art = Read-Host '  Art status (Not Submitted/Mockup/Approved/Print Ready)'
        $method = Read-Host '  Production method'
        $stage = Read-Host '  Current stage (Intake/Quote Sent/Deposit Paid/Production Ready/Printing/Completed)'
        Get-JobStatus -OrderName $name -PaymentStatus $pay -ArtStatus $art -ProductionMethod $method -CurrentStage $stage
    }
    default {
        Show-AgentStatus
    }
}
