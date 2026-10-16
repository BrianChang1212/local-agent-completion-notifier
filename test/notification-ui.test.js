'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { FOCUS_ACTION, TERMINAL_ACTION, showCompletionNotification, showCompletionReminder } = require('../source/notification-ui');

test('offers a terminal action and focuses the matching window and terminal', async () => {
  const calls = [];
  const terminal = { show: (...args) => calls.push(['terminal.show', ...args]) };
  const vscode = {
    window: {
      terminals: [terminal],
      showInformationMessage: async (...args) => {
        calls.push(['showInformationMessage', ...args]);
        return args[1];
      },
    },
    commands: {
      executeCommand: async (...args) => calls.push(['executeCommand', ...args]),
    },
  };

  await showCompletionNotification(vscode, { message: 'Codex turn completed.' }, terminal);

  assert.deepEqual(calls, [
    ['showInformationMessage', 'Codex turn completed.', TERMINAL_ACTION],
    ['executeCommand', 'workbench.action.focusWindow'],
    ['terminal.show', false],
  ]);
});

test('does not focus the window or terminal when the notification is dismissed', async () => {
  const calls = [];
  const terminal = { show: (...args) => calls.push(['terminal.show', ...args]) };
  const vscode = {
    window: { terminals: [terminal], showInformationMessage: async () => undefined },
    commands: { executeCommand: async (...args) => calls.push(['executeCommand', ...args]) },
  };

  await showCompletionNotification(vscode, { message: 'Codex turn completed.' }, terminal);

  assert.deepEqual(calls, []);
});

test('does not focus another terminal if the matched terminal was closed before selection', async () => {
  const calls = [];
  const terminal = { show: () => calls.push('terminal.show') };
  const vscode = {
    window: {
      terminals: [],
      showInformationMessage: async (_message, action) => action,
      showWarningMessage: async (...args) => calls.push(['showWarningMessage', ...args]),
    },
    commands: { executeCommand: async (...args) => calls.push(['executeCommand', ...args]) },
  };

  await showCompletionNotification(vscode, { message: 'Codex turn completed.' }, terminal);

  assert.deepEqual(calls, [['showWarningMessage', '原 Codex terminal 已關閉，無法切換。']]);
});

test('keeps the window focus action for legacy v1 notifications', async () => {
  const calls = [];
  const vscode = {
    window: {
      showInformationMessage: async (_message, action) => action,
      terminals: [],
    },
    commands: { executeCommand: async (...args) => calls.push(args) },
  };

  await showCompletionNotification(vscode, { message: 'Codex turn completed.' });

  assert.deepEqual(calls, [['workbench.action.focusWindow']]);
  assert.equal(FOCUS_ACTION, '聚焦此 VS Code 視窗');
});

test('uses the Kiro label when its matched terminal has closed', async () => {
  const calls = [];
  const terminal = { show: () => calls.push('terminal.show') };
  const vscode = {
    window: {
      terminals: [],
      showInformationMessage: async (_message, action) => action,
      showWarningMessage: async (...args) => calls.push(['showWarningMessage', ...args]),
    },
    commands: { executeCommand: async (...args) => calls.push(['executeCommand', ...args]) },
  };

  await showCompletionNotification(vscode, {
    provider: 'kiro',
    message: 'Kiro 回合已結束，請查看對話結果。',
  }, terminal);

  assert.deepEqual(calls, [['showWarningMessage', '原 Kiro terminal 已關閉，無法切換。']]);
});

test('shows an unmatched Kiro reminder without offering a focus or terminal action', async () => {
  const calls = [];
  const vscode = {
    window: { showInformationMessage: async (...args) => calls.push(args) },
    commands: { executeCommand: async (...args) => calls.push(args) },
  };

  await showCompletionReminder(vscode, { message: 'Kiro 回合已結束，請查看對話結果。' });

  assert.deepEqual(calls, [['Kiro 回合已結束，請查看對話結果。']]);
});
