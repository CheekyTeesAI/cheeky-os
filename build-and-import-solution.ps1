<#
build-and-import-solution.ps1
Generates the Customizations.xml with 4 Cheeky OS entity definitions,
packs it into a solution.zip using pac solution pack,
and imports it into Dataverse using pac solution import.
#>
$ErrorActionPreference = 'Stop'
$SolRoot = Join-Path $PSScriptRoot 'CheekyOsSolution'
$SrcDir  = Join-Path $SolRoot 'src'
$OtherDir = Join-Path $SrcDir 'Other'
$CustFile = Join-Path $OtherDir 'Customizations.xml'
$ZipFile  = Join-Path $SolRoot 'CheekyOsSolution.zip'

Write-Host '=== STEP 1: Generate Customizations.xml ===' -ForegroundColor Cyan

# Helper to build a single attribute XML block
function New-AttrXml {
    param(
        [string]$Physical, [string]$Type, [string]$Display,
        [string]$Required = 'none', [int]$Length = 200,
        [string]$Format = '', [string]$OptionSetName = '',
        [hashtable[]]$Options = @(), [string]$DefaultValue = '',
        [int]$MinValue = 0, [int]$MaxValue = 1000000, [int]$Precision = 2
    )
    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.AppendLine("            <attribute PhysicalName=`"$Physical`">")
    [void]$sb.AppendLine("              <Type>$Type</Type>")
    [void]$sb.AppendLine("              <Name>$Physical</Name>")
    [void]$sb.AppendLine("              <LogicalName>$Physical</LogicalName>")
    [void]$sb.AppendLine("              <RequiredLevel>$Required</RequiredLevel>")
    [void]$sb.AppendLine("              <DisplayMask>ValidForAdvancedFind|ValidForForm|ValidForGrid</DisplayMask>")
    [void]$sb.AppendLine("              <ValidForUpdateApi>1</ValidForUpdateApi>")
    [void]$sb.AppendLine("              <ValidForCreateApi>1</ValidForCreateApi>")
    [void]$sb.AppendLine("              <IsCustomField>1</IsCustomField>")
    [void]$sb.AppendLine("              <IsAuditEnabled>1</IsAuditEnabled>")
    [void]$sb.AppendLine("              <IsSecured>0</IsSecured>")
    [void]$sb.AppendLine("              <IsCustomizable>1</IsCustomizable>")
    [void]$sb.AppendLine("              <IsRenameable>1</IsRenameable>")
    if ($Type -eq 'nvarchar') {
        [void]$sb.AppendLine("              <Length>$Length</Length>")
        if ($Format) { [void]$sb.AppendLine("              <Format>$Format</Format>") }
    }
    if ($Type -eq 'ntext') {
        [void]$sb.AppendLine("              <Length>$Length</Length>")
    }
    if ($Type -eq 'int') {
        [void]$sb.AppendLine("              <MinValue>$MinValue</MinValue>")
        [void]$sb.AppendLine("              <MaxValue>$MaxValue</MaxValue>")
    }
    if ($Type -eq 'money') {
        [void]$sb.AppendLine("              <MinValue>$MinValue</MinValue>")
        [void]$sb.AppendLine("              <MaxValue>$MaxValue</MaxValue>")
        [void]$sb.AppendLine("              <Precision>$Precision</Precision>")
    }
    if ($Type -eq 'decimal') {
        [void]$sb.AppendLine("              <MinValue>$MinValue</MinValue>")
        [void]$sb.AppendLine("              <MaxValue>$MaxValue</MaxValue>")
        [void]$sb.AppendLine("              <Precision>$Precision</Precision>")
    }
    if ($Type -eq 'datetime') {
        [void]$sb.AppendLine("              <Format>DateOnly</Format>")
        [void]$sb.AppendLine("              <CanChangeDateTimeBehavior>1</CanChangeDateTimeBehavior>")
        [void]$sb.AppendLine("              <DateTimeBehavior>UserLocal</DateTimeBehavior>")
    }
    if ($Type -eq 'bit') {
        $dv = if ($DefaultValue) { $DefaultValue } else { '0' }
        [void]$sb.AppendLine("              <DefaultValue>$dv</DefaultValue>")
    }
    if ($Type -eq 'picklist' -and $Options.Count -gt 0) {
        $osName = if ($OptionSetName) { $OptionSetName } else { $Physical }
        [void]$sb.AppendLine("              <optionset Name=`"$osName`">")
        [void]$sb.AppendLine("                <OptionSetType>picklist</OptionSetType>")
        [void]$sb.AppendLine("                <IsGlobal>0</IsGlobal>")
        [void]$sb.AppendLine("                <IntroducedVersion>1.0</IntroducedVersion>")
        [void]$sb.AppendLine("                <IsCustomizable>1</IsCustomizable>")
        [void]$sb.AppendLine("                <displaynames><displayname description=`"$Display`" languagecode=`"1033`" /></displaynames>")
        [void]$sb.AppendLine("                <options>")
        $i = 0
        foreach ($opt in $Options) {
            $val = 100000000 + $i
            [void]$sb.AppendLine("                  <option value=`"$val`"><labels><label description=`"$($opt.Label)`" languagecode=`"1033`" /></labels></option>")
            $i++
        }
        [void]$sb.AppendLine("                </options>")
        [void]$sb.AppendLine("              </optionset>")
    }
    [void]$sb.AppendLine("              <displaynames><displayname description=`"$Display`" languagecode=`"1033`" /></displaynames>")
    [void]$sb.AppendLine("            </attribute>")
    return $sb.ToString()
}

# Helper to wrap entity
function New-EntityXml {
    param(
        [string]$LogicalName, [string]$DisplayName, [string]$PluralName,
        [string]$PrimaryField, [string]$PrimaryDisplay, [string]$Description,
        [string]$AttrsXml
    )
    return @"
    <Entity>
      <Name LocalizedName="$DisplayName" OriginalName="$DisplayName">
        <LocalizedNames><LocalizedName description="$DisplayName" languagecode="1033" /></LocalizedNames>
      </Name>
      <ObjectTypeCode>$LogicalName</ObjectTypeCode>
      <EntityInfo>
        <entity Name="$LogicalName">
          <LocalizedNames><LocalizedName description="$DisplayName" languagecode="1033" /></LocalizedNames>
          <LocalizedCollectionNames><LocalizedCollectionName description="$PluralName" languagecode="1033" /></LocalizedCollectionNames>
          <Descriptions><Description description="$Description" languagecode="1033" /></Descriptions>
          <attributes>
$AttrsXml
          </attributes>
          <EntitySetName>${LogicalName}es</EntitySetName>
          <IsBPFEntity>0</IsBPFEntity>
          <IsCustomEntity>1</IsCustomEntity>
          <IsActivity>0</IsActivity>
          <IsAvailableOffline>1</IsAvailableOffline>
          <IsDocumentManagementEnabled>0</IsDocumentManagementEnabled>
          <AutoRouteToOwnerQueue>0</AutoRouteToOwnerQueue>
          <IsConnectionsEnabled>0</IsConnectionsEnabled>
          <IsCustomizable>1</IsCustomizable>
          <IsRenameable>1</IsRenameable>
          <IsMappable>1</IsMappable>
          <IsDuplicateDetectionEnabled>0</IsDuplicateDetectionEnabled>
          <CanCreateAttributes>1</CanCreateAttributes>
          <CanCreateForms>1</CanCreateForms>
          <CanCreateViews>1</CanCreateViews>
          <CanCreateCharts>1</CanCreateCharts>
          <CanModifyAdditionalSettings>1</CanModifyAdditionalSettings>
          <IsAuditEnabled>1</IsAuditEnabled>
          <OwnershipTypeMask>UserOwned</OwnershipTypeMask>
          <IntroducedVersion>1.0</IntroducedVersion>
          <IsVisibleInMobile>1</IsVisibleInMobile>
          <IsVisibleInMobileClient>1</IsVisibleInMobileClient>
          <IsReadOnlyInMobileClient>0</IsReadOnlyInMobileClient>
          <HasNotes>1</HasNotes>
          <HasActivities>0</HasActivities>
          <PrimaryFieldName>$PrimaryField</PrimaryFieldName>
        </entity>
      </EntityInfo>
    </Entity>
"@
}

# ---- ORDERS ----
$ordersAttrs = ''
$ordersAttrs += New-AttrXml -Physical 'crb_name' -Type 'nvarchar' -Display 'Order Number' -Required 'applicationrequired' -Length 200
$ordersAttrs += New-AttrXml -Physical 'crb_customername' -Type 'nvarchar' -Display 'Customer Name' -Required 'applicationrequired' -Length 200
$ordersAttrs += New-AttrXml -Physical 'crb_orderstage' -Type 'picklist' -Display 'Order Stage' -Required 'applicationrequired' -Options @(@{Label='Intake'},@{Label='Approved'},@{Label='Production Ready'},@{Label='Printing'},@{Label='QC'},@{Label='Ready for Pickup'},@{Label='Completed'},@{Label='Cancelled'})
$ordersAttrs += New-AttrXml -Physical 'crb_productiontype' -Type 'picklist' -Display 'Production Type' -Required 'applicationrequired' -Options @(@{Label='DTG'},@{Label='DTF'},@{Label='Screen Print'},@{Label='Embroidery'},@{Label='Vinyl'})
$ordersAttrs += New-AttrXml -Physical 'crb_quantity' -Type 'int' -Display 'Quantity' -Required 'applicationrequired'
$ordersAttrs += New-AttrXml -Physical 'crb_unitprice' -Type 'money' -Display 'Unit Price' -Required 'applicationrequired'
$ordersAttrs += New-AttrXml -Physical 'crb_totalamount' -Type 'money' -Display 'Total Amount' -MaxValue 10000000
$ordersAttrs += New-AttrXml -Physical 'crb_marginpercent' -Type 'decimal' -Display 'Margin %' -MaxValue 100
$ordersAttrs += New-AttrXml -Physical 'crb_paymentstatus' -Type 'picklist' -Display 'Payment Status' -Options @(@{Label='Unpaid'},@{Label='Deposit Paid'},@{Label='Paid in Full'})
$ordersAttrs += New-AttrXml -Physical 'crb_depositamount' -Type 'money' -Display 'Deposit Amount'
$ordersAttrs += New-AttrXml -Physical 'crb_duedate' -Type 'datetime' -Display 'Due Date' -Required 'applicationrequired'
$ordersAttrs += New-AttrXml -Physical 'crb_rushorder' -Type 'bit' -Display 'Rush Order'
$ordersAttrs += New-AttrXml -Physical 'crb_artworkstatus' -Type 'picklist' -Display 'Artwork Status' -Options @(@{Label='Not Received'},@{Label='Received'},@{Label='Approved'},@{Label='Revision Needed'})
$ordersAttrs += New-AttrXml -Physical 'crb_qcstatus' -Type 'picklist' -Display 'QC Status' -Options @(@{Label='Pending'},@{Label='Passed'},@{Label='Failed'})
$ordersAttrs += New-AttrXml -Physical 'crb_notes' -Type 'ntext' -Display 'Notes' -Length 10000
$ordersEntity = New-EntityXml -LogicalName 'crb_orders' -DisplayName 'Orders' -PluralName 'Orders' -PrimaryField 'crb_name' -PrimaryDisplay 'Order Number' -Description 'Cheeky OS Orders' -AttrsXml $ordersAttrs

# ---- CUSTOMERS ----
$custAttrs = ''
$custAttrs += New-AttrXml -Physical 'crb_name' -Type 'nvarchar' -Display 'Customer Name' -Required 'applicationrequired' -Length 200
$custAttrs += New-AttrXml -Physical 'crb_email' -Type 'nvarchar' -Display 'Email' -Length 200 -Format 'Email'
$custAttrs += New-AttrXml -Physical 'crb_phone' -Type 'nvarchar' -Display 'Phone' -Length 50 -Format 'Phone'
$custAttrs += New-AttrXml -Physical 'crb_company' -Type 'nvarchar' -Display 'Company' -Length 200
$custAttrs += New-AttrXml -Physical 'crb_clienttier' -Type 'picklist' -Display 'Client Tier' -Options @(@{Label='Standard'},@{Label='LRCS'},@{Label='PPH'})
$custAttrs += New-AttrXml -Physical 'crb_firsttimecustomer' -Type 'bit' -Display 'First Time Customer' -DefaultValue '1'
$custAttrs += New-AttrXml -Physical 'crb_address' -Type 'ntext' -Display 'Address' -Length 2000
$custAttrs += New-AttrXml -Physical 'crb_notes' -Type 'ntext' -Display 'Notes' -Length 10000
$custEntity = New-EntityXml -LogicalName 'crb_customers' -DisplayName 'Customers' -PluralName 'Customers' -PrimaryField 'crb_name' -PrimaryDisplay 'Customer Name' -Description 'Cheeky OS Customers' -AttrsXml $custAttrs

# ---- TASKS ----
$taskAttrs = ''
$taskAttrs += New-AttrXml -Physical 'crb_name' -Type 'nvarchar' -Display 'Task Name' -Required 'applicationrequired' -Length 200
$taskAttrs += New-AttrXml -Physical 'crb_tasktype' -Type 'picklist' -Display 'Task Type' -Required 'applicationrequired' -Options @(@{Label='Artwork Approval'},@{Label='Blank Ordering'},@{Label='Printing'},@{Label='QC Check'},@{Label='Packaging'})
$taskAttrs += New-AttrXml -Physical 'crb_status' -Type 'picklist' -Display 'Status' -Required 'applicationrequired' -OptionSetName 'crb_taskstatus' -Options @(@{Label='Not Started'},@{Label='In Progress'},@{Label='Completed'},@{Label='Blocked'})
$taskAttrs += New-AttrXml -Physical 'crb_assignedto' -Type 'nvarchar' -Display 'Assigned To' -Length 200
$taskAttrs += New-AttrXml -Physical 'crb_duedate' -Type 'datetime' -Display 'Due Date' -Required 'applicationrequired'
$taskAttrs += New-AttrXml -Physical 'crb_ordernumber' -Type 'nvarchar' -Display 'Order Number' -Required 'applicationrequired' -Length 100
$taskAttrs += New-AttrXml -Physical 'crb_priority' -Type 'picklist' -Display 'Priority' -Options @(@{Label='Normal'},@{Label='High'},@{Label='Rush'})
$taskAttrs += New-AttrXml -Physical 'crb_blockingflag' -Type 'bit' -Display 'Blocking'
$taskAttrs += New-AttrXml -Physical 'crb_notes' -Type 'ntext' -Display 'Notes' -Length 10000
$taskEntity = New-EntityXml -LogicalName 'crb_tasks' -DisplayName 'Tasks' -PluralName 'Tasks' -PrimaryField 'crb_name' -PrimaryDisplay 'Task Name' -Description 'Cheeky OS Tasks' -AttrsXml $taskAttrs

# ---- PRODUCTION JOBS ----
$pjAttrs = ''
$pjAttrs += New-AttrXml -Physical 'crb_name' -Type 'nvarchar' -Display 'Job Name' -Required 'applicationrequired' -Length 200
$pjAttrs += New-AttrXml -Physical 'crb_ordernumber' -Type 'nvarchar' -Display 'Order Number' -Required 'applicationrequired' -Length 100
$pjAttrs += New-AttrXml -Physical 'crb_productiontype' -Type 'picklist' -Display 'Production Type' -Required 'applicationrequired' -OptionSetName 'crb_productiontype_pj' -Options @(@{Label='DTG'},@{Label='DTF'},@{Label='Screen Print'},@{Label='Embroidery'},@{Label='Vinyl'})
$pjAttrs += New-AttrXml -Physical 'crb_jobstatus' -Type 'picklist' -Display 'Status' -Required 'applicationrequired' -Options @(@{Label='Queued'},@{Label='In Production'},@{Label='QC'},@{Label='Complete'},@{Label='On Hold'})
$pjAttrs += New-AttrXml -Physical 'crb_garmenttype' -Type 'nvarchar' -Display 'Garment Type' -Length 200
$pjAttrs += New-AttrXml -Physical 'crb_garmentcolor' -Type 'nvarchar' -Display 'Garment Color' -Length 100
$pjAttrs += New-AttrXml -Physical 'crb_quantity' -Type 'int' -Display 'Quantity' -Required 'applicationrequired'
$pjAttrs += New-AttrXml -Physical 'crb_frontprint' -Type 'bit' -Display 'Front Print'
$pjAttrs += New-AttrXml -Physical 'crb_backprint' -Type 'bit' -Display 'Back Print'
$pjAttrs += New-AttrXml -Physical 'crb_blankstatus' -Type 'picklist' -Display 'Blank Status' -Options @(@{Label='Not Ordered'},@{Label='Ordered'},@{Label='Received'})
$pjAttrs += New-AttrXml -Physical 'crb_artworkapproved' -Type 'bit' -Display 'Artwork Approved'
$pjAttrs += New-AttrXml -Physical 'crb_productionready' -Type 'bit' -Display 'Production Ready'
$pjAttrs += New-AttrXml -Physical 'crb_qcresult' -Type 'picklist' -Display 'QC Result' -Options @(@{Label='Pending'},@{Label='Passed'},@{Label='Failed'})
$pjAttrs += New-AttrXml -Physical 'crb_vendorroute' -Type 'nvarchar' -Display 'Vendor Route' -Length 200
$pjAttrs += New-AttrXml -Physical 'crb_startdate' -Type 'datetime' -Display 'Start Date'
$pjAttrs += New-AttrXml -Physical 'crb_completeddate' -Type 'datetime' -Display 'Completed Date'
$pjEntity = New-EntityXml -LogicalName 'crb_productionjobs' -DisplayName 'ProductionJobs' -PluralName 'Production Jobs' -PrimaryField 'crb_name' -PrimaryDisplay 'Job Name' -Description 'Cheeky OS Production Jobs' -AttrsXml $pjAttrs

# Assemble full Customizations.xml
$fullXml = @"
<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities>
$ordersEntity
$custEntity
$taskEntity
$pjEntity
  </Entities>
  <Roles />
  <Workflows />
  <FieldSecurityProfiles />
  <Templates />
  <EntityMaps />
  <EntityRelationships />
  <OrganizationSettings />
  <optionsets />
  <CustomControls />
  <SolutionPluginAssemblies />
  <EntityDataProviders />
  <Languages>
    <Language>1033</Language>
  </Languages>
</ImportExportXml>
"@

[System.IO.File]::WriteAllText($CustFile, $fullXml, [System.Text.Encoding]::UTF8)
Write-Host "Customizations.xml written: $((Get-Item $CustFile).Length) bytes" -ForegroundColor Green

# ---- STEP 2: Pack Solution ----
Write-Host '=== STEP 2: Pack solution ===' -ForegroundColor Cyan
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
$packResult = pac solution pack --zipfile $ZipFile --folder $SrcDir --packagetype Unmanaged 2>&1
Write-Host ($packResult -join "`n")
if (-not (Test-Path $ZipFile)) {
    Write-Host 'PACK FAILED - zip not created' -ForegroundColor Red
    exit 1
}
Write-Host "Solution packed: $((Get-Item $ZipFile).Length) bytes" -ForegroundColor Green

# ---- STEP 3: Import Solution ----
Write-Host '=== STEP 3: Import solution into Dataverse ===' -ForegroundColor Cyan
$importResult = pac solution import --path $ZipFile --publish-changes --activate-plugins 2>&1
Write-Host ($importResult -join "`n")

# ---- STEP 4: Verify ----
Write-Host '=== STEP 4: Verify tables exist ===' -ForegroundColor Cyan
$tables = @('crb_orders','crb_customers','crb_tasks','crb_productionjobs')
$allGood = $true
foreach ($t in $tables) {
    $fetch = "<fetch top='1'><entity name='$t'><attribute name='${t}id'/></entity></fetch>"
    $result = pac env fetch --xml $fetch 2>&1
    $resultStr = $result -join ' '
    if ($resultStr -match 'error' -or $resultStr -match 'not found') {
        Write-Host "  MISSING: $t" -ForegroundColor Red
        $allGood = $false
    } else {
        Write-Host "  EXISTS:  $t" -ForegroundColor Green
    }
}

if ($allGood) {
    Write-Host "`n=== FINAL STATUS: TABLES CREATED ===" -ForegroundColor Green
} else {
    Write-Host "`n=== FINAL STATUS: BLOCKED ===" -ForegroundColor Red
}
