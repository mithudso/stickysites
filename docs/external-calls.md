# External Calls

StickySites makes no external network calls. Its one call outside the browser is optional local IPC: the to-do sync (below). All data stays in `chrome.storage.local`
(with the cached encryption key in `chrome.storage.session`). There is no OAuth, no
telemetry, and no third-party requests.

## Chrome Storage

All storage calls are local and synchronous-in-practice. Not documented as
external calls since they never leave the browser.

## To-do sync (native messaging, optional)

| Call | Where | Target | Trigger | Failure handling |
|---|---|---|---|---|
| `chrome.runtime.sendNativeMessage('com.mitch.todo_bridge', {cmd:'sync', ext, items, sections})` | `src/shared/todo-bridge.js` (`syncTodosWithHost`), driven by `src/background/service-worker.js` | Local process `~/.claude/skills/todo/scripts/todo_host` (runs `todo.py native-host`), which three-way merges with `~/dev/personal/Areas/todo/TODO.md` | Browser start, install/reload, alarm every 2 min, 3 s after a to-do edit | Host missing or erroring: caught, list stays local. Malformed reply: rejected, nothing written. Encrypted list: skipped before the call. |

Install the host on a box with `python3 ~/.claude/skills/todo/scripts/todo.py install-native-host` (it finds StickySites' unpacked extension id in each Chromium browser profile), then reload the extension.
