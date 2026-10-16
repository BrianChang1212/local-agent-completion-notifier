'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.join(__dirname, '..');
const installerPath = path.join(projectRoot, 'scripts', 'install-codex-bridge.ps1');
const sourcePath = path.join(projectRoot, 'scripts', 'bridges', 'codex', 'notify-vscode.ps1');

test('Codex installer copies the bridge to stable local data and prints a user-level config command', { timeout: 15000 }, () => {
  const testRoot = path.join(os.tmpdir(), `local-agent-completion-notifier-codex-installer-${process.pid}`);
  assert.equal(fs.existsSync(testRoot), false, `Test directory already exists: ${testRoot}`);
  const localAppData = path.join(testRoot, 'Local App Data');
  const destinationPath = path.join(localAppData, 'LocalAgentCompletionNotifier', 'bridge', 'notify-codex.ps1');
  fs.mkdirSync(testRoot, { recursive: true });
  try {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath,
    ], { encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: localAppData } });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.readFileSync(destinationPath, 'utf8'), fs.readFileSync(sourcePath, 'utf8'));
    assert.match(result.stdout, /notify = \[/);
    assert.ok(result.stdout.includes(destinationPath.replaceAll('\\', '\\\\')));
    assert.ok(!result.stdout.includes(projectRoot));
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
