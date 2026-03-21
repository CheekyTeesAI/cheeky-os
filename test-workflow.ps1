########################################################################
# Cheeky OS - End-to-End Workflow Test
# Creates test data, validates all relationships, reports result
########################################################################

$ErrorActionPreference = "Stop"
$token = (Get-Content (Join-Path $PSScriptRoot ".dv_token.tmp") -Raw).Trim()
$baseUrl = "https://org143bbb56.crm.dynamics.com/api/data/v9.2"

function Invoke-DV {
    param([string]$Method="GET", [string]$Path, [object]$Body)
    $uri = "$baseUrl/$Path"
    $h = @{
        "Authorization"    = "Bearer $token"
        "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"
        "Accept"           = "application/json"
        "Content-Type"     = "application/json; charset=utf-8"
        "Prefer"           = "return=representation"
    }
    $params = @{ Uri = $uri; Method = $Method; Headers = $h }
    if ($Body) {
        $json = $Body | ConvertTo-Json -Depth 10 -Compress
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
    }
    try { return Invoke-RestMethod @params }
    catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            $r = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $msg += "`n" + $r.ReadToEnd(); $r.Close()
        }
        throw $msg
    }
}

function Write-Step  { param([string]$m) Write-Host "`n>> $m" -ForegroundColor Cyan }
function Write-OK    { param([string]$m) Write-Host "   [OK] $m" -ForegroundColor Green }
function Write-Fail  { param([string]$m) Write-Host "   [FAIL] $m" -ForegroundColor Red }

$testId    = Get-Date -Format "yyyyMMdd-HHmmss"
$ordNum    = "TEST-$testId"
$custName  = "Test Customer $testId"
$errors    = @()

Write-Host "============================================" -ForegroundColor Yellow
Write-Host " Cheeky OS - End-to-End Workflow Validation" -ForegroundColor Yellow
Write-Host " Order:    $ordNum" -ForegroundColor Yellow
Write-Host " Customer: $custName" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow

# ── STEP 1: Create Customer ─────────────────────────────────────────
Write-Step "STEP 1: Create Customer"
try {
    $cust = Invoke-DV -Method POST -Path "ct_customerses" -Body @{
        ct_name  = $custName
        ct_email = "test@cheekyteesllc.com"
        ct_phone = "555-0100"
    }
    $custId = $cust.ct_customersid
    Write-OK "Customer created: $custId"
} catch {
    Write-Fail "Customer creation failed: $_"
    $errors += "Customer: $_"
}

# ── STEP 2: Create Order linked to Customer ─────────────────────────
Write-Step "STEP 2: Create Order (linked to Customer)"
try {
    $order = Invoke-DV -Method POST -Path "ct_orderses" -Body @{
        ct_name           = $ordNum
        ct_customername   = $custName
        ct_orderstage     = 100000000    # Intake
        ct_productiontype = 100000000    # DTG
        ct_quantity       = 25
        ct_unitprice      = 12.50
        ct_duedate        = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
        "ct_customerid@odata.bind" = "/ct_customerses($custId)"
    }
    $ordId = $order.ct_ordersid
    Write-OK "Order created: $ordId"
} catch {
    Write-Fail "Order creation failed: $_"
    $errors += "Order: $_"
}

# ── STEP 3: Create Production Job linked to Order ────────────────────
Write-Step "STEP 3: Create Production Job (linked to Order)"
try {
    $job = Invoke-DV -Method POST -Path "ct_productionjobses" -Body @{
        ct_name           = "PJ-$ordNum"
        ct_ordernumber    = $ordNum
        ct_productiontype = 100000000    # DTG
        ct_jobstatus      = 100000000    # Queued
        ct_quantity       = 25
        "ct_orderid@odata.bind" = "/ct_orderses($ordId)"
    }
    $jobId = $job.ct_productionjobsid
    Write-OK "Production Job created: $jobId"
} catch {
    Write-Fail "Production Job creation failed: $_"
    $errors += "ProdJob: $_"
}

# ── STEP 4: Create Tasks linked to Order + Production Job ────────────
Write-Step "STEP 4: Create Tasks (linked to Order + Production Job)"
$taskDefs = @(
    @{ Name = "Design - $ordNum";  Type = 100000000 }   # Artwork Approval
    @{ Name = "Print - $ordNum";   Type = 100000002 }   # Printing
    @{ Name = "QC - $ordNum";      Type = 100000003 }   # QC Check
    @{ Name = "Ship - $ordNum";    Type = 100000004 }   # Packaging
)
$taskIds = @()
foreach ($td in $taskDefs) {
    try {
        $task = Invoke-DV -Method POST -Path "ct_taskses" -Body @{
            ct_name        = $td.Name
            ct_tasktype    = $td.Type
            ct_status      = 100000000   # Not Started
            ct_ordernumber = $ordNum
            ct_duedate     = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
            ct_priority    = 100000000   # Normal
            "ct_orderid@odata.bind"         = "/ct_orderses($ordId)"
            "ct_productionjobid@odata.bind" = "/ct_productionjobses($jobId)"
        }
        $taskIds += $task.ct_tasksid
        Write-OK "Task: $($td.Name) ($($task.ct_tasksid))"
    } catch {
        Write-Fail "Task '$($td.Name)' failed: $_"
        $errors += "Task $($td.Name): $_"
    }
}

# ═══════════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host " VALIDATION" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
$pass = $true

# ── V1: Customer readable ──────────────────────────────────────────
Write-Step "V1: Verify Customer fields are populated"
try {
    $c = Invoke-DV -Path "ct_customerses($custId)?`$select=ct_name,ct_email,ct_phone"
    if ($c.ct_name -eq $custName -and $c.ct_email -eq "test@cheekyteesllc.com" -and $c.ct_phone -eq "555-0100") {
        Write-OK "Customer fields: name='$($c.ct_name)', email='$($c.ct_email)', phone='$($c.ct_phone)'"
    } else {
        Write-Fail "Customer fields mismatch: name='$($c.ct_name)', email='$($c.ct_email)', phone='$($c.ct_phone)'"
        $pass = $false
    }
} catch { Write-Fail "Customer read failed: $_"; $pass = $false }

# ── V2: Order fields + Customer link ───────────────────────────────
Write-Step "V2: Verify Order fields and Customer relationship"
try {
    $o = Invoke-DV -Path "ct_orderses($ordId)?`$select=ct_name,ct_customername,ct_orderstage,ct_productiontype,ct_quantity,ct_unitprice,ct_duedate,_ct_customerid_value"

    $v2checks = [ordered]@{
        ct_name           = @($o.ct_name,           $ordNum)
        ct_customername   = @($o.ct_customername,    $custName)
        ct_orderstage     = @($o.ct_orderstage,      100000000)
        ct_productiontype = @($o.ct_productiontype,  100000000)
        ct_quantity       = @($o.ct_quantity,         25)
        ct_unitprice      = @($o.ct_unitprice,        12.5)
    }
    foreach ($key in $v2checks.Keys) {
        $actual   = "$($v2checks[$key][0])"
        $expected = "$($v2checks[$key][1])"
        # Numeric comparison for money/int fields
        $numActual = $null; $numExpected = $null
        $isNum = [double]::TryParse($actual, [ref]$numActual) -and [double]::TryParse($expected, [ref]$numExpected)
        if (($isNum -and $numActual -eq $numExpected) -or ($actual -eq $expected)) {
            Write-OK "  $key = $actual"
        } else {
            Write-Fail "  $key expected '$expected' got '$actual'"; $pass = $false
        }
    }
    # Lookup relationship
    if ($o._ct_customerid_value -eq $custId) {
        Write-OK "  Order -> Customer lookup: LINKED ($custId)"
    } else {
        Write-Fail "  Order -> Customer lookup: expected $custId, got $($o._ct_customerid_value)"
        $pass = $false
    }
} catch { Write-Fail "Order read failed: $_"; $pass = $false }

# ── V3: Production Job + Order link ────────────────────────────────
Write-Step "V3: Verify Production Job and Order relationship"
try {
    $j = Invoke-DV -Path "ct_productionjobses($jobId)?`$select=ct_name,ct_ordernumber,ct_jobstatus,ct_quantity,_ct_orderid_value"
    if ($j.ct_ordernumber -eq $ordNum) { Write-OK "  ct_ordernumber = $($j.ct_ordernumber)" }
    else { Write-Fail "  ct_ordernumber expected '$ordNum' got '$($j.ct_ordernumber)'"; $pass = $false }
    if ($j._ct_orderid_value -eq $ordId) { Write-OK "  ProdJob -> Order lookup: LINKED ($ordId)" }
    else { Write-Fail "  ProdJob -> Order lookup: expected $ordId, got $($j._ct_orderid_value)"; $pass = $false }
    if ($j.ct_jobstatus -eq 100000000) { Write-OK "  ct_jobstatus = Queued (100000000)" }
    else { Write-Fail "  ct_jobstatus expected 100000000 got $($j.ct_jobstatus)"; $pass = $false }
    if ($j.ct_quantity -eq 25) { Write-OK "  ct_quantity = 25" }
    else { Write-Fail "  ct_quantity expected 25 got $($j.ct_quantity)"; $pass = $false }
} catch { Write-Fail "ProdJob read failed: $_"; $pass = $false }

# ── V4: Tasks + relationships ──────────────────────────────────────
Write-Step "V4: Verify Tasks, Order link, and ProdJob link"
try {
    $filter = [uri]::EscapeDataString("_ct_orderid_value eq $ordId")
    $tasks = Invoke-DV -Path "ct_taskses?`$filter=$filter&`$select=ct_name,ct_tasktype,ct_status,ct_ordernumber,_ct_orderid_value,_ct_productionjobid_value"
    if ($tasks.value.Count -eq 4) { Write-OK "  Task count: 4" }
    else { Write-Fail "  Expected 4 tasks, got $($tasks.value.Count)"; $pass = $false }
    foreach ($t in $tasks.value) {
        $orderLinked = ($t._ct_orderid_value -eq $ordId)
        $jobLinked   = ($t._ct_productionjobid_value -eq $jobId)
        if ($orderLinked -and $jobLinked) {
            Write-OK "  $($t.ct_name) -> Order:OK, ProdJob:OK"
        } else {
            Write-Fail "  $($t.ct_name) -> Order:$orderLinked, ProdJob:$jobLinked"
            $pass = $false
        }
    }
} catch { Write-Fail "Tasks read failed: $_"; $pass = $false }

# ═══════════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host " FINAL REPORT" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  CREATED:" -ForegroundColor White
Write-Host "    Customer:       $custName ($custId)" -ForegroundColor Gray
Write-Host "    Order:          $ordNum ($ordId)" -ForegroundColor Gray
Write-Host "    Production Job: PJ-$ordNum ($jobId)" -ForegroundColor Gray
Write-Host "    Tasks:          $($taskIds.Count) tasks" -ForegroundColor Gray
foreach ($tid in $taskIds) { Write-Host "      - $tid" -ForegroundColor Gray }
Write-Host ""
Write-Host "  RELATIONSHIPS:" -ForegroundColor White
Write-Host "    Order -> Customer:          ct_customerid lookup" -ForegroundColor Gray
Write-Host "    ProductionJob -> Order:     ct_orderid lookup" -ForegroundColor Gray
Write-Host "    Task -> Order:              ct_orderid lookup" -ForegroundColor Gray
Write-Host "    Task -> ProductionJob:      ct_productionjobid lookup" -ForegroundColor Gray
Write-Host ""

if ($pass -and $errors.Count -eq 0) {
    Write-Host "  ========================================" -ForegroundColor Green
    Write-Host "  FINAL STATUS: SUCCESS" -ForegroundColor Green
    Write-Host "  All records created. All fields populated." -ForegroundColor Green
    Write-Host "  All relationships verified." -ForegroundColor Green
    Write-Host "  ========================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  ========================================" -ForegroundColor Red
    Write-Host "  FINAL STATUS: FAILED" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "    $e" -ForegroundColor Red }
    Write-Host "  ========================================" -ForegroundColor Red
    exit 1
}
