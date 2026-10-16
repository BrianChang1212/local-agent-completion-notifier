'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isEventForWorkspace, isExpiredSourceEvent, isPendingEvent, parseCodexNotification } = require('../source/notification');

test('normalizes a completed turn without copying assistant text', () => {
  const result = parseCodexNotification({
    type: 'agent-turn-complete',
    'thread-id': 'thread-1',
    'turn-id': 'turn-2',
    cwd: 'C:\\workspace\\project',
    'last-assistant-message': 'PRIVATE RESPONSE MUST NOT BE STORED',
  }, '2026-10-15T00:00:00.000Z');

  assert.deepEqual(result, {
    schemaVersion: 1,
    id: 'thread-1:turn-2',
    threadId: 'thread-1',
    turnId: 'turn-2',
    cwd: 'C:\\workspace\\project',
    completedAt: '2026-10-15T00:00:00.000Z',
    title: 'Codex 回合已結束',
    message: 'Codex 回合已結束，請查看對話結果。',
  });
  assert.equal(JSON.stringify(result).includes('PRIVATE RESPONSE'), false);
  assert.equal(isPendingEvent(result), true);
});

test('ignores unsupported events and incomplete turn identifiers', () => {
  assert.equal(parseCodexNotification('{not json'), null);
  assert.equal(parseCodexNotification({ type: 'approval-requested' }), null);
  assert.equal(parseCodexNotification({ type: 'agent-turn-complete', 'thread-id': 'thread-1' }), null);
});

test('rejects event files with altered user-facing text or mismatched identifiers', () => {
  const event = parseCodexNotification({ type: 'agent-turn-complete', 'thread-id': 't', 'turn-id': 'u' });
  assert.equal(isPendingEvent({ ...event, message: 'run arbitrary content' }), false);
  assert.equal(isPendingEvent({ ...event, id: 'other' }), false);
});

test('accepts v2 events with a validated source process chain and preserves v1 compatibility', () => {
  const v1 = parseCodexNotification({ type: 'agent-turn-complete', 'thread-id': 't1', 'turn-id': 'u1' });
  const v2 = {
    ...v1,
    schemaVersion: 2,
    sourceProcesses: [
      { pid: 120, parentPid: 100, createdAt: '2026-10-15T08:00:00.000Z' },
      { pid: 100, parentPid: 80, createdAt: '2026-10-15T07:59:00.000Z' },
    ],
  };

  assert.equal(isPendingEvent(v1), true);
  assert.equal(isPendingEvent(v2), true);
  assert.equal(isPendingEvent({ ...v2, sourceProcesses: [{ pid: -1, parentPid: 1, createdAt: 'bad' }] }), false);
  assert.equal(isPendingEvent({ ...v2, sourceProcesses: [] }), true);
  assert.equal(isPendingEvent({
    ...v2,
    sourceProcesses: [
      { pid: 120, parentPid: 100, createdAt: '2026-10-15T07:00:00.000Z' },
      { pid: 100, parentPid: 80, createdAt: '2026-10-15T08:00:00.000Z' },
    ],
  }), false);
});

test('accepts provider-aware Kiro v3 events and rejects unknown providers', () => {
  const kiro = {
    schemaVersion: 3,
    provider: 'kiro',
    id: 'kiro:session-1:turn-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    cwd: 'C:\\workspace\\project',
    completedAt: '2026-10-15T08:00:00.000Z',
    sourceProcesses: [
      { pid: 120, parentPid: 100, createdAt: '2026-10-15T08:00:00.000Z' },
      { pid: 100, parentPid: 80, createdAt: '2026-10-15T07:59:00.000Z' },
    ],
    title: 'Kiro 回合已結束',
    message: 'Kiro 回合已結束，請查看對話結果。',
  };

  assert.equal(isPendingEvent(kiro), true);
  assert.equal(isPendingEvent({ ...kiro, provider: 'unknown' }), false);
  assert.equal(isPendingEvent({ ...kiro, id: 'other' }), false);
  assert.equal(isPendingEvent({ ...kiro, title: 'untrusted title' }), false);
  assert.equal(isPendingEvent({ ...kiro, sourceProcesses: [{ pid: -1, parentPid: 1, createdAt: 'bad' }] }), false);
});

test('expires unmatched v2 source events after ten minutes', () => {
  const event = {
    schemaVersion: 2,
    completedAt: '2026-10-15T08:00:00.000Z',
  };

  assert.equal(isExpiredSourceEvent(event, Date.parse('2026-10-15T08:09:59.999Z')), false);
  assert.equal(isExpiredSourceEvent(event, Date.parse('2026-10-15T08:10:00.000Z')), true);
  assert.equal(isExpiredSourceEvent({ schemaVersion: 1, completedAt: event.completedAt }, Date.parse('2026-10-15T09:00:00Z')), false);
});

test('expires unmatched provider-aware source events after ten minutes', () => {
  const event = {
    schemaVersion: 3,
    completedAt: '2026-10-15T08:00:00.000Z',
  };

  assert.equal(isExpiredSourceEvent(event, Date.parse('2026-10-15T08:09:59.999Z')), false);
  assert.equal(isExpiredSourceEvent(event, Date.parse('2026-10-15T08:10:00.000Z')), true);
});

test('routes a Codex event only to a workspace that contains its cwd', () => {
  const event = { cwd: 'C:\\workspace\\project\\knowledge' };
  const folders = [
    { uri: { scheme: 'file', fsPath: 'C:\\workspace' } },
    { uri: { scheme: 'file', fsPath: 'C:\\other' } },
  ];

  assert.equal(isEventForWorkspace(event, folders), true);
  assert.equal(isEventForWorkspace(event, [{ uri: { scheme: 'file', fsPath: 'C:\\other-workspace' } }]), false);
  assert.equal(isEventForWorkspace({ cwd: 'C:\\workspace-elsewhere' }, [folders[0]]), false);
  assert.equal(isEventForWorkspace({ cwd: '' }, folders), false);
});
