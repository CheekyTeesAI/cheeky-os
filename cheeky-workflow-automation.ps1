########################################################################
# Cheeky OS - End-to-End Order Automation Workflow
# Connects: Orders -> Customers -> ProductionJobs -> Tasks
# Uses Dataverse Web API via pac CLI (FetchXML) + direct REST
########################################################################

param(
    [switch]$TestMode,
    [switch]$RunTest
)

$ErrorActionPreference = "Stop"
$OrgUrl = "https://org143bbb56.crm.dynamics.com"
$ApiUrl = "$OrgUrl/api/data/v9.2"

# ── Helpers ──────────────────────────────────────────────────────────

function Write-Step  { param([string]$msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-OK    { param([string]$msg) Write-Host "   [OK] $msg" -ForegroundColor Green }
function Write-Fail  { param([string]$msg) Write-Host "   [FAIL] $msg" -ForegroundColor Red }
function Write-Info  { param([string]$msg) Write-Host "   $msg" -ForegroundColor Gray }

function Get-DataverseToken {
    $tokenFile = Join-Path $PSScriptRoot ".dv_token.tmp"
    if (Test-Path $tokenFile) {
        $token = (Get-Content $tokenFile -Raw).Trim()
        if ($token.Length -gt 100) { return $token }
    }
    # Fall back to device code flow
    $tenantId = "9dd4d2a7-723e-48ba-a491-834433aa2509"
    $clientId = "51f81489-12ee-4a9e-aaae-a2591f45987d"
    $scope    = "$OrgUrl.default offline_access"
    $dcUrl    = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/devicecode"
    $dcResp   = Invoke-RestMethod -Method POST -Uri $dcUrl -Body @{ client_id = $clientId; scope = $scope }
    Write-Host $dcResp.message -ForegroundColor Yellow
    Start-Process $dcResp.verification_uri
    $pollUrl  = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
    $pollBody = @{ grant_type = "urn:ietf:params:oauth:grant-type:device_code"; client_id = $clientId; device_code = $dcResp.device_code }
    for ($i = 0; $i -lt 24; $i++) {
        Start-Sleep -Seconds 5
        try {
            $tokenResp = Invoke-RestMethod -Method POST -Uri $pollUrl -Body $pollBody -ErrorAction Stop
            $tokenResp.access_token | Set-Content -Path $tokenFile -NoNewline
            return $tokenResp.access_token
        } catch {
            $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($err.error -ne "authorization_pending") { throw "Auth failed: $($err.error_description)" }
        }
    }
    throw "Device code authentication timed out."
}

function Invoke-DataverseApi {
    param(
        [string]$Method = "GET",
        [string]$Path,
        [object]$Body,
        [string]$Token
    )
    $uri = "$ApiUrl/$Path"
    $headers = @{
        "Authorization" = "Bearer $Token"
        "OData-MaxVersion" = "4.0"
        "OData-Version" = "4.0"
        "Accept" = "application/json"
        "Content-Type" = "application/json; charset=utf-8"
        "Prefer" = "return=representation"
    }
    $params = @{
        Uri     = $uri
        Method  = $Method
        Headers = $headers
    }
    if ($Body) {
        $params.Body = ($Body | ConvertTo-Json -Depth 10)
    }
    try {
        $response = Invoke-RestMethod @params
        return $response
    }
    catch {
        $errMsg = $_.Exception.Message
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errBody = $reader.ReadToEnd()
            $reader.Close()
            throw "Dataverse API Error ($Method $Path): $errMsg`n$errBody"
        }
        throw "Dataverse API Error ($Method $Path): $errMsg"
    }
}

# ── Core Workflow Functions ──────────────────────────────────────────

function Find-Customer {
    param([string]$CustomerName, [string]$Token)
    $filter = [uri]::EscapeDataString("ct_name eq '$CustomerName'")
    $result = Invoke-DataverseApi -Token $Token -Path "ct_customerses?`$filter=$filter&`$top=1"
    if ($result.value -and $result.value.Count -gt 0) {
        return $result.value[0]
    }
    return $null
}

function New-Customer {
    param([string]$CustomerName, [string]$Email, [string]$Phone, [string]$Token)
    $body = @{
        ct_name  = $CustomerName
        ct_email = $Email
        ct_phone = $Phone
    }
    $result = Invoke-DataverseApi -Token $Token -Method "POST" -Path "ct_customerses" -Body $body
    return $result
}

function New-Order {
    param(
        [string]$OrderNumber,
        [string]$CustomerName,
        [int]$OrderStage = 100000000,       # Intake
        [int]$ProductionType = 100000000,    # DTG
        [int]$Quantity = 1,
        [decimal]$UnitPrice = 0,
        [string]$DueDate,
        [string]$Token
    )
    $body = @{
        ct_name           = $OrderNumber
        ct_customername   = $CustomerName
        ct_orderstage     = $OrderStage
        ct_productiontype = $ProductionType
        ct_quantity       = $Quantity
        ct_unitprice      = $UnitPrice
        ct_duedate        = $DueDate
    }
    $result = Invoke-DataverseApi -Token $Token -Method "POST" -Path "ct_orderses" -Body $body
    return $result
}

function New-ProductionJob {
    param(
        [string]$JobName,
        [string]$OrderNumber,
        [int]$ProductionType = 100000000,    # DTG
        [int]$JobStatus = 100000000,         # Queued
        [int]$Quantity = 1,
        [string]$Token
    )
    $body = @{
        ct_name           = $JobName
        ct_ordernumber    = $OrderNumber
        ct_productiontype = $ProductionType
        ct_jobstatus      = $JobStatus
        ct_quantity       = $Quantity
    }
    $result = Invoke-DataverseApi -Token $Token -Method "POST" -Path "ct_productionjobses" -Body $body
    return $result
}

function New-Task {
    param(
        [string]$TaskName,
        [int]$TaskType,
        [int]$Status = 100000000,            # Not Started
        [string]$OrderNumber,
        [string]$DueDate,
        [int]$Priority = 100000000,          # Normal
        [string]$Token
    )
    $body = @{
        ct_name        = $TaskName
        ct_tasktype    = $TaskType
        ct_status      = $Status
        ct_ordernumber = $OrderNumber
        ct_duedate     = $DueDate
        ct_priority    = $Priority
    }
    $result = Invoke-DataverseApi -Token $Token -Method "POST" -Path "ct_taskses" -Body $body
    return $result
}

# ── Main Workflow: Process New Order ─────────────────────────────────

function Invoke-OrderWorkflow {
    param(
        [string]$OrderNumber,
        [string]$CustomerName,
        [string]$CustomerEmail = "",
        [string]$CustomerPhone = "",
        [int]$ProductionType = 100000000,
        [int]$Quantity = 1,
        [decimal]$UnitPrice = 15.00,
        [string]$DueDate,
        [string]$Token
    )

    $results = @{
        Customer      = $null
        Order         = $null
        ProductionJob = $null
        Tasks         = @()
        Status        = "FAILED"
        Errors        = @()
    }

    if (-not $DueDate) {
        $DueDate = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
    }

    # ── Step 1: Customer ─────────────────────────────────────────────
    Write-Step "Step 1: Check/Create Customer '$CustomerName'"
    try {
        $customer = Find-Customer -CustomerName $CustomerName -Token $Token
        if ($customer) {
            Write-OK "Customer found: $($customer.ct_customersid)"
            $results.Customer = $customer
        }
        else {
            Write-Info "Customer not found, creating..."
            $customer = New-Customer -CustomerName $CustomerName -Email $CustomerEmail -Phone $CustomerPhone -Token $Token
            Write-OK "Customer created: $($customer.ct_customersid)"
            $results.Customer = $customer
        }
    }
    catch {
        $results.Errors += "Customer step failed: $_"
        Write-Fail "Customer step failed: $_"
        return $results
    }

    # ── Step 2: Order ────────────────────────────────────────────────
    Write-Step "Step 2: Create Order '$OrderNumber'"
    try {
        $order = New-Order -OrderNumber $OrderNumber -CustomerName $CustomerName `
            -ProductionType $ProductionType -Quantity $Quantity `
            -UnitPrice $UnitPrice -DueDate $DueDate -Token $Token
        Write-OK "Order created: $($order.ct_ordersid)"
        $results.Order = $order
    }
    catch {
        $results.Errors += "Order step failed: $_"
        Write-Fail "Order step failed: $_"
        return $results
    }

    # ── Step 3: Production Job ───────────────────────────────────────
    Write-Step "Step 3: Create Production Job for Order '$OrderNumber'"
    try {
        $jobName = "PJ-$OrderNumber"
        $job = New-ProductionJob -JobName $jobName -OrderNumber $OrderNumber `
            -ProductionType $ProductionType -Quantity $Quantity -Token $Token
        Write-OK "Production Job created: $($job.ct_productionjobsid) ($jobName)"
        $results.ProductionJob = $job
    }
    catch {
        $results.Errors += "ProductionJob step failed: $_"
        Write-Fail "ProductionJob step failed: $_"
        return $results
    }

    # ── Step 4: Tasks ────────────────────────────────────────────────
    Write-Step "Step 4: Create Tasks linked to Order '$OrderNumber'"

    $taskDefs = @(
        @{ Name = "Design - $OrderNumber";  Type = 100000000 }   # Artwork Approval
        @{ Name = "Print - $OrderNumber";   Type = 100000002 }   # Printing
        @{ Name = "QC - $OrderNumber";      Type = 100000003 }   # QC Check
        @{ Name = "Ship - $OrderNumber";    Type = 100000004 }   # Packaging
    )

    foreach ($td in $taskDefs) {
        try {
            $task = New-Task -TaskName $td.Name -TaskType $td.Type `
                -OrderNumber $OrderNumber -DueDate $DueDate -Token $Token
            Write-OK "Task created: $($task.ct_tasksid) ($($td.Name))"
            $results.Tasks += $task
        }
        catch {
            $results.Errors += "Task '$($td.Name)' failed: $_"
            Write-Fail "Task '$($td.Name)' failed: $_"
        }
    }

    if ($results.Tasks.Count -eq $taskDefs.Count) {
        $results.Status = "SUCCESS"
    }
    elseif ($results.Tasks.Count -gt 0) {
        $results.Status = "PARTIAL"
    }

    return $results
}

# ── Validation ───────────────────────────────────────────────────────

function Test-WorkflowResult {
    param(
        [string]$OrderNumber,
        [string]$CustomerName,
        [string]$Token
    )

    Write-Step "VALIDATION: Verifying all records and relationships"
    $pass = $true

    # Check customer
    $cust = Find-Customer -CustomerName $CustomerName -Token $Token
    if ($cust) {
        Write-OK "Customer '$CustomerName' exists (ID: $($cust.ct_customersid))"
    } else {
        Write-Fail "Customer '$CustomerName' NOT FOUND"
        $pass = $false
    }

    # Check order
    $filter = [uri]::EscapeDataString("ct_name eq '$OrderNumber'")
    $orders = Invoke-DataverseApi -Token $Token -Path "ct_orderses?`$filter=$filter&`$top=1"
    if ($orders.value -and $orders.value.Count -gt 0) {
        $ord = $orders.value[0]
        Write-OK "Order '$OrderNumber' exists (ID: $($ord.ct_ordersid))"
        if ($ord.ct_customername -eq $CustomerName) {
            Write-OK "Order -> Customer link verified (ct_customername = '$CustomerName')"
        } else {
            Write-Fail "Order -> Customer link MISMATCH (expected '$CustomerName', got '$($ord.ct_customername)')"
            $pass = $false
        }
    } else {
        Write-Fail "Order '$OrderNumber' NOT FOUND"
        $pass = $false
    }

    # Check production job
    $filter = [uri]::EscapeDataString("ct_ordernumber eq '$OrderNumber'")
    $jobs = Invoke-DataverseApi -Token $Token -Path "ct_productionjobses?`$filter=$filter&`$top=1"
    if ($jobs.value -and $jobs.value.Count -gt 0) {
        $job = $jobs.value[0]
        Write-OK "Production Job found for Order '$OrderNumber' (ID: $($job.ct_productionjobsid), Name: $($job.ct_name))"
        Write-OK "ProductionJob -> Order link verified (ct_ordernumber = '$OrderNumber')"
    } else {
        Write-Fail "Production Job for Order '$OrderNumber' NOT FOUND"
        $pass = $false
    }

    # Check tasks
    $filter = [uri]::EscapeDataString("ct_ordernumber eq '$OrderNumber'")
    $tasks = Invoke-DataverseApi -Token $Token -Path "ct_taskses?`$filter=$filter"
    if ($tasks.value -and $tasks.value.Count -ge 4) {
        Write-OK "Tasks found: $($tasks.value.Count) tasks linked to Order '$OrderNumber'"
        foreach ($t in $tasks.value) {
            Write-OK "  Task: $($t.ct_name) (ID: $($t.ct_tasksid))"
        }
    } else {
        $cnt = if ($tasks.value) { $tasks.value.Count } else { 0 }
        Write-Fail "Expected 4 tasks for Order '$OrderNumber', found $cnt"
        $pass = $false
    }

    return $pass
}

# ── Cleanup (for test reruns) ────────────────────────────────────────

function Remove-TestData {
    param(
        [string]$OrderNumber,
        [string]$CustomerName,
        [string]$Token
    )

    Write-Step "Cleaning up test data for '$OrderNumber'..."

    # Delete tasks
    $filter = [uri]::EscapeDataString("ct_ordernumber eq '$OrderNumber'")
    $tasks = Invoke-DataverseApi -Token $Token -Path "ct_taskses?`$filter=$filter"
    if ($tasks.value) {
        foreach ($t in $tasks.value) {
            Invoke-DataverseApi -Token $Token -Method "DELETE" -Path "ct_taskses($($t.ct_tasksid))"
            Write-Info "Deleted task: $($t.ct_name)"
        }
    }

    # Delete production jobs
    $jobs = Invoke-DataverseApi -Token $Token -Path "ct_productionjobses?`$filter=$filter"
    if ($jobs.value) {
        foreach ($j in $jobs.value) {
            Invoke-DataverseApi -Token $Token -Method "DELETE" -Path "ct_productionjobses($($j.ct_productionjobsid))"
            Write-Info "Deleted job: $($j.ct_name)"
        }
    }

    # Delete order
    $filter = [uri]::EscapeDataString("ct_name eq '$OrderNumber'")
    $orders = Invoke-DataverseApi -Token $Token -Path "ct_orderses?`$filter=$filter"
    if ($orders.value) {
        foreach ($o in $orders.value) {
            Invoke-DataverseApi -Token $Token -Method "DELETE" -Path "ct_orderses($($o.ct_ordersid))"
            Write-Info "Deleted order: $($o.ct_name)"
        }
    }

    # Delete customer
    $cust = Find-Customer -CustomerName $CustomerName -Token $Token
    if ($cust) {
        Invoke-DataverseApi -Token $Token -Method "DELETE" -Path "ct_customerses($($cust.ct_customersid))"
        Write-Info "Deleted customer: $CustomerName"
    }

    Write-OK "Cleanup complete"
}

# ── Main Entry Point ─────────────────────────────────────────────────

function Main {
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host " Cheeky OS - Order Automation Workflow" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""

    Write-Step "Authenticating with Dataverse..."
    $token = Get-DataverseToken
    Write-OK "Token acquired (length: $($token.Length))"

    $testOrderNumber = "TEST-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    $testCustomer    = "Test Customer - Automation"
    $testEmail       = "test@cheekyteesllc.com"
    $testPhone       = "555-0100"

    # Clean up any prior test data with this customer name
    try { Remove-TestData -OrderNumber $testOrderNumber -CustomerName $testCustomer -Token $token } catch {}

    Write-Host "`n============================================" -ForegroundColor Yellow
    Write-Host " EXECUTING WORKFLOW" -ForegroundColor Yellow
    Write-Host " Order:    $testOrderNumber" -ForegroundColor Yellow
    Write-Host " Customer: $testCustomer" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow

    $result = Invoke-OrderWorkflow `
        -OrderNumber $testOrderNumber `
        -CustomerName $testCustomer `
        -CustomerEmail $testEmail `
        -CustomerPhone $testPhone `
        -ProductionType 100000000 `
        -Quantity 25 `
        -UnitPrice 12.50 `
        -Token $token

    Write-Host "`n============================================" -ForegroundColor Yellow
    Write-Host " VALIDATION" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow

    $retryCount = 0
    $maxRetries = 1
    $validated = $false

    while (-not $validated -and $retryCount -le $maxRetries) {
        if ($retryCount -gt 0) {
            Write-Host "`n--- RETRY $retryCount of $maxRetries ---" -ForegroundColor Yellow
            Start-Sleep -Seconds 3

            # Re-run workflow for any missing pieces
            if ($result.Status -ne "SUCCESS") {
                Write-Info "Re-attempting workflow..."
                $result = Invoke-OrderWorkflow `
                    -OrderNumber $testOrderNumber `
                    -CustomerName $testCustomer `
                    -CustomerEmail $testEmail `
                    -CustomerPhone $testPhone `
                    -ProductionType 100000000 `
                    -Quantity 25 `
                    -UnitPrice 12.50 `
                    -Token $token
            }
        }

        $validated = Test-WorkflowResult -OrderNumber $testOrderNumber -CustomerName $testCustomer -Token $token
        $retryCount++
    }

    # ── Final Report ─────────────────────────────────────────────────
    Write-Host "`n============================================" -ForegroundColor Yellow
    Write-Host " FINAL REPORT" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow

    Write-Host ""
    Write-Host "  CREATED:" -ForegroundColor White
    if ($result.Customer)      { Write-Host "    Customer:       $($result.Customer.ct_name) ($($result.Customer.ct_customersid))" -ForegroundColor Gray }
    if ($result.Order)         { Write-Host "    Order:          $($result.Order.ct_name) ($($result.Order.ct_ordersid))" -ForegroundColor Gray }
    if ($result.ProductionJob) { Write-Host "    Production Job: $($result.ProductionJob.ct_name) ($($result.ProductionJob.ct_productionjobsid))" -ForegroundColor Gray }
    if ($result.Tasks.Count -gt 0) {
        Write-Host "    Tasks:" -ForegroundColor Gray
        foreach ($t in $result.Tasks) {
            Write-Host "      - $($t.ct_name) ($($t.ct_tasksid))" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "  RELATIONSHIPS:" -ForegroundColor White
    Write-Host "    Order -> Customer:       ct_customername = '$testCustomer'" -ForegroundColor Gray
    Write-Host "    ProductionJob -> Order:  ct_ordernumber  = '$testOrderNumber'" -ForegroundColor Gray
    Write-Host "    Tasks -> Order:          ct_ordernumber  = '$testOrderNumber'" -ForegroundColor Gray

    Write-Host ""
    if ($validated) {
        Write-Host "  TEST RESULT: ALL VALIDATIONS PASSED" -ForegroundColor Green
        Write-Host "  FINAL STATUS: SUCCESS" -ForegroundColor Green
    }
    else {
        Write-Host "  TEST RESULT: VALIDATION FAILED" -ForegroundColor Red
        if ($result.Errors.Count -gt 0) {
            Write-Host "  ERRORS:" -ForegroundColor Red
            foreach ($e in $result.Errors) { Write-Host "    - $e" -ForegroundColor Red }
        }
        Write-Host "  FINAL STATUS: FAILED" -ForegroundColor Red
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow

    return @{ Validated = $validated; Result = $result; OrderNumber = $testOrderNumber; CustomerName = $testCustomer }
}

# Run
$output = Main
exit $(if ($output.Validated) { 0 } else { 1 })
