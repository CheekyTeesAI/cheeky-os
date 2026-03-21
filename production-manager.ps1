<#
production-manager.ps1 - AI Production Manager for CheekyTees.
Generates production tasks from orders, builds daily print schedules,
and provides production summary views.
Logs to logs/production.log. PowerShell 5.1 compatible.
#>

$script:PmRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:PmLogDir = Join-Path $script:PmRoot 'logs'
if (-not (Test-Path $script:PmLogDir)) { New-Item -Path $script:PmLogDir -ItemType Directory -Force | Out-Null }
$script:PmLogFile = Join-Path $script:PmLogDir 'production.log'

# In-memory task store persisted to a local JSON file.
# Dataverse integration uses orders-engine.ps1 for source data;
# tasks are managed locally until a dedicated Dataverse table is provisioned.
$script:TaskStorePath = Join-Path $script:PmRoot 'production-tasks.json'

function Write-PmLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:PmLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

# -- Task Store -------------------------------------------------------------
function Get-TaskStore {
    if (-not (Test-Path $script:TaskStorePath)) { return @() }
    try {
        $raw = Get-Content -Path $script:TaskStorePath -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        $parsed = ConvertFrom-Json $raw
        # ConvertFrom-Json may return a single object instead of array
        if ($parsed -is [array]) { return $parsed } else { return @($parsed) }
    } catch {
        Write-PmLog ('Failed to read task store: ' + $_.Exception.Message) 'WARN'
        return @()
    }
}

function Save-TaskStore {
    param([array]$Tasks)
    try {
        $json = ConvertTo-Json $Tasks -Depth 10
        Set-Content -Path $script:TaskStorePath -Value $json -Force
    } catch {
        Write-PmLog ('Failed to save task store: ' + $_.Exception.Message) 'ERROR'
    }
}

# -- Priority ---------------------------------------------------------------
function Resolve-Priority {
    param([string]$DueDate)
    if ([string]::IsNullOrWhiteSpace($DueDate)) { return 'Normal' }
    try {
        $due = [DateTime]::Parse($DueDate)
        $now = Get-Date
        $hoursUntilDue = ($due - $now).TotalHours
        if ($hoursUntilDue -le 24) { return 'Rush' }
        $tomorrowEnd = $now.Date.AddDays(2)
        if ($due -lt $tomorrowEnd) { return 'Due Tomorrow' }
        $weekEnd = $now.Date.AddDays(7)
        if ($due -lt $weekEnd) { return 'Due This Week' }
        return 'Normal'
    } catch { return 'Normal' }
}

function Get-PrioritySortKey {
    param([string]$Priority)
    switch ($Priority) {
        'Rush'          { return 0 }
        'Due Tomorrow'  { return 1 }
        'Due This Week' { return 2 }
        'Normal'        { return 3 }
        default         { return 9 }
    }
}

# -- Normalise Print Type ---------------------------------------------------
function Resolve-PrintTypeGroup {
    param([string]$PrintType)
    if ([string]::IsNullOrWhiteSpace($PrintType)) { return 'Other' }
    $pt = $PrintType.Trim()
    switch -Regex ($pt) {
        'Screen'      { return 'Screen Print' }
        'DTG'         { return 'DTG' }
        'Embroidery'  { return 'Embroidery' }
        'DTF'         { return 'DTF' }
        default       { return 'Other' }
    }
}

$script:PrintTypeOrder = @{
    'Screen Print' = 0
    'DTG'          = 1
    'Embroidery'   = 2
    'DTF'          = 3
    'Other'        = 4
}

# -- Task Generation --------------------------------------------------------
function New-ProductionTasksFromOrders {
    <#
    Reads CheekyOrders with Status = 'Production Ready' via orders-engine.
    Creates production tasks for any order that does not already have one.
    Falls back to local task store if Dataverse is unavailable.
    #>
    Write-PmLog '=== GENERATING PRODUCTION TASKS ==='
    $tasks = Get-TaskStore
    $existingOrderIds = @()
    foreach ($t in $tasks) { if ($t.OrderID) { $existingOrderIds += $t.OrderID } }

    # Try Dataverse first
    $orders = @()
    try {
        $dvResult = Invoke-DvApi -Method 'GET' -Endpoint ('/' + $script:OeTable + "?`$filter=cr4b4_status eq 'Production Ready'&`$orderby=cr4b4_duedate asc")
        if ($dvResult -and $dvResult.value) { $orders = $dvResult.value }
    } catch {
        Write-PmLog ('Dataverse query failed, will use local store only: ' + $_.Exception.Message) 'WARN'
    }

    $newCount = 0
    foreach ($o in $orders) {
        $orderId = $o.cr4b4_cheekyordersid
        if ($orderId -and ($existingOrderIds -contains $orderId)) {
            Write-PmLog ('Task already exists for order ' + $orderId + ', skipping')
            continue
        }
        $task = [PSCustomObject]@{
            TaskID       = [guid]::NewGuid().ToString()
            OrderID      = $orderId
            CustomerName = $o.cr4b4_customername
            Product      = $o.cr4b4_product
            Quantity     = $o.cr4b4_quantity
            PrintType    = (Resolve-PrintTypeGroup $o.cr4b4_printtype)
            DueDate      = $o.cr4b4_duedate
            Priority     = (Resolve-Priority $o.cr4b4_duedate)
            Status       = 'Production Ready'
            AssignedTo   = ''
            Notes        = $o.cr4b4_notes
            CreatedDate  = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssZ')
        }
        $tasks += $task
        $newCount++
        Write-PmLog ('Created task for ' + $task.CustomerName + ' | ' + $task.Product + ' | ' + $task.PrintType + ' | ' + $task.Priority)
    }

    Save-TaskStore -Tasks $tasks
    Write-PmLog ('' + $newCount + ' new task(s) created. Total tasks: ' + $tasks.Count) 'SUCCESS'
    return $newCount
}

# -- Query Functions --------------------------------------------------------
function Get-ProductionTasksFiltered {
    param([string]$DateStart, [string]$DateEnd, [string]$PrintType, [string]$StatusFilter)
    $tasks = Get-TaskStore
    $filtered = @()
    foreach ($t in $tasks) {
        # Date filter
        if ($DateStart -and $t.DueDate) {
            try {
                $due = [DateTime]::Parse($t.DueDate)
                $ds = [DateTime]::Parse($DateStart)
                if ($due -lt $ds) { continue }
            } catch { }
        }
        if ($DateEnd -and $t.DueDate) {
            try {
                $due = [DateTime]::Parse($t.DueDate)
                $de = [DateTime]::Parse($DateEnd)
                if ($due -ge $de) { continue }
            } catch { }
        }
        if ($PrintType -and $t.PrintType -ne $PrintType) { continue }
        if ($StatusFilter -and $t.Status -ne $StatusFilter) { continue }
        # Refresh priority dynamically
        $t.Priority = Resolve-Priority $t.DueDate
        $filtered += $t
    }
    return $filtered
}

function Get-ProductionTasksToday {
    $start = (Get-Date).Date.ToString('yyyy-MM-dd')
    $end = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
    return (Get-ProductionTasksFiltered -DateStart $start -DateEnd $end)
}

function Get-ProductionTasksTomorrow {
    $start = (Get-Date).Date.AddDays(1).ToString('yyyy-MM-dd')
    $end = (Get-Date).Date.AddDays(2).ToString('yyyy-MM-dd')
    return (Get-ProductionTasksFiltered -DateStart $start -DateEnd $end)
}

function Get-ProductionTasksByPrintType {
    param([string]$PrintType)
    return (Get-ProductionTasksFiltered -PrintType $PrintType)
}

function Update-ProductionTaskStatus {
    param([string]$TaskID, [string]$NewStatus)
    $validStatuses = @('Production Ready', 'Printing', 'QC', 'Ready for Pickup', 'Completed')
    if ($NewStatus -notin $validStatuses) {
        Write-PmLog ('Invalid status: ' + $NewStatus + '. Valid: ' + ($validStatuses -join ', ')) 'ERROR'
        return $false
    }
    $tasks = Get-TaskStore
    $found = $false
    for ($i = 0; $i -lt $tasks.Count; $i++) {
        if ($tasks[$i].TaskID -eq $TaskID -or $tasks[$i].OrderID -eq $TaskID) {
            $old = $tasks[$i].Status
            $tasks[$i].Status = $NewStatus
            Write-PmLog ('Task ' + $tasks[$i].TaskID + ' (' + $tasks[$i].CustomerName + '): ' + $old + ' -> ' + $NewStatus) 'SUCCESS'
            $found = $true
        }
    }
    if ($found) { Save-TaskStore -Tasks $tasks } else { Write-PmLog ('Task or order not found: ' + $TaskID) 'WARN' }
    return $found
}

# -- Summary ----------------------------------------------------------------
function Get-ProductionSummary {
    Write-PmLog '=== PRODUCTION SUMMARY ==='
    $tasks = Get-TaskStore
    if ($tasks.Count -eq 0) { Write-PmLog 'No production tasks'; return }

    # Refresh priorities
    foreach ($t in $tasks) { $t.Priority = Resolve-Priority $t.DueDate }

    # By status
    Write-Host '' -ForegroundColor White
    Write-Host '  BY STATUS' -ForegroundColor Cyan
    $statusGroups = $tasks | Group-Object -Property Status
    foreach ($g in $statusGroups) {
        $totalQty = 0
        foreach ($t in $g.Group) { $totalQty += $t.Quantity }
        Write-Host ('    ' + $g.Name + ': ' + $g.Count + ' tasks, ' + $totalQty + ' units') -ForegroundColor White
    }

    # By print type
    Write-Host '' -ForegroundColor White
    Write-Host '  BY PRINT TYPE' -ForegroundColor Cyan
    $ptGroups = $tasks | Group-Object -Property PrintType
    foreach ($g in $ptGroups) {
        $totalQty = 0
        foreach ($t in $g.Group) { $totalQty += $t.Quantity }
        Write-Host ('    ' + $g.Name + ': ' + $g.Count + ' tasks, ' + $totalQty + ' units') -ForegroundColor White
    }

    # By priority
    Write-Host '' -ForegroundColor White
    Write-Host '  BY PRIORITY' -ForegroundColor Cyan
    $priGroups = $tasks | Group-Object -Property Priority
    foreach ($g in $priGroups) {
        $color = switch ($g.Name) { 'Rush' { 'Red' }; 'Due Tomorrow' { 'Yellow' }; default { 'White' } }
        Write-Host ('    ' + $g.Name + ': ' + $g.Count + ' tasks') -ForegroundColor $color
    }
    Write-Host '' -ForegroundColor White
}

# -- Schedule Builder -------------------------------------------------------
function Format-PrintSchedule {
    param([array]$Tasks, [string]$Label)

    if ($Tasks.Count -eq 0) {
        Write-Host '' -ForegroundColor White
        Write-Host ('  ' + $Label) -ForegroundColor Cyan
        Write-Host '    No tasks scheduled.' -ForegroundColor DarkGray
        return
    }

    # Refresh priorities
    foreach ($t in $Tasks) { $t.Priority = Resolve-Priority $t.DueDate }

    # Group by PrintType in defined order
    $groups = @{}
    foreach ($t in $Tasks) {
        $pt = $t.PrintType
        if (-not $groups.ContainsKey($pt)) { $groups[$pt] = @() }
        $groups[$pt] += $t
    }

    # Sort group keys by predefined order
    $sortedKeys = $groups.Keys | Sort-Object { if ($script:PrintTypeOrder.ContainsKey($_)) { $script:PrintTypeOrder[$_] } else { 99 } }

    Write-Host '' -ForegroundColor White
    Write-Host ('  ' + $Label) -ForegroundColor Cyan
    Write-Host ('  ' + ('-' * ($Label.Length))) -ForegroundColor DarkGray

    foreach ($pt in $sortedKeys) {
        Write-Host '' -ForegroundColor White
        Write-Host ('  ' + $pt.ToUpper()) -ForegroundColor Yellow

        # Sort within group: priority, due date, quantity desc
        $sorted = $groups[$pt] | Sort-Object {
            Get-PrioritySortKey $_.Priority
        }, {
            try { [DateTime]::Parse($_.DueDate) } catch { [DateTime]::MaxValue }
        }, {
            -($_.Quantity)
        }

        foreach ($t in $sorted) {
            $priTag = ''
            $color = 'White'
            if ($t.Priority -eq 'Rush') { $priTag = ' ** RUSH **'; $color = 'Red' }
            elseif ($t.Priority -eq 'Due Tomorrow') { $priTag = ' [Due Tomorrow]'; $color = 'Yellow' }

            $dueFmt = ''
            if ($t.DueDate) {
                try { $dueFmt = ([DateTime]::Parse($t.DueDate)).ToString('MMM d h:mm tt') } catch { $dueFmt = $t.DueDate }
            }

            $qty = if ($t.Quantity) { '' + $t.Quantity } else { '?' }
            $line = '    - ' + $t.CustomerName + ' | ' + $qty + ' ' + $t.Product + ' | Due ' + $dueFmt + $priTag
            if ($t.Status -ne 'Production Ready') { $line += ' (' + $t.Status + ')' }
            Write-Host $line -ForegroundColor $color
            Write-PmLog $line
        }
    }
    Write-Host '' -ForegroundColor White
}

function Build-DailyPrintSchedule {
    Write-PmLog '=== BUILDING TODAY SCHEDULE ==='
    $tasks = Get-ProductionTasksToday
    # Also include overdue tasks (due before today) that are not completed
    $allTasks = Get-TaskStore
    $overdue = @()
    $todayStart = (Get-Date).Date
    foreach ($t in $allTasks) {
        if ($t.Status -eq 'Completed') { continue }
        if ($t.DueDate) {
            try {
                $due = [DateTime]::Parse($t.DueDate)
                if ($due -lt $todayStart) { $t.Priority = 'Rush'; $overdue += $t }
            } catch { }
        }
    }
    $combined = $overdue + $tasks
    # Deduplicate by TaskID
    $seen = @{}
    $unique = @()
    foreach ($t in $combined) {
        if (-not $seen.ContainsKey($t.TaskID)) { $seen[$t.TaskID] = $true; $unique += $t }
    }
    Format-PrintSchedule -Tasks $unique -Label "TODAY'S PRODUCTION"
}

function Build-TomorrowPrintSchedule {
    Write-PmLog '=== BUILDING TOMORROW SCHEDULE ==='
    $tasks = Get-ProductionTasksTomorrow
    Format-PrintSchedule -Tasks $tasks -Label "TOMORROW'S PRODUCTION"
}

# -- Aliases for spec compatibility -----------------------------------------
function New-ProductionTasksFromOrder { return (New-ProductionTasksFromOrders) }
function Build-TomorrowProductionSchedule { Build-TomorrowPrintSchedule }
