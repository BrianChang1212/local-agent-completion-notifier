'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { findMatchingTerminal, getProcessCreationTimes } = require('../source/terminal-matcher');

const sourceProcesses = [
  { pid: 500, parentPid: 400, createdAt: '2026-10-15T08:00:00.000Z' },
  { pid: 400, parentPid: 300, createdAt: '2026-10-15T07:59:00.000Z' },
];

test('matches the unique terminal whose shell pid and creation time occur in the source chain', async () => {
  const source = { name: 'Codex source terminal', processId: Promise.resolve(400) };
  const unrelated = { name: 'Other terminal', processId: Promise.resolve(700) };

  const result = await findMatchingTerminal([unrelated, source], sourceProcesses, async (pids) => {
    assert.deepEqual(pids, [400]);
    return new Map([
      [400, '2026-10-15T07:59:00.000Z'],
      [700, '2026-10-15T06:00:00.000Z'],
    ]);
  });

  assert.equal(result, source);
});

test('returns no terminal when the pid was reused or multiple terminals match', async () => {
  const terminal = { processId: Promise.resolve(400) };
  const reusedPid = await findMatchingTerminal([terminal], sourceProcesses, async () =>
    new Map([[400, '2026-10-15T09:59:00.000Z']])
  );
  const ambiguous = await findMatchingTerminal([terminal, { processId: Promise.resolve(400) }], sourceProcesses, async () =>
    new Map([[400, '2026-10-15T07:59:00.000Z']])
  );

  assert.equal(reusedPid, null);
  assert.equal(ambiguous, null);
});

test('ignores terminals without a live shell process id', async () => {
  const result = await findMatchingTerminal([{ processId: Promise.resolve(undefined) }], sourceProcesses, async () => {
    assert.fail('No process lookup should be needed without a terminal process id.');
  });

  assert.equal(result, null);
});

test('reads live Windows process creation times using CIM', { skip: process.platform !== 'win32', timeout: 10000 }, async () => {
  const creationTimes = await getProcessCreationTimes([process.pid]);

  assert.ok(creationTimes.has(process.pid));
  assert.ok(Number.isFinite(Date.parse(creationTimes.get(process.pid))));
});
