'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { claimReminderMarker, releaseReminderMarker } = require('../source/notification-claims');

test('an unmatched-window reminder is claimed once without consuming the completion event', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-notifier-claim-'));
  const eventPath = path.join(directory, 'kiro-event.json');
  const markerPath = `${eventPath}.reminded`;
  await fs.writeFile(eventPath, '{"provider":"kiro"}', 'utf8');

  try {
    assert.equal(await claimReminderMarker(fs, eventPath), markerPath);
    assert.equal(await claimReminderMarker(fs, eventPath), null);
    assert.equal(await fs.readFile(eventPath, 'utf8'), '{"provider":"kiro"}');
    assert.equal(await fs.readFile(markerPath, 'utf8'), '');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('a reminder marker can be released without removing its pending completion event', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-notifier-release-'));
  const eventPath = path.join(directory, 'kiro-event.json');
  const markerPath = `${eventPath}.reminded`;
  await fs.writeFile(eventPath, '{"provider":"kiro"}', 'utf8');

  try {
    await claimReminderMarker(fs, eventPath);
    await releaseReminderMarker(fs, eventPath);
    await assert.rejects(fs.access(markerPath), { code: 'ENOENT' });
    assert.equal(await fs.readFile(eventPath, 'utf8'), '{"provider":"kiro"}');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
test('does not leave an orphan reminder marker when its event was already claimed', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-notifier-orphan-'));
  const eventPath = path.join(directory, 'kiro-event.json');
  await fs.writeFile(eventPath, '{"provider":"kiro"}', 'utf8');

  try {
    await fs.unlink(eventPath);
    assert.equal(await claimReminderMarker(fs, eventPath), null);
    await assert.rejects(fs.access(`${eventPath}.reminded`), { code: 'ENOENT' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
