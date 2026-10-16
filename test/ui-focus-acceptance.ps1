param(
  [Parameter(Mandatory = $true)]
  [string]$WorkspacePath,
  [switch]$InvokeTerminalAction,
  [switch]$DoubleClickFromBackground
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CodexNotifierUiProbe {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int command);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
}
'@

$window = Get-Process Code -ErrorAction Stop | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $window) { throw 'No visible VS Code window is available for acceptance.' }
if ($InvokeTerminalAction -or $DoubleClickFromBackground) {
  trap { [void][CodexNotifierUiProbe]::ShowWindow($window.MainWindowHandle, 9); throw }
  [void][CodexNotifierUiProbe]::ShowWindow($window.MainWindowHandle, 6)
  Start-Sleep -Milliseconds 300
  $before = [CodexNotifierUiProbe]::GetForegroundWindow()
  [uint32]$backgroundProcessId = 0
  [void][CodexNotifierUiProbe]::GetWindowThreadProcessId($before, [ref]$backgroundProcessId)
  if ($backgroundProcessId -eq $window.Id) { throw 'VS Code did not leave the foreground after minimizing.' }
} else {
  $before = [CodexNotifierUiProbe]::GetForegroundWindow()
}

$threadId = "focus-ui-$([guid]::NewGuid().ToString('N'))"
$turnId = 'double-click-focus'
$payload = @{
  type = 'agent-turn-complete'
  'thread-id' = $threadId
  'turn-id' = $turnId
  cwd = (Resolve-Path -LiteralPath $WorkspacePath).Path
  'last-assistant-message' = 'Synthetic UI acceptance payload; must not be stored.'
} | ConvertTo-Json -Compress

$bridge = Join-Path $projectRoot 'scripts\bridges\codex\notify-vscode.ps1'
& $bridge $payload -SkipLegacyNotifier
if (-not $?) { throw 'The Codex notification bridge failed.' }

$messageBase64 = & node -e "const n=require('./source/notification');const e=n.parseCodexNotification({type:'agent-turn-complete','thread-id':'a','turn-id':'b'});process.stdout.write(Buffer.from(e.message,'utf8').toString('base64'))"
$message = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($messageBase64 -join '').Trim()))

$windowElement = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Children,
  [System.Windows.Automation.Condition]::TrueCondition
) | Where-Object { $_.Current.ProcessId -eq $window.Id } | Select-Object -First 1
if (-not $windowElement) { throw 'Could not locate the VS Code window in UI Automation.' }

$targetLabelBase64 = & node -e "const ui=require('./source/notification-ui');process.stdout.write(Buffer.from(ui.TERMINAL_ACTION,'utf8').toString('base64'))"
$targetLabel = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($targetLabelBase64 -join '').Trim()))
$targetText = if ($InvokeTerminalAction) { $targetLabel } else { $message }
$condition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty,
  [string]$targetText,
  [System.Windows.Automation.PropertyConditionFlags]::IgnoreCase
)
$searchRoot = if ($DoubleClickFromBackground) { [System.Windows.Automation.AutomationElement]::RootElement } else { $windowElement }
$deadline = [DateTime]::UtcNow.AddSeconds(20)
$notification = $null
while (-not $notification -and [DateTime]::UtcNow -lt $deadline) {
  $notification = $searchRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)
  if (-not $notification) { Start-Sleep -Milliseconds 250 }
}
if (-not $notification) { throw 'The notification text was not found in the VS Code accessibility tree.' }

if ($InvokeTerminalAction) {
  $pattern = $notification.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pattern.Invoke()
} else {
  if ($DoubleClickFromBackground -and $notification.Current.IsOffscreen) {
    throw 'The notification body is offscreen while the VS Code window is minimized.'
  }
  $bounds = $notification.Current.BoundingRectangle
  if ($bounds.Width -le 1 -or $bounds.Height -le 1) { throw 'The notification text has no usable screen bounds.' }
  $x = [int]($bounds.Left + ($bounds.Width / 2))
  $y = [int]($bounds.Top + ($bounds.Height / 2))
  [void][CodexNotifierUiProbe]::SetCursorPos($x, $y)
  foreach ($click in 1..2) {
    [CodexNotifierUiProbe]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [CodexNotifierUiProbe]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    if ($click -eq 1) { Start-Sleep -Milliseconds 120 }
  }
}
Start-Sleep -Milliseconds 800
$after = [CodexNotifierUiProbe]::GetForegroundWindow()
[uint32]$foregroundProcessId = 0
[void][CodexNotifierUiProbe]::GetWindowThreadProcessId($after, [ref]$foregroundProcessId)

[pscustomobject]@{
  notificationFound = $true
  interaction = if ($InvokeTerminalAction) { 'invoke-terminal-action' } elseif ($DoubleClickFromBackground) { "background-double-click-$x,$y" } else { "double-click-$x,$y" }
  foregroundBefore = $before.ToInt64()
  foregroundAfter = $after.ToInt64()
  foregroundProcessIdAfter = $foregroundProcessId
  targetCodeProcessId = $window.Id
  focusedTargetWindow = ($foregroundProcessId -eq $window.Id)
} | ConvertTo-Json -Compress

if ($foregroundProcessId -ne $window.Id) { throw 'The tested interaction did not focus the target VS Code window.' }
