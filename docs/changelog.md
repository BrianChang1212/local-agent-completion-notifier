# Changelog

## 2026-10-19

- Released 0.3.1 with a portable Codex notification dispatcher and process-aware bridge.
- Added a general reminder for Codex turns without a unique integrated-terminal match; a unique match still offers a switch action.
- Verified the local notification and switch action in a Windows VS Code integrated terminal. Pure-chat and unmatched-terminal paths have automated coverage but have not been separately confirmed in a live session.

## 2026-10-15

- Added terminal switching for uniquely matched Codex sessions.
- Added Kiro CLI V3 `Stop` hook support, provider-aware events, and a reminder flow when no unique terminal match exists.
- Renamed the product to **Local Agent Completion Notifier** while preserving the existing extension identifier.
- Added portable provider bridges and setup helpers for source-based installation.
