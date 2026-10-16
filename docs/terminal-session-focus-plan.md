# Codex Session Terminal Focus

## Goal

Show a VS Code notification when a local Codex turn ends. Offer a switch action only when the source process can be uniquely matched to an open integrated terminal.

## Event handling

The Codex user-level `notify` command invokes the bundled bridge. The bridge accepts the JSON payload, preserves the existing Codex turn-ended notification behavior when the Codex notifier is available, and writes a minimal event to the local pending queue.

The event records identifiers, working directory, completion time, and process IDs with creation times. It does not store prompts, assistant replies, process command lines, or environment variables. The extension continues to accept legacy Codex v1 events and process-aware v2 events.

## Terminal matching

The extension compares the event's process ancestry with terminals in the current VS Code window. A switch action appears only for one unique match. If matching fails or the terminal has closed, the extension shows a reminder without creating a terminal or restarting the session.

## Verification

Automated tests cover payload validation, process identity matching, duplicate handling, terminal focus action selection, and compatibility with legacy Codex events. The user confirmed that selecting a completion notification switched to the matching session terminal in the tested local Windows VS Code setup.
