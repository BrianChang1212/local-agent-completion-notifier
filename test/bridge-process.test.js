'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

test('PowerShell stdin receives Codex JSON payload intact', { timeout: 10000 }, () => {
  const testRoot = path.join(__dirname, '.bridge-process-test');
  assert.equal(fs.existsSync(testRoot), false, `Test directory already exists: ${testRoot}`);
  fs.mkdirSync(testRoot);

  try {
    const payload = {
      type: 'agent-turn-complete',
      'thread-id': 'cli-thread',
      'turn-id': 'cli-turn',
      cwd: 'C:\\workspace\\project',
      'last-assistant-message': 'PRIVATE RESPONSE MUST NOT BE STORED',
    };
    const bridge = path.join(__dirname, '..', 'scripts', 'bridges', 'codex', 'notify-vscode.ps1');
    const result = spawnSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', bridge,
      '-ReadPayloadFromStdin',
      '-SkipLegacyNotifier',
    ], {
      encoding: 'utf8',
      input: JSON.stringify(payload),
      env: { ...process.env, LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT: testRoot },
    });

    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const eventPath = path.join(testRoot, 'pending', 'cli-thread_cli-turn.json');
    const eventText = fs.readFileSync(eventPath, 'utf8');
    assert.equal(eventText.includes('PRIVATE RESPONSE'), false);
    const event = JSON.parse(eventText);
    assert.equal(event.id, 'cli-thread:cli-turn');
    assert.equal(event.schemaVersion, 2);
    assert.ok(Array.isArray(event.sourceProcesses));
    assert.ok(event.sourceProcesses.length > 0, JSON.stringify({ stderr: result.stderr }));
    assert.ok(event.sourceProcesses.some((item) => item.pid === process.pid), JSON.stringify({ nodePid: process.pid, sourceProcesses: event.sourceProcesses, stderr: result.stderr }));
    assert.ok(event.sourceProcesses.every((item) =>
      Number.isInteger(item.pid) &&
      Number.isInteger(item.parentPid) &&
      !Object.hasOwn(item, 'commandLine') &&
      Number.isFinite(Date.parse(item.createdAt))
    ));
  } finally {
    const pending = path.join(testRoot, 'pending');
    if (fs.existsSync(pending)) {
      for (const name of fs.readdirSync(pending)) {
        if (name.endsWith('.json') || name.endsWith('.tmp')) fs.unlinkSync(path.join(pending, name));
      }
      fs.rmdirSync(pending);
    }
    if (fs.existsSync(testRoot)) fs.rmdirSync(testRoot);
  }
});
