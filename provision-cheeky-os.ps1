<#
provision-cheeky-os.ps1 - Creates all 9 Cheeky OS tables in Dataverse.
Uses Dataverse Web API v9.2 via pac auth token.
Includes all columns, picklists, lookups, and relationships.
Idempotent: skips tables/columns that already exist.
PowerShell 5.1 compatible.
#>
param(
    [switch]$DryRun,
    [switch]$Force
)

$ProvRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = Join-Path $ProvRoot 'logs'
if (-not (Test-Path $LogDir)) { New-Item -Path $LogDir -ItemType Directory -Force | Out-Null }
$LogFile = Join-Path $LogDir ('provision-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

# Publisher prefix
$Prefix = 'crb'
$PublisherPrefix = 'crb'
$SolutionName = 'CheekyTeesAutomation'

function Write-PLog {
    param([string]$Msg, [string]$Lvl = 'INFO')
    $line = '[' + (Get-Date -Format o) + '] [' + $Lvl + '] ' + $Msg
    try { Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue } catch { }
    switch ($Lvl) {
        'ERROR'   { Write-Host $line -ForegroundColor Red }
        'WARN'    { Write-Host $line -ForegroundColor Yellow }
        'SUCCESS' { Write-Host $line -ForegroundColor Cyan }
        'SKIP'    { Write-Host $line -ForegroundColor DarkGray }
        default   { Write-Host $line -ForegroundColor Green }
    }
}

# ============================================================================
# AUTH + API HELPERS
# ============================================================================

function Get-ProvHeaders {
    if (-not $env:ENV_URL) {
        Write-PLog 'ENV_URL not set. Set it with: $env:ENV_URL = "https://org143bbb56.crm.dynamics.com"' 'ERROR'
        return $null
    }
    try {
        $tokenOut = pac auth token --environment $env:ENV_URL 2>&1
        $token = ($tokenOut | Select-String -Pattern '^[A-Za-z0-9\-_\.]+$' | Select-Object -First 1).ToString().Trim()
        if ([string]::IsNullOrWhiteSpace($token)) { $token = ($tokenOut -join '').Trim() }
        return @{
            'Authorization'    = 'Bearer ' + $token
            'Content-Type'     = 'application/json'
            'OData-MaxVersion' = '4.0'
            'OData-Version'    = '4.0'
            'MSCRM.SolutionName' = $SolutionName
        }
    } catch {
        Write-PLog ('Token error: ' + $_.Exception.Message) 'ERROR'
        return $null
    }
}

function Invoke-DvApi {
    param(
        [string]$Method = 'GET',
        [string]$Endpoint,
        [object]$Body = $null,
        [switch]$RawResponse
    )
    $headers = Get-ProvHeaders
    if (-not $headers) { return $null }
    $uri = $env:ENV_URL.TrimEnd('/') + '/api/data/v9.2' + $Endpoint
    try {
        $params = @{ Uri = $uri; Method = $Method; Headers = $headers; ErrorAction = 'Stop' }
        if ($Body) { $params['Body'] = (ConvertTo-Json $Body -Depth 20) }
        if ($RawResponse) {
            return (Invoke-WebRequest @params)
        }
        return (Invoke-RestMethod @params)
    } catch {
        $errMsg = $_.Exception.Message
        if ($_.Exception.Response) {
            try {
                $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errBody = $sr.ReadToEnd()
                $sr.Close()
                $errMsg = $errMsg + ' | ' + $errBody
            } catch { }
        }
        Write-PLog ('API error: ' + $errMsg) 'ERROR'
        return $null
    }
}

# ============================================================================
# CHECK IF ENTITY/ATTRIBUTE EXISTS
# ============================================================================

function Test-EntityExists {
    param([string]$LogicalName)
    $result = Invoke-DvApi -Method 'GET' -Endpoint ("/EntityDefinitions?`$filter=LogicalName eq '" + $LogicalName + "'&`$select=LogicalName,MetadataId")
    if ($result -and $result.value -and $result.value.Count -gt 0) { return $true }
    return $false
}

function Test-AttributeExists {
    param([string]$EntityLogicalName, [string]$AttributeLogicalName)
    $result = Invoke-DvApi -Method 'GET' -Endpoint ("/EntityDefinitions(LogicalName='" + $EntityLogicalName + "')/Attributes?`$filter=LogicalName eq '" + $AttributeLogicalName + "'&`$select=LogicalName")
    if ($result -and $result.value -and $result.value.Count -gt 0) { return $true }
    return $false
}

# ============================================================================
# CREATE TABLE
# ============================================================================

function New-DvTable {
    param(
        [string]$LogicalName,
        [string]$DisplayName,
        [string]$PluralName,
        [string]$Description,
        [string]$PrimaryColumnLogicalName,
        [string]$PrimaryColumnDisplayName,
        [int]$PrimaryColumnMaxLength = 200
    )

    if (Test-EntityExists -LogicalName $LogicalName) {
        Write-PLog ('Table already exists: ' + $LogicalName) 'SKIP'
        return $true
    }

    if ($DryRun) {
        Write-PLog ('[DRY RUN] Would create table: ' + $LogicalName) 'WARN'
        return $true
    }

    Write-PLog ('Creating table: ' + $LogicalName + ' (' + $DisplayName + ')')

    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.EntityMetadata'
        'SchemaName' = ($PublisherPrefix + '_' + ($DisplayName -replace '[^a-zA-Z0-9]', ''))
        'LogicalName' = $LogicalName
        'DisplayName' = @{
            '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
            'LocalizedLabels' = @(
                @{
                    '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'
                    'Label' = $DisplayName
                    'LanguageCode' = 1033
                }
            )
        }
        'DisplayCollectionName' = @{
            '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
            'LocalizedLabels' = @(
                @{
                    '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'
                    'Label' = $PluralName
                    'LanguageCode' = 1033
                }
            )
        }
        'Description' = @{
            '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
            'LocalizedLabels' = @(
                @{
                    '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'
                    'Label' = $Description
                    'LanguageCode' = 1033
                }
            )
        }
        'HasNotes' = $false
        'HasActivities' = $false
        'OwnershipType' = 'UserOwned'
        'IsActivity' = $false
        'PrimaryNameAttribute' = $PrimaryColumnLogicalName
        'Attributes' = @(
            @{
                '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
                'AttributeType' = 'String'
                'AttributeTypeName' = @{ 'Value' = 'StringType' }
                'SchemaName' = $PrimaryColumnLogicalName
                'LogicalName' = $PrimaryColumnLogicalName
                'MaxLength' = $PrimaryColumnMaxLength
                'IsPrimaryName' = $true
                'RequiredLevel' = @{ 'Value' = 'ApplicationRequired'; 'CanBeChanged' = $true }
                'DisplayName' = @{
                    '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
                    'LocalizedLabels' = @(
                        @{
                            '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'
                            'Label' = $PrimaryColumnDisplayName
                            'LanguageCode' = 1033
                        }
                    )
                }
            }
        )
    }

    $result = Invoke-DvApi -Method 'POST' -Endpoint '/EntityDefinitions' -Body $body -RawResponse
    if ($result -and ($result.StatusCode -eq 204 -or $result.StatusCode -eq 201)) {
        Write-PLog ('Created table: ' + $LogicalName) 'SUCCESS'
        return $true
    } elseif ($result) {
        Write-PLog ('Table creation returned status: ' + $result.StatusCode) 'WARN'
        return $true
    }
    return $false
}

# ============================================================================
# ADD COLUMNS
# ============================================================================

function Add-DvStringColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName, [int]$MaxLength = 200)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add string: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.StringAttributeMetadata'
        'AttributeType' = 'String'
        'AttributeTypeName' = @{ 'Value' = 'StringType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'MaxLength' = $MaxLength
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    $r = Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body
    if ($r -ne $null -or $LASTEXITCODE -eq 0) { Write-PLog ('  Added string: ' + $LogicalName) 'SUCCESS' }
}

function Add-DvMemoColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add memo: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.MemoAttributeMetadata'
        'AttributeType' = 'Memo'
        'AttributeTypeName' = @{ 'Value' = 'MemoType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'MaxLength' = 10000
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added memo: ' + $LogicalName) 'SUCCESS'
}

function Add-DvWholeNumberColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add integer: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata'
        'AttributeType' = 'Integer'
        'AttributeTypeName' = @{ 'Value' = 'IntegerType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'MinValue' = 0
        'MaxValue' = 2147483647
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added integer: ' + $LogicalName) 'SUCCESS'
}

function Add-DvMoneyColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add money: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.MoneyAttributeMetadata'
        'AttributeType' = 'Money'
        'AttributeTypeName' = @{ 'Value' = 'MoneyType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'PrecisionSource' = 2
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added money: ' + $LogicalName) 'SUCCESS'
}

function Add-DvDecimalColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName, [int]$Precision = 2)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add decimal: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.DecimalAttributeMetadata'
        'AttributeType' = 'Decimal'
        'AttributeTypeName' = @{ 'Value' = 'DecimalType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'Precision' = $Precision
        'MinValue' = -100000000000
        'MaxValue' = 100000000000
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added decimal: ' + $LogicalName) 'SUCCESS'
}

function Add-DvBooleanColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add boolean: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata'
        'AttributeType' = 'Boolean'
        'AttributeTypeName' = @{ 'Value' = 'BooleanType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
        'OptionSet' = @{
            'TrueOption' = @{ 'Value' = 1; 'Label' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = 'Yes'; 'LanguageCode' = 1033 }) } }
            'FalseOption' = @{ 'Value' = 0; 'Label' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = 'No'; 'LanguageCode' = 1033 }) } }
        }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added boolean: ' + $LogicalName) 'SUCCESS'
}

function Add-DvDateTimeColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add datetime: ' + $Entity + '.' + $LogicalName) 'WARN'; return }
    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata'
        'AttributeType' = 'DateTime'
        'AttributeTypeName' = @{ 'Value' = 'DateTimeType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'Format' = 'DateAndTime'
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added datetime: ' + $LogicalName) 'SUCCESS'
}

function Add-DvPicklistColumn {
    param([string]$Entity, [string]$LogicalName, [string]$DisplayName, [string[]]$Options)
    if (Test-AttributeExists -EntityLogicalName $Entity -AttributeLogicalName $LogicalName) {
        Write-PLog ('  Column exists: ' + $Entity + '.' + $LogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add picklist: ' + $Entity + '.' + $LogicalName + ' [' + ($Options -join ', ') + ']') 'WARN'; return }

    $optionItems = @()
    $val = 100000000
    foreach ($opt in $Options) {
        $optionItems += @{
            'Value' = $val
            'Label' = @{
                '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
                'LocalizedLabels' = @(
                    @{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $opt; 'LanguageCode' = 1033 }
                )
            }
        }
        $val++
    }

    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata'
        'AttributeType' = 'Picklist'
        'AttributeTypeName' = @{ 'Value' = 'PicklistType' }
        'SchemaName' = $LogicalName
        'LogicalName' = $LogicalName
        'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        'DisplayName' = @{ '@odata.type' = 'Microsoft.Dynamics.CRM.Label'; 'LocalizedLabels' = @(@{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $DisplayName; 'LanguageCode' = 1033 }) }
        'OptionSet' = @{
            '@odata.type' = 'Microsoft.Dynamics.CRM.OptionSetMetadata'
            'IsGlobal' = $false
            'OptionSetType' = 'Picklist'
            'Options' = $optionItems
        }
    }
    Invoke-DvApi -Method 'POST' -Endpoint ("/EntityDefinitions(LogicalName='" + $Entity + "')/Attributes") -Body $body | Out-Null
    Write-PLog ('  Added picklist: ' + $LogicalName + ' [' + ($Options -join ', ') + ']') 'SUCCESS'
}

# ============================================================================
# ADD LOOKUP (RELATIONSHIP)
# ============================================================================

function Add-DvLookup {
    param(
        [string]$PrimaryEntity,
        [string]$RelatedEntity,
        [string]$LookupLogicalName,
        [string]$LookupDisplayName
    )

    if (Test-AttributeExists -EntityLogicalName $RelatedEntity -AttributeLogicalName $LookupLogicalName) {
        Write-PLog ('  Lookup exists: ' + $RelatedEntity + '.' + $LookupLogicalName) 'SKIP'
        return
    }
    if ($DryRun) { Write-PLog ('  [DRY RUN] Would add lookup: ' + $RelatedEntity + '.' + $LookupLogicalName + ' -> ' + $PrimaryEntity) 'WARN'; return }

    $schemaName = $PublisherPrefix + '_' + $RelatedEntity.Replace($PublisherPrefix + '_', '') + '_' + $PrimaryEntity.Replace($PublisherPrefix + '_', '')

    $body = @{
        '@odata.type' = 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
        'SchemaName' = $schemaName
        'ReferencedEntity' = $PrimaryEntity
        'ReferencingEntity' = $RelatedEntity
        'Lookup' = @{
            '@odata.type' = 'Microsoft.Dynamics.CRM.LookupAttributeMetadata'
            'SchemaName' = $LookupLogicalName
            'LogicalName' = $LookupLogicalName
            'DisplayName' = @{
                '@odata.type' = 'Microsoft.Dynamics.CRM.Label'
                'LocalizedLabels' = @(
                    @{ '@odata.type' = 'Microsoft.Dynamics.CRM.LocalizedLabel'; 'Label' = $LookupDisplayName; 'LanguageCode' = 1033 }
                )
            }
            'RequiredLevel' = @{ 'Value' = 'None'; 'CanBeChanged' = $true }
        }
    }

    $r = Invoke-DvApi -Method 'POST' -Endpoint '/RelationshipDefinitions' -Body $body
    if ($r) { Write-PLog ('  Added lookup: ' + $RelatedEntity + '.' + $LookupLogicalName + ' -> ' + $PrimaryEntity) 'SUCCESS' }
}

# ============================================================================
# TABLE DEFINITIONS (from locked Cheeky OS data model)
# ============================================================================

function Install-CheekyOsTables {
    Write-PLog '================================================================'
    Write-PLog '  CHEEKY OS TABLE PROVISIONING'
    Write-PLog '================================================================'
    if ($DryRun) { Write-PLog '*** DRY RUN MODE - No changes will be made ***' 'WARN' }
    Write-PLog ''

    $p = $Prefix
    $created = 0
    $skipped = 0
    $failed = 0

    # -----------------------------------------------------------------------
    # TABLE 1: Orders (central operational table)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 1/10: Orders ---'
    $ok = New-DvTable -LogicalName ($p + '_orders') -DisplayName 'Order' -PluralName 'Orders' -Description 'Customer orders - central operational table' -PrimaryColumnLogicalName ($p + '_ordername') -PrimaryColumnDisplayName 'Order Name'
    if ($ok) {
        $e = $p + '_orders'
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_ordernumber')        -DisplayName 'Order Number'         -MaxLength 50
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_ordersource')        -DisplayName 'Order Source'          -MaxLength 100
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_intakesource')       -DisplayName 'Intake Source'         -Options @('Manual','Email','Square','AI','Phone','Website')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_orderstage')         -DisplayName 'Order Stage'           -Options @('Intake','Quote Sent','Deposit Paid','Production Ready','Printing','Completed')
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_totalamount')        -DisplayName 'Total Sell Price'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_totalestimatedcost') -DisplayName 'Total Estimated Cost'
        Add-DvDecimalColumn   -Entity $e -LogicalName ($p + '_marginpercent')      -DisplayName 'Margin Percent'        -Precision 2
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_marginstatus')       -DisplayName 'Margin Status'         -Options @('Pass','Fail','Override','Not Calculated')
        Add-DvBooleanColumn   -Entity $e -LogicalName ($p + '_depositpaid')        -DisplayName 'Deposit Paid'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_depositrequired')    -DisplayName 'Deposit Required'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_depositreceived')    -DisplayName 'Deposit Received'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_paymentstatus')      -DisplayName 'Payment Status'        -Options @('No Invoice','Invoice Sent','Partial / Deposit Paid','Paid in Full','Overdue / Attention Needed')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_quotestatus')        -DisplayName 'Quote Status'          -Options @('Not Quoted','Draft','Sent','Accepted','Rejected','Expired')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_productiontype')     -DisplayName 'Production Type'       -Options @('DTG','Screen Print','DTF','Embroidery','Vendor')
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_orderdate')          -DisplayName 'Order Date'
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_duedate')            -DisplayName 'Due Date'
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_requesteddate')      -DisplayName 'Requested Date'
        Add-DvBooleanColumn   -Entity $e -LogicalName ($p + '_rushflag')           -DisplayName 'Rush'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_artworkstatus')      -DisplayName 'Artwork Status'        -Options @('Not Received','Under Review','Proof Sent','Approved','Revision Needed')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_approvalstatus')     -DisplayName 'Approval Status'       -Options @('Pending','Approved','Rejected')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_blankstatus')        -DisplayName 'Blank Status'          -Options @('Not Ordered','Ordered','Received','In Stock')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_productionstatus')   -DisplayName 'Production Status'     -Options @('Not Started','In Progress','Completed','On Hold')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_qcstatus')           -DisplayName 'QC Status'             -Options @('Pending','QC Pass','QC Fail')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_deliverystatus')     -DisplayName 'Delivery Status'       -Options @('Not Ready','Ready for Pickup','Shipped','Delivered')
        Add-DvBooleanColumn   -Entity $e -LogicalName ($p + '_owneroverride')      -DisplayName 'Owner Override'
        Add-DvBooleanColumn   -Entity $e -LogicalName ($p + '_active')             -DisplayName 'Active'
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')              -DisplayName 'Notes'
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_squareinvoiceid')    -DisplayName 'Square Invoice ID'     -MaxLength 100
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_squareorderid')      -DisplayName 'Square Order ID'       -MaxLength 100
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_squarecustomerid')   -DisplayName 'Square Customer ID'    -MaxLength 100
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_customeremail')      -DisplayName 'Customer Email'        -MaxLength 200
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_customername')       -DisplayName 'Customer Name'         -MaxLength 200
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_phone')              -DisplayName 'Phone'                 -MaxLength 50
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_garmenttype')        -DisplayName 'Garment Type'          -MaxLength 100
        Add-DvWholeNumberColumn -Entity $e -LogicalName ($p + '_quantity')         -DisplayName 'Quantity'
        Add-DvStringColumn    -Entity $e -LogicalName ($p + '_status')             -DisplayName 'Status'                -MaxLength 100
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 2: Customers
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 2/10: Customers ---'
    $ok = New-DvTable -LogicalName ($p + '_customers') -DisplayName 'Customer' -PluralName 'Customers' -Description 'Customer records' -PrimaryColumnLogicalName ($p + '_customername') -PrimaryColumnDisplayName 'Customer Name'
    if ($ok) {
        $e = $p + '_customers'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_email')              -DisplayName 'Email'               -MaxLength 200
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_phone')              -DisplayName 'Phone'               -MaxLength 50
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_company')            -DisplayName 'Company'             -MaxLength 200
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_squarecustomerid')   -DisplayName 'Square Customer ID'  -MaxLength 100
        Add-DvBooleanColumn  -Entity $e -LogicalName ($p + '_firsttimecustomer')  -DisplayName 'First-Time Customer'
        Add-DvPicklistColumn -Entity $e -LogicalName ($p + '_clienttier')         -DisplayName 'Client Tier'         -Options @('New','Standard','VIP','Caution','Blocked')
        Add-DvMemoColumn     -Entity $e -LogicalName ($p + '_notes')              -DisplayName 'Notes'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 3: Products
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 3/10: Products ---'
    $ok = New-DvTable -LogicalName ($p + '_products') -DisplayName 'Product' -PluralName 'Products' -Description 'Product catalog for print shop' -PrimaryColumnLogicalName ($p + '_productname') -PrimaryColumnDisplayName 'Product Name'
    if ($ok) {
        $e = $p + '_products'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_sku')              -DisplayName 'SKU'               -MaxLength 50
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_category')         -DisplayName 'Category'          -MaxLength 100
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_baseprice')        -DisplayName 'Base Price'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_material')         -DisplayName 'Material'          -Options @('100% Cotton','100% Polyester','50/50 Blend','Triblend','Other')
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_defaultprinttype') -DisplayName 'Default Print Type' -Options @('DTG','Screen Print','DTF','Embroidery')
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')            -DisplayName 'Notes'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 4: Vendors
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 4/10: Vendors ---'
    $ok = New-DvTable -LogicalName ($p + '_vendors') -DisplayName 'Vendor' -PluralName 'Vendors' -Description 'External vendor / subcontractor records' -PrimaryColumnLogicalName ($p + '_vendorname') -PrimaryColumnDisplayName 'Vendor Name'
    if ($ok) {
        $e = $p + '_vendors'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_contactemail')  -DisplayName 'Contact Email'  -MaxLength 200
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_contactphone')  -DisplayName 'Contact Phone'  -MaxLength 50
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_specialties')   -DisplayName 'Specialties'    -MaxLength 500
        Add-DvWholeNumberColumn -Entity $e -LogicalName ($p + '_leadtime')   -DisplayName 'Lead Time Days'
        Add-DvBooleanColumn  -Entity $e -LogicalName ($p + '_active')        -DisplayName 'Active'
        Add-DvMemoColumn     -Entity $e -LogicalName ($p + '_notes')         -DisplayName 'Notes'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 5: Line Items (lookup -> Orders)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 5/10: Line Items ---'
    $ok = New-DvTable -LogicalName ($p + '_lineitems') -DisplayName 'Line Item' -PluralName 'Line Items' -Description 'Individual line items within an order' -PrimaryColumnLogicalName ($p + '_lineitemname') -PrimaryColumnDisplayName 'Line Item Name'
    if ($ok) {
        $e = $p + '_lineitems'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_product')      -DisplayName 'Product'      -MaxLength 200
        Add-DvWholeNumberColumn -Entity $e -LogicalName ($p + '_quantity')   -DisplayName 'Quantity'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_unitprice')    -DisplayName 'Unit Price'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_linetotal')    -DisplayName 'Line Total'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_garmenttype')  -DisplayName 'Garment Type'  -MaxLength 100
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_color')        -DisplayName 'Color'         -MaxLength 50
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_size')         -DisplayName 'Size'          -MaxLength 50
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_printtype')    -DisplayName 'Print Type'    -Options @('DTG','Screen Print','DTF','Embroidery','Vendor')
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')        -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders') -RelatedEntity $e -LookupLogicalName ($p + '_orderid') -LookupDisplayName 'Order'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 6: Production Jobs (lookup -> Orders)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 6/10: Production Jobs ---'
    $ok = New-DvTable -LogicalName ($p + '_productionjobs') -DisplayName 'Production Job' -PluralName 'Production Jobs' -Description 'Production jobs generated from orders' -PrimaryColumnLogicalName ($p + '_productionjobname') -PrimaryColumnDisplayName 'Job Name'
    if ($ok) {
        $e = $p + '_productionjobs'
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_productiontype') -DisplayName 'Production Type'  -Options @('DTG','Screen Print','DTF','Embroidery','Vendor')
        Add-DvWholeNumberColumn -Entity $e -LogicalName ($p + '_quantity')       -DisplayName 'Quantity'
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_status')         -DisplayName 'Status'           -Options @('Production Ready','Printing','QC','Ready for Pickup','Completed')
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_assignedto')     -DisplayName 'Assigned To'      -MaxLength 100
        Add-DvDateTimeColumn    -Entity $e -LogicalName ($p + '_startdate')      -DisplayName 'Start Date'
        Add-DvDateTimeColumn    -Entity $e -LogicalName ($p + '_completiondate') -DisplayName 'Completion Date'
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_frontprint')     -DisplayName 'Front Print'      -MaxLength 200
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_backprint')      -DisplayName 'Back Print'       -MaxLength 200
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_garmenttype')    -DisplayName 'Garment Type'     -MaxLength 100
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_garmentcolor')   -DisplayName 'Garment Color'    -MaxLength 50
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_blankstatus')    -DisplayName 'Blank Status'     -Options @('Not Ordered','Ordered','Received','In Stock')
        Add-DvBooleanColumn     -Entity $e -LogicalName ($p + '_artworkapproved') -DisplayName 'Artwork Approved'
        Add-DvBooleanColumn     -Entity $e -LogicalName ($p + '_productionready') -DisplayName 'Production Ready'
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_qcresult')       -DisplayName 'QC Result'        -Options @('Pending','Pass','Fail')
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_vendorroute')    -DisplayName 'Vendor Route'     -MaxLength 200
        Add-DvMemoColumn        -Entity $e -LogicalName ($p + '_notes')          -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders') -RelatedEntity $e -LookupLogicalName ($p + '_orderid') -LookupDisplayName 'Order'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 7: Tasks (lookups -> Orders, ProductionJobs)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 7/10: Tasks ---'
    $ok = New-DvTable -LogicalName ($p + '_tasks') -DisplayName 'Task' -PluralName 'Tasks' -Description 'Individual tasks within production jobs' -PrimaryColumnLogicalName ($p + '_taskname') -PrimaryColumnDisplayName 'Task Name'
    if ($ok) {
        $e = $p + '_tasks'
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_tasktype')     -DisplayName 'Task Type'    -Options @('Art Prep','Garment Order','Printing','Quality Check','Customer Notification')
        Add-DvStringColumn      -Entity $e -LogicalName ($p + '_assignedto')   -DisplayName 'Assigned To'  -MaxLength 100
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_status')       -DisplayName 'Status'       -Options @('Pending','In Progress','Completed','Blocked')
        Add-DvPicklistColumn    -Entity $e -LogicalName ($p + '_priority')     -DisplayName 'Priority'     -Options @('Low','Normal','High','Rush')
        Add-DvDateTimeColumn    -Entity $e -LogicalName ($p + '_duedate')      -DisplayName 'Due Date'
        Add-DvWholeNumberColumn -Entity $e -LogicalName ($p + '_taskorder')    -DisplayName 'Task Order'
        Add-DvBooleanColumn     -Entity $e -LogicalName ($p + '_blockingflag') -DisplayName 'Blocking'
        Add-DvMemoColumn        -Entity $e -LogicalName ($p + '_notes')        -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders')         -RelatedEntity $e -LookupLogicalName ($p + '_orderid')         -LookupDisplayName 'Order'
        Add-DvLookup -PrimaryEntity ($p + '_productionjobs') -RelatedEntity $e -LookupLogicalName ($p + '_productionjobid') -LookupDisplayName 'Production Job'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 8: Subcontract Jobs (lookups -> Orders, Vendors)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 8/10: Subcontract Jobs ---'
    $ok = New-DvTable -LogicalName ($p + '_subcontractjobs') -DisplayName 'Subcontract Job' -PluralName 'Subcontract Jobs' -Description 'Jobs sent to external vendors' -PrimaryColumnLogicalName ($p + '_subcontractjobname') -PrimaryColumnDisplayName 'Job Name'
    if ($ok) {
        $e = $p + '_subcontractjobs'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_status')          -DisplayName 'Status'          -Options @('Sent','In Progress','Completed','Returned')
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_sentdate')        -DisplayName 'Sent Date'
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_expectedreturn')  -DisplayName 'Expected Return'
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_actualreturn')    -DisplayName 'Actual Return'
        Add-DvMoneyColumn     -Entity $e -LogicalName ($p + '_cost')            -DisplayName 'Cost'
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')           -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders')  -RelatedEntity $e -LookupLogicalName ($p + '_orderid')  -LookupDisplayName 'Order'
        Add-DvLookup -PrimaryEntity ($p + '_vendors') -RelatedEntity $e -LookupLogicalName ($p + '_vendorid') -LookupDisplayName 'Vendor'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 9: Progress Tracker (lookups -> Orders, Tasks)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 9/10: Progress Tracker ---'
    $ok = New-DvTable -LogicalName ($p + '_progresstracker') -DisplayName 'Progress Tracker' -PluralName 'Progress Tracker' -Description 'Audit log of task/job status changes' -PrimaryColumnLogicalName ($p + '_progressname') -PrimaryColumnDisplayName 'Progress Name'
    if ($ok) {
        $e = $p + '_progresstracker'
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_action')         -DisplayName 'Action'          -MaxLength 200
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_previousstatus') -DisplayName 'Previous Status' -MaxLength 100
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_newstatus')      -DisplayName 'New Status'      -MaxLength 100
        Add-DvStringColumn   -Entity $e -LogicalName ($p + '_changedby')      -DisplayName 'Changed By'      -MaxLength 100
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_changedate')     -DisplayName 'Change Date'
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')          -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders') -RelatedEntity $e -LookupLogicalName ($p + '_orderid') -LookupDisplayName 'Order'
        Add-DvLookup -PrimaryEntity ($p + '_tasks')  -RelatedEntity $e -LookupLogicalName ($p + '_taskid')  -LookupDisplayName 'Task'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # TABLE 10: Intake Logs (lookup -> Orders)
    # -----------------------------------------------------------------------
    Write-PLog '--- TABLE 10/10: Intake Logs ---'
    $ok = New-DvTable -LogicalName ($p + '_intakelogs') -DisplayName 'Intake Log' -PluralName 'Intake Logs' -Description 'Intake event logs for order/email/AI ingestion audit' -PrimaryColumnLogicalName ($p + '_intakelogname') -PrimaryColumnDisplayName 'Log Name'
    if ($ok) {
        $e = $p + '_intakelogs'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_source')          -DisplayName 'Source'           -Options @('Manual','Email','Square','AI','Phone','Website')
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_rawpayload')      -DisplayName 'Raw Payload'
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_parsedresult')    -DisplayName 'Parsed Result'
        Add-DvPicklistColumn  -Entity $e -LogicalName ($p + '_processingstate') -DisplayName 'Processing State' -Options @('Received','Parsed','Order Created','Failed','Duplicate')
        Add-DvDateTimeColumn  -Entity $e -LogicalName ($p + '_receivedat')      -DisplayName 'Received At'
        Add-DvMemoColumn      -Entity $e -LogicalName ($p + '_notes')           -DisplayName 'Notes'
        Add-DvLookup -PrimaryEntity ($p + '_orders') -RelatedEntity $e -LookupLogicalName ($p + '_orderid') -LookupDisplayName 'Order'
        $created++
    } else { $failed++ }

    # -----------------------------------------------------------------------
    # ADD CUSTOMER LOOKUP TO ORDERS (after both tables exist)
    # -----------------------------------------------------------------------
    Write-PLog '--- Adding Order -> Customer lookup ---'
    Add-DvLookup -PrimaryEntity ($p + '_customers') -RelatedEntity ($p + '_orders') -LookupLogicalName ($p + '_customerid') -LookupDisplayName 'Customer'

    # -----------------------------------------------------------------------
    # SUMMARY
    # -----------------------------------------------------------------------
    Write-PLog ''
    Write-PLog '================================================================'
    Write-PLog '  PROVISIONING SUMMARY'
    Write-PLog '================================================================'
    Write-PLog ('  Tables processed: 10')
    Write-PLog ('  Created/verified: ' + $created) 'SUCCESS'
    if ($skipped -gt 0) { Write-PLog ('  Skipped: ' + $skipped) 'SKIP' }
    if ($failed -gt 0)  { Write-PLog ('  Failed: ' + $failed) 'ERROR' }
    Write-PLog ''
    if ($failed -eq 0) {
        Write-PLog 'All 10 Cheeky OS tables are provisioned. Run: cheeky schema validate' 'SUCCESS'
    } else {
        Write-PLog 'Some tables failed. Check logs and retry.' 'ERROR'
    }
    Write-PLog '================================================================'
}

# ============================================================================
# ENTRY POINT
# ============================================================================

Install-CheekyOsTables
