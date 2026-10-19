param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$VsixPath
)

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

$resolvedPath = (Resolve-Path -LiteralPath $VsixPath).Path
$projectRoot = Split-Path -Parent $PSScriptRoot
$expected = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($resolvedPath)
try {
    $manifestEntry = $archive.GetEntry('extension/package.json')
    if ($null -eq $manifestEntry) { throw 'VSIX is missing extension/package.json.' }
    $reader = [System.IO.StreamReader]::new($manifestEntry.Open())
    try { $actual = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }

    foreach ($field in @('name', 'publisher', 'version', 'main')) {
        if ($actual.$field -ne $expected.$field) { throw "VSIX $field does not match package.json." }
    }
    foreach ($relativePath in @(
        $expected.main.TrimStart('.', '/', '\'),
        'source/notification.js',
        'config/kiro/completion-notifier.json',
        'scripts/bridges/codex/notify-vscode.ps1',
        'scripts/bridges/codex/notify-dispatch.js',
        'scripts/bridges/kiro/notify-vscode.ps1',
        'scripts/install-codex-bridge.ps1',
        'scripts/install-kiro-hook.ps1',
        'source/notification-claims.js',
        'images/icon.png',
        'readme.md',
        'changelog.md'
    )) {
        $entryPath = 'extension/' + $relativePath.Replace('\', '/')
        $entry = $archive.GetEntry($entryPath)
        if ($null -eq $entry -or $entry.Length -eq 0) { throw "VSIX is missing $entryPath." }
    }

    $sensitivePatterns = @(
        '(?i)[A-Z]:\\Users\\[^\\]+',
        '(?i)[A-Z]:\\[^\\]+\\(?:systems|infra|portal|tasks|\.agents)(?:\\|$)',
        '(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b'
    )
    foreach ($entry in $archive.Entries) {
        if (-not $entry.FullName.StartsWith('extension/')) { continue }
        if ($entry.FullName -match '\.(png|vsix|woff2?)$') { continue }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        foreach ($pattern in $sensitivePatterns) {
            if ($content -match $pattern) { throw "VSIX contains a private or workspace-specific marker in $($entry.FullName)." }
        }
    }
} finally {
    $archive.Dispose()
}

$hash = Get-FileSha256 -Path $resolvedPath
Write-Output "Verified $($expected.publisher).$($expected.name) $($expected.version): $resolvedPath"
Write-Output "SHA256 $hash"
