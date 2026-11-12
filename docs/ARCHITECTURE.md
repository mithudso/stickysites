# Architecture

## Overview

StickySites is a Chrome Extension (Manifest V3) that injects a floating note workspace into
every web page. Notes live in `chrome.storage.local` with optional AES-256-GCM encryption.
There is no hosted StickySites service or telemetry. Optional native messaging mirrors
to-dos into `TODO.md`. An optional loopback daemon relays snapshots to paired LAN computers
or to a shared/cloud folder selected by the user.

## System context

```
  User ──▶ Chrome
            ├─ Content scripts (per tab; classic scripts in manifest order)
            │    Cluster pill · Panel (rich text / to-do / outliner) · lock overlay · toast
            │    reads storage; mutations ──▶ service-worker write queue
            ├─ Service worker (ES module)
            │    menus · commands · popout · sync · note-writer queue → chrome.storage.local
            │    ──▶ chrome.runtime.sendNativeMessage('com.mitch.todo_bridge')  (optional)
            │    │     └─▶ ~/.claude/skills/todo/scripts/todo_host ⇄ TODO.md
            │    ──▶ fetch http://127.0.0.1:47831  (optional peer daemon, peer/stickysites-peer.py)
            │          ├─▶ LAN: signed discovery + pinned HTTPS ⇄ paired daemons
            │          └─▶ selected shared/cloud folder ⇄ paired snapshot files
            ├─ Popup page (popup.html)   Quick-Open · search · settings · lock screen
            └─ Popout page (popout.html) Panel filling its own window
```

External actors: the user; the host web page (untrusted DOM the UI is injected into); the
optional native host process; the optional peer daemon and, through it, the user's other
machines holding the same pairing key, plus any folder provider the user chooses.

## Runtime contexts and communication

| Context | File(s) | Module system | Talks to |
|---|---|---|---|
| Content scripts | `src/content/*.js` | classic, `window.StickySites.*` | storage reads; SW via `STICKYSITES_WRITE` / `POPOUT` / `UNLOCK`; receives `TOGGLE` / `OPEN` / `CLIP` |
| Service worker | `src/background/service-worker.js` | ES module (`note-writer.js`, sync/crypto modules, shared classic helpers) | tabs via `tabs.sendMessage`; native host; `windows.create`; loopback `fetch` to the peer daemon |
| Popup | `popup.html` + shared classic helpers + `popup.js` | classic `<script>` | storage reads; queued mutations; active tab via `tabs.sendMessage(OPEN/TOGGLE)`; SW via `POPOUT` |
| Popout | `popout.html` + namespace helpers + `popout.js` | classic `<script>` | storage reads; queued mutations via SW |
| Tests | `tests/*.test.js` | Vitest, node/jsdom | synthetic storage, IPC, fetch, and native calls |

## Data flows

1. **Page load** — content scripts run at `document_idle`. `sticky-inject.js` exits if
   `#stickysites-cluster` already exists, else initialises `Panel` and `Cluster` from prefs.
2. **Open a note** — cluster icon click, `Ctrl/Cmd+F1…F6`, popup Quick-Open (`STICKYSITES_OPEN`),
   or a clip. `checkUnlocked()` first: if encryption is enabled and no cached key, the lock
   overlay is shown instead. `Panel.open(type)` snapshots `_activeKey`/`_activeLabel`, reads
   and decrypts the record, renders the right editor. The notice opens a fixed extension-origin
   unlock window; the host page has no passphrase input.
3. **Edit** — rich text (`contenteditable` + `execCommand`), to-do list, or outliner. Every
   change arms a 500 ms debounce; the write encrypts when a key is cached. `flushPendingSave()`
   commits early on close, switch, popout, or SPA re-key. Mutations enter the single SW
   queue, read fresh records, and verify persistence. A deletion and its tombstone share a write.
4. **Cross-tab sync** — `chrome.storage.onChanged` in every tab → `Panel.syncFromStorage`.
   Guards: self-echo (skip the body this panel just wrote), focus (never rewrite a focused
   editor, re-checked after async decryption), dirty/in-flight saves, encryption (skip while locked).
5. **SPA navigation** — `popstate`, `hashchange`, and a 1 s `href` poll. On change: flush the
   pending save under the old key, `Cluster.refreshIcons()`, re-open an open site/page note
   under the new key.
6. **Clip** — right-click selection → SW `contextMenus.onClicked` → `STICKYSITES_CLIP` →
   a queued clip command appends escaped text to a fresh target record and shows a toast.
7. **Popout** — ⧉ button or drag-off-page → `Panel._popoutActiveNote()` → flush →
   `STICKYSITES_POPOUT` → SW `windows.create(popout.html?type&key&label, 1400×1100)`.
   `popout.js` overrides `getKey/getLabel` on a cloned note type and opens the panel.
8. **To-do sync** — SW runs `syncTodosWithHost` on startup/install, every 2 min (alarm), and
   3 s after `stickysites_todos_v1` changes. Skipped while the vault is enabled or the value is an encrypted envelope.
   The host three-way-merges with `TODO.md`; `applyHostResult` folds the reply back while
   keeping StickySites-only fields. A guarded commit rejects the reply with `STATE_CHANGED`
   if the to-do or vault changed while the host was working.
9. **Local peer sync** — SW runs `syncWithDaemon` on startup/install, every minute (alarm),
   4 s after a note/tombstone/crypto change, and on `STICKYSITES_PEER_SYNC_NOW`. It `PUT`s a
   snapshot (six note keys as stored + tombstones + reduced vault config) to
   `http://127.0.0.1:47831`, `GET`s peer snapshots from LAN or the selected folder, merges
   record-level last-writer-wins on `updatedAt` (decrypting/re-encrypting with the cached key
   when the vault is on and salts match), and guarded-commits changed keys only if the inputs
   remain current. No daemon → one warning, no-op.
10. **Encryption lifecycle** — popup Settings → `Crypto.enable(passphrase)` derives the key,
   stages every encrypted bucket, config, and cached JWK before one guarded multi-key write.
   Disable stages every decryption first, so a corrupt bucket preserves the vault for recovery.
   **Lock Now** clears the cached key; unlock re-derives and verifies. The JWK otherwise
   remains in `chrome.storage.local` across browser restarts. Content pages without secure-context
   WebCrypto use extension-worker vault IPC with the same lifecycle and storage protocol.

## Content script load order

| Order | File | Purpose |
|---|---|---|
| First | `src/shared/settings.js`, `src/shared/network.js` | Preference normalization and bounded requests |
| Then | `storage-content.js`, `safe-html.js`, `crypto-content.js` | Mutation IPC, inert HTML filtering, vault operations |
| Then | `note-types.js`, `prefs.js`, `cluster.js`, `todo.js`, `outline-ops.js` | Descriptors, preferences, and UI primitives |
| Last | `outline.js`, `mentions.js`, `panel.js`, `sticky-inject.js` | Editors and orchestration |

`manifest.json` is the exact ordered source of truth. Extension-page script lists live in
`popup.html` and `popout.html`; they also load the shared mutation and safety helpers.

## Storage schema (`chrome.storage.local`)

Encrypted note values are replaced wholesale by `{ iv: base64, data: base64 }` envelopes.

| Key | Shape |
|-----|-------|
| `stickysites_global_v1` | `{ body, updatedAt }` |
| `stickysites_sites_v1` | `{ [hostname]: { key, label, body, tags[], createdAt, updatedAt } }` (legacy `siteKey`/`siteLabel`) |
| `stickysites_pages_v1` | `{ [origin+pathname]: { key, label, body, tags[], createdAt, updatedAt } }` (legacy `pageKey`/`pageLabel`) |
| `stickysites_todos_v1` | `{ __global__: { key, items[], sections[], tagColors, createdAt, updatedAt } }` |
| `stickysites_outlines_v1` | `{ [ol_<id>]: { key, name, items[], createdAt, updatedAt } }` (legacy hostname keys adapt at read) |
| `stickysites_daily_v1` | `{ [YYYY-MM-DD]: { key, body, ... } }` |
| `stickysites_prefs_v1` | `{ clusterPosition {x,y}, clusterLayout, collapseToCircle, iconOrder, enabledTypes, panelSize, panelPosition, activeOutlineId, panelMode (unused) }` |
| `stickysites_crypto_v1` | `{ enabled, salt: base64, verify: envelope }` |
| `stickysites_cached_key` | JWK of the derived AES-GCM key while unlocked; null/absent while locked |
| `stickysites_tombstones_v1` | `{ [storageKey]: { [recordKey]: deletedAtISO } }` — deletions to propagate via peer sync (plaintext) |
| `stickysites_peer_v1` | `{ deviceId, enabled, lastSync, lastResult: { status, peers[], changedKeys[], stats } }` |

**Todo item**: `{ id, text, done, indent 0–3, priority 0–5, color, tags[], note, section, completedAt }`.
**Outline node**: `{ id, text, children[], collapsed, note, done, tags[] }`.

`chrome.storage.session` is not used (an earlier design cached the key there; the dead
`setAccessLevel` call was removed in v1.11.1).

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | All persistence |
| `activeTab` | `tabs.sendMessage` / `tabs.query` for the active tab |
| `contextMenus` | The "StickySites" clip submenu |
| `alarms` | To-do and peer sync schedules (service workers cannot retain timers) |
| `nativeMessaging` | `runtime.sendNativeMessage` to `com.mitch.todo_bridge` |

Content scripts match `<all_urls>` at `document_idle`.

## Design decisions (ADRs)

### ADR-1 Namespace pattern for content scripts
MV3 content scripts cannot `import`. Every module attaches to `window.StickySites` and the
manifest lists them in dependency order. Consequence: `popout.html` must repeat the list;
`crypto.js` (ES) duplicates `crypto-content.js` (namespace) for the worker and tests.
Portable `settings.js` and `network.js` classic helpers also run in the module worker.

### ADR-2 IIFE guard against double injection
`sticky-inject.js` returns if `#stickysites-cluster` exists, so re-injection after an
extension update cannot build a second UI (orphaned listeners remain — `known-issues.md`).

### ADR-3 Cached key lives in `chrome.storage.local` until Lock Now
The derived key's JWK persists across browser restarts instead of dying with a session.
Consequence: one passphrase entry per explicit lock rather than per session; the JWK sits in
the profile directory while unlocked (`docs/SECURITY.md`). An earlier design used
`chrome.storage.session`; docs and code were reconciled in v1.11.1.

### ADR-4 Snapshot the note key at `open()`
The panel never re-derives its key mid-session; SPA navigation re-keys by flushing and
re-opening. This closed a class of "saved under the wrong page" bugs.

### ADR-5 Outliner is a global library, not site-keyed
Outline docs are `ol_<id>` records with names; the active doc is a pref. Legacy hostname keys
adapt at read time. Consequence: `noteType.getKey` returns `''` and the renderer resolves the doc.

### ADR-6 No bare-key hotkeys
Bare `1`–`5`/`A` shortcuts hijacked typing and `Cmd+A`; only `Alt+S` and `Ctrl/Cmd+F1…F6` remain.

### ADR-7 The native host owns the to-do merge
The extension sends its full list and accepts the host's result; it adds nothing but
StickySites-only fields. Consequence: merge rules live in one place (`todo.py`), and the
extension needs no file access. Sync is skipped for encrypted data so plaintext never reaches disk.

### ADR-9 Peer sync through a local relay daemon, merge in the extension
Extensions cannot listen on sockets or do multicast, so a stdlib-Python daemon per machine handles
discovery (UDP multicast plus subnet broadcast on every non-tunnel interface, optional static
peers; HMAC-signed with a shared pairing key) and transport (HTTPS, pinned
self-signed cert, bearer token). The daemon only stores and relays opaque snapshots; the merge
(record-level LWW + tombstones, vault-aware) lives in `src/shared/peer-sync.js` where it is
unit-tested. The extension reaches the daemon with a CORS-gated loopback `fetch`, so no manifest
permission was added. Consequence: snapshots are full-state each minute (fine at note scale);
deletions need tombstones (only outline docs delete today).

### ADR-8 Read-time schema adaptation instead of migrations
Legacy field names and keys are normalised when read. Storage keys are versioned (`_v1`)
so a breaking change can still ship as a new key.
