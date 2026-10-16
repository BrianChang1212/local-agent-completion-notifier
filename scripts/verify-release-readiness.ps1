[CmdletBinding()]
param(
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = Split-Path -Parent $PSScriptRoot
}
$manifestPath = Join-Path $ProjectRoot 'package.json'
$licensePath = Join-Path $ProjectRoot 'LICENSE'
$readmePath = Join-Path $ProjectRoot 'README.md'
$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$issues = [Collections.Generic.List[string]]::new()

if ([string]::IsNullOrWhiteSpace([string]$manifest.license) -or
    [string]$manifest.license -match '^(?i:UNLICENSED|SEE LICENSE|PROPRIETARY)$') {
    $issues.Add('Select an open-source SPDX license and update package.json and LICENSE.')
}

$repositoryUrl = if ($manifest.repository -is [string]) {
    [string]$manifest.repository
} else {
    [string]$manifest.repository.url
}
$parsedRepository = $null
if ([string]::IsNullOrWhiteSpace($repositoryUrl) -or
    -not [Uri]::TryCreate($repositoryUrl, [UriKind]::Absolute, [ref]$parsedRepository) -or
    $parsedRepository.Scheme -ne 'https' -or
    $repositoryUrl -match '(?i)example|placeholder|your[-_ ]?(owner|username|repo|repository)|[<>]') {
    $issues.Add('Set package.json repository.url to the public source repository URL.')
}

if (-not (Test-Path -LiteralPath $licensePath -PathType Leaf)) {
    $issues.Add('Add the selected license text as LICENSE.')
} else {
    $licenseText = Get-Content -LiteralPath $licensePath -Raw -Encoding UTF8
    if ($licenseText -match '(?i)private local use|all rights reserved|private workspace') {
        $issues.Add('Replace the current private-use LICENSE text with the selected open-source license text.')
    }
}

if (-not (Test-Path -LiteralPath $readmePath -PathType Leaf)) {
    $issues.Add('README.md is required for packaging.')
}

if ($issues.Count -gt 0) {
    foreach ($issue in $issues) { [Console]::Error.WriteLine("RELEASE BLOCKED: $issue") }
    exit 1
}

Write-Output "Release metadata ready: $($manifest.license), $repositoryUrl"
