<#
orders-engine.ps1 - Dataverse order management for CheekyTees.
Uses PAC CLI data commands against the CheekyOrders table.
Logs to logs/orders.log. PowerShell 5.1 compatible.
#>

$script:OeRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:OeLogDir = Join-Path $script:OeRoot 'logs'
if (-not (Test-Path $script:OeLogDir)) { New-Item -Path $script:OeLogDir -ItemType Directory -Force | Out-Null }
$script:OeLogFile = Join-Path $script:OeLogDir 'orders.log'
$script:OeTable = 'cr4b4_cheekyorders'

function Write-OeLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:OeLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line -ForegroundColor Green }
    }
}

function Get-DvHeaders {
    if (-not $env:ENV_URL) { Write-OeLog 'ENV_URL not set' 'ERROR'; return $null }
    # Use pac to get an access token for Dataverse Web API
    try {
        $tokenOut = pac auth token --environment $env:ENV_URL 2>&1
        $token = ($tokenOut | Select-String -Pattern '^[A-Za-z0-9\-_\.]+$' | Select-Object -First 1).ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($token)) {
            # Fallback: token may be the entire output on a single line
            $token = ($tokenOut -join '').Trim()
        }
        return @{
            'Authorization' = 'Bearer ' + $token
            'Content-Type' = 'application/json'
            'OData-MaxVersion' = '4.0'
            'OData-Version' = '4.0'
            'Prefer' = 'return=representation'
        }
    } catch {
        Write-OeLog ('Failed to get Dataverse token: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Invoke-DvApi {
    param([string]$Method = 'GET', [string]$Endpoint, [object]$Body = $null)
    $headers = Get-DvHeaders
    if (-not $headers) { return $null }
    $uri = $env:ENV_URL.TrimEnd('/') + '/api/data/v9.2' + $Endpoint
    Write-OeLog ($Method + ' ' + $uri)
    try {
        $params = @{ Uri = $uri; Method = $Method; Headers = $headers; ErrorAction = 'Stop' }
        if ($Body) { $params['Body'] = (ConvertTo-Json $Body -Depth 10) }
        return (Invoke-RestMethod @params)
    } catch {
        Write-OeLog ('Dataverse API error: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Create-CheekyOrder {
    param(
        [string]$CustomerName,
        [string]$CustomerEmail,
        [string]$InvoiceID = '',
        [string]$SquareOrderID = '',
        [string]$PaymentID = '',
        [string]$Product,
        [int]$Quantity = 1,
        [string]$PrintType = 'DTF',
        [string]$DueDate = '',
        [string]$Status = 'Intake',
        [string]$Notes = ''
    )
    if (-not $DueDate) { $DueDate = (Get-Date).AddDays(5).ToString('yyyy-MM-dd') }
    $body = @{
        cr4b4_customername = $CustomerName
        cr4b4_customeremail = $CustomerEmail
        cr4b4_invoiceid = $InvoiceID
        cr4b4_squareorderid = $SquareOrderID
        cr4b4_paymentid = $PaymentID
        cr4b4_product = $Product
        cr4b4_quantity = $Quantity
        cr4b4_printtype = $PrintType
        cr4b4_duedate = $DueDate
        cr4b4_status = $Status
        cr4b4_notes = $Notes
        cr4b4_createddate = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    Write-OeLog ('Creating order for ' + $CustomerName + ' - ' + $Product)
    $result = Invoke-DvApi -Method 'POST' -Endpoint ('/' + $script:OeTable) -Body $body
    if ($result) { Write-OeLog ('Order created: ' + $result.cr4b4_cheekyordersid) 'SUCCESS' }
    return $result
}

function Get-CheekyOrdersToday {
    $todayStart = (Get-Date).Date.ToString('yyyy-MM-dd')
    $tomorrowStart = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
    $filter = "cr4b4_duedate ge $todayStart and cr4b4_duedate lt $tomorrowStart"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter + '&$orderby=cr4b4_duedate asc')
    if ($result -and $result.value) {
        Write-OeLog ('Found ' + $result.value.Count + ' orders due today')
        return $result.value
    }
    Write-OeLog 'No orders due today'
    return @()
}

function Get-CheekyOrdersTomorrow {
    $tomorrowStart = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
    $dayAfter = (Get-Date).Date.AddDays(2).ToString('yyyy-MM-dd')
    $filter = "cr4b4_duedate ge $tomorrowStart and cr4b4_duedate lt $dayAfter"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter + '&$orderby=cr4b4_duedate asc')
    if ($result -and $result.value) {
        Write-OeLog ('Found ' + $result.value.Count + ' orders due tomorrow')
        return $result.value
    }
    Write-OeLog 'No orders due tomorrow'
    return @()
}

function Get-CheekyOrdersByCustomer {
    param([string]$CustomerName)
    $filter = "contains(cr4b4_customername,'" + $CustomerName + "')"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter + '&$orderby=cr4b4_createddate desc')
    if ($result -and $result.value) {
        Write-OeLog ('Found ' + $result.value.Count + ' orders for ' + $CustomerName)
        return $result.value
    }
    Write-OeLog ('No orders found for ' + $CustomerName)
    return @()
}

function Update-CheekyOrderStatus {
    param([string]$OrderId, [string]$NewStatus)
    if ([string]::IsNullOrWhiteSpace($OrderId)) { Write-OeLog 'OrderId required' 'ERROR'; return $null }
    $validStatuses = @('Intake', 'Awaiting Payment', 'Production Ready', 'Printing', 'QC', 'Ready for Pickup', 'Completed')
    if ($NewStatus -notin $validStatuses) { Write-OeLog ('Invalid status: ' + $NewStatus + '. Valid: ' + ($validStatuses -join ', ')) 'ERROR'; return $null }
    $body = @{ cr4b4_status = $NewStatus }
    Write-OeLog ('Updating order ' + $OrderId + ' to ' + $NewStatus)
    $result = Invoke-DvApi -Method 'PATCH' -Endpoint ('/' + $script:OeTable + '(' + $OrderId + ')') -Body $body
    if ($result) { Write-OeLog 'Order updated' 'SUCCESS' }
    return $result
}

function Get-CheekyOrdersByStatus {
    param([string]$Status)
    if ([string]::IsNullOrWhiteSpace($Status)) { Write-OeLog 'Status required' 'ERROR'; return @() }
    $filter = "cr4b4_status eq '" + $Status + "'"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter + '&$orderby=cr4b4_duedate asc')
    if ($result -and $result.value) {
        Write-OeLog ('Found ' + $result.value.Count + ' orders with status ' + $Status)
        return $result.value
    }
    Write-OeLog ('No orders with status ' + $Status)
    return @()
}

function Get-CheekyOrdersByInvoiceId {
    param([string]$InvoiceId)
    if ([string]::IsNullOrWhiteSpace($InvoiceId)) { Write-OeLog 'InvoiceId required' 'ERROR'; return @() }
    $filter = "cr4b4_invoiceid eq '" + $InvoiceId + "'"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter)
    if ($result -and $result.value) { return $result.value }
    return @()
}

function Get-CheekyOrdersBySquareOrderId {
    param([string]$SquareOrderID)
    if ([string]::IsNullOrWhiteSpace($SquareOrderID)) { Write-OeLog 'SquareOrderID required' 'ERROR'; return @() }
    $filter = "cr4b4_squareorderid eq '" + $SquareOrderID + "'"
    $result = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + '?$filter=' + $filter)
    if ($result -and $result.value) { return $result.value }
    return @()
}

function Update-CheekyOrderPayment {
    param([string]$OrderId, [string]$PaymentID)
    if ([string]::IsNullOrWhiteSpace($OrderId)) { Write-OeLog 'OrderId required' 'ERROR'; return $null }
    $body = @{ cr4b4_paymentid = $PaymentID }
    Write-OeLog ('Updating order ' + $OrderId + ' payment to ' + $PaymentID)
    return (Invoke-DvApi -Method 'PATCH' -Endpoint ('/' + $script:OeTable + '(' + $OrderId + ')') -Body $body)
}
