param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Payload,
    [switch]$SkipLegacyNotifier
)

$ErrorActionPreference = 'Stop'

try {
    $notification = $Payload | ConvertFrom-Json -ErrorAction Stop
} catch {
    [Console]::Error.WriteLine('Codex notification payload is not valid JSON.')
    exit 2
}

# Keep Codex's existing turn-ended notification behavior by forwarding the
# original payload to its installed notifier after queuing the VS Code event.
$legacyNotifier = $null
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\runtimes\cua_node'
if (Test-Path -LiteralPath $runtimeRoot -PathType Container) {
    $legacyNotifier = Get-ChildItem -LiteralPath $runtimeRoot -Directory |
        Sort-Object LastWriteTimeUtc -Descending |
        ForEach-Object { Join-Path $_.FullName 'bin\node_modules\@oai\sky\bin\windows\codex-computer-use.exe' } |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}

if ($notification.type -eq 'agent-turn-complete') {
    $dataRoot = $env:LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT
    if ([string]::IsNullOrWhiteSpace($dataRoot)) {
        $dataRoot = Join-Path $env:LOCALAPPDATA 'LocalAgentCompletionNotifier'
    }
    $pendingRoot = Join-Path $dataRoot 'pending'
    New-Item -ItemType Directory -Path $pendingRoot -Force | Out-Null

    $threadId = [string]$notification.'thread-id'
    $turnId = [string]$notification.'turn-id'
    if ([string]::IsNullOrWhiteSpace($threadId)) { $threadId = 'unknown-thread' }
    if ([string]::IsNullOrWhiteSpace($turnId)) { $turnId = [guid]::NewGuid().ToString('N') }

    $safeThread = [regex]::Replace($threadId, '[^A-Za-z0-9_.-]', '_')
    $safeTurn = [regex]::Replace($turnId, '[^A-Za-z0-9_.-]', '_')
    $eventPath = Join-Path $pendingRoot ($safeThread + '_' + $safeTurn + '.json')

    if (-not (Test-Path -LiteralPath $eventPath -PathType Leaf)) {
        $sourceProcesses = @()
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
            $sourceProcesses = @()
            [Console]::Error.WriteLine("Could not capture the Codex notification process ancestry: $($_.Exception.Message)")
        }

        $event = [ordered]@{
            schemaVersion = 2
            id            = $threadId + ':' + $turnId
            threadId      = $threadId
            turnId        = $turnId
            cwd           = [string]$notification.cwd
            completedAt   = [DateTimeOffset]::UtcNow.ToString('o')
            sourceProcesses = @($sourceProcesses)
            title         = 'Codex 回合已結束'
            message       = 'Codex 回合已結束，請查看對話結果。'
        }
        $temporaryPath = Join-Path $pendingRoot ([guid]::NewGuid().ToString('N') + '.tmp')
        $json = ConvertTo-Json -InputObject $event -Depth 4 -Compress
        [IO.File]::WriteAllText($temporaryPath, $json, [Text.UTF8Encoding]::new($false))
        try {
            [IO.File]::Move($temporaryPath, $eventPath)
        } catch [IO.IOException] {
            if (-not (Test-Path -LiteralPath $eventPath -PathType Leaf)) { throw }
        } finally {
            if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
                Remove-Item -LiteralPath $temporaryPath -Force
            }
        }
    }
}

if (-not $SkipLegacyNotifier) {
    if ([string]::IsNullOrWhiteSpace($legacyNotifier) -or -not (Test-Path -LiteralPath $legacyNotifier -PathType Leaf)) {
        [Console]::Error.WriteLine('The existing Codex turn-ended notifier was not found.')
        exit 3
    }
    & $legacyNotifier 'turn-ended' $Payload
    exit $LASTEXITCODE
}
