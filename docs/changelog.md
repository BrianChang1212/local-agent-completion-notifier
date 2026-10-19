# Changelog

## 2026-10-19

- Released 0.3.1 with a portable Codex notification dispatcher and process-aware bridge.
- Added a general reminder for Codex turns without a unique integrated-terminal match; a unique match still offers a switch action.
- Verified a text-only Codex CLI turn emitted a process-aware event. VS Code displayed a general reminder without a terminal action when the turn ran outside an integrated terminal. The user confirmed the notification and terminal switch for a text-only turn in a Windows VS Code integrated terminal.
- Published 0.3.1 to the VS Code Marketplace as `brian-chang.codex-completion-notifier`; Marketplace metadata reports the same VSIX SHA-256 as the verified local artifact.

## 2026-10-15

- Added terminal switching for uniquely matched Codex sessions.
- Added Kiro CLI V3 `Stop` hook support, provider-aware events, and a reminder flow when no unique terminal match exists.
- Renamed the product to **Local Agent Completion Notifier** while preserving the existing extension identifier.
- Added portable provider bridges and setup helpers for source-based installation.
