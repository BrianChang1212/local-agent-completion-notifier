param(
    [switch]$SkipKiroProcessCheck
)

$ErrorActionPreference = 'Stop'

try {
    $rawPayload = [Console]::In.ReadToEnd()
    $hook = $rawPayload | ConvertFrom-Json -ErrorAction Stop
} catch {
    exit 0
}

if ([string]$hook.hook_event_name -ne 'Stop') { exit 0 }

$sourceProcesses = @()
$containsKiroCli = $false
try {
    $processById = @{}
    foreach ($process in Get-CimInstance -ClassName Win32_Process) {
        $processById[[int]$process.ProcessId] = $process
    }

    $seenProcessIds = [Collections.Generic.HashSet[int]]::new()
    $currentProcessId = [int]$PID
    for ($depth = 0; $depth -lt 64 -and $currentProcessId -gt 0; $depth++) {
        if (-not $seenProcessIds.Add($currentProcessId)) { break }
        $process = $processById[$currentProcessId]
        if (-not $process) { break }
        if ([string]$process.Name -ieq 'kiro-cli.exe') { $containsKiroCli = $true }

        $createdAt = ([DateTime]$process.CreationDate).ToUniversalTime().ToString('o')
        if ($sourceProcesses.Count -gt 0) {
            $childCreatedAt = [DateTimeOffset]::Parse([string]$sourceProcesses[-1].createdAt)
            $parentCreatedAt = [DateTimeOffset]::Parse($createdAt)
            if ($parentCreatedAt -gt $childCreatedAt) { break }
        }
        $sourceProcesses += [ordered]@{
            pid       = [int]$process.ProcessId
            parentPid = [int]$process.ParentProcessId
            createdAt = $createdAt
        }
        $currentProcessId = [int]$process.ParentProcessId
    }
} catch {
    exit 0
}

if (-not $SkipKiroProcessCheck -and -not $containsKiroCli) { exit 0 }

$dataRoot = $env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT
if ([string]::IsNullOrWhiteSpace($dataRoot)) {
    $dataRoot = Join-Path $env:LOCALAPPDATA 'LocalAgentCompletionNotifier'
}
$pendingRoot = Join-Path $dataRoot 'pending'
try {
    New-Item -ItemType Directory -Path $pendingRoot -Force | Out-Null

    $sessionId = [string]$hook.session_id
    if ([string]::IsNullOrWhiteSpace($sessionId)) { $sessionId = 'unknown-session' }
    $turnId = [guid]::NewGuid().ToString('D')
    $safeId = [regex]::Replace(($sessionId + '_' + $turnId), '[^A-Za-z0-9_.-]', '_')
    $eventPath = Join-Path $pendingRoot ('kiro_' + $safeId + '.json')
    $event = [ordered]@{
        schemaVersion  = 3
        provider       = 'kiro'
        id             = 'kiro:' + $sessionId + ':' + $turnId
        sessionId      = $sessionId
        turnId         = $turnId
        cwd            = [string]$hook.cwd
        completedAt    = [DateTimeOffset]::UtcNow.ToString('o')
        sourceProcesses = @($sourceProcesses)
        title          = 'Kiro 回合已結束'
        message        = 'Kiro 回合已結束，請查看對話結果。'
    }

    $temporaryPath = Join-Path $pendingRoot ([guid]::NewGuid().ToString('N') + '.tmp')
    $json = ConvertTo-Json -InputObject $event -Depth 4 -Compress
    [IO.File]::WriteAllText($temporaryPath, $json, [Text.UTF8Encoding]::new($false))
    try {
        [IO.File]::Move($temporaryPath, $eventPath)
    } finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
} catch {
    # Notification failures must not interrupt the Kiro response lifecycle.
}
