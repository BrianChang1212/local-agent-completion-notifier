[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\bridges\codex\notify-vscode.ps1'
$localAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
}
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw 'Could not determine the Local AppData directory.'
}

$bridgeDirectory = Join-Path $localAppData 'LocalAgentCompletionNotifier\bridge'
$destinationPath = Join-Path $bridgeDirectory 'notify-codex.ps1'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Codex bridge was not found: $sourcePath"
}

New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force

$escapedPath = $destinationPath.Replace('\', '\\').Replace('"', '\"')
$toml = "notify = [`"powershell.exe`", `"-NoLogo`", `"-NoProfile`", `"-NonInteractive`", `"-ExecutionPolicy`", `"Bypass`", `"-File`", `"$escapedPath`"]"
Write-Output "Installed Codex bridge: $destinationPath"
Write-Output 'Add this line to the user-level Codex config.toml, preserving any existing notify command as needed:'
Write-Output $toml
