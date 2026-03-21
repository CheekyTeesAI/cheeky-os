########################################################################
# Cheeky OS - Pipeline Functions (Fully Unattended)
# Real Dataverse Web API calls - no placeholders, no Start-Sleep
# Throws on any failure so retry logic in the caller works correctly
########################################################################

$ErrorActionPreference = "Stop"

# ===================================================================
# CONFIGURATION
# ===================================================================

$script:DV_BaseUrl  = "https://org143bbb56.crm.dynamics.com/api/data/v9.2"
$script:DV_Solution = "CheekyOsSolution"

function Initialize-PipelineToken {
    $tokenFile = Join-Path $PSScriptRoot ".dv_token.tmp"
    if (-not (Test-Path $tokenFile)) {
        throw "Token file not found: $tokenFile. Run device-code auth first."
    }
    $script:DV_Token = (Get-Content $tokenFile -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($script:DV_Token)) { throw "Token file is empty." }
    Write-Host "[Pipeline] Token loaded ($($script:DV_Token.Length) chars)" -ForegroundColor DarkGray
}

# ===================================================================
# CORE API HELPER
# ===================================================================

function Invoke-DV {
    param(
        [string]$Method = "GET",
        [string]$Path,
        [object]$Body,
        [switch]$NoSolutionHeader,
        [switch]$ReturnRepresentation
    )
    $uri = "$($script:DV_BaseUrl)/$Path"
    $h = @{
        "Authorization"    = "Bearer $($script:DV_Token)"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
        "Accept"           = "application/json"
        "Content-Type"     = "application/json; charset=utf-8"
    }
    if (-not $NoSolutionHeader) { $h["MSCRM.SolutionUniqueName"] = $script:DV_Solution }
    if ($ReturnRepresentation)  { $h["Prefer"] = "return=representation" }

    $params = @{ Uri = $uri; Method = $Method; Headers = $h }
    if ($Body) {
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress))
    }
    try { return Invoke-RestMethod @params }
    catch {
        $msg = $_.Exception.Message
        if ($_.Exception.Response) {
            $r = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $msg += "`n" + $r.ReadToEnd(); $r.Close()
        }
        throw $msg
    }
}

# ===================================================================
# ATTRIBUTE BUILDER HELPERS
# ===================================================================

function New-StringAttr {
    param([string]$Schema, [string]$Display, [int]$MaxLen=200, [string]$Required="None", [string]$Format="Text")
    return @{
        "@odata.type"    = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
        SchemaName       = $Schema
        LogicalName      = $Schema.ToLower()
        AttributeType    = "String"
        RequiredLevel    = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        MaxLength        = $MaxLen
        FormatName       = @{ Value = $Format }
        DisplayName      = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description      = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-MemoAttr {
    param([string]$Schema, [string]$Display, [int]$MaxLen=10000)
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "Memo"
        MaxLength     = $MaxLen
        Format        = "Text"
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-IntAttr {
    param([string]$Schema, [string]$Display, [int]$Min=0, [int]$Max=1000000, [string]$Required="None")
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "Integer"
        Format        = "None"
        MinValue      = $Min; MaxValue = $Max
        RequiredLevel = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-MoneyAttr {
    param([string]$Schema, [string]$Display, [double]$Min=0, [double]$Max=1000000, [int]$Precision=2, [string]$Required="None")
    return @{
        "@odata.type"   = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
        SchemaName      = $Schema
        LogicalName     = $Schema.ToLower()
        AttributeType   = "Money"
        PrecisionSource = 2
        Precision       = $Precision
        MinValue        = $Min; MaxValue = $Max
        RequiredLevel   = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        DisplayName     = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description     = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-DecimalAttr {
    param([string]$Schema, [string]$Display, [double]$Min=0, [double]$Max=100, [int]$Precision=2)
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.DecimalAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "Decimal"
        Precision     = $Precision
        MinValue      = $Min; MaxValue = $Max
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-DateTimeAttr {
    param([string]$Schema, [string]$Display, [string]$Fmt="DateOnly", [string]$Required="None")
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "DateTime"
        Format        = $Fmt
        DateTimeBehavior = @{ Value = "UserLocal" }
        RequiredLevel = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-BoolAttr {
    param([string]$Schema, [string]$Display, [bool]$Default=$false)
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "Boolean"
        DefaultValue  = $Default
        OptionSet     = @{
            TrueOption  = @{ Value = 1; Label = @{ LocalizedLabels = @(@{ Label = "Yes"; LanguageCode = 1033 }) } }
            FalseOption = @{ Value = 0; Label = @{ LocalizedLabels = @(@{ Label = "No";  LanguageCode = 1033 }) } }
        }
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-PicklistAttr {
    param([string]$Schema, [string]$Display, [hashtable[]]$Options, [string]$Required="None")
    $opts = @()
    $val = 100000000
    foreach ($o in $Options) {
        $opts += @{ Value = $val; Label = @{ LocalizedLabels = @(@{ Label = $o.Label; LanguageCode = 1033 }) } }
        $val++
    }
    return @{
        "@odata.type" = "Microsoft.Dynamics.CRM.PicklistAttributeMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        AttributeType = "Picklist"
        RequiredLevel = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        OptionSet     = @{
            "@odata.type"  = "Microsoft.Dynamics.CRM.OptionSetMetadata"
            IsGlobal       = $false
            OptionSetType  = "Picklist"
            Options        = $opts
        }
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

# ===================================================================
# INTERNAL HELPERS
# ===================================================================

function New-DVEntity {
    param([string]$Schema, [string]$Display, [string]$DisplayPlural, [string]$Desc, [string]$PrimaryAttrDisplay, [int]$PrimaryAttrLen=200)
    $body = @{
        "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
        SchemaName    = $Schema
        LogicalName   = $Schema.ToLower()
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        DisplayCollectionName = @{ LocalizedLabels = @(@{ Label = $DisplayPlural; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Desc; LanguageCode = 1033 }) }
        OwnershipType = "UserOwned"
        IsActivity    = $false
        HasNotes      = $true
        HasActivities = $false
        PrimaryNameAttribute = "ct_name"
        Attributes    = @(
            @{
                "@odata.type" = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
                SchemaName    = "ct_name"
                LogicalName   = "ct_name"
                IsPrimaryName = $true
                AttributeType = "String"
                MaxLength     = $PrimaryAttrLen
                FormatName    = @{ Value = "Text" }
                RequiredLevel = @{ Value = "ApplicationRequired"; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
                DisplayName   = @{ LocalizedLabels = @(@{ Label = $PrimaryAttrDisplay; LanguageCode = 1033 }) }
                Description   = @{ LocalizedLabels = @(@{ Label = $PrimaryAttrDisplay; LanguageCode = 1033 }) }
            }
        )
    }
    Write-Host "  Creating entity $Schema..." -ForegroundColor Cyan
    $result = Invoke-DV -Method POST -Path "EntityDefinitions" -Body $body
    Write-Host "    Created: $($result.MetadataId)" -ForegroundColor Green
    return $result.MetadataId
}

function Add-DVAttribute {
    param([string]$EntityLogical, [object]$AttrDef)
    $schema = $AttrDef.SchemaName
    Write-Host "    Adding $schema..." -NoNewline
    Invoke-DV -Method POST -Path "EntityDefinitions(LogicalName='$EntityLogical')/Attributes" -Body $AttrDef
    Write-Host " OK" -ForegroundColor Green
}

function Add-DVLookup {
    param([string]$Schema, [string]$Display, [string]$ReferencingEntity, [string]$ReferencedEntity, [string]$RelationshipSchema)
    $body = @{
        "@odata.type"     = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
        SchemaName        = $RelationshipSchema
        ReferencingEntity = $ReferencingEntity
        ReferencedEntity  = $ReferencedEntity
        CascadeConfiguration = @{
            Assign   = "NoCascade"; Delete = "RemoveLink"; Merge = "NoCascade"
            Reparent = "NoCascade"; Share  = "NoCascade"; Unshare = "NoCascade"
            RollupView = "NoCascade"
        }
        Lookup = @{
            "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
            SchemaName    = $Schema
            LogicalName   = $Schema.ToLower()
            DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
            Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
            RequiredLevel = @{ Value = "None"; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        }
    }
    Write-Host "    Adding lookup $Schema ($ReferencingEntity -> $ReferencedEntity)..." -NoNewline
    Invoke-DV -Method POST -Path "RelationshipDefinitions" -Body $body
    Write-Host " OK" -ForegroundColor Green
}

function Remove-DVEntity {
    param([string]$LogicalName)
    Write-Host "  Checking if $LogicalName exists..." -NoNewline
    try {
        $ePath = "EntityDefinitions(LogicalName='$LogicalName')?`$select=MetadataId"
        $meta = Invoke-DV -NoSolutionHeader -Path $ePath
        $id = $meta.MetadataId
        Write-Host " found ($id). Deleting..." -NoNewline
        Invoke-DV -NoSolutionHeader -Method DELETE -Path "EntityDefinitions($id)"
        Write-Host " deleted." -ForegroundColor Yellow
    }
    catch {
        if ($_ -match "0x80060888" -or $_ -match "Could not find" -or $_ -match "Entity.*not found" -or $_ -match "404") {
            Write-Host " not found (skip)." -ForegroundColor DarkGray
        }
        else { throw }
    }
}

# ===================================================================
# PIPELINE FUNCTION 1: RecreateAllEntities
# Deletes any existing ct_ entities then creates all 4 via Web API
# EntityDefinitions POST (guarantees IsValidForRead=true)
# ===================================================================

function RecreateAllEntities {
    [CmdletBinding()] param()
    Write-Host "`n===================================================" -ForegroundColor Yellow
    Write-Host " RecreateAllEntities" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Yellow

    Initialize-PipelineToken

    # -- Delete existing entities (reverse dependency order) --
    Write-Host "`n[1/3] Deleting existing entities (if any)..." -ForegroundColor Cyan
    Remove-DVEntity -LogicalName "ct_tasks"
    Remove-DVEntity -LogicalName "ct_productionjobs"
    Remove-DVEntity -LogicalName "ct_orders"
    Remove-DVEntity -LogicalName "ct_customers"

    # -- Ensure solution exists --
    Write-Host "`n[2/3] Ensuring solution exists..." -ForegroundColor Cyan
    $solPath = "solutions?`$filter=uniquename eq 'CheekyOsSolution'" + "&" + "`$select=solutionid"
    $solCheck = Invoke-DV -NoSolutionHeader -Path $solPath
    if ($solCheck.value.Count -eq 0) {
        $pubPath = "publishers?`$filter=customizationprefix eq 'ct'" + "&" + "`$select=publisherid"
        $pub = Invoke-DV -NoSolutionHeader -Path $pubPath
        if ($pub.value.Count -eq 0) { throw "Publisher with prefix 'ct' not found." }
        $pubId = $pub.value[0].publisherid
        Write-Host "  Publisher: $pubId" -ForegroundColor DarkGray
        Invoke-DV -NoSolutionHeader -Method POST -Path "solutions" -Body @{
            uniquename  = "CheekyOsSolution"
            friendlyname = "Cheeky OS Solution"
            version     = "1.0.0.0"
            "publisherid@odata.bind" = "/publishers($pubId)"
        }
        Write-Host "  Solution created." -ForegroundColor Green
    }
    else {
        Write-Host "  Solution already exists." -ForegroundColor Green
    }

    # -- Create all 4 entities with primary name attribute --
    Write-Host "`n[3/3] Creating entities..." -ForegroundColor Cyan

    $script:EntityIds = @{}

    $script:EntityIds.ct_customers = New-DVEntity -Schema "ct_customers" -Display "Customer" -DisplayPlural "Customers" -Desc "Cheeky OS Customers" -PrimaryAttrDisplay "Customer Name"

    $script:EntityIds.ct_orders = New-DVEntity -Schema "ct_orders" -Display "Order" -DisplayPlural "Orders" -Desc "Cheeky OS Orders" -PrimaryAttrDisplay "Order Number"

    $script:EntityIds.ct_productionjobs = New-DVEntity -Schema "ct_productionjobs" -Display "Production Job" -DisplayPlural "Production Jobs" -Desc "Cheeky OS Production Jobs" -PrimaryAttrDisplay "Job Name"

    $script:EntityIds.ct_tasks = New-DVEntity -Schema "ct_tasks" -Display "Task" -DisplayPlural "Tasks" -Desc "Cheeky OS Tasks" -PrimaryAttrDisplay "Task Name"

    Write-Host "`n  RecreateAllEntities COMPLETE - 4 entities created." -ForegroundColor Green
}

# ===================================================================
# PIPELINE FUNCTION 2: CreateAttributes
# Adds all custom columns to all 4 entities
# ===================================================================

function CreateAttributes {
    [CmdletBinding()] param()
    Write-Host "`n===================================================" -ForegroundColor Yellow
    Write-Host " CreateAttributes" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Yellow

    Initialize-PipelineToken

    # -- ct_customers attributes (7) --
    Write-Host "`n  ct_customers:" -ForegroundColor Cyan
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_email" -Display "Email" -Format "Email" -MaxLen 200)
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_phone" -Display "Phone" -Format "Phone" -MaxLen 50)
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_company" -Display "Company" -MaxLen 200)
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-PicklistAttr -Schema "ct_clienttier" -Display "Client Tier" -Options @(@{Label="Standard"},@{Label="LRCS"},@{Label="PPH"}))
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-BoolAttr -Schema "ct_firsttimecustomer" -Display "First Time Customer" -Default $true)
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-MemoAttr -Schema "ct_address" -Display "Address" -MaxLen 2000)
    Add-DVAttribute -EntityLogical "ct_customers" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes" -MaxLen 10000)

    # -- ct_orders attributes (14) --
    Write-Host "`n  ct_orders:" -ForegroundColor Cyan
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-StringAttr -Schema "ct_customername" -Display "Customer Name" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_orderstage" -Display "Order Stage" -Required "ApplicationRequired" -Options @(@{Label="Intake"},@{Label="Approved"},@{Label="Production Ready"},@{Label="Printing"},@{Label="QC"},@{Label="Ready for Pickup"},@{Label="Completed"},@{Label="Cancelled"}))
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_productiontype" -Display "Production Type" -Required "ApplicationRequired" -Options @(@{Label="DTG"},@{Label="DTF"},@{Label="Screen Print"},@{Label="Embroidery"},@{Label="Vinyl"}))
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-IntAttr -Schema "ct_quantity" -Display "Quantity" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_unitprice" -Display "Unit Price" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_totalamount" -Display "Total Amount" -Max 10000000)
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-DecimalAttr -Schema "ct_marginpercent" -Display "Margin %")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_paymentstatus" -Display "Payment Status" -Options @(@{Label="Unpaid"},@{Label="Deposit Paid"},@{Label="Paid in Full"}))
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_depositamount" -Display "Deposit Amount")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-DateTimeAttr -Schema "ct_duedate" -Display "Due Date" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-BoolAttr -Schema "ct_rushorder" -Display "Rush Order")
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_artworkstatus" -Display "Artwork Status" -Options @(@{Label="Not Received"},@{Label="Received"},@{Label="Approved"},@{Label="Revision Needed"}))
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_qcstatus" -Display "QC Status" -Options @(@{Label="Pending"},@{Label="Passed"},@{Label="Failed"}))
    Add-DVAttribute -EntityLogical "ct_orders" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes")

    # -- ct_productionjobs attributes (15) --
    Write-Host "`n  ct_productionjobs:" -ForegroundColor Cyan
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_ordernumber" -Display "Order Number" -Required "ApplicationRequired" -MaxLen 100)
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_productiontype" -Display "Production Type" -Required "ApplicationRequired" -Options @(@{Label="DTG"},@{Label="DTF"},@{Label="Screen Print"},@{Label="Embroidery"},@{Label="Vinyl"}))
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_jobstatus" -Display "Status" -Required "ApplicationRequired" -Options @(@{Label="Queued"},@{Label="In Production"},@{Label="QC"},@{Label="Complete"},@{Label="On Hold"}))
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_garmenttype" -Display "Garment Type")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_garmentcolor" -Display "Garment Color" -MaxLen 100)
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-IntAttr -Schema "ct_quantity" -Display "Quantity" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_frontprint" -Display "Front Print")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_backprint" -Display "Back Print")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_blankstatus" -Display "Blank Status" -Options @(@{Label="Not Ordered"},@{Label="Ordered"},@{Label="Received"}))
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_artworkapproved" -Display "Artwork Approved")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_productionready" -Display "Production Ready")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_qcresult" -Display "QC Result" -Options @(@{Label="Pending"},@{Label="Passed"},@{Label="Failed"}))
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_vendorroute" -Display "Vendor Route")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-DateTimeAttr -Schema "ct_startdate" -Display "Start Date")
    Add-DVAttribute -EntityLogical "ct_productionjobs" -AttrDef (New-DateTimeAttr -Schema "ct_completeddate" -Display "Completed Date")

    # -- ct_tasks attributes (8) --
    Write-Host "`n  ct_tasks:" -ForegroundColor Cyan
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_tasktype" -Display "Task Type" -Required "ApplicationRequired" -Options @(@{Label="Artwork Approval"},@{Label="Blank Ordering"},@{Label="Printing"},@{Label="QC Check"},@{Label="Packaging"}))
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_status" -Display "Status" -Required "ApplicationRequired" -Options @(@{Label="Not Started"},@{Label="In Progress"},@{Label="Completed"},@{Label="Blocked"}))
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-StringAttr -Schema "ct_assignedto" -Display "Assigned To")
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-DateTimeAttr -Schema "ct_duedate" -Display "Due Date" -Required "ApplicationRequired")
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-StringAttr -Schema "ct_ordernumber" -Display "Order Number" -Required "ApplicationRequired" -MaxLen 100)
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_priority" -Display "Priority" -Options @(@{Label="Normal"},@{Label="High"},@{Label="Rush"}))
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-BoolAttr -Schema "ct_blockingflag" -Display "Blocking")
    Add-DVAttribute -EntityLogical "ct_tasks" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes")

    Write-Host "`n  CreateAttributes COMPLETE - 44 custom columns created." -ForegroundColor Green
}

# ===================================================================
# PIPELINE FUNCTION 3: CreateRelationships
# Creates all 4 lookup relationships between entities
# ===================================================================

function CreateRelationships {
    [CmdletBinding()] param()
    Write-Host "`n===================================================" -ForegroundColor Yellow
    Write-Host " CreateRelationships" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Yellow

    Initialize-PipelineToken

    Write-Host "`n  Creating lookup relationships..." -ForegroundColor Cyan

    # Order -> Customer
    Add-DVLookup -Schema "ct_customerid" -Display "Customer" -ReferencingEntity "ct_orders" -ReferencedEntity "ct_customers" -RelationshipSchema "ct_customer_orders"

    # ProductionJob -> Order
    Add-DVLookup -Schema "ct_orderid" -Display "Order" -ReferencingEntity "ct_productionjobs" -ReferencedEntity "ct_orders" -RelationshipSchema "ct_order_productionjobs"

    # Task -> Order
    Add-DVLookup -Schema "ct_orderid" -Display "Order" -ReferencingEntity "ct_tasks" -ReferencedEntity "ct_orders" -RelationshipSchema "ct_order_tasks"

    # Task -> ProductionJob
    Add-DVLookup -Schema "ct_productionjobid" -Display "Production Job" -ReferencingEntity "ct_tasks" -ReferencedEntity "ct_productionjobs" -RelationshipSchema "ct_productionjob_tasks"

    Write-Host "`n  CreateRelationships COMPLETE - 4 lookups created." -ForegroundColor Green
}

# ===================================================================
# PIPELINE FUNCTION 4: SeedTestData
# Creates a full set of linked test records:
#   1 Customer -> 1 Order -> 1 ProductionJob -> 4 Tasks
# Stores record IDs in $script:TestData for validation
# ===================================================================

function SeedTestData {
    [CmdletBinding()] param()
    Write-Host "`n===================================================" -ForegroundColor Yellow
    Write-Host " SeedTestData" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Yellow

    Initialize-PipelineToken

    $testId   = Get-Date -Format "yyyyMMdd-HHmmss"
    $ordNum   = "TEST-$testId"
    $custName = "Test Customer $testId"

    $script:TestData = @{
        TestId   = $testId
        OrdNum   = $ordNum
        CustName = $custName
    }

    Write-Host "  Test ID:  $testId" -ForegroundColor DarkGray
    Write-Host "  Order:    $ordNum" -ForegroundColor DarkGray
    Write-Host "  Customer: $custName" -ForegroundColor DarkGray

    # -- Customer --
    Write-Host "`n  [1/4] Creating Customer..." -ForegroundColor Cyan
    $cust = Invoke-DV -ReturnRepresentation -Method POST -Path "ct_customerses" -Body @{
        ct_name  = $custName
        ct_email = "test@cheekyteesllc.com"
        ct_phone = "555-0100"
    }
    $script:TestData.CustId = $cust.ct_customersid
    Write-Host "    Customer: $($cust.ct_customersid)" -ForegroundColor Green

    # -- Order --
    Write-Host "  [2/4] Creating Order..." -ForegroundColor Cyan
    $order = Invoke-DV -ReturnRepresentation -Method POST -Path "ct_orderses" -Body @{
        ct_name           = $ordNum
        ct_customername   = $custName
        ct_orderstage     = 100000000
        ct_productiontype = 100000000
        ct_quantity       = 25
        ct_unitprice      = 12.50
        ct_duedate        = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
        "ct_customerid@odata.bind" = "/ct_customerses($($cust.ct_customersid))"
    }
    $script:TestData.OrdId = $order.ct_ordersid
    Write-Host "    Order: $($order.ct_ordersid)" -ForegroundColor Green

    # -- Production Job --
    Write-Host "  [3/4] Creating Production Job..." -ForegroundColor Cyan
    $job = Invoke-DV -ReturnRepresentation -Method POST -Path "ct_productionjobses" -Body @{
        ct_name           = "PJ-$ordNum"
        ct_ordernumber    = $ordNum
        ct_productiontype = 100000000
        ct_jobstatus      = 100000000
        ct_quantity       = 25
        "ct_orderid@odata.bind" = "/ct_orderses($($order.ct_ordersid))"
    }
    $script:TestData.JobId = $job.ct_productionjobsid
    Write-Host "    Production Job: $($job.ct_productionjobsid)" -ForegroundColor Green

    # -- Tasks (4) --
    Write-Host "  [4/4] Creating Tasks..." -ForegroundColor Cyan
    $taskDefs = @(
        @{ Name = "Design - $ordNum";  Type = 100000000 }
        @{ Name = "Print - $ordNum";   Type = 100000002 }
        @{ Name = "QC - $ordNum";      Type = 100000003 }
        @{ Name = "Ship - $ordNum";    Type = 100000004 }
    )
    $script:TestData.TaskIds = @()
    foreach ($td in $taskDefs) {
        $task = Invoke-DV -ReturnRepresentation -Method POST -Path "ct_taskses" -Body @{
            ct_name        = $td.Name
            ct_tasktype    = $td.Type
            ct_status      = 100000000
            ct_ordernumber = $ordNum
            ct_duedate     = (Get-Date).AddDays(14).ToString("yyyy-MM-dd")
            ct_priority    = 100000000
            "ct_orderid@odata.bind"         = "/ct_orderses($($order.ct_ordersid))"
            "ct_productionjobid@odata.bind" = "/ct_productionjobses($($job.ct_productionjobsid))"
        }
        $script:TestData.TaskIds += $task.ct_tasksid
        Write-Host "    Task: $($td.Name) ($($task.ct_tasksid))" -ForegroundColor Green
    }

    Write-Host "`n  SeedTestData COMPLETE - 7 records created." -ForegroundColor Green
}

# ===================================================================
# PIPELINE FUNCTION 5: RunValidationChecks
# Reads back all records and verifies every field + relationship
# Throws on any validation failure
# ===================================================================

function RunValidationChecks {
    [CmdletBinding()] param()
    Write-Host "`n===================================================" -ForegroundColor Yellow
    Write-Host " RunValidationChecks" -ForegroundColor Yellow
    Write-Host "===================================================" -ForegroundColor Yellow

    Initialize-PipelineToken

    if (-not $script:TestData) { throw "No test data found. Run SeedTestData first." }

    $custId   = $script:TestData.CustId
    $ordId    = $script:TestData.OrdId
    $jobId    = $script:TestData.JobId
    $ordNum   = $script:TestData.OrdNum
    $custName = $script:TestData.CustName
    $script:vPass     = $true
    $script:vFailures = @()

    function Assert-Check {
        param([string]$Label, [bool]$Condition, [string]$Detail)
        if ($Condition) {
            Write-Host "    [PASS] $Label -- $Detail" -ForegroundColor Green
        }
        else {
            Write-Host "    [FAIL] $Label -- $Detail" -ForegroundColor Red
            $script:vPass = $false
            $script:vFailures += $Label
        }
    }

    # -- V1: Customer fields --
    Write-Host "`n  V1: Customer fields" -ForegroundColor Cyan
    $c = Invoke-DV -Path "ct_customerses($custId)?`$select=ct_name,ct_email,ct_phone"
    Assert-Check "ct_name"  ($c.ct_name -eq $custName) "expected='$custName' actual='$($c.ct_name)'"
    Assert-Check "ct_email" ($c.ct_email -eq "test@cheekyteesllc.com") "actual='$($c.ct_email)'"
    Assert-Check "ct_phone" ($c.ct_phone -eq "555-0100") "actual='$($c.ct_phone)'"

    # -- V2: Order fields + Customer lookup --
    Write-Host "`n  V2: Order fields + Customer lookup" -ForegroundColor Cyan
    $o = Invoke-DV -Path "ct_orderses($ordId)?`$select=ct_name,ct_customername,ct_orderstage,ct_productiontype,ct_quantity,ct_unitprice,ct_duedate,_ct_customerid_value"

    $v2checks = [ordered]@{
        ct_name           = @($o.ct_name,           $ordNum)
        ct_customername   = @($o.ct_customername,    $custName)
        ct_orderstage     = @($o.ct_orderstage,      100000000)
        ct_productiontype = @($o.ct_productiontype,  100000000)
        ct_quantity       = @($o.ct_quantity,         25)
        ct_unitprice      = @($o.ct_unitprice,        12.5)
    }
    foreach ($key in $v2checks.Keys) {
        $actual   = "$($v2checks[$key][0])"
        $expected = "$($v2checks[$key][1])"
        $numActual = $null; $numExpected = $null
        $isNum = [double]::TryParse($actual, [ref]$numActual) -and [double]::TryParse($expected, [ref]$numExpected)
        $ok = ($isNum -and $numActual -eq $numExpected) -or ($actual -eq $expected)
        Assert-Check $key $ok "expected='$expected' actual='$actual'"
    }
    Assert-Check "Order->Customer lookup" ($o._ct_customerid_value -eq $custId) "expected=$custId actual=$($o._ct_customerid_value)"

    # -- V3: Production Job fields + Order lookup --
    Write-Host "`n  V3: Production Job + Order lookup" -ForegroundColor Cyan
    $j = Invoke-DV -Path "ct_productionjobses($jobId)?`$select=ct_name,ct_ordernumber,ct_jobstatus,ct_quantity,_ct_orderid_value"
    Assert-Check "ct_ordernumber" ($j.ct_ordernumber -eq $ordNum) "expected='$ordNum' actual='$($j.ct_ordernumber)'"
    Assert-Check "ct_jobstatus"   ($j.ct_jobstatus -eq 100000000) "expected=100000000 actual=$($j.ct_jobstatus)"
    Assert-Check "ct_quantity"    ($j.ct_quantity -eq 25) "expected=25 actual=$($j.ct_quantity)"
    Assert-Check "ProdJob->Order lookup" ($j._ct_orderid_value -eq $ordId) "expected=$ordId actual=$($j._ct_orderid_value)"

    # -- V4: Tasks + both lookups --
    Write-Host "`n  V4: Tasks + Order/ProdJob lookups" -ForegroundColor Cyan
    $taskFilter = [uri]::EscapeDataString("_ct_orderid_value eq $ordId")
    $taskPath = "ct_taskses?`$filter=$taskFilter" + "&" + "`$select=ct_name,ct_tasktype,ct_status,ct_ordernumber,_ct_orderid_value,_ct_productionjobid_value"
    $tasks = Invoke-DV -Path $taskPath
    Assert-Check "Task count" ($tasks.value.Count -eq 4) "expected=4 actual=$($tasks.value.Count)"
    foreach ($t in $tasks.value) {
        $orderOk = ($t._ct_orderid_value -eq $ordId)
        $jobOk   = ($t._ct_productionjobid_value -eq $jobId)
        Assert-Check "$($t.ct_name)" ($orderOk -and $jobOk) "Order=$orderOk, ProdJob=$jobOk"
    }

    # -- V5: IsValidForRead metadata check --
    Write-Host "`n  V5: IsValidForRead metadata verification" -ForegroundColor Cyan
    foreach ($ent in @("ct_customers","ct_orders","ct_productionjobs","ct_tasks")) {
        $attrPath = "EntityDefinitions(LogicalName='$ent')/Attributes?`$filter=startswith(LogicalName,'ct_')" + "&" + "`$select=LogicalName,IsValidForRead"
        $attrs = Invoke-DV -NoSolutionHeader -Path $attrPath
        $bad = @($attrs.value | Where-Object { $_.IsValidForRead -eq $false })
        Assert-Check "$ent IsValidForRead" ($bad.Count -eq 0) "columns with IsValidForRead=false: $($bad.Count)"
    }

    # -- Final verdict --
    Write-Host "`n===================================================" -ForegroundColor Yellow
    if ($script:vPass) {
        Write-Host " VALIDATION RESULT: SUCCESS" -ForegroundColor Green
        Write-Host " All fields populated. All relationships verified." -ForegroundColor Green
        Write-Host " All columns have IsValidForRead=true." -ForegroundColor Green
    }
    else {
        Write-Host " VALIDATION RESULT: FAILED" -ForegroundColor Red
        foreach ($f in $script:vFailures) { Write-Host "   - $f" -ForegroundColor Red }
        throw "Validation failed on $($script:vFailures.Count) check(s): $($script:vFailures -join ', ')"
    }
    Write-Host "===================================================" -ForegroundColor Yellow
}

# ===================================================================
# PIPELINE ORCHESTRATOR
# Runs all 5 stages in sequence. Any failure throws immediately.
# ===================================================================

function Invoke-FullPipeline {
    [CmdletBinding()] param()
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    Write-Host "###################################################" -ForegroundColor Magenta
    Write-Host "# Cheeky OS - Full Unattended Pipeline             " -ForegroundColor Magenta
    Write-Host "# $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')                        " -ForegroundColor Magenta
    Write-Host "###################################################" -ForegroundColor Magenta

    RecreateAllEntities
    CreateAttributes
    CreateRelationships
    SeedTestData
    RunValidationChecks

    $sw.Stop()
    $elapsed = $sw.Elapsed.ToString("mm\:ss")
    Write-Host "`n###################################################" -ForegroundColor Magenta
    Write-Host "# PIPELINE COMPLETE - $elapsed elapsed" -ForegroundColor Green
    Write-Host "###################################################" -ForegroundColor Magenta
}

# ===================================================================
# If run directly (not dot-sourced), execute the full pipeline
# ===================================================================

if ($MyInvocation.InvocationName -ne '.') {
    Invoke-FullPipeline
}
