'use strict';

const path = require('node:path');

const TITLE = 'Codex 回合已結束';
const MESSAGE = 'Codex 回合已結束，請查看對話結果。';
const KIRO_TITLE = 'Kiro 回合已結束';
const KIRO_MESSAGE = 'Kiro 回合已結束，請查看對話結果。';

function validSourceProcesses(processes) {
  if (!Array.isArray(processes) || processes.length > 64) return false;
  const pids = new Set();
  let childCreatedAt = Number.POSITIVE_INFINITY;
  return processes.every((entry) => {
    const createdAt = entry && typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : Number.NaN;
    if (
      !entry ||
      !Number.isSafeInteger(entry.pid) || entry.pid <= 0 ||
      !Number.isSafeInteger(entry.parentPid) || entry.parentPid < 0 ||
      !Number.isFinite(createdAt) || createdAt > childCreatedAt ||
      pids.has(entry.pid)
    ) return false;
    pids.add(entry.pid);
    childCreatedAt = createdAt;
    return true;
  });
}

function parseCodexNotification(input, completedAt = new Date().toISOString()) {
  let payload;
  try {
    payload = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    return null;
  }

  if (!payload || payload.type !== 'agent-turn-complete') return null;

  const threadId = typeof payload['thread-id'] === 'string' ? payload['thread-id'] : '';
  const turnId = typeof payload['turn-id'] === 'string' ? payload['turn-id'] : '';
  if (!threadId || !turnId) return null;

  return {
    schemaVersion: 1,
    id: `${threadId}:${turnId}`,
    threadId,
    turnId,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : '',
    completedAt,
    title: TITLE,
    message: MESSAGE,
  };
}

function isPendingEvent(event) {
  const isCodexEvent = event && (event.schemaVersion === 1 || event.schemaVersion === 2);
  const isKiroEvent = event && event.schemaVersion === 3 &&
    event.provider === 'kiro' &&
    typeof event.sessionId === 'string' && event.sessionId.length > 0 &&
    typeof event.turnId === 'string' && event.turnId.length > 0 &&
    event.id === `kiro:${event.sessionId}:${event.turnId}` &&
    event.title === KIRO_TITLE && event.message === KIRO_MESSAGE &&
    Number.isFinite(Date.parse(event.completedAt)) &&
    validSourceProcesses(event.sourceProcesses);
  return Boolean(
    event &&
    (isCodexEvent || isKiroEvent) &&
    (event.schemaVersion !== 2 || (Number.isFinite(Date.parse(event.completedAt)) && validSourceProcesses(event.sourceProcesses))) &&
    typeof event.id === 'string' &&
    event.id.length > 0 &&
    (event.schemaVersion === 3 || (
      typeof event.threadId === 'string' &&
      typeof event.turnId === 'string' &&
      event.id === `${event.threadId}:${event.turnId}` &&
      event.title === TITLE &&
      event.message === MESSAGE
    ))
  );
}

function isExpiredSourceEvent(event, now = Date.now()) {
  if (!event || ![2, 3].includes(event.schemaVersion) || typeof event.completedAt !== 'string') return false;
  const completedAt = Date.parse(event.completedAt);
  return Number.isFinite(completedAt) && now - completedAt >= 10 * 60 * 1000;
}

function isPathWithin(root, candidate) {
  const windowsPath = /^[a-z]:[\\/]|^\\\\/i.test(root) || /^[a-z]:[\\/]|^\\\\/i.test(candidate);
  const pathApi = windowsPath ? path.win32 : path;
  if (!pathApi.isAbsolute(root) || !pathApi.isAbsolute(candidate)) return false;

  const relative = pathApi.relative(pathApi.resolve(root), pathApi.resolve(candidate));
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  );
}

function isEventForWorkspace(event, workspaceFolders) {
  if (!event || typeof event.cwd !== 'string' || !event.cwd || !Array.isArray(workspaceFolders)) {
    return false;
  }

  return workspaceFolders.some((folder) =>
    folder &&
    folder.uri &&
    folder.uri.scheme === 'file' &&
    typeof folder.uri.fsPath === 'string' &&
    isPathWithin(folder.uri.fsPath, event.cwd)
  );
}

module.exports = { isEventForWorkspace, isExpiredSourceEvent, isPendingEvent, parseCodexNotification };
