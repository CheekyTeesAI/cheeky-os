<#
dataverse-schema.ps1 - Dataverse table provisioning for Cheeky OS.
Creates/validates all required tables from the locked data model.
Uses Dataverse Web API v9.2 via pac auth token.
PowerShell 5.1 compatible.
#>

$script:DsRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:DsLogDir = Join-Path $script:DsRoot 'logs'
if (-not (Test-Path $script:DsLogDir)) { New-Item -Path $script:DsLogDir -ItemType Directory -Force | Out-Null }
$script:DsLogFile = Join-Path $script:DsLogDir 'dataverse-schema.log'

# Publisher prefix used in this environment
$script:Prefix = 'crb'

function Write-DsLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $script:DsLogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

function Get-DsHeaders {
    if (-not $env:ENV_URL) { Write-DsLog 'ENV_URL not set' 'ERROR'; return $null }
    try {
        $tokenOut = pac auth token --environment $env:ENV_URL 2>&1
        $token = ($tokenOut | Select-String -Pattern '^[A-Za-z0-9\-_\.]+$' | Select-Object -First 1).ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($token)) { $token = ($tokenOut -join '').Trim() }
        return @{
            'Authorization' = 'Bearer ' + $token
            'Content-Type'  = 'application/json'
            'OData-MaxVersion' = '4.0'
            'OData-Version' = '4.0'
        }
    } catch {
        Write-DsLog ('Token error: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Invoke-DsApi {
    param([string]$Method = 'GET', [string]$Endpoint, [object]$Body = $null)
    $headers = Get-DsHeaders
    if (-not $headers) { return $null }
    $uri = $env:ENV_URL.TrimEnd('/') + '/api/data/v9.2' + $Endpoint
    Write-DsLog ($Method + ' ' + $uri)
    try {
        $params = @{ Uri = $uri; Method = $Method; Headers = $headers; ErrorAction = 'Stop' }
        if ($Body) { $params['Body'] = (ConvertTo-Json $Body -Depth 10) }
        return (Invoke-RestMethod @params)
    } catch {
        Write-DsLog ('API error: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Test-TableExists {
    param([string]$LogicalName)
    $result = Invoke-DsApi -Method 'GET' -Endpoint ("/EntityDefinitions?`$filter=LogicalName eq '$LogicalName'&`$select=LogicalName")
    if ($result -and $result.value -and $result.value.Count -gt 0) { return $true }
    return $false
}

# ============================================================================
# LOCKED DATA MODEL DEFINITION
# ============================================================================

<#
Tables and their columns as specified in the Cheeky OS locked data model.
Each table definition includes:
  - TableName: display name
  - LogicalName: Dataverse logical name with publisher prefix
  - PrimaryColumn: the primary name column
  - Columns: array of column definitions
#>

function Get-CheekyOsSchema {
    $p = $script:Prefix
    return @(
        @{
            TableName = 'Orders'
            LogicalName = ($p + '_orders')
            PrimaryColumn = ($p + '_ordername')
            Description = 'Customer orders - central operational table'
            Columns = @(
                @{ Name = ($p + '_ordername');          Display = 'Order Name';           Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_ordernumber');        Display = 'Order Number';         Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_ordersource');        Display = 'Order Source';         Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_intakesource');       Display = 'Intake Source';        Type = 'Picklist';    Options = @('Manual','Email','Square','AI','Phone','Website') }
                @{ Name = ($p + '_orderstage');         Display = 'Order Stage';          Type = 'Picklist';    Options = @('Intake','Quote Sent','Deposit Paid','Production Ready','Printing','Completed') }
                @{ Name = ($p + '_totalamount');        Display = 'Total Sell Price';     Type = 'Money' }
                @{ Name = ($p + '_totalestimatedcost'); Display = 'Total Estimated Cost'; Type = 'Money' }
                @{ Name = ($p + '_marginpercent');      Display = 'Margin Percent';       Type = 'Decimal';     Precision = 2 }
                @{ Name = ($p + '_marginstatus');       Display = 'Margin Status';        Type = 'Picklist';    Options = @('Pass','Fail','Override','Not Calculated') }
                @{ Name = ($p + '_depositpaid');        Display = 'Deposit Paid';         Type = 'Boolean' }
                @{ Name = ($p + '_depositrequired');    Display = 'Deposit Required';     Type = 'Money' }
                @{ Name = ($p + '_depositreceived');    Display = 'Deposit Received';     Type = 'Money' }
                @{ Name = ($p + '_paymentstatus');      Display = 'Payment Status';       Type = 'Picklist';    Options = @('No Invoice','Invoice Sent','Partial / Deposit Paid','Paid in Full','Overdue / Attention Needed') }
                @{ Name = ($p + '_quotestatus');        Display = 'Quote Status';         Type = 'Picklist';    Options = @('Not Quoted','Draft','Sent','Accepted','Rejected','Expired') }
                @{ Name = ($p + '_productiontype');     Display = 'Production Type';      Type = 'Picklist';    Options = @('DTG','Screen Print','DTF','Embroidery','Vendor') }
                @{ Name = ($p + '_orderdate');          Display = 'Order Date';           Type = 'DateTime' }
                @{ Name = ($p + '_duedate');            Display = 'Due Date';             Type = 'DateTime' }
                @{ Name = ($p + '_requesteddate');      Display = 'Requested Date';       Type = 'DateTime' }
                @{ Name = ($p + '_rushflag');           Display = 'Rush';                 Type = 'Boolean' }
                @{ Name = ($p + '_artworkstatus');      Display = 'Artwork Status';       Type = 'Picklist';    Options = @('Not Received','Under Review','Proof Sent','Approved','Revision Needed') }
                @{ Name = ($p + '_approvalstatus');     Display = 'Approval Status';      Type = 'Picklist';    Options = @('Pending','Approved','Rejected') }
                @{ Name = ($p + '_blankstatus');        Display = 'Blank Status';         Type = 'Picklist';    Options = @('Not Ordered','Ordered','Received','In Stock') }
                @{ Name = ($p + '_productionstatus');   Display = 'Production Status';    Type = 'Picklist';    Options = @('Not Started','In Progress','Completed','On Hold') }
                @{ Name = ($p + '_qcstatus');           Display = 'QC Status';            Type = 'Picklist';    Options = @('Pending','QC Pass','QC Fail') }
                @{ Name = ($p + '_deliverystatus');     Display = 'Delivery Status';      Type = 'Picklist';    Options = @('Not Ready','Ready for Pickup','Shipped','Delivered') }
                @{ Name = ($p + '_owneroverride');      Display = 'Owner Override';       Type = 'Boolean' }
                @{ Name = ($p + '_active');             Display = 'Active';               Type = 'Boolean' }
                @{ Name = ($p + '_notes');              Display = 'Notes';                Type = 'Memo' }
                @{ Name = ($p + '_squareinvoiceid');    Display = 'Square Invoice ID';    Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_squareorderid');      Display = 'Square Order ID';      Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_squarecustomerid');   Display = 'Square Customer ID';   Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_customeremail');      Display = 'Customer Email';       Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_customername');       Display = 'Customer Name';        Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_phone');              Display = 'Phone';                Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_garmenttype');        Display = 'Garment Type';         Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_quantity');           Display = 'Quantity';             Type = 'WholeNumber' }
                @{ Name = ($p + '_status');             Display = 'Status';               Type = 'String';      MaxLength = 100 }
            )
            Lookups = @(
                @{ Name = ($p + '_customerid'); Display = 'Customer'; Target = ($p + '_customers') }
            )
        }
        @{
            TableName = 'Line Items'
            LogicalName = ($p + '_lineitems')
            PrimaryColumn = ($p + '_lineitemname')
            Description = 'Individual line items within an order'
            Columns = @(
                @{ Name = ($p + '_lineitemname');  Display = 'Line Item Name';  Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_product');       Display = 'Product';         Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_quantity');       Display = 'Quantity';        Type = 'WholeNumber' }
                @{ Name = ($p + '_unitprice');      Display = 'Unit Price';      Type = 'Money' }
                @{ Name = ($p + '_linetotal');      Display = 'Line Total';      Type = 'Money' }
                @{ Name = ($p + '_garmenttype');    Display = 'Garment Type';    Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_color');          Display = 'Color';           Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_size');           Display = 'Size';            Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_printtype');      Display = 'Print Type';      Type = 'Picklist';    Options = @('DTG','Screen Print','DTF','Embroidery','Vendor') }
                @{ Name = ($p + '_notes');          Display = 'Notes';           Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid'); Display = 'Order'; Target = ($p + '_orders') }
            )
        }
        @{
            TableName = 'Production Jobs'
            LogicalName = ($p + '_productionjobs')
            PrimaryColumn = ($p + '_productionjobname')
            Description = 'Production jobs generated from orders'
            Columns = @(
                @{ Name = ($p + '_productionjobname'); Display = 'Job Name';          Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_productiontype');     Display = 'Production Type';   Type = 'Picklist';    Options = @('DTG','Screen Print','DTF','Embroidery','Vendor') }
                @{ Name = ($p + '_quantity');            Display = 'Quantity';          Type = 'WholeNumber' }
                @{ Name = ($p + '_status');             Display = 'Status';            Type = 'Picklist';    Options = @('Production Ready','Printing','QC','Ready for Pickup','Completed') }
                @{ Name = ($p + '_assignedto');         Display = 'Assigned To';       Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_startdate');          Display = 'Start Date';        Type = 'DateTime' }
                @{ Name = ($p + '_completiondate');     Display = 'Completion Date';   Type = 'DateTime' }
                @{ Name = ($p + '_frontprint');         Display = 'Front Print';       Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_backprint');          Display = 'Back Print';        Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_garmenttype');        Display = 'Garment Type';      Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_garmentcolor');       Display = 'Garment Color';     Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_blankstatus');        Display = 'Blank Status';      Type = 'Picklist';    Options = @('Not Ordered','Ordered','Received','In Stock') }
                @{ Name = ($p + '_artworkapproved');    Display = 'Artwork Approved';  Type = 'Boolean' }
                @{ Name = ($p + '_productionready');    Display = 'Production Ready';  Type = 'Boolean' }
                @{ Name = ($p + '_qcresult');           Display = 'QC Result';         Type = 'Picklist';    Options = @('Pending','Pass','Fail') }
                @{ Name = ($p + '_vendorroute');        Display = 'Vendor Route';      Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_notes');              Display = 'Notes';             Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid'); Display = 'Order'; Target = ($p + '_orders') }
            )
        }
        @{
            TableName = 'Tasks'
            LogicalName = ($p + '_tasks')
            PrimaryColumn = ($p + '_taskname')
            Description = 'Individual tasks within production jobs'
            Columns = @(
                @{ Name = ($p + '_taskname');     Display = 'Task Name';    Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_tasktype');     Display = 'Task Type';    Type = 'Picklist';    Options = @('Art Prep','Garment Order','Printing','Quality Check','Customer Notification') }
                @{ Name = ($p + '_assignedto');   Display = 'Assigned To';  Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_status');       Display = 'Status';       Type = 'Picklist';    Options = @('Pending','In Progress','Completed','Blocked') }
                @{ Name = ($p + '_priority');     Display = 'Priority';     Type = 'Picklist';    Options = @('Low','Normal','High','Rush') }
                @{ Name = ($p + '_duedate');      Display = 'Due Date';     Type = 'DateTime' }
                @{ Name = ($p + '_taskorder');    Display = 'Task Order';   Type = 'WholeNumber' }
                @{ Name = ($p + '_blockingflag'); Display = 'Blocking';     Type = 'Boolean' }
                @{ Name = ($p + '_notes');        Display = 'Notes';        Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid');         Display = 'Order';          Target = ($p + '_orders') }
                @{ Name = ($p + '_productionjobid'); Display = 'Production Job'; Target = ($p + '_productionjobs') }
            )
        }
        @{
            TableName = 'Customers'
            LogicalName = ($p + '_customers')
            PrimaryColumn = ($p + '_customername')
            Description = 'Customer records'
            Columns = @(
                @{ Name = ($p + '_customername');      Display = 'Customer Name';      Type = 'String';   MaxLength = 200 }
                @{ Name = ($p + '_email');              Display = 'Email';              Type = 'String';   MaxLength = 200 }
                @{ Name = ($p + '_phone');              Display = 'Phone';              Type = 'String';   MaxLength = 50 }
                @{ Name = ($p + '_company');            Display = 'Company';            Type = 'String';   MaxLength = 200 }
                @{ Name = ($p + '_squarecustomerid');   Display = 'Square Customer ID'; Type = 'String';   MaxLength = 100 }
                @{ Name = ($p + '_firsttimecustomer');  Display = 'First-Time Customer'; Type = 'Boolean' }
                @{ Name = ($p + '_clienttier');         Display = 'Client Tier';        Type = 'Picklist'; Options = @('New','Standard','VIP','Caution','Blocked') }
                @{ Name = ($p + '_notes');              Display = 'Notes';              Type = 'Memo' }
            )
        }
        @{
            TableName = 'Products'
            LogicalName = ($p + '_products')
            PrimaryColumn = ($p + '_productname')
            Description = 'Product catalog for print shop'
            Columns = @(
                @{ Name = ($p + '_productname');  Display = 'Product Name';  Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_sku');           Display = 'SKU';           Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_category');      Display = 'Category';      Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_baseprice');     Display = 'Base Price';    Type = 'Money' }
                @{ Name = ($p + '_material');      Display = 'Material';      Type = 'Picklist';    Options = @('100% Cotton','100% Polyester','50/50 Blend','Triblend','Other') }
                @{ Name = ($p + '_defaultprinttype'); Display = 'Default Print Type'; Type = 'Picklist'; Options = @('DTG','Screen Print','DTF','Embroidery') }
                @{ Name = ($p + '_notes');         Display = 'Notes';         Type = 'Memo' }
            )
        }
        @{
            TableName = 'Vendors'
            LogicalName = ($p + '_vendors')
            PrimaryColumn = ($p + '_vendorname')
            Description = 'External vendor / subcontractor records'
            Columns = @(
                @{ Name = ($p + '_vendorname');    Display = 'Vendor Name';    Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_contactemail');  Display = 'Contact Email';  Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_contactphone');  Display = 'Contact Phone';  Type = 'String';      MaxLength = 50 }
                @{ Name = ($p + '_specialties');   Display = 'Specialties';    Type = 'String';      MaxLength = 500 }
                @{ Name = ($p + '_leadtime');      Display = 'Lead Time Days'; Type = 'WholeNumber' }
                @{ Name = ($p + '_active');        Display = 'Active';         Type = 'Boolean' }
                @{ Name = ($p + '_notes');         Display = 'Notes';          Type = 'Memo' }
            )
        }
        @{
            TableName = 'Subcontract Jobs'
            LogicalName = ($p + '_subcontractjobs')
            PrimaryColumn = ($p + '_subcontractjobname')
            Description = 'Jobs sent to external vendors'
            Columns = @(
                @{ Name = ($p + '_subcontractjobname'); Display = 'Job Name';    Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_status');              Display = 'Status';      Type = 'Picklist';    Options = @('Sent','In Progress','Completed','Returned') }
                @{ Name = ($p + '_sentdate');            Display = 'Sent Date';   Type = 'DateTime' }
                @{ Name = ($p + '_expectedreturn');      Display = 'Expected Return'; Type = 'DateTime' }
                @{ Name = ($p + '_actualreturn');        Display = 'Actual Return';   Type = 'DateTime' }
                @{ Name = ($p + '_cost');                Display = 'Cost';        Type = 'Money' }
                @{ Name = ($p + '_notes');               Display = 'Notes';       Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid');  Display = 'Order';  Target = ($p + '_orders') }
                @{ Name = ($p + '_vendorid'); Display = 'Vendor'; Target = ($p + '_vendors') }
            )
        }
        @{
            TableName = 'Progress Tracker'
            LogicalName = ($p + '_progresstracker')
            PrimaryColumn = ($p + '_progressname')
            Description = 'Audit log of task/job status changes'
            Columns = @(
                @{ Name = ($p + '_progressname'); Display = 'Progress Name';   Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_action');        Display = 'Action';          Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_previousstatus');Display = 'Previous Status'; Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_newstatus');     Display = 'New Status';      Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_changedby');     Display = 'Changed By';      Type = 'String';      MaxLength = 100 }
                @{ Name = ($p + '_changedate');    Display = 'Change Date';     Type = 'DateTime' }
                @{ Name = ($p + '_notes');         Display = 'Notes';           Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid'); Display = 'Order'; Target = ($p + '_orders') }
                @{ Name = ($p + '_taskid');  Display = 'Task';  Target = ($p + '_tasks') }
            )
        }
        @{
            TableName = 'Intake Logs'
            LogicalName = ($p + '_intakelogs')
            PrimaryColumn = ($p + '_intakelogname')
            Description = 'Intake event logs for order/email/AI ingestion audit'
            Columns = @(
                @{ Name = ($p + '_intakelogname'); Display = 'Log Name';       Type = 'String';      MaxLength = 200 }
                @{ Name = ($p + '_source');         Display = 'Source';          Type = 'Picklist';    Options = @('Manual','Email','Square','AI','Phone','Website') }
                @{ Name = ($p + '_rawpayload');     Display = 'Raw Payload';     Type = 'Memo' }
                @{ Name = ($p + '_parsedresult');   Display = 'Parsed Result';   Type = 'Memo' }
                @{ Name = ($p + '_processingstate');Display = 'Processing State'; Type = 'Picklist';   Options = @('Received','Parsed','Order Created','Failed','Duplicate') }
                @{ Name = ($p + '_receivedat');     Display = 'Received At';     Type = 'DateTime' }
                @{ Name = ($p + '_notes');          Display = 'Notes';           Type = 'Memo' }
            )
            Lookups = @(
                @{ Name = ($p + '_orderid'); Display = 'Order'; Target = ($p + '_orders') }
            )
        }
    )
}

# ============================================================================
# VALIDATION
# ============================================================================

function Test-CheekyOsSchema {
    Write-DsLog '=== SCHEMA VALIDATION START ==='
    $schema = Get-CheekyOsSchema
    $results = @()

    foreach ($table in $schema) {
        $exists = Test-TableExists -LogicalName $table.LogicalName
        $status = if ($exists) { 'EXISTS' } else { 'MISSING' }
        $lvl = if ($exists) { 'SUCCESS' } else { 'WARN' }
        Write-DsLog ('  [' + $status + '] ' + $table.TableName + ' (' + $table.LogicalName + ')') $lvl
        $results += @{ Table = $table.TableName; LogicalName = $table.LogicalName; Exists = $exists }
    }

    $missing = ($results | Where-Object { -not $_.Exists }).Count
    $total = $results.Count
    Write-DsLog ('Schema check: ' + ($total - $missing) + '/' + $total + ' tables exist')
    if ($missing -gt 0) { Write-DsLog ($missing + ' table(s) need to be created') 'WARN' }
    Write-DsLog '=== SCHEMA VALIDATION COMPLETE ==='
    return $results
}

function Show-CheekyOsSchema {
    Write-Host '' -ForegroundColor White
    Write-Host '  CHEEKY OS DATA MODEL' -ForegroundColor Cyan
    Write-Host '  --------------------' -ForegroundColor DarkGray
    $schema = Get-CheekyOsSchema
    foreach ($table in $schema) {
        Write-Host '' -ForegroundColor White
        Write-Host ('  ' + $table.TableName + ' (' + $table.LogicalName + ')') -ForegroundColor White
        Write-Host ('    ' + $table.Description) -ForegroundColor DarkGray
        foreach ($col in $table.Columns) {
            $typeStr = $col.Type
            if ($col.Options) { $typeStr = $typeStr + ' [' + ($col.Options -join ', ') + ']' }
            Write-Host ('    - ' + $col.Display + ' (' + $col.Name + ') : ' + $typeStr) -ForegroundColor Gray
        }
        if ($table.Lookups) {
            foreach ($lk in $table.Lookups) {
                Write-Host ('    - ' + $lk.Display + ' (' + $lk.Name + ') -> ' + $lk.Target) -ForegroundColor DarkYellow
            }
        }
    }
    Write-Host '' -ForegroundColor White
}
