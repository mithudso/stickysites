# External Calls

StickySites makes **no network calls**. Everything stays in `chrome.storage.local`. The one
call that leaves the browser is optional local IPC: the to-do sync with a native-messaging
host. Chrome-internal APIs (`chrome.storage`, `chrome.tabs`, `chrome.windows`,
`chrome.alarms`, `chrome.contextMenus`) never leave the browser and are inventoried in
`integrations-and-assumptions.md`, not here.

## Inventory

| # | Call | File:line | Target | Transport | Trigger | Logger | Test | Docs | Retry |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `chrome.runtime.sendNativeMessage(TODO_HOST, { cmd:'sync', ext, items, sections })` | `src/shared/todo-bridge.js:115` (call) · `src/background/service-worker.js:103` (injection) | Host `com.mitch.todo_bridge` → `~/.claude/skills/todo/scripts/todo_host` → `todo.py native-host` → `TODO.md` | Chrome native messaging (stdio, length-prefixed JSON) | `onStartup`, `onInstalled`, alarm every 2 min, 3 s after `stickysites_todos_v1` changes | `console.warn('[stickysites] todo-sync', …)` in `runTodoSync` | `tests/todo-bridge.test.js` (23 tests: request, merge, encrypted skip, host error, malformed reply, storage failures) | this file; `runbooks/todo-sync-troubleshooting.md`; `SECURITY.md` | None in-process; the next alarm (≤ 2 min) is the retry. Not idempotency-sensitive: the host merges, and the extension writes only when the merged result differs. |

Install the host on a machine with
`python3 ~/.claude/skills/todo/scripts/todo.py install-native-host` (finds StickySites'
unpacked extension id in every Chromium profile and writes `allowed_origins`), then reload the
extension.

### Data crossing the boundary

Outbound: item `id`, `text`, `done`, `note`, `section`; section `id`, `name`; the extension id.
Inbound: the merged item list with section *names*. StickySites-only fields (indent, priority,
color, tags, `completedAt`) never leave and are re-attached by `applyHostResult`.
**Skipped entirely while `stickysites_todos_v1` is an encrypted envelope** — plaintext never
reaches the file when the vault is on.

### Error codes / outcomes

| Outcome (`syncTodosWithHost` return) | Cause | Safety |
|---|---|---|
| `{ skipped: 'encrypted' }` | Vault enabled | expected; no action |
| `{ error: 'storage read failed' }` / `'storage write failed'` | `chrome.storage.local` rejected | safe to retry (next alarm) |
| `{ error: <native error> }` e.g. `Specified native messaging host not found`, `Access to the specified native messaging host is forbidden` | Host not installed for this browser / extension id not in `allowed_origins` | **escalate**: run `install-native-host`, reload |
| `{ error: 'no reply from host' }` / `reply.error` | Host crashed or returned `ok:false` | escalate: run the host by hand (runbook) |
| `{ error: 'malformed reply from host' }` | `reply.items` not an array or merge threw | escalate; nothing written |
| `{ changed: false, count }` | Nothing to write | — |
| `{ changed: true, count }` | Record updated | — |

## Five-standard audit (mdb-tam coding standard for external calls)

| Standard | Status | Notes |
|---|---|---|
| 1. CLI / MCP trigger | **N/A — documented** | No server or CLI exists in this repo. Manual trigger: edit any to-do (3 s), reload the extension, or run the host directly (`runbooks/todo-sync-troubleshooting.md`). An operations registry with `tam_ops_*` tools would require a runtime this extension does not have. |
| 2. Centralized error log | **Partial** | `console.warn('[stickysites] todo-sync', { error })` in the service-worker console. There is no file sink (`~/.stickysites/errors.jsonl`) because extensions cannot write files; the host side (`todo.py`) owns any persistent log. |
| 3. Auto-remediation map | **Documented** | Table above: storage errors safe-to-retry via the alarm; host/config errors escalate to the install runbook. Not machine-readable (no registry module). |
| 4. Dashboard card | **N/A** | No dashboard runtime. The popup could show last-sync status — open item, not planned. |
| 5. Datastore verification | **Structural** | `chrome.storage.local.set` rejects on failure and the error is returned; no explicit read-back. The write is skipped when unchanged, so a silent no-op is intentional rather than a lost write. |

Result: the repo does **not** pass the five-standard contract literally; standards 1 and 4
presuppose a server runtime. The deviations are recorded in
`repo-bootstrap-audit-2026-09-27.md` with the rationale above.
