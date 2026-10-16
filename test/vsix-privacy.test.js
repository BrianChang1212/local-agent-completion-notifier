'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.join(__dirname, '..');
const verifierPath = path.join(projectRoot, 'scripts', 'verify-vsix.ps1');
const expectedManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

function createFixtureVsix(root, name, readmeText) {
  const fixtureRoot = path.join(root, `${name}-contents`);
  const extensionRoot = path.join(fixtureRoot, 'extension');
  const files = {
    'package.json': JSON.stringify(expectedManifest),
    'source/extension.js': 'module.exports = {};',
    'source/notification.js': 'module.exports = {};',
    'source/notification-claims.js': 'module.exports = {};',
    'config/kiro/completion-notifier.json': '{}',
    'scripts/bridges/codex/notify-vscode.ps1': 'Write-Output ok',
    'scripts/bridges/kiro/notify-vscode.ps1': 'Write-Output ok',
    'scripts/install-codex-bridge.ps1': 'Write-Output ok',
    'scripts/install-kiro-hook.ps1': 'Write-Output ok',
    'images/icon.png': Buffer.from([137, 80, 78, 71]),
    'readme.md': readmeText,
    'changelog.md': 'Release notes',
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(extensionRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content);
  }

  const archivePath = path.join(root, `${name}.vsix`);
  const result = spawnSync('powershell.exe', [
    '-NoLogo', '-NoProfile', '-Command',
    "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $root=(Get-Item -LiteralPath $env:VSIX_FIXTURE_ROOT).FullName; $file=[IO.File]::Open($env:VSIX_FIXTURE_ARCHIVE,[IO.FileMode]::CreateNew); $zip=[IO.Compression.ZipArchive]::new($file,[IO.Compression.ZipArchiveMode]::Create); try { Get-ChildItem -LiteralPath $root -File -Recurse | ForEach-Object { $name=$_.FullName.Substring($root.Length+1).Replace('\\','/'); $entry=$zip.CreateEntry($name); $input=[IO.File]::OpenRead($_.FullName); $output=$entry.Open(); try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() } } } finally { $zip.Dispose(); $file.Dispose() }; $check=[IO.Compression.ZipFile]::OpenRead($env:VSIX_FIXTURE_ARCHIVE); try { $check.Entries | ForEach-Object FullName } finally { $check.Dispose() }",
  ], {
    encoding: 'utf8',
    env: { ...process.env, VSIX_FIXTURE_ROOT: fixtureRoot, VSIX_FIXTURE_ARCHIVE: archivePath },
  });
  assert.equal(result.error, undefined, result.error && result.error.message);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /extension\/package\.json/);
  return archivePath;
}

test('VSIX verifier accepts a clean package and rejects a personal Windows path', { timeout: 15000 }, () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'local-agent-vsix-privacy-'));
  try {
    const cleanArchive = createFixtureVsix(tempRoot, 'clean', '![Icon](images/icon.png)');
    const cleanResult = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', verifierPath, cleanArchive,
    ], { encoding: 'utf8' });
    assert.equal(cleanResult.error, undefined, cleanResult.error && cleanResult.error.message);
    assert.equal(cleanResult.status, 0, `${cleanResult.stderr || ''}\n${cleanResult.stdout || ''}`);
    assert.match(cleanResult.stdout, /Verified brian-local\.codex-completion-notifier 0\.3\.0/);

    const privateArchive = createFixtureVsix(tempRoot, 'private', 'Local path: C:\\Users\\Example\\project');
    const privateResult = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', verifierPath, privateArchive,
    ], { encoding: 'utf8' });
    assert.equal(privateResult.error, undefined, privateResult.error && privateResult.error.message);
    assert.notEqual(privateResult.status, 0);
    assert.match(privateResult.stderr, /private or workspace-specific marker/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
