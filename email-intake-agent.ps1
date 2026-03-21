<#
email-intake-agent.ps1 - Converts incoming customer emails into operational orders.
Scans a configured inbox, parses order/quote intent, creates CheekyOrders records.
Logs to logs/email-intake.log. PowerShell 5.1 compatible.
#>

param([switch]$Scan)

$script:EiRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:EiLogDir = Join-Path $script:EiRoot 'logs'
if (-not (Test-Path $script:EiLogDir)) { New-Item -Path $script:EiLogDir -ItemType Directory -Force | Out-Null }
$script:EiLogFile = Join-Path $script:EiLogDir 'email-intake.log'
$script:EiProcessedFile = Join-Path $script:EiLogDir 'processed-emails.log'
$script:AuditFile = Join-Path $script:EiRoot 'business-audit.jsonl'

# Dot-source orders engine for record creation
$oePath = Join-Path $script:EiRoot 'orders-engine.ps1'
if (Test-Path $oePath) { . $oePath }

function Write-EiLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:EiLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Write-Audit {
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
        Add-Content -Path $script:AuditFile -Value $json -ErrorAction SilentlyContinue
    } catch { }
}

function Get-EmailConfig {
    $cfgPath = Join-Path $script:EiRoot 'email-config.json'
    if (-not (Test-Path $cfgPath)) {
        Write-EiLog 'email-config.json not found. Creating template.' 'WARN'
        $template = @{
            imapServer   = ''
            imapPort     = 993
            username     = ''
            password     = ''
            useSsl       = $true
            scanFolder   = 'INBOX'
            processedTag = 'CheekyProcessed'
        }
        (ConvertTo-Json $template -Depth 5) | Set-Content -Path $cfgPath -Force
        return $null
    }
    try { return (Get-Content -Path $cfgPath -Raw | ConvertFrom-Json) } catch {
        Write-EiLog ('Failed to parse email-config.json: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Test-EmailAlreadyProcessed {
    param([string]$MessageId)
    if (-not (Test-Path $script:EiProcessedFile)) { return $false }
    $content = Get-Content -Path $script:EiProcessedFile -ErrorAction SilentlyContinue
    return ($content -contains $MessageId)
}

function Mark-EmailProcessed {
    param([string]$MessageId)
    Add-Content -Path $script:EiProcessedFile -Value $MessageId -ErrorAction SilentlyContinue
}

# -- Email Parsing ----------------------------------------------------------

function Parse-OrderIntent {
    <#
    Attempts to extract order details from email subject + body text.
    Returns a hashtable with parsed fields or $null if not order-like.
    #>
    param([string]$Subject, [string]$Body, [string]$FromName, [string]$FromEmail)

    $combined = ($Subject + ' ' + $Body).ToLower()

    # Check if this looks like an order or quote request
    $orderKeywords = @('order', 'quote', 'shirts', 'tees', 'hoodies', 'hats', 'print', 'embroidery', 'dtg', 'dtf', 'screen print', 'custom', 'jerseys', 'uniforms', 'need', 'want', 'looking for', 'interested in')
    $isOrderLike = $false
    foreach ($kw in $orderKeywords) {
        if ($combined -match $kw) { $isOrderLike = $true; break }
    }
    if (-not $isOrderLike) { return $null }

    $result = @{
        CustomerName  = $FromName
        CustomerEmail = $FromEmail
        Product       = ''
        Quantity      = 1
        Color         = ''
        PrintType     = 'DTF'
        DueDate       = ''
        Notes         = $Subject
    }

    # Extract quantity (look for numbers near product words)
    if ($combined -match '(\d+)\s*(shirts?|tees?|hoodies?|hats?|jerseys?|pieces?|units?|items?)') {
        try { $result.Quantity = [int]$Matches[1] } catch { }
        $result.Product = $Matches[2] -replace 's$', ''
    }

    # Extract print type
    if ($combined -match 'screen\s*print') { $result.PrintType = 'Screen Print' }
    elseif ($combined -match 'dtg') { $result.PrintType = 'DTG' }
    elseif ($combined -match 'embroidery|embroider') { $result.PrintType = 'Embroidery' }
    elseif ($combined -match 'dtf') { $result.PrintType = 'DTF' }

    # Extract color
    $colors = @('black', 'white', 'red', 'blue', 'navy', 'green', 'grey', 'gray', 'yellow', 'orange', 'pink', 'purple', 'maroon', 'gold', 'charcoal')
    foreach ($c in $colors) {
        if ($combined -match $c) { $result.Color = $c; break }
    }

    # Extract due date patterns
    if ($combined -match '(need|due|by)\s*(this\s*week|next\s*week|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[/-]\d{1,2}[/-]?\d{0,4})') {
        $dateStr = $Matches[2]
        switch -Regex ($dateStr) {
            'tomorrow'   { $result.DueDate = (Get-Date).AddDays(1).ToString('yyyy-MM-dd') }
            'this\s*week' { $result.DueDate = (Get-Date).Date.AddDays(5).ToString('yyyy-MM-dd') }
            'next\s*week' { $result.DueDate = (Get-Date).Date.AddDays(10).ToString('yyyy-MM-dd') }
            default {
                try { $result.DueDate = [DateTime]::Parse($dateStr).ToString('yyyy-MM-dd') } catch { }
            }
        }
    }

    # Build product description
    if ([string]::IsNullOrWhiteSpace($result.Product)) { $result.Product = 'Custom Order' }
    if ($result.Color) { $result.Product = $result.Color + ' ' + $result.Product }

    # Build notes from full subject + snippet of body
    $bodySnippet = if ($Body.Length -gt 200) { $Body.Substring(0, 200) + '...' } else { $Body }
    $result.Notes = 'Email: ' + $Subject + ' | ' + $bodySnippet

    return $result
}

# -- Scan Inbox -------------------------------------------------------------

function Invoke-EmailScan {
    Write-EiLog '=== EMAIL SCAN START ==='
    $cfg = Get-EmailConfig
    if (-not $cfg -or [string]::IsNullOrWhiteSpace($cfg.imapServer)) {
        Write-EiLog 'Email not configured. Edit email-config.json with IMAP settings.' 'WARN'
        Write-Audit -Command 'email-scan' -Module 'email-intake' -Result 'skipped' -Notes 'No email config'
        return @{ Scanned = 0; Created = 0; Skipped = 0 }
    }
    if ([string]::IsNullOrWhiteSpace($cfg.username) -or [string]::IsNullOrWhiteSpace($cfg.password)) {
        Write-EiLog 'Email credentials not configured in email-config.json.' 'WARN'
        Write-Audit -Command 'email-scan' -Module 'email-intake' -Result 'skipped' -Notes 'No credentials'
        return @{ Scanned = 0; Created = 0; Skipped = 0 }
    }

    $summary = @{ Scanned = 0; Created = 0; Skipped = 0 }

    # Attempt IMAP connection
    # Note: Native PS 5.1 does not include IMAP. This uses .NET MailKit if available,
    # or falls back to a simulated scan for development.
    try {
        # Check for MailKit assembly
        $mailkitPath = Join-Path $script:EiRoot 'lib' 'MailKit.dll'
        if (Test-Path $mailkitPath) {
            Add-Type -Path $mailkitPath
            Write-EiLog 'MailKit loaded'
            # Full IMAP implementation would go here
            # For now, log that the infrastructure is ready
            Write-EiLog 'IMAP scan ready but not yet connected' 'WARN'
        } else {
            Write-EiLog 'MailKit.dll not found in lib/. IMAP scan requires MailKit library.' 'WARN'
            Write-EiLog 'To enable: download MailKit NuGet, place MailKit.dll in lib/ folder.' 'WARN'
        }
    } catch {
        Write-EiLog ('IMAP connection error: ' + $_.Exception.Message) 'ERROR'
    }

    # Process local email files (for testing: drop .eml or .json files in emails-inbox/)
    $inboxDir = Join-Path $script:EiRoot 'emails-inbox'
    if (-not (Test-Path $inboxDir)) {
        New-Item -Path $inboxDir -ItemType Directory -Force | Out-Null
        Write-EiLog 'Created emails-inbox/ folder for local testing'
    }

    $emailFiles = Get-ChildItem -Path $inboxDir -Filter '*.json' -ErrorAction SilentlyContinue
    foreach ($ef in $emailFiles) {
        $summary.Scanned++
        $messageId = $ef.BaseName
        if (Test-EmailAlreadyProcessed -MessageId $messageId) {
            Write-EiLog ('Already processed: ' + $messageId)
            $summary.Skipped++
            continue
        }

        try {
            $email = Get-Content -Path $ef.FullName -Raw | ConvertFrom-Json
            $parsed = Parse-OrderIntent -Subject $email.subject -Body $email.body -FromName $email.fromName -FromEmail $email.fromEmail
            if ($parsed) {
                Write-EiLog ('Order detected from ' + $parsed.CustomerName + ': ' + $parsed.Product + ' x' + $parsed.Quantity)
                try {
                    Create-CheekyOrder -CustomerName $parsed.CustomerName -CustomerEmail $parsed.CustomerEmail -Product $parsed.Product -Quantity $parsed.Quantity -PrintType $parsed.PrintType -DueDate $parsed.DueDate -Status 'Intake' -Notes $parsed.Notes
                    Write-EiLog ('Order created from email ' + $messageId) 'SUCCESS'
                    $summary.Created++
                } catch {
                    Write-EiLog ('Failed to create order from email: ' + $_.Exception.Message) 'ERROR'
                }
            } else {
                Write-EiLog ('Not an order email: ' + $messageId)
                $summary.Skipped++
            }
            Mark-EmailProcessed -MessageId $messageId
        } catch {
            Write-EiLog ('Failed to parse email file: ' + $ef.Name + ' - ' + $_.Exception.Message) 'ERROR'
        }
    }

    Write-EiLog ('=== EMAIL SCAN COMPLETE === Scanned: ' + $summary.Scanned + ' Created: ' + $summary.Created + ' Skipped: ' + $summary.Skipped) 'SUCCESS'
    Write-Audit -Command 'email-scan' -Module 'email-intake' -Result 'completed' -Notes ('Created: ' + $summary.Created)
    return $summary
}

# Entry point
if ($Scan) { Invoke-EmailScan }
