# Codex Session Terminal Focus

## Goal

Show a VS Code notification when a local Codex turn ends. Offer a switch action only when the source process can be uniquely matched to an open integrated terminal.

## Event handling

The Codex user-level `notify` command invokes the bundled Node dispatcher. The dispatcher forwards the payload to the installed Computer Use notifier when available, then passes it through standard input to the PowerShell bridge. The bridge writes a minimal process-aware event to the local pending queue. If the bridge fails, the dispatcher queues a legacy general-reminder event.

The event records identifiers, working directory, completion time, and process IDs with creation times. It does not store prompts, assistant replies, process command lines, or environment variables. The extension continues to accept legacy Codex v1 events and process-aware v2 events.

## Terminal matching

The extension compares the event's process ancestry with terminals in the current VS Code window. A switch action appears only for one unique match. If a Codex match cannot be made after a short delay, the extension shows a general reminder without creating a terminal or restarting the session.

## Verification

Automated tests cover payload validation, dispatcher forwarding, process identity matching, duplicate handling, terminal focus action selection, unmatched reminders, and compatibility with legacy Codex events. The user confirmed that a local notification appeared and selecting it switched to the matching session terminal in a Windows VS Code integrated terminal. Pure-chat and unmatched-terminal paths have automated coverage but have not been separately confirmed in a live session.
