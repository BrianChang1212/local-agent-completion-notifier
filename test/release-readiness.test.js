'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const scriptPath = path.join(__dirname, '..', 'scripts', 'verify-release-readiness.ps1');

test('release preflight accepts an open-source license and repository URL', { timeout: 15000 }, () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-agent-ready-'));
  try {
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
      license: 'MIT',
      repository: { url: 'https://github.com/acme-labs/local-agent-completion-notifier' },
    }), 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'LICENSE'), 'MIT License\nPermission is hereby granted...', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '![Icon](images/icon.png)', 'utf8');
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ProjectRoot', projectRoot,
    ], { encoding: 'utf8' });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Release metadata ready/);
    assert.equal(fs.existsSync(path.join(projectRoot, 'release')), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('release preflight rejects private-use licensing and missing repository metadata', { timeout: 15000 }, () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-agent-blocked-'));
  try {
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ license: 'UNLICENSED' }), 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'LICENSE'), 'Private local use. All rights reserved.', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '![Icon](images/icon.png)', 'utf8');
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ProjectRoot', projectRoot,
    ], { encoding: 'utf8' });
    assert.equal(result.error, undefined, result.error && result.error.message);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Select an open-source SPDX license/);
    assert.match(result.stderr, /repository\.url/);
    assert.match(result.stderr, /Replace the current private-use LICENSE/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('release preflight resolves the repository root and accepts its metadata without arguments', { timeout: 15000 }, () => {
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
  ], { encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Release metadata ready: MIT, https:\/\/github\.com\/BrianChang1212\/local-agent-completion-notifier\.git/);
  assert.doesNotMatch(result.stderr, /Split-Path|cannot bind argument/i);
});
