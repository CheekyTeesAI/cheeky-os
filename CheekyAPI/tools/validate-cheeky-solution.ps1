param(
    [string]$SolutionPath = "C:\Users\PatCo\source\repos\CheekyAPI\CheekyTeesAutomationSolution"
)

Write-Host "Validating solution at: $SolutionPath"

if (-not (Test-Path $SolutionPath)) {
    Write-Host "ERROR: Solution folder not found: $SolutionPath"
    exit 2
}

$custom = Join-Path $SolutionPath "Other\Customizations.xml"
if (-not (Test-Path $custom)) {
    Write-Host "ERROR: Customizations.xml not found at: $custom"
    exit 2
}

try {
    [xml]$doc = Get-Content $custom
} catch {
    Write-Host "ERROR: Failed to parse Customizations.xml: $_"
    exit 3
}

$refs = @()
$nodes = $doc.SelectNodes('//EntityFile')
if ($nodes) { foreach ($n in $nodes) { $refs += $n.'#text' } }
$nodes = $doc.SelectNodes('//RelationshipFile')
if ($nodes) { foreach ($n in $nodes) { $refs += $n.'#text' } }
$nodes = $doc.SelectNodes('//WorkflowFile')
if ($nodes) { foreach ($n in $nodes) { $refs += $n.'#text' } }
$nodes = $doc.SelectNodes('//FlowFile')
if ($nodes) { foreach ($n in $nodes) { $refs += $n.'#text' } }
$nodes = $doc.SelectNodes('//RootComponents//RootComponent//Id')
if ($nodes) { foreach ($n in $nodes) { $refs += $n.'#text' } }

$refs = $refs | Where-Object { $_ -and $_.Trim().Length -gt 0 } | Select-Object -Unique

$missing = @()
foreach ($rel in $refs) {
    # skip GUIDs
    if ($rel -match '^\{?[0-9a-fA-F-]{36}\}?$') { continue }
    $path = Join-Path $SolutionPath ($rel -replace '/','\\')
    if (-not (Test-Path $path)) { $missing += $path }
}

# check core files
$core = @(
    Join-Path $SolutionPath 'Solution.xml',
    Join-Path $SolutionPath 'publisher.xml',
    Join-Path $SolutionPath 'Other\Customizations.xml'
)
foreach ($c in $core) { if (-not (Test-Path $c)) { $missing += $c } }

if ($missing.Count -eq 0) {
    Write-Host "OK: All referenced files found."
    exit 0
} else {
    Write-Host "MISSING FILES OR REFERENCES:";
    foreach ($m in $missing) { Write-Host " - $m" }
    exit 1
}
