[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
    }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $projectRoot 'config\kiro\completion-notifier.json'
$bridgeSource = Join-Path $projectRoot 'scripts\bridges\kiro\notify-vscode.ps1'
$hookDirectory = Join-Path $env:USERPROFILE '.kiro\hooks'
$hookPath = Join-Path $hookDirectory 'local-agent-completion-notifier.json'
$localAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
}
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw 'Could not determine the Local AppData directory.'
}
$bridgeDirectory = Join-Path $localAppData 'LocalAgentCompletionNotifier\bridge'
$bridgePath = Join-Path $bridgeDirectory 'notify-kiro.ps1'

foreach ($requiredPath in @($templatePath, $bridgeSource)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required extension file not found: $requiredPath"
    }
}

$hook = Get-Content -LiteralPath $templatePath -Raw -Encoding UTF8 | ConvertFrom-Json
if (@($hook.hooks).Count -ne 1 -or $hook.hooks[0].trigger -ne 'Stop') {
    throw 'The Kiro hook template must contain exactly one Stop hook.'
}
$commandPrefix = 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '
$hook.hooks[0].action.command = $commandPrefix + '"' + $bridgePath + '"'
$hookJson = ConvertTo-Json -InputObject $hook -Depth 10

if (Test-Path -LiteralPath $hookDirectory -PathType Container) {
    foreach ($existingHookPath in Get-ChildItem -LiteralPath $hookDirectory -Filter '*.json' -File) {
        if ($existingHookPath.FullName -eq $hookPath) { continue }
        try {
            $existingHook = Get-Content -LiteralPath $existingHookPath.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        } catch {
            continue
        }
        $oldWorkspaceBridge = @($existingHook.hooks | Where-Object {
            $_.trigger -eq 'Stop' -and
            (([string]$_.action.command) -match '(?i)[\\/]infra[\\/]scripts[\\/]kiro[\\/]notify-vscode\.ps1(?:"|$)' -or
             (([string]$_.name) -match '(?i)completion notifier' -and
              ([string]$_.action.command) -match '(?i)notify-vscode\.ps1'))
        })
        if ($oldWorkspaceBridge.Count -gt 0) {
            throw "A Kiro completion notifier hook already exists outside the managed configuration file: $($existingHookPath.Name). Back it up and remove it before installing this hook."
        }
    }
}

if (Test-Path -LiteralPath $hookPath -PathType Leaf) {
    $existingHook = Get-Content -LiteralPath $hookPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($existingHook.hooks[0].action.command -ne $hook.hooks[0].action.command) {
        throw "Existing Kiro hook differs from the generated configuration; it was preserved: $hookPath"
    }
}

New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
$sourceHash = Get-FileSha256 -Path $bridgeSource
$installedHash = if (Test-Path -LiteralPath $bridgePath -PathType Leaf) {
    Get-FileSha256 -Path $bridgePath
} else {
    $null
}
if ($installedHash -ne $sourceHash) {
    if ($null -ne $installedHash) {
        $backupPath = $bridgePath + '.bak-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
        Copy-Item -LiteralPath $bridgePath -Destination $backupPath
        Write-Output "Previous bridge backed up: $backupPath"
    }
    Copy-Item -LiteralPath $bridgeSource -Destination $bridgePath -Force
}

if (Test-Path -LiteralPath $hookPath -PathType Leaf) {
    Write-Output "Kiro hook already matches the generated configuration: $hookPath"
    exit 0
}

New-Item -ItemType Directory -Path $hookDirectory -Force | Out-Null
$temporaryPath = Join-Path $hookDirectory ([guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::WriteAllText($temporaryPath, $hookJson, [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporaryPath, $hookPath)
} finally {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}

Write-Output "Installed Kiro V3 Stop hook: $hookPath"
Write-Output "Installed bridge: $bridgePath"
