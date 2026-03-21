Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = "C:\Users\PatCo\source\repos\CheekyAPI"
$zipPath = "$root\CheekyOsSolution\CheekyOs_deploy.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

$entities = @()
foreach ($ent in @("ct_orders","ct_customers","ct_tasks","ct_productionjobs")) {
    $xml = Get-Content "$root\CheekyOsSolution\src\Entities\$ent\Entity.xml" -Raw
    $xml = $xml -replace '<\?xml[^?]*\?>\s*', ''
    $xml = $xml -replace '\s*xmlns:xsi="[^"]*"', ''
    $entities += $xml
}

$allEntities = $entities -join "`n"
$custXml = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<ImportExportXml xmlns:xsi=`"http://www.w3.org/2001/XMLSchema-instance`">`n<Entities>`n$allEntities`n</Entities>`n<Roles /><Workflows /><FieldSecurityProfiles /><Templates /><EntityMaps /><EntityRelationships /><OrganizationSettings /><optionsets /><CustomControls /><SolutionPluginAssemblies /><EntityDataProviders />`n<Languages><Language>1033</Language></Languages>`n</ImportExportXml>"

$solXml = Get-Content "$root\CheekyOsSolution\src\Other\Solution.xml" -Raw
$ctXml = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/octet-stream" /></Types>'

$tmpDir = "$root\CheekyOsSolution\_tmp_zip"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }
New-Item $tmpDir -ItemType Directory -Force | Out-Null

# Use LiteralPath for the bracket filename
[System.IO.File]::WriteAllText("$tmpDir\[Content_Types].xml", $ctXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$tmpDir\solution.xml", $solXml, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText("$tmpDir\customizations.xml", $custXml, [System.Text.Encoding]::UTF8)

[System.IO.Compression.ZipFile]::CreateFromDirectory($tmpDir, $zipPath)
Remove-Item $tmpDir -Recurse -Force

$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
foreach ($e in $zip.Entries) { Write-Host "$($e.FullName) ($($e.Length) bytes)" }
$zip.Dispose()
Write-Host "TOTAL: $((Get-Item $zipPath).Length) bytes"
