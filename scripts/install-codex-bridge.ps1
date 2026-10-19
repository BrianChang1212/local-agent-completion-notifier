[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\bridges\codex\notify-vscode.ps1'
$dispatcherSourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\bridges\codex\notify-dispatch.js'
$localAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
}
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw 'Could not determine the Local AppData directory.'
}

$bridgeDirectory = Join-Path $localAppData 'LocalAgentCompletionNotifier\bridge'
$destinationPath = Join-Path $bridgeDirectory 'notify-vscode.ps1'
$dispatcherDestinationPath = Join-Path $bridgeDirectory 'notify-dispatch.js'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Codex bridge was not found: $sourcePath"
}
if (-not (Test-Path -LiteralPath $dispatcherSourcePath -PathType Leaf)) {
    throw "Codex dispatcher was not found: $dispatcherSourcePath"
}
$nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source

New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
Copy-Item -LiteralPath $dispatcherSourcePath -Destination $dispatcherDestinationPath -Force

$notifyArguments = ConvertTo-Json -InputObject @($nodeExecutable, $dispatcherDestinationPath) -Compress
$toml = "notify = $notifyArguments"
Write-Output "Installed Codex bridge: $destinationPath"
Write-Output "Installed Codex dispatcher: $dispatcherDestinationPath"
Write-Output 'Add this line to the user-level Codex config.toml, preserving any existing notify command as needed:'
Write-Output $toml
