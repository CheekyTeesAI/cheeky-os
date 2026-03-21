<#
business-rules.ps1 - Cheeky OS Business Rule Engine.
Enforces production type routing, minimums, and margin gate.
PowerShell 5.1 compatible.
#>

$script:BrRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:BrLogDir = Join-Path $script:BrRoot 'logs'
if (-not (Test-Path $script:BrLogDir)) { New-Item -Path $script:BrLogDir -ItemType Directory -Force | Out-Null }
$script:BrLogFile = Join-Path $script:BrLogDir 'business-rules.log'
$script:AuditFile = Join-Path $script:BrRoot 'business-audit.jsonl'

function Write-BrLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:BrLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Write-BrAudit {
    param([string]$Command, [string]$Module, [string]$Result, [string]$Notes = '')
    $entry = @{ timestamp = (Get-Date -Format o); command = $Command; module = $Module; result = $Result; notes = $Notes }
    try { Add-Content -Path $script:AuditFile -Value (ConvertTo-Json $entry -Compress -Depth 5) -ErrorAction SilentlyContinue } catch { }
}

# ============================================================================
# PRODUCTION TYPE ROUTING
# ============================================================================

<#
Routing rules from locked spec:
  100% polyester      -> DTF
  50/50 blend         -> DTG or DTF (prefer DTF for cost)
  Triblend            -> DTG
  Short deadlines     -> prefer in-house production
  Large jobs          -> allow vendor routing
#>

function Get-RecommendedProductionType {
    param(
        [string]$Material,
        [int]$Quantity = 1,
        [int]$DaysUntilDue = 14,
        [string]$PreferredType = ''
    )

    $result = @{
        ProductionType = 'DTG'
        Reason = ''
        AllowVendor = $false
    }

    # Material-based routing
    switch -Regex ($Material.ToLower()) {
        '100.*poly'       { $result.ProductionType = 'DTF';    $result.Reason = '100% polyester requires DTF' }
        '50.50|50\/50'    { $result.ProductionType = 'DTF';    $result.Reason = '50/50 blend - DTF preferred for durability' }
        'triblend|tri.blend' { $result.ProductionType = 'DTG'; $result.Reason = 'Triblend works best with DTG' }
        '100.*cotton'     {
            if ($Quantity -ge 24) {
                $result.ProductionType = 'Screen Print'
                $result.Reason = 'Cotton + quantity >= 24 = Screen Print'
            } else {
                $result.ProductionType = 'DTG'
                $result.Reason = 'Cotton + small quantity = DTG'
            }
        }
        default {
            if ($PreferredType) { $result.ProductionType = $PreferredType; $result.Reason = 'Using preferred type' }
            else { $result.Reason = 'Default routing to DTG' }
        }
    }

    # Large job vendor routing
    if ($Quantity -ge 100) {
        $result.AllowVendor = $true
        if ($DaysUntilDue -gt 10) {
            $result.Reason = $result.Reason + ' | Large order - vendor eligible'
        }
    }

    # Short deadline override - prefer in-house
    if ($DaysUntilDue -le 3) {
        if ($result.ProductionType -eq 'Vendor') {
            $result.ProductionType = 'DTG'
            $result.Reason = 'Rush order - switched from vendor to in-house DTG'
        }
        $result.AllowVendor = $false
        $result.Reason = $result.Reason + ' | Rush: in-house only'
    }

    Write-BrLog ('Route: ' + $Material + ' x' + $Quantity + ' (' + $DaysUntilDue + ' days) -> ' + $result.ProductionType + ' | ' + $result.Reason)
    return $result
}

# ============================================================================
# MINIMUM QUANTITY ENFORCEMENT
# ============================================================================

<#
Minimums from locked spec:
  DTG / DTF / Embroidery = 12 pieces
  Screen Print           = 24 pieces
#>

$script:Minimums = @{
    'DTG'          = 12
    'DTF'          = 12
    'Embroidery'   = 12
    'Screen Print' = 24
    'Vendor'       = 1
}

function Test-MinimumQuantity {
    param(
        [string]$ProductionType,
        [int]$Quantity
    )

    $min = $script:Minimums[$ProductionType]
    if (-not $min) { $min = 1 }

    $result = @{
        Passed = ($Quantity -ge $min)
        Minimum = $min
        Quantity = $Quantity
        ProductionType = $ProductionType
    }

    if ($result.Passed) {
        Write-BrLog ('Minimum check PASSED: ' + $ProductionType + ' requires ' + $min + ', got ' + $Quantity) 'SUCCESS'
    } else {
        Write-BrLog ('Minimum check FAILED: ' + $ProductionType + ' requires ' + $min + ', got ' + $Quantity) 'WARN'
    }

    return $result
}

# ============================================================================
# MARGIN GATE (45%)
# ============================================================================

<#
From locked spec:
  Minimum margin = 45%
  If margin < 45% then:
    Flag order
    Prevent production task creation
    Send alert to owner
#>

function Test-MarginGate {
    param(
        [decimal]$TotalAmount,
        [decimal]$TotalCost,
        [string]$OrderId = '',
        [string]$CustomerName = ''
    )

    if ($TotalAmount -le 0) {
        Write-BrLog 'Margin gate: TotalAmount is zero or negative' 'WARN'
        return @{ Passed = $false; MarginPercent = 0; Reason = 'No revenue amount set'; Flagged = $true }
    }

    $margin = (($TotalAmount - $TotalCost) / $TotalAmount) * 100
    $margin = [math]::Round($margin, 2)
    $passed = ($margin -ge 45)

    $result = @{
        Passed = $passed
        MarginPercent = $margin
        TotalAmount = $TotalAmount
        TotalCost = $TotalCost
        Flagged = (-not $passed)
        Reason = ''
    }

    if ($passed) {
        $result.Reason = 'Margin ' + $margin + '% meets 45% minimum'
        Write-BrLog ('Margin gate PASSED: ' + $margin + '% for order ' + $OrderId) 'SUCCESS'
    } else {
        $result.Reason = 'Margin ' + $margin + '% is below 45% minimum - ORDER FLAGGED'
        Write-BrLog ('MARGIN GATE FAILED: ' + $margin + '% for order ' + $OrderId + ' (' + $CustomerName + ')') 'ERROR'
        Write-BrAudit -Command 'margin-gate-fail' -Module 'business-rules' -Result 'flagged' -Notes ('Order: ' + $OrderId + ' Margin: ' + $margin + '% Customer: ' + $CustomerName)
    }

    return $result
}

function Get-MarginFromOrder {
    param([decimal]$Revenue, [decimal]$Cost)
    if ($Revenue -le 0) { return 0 }
    return [math]::Round((($Revenue - $Cost) / $Revenue) * 100, 2)
}

# ============================================================================
# ORDER STAGE ENGINE
# ============================================================================

<#
Stages from locked spec:
  Intake -> Quote Sent -> Deposit Paid -> Production Ready -> Printing -> Completed

Production board columns:
  Production Ready -> Printing -> QC -> Ready for Pickup
#>

$script:StageOrder = @('Intake', 'Quote Sent', 'Deposit Paid', 'Production Ready', 'Printing', 'Completed')
$script:BoardColumns = @('Production Ready', 'Printing', 'QC', 'Ready for Pickup')

function Get-NextStage {
    param([string]$CurrentStage)
    $idx = $script:StageOrder.IndexOf($CurrentStage)
    if ($idx -lt 0) { Write-BrLog ('Unknown stage: ' + $CurrentStage) 'WARN'; return $null }
    if ($idx -ge ($script:StageOrder.Count - 1)) { return $null }
    return $script:StageOrder[$idx + 1]
}

function Test-StageTransition {
    param([string]$FromStage, [string]$ToStage)
    $fromIdx = $script:StageOrder.IndexOf($FromStage)
    $toIdx = $script:StageOrder.IndexOf($ToStage)
    if ($fromIdx -lt 0 -or $toIdx -lt 0) { return $false }
    # Allow forward transitions only (or same stage)
    return ($toIdx -ge $fromIdx)
}

function Get-TasksForProductionJob {
    <#
    Returns the standard task sequence for a production job.
    From locked spec: Art Prep, Garment Order, Printing, Quality Check, Customer Notification
    #>
    param(
        [string]$OrderId,
        [string]$ProductionJobId,
        [string]$DueDate
    )

    $tasks = @(
        @{ TaskType = 'Art Prep';               TaskOrder = 1; Status = 'Pending'; Priority = 'Normal'; AssignedTo = 'Art Department' }
        @{ TaskType = 'Garment Order';          TaskOrder = 2; Status = 'Pending'; Priority = 'Normal'; AssignedTo = 'Purchasing' }
        @{ TaskType = 'Printing';               TaskOrder = 3; Status = 'Pending'; Priority = 'Normal'; AssignedTo = 'Production Queue' }
        @{ TaskType = 'Quality Check';          TaskOrder = 4; Status = 'Pending'; Priority = 'Normal'; AssignedTo = 'QC Team' }
        @{ TaskType = 'Customer Notification';  TaskOrder = 5; Status = 'Pending'; Priority = 'Normal'; AssignedTo = 'Sales' }
    )

    # Elevate priority for rush orders
    if ($DueDate) {
        try {
            $due = [datetime]$DueDate
            $hoursLeft = ($due - (Get-Date)).TotalHours
            if ($hoursLeft -le 24) {
                foreach ($t in $tasks) { $t.Priority = 'Rush' }
            } elseif ($hoursLeft -le 48) {
                foreach ($t in $tasks) { $t.Priority = 'High' }
            }
        } catch { }
    }

    return $tasks
}

# ============================================================================
# COMBINED VALIDATION: Can This Order Enter Production?
# ============================================================================

function Test-OrderForProduction {
    param(
        [string]$ProductionType,
        [int]$Quantity,
        [decimal]$TotalAmount = 0,
        [decimal]$TotalCost = 0,
        [string]$OrderId = '',
        [string]$CustomerName = ''
    )

    Write-BrLog ('=== PRODUCTION VALIDATION: Order ' + $OrderId + ' ===')
    $issues = @()

    # 1. Minimum quantity check
    $minCheck = Test-MinimumQuantity -ProductionType $ProductionType -Quantity $Quantity
    if (-not $minCheck.Passed) {
        $issues += ('Quantity ' + $Quantity + ' below minimum ' + $minCheck.Minimum + ' for ' + $ProductionType)
    }

    # 2. Margin gate (only if amounts provided)
    $marginCheck = @{ Passed = $true; MarginPercent = 100 }
    if ($TotalAmount -gt 0 -and $TotalCost -gt 0) {
        $marginCheck = Test-MarginGate -TotalAmount $TotalAmount -TotalCost $TotalCost -OrderId $OrderId -CustomerName $CustomerName
        if (-not $marginCheck.Passed) {
            $issues += ('Margin ' + $marginCheck.MarginPercent + '% below 45% minimum')
        }
    }

    $canProceed = ($issues.Count -eq 0)

    if ($canProceed) {
        Write-BrLog ('Order ' + $OrderId + ' CLEARED for production') 'SUCCESS'
    } else {
        Write-BrLog ('Order ' + $OrderId + ' BLOCKED from production: ' + ($issues -join '; ')) 'ERROR'
    }

    Write-BrAudit -Command 'production-validation' -Module 'business-rules' -Result $(if ($canProceed) { 'cleared' } else { 'blocked' }) -Notes ($issues -join '; ')

    return @{
        CanProceed = $canProceed
        Issues = $issues
        MinimumCheck = $minCheck
        MarginCheck = $marginCheck
    }
}
