'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const bridge = path.join(__dirname, '..', 'scripts', 'bridges', 'kiro', 'notify-vscode.ps1');

function runBridge(testRoot, payload) {
  return spawnSync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', bridge,
    '-SkipKiroProcessCheck',
  ], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT: testRoot },
  });
}

test('Kiro bridge writes only fixed completion data and a process ancestry chain', { timeout: 10000 }, () => {
  const testRoot = path.join(__dirname, '.kiro-bridge-process-test');
  assert.equal(fs.existsSync(testRoot), false, `Test directory already exists: ${testRoot}`);
  fs.mkdirSync(testRoot);

  try {
    const result = runBridge(testRoot, {
      hook_event_name: 'Stop',
      session_id: 'kiro-session-1',
      cwd: 'C:\\workspace\\project',
      prompt: 'PRIVATE PROMPT MUST NOT BE STORED',
      response: 'PRIVATE RESPONSE MUST NOT BE STORED',
    });

    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout, '', 'Successful hooks must not add output to the Kiro conversation.');
    const files = fs.readdirSync(path.join(testRoot, 'pending')).filter((name) => name.endsWith('.json'));
    assert.equal(files.length, 1);
    const eventText = fs.readFileSync(path.join(testRoot, 'pending', files[0]), 'utf8');
    assert.equal(eventText.includes('PRIVATE PROMPT'), false);
    assert.equal(eventText.includes('PRIVATE RESPONSE'), false);
    const event = JSON.parse(eventText);
    assert.equal(event.schemaVersion, 3);
    assert.equal(event.provider, 'kiro');
    assert.equal(event.sessionId, 'kiro-session-1');
    assert.match(event.id, /^kiro:kiro-session-1:[0-9a-f-]{36}$/i);
    assert.equal(event.cwd, 'C:\\workspace\\project');
    assert.equal(event.title, 'Kiro 回合已結束');
    assert.ok(Array.isArray(event.sourceProcesses) && event.sourceProcesses.length > 0);
    assert.ok(event.sourceProcesses.some((item) => item.pid === process.pid));
    assert.ok(event.sourceProcesses.every((item) =>
      Number.isInteger(item.pid) &&
      Number.isInteger(item.parentPid) &&
      !Object.hasOwn(item, 'commandLine') &&
      Number.isFinite(Date.parse(item.createdAt))
    ));
  } finally {
    const pending = path.join(testRoot, 'pending');
    if (fs.existsSync(pending)) {
      for (const name of fs.readdirSync(pending)) fs.unlinkSync(path.join(pending, name));
      fs.rmdirSync(pending);
    }
    if (fs.existsSync(testRoot)) fs.rmdirSync(testRoot);
  }
});

test('Kiro bridge ignores non-Stop events and process chains without Kiro CLI', { timeout: 10000 }, () => {
  const testRoot = path.join(__dirname, '.kiro-bridge-filter-test');
  assert.equal(fs.existsSync(testRoot), false, `Test directory already exists: ${testRoot}`);
  fs.mkdirSync(testRoot);

  try {
    const ignored = runBridge(testRoot, { hook_event_name: 'PostToolUse', session_id: 'session-2', cwd: 'C:\\workspace\\project' });
    assert.equal(ignored.error, undefined, ignored.error && ignored.error.message);
    assert.equal(ignored.status, 0, ignored.stderr || ignored.stdout);
    assert.equal(fs.existsSync(path.join(testRoot, 'pending')), false);

    const noKiroAncestor = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', bridge,
    ], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'session-3', cwd: 'C:\\workspace\\project' }),
      encoding: 'utf8',
      env: { ...process.env, LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT: testRoot },
    });
    assert.equal(noKiroAncestor.error, undefined, noKiroAncestor.error && noKiroAncestor.error.message);
    assert.equal(noKiroAncestor.status, 0, noKiroAncestor.stderr || noKiroAncestor.stdout);
    assert.equal(fs.existsSync(path.join(testRoot, 'pending')), false);
  } finally {
    if (fs.existsSync(testRoot)) fs.rmdirSync(testRoot);
  }
});
