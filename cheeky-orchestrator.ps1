<#
cheeky-orchestrator.ps1 - Master AI deployment + business orchestrator for CheekyTeesAutomation.
Commands: deploy | doctor | fix | rebuild | logs | classify-error | autopilot
          sync | orders | invoice | customer | payments | copilot
          production | task | quote | email-scan | order-complete | order-ready
PowerShell 5.1 compatible. No Unicode. All strings single-quoted where brackets appear.
#>
param()

$OrcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $OrcRoot

# Dot-source business modules
$sqApiPath = Join-Path $OrcRoot 'square-api.ps1'
$oeApiPath = Join-Path $OrcRoot 'orders-engine.ps1'
$pmApiPath = Join-Path $OrcRoot 'production-manager.ps1'
$saApiPath = Join-Path $OrcRoot 'sales-assistant.ps1'
$eiApiPath = Join-Path $OrcRoot 'email-intake-agent.ps1'
$brApiPath = Join-Path $OrcRoot 'business-rules.ps1'
$dsApiPath = Join-Path $OrcRoot 'dataverse-schema.ps1'
$dspPath  = Join-Path $OrcRoot 'dispatcher.ps1'
if (Test-Path $sqApiPath) { . $sqApiPath }
if (Test-Path $oeApiPath) { . $oeApiPath }
if (Test-Path $pmApiPath) { . $pmApiPath }
if (Test-Path $saApiPath) { . $saApiPath }
if (Test-Path $eiApiPath) { . $eiApiPath }
if (Test-Path $brApiPath) { . $brApiPath }
if (Test-Path $dsApiPath) { . $dsApiPath }

# -- Logging ---------------------------------------------------------------
$LogDir = Join-Path $OrcRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$ts = (Get-Date).ToString('yyyyMMdd-HHmmss')
$LogFile = Join-Path $LogDir ('orchestrator-' + $ts + '.log')
$LatestLog = Join-Path $LogDir 'latest.log'

function Write-OLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $t = Get-Date -Format o
    $line = '[' + $t + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    try { Add-Content -Path $LatestLog -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

# -- Audit ------------------------------------------------------------------
$AuditFile = Join-Path $OrcRoot 'business-audit.jsonl'

function Write-AuditEntry {
    param([string]$Command, [string]$Module, [string]$Result, [string]$Notes = '')
    $entry = @{
        timestamp = (Get-Date -Format o)
        command   = $Command
        module    = $Module
        result    = $Result
        notes     = $Notes
    }
    try {
        $json = ConvertTo-Json $entry -Compress -Depth 5
        Add-Content -Path $AuditFile -Value $json -ErrorAction SilentlyContinue
    } catch { }
}

# -- Config -----------------------------------------------------------------
$CfgPath = Join-Path $OrcRoot 'deployment-config.json'
$ErrorMapPath = Join-Path $OrcRoot 'error-map.json'

function Get-Cfg {
    if (-not (Test-Path $CfgPath)) { return $null }
    try { return (Get-Content -Path $CfgPath -Raw | ConvertFrom-Json) } catch { return $null }
}

function Get-ErrorMap {
    if (-not (Test-Path $ErrorMapPath)) { return @() }
    try { return (Get-Content -Path $ErrorMapPath -Raw | ConvertFrom-Json).patterns } catch { return @() }
}

# -- Doctor -----------------------------------------------------------------
function Invoke-Doctor {
    Write-OLog '=== DOCTOR START ==='
    $results = @()

    # PAC CLI
    $pacOk = [bool](Get-Command pac -ErrorAction SilentlyContinue)
    if ($pacOk) { Write-OLog '[PASS] PAC CLI installed' 'SUCCESS' } else { Write-OLog '[FAIL] PAC CLI not found' 'ERROR' }
    $results += @{ Check = 'PAC CLI'; Pass = $pacOk }

    # Auth
    $authOk = $false
    if ($pacOk) {
        try { $authOut = pac auth list 2>&1; if ($LASTEXITCODE -eq 0 -and ($authOut -match '\*')) { $authOk = $true } } catch { }
    }
    if ($authOk) { Write-OLog '[PASS] PAC auth active' 'SUCCESS' } else { Write-OLog '[FAIL] PAC auth not active' 'ERROR' }
    $results += @{ Check = 'PAC Auth'; Pass = $authOk }

    # ENV_URL
    $envOk = (-not [string]::IsNullOrWhiteSpace($env:ENV_URL))
    if ($envOk) { Write-OLog ('[PASS] ENV_URL = ' + $env:ENV_URL) 'SUCCESS' } else { Write-OLog '[FAIL] ENV_URL not set' 'ERROR' }
    $results += @{ Check = 'ENV_URL'; Pass = $envOk }

    # Config
    $cfg = Get-Cfg
    $cfgOk = ($null -ne $cfg -and -not [string]::IsNullOrWhiteSpace($cfg.SolutionZip) -and -not [string]::IsNullOrWhiteSpace($cfg.SolutionName))
    if ($cfgOk) { Write-OLog '[PASS] deployment-config.json valid' 'SUCCESS' } else { Write-OLog '[FAIL] deployment-config.json invalid or missing' 'ERROR' }
    $results += @{ Check = 'Config'; Pass = $cfgOk }

    # Solution zip
    $zipOk = $false
    if ($cfg -and $cfg.SolutionZip) { $zipOk = (Test-Path -Path $cfg.SolutionZip) }
    if ($zipOk) { Write-OLog ('[PASS] Solution zip: ' + $cfg.SolutionZip) 'SUCCESS' } else { Write-OLog '[FAIL] Solution zip missing' 'ERROR' }
    $results += @{ Check = 'Solution Zip'; Pass = $zipOk }

    # Dataverse access
    $dvOk = $false
    if ($pacOk -and $envOk) {
        try { $dvOut = pac env who 2>&1; if ($LASTEXITCODE -eq 0) { $dvOk = $true } } catch { }
    }
    if ($dvOk) { Write-OLog '[PASS] Dataverse environment accessible' 'SUCCESS' } else { Write-OLog '[FAIL] Dataverse environment not accessible' 'WARN' }
    $results += @{ Check = 'Dataverse Access'; Pass = $dvOk }

    Write-Host ''
    Write-Host '---- DOCTOR SUMMARY ----' -ForegroundColor White
    foreach ($r in $results) {
        $icon = if ($r.Pass) { 'OK' } else { '!!' }
        $color = if ($r.Pass) { 'Green' } else { 'Red' }
        Write-Host ('  [' + $icon + '] ' + $r.Check) -ForegroundColor $color
    }
    Write-Host '------------------------' -ForegroundColor White

    $failCount = ($results | Where-Object { -not $_.Pass }).Count
    if ($failCount -gt 0) { Write-OLog ('' + $failCount + ' check(s) failed. Run: cheeky fix') 'WARN' }
    else { Write-OLog 'All checks passed' 'SUCCESS' }
    Write-OLog '=== DOCTOR COMPLETE ==='
    return $failCount
}

# -- Classify Error ---------------------------------------------------------
function Invoke-ClassifyError {
    Write-OLog '=== CLASSIFY-ERROR ==='
    $logFiles = Get-ChildItem -Path $LogDir -Filter '*.log' -File | Sort-Object LastWriteTime -Descending
    $target = $null
    foreach ($lf in $logFiles) {
        if ($lf.Name -ne 'latest.log') { $target = $lf; break }
    }
    if (-not $target) { Write-OLog 'No log files found to analyze' 'WARN'; return @() }
    Write-OLog ('Analyzing: ' + $target.FullName)
    $content = Get-Content -Path $target.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { Write-OLog 'Log file empty' 'WARN'; return @() }

    $patterns = Get-ErrorMap
    $matched = @()
    foreach ($p in $patterns) {
        if ($content -match $p.match) {
            Write-OLog ('  MATCHED: ' + $p.category + ' - ' + $p.description) 'WARN'
            $matched += $p
        }
    }
    if ($matched.Count -eq 0) {
        Write-OLog '  No known error patterns matched. Category: unknown' 'WARN'
        $matched += @{ category = 'unknown'; fix = 'Manual investigation required.'; description = 'Unrecognized error.' }
    }
    Write-OLog '=== CLASSIFY-ERROR COMPLETE ==='
    return $matched
}

# -- Fix --------------------------------------------------------------------
function Invoke-Fix {
    Write-OLog '=== FIX START ==='

    # Execution policy
    $ep = Get-ExecutionPolicy -Scope CurrentUser
    if ($ep -eq 'Restricted' -or $ep -eq 'Undefined') {
        Write-OLog 'Fixing execution policy' 'WARN'
        try { Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force; Write-OLog 'Execution policy set to RemoteSigned' 'SUCCESS' } catch { Write-OLog ('Could not set execution policy: ' + $_.Exception.Message) 'WARN' }
    } else { Write-OLog ('Execution policy OK: ' + $ep) }

    # PAC CLI
    if (-not (Get-Command pac -ErrorAction SilentlyContinue)) {
        Write-OLog 'Installing PAC CLI via dotnet tool' 'WARN'
        try { dotnet tool install --global Microsoft.PowerApps.CLI.Tool 2>&1 | Out-Null } catch { Write-OLog ('PAC install failed: ' + $_.Exception.Message) 'ERROR' }
    } else { Write-OLog 'PAC CLI OK' }

    # ENV_URL
    if ([string]::IsNullOrWhiteSpace($env:ENV_URL)) {
        $cfg = Get-Cfg
        if ($cfg -and $cfg.EnvUrl) { $env:ENV_URL = $cfg.EnvUrl; Write-OLog 'ENV_URL loaded from config' }
        else {
            $url = Read-Host 'Enter Dataverse environment URL (e.g. https://org143bbb56.crm.dynamics.com)'
            if ($url) { $env:ENV_URL = $url; try { setx ENV_URL $url | Out-Null } catch { }; Write-OLog ('ENV_URL set: ' + $url) 'SUCCESS' }
        }
    } else { Write-OLog ('ENV_URL OK: ' + $env:ENV_URL) }

    # Auth
    $authOk = $false
    try { $authOut = pac auth list 2>&1; if ($LASTEXITCODE -eq 0 -and ($authOut -match '\*')) { $authOk = $true } } catch { }
    if (-not $authOk -and $env:ENV_URL) {
        Write-OLog 'Fixing PAC auth' 'WARN'
        try { pac auth create --name 'cheeky-auto' --url $env:ENV_URL --interactive } catch { Write-OLog ('Auth fix failed: ' + $_.Exception.Message) 'ERROR' }
    } else { Write-OLog 'PAC auth OK' }

    # Config
    $cfg = Get-Cfg
    if (-not $cfg) {
        Write-OLog 'Recreating deployment-config.json' 'WARN'
        $newCfg = @{ SolutionZip = (Join-Path $OrcRoot 'CheekyTeesAutomation.zip'); SolutionName = 'CheekyTeesAutomation'; Environment = 'Default'; UnpackFolder = (Join-Path $OrcRoot '_solution_unpacked'); TeamsWebhookUrl = ''; AutoExportIfMissing = $true }
        ($newCfg | ConvertTo-Json -Depth 5) | Set-Content -Path $CfgPath -Force
        $cfg = Get-Cfg
    } else { Write-OLog 'Config OK' }

    # Solution zip
    if ($cfg -and $cfg.SolutionZip -and -not (Test-Path -Path $cfg.SolutionZip)) {
        if ($env:ENV_URL) {
            Write-OLog 'Exporting solution because zip is missing' 'WARN'
            pac solution export --name $cfg.SolutionName --path $cfg.SolutionZip --environment $env:ENV_URL
            if ($LASTEXITCODE -eq 0) { Write-OLog 'Export complete' 'SUCCESS' } else { Write-OLog 'Export failed' 'ERROR' }
        } else { Write-OLog 'Cannot export: ENV_URL missing' 'ERROR' }
    } else { Write-OLog 'Solution zip OK' }

    Write-OLog '=== FIX COMPLETE ===' 'SUCCESS'
}

# -- Deploy -----------------------------------------------------------------
function Invoke-Deploy {
    Write-OLog '=== DEPLOY START ==='
    $deployScript = Join-Path $OrcRoot 'deploy-cheeky-solution.ps1'
    if (-not (Test-Path $deployScript)) { Write-OLog 'deploy-cheeky-solution.ps1 not found' 'ERROR'; return $false }

    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript 2>&1
    $output | ForEach-Object { Write-OLog ('' + $_) }
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-OLog 'Deploy returned non-zero exit. Classifying error...' 'WARN'
        $errors = Invoke-ClassifyError
        foreach ($e in $errors) {
            Write-OLog ('  Category: ' + $e.category + ' | Fix: ' + $e.fix) 'WARN'
        }
        Write-OLog 'Running fix pass...' 'WARN'
        Invoke-Fix
        Write-OLog 'Retrying deploy...' 'WARN'
        $output2 = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript 2>&1
        $output2 | ForEach-Object { Write-OLog ('' + $_) }
        $exitCode2 = $LASTEXITCODE
        if ($exitCode2 -ne 0) {
            Write-OLog '=== DEPLOY FAILED after retry ===' 'ERROR'
            return $false
        }
    }
    Write-OLog '=== DEPLOY SUCCESS ===' 'SUCCESS'
    return $true
}

# -- Rebuild ----------------------------------------------------------------
function Invoke-Rebuild {
    Write-OLog '=== REBUILD START ==='
    $cfg = Get-Cfg
    if ($cfg -and $cfg.SolutionZip -and (Test-Path -Path $cfg.SolutionZip)) {
        Remove-Item -Path $cfg.SolutionZip -Force -ErrorAction SilentlyContinue
        Write-OLog ('Deleted: ' + $cfg.SolutionZip)
    }
    $unpack = $cfg.UnpackFolder
    if ($unpack -and (Test-Path $unpack)) {
        Remove-Item -LiteralPath $unpack -Recurse -Force -ErrorAction SilentlyContinue
        Write-OLog ('Deleted: ' + $unpack)
    }
    Invoke-Fix
    $ok = Invoke-Deploy
    if ($ok) { Write-OLog '=== REBUILD SUCCESS ===' 'SUCCESS' } else { Write-OLog '=== REBUILD FAILED ===' 'ERROR' }
}

# -- Logs -------------------------------------------------------------------
function Invoke-Logs {
    if (Test-Path $LogDir) { Write-OLog ('Opening: ' + $LogDir); Start-Process explorer.exe -ArgumentList $LogDir }
    else { Write-OLog 'Logs folder does not exist' 'WARN' }
}

# -- Autopilot --------------------------------------------------------------
function Invoke-Autopilot {
    Write-OLog '=== AUTOPILOT START ==='

    # Step 1: Doctor
    $failCount = Invoke-Doctor
    if ($failCount -gt 0) {
        Write-OLog 'Issues detected. Running fix...' 'WARN'
        Invoke-Fix
        # Re-check
        $failCount2 = Invoke-Doctor
        if ($failCount2 -gt 0) { Write-OLog ('Still ' + $failCount2 + ' issue(s) after fix. Proceeding anyway.') 'WARN' }
    }

    # Step 2: Deploy
    $ok = Invoke-Deploy
    if ($ok) {
        Write-OLog '=== AUTOPILOT COMPLETE - DEPLOYMENT SUCCESSFUL ===' 'SUCCESS'
    } else {
        Write-OLog '=== AUTOPILOT COMPLETE - DEPLOYMENT FAILED ===' 'ERROR'
    }
}

# -- Business: Orders -------------------------------------------------------
function Invoke-OrdersToday {
    Write-OLog '=== ORDERS TODAY ==='
    $orders = Get-CheekyOrdersToday
    if ($orders.Count -eq 0) { Write-OLog 'No orders due today'; return }
    foreach ($o in $orders) {
        $line = '  ' + $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due: ' + $o.cr4b4_duedate
        Write-Host $line -ForegroundColor White
        Write-OLog $line
    }
}

function Invoke-OrdersTomorrow {
    Write-OLog '=== ORDERS TOMORROW ==='
    $orders = Get-CheekyOrdersTomorrow
    if ($orders.Count -eq 0) { Write-OLog 'No orders due tomorrow'; return }
    foreach ($o in $orders) {
        $line = '  ' + $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due: ' + $o.cr4b4_duedate
        Write-Host $line -ForegroundColor White
        Write-OLog $line
    }
}

# -- Business: Invoice ------------------------------------------------------
function Invoke-InvoiceCreate {
    Write-OLog '=== CREATE INVOICE ==='
    $orderId = Read-Host 'Square Order ID'
    $custId = Read-Host 'Square Customer ID'
    $title = Read-Host 'Invoice title (default: Cheeky Tees Order)'
    if ([string]::IsNullOrWhiteSpace($title)) { $title = 'Cheeky Tees Order' }
    $inv = Create-SquareInvoice -OrderId $orderId -CustomerId $custId -Title $title
    if ($inv) {
        Write-OLog ('Invoice created: ' + $inv.id) 'SUCCESS'
        $send = Read-Host 'Send invoice now? (y/n)'
        if ($send -eq 'y') { Send-SquareInvoice -InvoiceId $inv.id -Version $inv.version | Out-Null }
    }
}

function Invoke-InvoiceSend {
    Write-OLog '=== SEND INVOICE ==='
    $invId = Read-Host 'Invoice ID'
    Send-SquareInvoice -InvoiceId $invId | Out-Null
}

# -- Business: Customer -----------------------------------------------------
function Invoke-CustomerLookup {
    Write-OLog '=== CUSTOMER LOOKUP ==='
    $custId = Read-Host 'Square Customer ID'
    $cust = Get-SquareCustomer -CustomerId $custId
    if ($cust) {
        Write-Host ('  Name:  ' + $cust.given_name + ' ' + $cust.family_name) -ForegroundColor White
        Write-Host ('  Email: ' + $cust.email_address) -ForegroundColor White
        Write-Host ('  Phone: ' + $cust.phone_number) -ForegroundColor White
    } else { Write-OLog 'Customer not found' 'WARN' }
}

# -- Business: Payments -----------------------------------------------------
function Invoke-PaymentsToday {
    Write-OLog '=== PAYMENTS TODAY ==='
    $payments = Get-SquarePayments
    if ($payments.Count -eq 0) { Write-OLog 'No payments today'; return }
    foreach ($p in $payments) {
        $amt = if ($p.amount_money) { ($p.amount_money.amount / 100).ToString('C') } else { 'N/A' }
        $line = '  ' + $p.id + ' | ' + $amt + ' | ' + $p.status + ' | ' + $p.created_at
        Write-Host $line -ForegroundColor White
        Write-OLog $line
    }
}

# -- Business: Copilot ------------------------------------------------------
function Invoke-Copilot {
    $cpScript = Join-Path $OrcRoot 'copilot-commands.ps1'
    if (Test-Path $cpScript) {
        $prompt = if ($args.Count -gt 0) { $args -join ' ' } else { '' }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cpScript -Input $prompt
    } else { Write-OLog 'copilot-commands.ps1 not found' 'ERROR' }
}

# -- Sync: Square -> Dataverse ----------------------------------------------
function Invoke-SyncSquare {
    Write-OLog '=== SYNC SQUARE ==='
    $summary = Sync-SquareToDataverse
    if ($summary) {
        Write-OLog ('Invoices synced: ' + $summary.Invoices) 'SUCCESS'
        Write-OLog ('Orders synced: ' + $summary.Orders) 'SUCCESS'
        Write-OLog ('Payments synced: ' + $summary.Payments) 'SUCCESS'
        if ($summary.Errors -gt 0) { Write-OLog ($summary.Errors + ' error(s) during sync') 'WARN' }
    }
}

# -- Business: Orders Production --------------------------------------------
function Invoke-OrdersProduction {
    Write-OLog '=== ORDERS IN PRODUCTION ==='
    $statuses = @('Production Ready', 'Printing', 'QC')
    $allOrders = @()
    foreach ($s in $statuses) {
        $orders = Get-CheekyOrdersByStatus -Status $s
        foreach ($o in $orders) { $allOrders += $o }
    }
    if ($allOrders.Count -eq 0) { Write-OLog 'No orders in production pipeline'; return }
    foreach ($o in $allOrders) {
        $line = '  ' + $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due: ' + $o.cr4b4_duedate
        Write-Host $line -ForegroundColor White
        Write-OLog $line
    }
}

# -- Production -------------------------------------------------------------
function Invoke-ProductionToday {
    Write-OLog '=== PRODUCTION TODAY ==='
    New-ProductionTasksFromOrders | Out-Null
    Build-DailyPrintSchedule
}

function Invoke-ProductionTomorrow {
    Write-OLog '=== PRODUCTION TOMORROW ==='
    Build-TomorrowPrintSchedule
}

function Invoke-ProductionSummary {
    Write-OLog '=== PRODUCTION SUMMARY ==='
    Get-ProductionSummary
}

function Invoke-TaskCreate {
    Write-OLog '=== TASK CREATE ==='
    $count = New-ProductionTasksFromOrders
    Write-OLog ('' + $count + ' task(s) generated') 'SUCCESS'
}

function Invoke-TaskUpdate {
    Write-OLog '=== TASK UPDATE ==='
    $id = Read-Host 'Task or Order ID'
    Write-Host '  Valid statuses: Production Ready, Printing, QC, Ready for Pickup, Completed' -ForegroundColor DarkGray
    $status = Read-Host 'New status'
    $ok = Update-ProductionTaskStatus -TaskID $id -NewStatus $status
    if ($ok) { Write-OLog 'Task updated' 'SUCCESS' }
}

# -- Sales: Quote -----------------------------------------------------------
function Invoke-QuoteCreate {
    Write-OLog '=== QUOTE CREATE ==='
    $quote = New-CheekyQuoteFromRequest
    if ($quote) { Write-OLog ('Quote created: ' + $quote.QuoteID) 'SUCCESS' }
    Write-AuditEntry -Command 'quote create' -Module 'sales' -Result 'success'
}

# -- Sales: Customer History ------------------------------------------------
function Invoke-CustomerHistory {
    Write-OLog '=== CUSTOMER HISTORY ==='
    Get-CustomerHistory
}

# -- Sales: Unpaid ----------------------------------------------------------
function Invoke-Unpaid {
    Write-OLog '=== UNPAID INVOICES ==='
    Get-UnpaidInvoices
}

# -- Sales: Payment Reminder ------------------------------------------------
function Invoke-PaymentReminder {
    Write-OLog '=== PAYMENT REMINDER ==='
    Send-PaymentReminder
}

# -- Email Scan -------------------------------------------------------------
function Invoke-EmailScanCmd {
    Write-OLog '=== EMAIL SCAN ==='
    $summary = Invoke-EmailScan
    if ($summary) {
        Write-OLog ('Scanned: ' + $summary.Scanned + ' Created: ' + $summary.Created + ' Skipped: ' + $summary.Skipped) 'SUCCESS'
    }
    Write-AuditEntry -Command 'email-scan' -Module 'email-intake' -Result 'completed'
}

# -- Quick Status: Complete / Ready -----------------------------------------
function Invoke-OrderComplete {
    Write-OLog '=== ORDER COMPLETE ==='
    Set-OrderComplete
    Write-AuditEntry -Command 'order-complete' -Module 'sales' -Result 'success'
}

function Invoke-OrderReady {
    Write-OLog '=== ORDER READY ==='
    Set-OrderReady
    Write-AuditEntry -Command 'order-ready' -Module 'sales' -Result 'success'
}

# -- Schema: Provision Tables -----------------------------------------------
function Invoke-SchemaProvision {
    param([switch]$DryRun)
    Write-OLog '=== SCHEMA PROVISIONING ==='
    $provScript = Join-Path $OrcRoot 'provision-cheeky-os.ps1'
    if (-not (Test-Path $provScript)) { Write-OLog 'provision-cheeky-os.ps1 not found' 'ERROR'; return }
    if ($DryRun) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $provScript -DryRun
    } else {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $provScript
    }
    Write-AuditEntry -Command 'schema provision' -Module 'dataverse-schema' -Result 'completed'
}

# -- Schema: Validate Dataverse ---------------------------------------------
function Invoke-SchemaValidate {
    Write-OLog '=== SCHEMA VALIDATION ==='
    Test-CheekyOsSchema
    Write-AuditEntry -Command 'schema validate' -Module 'dataverse-schema' -Result 'completed'
}

function Invoke-SchemaShow {
    Write-OLog '=== SCHEMA MODEL ==='
    Show-CheekyOsSchema
}

# -- Business Rules: Route + Margin -----------------------------------------
function Invoke-RouteCheck {
    Write-OLog '=== PRODUCTION ROUTE CHECK ==='
    $material = Read-Host '  Material (e.g. 100% Polyester, 50/50 Blend, Triblend, 100% Cotton)'
    $qty = Read-Host '  Quantity'
    $days = Read-Host '  Days until due (default 14)'
    if ([string]::IsNullOrWhiteSpace($days)) { $days = '14' }
    $result = Get-RecommendedProductionType -Material $material -Quantity ([int]$qty) -DaysUntilDue ([int]$days)
    Write-Host '' -ForegroundColor White
    Write-Host ('  Recommended: ' + $result.ProductionType) -ForegroundColor Cyan
    Write-Host ('  Reason: ' + $result.Reason) -ForegroundColor White
    if ($result.AllowVendor) { Write-Host '  Vendor routing: Eligible' -ForegroundColor DarkYellow }
    Write-Host '' -ForegroundColor White
    Write-AuditEntry -Command 'route check' -Module 'business-rules' -Result $result.ProductionType -Notes $result.Reason
}

function Invoke-MarginCheck {
    Write-OLog '=== MARGIN GATE CHECK ==='
    $revenue = Read-Host '  Total revenue (amount customer pays)'
    $cost = Read-Host '  Total cost (your cost)'
    $result = Test-MarginGate -TotalAmount ([decimal]$revenue) -TotalCost ([decimal]$cost)
    Write-Host '' -ForegroundColor White
    $color = if ($result.Passed) { 'Cyan' } else { 'Red' }
    Write-Host ('  Margin: ' + $result.MarginPercent + '%') -ForegroundColor $color
    Write-Host ('  Result: ' + $result.Reason) -ForegroundColor White
    if ($result.Flagged) { Write-Host '  ** ORDER FLAGGED - PRODUCTION BLOCKED **' -ForegroundColor Red }
    Write-Host '' -ForegroundColor White
    Write-AuditEntry -Command 'margin check' -Module 'business-rules' -Result $(if ($result.Passed) { 'passed' } else { 'flagged' }) -Notes ('Margin: ' + $result.MarginPercent + '%')
}

function Invoke-ValidateOrder {
    Write-OLog '=== ORDER VALIDATION ==='
    $prodType = Read-Host '  Production type (DTG/Screen Print/DTF/Embroidery/Vendor)'
    $qty = Read-Host '  Quantity'
    $revenue = Read-Host '  Revenue (0 to skip margin check)'
    $cost = Read-Host '  Cost (0 to skip margin check)'
    $result = Test-OrderForProduction -ProductionType $prodType -Quantity ([int]$qty) -TotalAmount ([decimal]$revenue) -TotalCost ([decimal]$cost)
    Write-Host '' -ForegroundColor White
    if ($result.CanProceed) {
        Write-Host '  CLEARED FOR PRODUCTION' -ForegroundColor Cyan
    } else {
        Write-Host '  BLOCKED FROM PRODUCTION' -ForegroundColor Red
        foreach ($issue in $result.Issues) { Write-Host ('    - ' + $issue) -ForegroundColor Yellow }
    }
    Write-Host '' -ForegroundColor White
}

# -- Ask: Dispatcher --------------------------------------------------------
function Invoke-Ask {
    $phrase = ''
    if ($args.Count -gt 0) { $phrase = $args -join ' ' }
    elseif ($script:remainingArgs.Count -gt 0) { $phrase = $script:remainingArgs -join ' ' }
    Write-OLog ('=== ASK: ' + $phrase + ' ===')
    if ([string]::IsNullOrWhiteSpace($phrase)) {
        $phrase = Read-Host 'What would you like to do?'
    }
    if (Test-Path $dspPath) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $dspPath -Request $phrase
    } else {
        Write-OLog 'dispatcher.ps1 not found' 'ERROR'
    }
    Write-AuditEntry -Command 'ask' -Module 'dispatcher' -Result 'completed' -Notes $phrase
}

# -- Entry point ------------------------------------------------------------
# Clear latest.log at start of each run
if (Test-Path $LatestLog) { Set-Content -Path $LatestLog -Value '' -Force }

$command = if ($args.Count -gt 0) { $args[0].ToLower() } else { '' }
$subcommand = if ($args.Count -gt 1) { $args[1].ToLower() } else { '' }
$script:remainingArgs = @()
if ($args.Count -gt 1) { $script:remainingArgs = @($args[1..($args.Count - 1)]) }

Write-OLog ('Command: ' + $command + ' ' + $subcommand)

switch ($command) {
    'deploy'         { Invoke-Deploy }
    'doctor'         { Invoke-Doctor | Out-Null }
    'fix'            { Invoke-Fix }
    'rebuild'        { Invoke-Rebuild }
    'logs'           { Invoke-Logs }
    'classify-error' { Invoke-ClassifyError | Out-Null }
    'autopilot'      { Invoke-Autopilot }
    'sync' {
        switch ($subcommand) {
            'square' { Invoke-SyncSquare }
            default  { Invoke-SyncSquare }
        }
    }
    'orders' {
        switch ($subcommand) {
            'today'      { Invoke-OrdersToday }
            'tomorrow'   { Invoke-OrdersTomorrow }
            'production' { Invoke-OrdersProduction }
            default      { Invoke-OrdersToday }
        }
    }
    'invoice' {
        switch ($subcommand) {
            'create' { Invoke-InvoiceCreate }
            'send'   { Invoke-InvoiceSend }
            default  { Invoke-InvoiceCreate }
        }
    }
    'payments'   { Invoke-PaymentsToday }
    'copilot'    { Invoke-Copilot }
    'production' {
        switch ($subcommand) {
            'today'    { Invoke-ProductionToday }
            'tomorrow' { Invoke-ProductionTomorrow }
            'summary'  { Invoke-ProductionSummary }
            default    { Invoke-ProductionToday }
        }
    }
    'task' {
        switch ($subcommand) {
            'create' { Invoke-TaskCreate }
            'update' { Invoke-TaskUpdate }
            default  { Invoke-TaskCreate }
        }
    }
    'quote' {
        switch ($subcommand) {
            'create' { Invoke-QuoteCreate }
            default  { Invoke-QuoteCreate }
        }
    }
    'email-scan'     { Invoke-EmailScanCmd }
    'order-complete' { Invoke-OrderComplete }
    'order-ready'    { Invoke-OrderReady }
    'customer' {
        switch ($subcommand) {
            'lookup'  { Invoke-CustomerLookup }
            'history' { Invoke-CustomerHistory }
            default   { Invoke-CustomerLookup }
        }
    }
    'unpaid'         { Invoke-Unpaid }
    'reminder'       { Invoke-PaymentReminder }
    'ask'            { Invoke-Ask @script:remainingArgs }
    'schema' {
        switch ($subcommand) {
            'provision' { Invoke-SchemaProvision }
            'provision-dry' { Invoke-SchemaProvision -DryRun }
            'validate' { Invoke-SchemaValidate }
            'show'     { Invoke-SchemaShow }
            default    { Invoke-SchemaShow }
        }
    }
    'route'          { Invoke-RouteCheck }
    'margin'         { Invoke-MarginCheck }
    'validate'       { Invoke-ValidateOrder }
    default {
        Write-Host ''
        Write-Host '  Cheeky AI Deployment + Business Orchestrator' -ForegroundColor Cyan
        Write-Host '  Usage:  cheeky <command>' -ForegroundColor White
        Write-Host ''
        Write-Host '  DevOps:' -ForegroundColor White
        Write-Host '    deploy              Run full deployment pipeline'
        Write-Host '    doctor              Health check all prerequisites'
        Write-Host '    fix                 Auto-detect and repair common issues'
        Write-Host '    rebuild             Delete zip, re-export, redeploy'
        Write-Host '    logs                Open the logs folder'
        Write-Host '    classify-error      Analyze latest log for known errors'
        Write-Host '    autopilot           Full auto: doctor, fix, deploy, retry'
        Write-Host ''
        Write-Host '  Business:' -ForegroundColor White
        Write-Host '    sync square         Pull Square data into Dataverse'
        Write-Host '    orders today        Show orders due today'
        Write-Host '    orders tomorrow     Show orders due tomorrow'
        Write-Host '    orders production   Show orders in production pipeline'
        Write-Host '    invoice create      Create a Square invoice'
        Write-Host '    invoice send        Send a Square invoice'
        Write-Host '    customer lookup     Look up a Square customer'
        Write-Host '    customer history    Show order history for a customer'
        Write-Host '    payments today      List payments received today'
        Write-Host '    copilot             Natural language command mode'
        Write-Host ''
        Write-Host '  Production:' -ForegroundColor White
        Write-Host '    production today    Print schedule for today'
        Write-Host '    production tomorrow Print schedule for tomorrow'
        Write-Host '    production summary  Totals by print type and status'
        Write-Host '    task create         Generate tasks from ready orders'
        Write-Host '    task update         Change a task status'
        Write-Host ''
        Write-Host '  Sales:' -ForegroundColor White
        Write-Host '    quote create        Create a new quote'
        Write-Host '    unpaid              Show unpaid invoices'
        Write-Host '    reminder            Send payment reminder'
        Write-Host '    order-complete      Mark an order completed'
        Write-Host '    order-ready         Mark an order ready for pickup'
        Write-Host '    email-scan          Scan inbox for order emails'
        Write-Host ''
        Write-Host '  Dispatcher:' -ForegroundColor White
        Write-Host '    ask "<request>"     Natural language business request'
        Write-Host ''
        Write-Host '  Cheeky OS:' -ForegroundColor White
        Write-Host '    schema show         Show full data model'
        Write-Host '    schema validate     Check Dataverse tables exist'
        Write-Host '    schema provision    Create all 9 tables in Dataverse'
        Write-Host '    schema provision-dry Preview table creation (no changes)'
        Write-Host '    route               Production type routing check'
        Write-Host '    margin              Margin gate (45%) check'
        Write-Host '    validate            Full order validation (min + margin)'
        Write-Host ''
    }
}
