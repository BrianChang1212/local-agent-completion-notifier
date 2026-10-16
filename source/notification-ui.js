'use strict';

const FOCUS_ACTION = '聚焦此 VS Code 視窗';
const TERMINAL_ACTION = '切換至此 session terminal';

async function showCompletionNotification(vscode, event, terminal) {
  const action = terminal ? TERMINAL_ACTION : FOCUS_ACTION;
  const selected = await vscode.window.showInformationMessage(event.message, action);
  if (selected !== action) return false;

  if (terminal) {
    if (!vscode.window.terminals.includes(terminal)) {
      const providerName = event.provider === 'kiro' ? 'Kiro' : 'Codex';
      await vscode.window.showWarningMessage(`原 ${providerName} terminal 已關閉，無法切換。`);
      return false;
    }
    await vscode.commands.executeCommand('workbench.action.focusWindow');
    terminal.show(false);
    return true;
  }

  await vscode.commands.executeCommand('workbench.action.focusWindow');
  return true;
}

async function showCompletionReminder(vscode, event) {
  await vscode.window.showInformationMessage(event.message);
  return true;
}

module.exports = { FOCUS_ACTION, TERMINAL_ACTION, showCompletionNotification, showCompletionReminder };
