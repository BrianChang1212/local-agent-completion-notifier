# Kiro CLI Completion Integration

## Scope

The integration receives local Kiro CLI V3 `Stop` hook events and displays a VS Code notification. When process ancestry uniquely identifies the source integrated terminal, the notification action switches to that terminal. It does not support Kiro IDE chat, Kiro Web, cloud sessions, or automatically converting existing V2 sessions.

## Design

- A user-level Kiro hook invokes a bridge installed under `%LOCALAPPDATA%\LocalAgentCompletionNotifier\bridge`.
- The bridge records only event identifiers, working directory, completion time, and process IDs with process creation times. It does not store prompts, replies, command lines, or environment variables.
- The extension validates provider-specific event data and claims unmatched reminders to prevent duplicate notifications across windows.
- Terminal switching is offered only for a unique process match. If no unique match exists, the notification has no switch action.
- The setup helper refuses to overwrite a different hook configuration and keeps a backup before replacing a previously installed bridge.

## Install and remove

Run `scripts/install-kiro-hook.ps1` from the extracted extension source directory. It installs the bridge under local app data and creates `%USERPROFILE%\.kiro\hooks\local-agent-completion-notifier.json`. Start a Kiro CLI V3 session to use the integration.

To remove the integration, remove only `local-agent-completion-notifier.json` from the Kiro hooks directory. The extension and its queued events can be removed separately.

## Verification record

- Automated Node and PowerShell bridge tests passed during implementation.
- A Kiro CLI V3 session produced a valid completion event.
- The user confirmed receiving the completion notification and switching to the corresponding session terminal by selecting its action.
- These checks verify notification delivery and terminal focus for the tested local Windows VS Code setup; they do not imply support for other terminals or Kiro clients.
