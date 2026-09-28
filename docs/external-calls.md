# External Calls

StickySites makes **no internet calls**. Everything stays in `chrome.storage.local`. Two optional
calls leave the browser, both to processes on the same machine: the to-do sync with a
native-messaging host, and the loopback HTTP calls to the local peer-sync daemon (which in turn
talks only to the user's paired machines on the LAN). Chrome-internal APIs (`chrome.storage`, `chrome.tabs`, `chrome.windows`,
`chrome.alarms`, `chrome.contextMenus`) never leave the browser and are inventoried in
`integrations-and-assumptions.md`, not here.

## Inventory

| # | Call | File:line | Target | Transport | Trigger | Logger | Test | Docs | Retry |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `chrome.runtime.sendNativeMessage(TODO_HOST, { cmd:'sync', ext, items, sections })` | `src/shared/todo-bridge.js:115` (call) · `src/background/service-worker.js:103` (injection) | Host `com.mitch.todo_bridge` → `~/.claude/skills/todo/scripts/todo_host` → `todo.py native-host` → `TODO.md` | Chrome native messaging (stdio, length-prefixed JSON) | `onStartup`, `onInstalled`, alarm every 2 min, 3 s after `stickysites_todos_v1` changes | `console.warn('[stickysites] todo-sync', …)` in `runTodoSync` | `tests/todo-bridge.test.js` (23 tests: request, merge, encrypted skip, host error, malformed reply, storage failures) | this file; `runbooks/todo-sync-troubleshooting.md`; `SECURITY.md` | None in-process; the next alarm (≤ 2 min) is the retry. Not idempotency-sensitive: the host merges, and the extension writes only when the merged result differs. |

| 2 | `fetch('http://127.0.0.1:47831/snapshot', PUT)` · `fetch('http://127.0.0.1:47831/peers/snapshots')` | `src/shared/peer-sync.js` `syncWithDaemon` (calls) · `src/background/service-worker.js` `runPeerSync` (injection, schedule) | Local daemon `peer/stickysites-peer.py` → LAN peers over HTTPS (`:47832`, pinned cert, bearer) discovered via UDP multicast `239.255.77.31` + subnet broadcast on `:47833` | Loopback HTTP (CORS-gated to the extension origin; no host permission) | `onStartup`, `onInstalled`, alarm every 1 min, 4 s after note/tombstone/crypto change, popup **Sync now** | `console.warn('[stickysites] peer-sync', …)` once per outage + on errors; status persisted in `stickysites_peer_v1.lastResult` and shown in popup Settings | `tests/peer-sync.test.js` (24: snapshot, compatibility, LWW merge, tombstones, orchestration with fake daemon/crypto) + `peer/test_peer.py` (two daemons: discovery, CORS, auth, ETag round-trip) | this file; `peer/README.md`; `runbooks/peer-sync.md`; `SECURITY.md` | None in-process; next alarm (≤ 1 min) retries. Idempotent: full-state snapshots, merge only writes changed keys. |

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

### Peer sync outcomes (`syncWithDaemon` → `stickysites_peer_v1.lastResult.status`)

| Status | Meaning | Safety |
|---|---|---|
| `no-daemon` | Loopback fetch failed — helper not installed/running | expected; logged once; retry next alarm |
| `no-peers` | Daemon up, no other paired machine seen (or only our own echo) | expected |
| `ok` | Merged; `stats.applied/deleted/kept`, `changedKeys` | — |
| `locked` | Vault on, no cached key — nothing merged | expected; user unlocks |
| `adopted-remote-vault` | Took a peer's vault config; now locked | user enters that passphrase |
| `mismatch` | Both vaults on with different salts — nothing written | **escalate**: disable encryption on one side (runbook) |
| `error` | Daemon HTTP error, undecryptable local key, storage failure (`error` text) | logged; retry next alarm |
| `disabled` | Toggle off in Settings | — |

## Five-standard audit (mdb-tam coding standard for external calls)

| Standard | Status | Notes |
|---|---|---|
| 1. CLI / MCP trigger | **N/A — documented** | No server or CLI exists in this repo. Manual trigger: edit any to-do (3 s), reload the extension, or run the host directly (`runbooks/todo-sync-troubleshooting.md`). An operations registry with `tam_ops_*` tools would require a runtime this extension does not have. |
| 2. Centralized error log | **Partial** | `console.warn('[stickysites] todo-sync' / 'peer-sync', …)` in the service-worker console; peer-sync status is also persisted in `stickysites_peer_v1`. There is no file sink because extensions cannot write files; the daemon logs to `~/.stickysites/peer.log`, the host side to `todo.py`'s own log. |
| 3. Auto-remediation map | **Documented** | Tables above for both calls: transient errors retry on the next alarm; config errors (host missing, vault mismatch) escalate to the runbooks. Not machine-readable (no registry module). |
| 4. Dashboard card | **N/A** | No dashboard runtime. The popup could show last-sync status — open item, not planned. |
| 5. Datastore verification | **Structural** | `chrome.storage.local.set` rejects on failure and the error is returned; no explicit read-back. The write is skipped when unchanged, so a silent no-op is intentional rather than a lost write. |

Result: the repo does **not** pass the five-standard contract literally; standards 1 and 4
presuppose a server runtime. The deviations are recorded in
`repo-bootstrap-audit-2026-09-27.md` with the rationale above.
