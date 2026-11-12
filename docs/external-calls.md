# External Calls

StickySites operates no hosted service or telemetry. Optional native and loopback calls leave
the browser. The peer daemon can then use a paired LAN or a user-selected shared/cloud folder;
a cloud provider may transfer files outside the LAN. Browser APIs such as storage, tabs,
windows, alarms, and context menus are inventoried in `integrations-and-assumptions.md`.

## Inventory

| Boundary | Call and implementation | Trigger | Authentication and bounds | Verification |
|---|---|---|---|---|
| Local native host | `sendNativeMessage(TODO_HOST, {cmd:'sync', ext, items, sections})`; `todo-bridge.js`, SW `runTodoSync` | Startup/install, two-minute alarm, three-second edit debounce | Host `com.mitch.todo_bridge`, browser manifest `allowed_origins`; native deadline in `settings.js` | Synthetic bridge/sync tests; guarded commit and persisted-value verification |
| Loopback daemon | SW `PUT /snapshot`, `GET /peers/snapshots`; popup status/config/test calls; `peer-sync.js`, `network.js`, `popup.js` | Startup/install, minute alarm, four-second edit debounce, popup controls | `127.0.0.1:47831`; daemon Host/Origin validation; fetch/JSON-body deadlines | Actual-script popup/sync tests plus isolated actual-daemon tests |
| Paired LAN | Daemon signed UDP discovery on port 47833 and HTTPS snapshots on port 47832 | Five-second announcements; peer fetches | HMAC pairing key, bearer, fingerprint pin from signed discovery; finite socket timeouts | Synthetic loopback unicast discovery and pinned TLS; real LAN authorization/delivery remains a live check |
| Shared/cloud folder | Daemon writes/reads `stickysites-peer-<id>.json` in `sync_dir` | Snapshot publication and peer reads | HMAC file signatures; private unique temporary files and serialized atomic replacement | Synthetic folder, key-rotation, malformed-file, concurrent-write, and persistence tests |

## Native host data and outcomes

The host receives item `id`, `text`, `done`, `note`, `section`; section `id`/`name`; and the
extension id. The reply contains merged items with section names. Native sync reattaches
StickySites-only fields rather than sending them through this native boundary. Peer snapshots
separately include the full stored note buckets. Native sync skips while the vault is enabled
or the to-do value is encrypted. A stale reply is rejected with `STATE_CHANGED`.

Install instructions and the optional live troubleshooting steps are in
[the to-do runbook](runbooks/todo-sync-troubleshooting.md). Normal tests use no installed host.

| Outcome | Meaning and action |
|---|---|
| `skipped: encrypted` | Vault prevents plaintext native-file export |
| Native host missing/forbidden | Install the host for this browser/extension id if wanted; otherwise notes remain local |
| Malformed/no reply or `NATIVE_TIMEOUT` | Preserve the current list; inspect the host if sync is expected |
| `STATE_CHANGED` | Input changed during the call; preserve newer edits and let a later scheduled run retry |
| Storage read/write or `STORAGE_VERIFY_FAILED` | Persistence did not complete or verify; inspect the reported failure |
| `changed: false` / `changed: true` | No mutation needed / verified mutation completed |

## Peer snapshots and outcomes

Snapshots contain the six note buckets, tombstones, device identity, and vault configuration.
Preferences and the cached key do not sync. Vault-on note buckets are encrypted envelopes;
tombstone keys/timestamps, crypto configuration, and device/folder metadata remain plaintext.
Vault-off snapshots contain plaintext notes. A folder signature authenticates the file and
does not encrypt it. See [privacy](../PRIVACY.md) and [peer setup](../peer/README.md).

| Status | Meaning |
|---|---|
| `no-daemon` | Loopback connection failed; one warning per outage; later alarm retries |
| `no-peers` | No usable other snapshot seen |
| `unreachable` / `partial` | Discovered peer errors prevent all/some fetches; inspect per-peer errors |
| `ok` | Merge completed; status includes changed keys and applied/deleted/kept counts |
| `locked` | Unlock before merging |
| `adopted-remote-vault` | Peer config adopted; enter that vault's passphrase |
| `mismatch` | Different vault salts; reconcile deliberately using the peer runbook |
| `error` | Bounded request, decryption, stale input, or persistence failure; current data is retained on rejected commits |
| `disabled` | User toggle is off |

Network work stays outside the service worker write queue. A guarded commit checks its input
before publishing a result; verification reads the persisted values. Scheduled retries are
bounded by the normal alarms rather than an unbounded in-process loop. The daemon keeps the
last successful config/snapshot when disk replacement fails.

## Standards applicability

The extension has no hosted operations registry or dashboard runtime. It does have an optional
peer CLI, popup sync/status controls, browser-console diagnostics, and a daemon file log at
`~/.stickysites/peer.log`. These are the actual operational surfaces; inventing `tam_ops_*`
MCP tools would add a different product. The historical five-standard assessment and its
2026-09-27 retractions remain in `repo-bootstrap-audit-2026-09-27.md`; current runtime behavior
above supersedes its old "no read-back" and missing-status descriptions.

## Development and daemon administration boundaries

These commands are explicit developer actions. CI and the synthetic tests do not install,
reload, sign, or start an installed application. File writes stay at the documented output
paths. A failed verification does not imply that a previous write was rolled back.

| Implementation | Target and trigger | Failure log / policy | Test or verification / docs |
|---|---|---|---|
| `scripts/check-syntax.mjs:36` | Child Node `--check` for each maintained JS file; `npm run lint` | Named file/error, nonzero exit; fix then rerun | `tests/tooling.test.js`; DEVELOPMENT |
| `scripts/generate-docs.mjs`, `execFileSync` | Read-only `git ls-files`; text files written by `npm run docs:generate` | Named generation error/nonzero; `--check` reads only; rerun after fixing | `tests/tooling-docs.test.js`, generated drift gate; DEVELOPMENT |
| `scripts/build-store-zip.mjs:51` | Child `zip` and `unzip`; `npm run build:store` | Nonzero on subprocess or membership failure; rejected artifact removed; manual retry | `tests/tooling.test.js`; release-packaging runbook |
| `scripts/harness-resources.mjs`; `verify-live.mjs`, `store-screenshots.mjs` | Explicit Chrome-for-Testing launch, local fixture HTTP server, screenshots/downloads | Privacy-safe step/cleanup error; no automatic live run; owned resources cleaned in finally, profiles retained if browser cannot close | `tests/tooling-harness.test.js`; TESTING and release-packaging runbook |
| `scripts/generate-icons.js`, `store-promo.mjs` | Canvas raster files in `icons/` or `store/promo/`; explicit npm commands | CLI error/nonzero; inspect output then rerun | Source audit and existing generated assets only; no regeneration claimed; release-packaging runbook |
| `scripts/rotate-workflow-logs.mjs` | Repository logs/archive plus private Git-state journal/lock; `npm run logs:rotate` | Named failure, preserve unresolved journal; explicit dead-owner `--recover`; no blanket retry | `tests/tooling.test.js`; logging guide |
| `peer/stickysites-peer.py`, `ensure_cert` | Child OpenSSL creates a local self-signed certificate during explicit initialization | Checked subprocess failure; correct local prerequisites before retry | Disposable actual-daemon fixture; peer README |
| `peer/stickysites-peer.py`, `local_ipv4_interfaces` / `_ifname_for` | `ip`, `ifconfig`, hostname resolution, UDP route selection | Bounded commands/fallback addresses; discovery retries on its normal schedule | Source audit; synthetic fixtures override interfaces to loopback; real OS/LAN routing not verified |
| `peer/stickysites-peer.py`, `install` / `uninstall` / app wrapper | Explicit CLI writes app/plist and invokes Apple Python probe, `codesign`, `launchctl`, `open` | CLI errors; inspect local install/status before manual action | Source audit only; never executed in maintenance; peer README |
| `peer/stickysites-peer.py`, `status` / `folder` / `probe` | Explicit loopback `urlopen` with finite timeout, diagnostic UDP sockets, config reads/writes | CLI error/status; user resolves address/pairing/config before retry | Synthetic handler/socket coverage only; peer README and peer-sync runbook |
| `.mcp.json`, `.vscode/mcp.json` | Optional developer's machine-wide hub process, started by the editor/agent | Host tooling owns diagnostics; no shipped MCP server or duplicate indexer | Read-only lookup/config-shape check; MCP guide; indexing remains opt-in |

The operational adaptation of the five standards is deliberate: browser/popup controls and
the daemon CLI provide triggers and status; console/daemon logs provide diagnostics; alarms
provide bounded retries; the worker verifies storage writes. The repository has no server
registry or dashboard in which to add generated cards or `tam_ops_*` registrations. Auth,
invalid data, and persistence failures require inspection; they do not trigger destructive
auto-remediation. Installed native-host manifests and machine services remain outside this
repository's maintained source universe.
