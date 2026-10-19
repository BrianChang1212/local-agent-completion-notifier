'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TITLE = 'Codex 回合已結束';
const MESSAGE = 'Codex 回合已結束，請查看對話結果。';
const HELPER_RELATIVE_PATH = path.join('bin', 'node_modules', '@oai', 'sky', 'bin', 'windows', 'codex-computer-use.exe');

function localAppData() {
  return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
}

function findComputerUseHelper() {
  const runtimeRoot = path.join(localAppData(), 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  if (!fs.existsSync(runtimeRoot)) return null;
  return fs.readdirSync(runtimeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(runtimeRoot, entry.name);
      return { executable: path.join(directory, HELPER_RELATIVE_PATH), modified: fs.statSync(directory).mtimeMs };
    })
    .filter((entry) => fs.existsSync(entry.executable))
    .sort((a, b) => b.modified - a.modified)[0]?.executable || null;
}

function writeFallbackEvent(eventPath, payload) {
  if (fs.existsSync(eventPath)) return;
  const event = {
    schemaVersion: 1,
    id: `${payload['thread-id']}:${payload['turn-id']}`,
    threadId: payload['thread-id'],
    turnId: payload['turn-id'],
    cwd: typeof payload.cwd === 'string' ? payload.cwd : '',
    completedAt: new Date().toISOString(),
    title: TITLE,
    message: MESSAGE,
  };
  const temporaryPath = path.join(path.dirname(eventPath), `${process.pid}-${Date.now()}.tmp`);
  fs.writeFileSync(temporaryPath, JSON.stringify(event), { encoding: 'utf8', flag: 'wx' });
  try {
    fs.linkSync(temporaryPath, eventPath);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    fs.unlinkSync(temporaryPath);
  }
}

function deliver(payloadText, options = {}) {
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    process.stderr.write('Codex notifier received invalid JSON.\n');
    return 2;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    process.stderr.write('Codex notifier received an invalid event.\n');
    return 2;
  }
  if (payload.type !== 'agent-turn-complete') return 0;
  const threadId = payload['thread-id'];
  const turnId = payload['turn-id'];
  if (typeof threadId !== 'string' || !threadId || typeof turnId !== 'string' || !turnId) {
    process.stderr.write('Codex notifier received an event without identifiers.\n');
    return 2;
  }

  const dataRoot = options.dataRoot || process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT ||
    path.join(localAppData(), 'LocalAgentCompletionNotifier');
  const pendingRoot = path.join(dataRoot, 'pending');
  fs.mkdirSync(pendingRoot, { recursive: true });
  const safeThread = threadId.replace(/[^A-Za-z0-9_.-]/g, '_');
  const safeTurn = turnId.replace(/[^A-Za-z0-9_.-]/g, '_');
  const eventPath = path.join(pendingRoot, `${safeThread}_${safeTurn}.json`);
  const spawn = options.spawn || spawnSync;

  const helper = options.helperPath === undefined ? findComputerUseHelper() : options.helperPath;
  if (helper) {
    const helperResult = spawn(helper, ['turn-ended', payloadText], {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
    });
    if (helperResult.error || helperResult.status !== 0) {
      process.stderr.write('Codex Computer Use turn-ended helper did not complete.\n');
    }
  } else {
    process.stderr.write('Codex Computer Use turn-ended helper was not found.\n');
  }

  if (!fs.existsSync(eventPath)) {
    const bridge = options.bridgePath || path.join(__dirname, 'notify-vscode.ps1');
    const bridgeResult = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', bridge, '-ReadPayloadFromStdin', '-SkipLegacyNotifier',
    ], { encoding: 'utf8', windowsHide: true, timeout: 8000, input: payloadText });
    if (!bridgeResult.error && bridgeResult.status === 0) return 0;
    if (!fs.existsSync(eventPath)) {
      writeFallbackEvent(eventPath, payload);
      process.stderr.write('Codex process matching was unavailable; queued a general completion reminder.\n');
    }
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = deliver(process.argv[2] || '');
}

module.exports = { deliver };
