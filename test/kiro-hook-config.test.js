'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.join(__dirname, '..');
const templatePath = path.join(projectRoot, 'config', 'kiro', 'completion-notifier.json');
const installerPath = path.join(projectRoot, 'scripts', 'install-kiro-hook.ps1');

test('Kiro installer creates a portable hook and stable local bridge path', { timeout: 15000 }, () => {
  const testRoot = path.join(__dirname, '.kiro-hook-installer-test');
  assert.equal(fs.existsSync(testRoot), false, `Test directory already exists: ${testRoot}`);

  const userProfile = path.join(testRoot, 'profile');
  const localAppData = path.join(testRoot, 'localappdata');
  const hookPath = path.join(userProfile, '.kiro', 'hooks', 'local-agent-completion-notifier.json');
  const bridgePath = path.join(localAppData, 'LocalAgentCompletionNotifier', 'bridge', 'notify-kiro.ps1');

  fs.mkdirSync(testRoot, { recursive: true });
  try {
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    assert.equal(template.version, 'v1');
    assert.equal(template.hooks.length, 1);
    assert.equal(template.hooks[0].trigger, 'Stop');
    assert.match(template.hooks[0].action.command, /__LOCAL_AGENT_KIRO_BRIDGE__/);
    assert.equal(template.hooks[0].timeout, 10);
    assert.equal(template.hooks[0].enabled, true);

    const runInstaller = () => spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath,
    ], {
      encoding: 'utf8',
      env: { ...process.env, USERPROFILE: userProfile, LOCALAPPDATA: localAppData },
    });

    const firstRun = runInstaller();
    assert.equal(firstRun.error, undefined, firstRun.error && firstRun.error.message);
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    assert.equal(fs.existsSync(bridgePath), true);
    assert.equal(fs.existsSync(hookPath), true);

    const installed = JSON.parse(fs.readFileSync(hookPath, 'utf8'));
    const command = installed.hooks[0].action.command;
    assert.ok(command.includes(bridgePath));
    assert.ok(!command.includes('__LOCAL_AGENT_KIRO_BRIDGE__'));
    assert.ok(!command.includes(path.join(projectRoot, 'scripts', 'bridges')));
    assert.equal(installed.hooks[0].name, 'Local Agent Completion Notifier');

    const legacyHookPath = path.join(userProfile, '.kiro', 'hooks', 'brian-completion-notifier.json');
    fs.writeFileSync(legacyHookPath, JSON.stringify({ hooks: [{
      name: 'Codex & Kiro Completion Notifier',
      trigger: 'Stop',
      action: { command: 'powershell.exe -File C:\\workspace\\infra\\scripts\\kiro\\notify-vscode.ps1' },
    }] }), 'utf8');
    const duplicateRun = runInstaller();
    assert.notEqual(duplicateRun.status, 0);
    assert.match(duplicateRun.stderr, /already exists outside the managed configuration/i);
    assert.equal(fs.existsSync(legacyHookPath), true);
    fs.unlinkSync(legacyHookPath);

    const secondRun = runInstaller();
    assert.equal(secondRun.error, undefined, secondRun.error && secondRun.error.message);
    assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
    assert.match(secondRun.stdout, /already matches/i);

    fs.writeFileSync(hookPath, '{"userOwned":true}', 'utf8');
    const beforeConflictBridge = fs.readFileSync(bridgePath);
    const conflictRun = runInstaller();
    assert.notEqual(conflictRun.status, 0);
    assert.deepEqual(fs.readFileSync(bridgePath), beforeConflictBridge);
    assert.equal(fs.readFileSync(hookPath, 'utf8'), '{"userOwned":true}');
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});
