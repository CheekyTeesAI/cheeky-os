# ================================================
# CHEEKY OS - Force Assign System Administrator
#
# This script assigns System Administrator to Customer.service@cheekyteesllc.com
# by connecting to Dataverse as Larry@cheekyteesllc.com (existing admin).
#
# >>> RUN THIS IN A STANDALONE POWERSHELL WINDOW (NOT VS TERMINAL) <<<
#
#   1. Open Windows PowerShell from Start Menu
#   2. cd C:\Users\PatCo\source\repos\CheekyAPI
#   3. .\force-assign-sysadmin.ps1
#   4. When login popup appears, sign in as Larry@cheekyteesllc.com
# ================================================

$ErrorActionPreference = 'Stop'

$TargetUserId   = '05927cb8-947c-f011-b4cc-7c1e525be54a'
$SysAdminRoleId = '559463ed-8464-f011-bec1-002248347247'
$OrgUrl         = 'https://org143bbb56.crm.dynamics.com'

Write-Host '=== ASSIGN SYSTEM ADMINISTRATOR ===' -ForegroundColor Cyan
Write-Host '  Target: customer.service@cheekyteesllc.com' -ForegroundColor Gray
Write-Host '  Sign in as: Larry@cheekyteesllc.com' -ForegroundColor White
Write-Host ''

# Step 1: Install SDK module
$mod = 'Microsoft.Xrm.Tooling.CrmConnector.PowerShell'
if (-not (Get-Module -ListAvailable -Name $mod)) {
    Write-Host 'Installing Dataverse SDK...' -ForegroundColor Yellow
    Install-Module $mod -Scope CurrentUser -Force
}
Import-Module $mod -Force

# Step 2: Connect as Larry (interactive login popup)
Write-Host 'Connecting to Dataverse...' -ForegroundColor Yellow
Write-Host '>>> Sign in as Larry@cheekyteesllc.com in the popup <<<' -ForegroundColor White
$conn = Get-CrmConnection -InteractiveMode

if (-not $conn -or -not $conn.IsReady) {
    Write-Host 'Connection failed. Ensure you signed in as Larry.' -ForegroundColor Red
    exit 1
}
Write-Host "Connected to: $($conn.ConnectedOrgFriendlyName)" -ForegroundColor Green

# Step 3: Assign role
Write-Host 'Assigning System Administrator...' -ForegroundColor Yellow

$roleRef = New-Object Microsoft.Xrm.Sdk.EntityReference('role', [Guid]$SysAdminRoleId)
$roleColl = New-Object Microsoft.Xrm.Sdk.EntityReferenceCollection
$roleColl.Add($roleRef)
$relationship = New-Object Microsoft.Xrm.Sdk.Relationship('systemuserroles_association')

try {
    $conn.Associate('systemuser', [Guid]$TargetUserId, $relationship, $roleColl)
    Write-Host 'SUCCESS: System Administrator assigned!' -ForegroundColor Green
}
catch {
    if ($_.Exception.Message -match 'duplicate|already exists') {
        Write-Host 'Already assigned. OK.' -ForegroundColor Green
    }
    else {
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Verify
Write-Host 'Verifying...' -ForegroundColor Yellow
$fetch = @"
<fetch>
  <entity name='systemuserroles'>
    <attribute name='roleid'/>
    <link-entity name='role' from='roleid' to='roleid'>
      <attribute name='name'/>
    </link-entity>
    <filter>
      <condition attribute='systemuserid' operator='eq' value='$TargetUserId'/>
    </filter>
  </entity>
</fetch>
"@

$roles = (Get-CrmRecordsByFetch -conn $conn -Fetch $fetch).CrmRecords
foreach ($r in $roles) {
    Write-Host "  - $($r.'role1.name')" -ForegroundColor Gray
}

if ($roles | Where-Object { $_.'role1.name' -eq 'System Administrator' }) {
    Write-Host 'CONFIRMED: System Administrator is assigned.' -ForegroundColor Green
}

Write-Host ''
Write-Host '=== DONE ===' -ForegroundColor Cyan
Write-Host 'Now run in VS terminal:' -ForegroundColor White
Write-Host '  pac solution import --path "CheekyOsSolution\CheekyOs_deploy.zip" --force-overwrite --async' -ForegroundColor DarkCyan
