# Testing

## Commands

Use the Node version in `.nvmrc` that satisfies `package.json` engines, then `npm ci`.

```bash
npm run lint                              # syntax, ESLint, manifest/package version agreement
npm test                                  # Vitest pure modules and runtime regressions
npm run test:peer                         # Python/OpenSSL; isolated actual daemon modules
npm run test:watch                        # Vitest watch mode
npx vitest run tests/todo-bridge.test.js   # focused file
npm run docs:check-indexes                # retrieval/wiki paths resolve
npm run docs:check-generated             # generated docs agree with sources
npm run build:store                       # runtime package validation
```

CI runs JavaScript and peer tests inside a Linux network namespace with only loopback.
Package installation occurs before that isolation.

CI's exact gates are in `.github/workflows/ci.yml`. Test totals and source line counts are
not documentation contracts; inspect the current runner output. Passing synthetic tests does
not establish a live browser, installed native host, launchd job, or real LAN deployment.

## Suites and fixtures

| File/group | Coverage |
|---|---|
| `notes-storage.test.js` | Reference CRUD, keys, timestamps, tags, and preference shapes |
| `outline-ops.test.js` | Tree operations, filtering, tags, grouping, Markdown/OPML export |
| `crypto.test.js` | Salt/key derivation, AES-GCM round trips, wrong-key rejection, envelope shapes |
| `peer-sync.test.js` | Snapshot shape, vault compatibility, record LWW, tombstones, orchestration |
| `todo-bridge.test.js` | Native request/reply normalization, local-only fields, encrypted skip, failures |
| `ui-boundaries.test.js` | Save/blur/transition races, outline clips, checkbox/formatting persistence, OPML whitespace, popout lock, cluster geometry |
| `runtime-regressions.test.js` | Actual classic-script rendering, mentions, HTML filtering, queued mutations, vault staging, and stale/failed writes |
| `popup-regressions.test.js` | Actual popup lock/settings behavior, preference merging, stale async work, bounded response bodies |
| `browser-integration.test.js`, `service-worker.test.js` | Manifest script order, all six editors, clip/vault/lock, actual worker alarm/message completion |
| `vault-legacy.test.js`, `vault-import.test.js` | Always-on frozen-corpus decryption; optional-package absence versus installed import failure |
| `sync-regressions.test.js` | Changes during native/peer requests, malformed peers, response-body deadlines |
| `tooling*.test.js` | Package, syntax, documentation generation, and optional browser-harness behavior |
| `peer/test_peer.py`, `peer/peer_fixture.py` | Actual daemon discovery, handlers, pinned TLS, auth, ETags, folder/config/persistence failures, invalid lengths, stalled clients, fixture cleanup/isolation |
| `crypto-vault-compat.test.js` | Optional private-package interoperability against frozen legacy envelopes; package absence skips this suite |

`tests/helpers/runtime.js` uses jsdom and synthetic Chrome storage/IPC. Tests load the actual
classic scripts rather than a rewritten implementation. Worker tests also simulate an HTTP
content context without WebCrypto and assert asynchronous response channels remain open. Storage, native replies, and fetch
responses remain synthetic. Tests do not activate the user's extension, daemon, or host.

The Python fixture imports fresh daemon modules with temporary `STICKYSITES_HOME` directories
and dynamic ports. HTTP, HTTPS, and UDP sockets bind to `127.0.0.1`. It keeps production HMAC
announce/listen logic while directing discovery over loopback unicast with a synthetic
interface inventory. It exercises the same server factory as `run()`, registers cleanup
before acquisition, retains bounded startup diagnostics, and supports concurrent runs without
LAN permissions or fixed ports. Python 3.9+ and `openssl` are required.

For this maintenance batch, local automated tests use the task-local process-tree egress
runner outside this repository. It denies outbound traffic, including loopback, except exact
owned TCP fixture ports. The peer guarded launcher reserves and inherits those listeners.
The runner cannot permit UDP fixture sends. Local guarded parser tests use an injected
datagram socket; the full actual UDP discovery test runs in isolated CI. Earlier local
loopback passes preceded the guard and are not evidence of guarded isolation. Git test
fixtures strip inherited selectors/config, use empty templates, and verify effective hooks
before committing; a hostile hook sentinel checks that boundary.

## Compatibility boundaries

`tests/fixtures/legacy-crypto-envelopes.json` is a frozen historical corpus. Normal tests do
not regenerate it or install the optional private package. A skipped private compatibility
suite is not evidence of interoperability. Follow the suite's setup instructions only when
that private-package work is explicitly in scope.

## Coverage target and limits

Prioritize observable data-loss, stale-write, vault, import/rendering, and integration failure
paths. Add a behavioral regression when changing those contracts. No blanket line-percentage
threshold is enforced. Use `vi.spyOn(console, 'warn')` when the log behavior matters.

jsdom cannot establish real `execCommand`, caret/layout, extension permission handling,
Chrome service-worker lifecycle, or OS network authorization. The synthetic peer suite does
not establish real multicast/broadcast delivery, VPN behavior, cloud-client propagation, or
launchd installation. Keep these limits in verification reports.

## Optional live harnesses

`npm run verify:live` and `npm run store:screenshots` use puppeteer-core and a compatible
Chrome for Testing/Chromium binary. Install the optional harness prerequisite only when a
live run is authorized; set `SS_CHROME` for either harness. Branded Chrome versions may
ignore `--load-extension`; consult the current harness prerequisites.

The verification harness serves local fixtures and checks identity icons, caret stability,
page identity, SPA navigation, cross-tab sync, outliner interactions, popup storage, and
vault enable/lock/unlock. Screenshots go to `/tmp/stickysites-verify`. Store screenshots have
their own output under `store/screenshots/`. Neither harness's presence proves it was run.
Do not reload an active user extension or daemon merely to complete automated maintenance.
For an explicitly requested manual smoke, follow
[load/reload](runbooks/load-and-reload-extension.md).
