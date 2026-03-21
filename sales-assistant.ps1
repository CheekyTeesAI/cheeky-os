<#
sales-assistant.ps1 - Sales operations layer for CheekyTees.
Quote creation, invoice management, customer history, payment reminders.
Logs to logs/sales.log. PowerShell 5.1 compatible.
#>

$script:SaRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SaLogDir = Join-Path $script:SaRoot 'logs'
if (-not (Test-Path $script:SaLogDir)) { New-Item -Path $script:SaLogDir -ItemType Directory -Force | Out-Null }
$script:SaLogFile = Join-Path $script:SaLogDir 'sales.log'
$script:AuditFile = Join-Path $script:SaRoot 'business-audit.jsonl'
$script:QuoteStorePath = Join-Path $script:SaRoot 'quotes.json'

# Dot-source dependencies
$sqPath = Join-Path $script:SaRoot 'square-api.ps1'
$oePath = Join-Path $script:SaRoot 'orders-engine.ps1'
if (Test-Path $sqPath) { . $sqPath }
if (Test-Path $oePath) { . $oePath }

function Write-SaLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:SaLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Write-SaAudit {
    param([string]$Command, [string]$Result, [string]$Notes = '')
    $entry = @{
        timestamp = (Get-Date -Format o)
        command   = $Command
        module    = 'sales-assistant'
        result    = $Result
        notes     = $Notes
    }
    try {
        $json = ConvertTo-Json $entry -Compress -Depth 5
        Add-Content -Path $script:AuditFile -Value $json -ErrorAction SilentlyContinue
    } catch { }
}

# -- Quote Store ------------------------------------------------------------
function Get-QuoteStore {
    if (-not (Test-Path $script:QuoteStorePath)) { return @() }
    try {
        $raw = Get-Content -Path $script:QuoteStorePath -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        $parsed = ConvertFrom-Json $raw
        if ($parsed -is [array]) { return $parsed } else { return @($parsed) }
    } catch { return @() }
}

function Save-QuoteStore {
    param([array]$Quotes)
    try {
        $json = ConvertTo-Json $Quotes -Depth 10
        Set-Content -Path $script:QuoteStorePath -Value $json -Force
    } catch {
        Write-SaLog ('Failed to save quote store: ' + $_.Exception.Message) 'ERROR'
    }
}

# -- Quote Functions --------------------------------------------------------
function New-CheekyQuoteFromRequest {
    param(
        [string]$CustomerName,
        [string]$CustomerEmail = '',
        [string]$Product,
        [int]$Quantity = 1,
        [string]$PrintType = 'DTF',
        [string]$Color = '',
        [decimal]$UnitPrice = 0,
        [string]$DueDate = '',
        [string]$Notes = ''
    )
    Write-SaLog '=== NEW QUOTE ==='
    if ([string]::IsNullOrWhiteSpace($CustomerName)) { $CustomerName = Read-Host 'Customer name' }
    if ([string]::IsNullOrWhiteSpace($Product)) { $Product = Read-Host 'Product (e.g. Tees, Hoodies)' }
    if ($Quantity -le 0) {
        $qtyInput = Read-Host 'Quantity'
        try { $Quantity = [int]$qtyInput } catch { $Quantity = 1 }
    }
    if ($UnitPrice -le 0) {
        $priceInput = Read-Host 'Unit price ($)'
        try { $UnitPrice = [decimal]$priceInput } catch { $UnitPrice = 0 }
    }
    if ([string]::IsNullOrWhiteSpace($DueDate)) { $DueDate = (Get-Date).AddDays(7).ToString('yyyy-MM-dd') }

    $totalPrice = $UnitPrice * $Quantity

    $quote = [PSCustomObject]@{
        QuoteID       = [guid]::NewGuid().ToString()
        CustomerName  = $CustomerName
        CustomerEmail = $CustomerEmail
        Product       = $Product
        Quantity      = $Quantity
        PrintType     = $PrintType
        Color         = $Color
        UnitPrice     = $UnitPrice
        TotalPrice    = $totalPrice
        DueDate       = $DueDate
        Status        = 'Draft'
        Notes         = $Notes
        CreatedDate   = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssZ')
    }

    $quotes = Get-QuoteStore
    $quotes += $quote
    Save-QuoteStore -Quotes $quotes

    Write-SaLog ('Quote created: ' + $quote.QuoteID + ' | ' + $CustomerName + ' | ' + $Product + ' x' + $Quantity + ' | $' + $totalPrice) 'SUCCESS'
    Write-Host '' -ForegroundColor White
    Write-Host ('  Quote: ' + $quote.QuoteID) -ForegroundColor Cyan
    Write-Host ('  Customer: ' + $CustomerName) -ForegroundColor White
    Write-Host ('  Product: ' + $Product + ' x' + $Quantity) -ForegroundColor White
    Write-Host ('  Print: ' + $PrintType) -ForegroundColor White
    Write-Host ('  Total: $' + $totalPrice) -ForegroundColor Green
    Write-Host ('  Due: ' + $DueDate) -ForegroundColor White
    Write-Host '' -ForegroundColor White

    Write-SaAudit -Command 'quote-create' -Result 'success' -Notes ($CustomerName + ' | $' + $totalPrice)
    return $quote
}

# -- Invoice from Order -----------------------------------------------------
function Create-CheekyInvoiceFromOrder {
    param([string]$OrderId, [string]$CustomerId = '')
    Write-SaLog '=== CREATE INVOICE FROM ORDER ==='

    if ([string]::IsNullOrWhiteSpace($OrderId)) { $OrderId = Read-Host 'Order ID (Dataverse or Square)' }
    if ([string]::IsNullOrWhiteSpace($CustomerId)) { $CustomerId = Read-Host 'Square Customer ID' }

    $cfg = Get-SquareConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.squareAccessToken)) {
        Write-SaLog 'Square not configured. Cannot create invoice. Add credentials to square-config.json.' 'WARN'
        Write-SaAudit -Command 'invoice-from-order' -Result 'skipped' -Notes 'No Square config'
        return $null
    }

    $inv = Create-SquareInvoice -OrderId $OrderId -CustomerId $CustomerId
    if ($inv) {
        Write-SaLog ('Invoice created: ' + $inv.id) 'SUCCESS'
        Write-SaAudit -Command 'invoice-from-order' -Result 'success' -Notes $inv.id
        return $inv
    } else {
        Write-SaLog 'Invoice creation failed' 'ERROR'
        Write-SaAudit -Command 'invoice-from-order' -Result 'failed'
        return $null
    }
}

# -- Send Invoice -----------------------------------------------------------
function Send-CheekyInvoice {
    param([string]$InvoiceId = '', [int]$Version = 0)
    Write-SaLog '=== SEND INVOICE ==='
    if ([string]::IsNullOrWhiteSpace($InvoiceId)) { $InvoiceId = Read-Host 'Invoice ID' }

    $cfg = Get-SquareConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.squareAccessToken)) {
        Write-SaLog 'Square not configured. Add credentials to square-config.json.' 'WARN'
        Write-SaAudit -Command 'invoice-send' -Result 'skipped' -Notes 'No Square config'
        return $null
    }

    $result = Send-SquareInvoice -InvoiceId $InvoiceId -Version $Version
    if ($result) {
        Write-SaLog ('Invoice sent: ' + $InvoiceId) 'SUCCESS'
        Write-SaAudit -Command 'invoice-send' -Result 'success' -Notes $InvoiceId
    } else {
        Write-SaLog 'Invoice send failed' 'ERROR'
        Write-SaAudit -Command 'invoice-send' -Result 'failed' -Notes $InvoiceId
    }
    return $result
}

# -- Customer History -------------------------------------------------------
function Get-CustomerHistory {
    param([string]$CustomerName = '')
    Write-SaLog '=== CUSTOMER HISTORY ==='
    if ([string]::IsNullOrWhiteSpace($CustomerName)) { $CustomerName = Read-Host 'Customer name' }

    $orders = Get-CheekyOrdersByCustomer -CustomerName $CustomerName
    if ($orders.Count -eq 0) {
        Write-SaLog ('No orders found for ' + $CustomerName) 'WARN'
        return
    }

    Write-Host '' -ForegroundColor White
    Write-Host ('  Customer History: ' + $CustomerName) -ForegroundColor Cyan
    Write-Host ('  ' + ('-' * 40)) -ForegroundColor DarkGray
    foreach ($o in $orders) {
        $line = '  ' + $o.cr4b4_createddate + ' | ' + $o.cr4b4_product + ' x' + $o.cr4b4_quantity + ' | ' + $o.cr4b4_status
        $color = switch ($o.cr4b4_status) {
            'Completed'        { 'Green' }
            'Awaiting Payment' { 'Yellow' }
            'Production Ready' { 'Cyan' }
            default            { 'White' }
        }
        Write-Host $line -ForegroundColor $color
    }
    Write-Host '' -ForegroundColor White
    Write-SaAudit -Command 'customer-history' -Result 'success' -Notes ($CustomerName + ' | ' + $orders.Count + ' orders')
}

# -- Unpaid Invoices --------------------------------------------------------
function Get-UnpaidInvoices {
    Write-SaLog '=== UNPAID INVOICES ==='

    $cfg = Get-SquareConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.squareAccessToken)) {
        Write-SaLog 'Square not configured. Checking Dataverse orders with Awaiting Payment status.' 'WARN'
        $orders = Get-CheekyOrdersByStatus -Status 'Awaiting Payment'
        if ($orders.Count -eq 0) { Write-SaLog 'No unpaid orders found'; return }
        Write-Host '' -ForegroundColor White
        Write-Host '  Unpaid Orders (from Dataverse)' -ForegroundColor Cyan
        foreach ($o in $orders) {
            $line = '  ' + $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | Due: ' + $o.cr4b4_duedate + ' | Invoice: ' + $o.cr4b4_invoiceid
            Write-Host $line -ForegroundColor Yellow
        }
        Write-Host '' -ForegroundColor White
        return
    }

    $invoices = Get-SquareInvoices
    $unpaid = @()
    foreach ($inv in $invoices) {
        if ($inv.status -eq 'UNPAID' -or $inv.status -eq 'SENT' -or $inv.status -eq 'OVERDUE' -or $inv.status -eq 'SCHEDULED') {
            $unpaid += $inv
        }
    }
    if ($unpaid.Count -eq 0) { Write-SaLog 'No unpaid invoices found' 'SUCCESS'; return }

    Write-Host '' -ForegroundColor White
    Write-Host '  Unpaid Invoices' -ForegroundColor Cyan
    foreach ($inv in $unpaid) {
        $custName = ''
        if ($inv.primary_recipient -and $inv.primary_recipient.customer_id) {
            $cust = Get-SquareCustomer -CustomerId $inv.primary_recipient.customer_id
            if ($cust) { $custName = ($cust.given_name + ' ' + $cust.family_name).Trim() }
        }
        $amt = 'N/A'
        if ($inv.payment_requests -and $inv.payment_requests.Count -gt 0 -and $inv.payment_requests[0].computed_amount_money) {
            $amt = '$' + ($inv.payment_requests[0].computed_amount_money.amount / 100)
        }
        $line = '  ' + $inv.id + ' | ' + $custName + ' | ' + $amt + ' | ' + $inv.status
        $color = if ($inv.status -eq 'OVERDUE') { 'Red' } else { 'Yellow' }
        Write-Host $line -ForegroundColor $color
    }
    Write-Host '' -ForegroundColor White
    Write-SaAudit -Command 'unpaid-invoices' -Result 'success' -Notes ('' + $unpaid.Count + ' unpaid')
}

# -- Payment Reminder -------------------------------------------------------
function Send-PaymentReminder {
    param([string]$InvoiceId = '')
    Write-SaLog '=== PAYMENT REMINDER ==='
    if ([string]::IsNullOrWhiteSpace($InvoiceId)) { $InvoiceId = Read-Host 'Invoice ID to remind' }

    $cfg = Get-SquareConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.squareAccessToken)) {
        Write-SaLog 'Square not configured. Cannot send reminder.' 'WARN'
        Write-SaAudit -Command 'payment-reminder' -Result 'skipped' -Notes 'No Square config'
        return
    }

    # Re-publish the invoice (Square sends reminder on re-publish)
    $result = Invoke-SquareApi -Method 'GET' -Endpoint ('/v2/invoices/' + $InvoiceId)
    if ($result -and $result.invoice) {
        $version = $result.invoice.version
        $body = @{ idempotency_key = [guid]::NewGuid().ToString(); version = $version }
        $pubResult = Invoke-SquareApi -Method 'POST' -Endpoint ('/v2/invoices/' + $InvoiceId + '/publish') -Body $body
        if ($pubResult) {
            Write-SaLog ('Payment reminder sent for invoice ' + $InvoiceId) 'SUCCESS'
            Write-SaAudit -Command 'payment-reminder' -Result 'success' -Notes $InvoiceId
        } else {
            Write-SaLog ('Failed to send reminder for ' + $InvoiceId) 'ERROR'
            Write-SaAudit -Command 'payment-reminder' -Result 'failed' -Notes $InvoiceId
        }
    } else {
        Write-SaLog ('Invoice not found: ' + $InvoiceId) 'WARN'
    }
}

# -- Quick Order Complete / Ready -------------------------------------------
function Set-OrderComplete {
    param([string]$OrderId = '')
    Write-SaLog '=== ORDER COMPLETE ==='
    if ([string]::IsNullOrWhiteSpace($OrderId)) { $OrderId = Read-Host 'Order or Task ID' }
    Update-CheekyOrderStatus -OrderId $OrderId -NewStatus 'Completed'
    try { Update-ProductionTaskStatus -TaskID $OrderId -NewStatus 'Completed' } catch { }
    Write-SaLog ('Order ' + $OrderId + ' marked Completed') 'SUCCESS'
    Write-SaAudit -Command 'order-complete' -Result 'success' -Notes $OrderId
}

function Set-OrderReady {
    param([string]$OrderId = '')
    Write-SaLog '=== ORDER READY FOR PICKUP ==='
    if ([string]::IsNullOrWhiteSpace($OrderId)) { $OrderId = Read-Host 'Order or Task ID' }
    Update-CheekyOrderStatus -OrderId $OrderId -NewStatus 'Ready for Pickup'
    try { Update-ProductionTaskStatus -TaskID $OrderId -NewStatus 'Ready for Pickup' } catch { }
    Write-SaLog ('Order ' + $OrderId + ' marked Ready for Pickup') 'SUCCESS'
    Write-SaAudit -Command 'order-ready' -Result 'success' -Notes $OrderId
}
