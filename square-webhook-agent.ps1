<#
square-webhook-agent.ps1 - Processes Square webhook events for CheekyTees.
Handles: invoice.created, invoice.paid, order.created, payment.updated.
Prevents duplicate processing via a local processed-events log.
Logs to logs/square-webhooks.log. PowerShell 5.1 compatible.
#>

param([string]$EventPayloadPath = '')

$script:WhRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:WhLogDir = Join-Path $script:WhRoot 'logs'
if (-not (Test-Path $script:WhLogDir)) { New-Item -Path $script:WhLogDir -ItemType Directory -Force | Out-Null }
$script:WhLogFile = Join-Path $script:WhLogDir 'square-webhooks.log'
$script:ProcessedFile = Join-Path $script:WhLogDir 'processed-events.log'

# Dot-source dependencies (graceful if missing)
$sqPath = Join-Path $script:WhRoot 'square-api.ps1'
$oePath = Join-Path $script:WhRoot 'orders-engine.ps1'
$pmPath = Join-Path $script:WhRoot 'production-manager.ps1'
if (Test-Path $sqPath) { . $sqPath }
if (Test-Path $oePath) { . $oePath }
if (Test-Path $pmPath) { . $pmPath }

function Write-WhLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:WhLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Test-AlreadyProcessed {
    param([string]$EventId)
    if (-not (Test-Path $script:ProcessedFile)) { return $false }
    $content = Get-Content -Path $script:ProcessedFile -ErrorAction SilentlyContinue
    return ($content -contains $EventId)
}

function Mark-Processed {
    param([string]$EventId)
    Add-Content -Path $script:ProcessedFile -Value $EventId -ErrorAction SilentlyContinue
}

function Process-WebhookEvent {
    param([PSCustomObject]$Event)
    if (-not $Event -or -not $Event.type) { Write-WhLog 'Invalid event payload' 'ERROR'; return }

    $eventId = if ($Event.event_id) { $Event.event_id } else { [guid]::NewGuid().ToString() }
    $eventType = $Event.type

    Write-WhLog ('Received event: ' + $eventType + ' id=' + $eventId)

    if (Test-AlreadyProcessed -EventId $eventId) {
        Write-WhLog ('Duplicate event skipped: ' + $eventId) 'WARN'
        return
    }

    switch ($eventType) {
        'invoice.created' {
            Write-WhLog 'Processing invoice.created'
            $inv = $Event.data.object.invoice
            if ($inv) {
                $existing = @()
                try { $existing = Get-CheekyOrdersByInvoiceId -InvoiceId $inv.id } catch { }
                if ($existing.Count -gt 0) {
                    Write-WhLog ('Order already exists for invoice ' + $inv.id + ', skipping') 'WARN'
                } else {
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
                    Create-CheekyOrder -CustomerName $custName -CustomerEmail $custEmail -InvoiceID $inv.id -SquareOrderID $sqOrderId -Product 'From Invoice' -Status 'Awaiting Payment' -Notes ('Square invoice ' + $inv.id)
                    Write-WhLog ('Order created from invoice ' + $inv.id) 'SUCCESS'
                }
            }
        }
        'invoice.paid' {
            Write-WhLog 'Processing invoice.paid'
            $inv = $Event.data.object.invoice
            if ($inv) {
                $orders = @()
                try { $orders = Get-CheekyOrdersByInvoiceId -InvoiceId $inv.id } catch { }
                if ($orders.Count -gt 0) {
                    $orderId = $orders[0].cr4b4_cheekyordersid
                    Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Production Ready'
                    Write-WhLog ('Order ' + $orderId + ' updated to Production Ready') 'SUCCESS'
                    try {
                        $taskCount = New-ProductionTasksFromOrders
                        Write-WhLog ('Generated ' + $taskCount + ' production task(s) after payment') 'SUCCESS'
                    } catch {
                        Write-WhLog ('Production task generation failed: ' + $_.Exception.Message) 'WARN'
                    }
                } else {
                    Write-WhLog ('No order found for invoice ' + $inv.id + ', creating new order as Production Ready') 'WARN'
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
                    Create-CheekyOrder -CustomerName $custName -CustomerEmail $custEmail -InvoiceID $inv.id -SquareOrderID $sqOrderId -Product 'From Invoice' -Status 'Production Ready' -Notes ('Paid invoice ' + $inv.id)
                    Write-WhLog ('Order created as Production Ready from paid invoice ' + $inv.id) 'SUCCESS'
                    try { New-ProductionTasksFromOrders | Out-Null } catch { }
                }
            }
        }
        'order.created' {
            Write-WhLog 'Processing order.created'
            $sqOrderId = ''
            if ($Event.data -and $Event.data.object) {
                if ($Event.data.object.order_created -and $Event.data.object.order_created.order_id) {
                    $sqOrderId = $Event.data.object.order_created.order_id
                } elseif ($Event.data.id) {
                    $sqOrderId = $Event.data.id
                }
            }
            if ($sqOrderId) {
                Write-WhLog ('Square order ID: ' + $sqOrderId)
                $existing = @()
                try { $existing = Get-CheekyOrdersBySquareOrderId -SquareOrderID $sqOrderId } catch { }
                if ($existing.Count -gt 0) {
                    Write-WhLog ('Order already exists for Square order ' + $sqOrderId + ', skipping') 'WARN'
                } else {
                    $orderDetail = $null
                    try {
                        $cfg = Get-SquareConfig
                        if ($cfg) {
                            $batchBody = @{ order_ids = @($sqOrderId) }
                            $orderDetail = Invoke-SquareApi -Method 'POST' -Endpoint '/v2/orders/batch-retrieve' -Body $batchBody
                        }
                    } catch { Write-WhLog ('Could not fetch order details: ' + $_.Exception.Message) 'WARN' }
                    $custName = ''
                    $product = 'From Square Order'
                    $qty = 1
                    $notes = 'Square order ' + $sqOrderId
                    if ($orderDetail -and $orderDetail.orders -and $orderDetail.orders.Count -gt 0) {
                        $od = $orderDetail.orders[0]
                        if ($od.line_items -and $od.line_items.Count -gt 0) {
                            $product = ($od.line_items | ForEach-Object { $_.name }) -join ', '
                            $qty = 0
                            foreach ($li in $od.line_items) { try { $qty += [int]$li.quantity } catch { $qty++ } }
                        }
                        if ($od.fulfillments -and $od.fulfillments.Count -gt 0) {
                            $ff = $od.fulfillments[0]
                            if ($ff.pickup_details -and $ff.pickup_details.recipient -and $ff.pickup_details.recipient.display_name) {
                                $custName = $ff.pickup_details.recipient.display_name
                            }
                        }
                    }
                    Create-CheekyOrder -CustomerName $custName -SquareOrderID $sqOrderId -Product $product -Quantity $qty -Status 'Intake' -Notes $notes
                    Write-WhLog ('Order created from Square order ' + $sqOrderId) 'SUCCESS'
                }
            } else {
                Write-WhLog 'order.created event missing order ID' 'WARN'
            }
        }
        'payment.updated' {
            Write-WhLog 'Processing payment.updated'
            $payment = $null
            if ($Event.data -and $Event.data.object -and $Event.data.object.payment) {
                $payment = $Event.data.object.payment
            }
            if ($payment) {
                $paymentId = $payment.id
                $payStatus = $payment.status
                $sqOrderId = $payment.order_id
                Write-WhLog ('Payment ' + $paymentId + ' status=' + $payStatus + ' order=' + $sqOrderId)
                if ($sqOrderId) {
                    $orders = @()
                    try { $orders = Get-CheekyOrdersBySquareOrderId -SquareOrderID $sqOrderId } catch { }
                    if ($orders.Count -gt 0) {
                        $orderId = $orders[0].cr4b4_cheekyordersid
                        Update-CheekyOrderPayment -OrderId $orderId -PaymentID $paymentId
                        Write-WhLog ('Order ' + $orderId + ' payment updated to ' + $paymentId) 'SUCCESS'
                        if ($payStatus -eq 'COMPLETED') {
                            $currentStatus = $orders[0].cr4b4_status
                            if ($currentStatus -eq 'Awaiting Payment' -or $currentStatus -eq 'Intake') {
                                Update-CheekyOrderStatus -OrderId $orderId -NewStatus 'Production Ready'
                                Write-WhLog ('Order ' + $orderId + ' promoted to Production Ready after payment') 'SUCCESS'
                                try { New-ProductionTasksFromOrders | Out-Null } catch { }
                            }
                        }
                    } else {
                        Write-WhLog ('No matching order found for Square order ' + $sqOrderId) 'WARN'
                    }
                } else {
                    Write-WhLog 'payment.updated event has no order_id' 'WARN'
                }
            } else {
                Write-WhLog 'payment.updated event missing payment data' 'WARN'
            }
        }
        default {
            Write-WhLog ('Unhandled event type: ' + $eventType) 'WARN'
        }
    }

    Mark-Processed -EventId $eventId
    Write-WhLog ('Event processed: ' + $eventId)
}

# Entry point: load event from file path argument or stdin
if ($EventPayloadPath -and (Test-Path $EventPayloadPath)) {
    Write-WhLog ('Loading event from file: ' + $EventPayloadPath)
    try {
        $payload = Get-Content -Path $EventPayloadPath -Raw | ConvertFrom-Json
        Process-WebhookEvent -Event $payload
    } catch {
        Write-WhLog ('Failed to parse event payload: ' + $_.Exception.Message) 'ERROR'
    }
} else {
    Write-WhLog 'No event payload path provided. Use: square-webhook-agent.ps1 -EventPayloadPath <path>' 'WARN'
}
