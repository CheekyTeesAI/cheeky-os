<#
dispatcher.ps1 - Natural language command dispatcher for CheekyTees Business AI.
Accepts plain-English requests and routes them to the correct module with formatted output.
Logs to logs/dispatcher.log and business-audit.jsonl. PowerShell 5.1 compatible.
#>
param([string]$Request = '')

$script:DspRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $script:DspRoot

# -- Dot-source modules safely -----------------------------------------------
$script:ModulesLoaded = @{}
$script:ModuleNames = @('square-api.ps1','orders-engine.ps1','production-manager.ps1','sales-assistant.ps1','email-intake-agent.ps1')

# -- Logging -----------------------------------------------------------------
$script:DspLogDir = Join-Path $script:DspRoot 'logs'
if (-not (Test-Path $script:DspLogDir)) { New-Item -Path $script:DspLogDir -ItemType Directory -Force | Out-Null }
$script:DspLogFile = Join-Path $script:DspLogDir 'dispatcher.log'
$script:AuditFile = Join-Path $script:DspRoot 'business-audit.jsonl'

function Write-DspLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:DspLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Write-DspAudit {
    param([string]$Command, [string]$Module, [string]$Result, [string]$Notes = '')
    $entry = @{ timestamp = (Get-Date -Format o); command = $Command; module = $Module; result = $Result; notes = $Notes }
    try { Add-Content -Path $script:AuditFile -Value (ConvertTo-Json $entry -Compress -Depth 5) -ErrorAction SilentlyContinue } catch { }
}

# Load modules at script scope so functions are accessible
foreach ($modName in $script:ModuleNames) {
    $modPath = Join-Path $script:DspRoot $modName
    if (Test-Path $modPath) {
        try { . $modPath; $script:ModulesLoaded[$modName] = $true }
        catch { Write-DspLog ('Failed to load ' + $modName + ': ' + $_.Exception.Message) 'ERROR'; $script:ModulesLoaded[$modName] = $false }
    } else {
        Write-DspLog ($modName + ' not found - some features unavailable') 'WARN'
        $script:ModulesLoaded[$modName] = $false
    }
}

# -- Output helpers ----------------------------------------------------------
function Write-Header {
    param([string]$Title)
    Write-Host '' -ForegroundColor White
    Write-Host ('  ' + $Title) -ForegroundColor Cyan
    Write-Host ('  ' + ('-' * $Title.Length)) -ForegroundColor DarkGray
}

function Write-Row {
    param([string]$Text)
    Write-Host ('  ' + $Text) -ForegroundColor White
}

function Write-NoResults {
    param([string]$Msg)
    Write-Host ('  ' + $Msg) -ForegroundColor DarkYellow
}

function Write-Footer {
    Write-Host '' -ForegroundColor White
}

# -- Intent patterns ---------------------------------------------------------
$script:IntentMap = @(
    # Production
    @{ Pattern = 'what should we print today';  Intent = 'production-today' }
    @{ Pattern = 'print today';                 Intent = 'production-today' }
    @{ Pattern = 'production today';            Intent = 'production-today' }
    @{ Pattern = 'today.s production';          Intent = 'production-today' }
    @{ Pattern = 'today.s schedule';            Intent = 'production-today' }
    @{ Pattern = 'show today.s production';     Intent = 'production-today' }
    @{ Pattern = 'screen print jobs';           Intent = 'production-today' }
    @{ Pattern = 'show rush';                   Intent = 'production-today' }
    @{ Pattern = 'rush jobs';                   Intent = 'production-today' }
    @{ Pattern = 'what.*due tomorrow';          Intent = 'jobs-tomorrow' }
    @{ Pattern = 'jobs due tomorrow';           Intent = 'jobs-tomorrow' }
    @{ Pattern = 'print tomorrow';              Intent = 'production-tomorrow' }
    @{ Pattern = 'production tomorrow';         Intent = 'production-tomorrow' }
    @{ Pattern = 'tomorrow.s production';       Intent = 'production-tomorrow' }
    @{ Pattern = 'tomorrow.s schedule';         Intent = 'production-tomorrow' }
    @{ Pattern = 'show tomorrow.s production';  Intent = 'production-tomorrow' }
    @{ Pattern = 'production summary';          Intent = 'production-summary' }
    @{ Pattern = 'generate tasks';              Intent = 'task-create' }
    @{ Pattern = 'create tasks';                Intent = 'task-create' }
    # Orders
    @{ Pattern = 'orders? waiting.*production'; Intent = 'orders-production' }
    @{ Pattern = 'orders? in production';       Intent = 'orders-production' }
    @{ Pattern = 'what.*waiting for production';Intent = 'orders-production' }
    @{ Pattern = 'orders? tomorrow';            Intent = 'orders-tomorrow' }
    @{ Pattern = 'orders? today';               Intent = 'orders-today' }
    # Status changes
    @{ Pattern = 'mark.*order.*printing';       Intent = 'mark-printing' }
    @{ Pattern = 'mark.*order.*complete';       Intent = 'mark-complete' }
    @{ Pattern = 'mark.*complete';              Intent = 'mark-complete' }
    @{ Pattern = 'mark.*order.*ready.*pickup';  Intent = 'mark-ready' }
    @{ Pattern = 'mark.*ready for pickup';      Intent = 'mark-ready' }
    # Invoice / Sales
    @{ Pattern = 'send invoice.*new customer';  Intent = 'invoice-create' }
    @{ Pattern = 'send invoice.*customer';      Intent = 'invoice-create' }
    @{ Pattern = 'send invoice';                Intent = 'invoice-send' }
    @{ Pattern = 'create invoice.*order';       Intent = 'invoice-create' }
    @{ Pattern = 'create invoice';              Intent = 'invoice-create' }
    # Quotes
    @{ Pattern = 'create quote.*email';         Intent = 'quote-from-email' }
    @{ Pattern = 'create quote';                Intent = 'quote-create' }
    @{ Pattern = 'new quote';                   Intent = 'quote-create' }
    # Payments
    @{ Pattern = 'did.*pay';                    Intent = 'payment-check' }
    @{ Pattern = 'show.*payment';               Intent = 'payments-today' }
    @{ Pattern = 'today.s payment';             Intent = 'payments-today' }
    # Customer
    @{ Pattern = 'show customer history';       Intent = 'customer-history' }
    @{ Pattern = 'customer history';            Intent = 'customer-history' }
    @{ Pattern = 'customer lookup';             Intent = 'customer-lookup' }
    @{ Pattern = 'look up.*customer';           Intent = 'customer-lookup' }
    # Unpaid / Reminders
    @{ Pattern = 'who has.?n.t paid';           Intent = 'unpaid' }
    @{ Pattern = 'who has not paid';            Intent = 'unpaid' }
    @{ Pattern = 'unpaid invoices';             Intent = 'unpaid' }
    @{ Pattern = 'unpaid';                      Intent = 'unpaid' }
    @{ Pattern = 'send.*reminder';              Intent = 'reminder' }
    @{ Pattern = 'payment reminder';            Intent = 'reminder' }
    # Square sync
    @{ Pattern = 'sync square';                 Intent = 'sync-square' }
    @{ Pattern = 'pull.*square';                Intent = 'sync-square' }
    @{ Pattern = 'import.*square';              Intent = 'sync-square' }
    @{ Pattern = 'create order.*payment';       Intent = 'sync-square' }
    @{ Pattern = 'create order.*square';        Intent = 'sync-square' }
    # Email
    @{ Pattern = 'scan.*inbox';                 Intent = 'email-scan' }
    @{ Pattern = 'scan.*email';                 Intent = 'email-scan' }
    @{ Pattern = 'check.*email';                Intent = 'email-scan' }
)

# -- Intent resolver ---------------------------------------------------------
function Resolve-Intent {
    param([string]$Text)
    $lower = $Text.ToLower().Trim()
    foreach ($entry in $script:IntentMap) {
        if ($lower -match $entry.Pattern) { return $entry.Intent }
    }
    return $null
}

# -- Extract inline parameters -----------------------------------------------
function Get-InlineParam {
    param([string]$Text, [string]$Pattern)
    if ($Text -match $Pattern) { return $Matches[1].Trim() }
    return $null
}

# -- Route handlers ----------------------------------------------------------

function Dispatch-ProductionToday {
    Write-Header 'TODAYS PRODUCTION'
    if (-not $script:ModulesLoaded['production-manager.ps1']) { Write-NoResults 'Production module not available'; Write-Footer; return }
    New-ProductionTasksFromOrders | Out-Null
    Build-DailyPrintSchedule
    Write-Footer
    Write-DspAudit -Command 'production-today' -Module 'production' -Result 'success'
}

function Dispatch-ProductionTomorrow {
    Write-Header 'TOMORROWS PRODUCTION'
    if (-not $script:ModulesLoaded['production-manager.ps1']) { Write-NoResults 'Production module not available'; Write-Footer; return }
    Build-TomorrowPrintSchedule
    Write-Footer
    Write-DspAudit -Command 'production-tomorrow' -Module 'production' -Result 'success'
}

function Dispatch-JobsTomorrow {
    Write-Header 'JOBS DUE TOMORROW'
    $hasOrders = $script:ModulesLoaded['orders-engine.ps1']
    $hasProd = $script:ModulesLoaded['production-manager.ps1']
    $found = $false
    if ($hasOrders) {
        try {
            $orders = Get-CheekyOrdersTomorrow
            if ($orders -and $orders.Count -gt 0) {
                $found = $true
                foreach ($o in $orders) {
                    $due = ''
                    if ($o.cr4b4_duedate) { try { $due = ([datetime]$o.cr4b4_duedate).ToString('ddd h:mm tt') } catch { $due = $o.cr4b4_duedate } }
                    $line = $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_printtype + ' | Due ' + $due
                    Write-Row $line
                }
            }
        } catch { Write-DspLog ('Order fetch error: ' + $_.Exception.Message) 'WARN' }
    }
    if ($hasProd) {
        Write-Host '' -ForegroundColor White
        Build-TomorrowPrintSchedule
    }
    if (-not $found -and -not $hasProd) { Write-NoResults 'No jobs found for tomorrow' }
    Write-Footer
    Write-DspAudit -Command 'jobs-tomorrow' -Module 'orders+production' -Result 'success'
}

function Dispatch-ProductionSummary {
    Write-Header 'PRODUCTION SUMMARY'
    if (-not $script:ModulesLoaded['production-manager.ps1']) { Write-NoResults 'Production module not available'; Write-Footer; return }
    Get-ProductionSummary
    Write-Footer
    Write-DspAudit -Command 'production-summary' -Module 'production' -Result 'success'
}

function Dispatch-TaskCreate {
    Write-Header 'GENERATE PRODUCTION TASKS'
    if (-not $script:ModulesLoaded['production-manager.ps1']) { Write-NoResults 'Production module not available'; Write-Footer; return }
    $count = New-ProductionTasksFromOrders
    Write-Row ('' + $count + ' task(s) generated')
    Write-Footer
    Write-DspAudit -Command 'task-create' -Module 'production' -Result 'success' -Notes ('' + $count + ' tasks')
}

function Dispatch-OrdersProduction {
    Write-Header 'ORDERS IN PRODUCTION PIPELINE'
    if (-not $script:ModulesLoaded['orders-engine.ps1']) { Write-NoResults 'Orders module not available'; Write-Footer; return }
    $statuses = @('Production Ready', 'Printing', 'QC')
    $allOrders = @()
    foreach ($s in $statuses) {
        try { $orders = Get-CheekyOrdersByStatus -Status $s; foreach ($o in $orders) { $allOrders += $o } } catch { }
    }
    if ($allOrders.Count -eq 0) { Write-NoResults 'No orders currently in production pipeline'; Write-Footer; return }
    foreach ($o in $allOrders) {
        $due = ''
        if ($o.cr4b4_duedate) { try { $due = ([datetime]$o.cr4b4_duedate).ToString('ddd h:mm tt') } catch { $due = $o.cr4b4_duedate } }
        $line = $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due ' + $due
        Write-Row $line
    }
    Write-Footer
    Write-DspAudit -Command 'orders-production' -Module 'orders' -Result 'success' -Notes ('' + $allOrders.Count + ' orders')
}

function Dispatch-OrdersToday {
    Write-Header 'ORDERS DUE TODAY'
    if (-not $script:ModulesLoaded['orders-engine.ps1']) { Write-NoResults 'Orders module not available'; Write-Footer; return }
    try { $orders = Get-CheekyOrdersToday } catch { $orders = @() }
    if ($orders.Count -eq 0) { Write-NoResults 'No orders due today'; Write-Footer; return }
    foreach ($o in $orders) {
        $due = ''
        if ($o.cr4b4_duedate) { try { $due = ([datetime]$o.cr4b4_duedate).ToString('h:mm tt') } catch { $due = $o.cr4b4_duedate } }
        $line = $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due ' + $due
        Write-Row $line
    }
    Write-Footer
    Write-DspAudit -Command 'orders-today' -Module 'orders' -Result 'success'
}

function Dispatch-OrdersTomorrow {
    Write-Header 'ORDERS DUE TOMORROW'
    if (-not $script:ModulesLoaded['orders-engine.ps1']) { Write-NoResults 'Orders module not available'; Write-Footer; return }
    try { $orders = Get-CheekyOrdersTomorrow } catch { $orders = @() }
    if ($orders.Count -eq 0) { Write-NoResults 'No orders due tomorrow'; Write-Footer; return }
    foreach ($o in $orders) {
        $due = ''
        if ($o.cr4b4_duedate) { try { $due = ([datetime]$o.cr4b4_duedate).ToString('ddd h:mm tt') } catch { $due = $o.cr4b4_duedate } }
        $line = $o.cr4b4_customername + ' | ' + $o.cr4b4_product + ' | ' + $o.cr4b4_status + ' | Due ' + $due
        Write-Row $line
    }
    Write-Footer
    Write-DspAudit -Command 'orders-tomorrow' -Module 'orders' -Result 'success'
}

function Dispatch-MarkPrinting {
    param([string]$RawInput)
    Write-Header 'MARK ORDER PRINTING'
    $orderId = Get-InlineParam -Text $RawInput -Pattern 'order\s+(\S+)'
    if (-not $orderId) { $orderId = Read-Host '  Order or Task ID' }
    if ([string]::IsNullOrWhiteSpace($orderId)) { Write-NoResults 'No order ID provided'; Write-Footer; return }
    $ok = $false
    if ($script:ModulesLoaded['production-manager.ps1']) { $ok = Update-ProductionTaskStatus -TaskID $orderId -NewStatus 'Printing' }
    if ($script:ModulesLoaded['orders-engine.ps1']) { try { Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Printing' } catch { } }
    if ($ok) { Write-Row 'Status updated to: Printing' } else { Write-Row ('Updated order ' + $orderId + ' to Printing (task may not exist yet)') }
    Write-Footer
    Write-DspAudit -Command 'mark-printing' -Module 'production+orders' -Result 'success' -Notes $orderId
}

function Dispatch-MarkComplete {
    param([string]$RawInput)
    Write-Header 'MARK ORDER COMPLETE'
    $orderId = Get-InlineParam -Text $RawInput -Pattern 'order\s+(\S+)'
    if (-not $orderId) { $orderId = Read-Host '  Order or Task ID' }
    if ([string]::IsNullOrWhiteSpace($orderId)) { Write-NoResults 'No order ID provided'; Write-Footer; return }
    if ($script:ModulesLoaded['sales-assistant.ps1']) {
        Set-OrderComplete -OrderId $orderId
    } else {
        if ($script:ModulesLoaded['production-manager.ps1']) { Update-ProductionTaskStatus -TaskID $orderId -NewStatus 'Completed' | Out-Null }
        if ($script:ModulesLoaded['orders-engine.ps1']) { try { Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Completed' } catch { } }
    }
    Write-Row 'Status updated to: Completed'
    Write-Footer
    Write-DspAudit -Command 'mark-complete' -Module 'sales' -Result 'success' -Notes $orderId
}

function Dispatch-MarkReady {
    param([string]$RawInput)
    Write-Header 'MARK ORDER READY FOR PICKUP'
    $orderId = Get-InlineParam -Text $RawInput -Pattern 'order\s+(\S+)'
    if (-not $orderId) { $orderId = Read-Host '  Order or Task ID' }
    if ([string]::IsNullOrWhiteSpace($orderId)) { Write-NoResults 'No order ID provided'; Write-Footer; return }
    if ($script:ModulesLoaded['sales-assistant.ps1']) {
        Set-OrderReady -OrderId $orderId
    } else {
        if ($script:ModulesLoaded['production-manager.ps1']) { Update-ProductionTaskStatus -TaskID $orderId -NewStatus 'Ready for Pickup' | Out-Null }
        if ($script:ModulesLoaded['orders-engine.ps1']) { try { Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Ready for Pickup' } catch { } }
    }
    Write-Row 'Status updated to: Ready for Pickup'
    Write-Footer
    Write-DspAudit -Command 'mark-ready' -Module 'sales' -Result 'success' -Notes $orderId
}

function Dispatch-InvoiceCreate {
    Write-Header 'CREATE INVOICE'
    if (-not $script:ModulesLoaded['square-api.ps1']) { Write-NoResults 'Square module not available. Check square-config.json.'; Write-Footer; return }
    $orderId = Read-Host '  Square Order ID'
    $custId = Read-Host '  Square Customer ID'
    $title = Read-Host '  Invoice title (default: Cheeky Tees Order)'
    if ([string]::IsNullOrWhiteSpace($title)) { $title = 'Cheeky Tees Order' }
    $inv = Create-SquareInvoice -OrderId $orderId -CustomerId $custId -Title $title
    if ($inv) {
        Write-Row ('Invoice created: ' + $inv.id)
        Write-DspAudit -Command 'invoice-create' -Module 'square' -Result 'success' -Notes $inv.id
    } else {
        Write-NoResults 'Invoice creation failed. Check Square credentials.'
        Write-DspAudit -Command 'invoice-create' -Module 'square' -Result 'failed'
    }
    Write-Footer
}

function Dispatch-InvoiceSend {
    Write-Header 'SEND INVOICE'
    if (-not $script:ModulesLoaded['square-api.ps1']) { Write-NoResults 'Square module not available.'; Write-Footer; return }
    $invId = Read-Host '  Invoice ID'
    $result = Send-SquareInvoice -InvoiceId $invId
    if ($result) { Write-Row ('Invoice sent: ' + $invId) } else { Write-NoResults 'Failed to send invoice.' }
    Write-Footer
    Write-DspAudit -Command 'invoice-send' -Module 'square' -Result $(if ($result) { 'success' } else { 'failed' })
}

function Dispatch-PaymentCheck {
    param([string]$RawInput)
    Write-Header 'PAYMENT STATUS'
    $custName = Get-InlineParam -Text $RawInput -Pattern 'did\s+(.+?)\s+pay'
    if (-not $custName) { $custName = Read-Host '  Customer name' }
    if ([string]::IsNullOrWhiteSpace($custName)) { Write-NoResults 'No customer specified'; Write-Footer; return }
    $found = $false
    if ($script:ModulesLoaded['orders-engine.ps1']) {
        try {
            $orders = Get-CheekyOrdersByCustomer -CustomerName $custName
            if ($orders -and $orders.Count -gt 0) {
                $found = $true
                foreach ($o in $orders) {
                    $paid = if ($o.cr4b4_status -match 'Production Ready|Printing|QC|Ready for Pickup|Completed') { 'Paid' } else { 'Unpaid' }
                    Write-Row ('Customer: ' + $o.cr4b4_customername)
                    Write-Row ('Invoice:  ' + $o.cr4b4_invoiceid)
                    Write-Row ('Status:   ' + $paid + ' (' + $o.cr4b4_status + ')')
                    Write-Host '' -ForegroundColor White
                }
            }
        } catch { }
    }
    if (-not $found) {
        if ($script:ModulesLoaded['square-api.ps1']) {
            Write-Row 'Checking Square payments...'
            try {
                $payments = Get-SquarePayments
                $match = $payments | Where-Object { $_.note -match $custName -or $_.receipt_url -match $custName }
                if ($match) { foreach ($p in $match) { Write-Row ('Payment: ' + $p.id + ' | ' + ($p.amount_money.amount / 100).ToString('C') + ' | ' + $p.status) } }
                else { Write-NoResults ('No payments found matching: ' + $custName) }
            } catch { Write-NoResults 'Could not query Square payments.' }
        } else { Write-NoResults ('No records found for: ' + $custName) }
    }
    Write-Footer
    Write-DspAudit -Command 'payment-check' -Module 'orders+square' -Result 'completed' -Notes $custName
}

function Dispatch-PaymentsToday {
    Write-Header 'TODAYS PAYMENTS'
    if (-not $script:ModulesLoaded['square-api.ps1']) { Write-NoResults 'Square module not available.'; Write-Footer; return }
    try { $payments = Get-SquarePayments } catch { $payments = @() }
    if (-not $payments -or $payments.Count -eq 0) { Write-NoResults 'No payments received today'; Write-Footer; return }
    foreach ($p in $payments) {
        $amt = if ($p.amount_money) { ($p.amount_money.amount / 100).ToString('C') } else { 'N/A' }
        $time = ''
        if ($p.created_at) { try { $time = ([datetime]$p.created_at).ToString('h:mm tt') } catch { $time = $p.created_at } }
        Write-Row ($p.id + ' | ' + $amt + ' | ' + $p.status + ' | ' + $time)
    }
    Write-Footer
    Write-DspAudit -Command 'payments-today' -Module 'square' -Result 'success'
}

function Dispatch-CustomerHistory {
    Write-Header 'CUSTOMER HISTORY'
    if (-not $script:ModulesLoaded['sales-assistant.ps1']) { Write-NoResults 'Sales module not available'; Write-Footer; return }
    Get-CustomerHistory
    Write-Footer
    Write-DspAudit -Command 'customer-history' -Module 'sales' -Result 'success'
}

function Dispatch-CustomerLookup {
    Write-Header 'CUSTOMER LOOKUP'
    if (-not $script:ModulesLoaded['square-api.ps1']) { Write-NoResults 'Square module not available'; Write-Footer; return }
    $custId = Read-Host '  Square Customer ID'
    $cust = Get-SquareCustomer -CustomerId $custId
    if ($cust) {
        Write-Row ('Name:  ' + $cust.given_name + ' ' + $cust.family_name)
        Write-Row ('Email: ' + $cust.email_address)
        Write-Row ('Phone: ' + $cust.phone_number)
    } else { Write-NoResults 'Customer not found' }
    Write-Footer
    Write-DspAudit -Command 'customer-lookup' -Module 'square' -Result $(if ($cust) { 'success' } else { 'not-found' })
}

function Dispatch-Unpaid {
    Write-Header 'UNPAID INVOICES'
    if (-not $script:ModulesLoaded['sales-assistant.ps1']) { Write-NoResults 'Sales module not available'; Write-Footer; return }
    Get-UnpaidInvoices
    Write-Footer
    Write-DspAudit -Command 'unpaid' -Module 'sales' -Result 'success'
}

function Dispatch-Reminder {
    Write-Header 'SEND PAYMENT REMINDER'
    if (-not $script:ModulesLoaded['sales-assistant.ps1']) { Write-NoResults 'Sales module not available'; Write-Footer; return }
    Send-PaymentReminder
    Write-Footer
    Write-DspAudit -Command 'reminder' -Module 'sales' -Result 'success'
}

function Dispatch-SyncSquare {
    Write-Header 'SYNC SQUARE TO DATAVERSE'
    if (-not $script:ModulesLoaded['square-api.ps1']) { Write-NoResults 'Square module not available. Check square-config.json.'; Write-Footer; return }
    $summary = Sync-SquareToDataverse
    if ($summary) {
        Write-Row ('Invoices synced: ' + $summary.Invoices)
        Write-Row ('Orders synced:   ' + $summary.Orders)
        Write-Row ('Payments synced: ' + $summary.Payments)
        if ($summary.Errors -gt 0) { Write-Row ('Errors: ' + $summary.Errors) }
    } else { Write-NoResults 'Sync returned no results.' }
    Write-Footer
    Write-DspAudit -Command 'sync-square' -Module 'square' -Result 'success'
}

function Dispatch-QuoteCreate {
    Write-Header 'CREATE QUOTE'
    if (-not $script:ModulesLoaded['sales-assistant.ps1']) { Write-NoResults 'Sales module not available'; Write-Footer; return }
    $quote = New-CheekyQuoteFromRequest
    if ($quote) { Write-Row ('Quote created: ' + $quote.QuoteID) }
    Write-Footer
    Write-DspAudit -Command 'quote-create' -Module 'sales' -Result 'success'
}

function Dispatch-QuoteFromEmail {
    Write-Header 'SCAN INBOX FOR QUOTES'
    if (-not $script:ModulesLoaded['email-intake-agent.ps1']) { Write-NoResults 'Email intake module not available'; Write-Footer; return }
    $summary = Invoke-EmailScan
    if ($summary) {
        Write-Row ('Emails scanned: ' + $summary.Scanned)
        Write-Row ('Orders created: ' + $summary.Created)
        Write-Row ('Skipped:        ' + $summary.Skipped)
    }
    Write-Footer
    Write-DspAudit -Command 'quote-from-email' -Module 'email-intake' -Result 'success'
}

function Dispatch-EmailScan {
    Write-Header 'EMAIL INBOX SCAN'
    if (-not $script:ModulesLoaded['email-intake-agent.ps1']) { Write-NoResults 'Email intake module not available. Check email-config.json.'; Write-Footer; return }
    $summary = Invoke-EmailScan
    if ($summary) {
        Write-Row ('Emails scanned: ' + $summary.Scanned)
        Write-Row ('Orders created: ' + $summary.Created)
        Write-Row ('Skipped:        ' + $summary.Skipped)
    }
    Write-Footer
    Write-DspAudit -Command 'email-scan' -Module 'email-intake' -Result 'success'
}

# -- Main dispatch -----------------------------------------------------------
function Invoke-Dispatch {
    param([string]$UserRequest)

    if ([string]::IsNullOrWhiteSpace($UserRequest)) {
        $UserRequest = Read-Host 'What would you like to do?'
    }

    Write-DspLog ('Request: ' + $UserRequest)
    $intent = Resolve-Intent -Text $UserRequest

    if (-not $intent) {
        Write-DspLog ('No intent matched for: ' + $UserRequest) 'WARN'
        Write-DspAudit -Command 'unknown' -Module 'dispatcher' -Result 'no-match' -Notes $UserRequest
        Write-Host '' -ForegroundColor White
        Write-Host '  Could not understand that request.' -ForegroundColor Yellow
        Write-Host '  Try saying:' -ForegroundColor Yellow
        Write-Host '' -ForegroundColor White
        Write-Host '    what should we print today' -ForegroundColor White
        Write-Host '    what jobs are due tomorrow' -ForegroundColor White
        Write-Host '    what orders are waiting for production' -ForegroundColor White
        Write-Host '    did Greenville High pay yet' -ForegroundColor White
        Write-Host '    show today''s payments' -ForegroundColor White
        Write-Host '    send invoice to new customer' -ForegroundColor White
        Write-Host '    mark order 1024 complete' -ForegroundColor White
        Write-Host '    mark order ready for pickup' -ForegroundColor White
        Write-Host '    show customer history' -ForegroundColor White
        Write-Host '    who has not paid' -ForegroundColor White
        Write-Host '    create quote' -ForegroundColor White
        Write-Host '    create quote from email' -ForegroundColor White
        Write-Host '    scan inbox' -ForegroundColor White
        Write-Host '' -ForegroundColor White
        return
    }

    Write-DspLog ('Intent: ' + $intent)

    switch ($intent) {
        'production-today'    { Dispatch-ProductionToday }
        'production-tomorrow' { Dispatch-ProductionTomorrow }
        'jobs-tomorrow'       { Dispatch-JobsTomorrow }
        'production-summary'  { Dispatch-ProductionSummary }
        'task-create'         { Dispatch-TaskCreate }
        'orders-production'   { Dispatch-OrdersProduction }
        'orders-today'        { Dispatch-OrdersToday }
        'orders-tomorrow'     { Dispatch-OrdersTomorrow }
        'mark-printing'       { Dispatch-MarkPrinting -RawInput $UserRequest }
        'mark-complete'       { Dispatch-MarkComplete -RawInput $UserRequest }
        'mark-ready'          { Dispatch-MarkReady -RawInput $UserRequest }
        'invoice-create'      { Dispatch-InvoiceCreate }
        'invoice-send'        { Dispatch-InvoiceSend }
        'payment-check'       { Dispatch-PaymentCheck -RawInput $UserRequest }
        'payments-today'      { Dispatch-PaymentsToday }
        'customer-history'    { Dispatch-CustomerHistory }
        'customer-lookup'     { Dispatch-CustomerLookup }
        'unpaid'              { Dispatch-Unpaid }
        'reminder'            { Dispatch-Reminder }
        'sync-square'         { Dispatch-SyncSquare }
        'quote-create'        { Dispatch-QuoteCreate }
        'quote-from-email'    { Dispatch-QuoteFromEmail }
        'email-scan'          { Dispatch-EmailScan }
        default {
            Write-DspLog ('Unhandled intent: ' + $intent) 'WARN'
            Write-NoResults ('Recognized intent "' + $intent + '" but no handler exists yet.')
        }
    }
}

# -- Execute if run directly -------------------------------------------------
if ($Request) {
    Invoke-Dispatch -UserRequest $Request
} else {
    Invoke-Dispatch
}
