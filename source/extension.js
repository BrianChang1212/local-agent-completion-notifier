'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');
const { isEventForWorkspace, isExpiredSourceEvent, isPendingEvent } = require('./notification');
const { claimReminderMarker, releaseReminderMarker } = require('./notification-claims');
const { showCompletionNotification, showCompletionReminder } = require('./notification-ui');
const { findMatchingTerminal } = require('./terminal-matcher');

const KIRO_FALLBACK_GRACE_MS = 2000;

const dataRoot = process.env.LOCAL_AGENT_COMPLETION_NOTIFIER_DATA_ROOT || path.join(
  process.env.LOCALAPPDATA || path.join(require('node:os').homedir(), 'AppData', 'Local'),
  'LocalAgentCompletionNotifier'
);
const pendingDirectory = path.join(dataRoot, 'pending');

async function activate(context) {
  const output = vscode.window.createOutputChannel('Local Agent Completion Notifier');
  context.subscriptions.push(output);
  await fs.promises.mkdir(pendingDirectory, { recursive: true });

  let scanRunning = false;
  let scanRequested = false;
  const inFlight = new Set();

  const scanPending = async () => {
    if (scanRunning) {
      scanRequested = true;
      return;
    }
    scanRunning = true;
    try {
      do {
        scanRequested = false;
        const names = (await fs.promises.readdir(pendingDirectory))
          .filter((name) => name.endsWith('.json'))
          .sort();
        for (const name of names) {
          const filePath = path.join(pendingDirectory, name);
          if (inFlight.has(filePath)) continue;
          inFlight.add(filePath);
          try {
            const event = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
            if (!isPendingEvent(event)) {
              output.appendLine(`Ignored invalid event file: ${name}`);
              continue;
            }
            if (isExpiredSourceEvent(event)) {
              await fs.promises.unlink(filePath);
              await releaseReminderMarker(fs.promises, filePath);
              output.appendLine(`Removed expired terminal event: ${name}`);
              continue;
            }
            if (!isEventForWorkspace(event, vscode.workspace.workspaceFolders || [])) {
              continue;
            }

            if (event.schemaVersion === 2 || event.schemaVersion === 3) {
              const terminal = await findMatchingTerminal(vscode.window.terminals, event.sourceProcesses);
              if (!terminal) {
                if (event.provider !== 'kiro' || Date.now() - Date.parse(event.completedAt) < KIRO_FALLBACK_GRACE_MS) {
                  continue;
                }
                const markerPath = await claimReminderMarker(fs.promises, filePath);
                if (!markerPath) continue;
                try {
                  await showCompletionReminder(vscode, event);
                  output.appendLine('Displayed a Kiro completion reminder without a terminal action because no unique terminal matched.');
                } catch (error) {
                  await releaseReminderMarker(fs.promises, filePath).catch(() => {});
                  throw error;
                }
                continue;
              }
              const focused = await showCompletionNotification(vscode, event, terminal);
              if (focused) {
                const terminalPid = await terminal.processId;
                output.appendLine(`Terminal focus: "${terminal.name}" (PID ${terminalPid}); active=${vscode.window.activeTerminal === terminal}`);
              }
            } else {
              await showCompletionNotification(vscode, event);
            }
            await fs.promises.unlink(filePath);
            await releaseReminderMarker(fs.promises, filePath);
          } catch (error) {
            if (error && error.code !== 'ENOENT') {
              output.appendLine(`Could not process ${name}: ${error.message}`);
            }
          } finally {
            inFlight.delete(filePath);
          }
        }
      } while (scanRequested);
    } finally {
      scanRunning = false;
    }
  };

  const watcher = fs.watch(pendingDirectory, () => {
    void scanPending();
  });
  context.subscriptions.push({ dispose: () => watcher.close() });
  const poller = setInterval(() => {
    void scanPending();
  }, 2000);
  context.subscriptions.push({ dispose: () => clearInterval(poller) });
  await scanPending();
}

function deactivate() {}

module.exports = { activate, deactivate };
