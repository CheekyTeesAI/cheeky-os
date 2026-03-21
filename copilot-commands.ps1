<#
copilot-commands.ps1 - Natural language command translator for Cheeky CLI.
Maps conversational commands to orchestrator actions.
Logs to logs/cheeky-commands.log. PowerShell 5.1 compatible.
#>

param([string]$Input = '')

$script:CcRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:CcLogDir = Join-Path $script:CcRoot 'logs'
if (-not (Test-Path $script:CcLogDir)) { New-Item -Path $script:CcLogDir -ItemType Directory -Force | Out-Null }
$script:CcLogFile = Join-Path $script:CcLogDir 'cheeky-commands.log'

function Write-CcLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:CcLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    Write-Host $line -ForegroundColor Green
}

$commandMap = @(
    # Production
    @{ Pattern = 'what should we print today';  Command = 'production today' }
    @{ Pattern = 'print today';                 Command = 'production today' }
    @{ Pattern = 'production today';            Command = 'production today' }
    @{ Pattern = 'today.s production';          Command = 'production today' }
    @{ Pattern = 'today.s schedule';            Command = 'production today' }
    @{ Pattern = 'screen print jobs';           Command = 'production today' }
    @{ Pattern = 'show today.s production';     Command = 'production today' }
    @{ Pattern = 'print tomorrow';              Command = 'production tomorrow' }
    @{ Pattern = 'production tomorrow';         Command = 'production tomorrow' }
    @{ Pattern = 'tomorrow.s production';       Command = 'production tomorrow' }
    @{ Pattern = 'tomorrow.s schedule';         Command = 'production tomorrow' }
    @{ Pattern = 'jobs due tomorrow';           Command = 'production tomorrow' }
    @{ Pattern = 'show tomorrow.s production';  Command = 'production tomorrow' }
    @{ Pattern = 'what.*due tomorrow';          Command = 'production tomorrow' }
    @{ Pattern = 'production summary';          Command = 'production summary' }
    @{ Pattern = 'show rush';                   Command = 'production today' }
    @{ Pattern = 'rush jobs';                   Command = 'production today' }
    @{ Pattern = 'generate tasks';              Command = 'task create' }
    @{ Pattern = 'create tasks';                Command = 'task create' }
    # Task status
    @{ Pattern = 'mark.*order.*printing';       Command = 'task update' }
    @{ Pattern = 'mark.*order.*complete';        Command = 'order-complete' }
    @{ Pattern = 'mark.*order.*ready.*pickup';   Command = 'order-ready' }
    @{ Pattern = 'mark.*ready for pickup';       Command = 'order-ready' }
    @{ Pattern = 'mark.*complete';               Command = 'order-complete' }
    @{ Pattern = 'update task';                 Command = 'task update' }
    # Square sync
    @{ Pattern = 'sync square';                 Command = 'sync square' }
    @{ Pattern = 'pull.*square';                Command = 'sync square' }
    @{ Pattern = 'import.*square';              Command = 'sync square' }
    @{ Pattern = 'create order.*payment';       Command = 'sync square' }
    @{ Pattern = 'create order.*square';        Command = 'sync square' }
    # Orders
    @{ Pattern = 'orders? waiting.*production'; Command = 'orders production' }
    @{ Pattern = 'orders? in production';       Command = 'orders production' }
    @{ Pattern = 'what.*waiting for production';Command = 'orders production' }
    @{ Pattern = 'orders? tomorrow';            Command = 'orders tomorrow' }
    @{ Pattern = 'orders? today';               Command = 'orders today' }
    @{ Pattern = 'create order';                Command = 'orders create' }
    # Invoice / Sales
    @{ Pattern = 'send invoice.*new customer';  Command = 'invoice create' }
    @{ Pattern = 'send invoice.*customer';      Command = 'invoice create' }
    @{ Pattern = 'send invoice';                Command = 'invoice send' }
    @{ Pattern = 'create invoice';              Command = 'invoice create' }
    # Quotes
    @{ Pattern = 'create quote.*email';         Command = 'email-scan' }
    @{ Pattern = 'create quote';                Command = 'quote create' }
    @{ Pattern = 'new quote';                   Command = 'quote create' }
    @{ Pattern = 'quote';                       Command = 'quote create' }
    # Payments
    @{ Pattern = 'did.*pay';                    Command = 'payments today' }
    @{ Pattern = 'show.*payment';               Command = 'payments today' }
    @{ Pattern = 'today.s payment';             Command = 'payments today' }
    @{ Pattern = 'payment';                     Command = 'payments today' }
    # Customer
    @{ Pattern = 'show customer history';       Command = 'customer history' }
    @{ Pattern = 'customer history';            Command = 'customer history' }
    @{ Pattern = 'customer lookup';             Command = 'customer lookup' }
    @{ Pattern = 'look up.*customer';           Command = 'customer lookup' }
    # Unpaid / Reminders
    @{ Pattern = 'who hasn.t paid';             Command = 'unpaid' }
    @{ Pattern = 'unpaid invoices';             Command = 'unpaid' }
    @{ Pattern = 'unpaid';                      Command = 'unpaid' }
    @{ Pattern = 'send.*reminder';              Command = 'reminder' }
    @{ Pattern = 'payment reminder';            Command = 'reminder' }
    # Email
    @{ Pattern = 'scan.*inbox';                 Command = 'email-scan' }
    @{ Pattern = 'scan.*email';                 Command = 'email-scan' }
    @{ Pattern = 'check.*email';                Command = 'email-scan' }
    @{ Pattern = 'email.scan';                  Command = 'email-scan' }
    # DevOps
    @{ Pattern = 'deploy';                      Command = 'deploy' }
    @{ Pattern = 'doctor';                      Command = 'doctor' }
    @{ Pattern = 'fix';                         Command = 'fix' }
    @{ Pattern = 'autopilot';                   Command = 'autopilot' }
)

if ([string]::IsNullOrWhiteSpace($Input)) {
    $Input = Read-Host 'What would you like to do?'
}

Write-CcLog ('Input: ' + $Input)
$matched = $null
foreach ($entry in $commandMap) {
    if ($Input -match $entry.Pattern) {
        $matched = $entry.Command
        break
    }
}

if ($matched) {
    Write-CcLog ('Mapped to: cheeky ' + $matched)
    $orchestrator = Join-Path $script:CcRoot 'cheeky-orchestrator.ps1'
    $parts = $matched -split ' '
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $orchestrator @parts
} else {
    Write-CcLog ('No mapping found for: ' + $Input) 'WARN'
    Write-Host 'Could not understand that command. Try:' -ForegroundColor Yellow
    Write-Host '' -ForegroundColor White
    Write-Host '  Production:' -ForegroundColor Cyan
    Write-Host '    what should we print today' -ForegroundColor White
    Write-Host '    what jobs are due tomorrow' -ForegroundColor White
    Write-Host '    show rush jobs' -ForegroundColor White
    Write-Host '    show tomorrow''s production' -ForegroundColor White
    Write-Host '' -ForegroundColor White
    Write-Host '  Orders:' -ForegroundColor Cyan
    Write-Host '    what orders are waiting for production' -ForegroundColor White
    Write-Host '    mark order as printing' -ForegroundColor White
    Write-Host '    mark order complete' -ForegroundColor White
    Write-Host '    mark order ready for pickup' -ForegroundColor White
    Write-Host '    create order from Square payment' -ForegroundColor White
    Write-Host '' -ForegroundColor White
    Write-Host '  Sales:' -ForegroundColor Cyan
    Write-Host '    send invoice to new customer' -ForegroundColor White
    Write-Host '    send invoice to customer' -ForegroundColor White
    Write-Host '    create quote' -ForegroundColor White
    Write-Host '    show customer history' -ForegroundColor White
    Write-Host '    who hasn''t paid' -ForegroundColor White
    Write-Host '    send payment reminder' -ForegroundColor White
    Write-Host '' -ForegroundColor White
    Write-Host '  Data:' -ForegroundColor Cyan
    Write-Host '    sync square data' -ForegroundColor White
    Write-Host '    did customer pay yet' -ForegroundColor White
    Write-Host '    show today''s payments' -ForegroundColor White
    Write-Host '    scan inbox' -ForegroundColor White
    Write-Host '    create quote from email' -ForegroundColor White
    Write-Host '' -ForegroundColor White
}
