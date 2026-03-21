########################################################################
# Create Cheeky OS Dataverse Schema via Web API
# Creates: ct_customers, ct_orders, ct_productionjobs, ct_tasks
# All attributes created with correct IsValidForRead=true by default
########################################################################

$ErrorActionPreference = "Stop"
$token = (Get-Content (Join-Path $PSScriptRoot ".dv_token.tmp") -Raw).Trim()
$baseUrl = "https://org143bbb56.crm.dynamics.com/api/data/v9.2"

function Invoke-DV {
    param([string]$Method="GET", [string]$Path, [object]$Body, [switch]$NoSolutionHeader)
    $uri = "$baseUrl/$Path"
    $h = @{
        "Authorization"   = "Bearer $token"
        "OData-MaxVersion" = "4.0"; "OData-Version" = "4.0"
        "Accept"          = "application/json"
        "Content-Type"    = "application/json; charset=utf-8"
    }
    if (-not $NoSolutionHeader) { $h["MSCRM.SolutionUniqueName"] = "CheekyOsSolution" }
    $params = @{ Uri = $uri; Method = $Method; Headers = $h }
    if ($Body) { $params.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 20 -Compress)) }
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
        "@odata.type"  = "Microsoft.Dynamics.CRM.MoneyAttributeMetadata"
        SchemaName     = $Schema
        LogicalName    = $Schema.ToLower()
        AttributeType  = "Money"
        PrecisionSource = 2
        Precision      = $Precision
        MinValue       = $Min; MaxValue = $Max
        RequiredLevel  = @{ Value = $Required; CanBeChanged = $true; ManagedPropertyLogicalName = "canmodifyrequirementlevelsettings" }
        DisplayName    = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description    = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
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
            "@odata.type" = "Microsoft.Dynamics.CRM.OptionSetMetadata"
            IsGlobal   = $false
            OptionSetType = "Picklist"
            Options    = $opts
        }
        DisplayName   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        Description   = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
    }
}

function New-Entity {
    param([string]$Schema, [string]$Display, [string]$DisplayPlural, [string]$Desc, [string]$PrimaryAttrDisplay, [int]$PrimaryAttrLen=200)
    $body = @{
        "@odata.type" = "Microsoft.Dynamics.CRM.EntityMetadata"
        SchemaName   = $Schema
        LogicalName  = $Schema.ToLower()
        DisplayName  = @{ LocalizedLabels = @(@{ Label = $Display; LanguageCode = 1033 }) }
        DisplayCollectionName = @{ LocalizedLabels = @(@{ Label = $DisplayPlural; LanguageCode = 1033 }) }
        Description  = @{ LocalizedLabels = @(@{ Label = $Desc; LanguageCode = 1033 }) }
        OwnershipType = "UserOwned"
        IsActivity   = $false
        HasNotes     = $true
        HasActivities = $false
        PrimaryNameAttribute = "ct_name"
        Attributes   = @(
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
    Write-Host "Creating entity $Schema..." -ForegroundColor Cyan
    $result = Invoke-DV -Method POST -Path "EntityDefinitions" -Body $body
    Write-Host "  Created: $($result.MetadataId)" -ForegroundColor Green
    return $result.MetadataId
}

function Add-Attribute {
    param([string]$EntityLogical, [object]$AttrDef)
    $schema = $AttrDef.SchemaName
    Write-Host "  Adding $schema..." -NoNewline
    Invoke-DV -Method POST -Path "EntityDefinitions(LogicalName='$EntityLogical')/Attributes" -Body $AttrDef
    Write-Host " OK" -ForegroundColor Green
}

function Add-Lookup {
    param([string]$Schema, [string]$Display, [string]$ReferencingEntity, [string]$ReferencedEntity, [string]$RelationshipSchema)
    $body = @{
        "@odata.type" = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
        SchemaName    = $RelationshipSchema
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
    Write-Host "  Adding lookup $Schema ($ReferencingEntity -> $ReferencedEntity)..." -NoNewline
    Invoke-DV -Method POST -Path "RelationshipDefinitions" -Body $body
    Write-Host " OK" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════
# ENSURE SOLUTION EXISTS
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== CREATING SOLUTION =====" -ForegroundColor Yellow
$solCheck = Invoke-DV -NoSolutionHeader -Path "solutions?`$filter=uniquename eq 'CheekyOsSolution'&`$select=solutionid"
if ($solCheck.value.Count -eq 0) {
    # Get publisher
    $pub = Invoke-DV -NoSolutionHeader -Path "publishers?`$filter=customizationprefix eq 'ct'&`$select=publisherid"
    if ($pub.value.Count -eq 0) { throw "Publisher with prefix 'ct' not found" }
    $pubId = $pub.value[0].publisherid
    Write-Host "Publisher: $pubId"
    $sol = Invoke-DV -NoSolutionHeader -Method POST -Path "solutions" -Body @{
        uniquename  = "CheekyOsSolution"
        friendlyname = "Cheeky OS Solution"
        version     = "1.0.0.0"
        "publisherid@odata.bind" = "/publishers($pubId)"
    }
    Write-Host "Solution created" -ForegroundColor Green
} else {
    Write-Host "Solution already exists" -ForegroundColor Green
}

# ═══════════════════════════════════════════════════════════════════
# 1. ct_customers
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== ct_customers =====" -ForegroundColor Yellow
$custId = New-Entity -Schema "ct_customers" -Display "Customer" -DisplayPlural "Customers" -Desc "Cheeky OS Customers" -PrimaryAttrDisplay "Customer Name"

Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_email" -Display "Email" -Format "Email" -MaxLen 200)
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_phone" -Display "Phone" -Format "Phone" -MaxLen 50)
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-StringAttr -Schema "ct_company" -Display "Company" -MaxLen 200)
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-PicklistAttr -Schema "ct_clienttier" -Display "Client Tier" -Options @(@{Label="Standard"},@{Label="LRCS"},@{Label="PPH"}))
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-BoolAttr -Schema "ct_firsttimecustomer" -Display "First Time Customer" -Default $true)
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-MemoAttr -Schema "ct_address" -Display "Address" -MaxLen 2000)
Add-Attribute -EntityLogical "ct_customers" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes" -MaxLen 10000)

# ═══════════════════════════════════════════════════════════════════
# 2. ct_orders
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== ct_orders =====" -ForegroundColor Yellow
$ordId = New-Entity -Schema "ct_orders" -Display "Order" -DisplayPlural "Orders" -Desc "Cheeky OS Orders" -PrimaryAttrDisplay "Order Number"

Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-StringAttr -Schema "ct_customername" -Display "Customer Name" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_orderstage" -Display "Order Stage" -Required "ApplicationRequired" -Options @(@{Label="Intake"},@{Label="Approved"},@{Label="Production Ready"},@{Label="Printing"},@{Label="QC"},@{Label="Ready for Pickup"},@{Label="Completed"},@{Label="Cancelled"}))
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_productiontype" -Display "Production Type" -Required "ApplicationRequired" -Options @(@{Label="DTG"},@{Label="DTF"},@{Label="Screen Print"},@{Label="Embroidery"},@{Label="Vinyl"}))
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-IntAttr -Schema "ct_quantity" -Display "Quantity" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_unitprice" -Display "Unit Price" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_totalamount" -Display "Total Amount" -Max 10000000)
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-DecimalAttr -Schema "ct_marginpercent" -Display "Margin %")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_paymentstatus" -Display "Payment Status" -Options @(@{Label="Unpaid"},@{Label="Deposit Paid"},@{Label="Paid in Full"}))
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-MoneyAttr -Schema "ct_depositamount" -Display "Deposit Amount")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-DateTimeAttr -Schema "ct_duedate" -Display "Due Date" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-BoolAttr -Schema "ct_rushorder" -Display "Rush Order")
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_artworkstatus" -Display "Artwork Status" -Options @(@{Label="Not Received"},@{Label="Received"},@{Label="Approved"},@{Label="Revision Needed"}))
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-PicklistAttr -Schema "ct_qcstatus" -Display "QC Status" -Options @(@{Label="Pending"},@{Label="Passed"},@{Label="Failed"}))
Add-Attribute -EntityLogical "ct_orders" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes")

# ═══════════════════════════════════════════════════════════════════
# 3. ct_productionjobs
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== ct_productionjobs =====" -ForegroundColor Yellow
$pjId = New-Entity -Schema "ct_productionjobs" -Display "Production Job" -DisplayPlural "Production Jobs" -Desc "Cheeky OS Production Jobs" -PrimaryAttrDisplay "Job Name"

Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_ordernumber" -Display "Order Number" -Required "ApplicationRequired" -MaxLen 100)
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_productiontype" -Display "Production Type" -Required "ApplicationRequired" -Options @(@{Label="DTG"},@{Label="DTF"},@{Label="Screen Print"},@{Label="Embroidery"},@{Label="Vinyl"}))
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_jobstatus" -Display "Status" -Required "ApplicationRequired" -Options @(@{Label="Queued"},@{Label="In Production"},@{Label="QC"},@{Label="Complete"},@{Label="On Hold"}))
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_garmenttype" -Display "Garment Type")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_garmentcolor" -Display "Garment Color" -MaxLen 100)
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-IntAttr -Schema "ct_quantity" -Display "Quantity" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_frontprint" -Display "Front Print")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_backprint" -Display "Back Print")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_blankstatus" -Display "Blank Status" -Options @(@{Label="Not Ordered"},@{Label="Ordered"},@{Label="Received"}))
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_artworkapproved" -Display "Artwork Approved")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-BoolAttr -Schema "ct_productionready" -Display "Production Ready")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-PicklistAttr -Schema "ct_qcresult" -Display "QC Result" -Options @(@{Label="Pending"},@{Label="Passed"},@{Label="Failed"}))
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-StringAttr -Schema "ct_vendorroute" -Display "Vendor Route")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-DateTimeAttr -Schema "ct_startdate" -Display "Start Date")
Add-Attribute -EntityLogical "ct_productionjobs" -AttrDef (New-DateTimeAttr -Schema "ct_completeddate" -Display "Completed Date")

# ═══════════════════════════════════════════════════════════════════
# 4. ct_tasks
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== ct_tasks =====" -ForegroundColor Yellow
$taskId = New-Entity -Schema "ct_tasks" -Display "Task" -DisplayPlural "Tasks" -Desc "Cheeky OS Tasks" -PrimaryAttrDisplay "Task Name"

Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_tasktype" -Display "Task Type" -Required "ApplicationRequired" -Options @(@{Label="Artwork Approval"},@{Label="Blank Ordering"},@{Label="Printing"},@{Label="QC Check"},@{Label="Packaging"}))
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_status" -Display "Status" -Required "ApplicationRequired" -Options @(@{Label="Not Started"},@{Label="In Progress"},@{Label="Completed"},@{Label="Blocked"}))
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-StringAttr -Schema "ct_assignedto" -Display "Assigned To")
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-DateTimeAttr -Schema "ct_duedate" -Display "Due Date" -Required "ApplicationRequired")
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-StringAttr -Schema "ct_ordernumber" -Display "Order Number" -Required "ApplicationRequired" -MaxLen 100)
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-PicklistAttr -Schema "ct_priority" -Display "Priority" -Options @(@{Label="Normal"},@{Label="High"},@{Label="Rush"}))
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-BoolAttr -Schema "ct_blockingflag" -Display "Blocking")
Add-Attribute -EntityLogical "ct_tasks" -AttrDef (New-MemoAttr -Schema "ct_notes" -Display "Notes")

# ═══════════════════════════════════════════════════════════════════
# 5. RELATIONSHIPS (Lookups)
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n===== RELATIONSHIPS =====" -ForegroundColor Yellow

# Order -> Customer
Add-Lookup -Schema "ct_customerid" -Display "Customer" -ReferencingEntity "ct_orders" -ReferencedEntity "ct_customers" -RelationshipSchema "ct_customer_orders"

# ProductionJob -> Order
Add-Lookup -Schema "ct_orderid" -Display "Order" -ReferencingEntity "ct_productionjobs" -ReferencedEntity "ct_orders" -RelationshipSchema "ct_order_productionjobs"

# Task -> Order
Add-Lookup -Schema "ct_orderid" -Display "Order" -ReferencingEntity "ct_tasks" -ReferencedEntity "ct_orders" -RelationshipSchema "ct_order_tasks"

# Task -> ProductionJob
Add-Lookup -Schema "ct_productionjobid" -Display "Production Job" -ReferencingEntity "ct_tasks" -ReferencedEntity "ct_productionjobs" -RelationshipSchema "ct_productionjob_tasks"

Write-Host "`n===== SCHEMA CREATION COMPLETE =====" -ForegroundColor Green
Write-Host "Entities: ct_customers, ct_orders, ct_productionjobs, ct_tasks" -ForegroundColor Green
Write-Host "Relationships: Order->Customer, ProdJob->Order, Task->Order, Task->ProdJob" -ForegroundColor Green
