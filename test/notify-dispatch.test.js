'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { deliver } = require('../scripts/bridges/codex/notify-dispatch');

function withDataRoot(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notify-dispatch-'));
  try {
    run(root);
  } finally {
    const pending = path.join(root, 'pending');
    if (fs.existsSync(pending)) {
      for (const name of fs.readdirSync(pending)) fs.unlinkSync(path.join(pending, name));
      fs.rmdirSync(pending);
    }
    fs.rmdirSync(root);
  }
}

const payload = JSON.stringify({
  type: 'agent-turn-complete',
  'thread-id': 'test-thread',
  'turn-id': 'test-turn',
  cwd: 'D:\\Brian',
  'last-assistant-message': 'PRIVATE RESPONSE',
  'input-messages': ['PRIVATE PROMPT'],
});

test('blocked PowerShell bridge falls back to a private, visible v1 event and still signals Computer Use', () => {
  withDataRoot((dataRoot) => {
    const calls = [];
    const result = deliver(payload, {
      dataRoot,
      helperPath: 'computer-use.exe',
      spawn(command, args) {
        calls.push({ command, args });
        return command === 'powershell.exe'
          ? { status: null, error: new Error('blocked') }
          : { status: 0 };
      },
    });
    assert.equal(result, 0);
    const eventPath = path.join(dataRoot, 'pending', 'test-thread_test-turn.json');
    const saved = fs.readFileSync(eventPath, 'utf8');
    const event = JSON.parse(saved);
    assert.equal(event.schemaVersion, 1);
    assert.equal(event.id, 'test-thread:test-turn');
    assert.equal(event.cwd, 'D:\\Brian');
    assert.equal(saved.includes('PRIVATE RESPONSE'), false);
    assert.equal(saved.includes('PRIVATE PROMPT'), false);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].args, ['turn-ended', payload]);
  });
});

test('successful process-aware bridge event is retained without duplicate fallback', () => {
  withDataRoot((dataRoot) => {
    const eventPath = path.join(dataRoot, 'pending', 'test-thread_test-turn.json');
    const result = deliver(payload, {
      dataRoot,
      helperPath: 'computer-use.exe',
      spawn(command) {
        if (command === 'powershell.exe') {
          fs.mkdirSync(path.dirname(eventPath), { recursive: true });
          fs.writeFileSync(eventPath, JSON.stringify({ schemaVersion: 2, id: 'test-thread:test-turn' }));
        }
        return { status: 0 };
      },
    });
    assert.equal(result, 0);
    assert.equal(JSON.parse(fs.readFileSync(eventPath, 'utf8')).schemaVersion, 2);
  });
});

test('passes Codex JSON through stdin so PowerShell keeps its quotes intact', () => {
  withDataRoot((dataRoot) => {
    const eventPath = path.join(dataRoot, 'pending', 'test-thread_test-turn.json');
    const result = deliver(payload, {
      dataRoot,
      helperPath: null,
      spawn(command, args, spawnOptions) {
        assert.equal(command, 'powershell.exe');
        assert.deepEqual(args.slice(-2), ['-ReadPayloadFromStdin', '-SkipLegacyNotifier']);
        assert.equal(spawnOptions.input, payload);
        assert.equal(args.includes(payload), false);
        fs.writeFileSync(eventPath, JSON.stringify({ schemaVersion: 2 }));
        return { status: 0 };
      },
    });
    assert.equal(result, 0);
  });
});

test('an event consumed during bridge execution is not queued twice', () => {
  withDataRoot((dataRoot) => {
    const eventPath = path.join(dataRoot, 'pending', 'test-thread_test-turn.json');
    const result = deliver(payload, {
      dataRoot,
      helperPath: null,
      spawn(command) {
        assert.equal(command, 'powershell.exe');
        fs.writeFileSync(eventPath, JSON.stringify({ schemaVersion: 2 }));
        fs.unlinkSync(eventPath);
        return { status: 0 };
      },
    });
    assert.equal(result, 0);
    assert.equal(fs.existsSync(eventPath), false);
  });
});

test('invalid event cannot create a notification or call a helper', () => {
  withDataRoot((dataRoot) => {
    let calls = 0;
    const result = deliver('null', { dataRoot, spawn() { calls += 1; return { status: 0 }; } });
    assert.equal(result, 2);
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(dataRoot, 'pending')), false);
  });
});

test('a completed text-only turn is eligible for one notification', () => {
  withDataRoot((dataRoot) => {
    const textOnlyTurn = JSON.stringify({
      type: 'agent-turn-complete',
      'thread-id': 'chat-thread',
      'turn-id': 'chat-turn',
      cwd: 'D:\\Brian',
      'input-messages': ['hello'],
      'last-assistant-message': 'hello back',
    });
    const options = {
      dataRoot,
      helperPath: null,
      spawn: () => ({ status: null, error: new Error('blocked') }),
    };
    assert.equal(deliver(textOnlyTurn, options), 0);
    assert.equal(deliver(textOnlyTurn, options), 0);
    const names = fs.readdirSync(path.join(dataRoot, 'pending'));
    assert.deepEqual(names, ['chat-thread_chat-turn.json']);
    const saved = fs.readFileSync(path.join(dataRoot, 'pending', names[0]), 'utf8');
    assert.equal(saved.includes('hello'), false);
  });
});
