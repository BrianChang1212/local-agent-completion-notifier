$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$bridge = Join-Path $projectRoot 'scripts\bridges\codex\notify-vscode.ps1'
$testRoot = Join-Path $PSScriptRoot '.bridge-test'
if (Test-Path -LiteralPath $testRoot) { throw "Test directory already exists: $testRoot" }

New-Item -ItemType Directory -Path $testRoot | Out-Null
$previousDataRoot = $env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT
$env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = $testRoot
try {
    $payload = @{
        type = 'agent-turn-complete'
        'thread-id' = 'thread-test'
        'turn-id' = 'turn-test'
        cwd = 'C:\workspace\project'
        'last-assistant-message' = 'PRIVATE RESPONSE MUST NOT BE STORED'
    } | ConvertTo-Json -Compress

    & $bridge $payload -SkipLegacyNotifier
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Bridge exited with $LASTEXITCODE" }
    & $bridge $payload -SkipLegacyNotifier
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Duplicate bridge call exited with $LASTEXITCODE" }

    $eventFiles = @(Get-ChildItem -LiteralPath (Join-Path $testRoot 'pending') -Filter '*.json' -File)
    if ($eventFiles.Count -ne 1) { throw "Expected one deduplicated event, found $($eventFiles.Count)." }
    $eventText = Get-Content -LiteralPath $eventFiles[0].FullName -Raw -Encoding UTF8
    if ($eventText.Contains('PRIVATE RESPONSE')) { throw 'The assistant response leaked into the event file.' }
    $event = $eventText | ConvertFrom-Json
    if ($event.id -ne 'thread-test:turn-test') { throw 'The event identifiers do not match the input.' }
    if ($event.schemaVersion -ne 2) { throw "Expected event schema v2; found $($event.schemaVersion)." }
    if (@($event.sourceProcesses).Count -eq 0) { throw 'The bridge did not record its source process chain.' }
    if (-not (@($event.sourceProcesses) | Where-Object { $_.pid -eq $PID })) { throw 'The source process chain does not contain the bridge PowerShell process.' }
    if (@($event.sourceProcesses | Where-Object { $_.PSObject.Properties.Name -contains 'CommandLine' }).Count -gt 0) {
        throw 'The source process chain must not store process command lines.'
    }

    $unsupported = $payload | ConvertFrom-Json
    $unsupported.type = 'approval-requested'
    & $bridge ($unsupported | ConvertTo-Json -Compress) -SkipLegacyNotifier
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Unsupported event call exited with $LASTEXITCODE" }
    $afterUnsupported = @(Get-ChildItem -LiteralPath (Join-Path $testRoot 'pending') -Filter '*.json' -File)
    if ($afterUnsupported.Count -ne 1) { throw 'An unsupported event created an event file.' }

    Write-Output 'PASS: event creation, duplicate suppression, unsupported event filtering, and response privacy.'
} finally {
    if ($null -eq $previousDataRoot) {
        Remove-Item Env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT -ErrorAction SilentlyContinue
    } else {
        $env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = $previousDataRoot
    }
    $pending = Join-Path $testRoot 'pending'
    if (Test-Path -LiteralPath $pending) {
        Get-ChildItem -LiteralPath $pending -File | Remove-Item -Force
        Remove-Item -LiteralPath $pending -Force
    }
    Remove-Item -LiteralPath $testRoot -Force
}
