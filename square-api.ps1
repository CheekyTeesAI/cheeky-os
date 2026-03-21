<#
square-api.ps1 - Square REST API module for CheekyTees.
Reads credentials from square-config.json. Logs to logs/square-api.log.
PowerShell 5.1 compatible.
#>

$script:SqRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SqLogDir = Join-Path $script:SqRoot 'logs'
if (-not (Test-Path $script:SqLogDir)) { New-Item -Path $script:SqLogDir -ItemType Directory -Force | Out-Null }
$script:SqLogFile = Join-Path $script:SqLogDir 'square-api.log'

function Write-SqLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:SqLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        default { Write-Host $line -ForegroundColor Green }
    }
}

function Get-SquareConfig {
    $cfgPath = Join-Path $script:SqRoot 'square-config.json'
    if (-not (Test-Path $cfgPath)) { Write-SqLog 'square-config.json not found' 'ERROR'; return $null }
    try { return (Get-Content -Path $cfgPath -Raw | ConvertFrom-Json) } catch { Write-SqLog ('Failed to parse square-config.json: ' + $_.Exception.Message) 'ERROR'; return $null }
}

function Invoke-SquareApi {
    param([string]$Method = 'GET', [string]$Endpoint, [object]$Body = $null)
    $cfg = Get-SquareConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.squareAccessToken)) {
        Write-SqLog 'Square access token not configured in square-config.json' 'ERROR'
        return $null
    }
    $baseUrl = if ($cfg.environment -eq 'sandbox') { 'https://connect.squareupsandbox.com' } else { 'https://connect.squareup.com' }
    $uri = $baseUrl + $Endpoint
    $headers = @{ 'Authorization' = ('Bearer ' + $cfg.squareAccessToken); 'Content-Type' = 'application/json'; 'Square-Version' = '2024-01-18' }
    Write-SqLog ($Method + ' ' + $uri)
    try {
        $params = @{ Uri = $uri; Method = $Method; Headers = $headers; ErrorAction = 'Stop' }
        if ($Body) { $params['Body'] = (ConvertTo-Json $Body -Depth 10) }
        $resp = Invoke-RestMethod @params
        return $resp
    } catch {
        Write-SqLog ('Square API error: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Get-SquareOrdersToday {
    $cfg = Get-SquareConfig
    if (-not $cfg) { return $null }
    $todayStart = (Get-Date).Date.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z')
    $todayEnd = (Get-Date).Date.AddDays(1).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z')
    $body = @{
        location_ids = @($cfg.locationId)
        query = @{
            filter = @{
                date_time_filter = @{
                    created_at = @{ start_at = $todayStart; end_at = $todayEnd }
                }
            }
        }
    }
    $result = Invoke-SquareApi -Method 'POST' -Endpoint '/v2/orders/search' -Body $body
    if ($result -and $result.orders) {
        Write-SqLog ('Found ' + $result.orders.Count + ' orders today')
        return $result.orders
    }
    Write-SqLog 'No orders found today'
    return @()
}

function Get-SquareCustomer {
    param([string]$CustomerId)
    if ([string]::IsNullOrWhiteSpace($CustomerId)) { Write-SqLog 'CustomerId required' 'ERROR'; return $null }
    $result = Invoke-SquareApi -Method 'GET' -Endpoint ('/v2/customers/' + $CustomerId)
    if ($result -and $result.customer) { return $result.customer }
    return $null
}

function Create-SquareInvoice {
    param(
        [string]$OrderId,
        [string]$CustomerId,
        [string]$Title = 'Cheeky Tees Order',
        [string]$DueDate
    )
    $cfg = Get-SquareConfig
    if (-not $cfg) { return $null }
    if (-not $DueDate) { $DueDate = (Get-Date).AddDays(7).ToString('yyyy-MM-dd') }
    $body = @{
        invoice = @{
            location_id = $cfg.locationId
            order_id = $OrderId
            primary_recipient = @{ customer_id = $CustomerId }
            payment_requests = @(@{
                request_type = 'BALANCE'
                due_date = $DueDate
            })
            delivery_method = 'EMAIL'
            title = $Title
            accepted_payment_methods = @{ card = $true; bank_account = $false }
        }
        idempotency_key = [guid]::NewGuid().ToString()
    }
    $result = Invoke-SquareApi -Method 'POST' -Endpoint '/v2/invoices' -Body $body
    if ($result -and $result.invoice) {
        Write-SqLog ('Invoice created: ' + $result.invoice.id) 'SUCCESS'
        return $result.invoice
    }
    return $null
}

function Send-SquareInvoice {
    param([string]$InvoiceId, [int]$Version = 0)
    if ([string]::IsNullOrWhiteSpace($InvoiceId)) { Write-SqLog 'InvoiceId required' 'ERROR'; return $null }
    $body = @{ idempotency_key = [guid]::NewGuid().ToString(); version = $Version }
    $result = Invoke-SquareApi -Method 'POST' -Endpoint ('/v2/invoices/' + $InvoiceId + '/publish') -Body $body
    if ($result -and $result.invoice) {
        Write-SqLog ('Invoice sent: ' + $InvoiceId) 'SUCCESS'
        return $result.invoice
    }
    return $null
}

function Get-SquarePayments {
    param([string]$BeginTime, [string]$EndTime)
    if (-not $BeginTime) { $BeginTime = (Get-Date).Date.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z') }
    if (-not $EndTime) { $EndTime = (Get-Date).Date.AddDays(1).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.000Z') }
    $cfg = Get-SquareConfig
    if (-not $cfg) { return @() }
    $ep = '/v2/payments?begin_time=' + $BeginTime + '&end_time=' + $EndTime + '&location_id=' + $cfg.locationId
    $result = Invoke-SquareApi -Method 'GET' -Endpoint $ep
    if ($result -and $result.payments) {
        Write-SqLog ('Found ' + $result.payments.Count + ' payments')
        return $result.payments
    }
    Write-SqLog 'No payments found'
    return @()
}

function Get-SquareInvoices {
    $cfg = Get-SquareConfig
    if (-not $cfg) { return @() }
    $body = @{ location_id = $cfg.locationId }
    $result = Invoke-SquareApi -Method 'POST' -Endpoint '/v2/invoices/search' -Body $body
    if ($result -and $result.invoices) {
        Write-SqLog ('Found ' + $result.invoices.Count + ' invoices')
        return $result.invoices
    }
    Write-SqLog 'No invoices found'
    return @()
}

function Get-SquareOrderByInvoice {
    param([string]$InvoiceId)
    if ([string]::IsNullOrWhiteSpace($InvoiceId)) { Write-SqLog 'InvoiceId required' 'ERROR'; return $null }
    $result = Invoke-SquareApi -Method 'GET' -Endpoint ('/v2/invoices/' + $InvoiceId)
    if ($result -and $result.invoice -and $result.invoice.order_id) {
        $orderId = $result.invoice.order_id
        $cfg = Get-SquareConfig
        $orderBody = @{ order_ids = @($orderId) }
        $orderResult = Invoke-SquareApi -Method 'POST' -Endpoint ('/v2/orders/batch-retrieve') -Body $orderBody
        if ($orderResult -and $orderResult.orders) { return $orderResult.orders[0] }
    }
    return $null
}

function Sync-SquareToDataverse {
    <#
    Pulls recent Square invoices, orders, and payments.
    Creates or updates CheekyOrders in Dataverse for anything new.
    Returns a summary hashtable.
    #>
    Write-SqLog '=== SYNC SQUARE START ==='
    $summary = @{ Invoices = 0; Orders = 0; Payments = 0; Errors = 0 }

    # --- Invoices ---
    try {
        $invoices = Get-SquareInvoices
        foreach ($inv in $invoices) {
            $invId = $inv.id
            $existing = @()
            try { $existing = Get-CheekyOrdersByInvoiceId -InvoiceId $invId } catch { }
            if ($existing.Count -gt 0) { continue }
            $custName = ''
            $custEmail = ''
            if ($inv.primary_recipient -and $inv.primary_recipient.customer_id) {
                $cust = Get-SquareCustomer -CustomerId $inv.primary_recipient.customer_id
                if ($cust) {
                    $custName = ($cust.given_name + ' ' + $cust.family_name).Trim()
                    $custEmail = $cust.email_address
                }
            }
            $sqOrderId = ''
            if ($inv.order_id) { $sqOrderId = $inv.order_id }
            $status = 'Intake'
            if ($inv.status -eq 'PAID') { $status = 'Production Ready' }
            elseif ($inv.status -eq 'UNPAID' -or $inv.status -eq 'SENT' -or $inv.status -eq 'SCHEDULED') { $status = 'Awaiting Payment' }
            $dueDate = ''
            if ($inv.payment_requests -and $inv.payment_requests.Count -gt 0 -and $inv.payment_requests[0].due_date) {
                $dueDate = $inv.payment_requests[0].due_date
            }
            Create-CheekyOrder -CustomerName $custName -CustomerEmail $custEmail -InvoiceID $invId -SquareOrderID $sqOrderId -Product 'From Invoice' -DueDate $dueDate -Status $status -Notes ('Synced invoice ' + $invId)
            Write-SqLog ('Synced invoice ' + $invId + ' as ' + $status) 'SUCCESS'
            $summary.Invoices++
        }
    } catch {
        Write-SqLog ('Invoice sync error: ' + $_.Exception.Message) 'ERROR'
        $summary.Errors++
    }

    # --- Orders (today) ---
    try {
        $sqOrders = Get-SquareOrdersToday
        foreach ($o in $sqOrders) {
            $sqOrderId = $o.id
            if (-not $sqOrderId) { continue }
            $existing = @()
            try { $existing = Get-CheekyOrdersBySquareOrderId -SquareOrderID $sqOrderId } catch { }
            if ($existing.Count -gt 0) { continue }
            $custName = ''
            $product = 'From Square Order'
            $qty = 1
            if ($o.line_items -and $o.line_items.Count -gt 0) {
                $product = ($o.line_items | ForEach-Object { $_.name }) -join ', '
                $qty = 0
                foreach ($li in $o.line_items) { try { $qty += [int]$li.quantity } catch { $qty++ } }
            }
            Create-CheekyOrder -CustomerName $custName -SquareOrderID $sqOrderId -Product $product -Quantity $qty -Status 'Intake' -Notes ('Synced order ' + $sqOrderId)
            Write-SqLog ('Synced order ' + $sqOrderId) 'SUCCESS'
            $summary.Orders++
        }
    } catch {
        Write-SqLog ('Order sync error: ' + $_.Exception.Message) 'ERROR'
        $summary.Errors++
    }

    # --- Payments (today) ---
    try {
        $payments = Get-SquarePayments
        foreach ($p in $payments) {
            if (-not $p.order_id) { continue }
            $existing = @()
            try { $existing = Get-CheekyOrdersBySquareOrderId -SquareOrderID $p.order_id } catch { }
            if ($existing.Count -gt 0) {
                $orderId = $existing[0].cr4b4_cheekyordersid
                $currentPay = $existing[0].cr4b4_paymentid
                if ([string]::IsNullOrWhiteSpace($currentPay) -and $p.id) {
                    Update-CheekyOrderPayment -OrderId $orderId -PaymentID $p.id
                    Write-SqLog ('Updated payment on order ' + $orderId) 'SUCCESS'
                    $summary.Payments++
                }
                if ($p.status -eq 'COMPLETED') {
                    $currentStatus = $existing[0].cr4b4_status
                    if ($currentStatus -eq 'Awaiting Payment' -or $currentStatus -eq 'Intake') {
                        Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Production Ready'
                        Write-SqLog ('Promoted order ' + $orderId + ' to Production Ready after sync') 'SUCCESS'
                    }
                }
            }
        }
    } catch {
        Write-SqLog ('Payment sync error: ' + $_.Exception.Message) 'ERROR'
        $summary.Errors++
    }

    # Auto-generate production tasks for any newly Production Ready orders
    try { New-ProductionTasksFromOrders | Out-Null } catch { }

    Write-SqLog ('=== SYNC COMPLETE === Invoices: ' + $summary.Invoices + ' Orders: ' + $summary.Orders + ' Payments: ' + $summary.Payments + ' Errors: ' + $summary.Errors) 'SUCCESS'
    return $summary
}
