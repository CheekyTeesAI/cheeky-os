<# Cheeky command runner: cheeky deploy | redeploy | repair | logs | export | import #>
param([string[]]$Args)

$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptRoot = Split-Path -Parent $ScriptPath
$deployScript = Join-Path $ScriptRoot 'deploy-cheeky-solution.ps1'

function Show-Usage { Write-Host "Usage: cheeky deploy|redeploy|repair|logs|export|import" }

if ($Args.Count -eq 0) { Show-Usage; exit 1 }

$cmd = $Args[0].ToLower()
switch ($cmd) {
    'deploy' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript @Args[1..($Args.Count-1)] }
    'redeploy' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript -SkipPack:$false @Args[1..($Args.Count-1)] }
    'repair' { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript -UseServicePrincipal @Args[1..($Args.Count-1)] }
    'logs' { Get-ChildItem -Path (Join-Path $ScriptRoot 'logs') -File | Sort-Object LastWriteTime -Descending }
    'export' { Write-Host '[INFO] Exporting solution'; & pac solution export --name (Get-Content -Path (Join-Path $ScriptRoot 'deployment-config.json') | ConvertFrom-Json).SolutionName --path (Get-Content -Path (Join-Path $ScriptRoot 'deployment-config.json') | ConvertFrom-Json).SolutionZip --environment (Get-Content -Path (Join-Path $ScriptRoot 'deployment-config.json') | ConvertFrom-Json).Environment }
    'import' { Write-Host '[INFO] Importing solution'; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deployScript }
    default { Show-Usage }
}
