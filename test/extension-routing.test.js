'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const test = require('node:test');

test('unmatched Codex turn shows one reminder without a terminal action and consumes the event', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-unmatched-turn-'));
  const pendingRoot = path.join(dataRoot, 'pending');
  const eventPath = path.join(pendingRoot, 'thread_turn.json');
  fs.mkdirSync(pendingRoot);
  fs.writeFileSync(eventPath, JSON.stringify({
    schemaVersion: 2,
    id: 'thread:turn',
    threadId: 'thread',
    turnId: 'turn',
    cwd: dataRoot,
    completedAt: new Date(Date.now() - 3000).toISOString(),
    sourceProcesses: [],
    title: 'Codex 回合已結束',
    message: 'Codex 回合已結束，請查看對話結果。',
  }));

  const messages = [];
  const subscriptions = [];
  const vscode = {
    window: {
      terminals: [],
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showInformationMessage: async (...args) => { messages.push(args); return undefined; },
    },
    workspace: { workspaceFolders: [{ uri: { scheme: 'file', fsPath: dataRoot } }] },
  };
  const previousRoot = process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT;
  const originalLoad = Module._load;
  const extensionPath = require.resolve('../source/extension');
  process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = dataRoot;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[extensionPath];
    const { activate } = require('../source/extension');
    await activate({ subscriptions });
    assert.deepEqual(messages, [['Codex 回合已結束，請查看對話結果。']]);
    assert.equal(fs.existsSync(eventPath), false);
  } finally {
    for (const subscription of subscriptions) subscription.dispose();
    delete require.cache[extensionPath];
    Module._load = originalLoad;
    if (previousRoot === undefined) delete process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT;
    else process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = previousRoot;
    if (fs.existsSync(eventPath)) fs.unlinkSync(eventPath);
    const markerPath = `${eventPath}.reminded`;
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    fs.rmdirSync(pendingRoot);
    fs.rmdirSync(dataRoot);
  }
});

test('matched Codex turn offers a terminal action and switches only after selection', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-matched-turn-'));
  const pendingRoot = path.join(dataRoot, 'pending');
  const eventPath = path.join(pendingRoot, 'thread_turn.json');
  fs.mkdirSync(pendingRoot);
  fs.writeFileSync(eventPath, JSON.stringify({
    schemaVersion: 2,
    id: 'thread:turn',
    threadId: 'thread',
    turnId: 'turn',
    cwd: dataRoot,
    completedAt: new Date().toISOString(),
    sourceProcesses: [{ pid: 10, parentPid: 0, createdAt: new Date().toISOString() }],
    title: 'Codex 回合已結束',
    message: 'Codex 回合已結束，請查看對話結果。',
  }));

  const calls = [];
  const terminal = { name: 'Codex source', processId: Promise.resolve(10), show: () => calls.push('show terminal') };
  const vscode = {
    window: {
      terminals: [terminal],
      activeTerminal: terminal,
      createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
      showInformationMessage: async (_message, action) => {
        calls.push(action);
        assert.equal(calls.includes('show terminal'), false);
        return action;
      },
    },
    workspace: { workspaceFolders: [{ uri: { scheme: 'file', fsPath: dataRoot } }] },
    commands: { executeCommand: async () => calls.push('focus window') },
  };
  const subscriptions = [];
  const previousRoot = process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT;
  const originalLoad = Module._load;
  const matcher = require('../source/terminal-matcher');
  const originalMatcher = matcher.findMatchingTerminal;
  const extensionPath = require.resolve('../source/extension');
  process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = dataRoot;
  matcher.findMatchingTerminal = async () => terminal;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[extensionPath];
    const { activate } = require('../source/extension');
    await activate({ subscriptions });
    assert.deepEqual(calls, ['切換至此 session terminal', 'focus window', 'show terminal']);
    assert.equal(fs.existsSync(eventPath), false);
  } finally {
    for (const subscription of subscriptions) subscription.dispose();
    delete require.cache[extensionPath];
    matcher.findMatchingTerminal = originalMatcher;
    Module._load = originalLoad;
    if (previousRoot === undefined) delete process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT;
    else process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT = previousRoot;
    if (fs.existsSync(eventPath)) fs.unlinkSync(eventPath);
    const markerPath = `${eventPath}.reminded`;
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
    fs.rmdirSync(pendingRoot);
    fs.rmdirSync(dataRoot);
  }
});
