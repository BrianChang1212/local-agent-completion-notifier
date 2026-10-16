'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const PROCESS_TIME_TOLERANCE_MS = 1000;

async function getProcessCreationTimes(pids) {
  if (process.platform !== 'win32' || pids.length === 0) return new Map();
  const safePids = pids.filter((pid) => Number.isSafeInteger(pid) && pid > 0);
  if (safePids.length === 0) return new Map();

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$ids = @(${safePids.join(',')})`,
    '$items = @()',
    'foreach ($id in $ids) {',
    '  $process = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId = " + $id)',
    '  if ($process) { $items += [ordered]@{ pid = [int]$process.ProcessId; createdAt = $process.CreationDate.ToUniversalTime().ToString("o") } }',
    '}',
    'ConvertTo-Json -InputObject @($items) -Compress',
  ].join('; ');

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script,
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5000,
    maxBuffer: 16 * 1024,
  });

  const output = stdout.trim();
  if (!output) return new Map();
  const parsed = JSON.parse(output);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return new Map(items
    .filter((item) => Number.isSafeInteger(item.pid) && typeof item.createdAt === 'string')
    .map((item) => [item.pid, item.createdAt]));
}

async function findMatchingTerminal(terminals, sourceProcesses, lookupCreationTimes = getProcessCreationTimes) {
  if (!Array.isArray(terminals) || !Array.isArray(sourceProcesses) || sourceProcesses.length === 0) return null;

  const sourceByPid = new Map(sourceProcesses.map((entry) => [entry.pid, entry]));
  const terminalPids = await Promise.all(terminals.map(async (terminal) => {
    try {
      const pid = await terminal.processId;
      return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
    } catch {
      return null;
    }
  }));
  const candidatePids = [...new Set(terminalPids.filter((pid) => sourceByPid.has(pid)))];
  if (candidatePids.length === 0) return null;

  const liveCreationTimes = await lookupCreationTimes(candidatePids);
  const matches = terminals.filter((terminal, index) => {
    const pid = terminalPids[index];
    const source = sourceByPid.get(pid);
    const liveCreatedAt = liveCreationTimes.get(pid);
    if (!source || typeof liveCreatedAt !== 'string') return false;
    const sourceTime = Date.parse(source.createdAt);
    const liveTime = Date.parse(liveCreatedAt);
    return Number.isFinite(sourceTime) && Number.isFinite(liveTime) &&
      Math.abs(sourceTime - liveTime) <= PROCESS_TIME_TOLERANCE_MS;
  });

  return matches.length === 1 ? matches[0] : null;
}

module.exports = { findMatchingTerminal, getProcessCreationTimes };
