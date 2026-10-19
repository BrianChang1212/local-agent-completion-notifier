# Changelog

## 0.3.1

- Routed Codex turn-end notifications through a portable dispatcher that forwards the existing Computer Use notification and queues a process-aware VS Code event.
- Added a general reminder when a Codex event cannot be uniquely matched to a terminal, while keeping terminal switching available for a unique match.
- Updated the Codex setup helper to install both dispatcher and bridge under local app data and print the user-level `notify` command.

## 0.3.0

- Renamed the product to **Local Agent Completion Notifier** while preserving the existing extension identifier.
- Bundled portable Codex and Kiro CLI bridges and added user-level setup helpers.
- Added VSIX metadata and privacy verification improvements.

## 0.2.1

- Added Kiro CLI V3 `Stop` hook support and provider-aware completion events.
- Added a reminder flow when a Kiro event cannot be uniquely matched to a terminal.

## 0.1.5

- Added terminal switching for uniquely matched Codex sessions.
