# Architecture

## Overview

StickySites is a Chrome Extension (Manifest V3) that injects a floating note workspace into
every web page. Notes live in `chrome.storage.local` with optional AES-256-GCM encryption.
There are no servers, network calls, or analytics. The single out-of-browser boundary is an
optional native-messaging host that mirrors the global to-do list into a local `TODO.md`.

## System context

```
  User ──▶ Chrome
            ├─ Content scripts (per tab; 10 classic scripts in manifest order)
            │    Cluster pill · Panel (rich text / to-do / outliner) · lock overlay · toast
            │    chrome.storage.local ⇄ notes, prefs, crypto config, cached key
            ├─ Service worker (ES module)
            │    context menus · Alt+S command · popout window · to-do sync scheduler
            │    ──▶ chrome.runtime.sendNativeMessage('com.mitch.todo_bridge')  (optional)
            │          └─▶ ~/.claude/skills/todo/scripts/todo_host ⇄ TODO.md
            ├─ Popup page (popup.html)   Quick-Open · search · settings · lock screen
            └─ Popout page (popout.html) Panel filling its own window
```

External actors: the user; the host web page (untrusted DOM the UI is injected into); the
optional native host process. Nothing else.

## Runtime contexts and communication

| Context | File(s) | Module system | Talks to |
|---|---|---|---|
| Content scripts | `src/content/*.js` | classic, `window.StickySites.*` | storage; SW via `runtime.sendMessage(POPOUT)`; receives `TOGGLE` / `OPEN` / `CLIP` |
| Service worker | `src/background/service-worker.js` | ES module (imports `src/shared/todo-bridge.js`) | tabs via `tabs.sendMessage`; native host; `windows.create` |
| Popup | `popup.html` + `crypto-content.js` + `popup.js` | classic `<script>` | storage; active tab via `tabs.sendMessage(OPEN/TOGGLE)`; SW via `POPOUT` |
| Popout | `popout.html` + 8 namespace scripts + `popout.js` | classic `<script>` | storage only |
| Tests | `tests/*.test.js` | ES modules (vitest, node) | mocked `chrome.storage.local` |

## Data flows

1. **Page load** — content scripts run at `document_idle`. `sticky-inject.js` exits if
   `#stickysites-cluster` already exists, else initialises `Panel` and `Cluster` from prefs.
2. **Open a note** — cluster icon click, `Ctrl/Cmd+F1…F6`, popup Quick-Open (`STICKYSITES_OPEN`),
   or a clip. `checkUnlocked()` first: if encryption is enabled and no cached key, the lock
   overlay is shown instead. `Panel.open(type)` snapshots `_activeKey`/`_activeLabel`, reads
   and decrypts the record, renders the right editor.
3. **Edit** — rich text (`contenteditable` + `execCommand`), to-do list, or outliner. Every
   change arms a 500 ms debounce; the write encrypts when a key is cached. `flushPendingSave()`
   commits early on close, switch, popout, or SPA re-key.
4. **Cross-tab sync** — `chrome.storage.onChanged` in every tab → `Panel.syncFromStorage`.
   Guards: self-echo (skip the body this panel just wrote), focus (never rewrite a focused
   editor, re-checked after async decryption), encryption (skip while locked).
5. **SPA navigation** — `popstate`, `hashchange`, and a 1 s `href` poll. On change: flush the
   pending save under the old key, `Cluster.refreshIcons()`, re-open an open site/page note
   under the new key.
6. **Clip** — right-click selection → SW `contextMenus.onClicked` → `STICKYSITES_CLIP` →
   `clipToNote()` appends escaped text to the target record and shows a toast.
7. **Popout** — ⧉ button or drag-off-page → `Panel._popoutActiveNote()` → flush →
   `STICKYSITES_POPOUT` → SW `windows.create(popout.html?type&key&label, 1400×1100)`.
   `popout.js` overrides `getKey/getLabel` on a cloned note type and opens the panel.
8. **To-do sync** — SW runs `syncTodosWithHost` on startup/install, every 2 min (alarm), and
   3 s after `stickysites_todos_v1` changes. Skipped if the value is an encrypted envelope.
   The host three-way-merges with `TODO.md`; `applyHostResult` folds the reply back while
   keeping StickySites-only fields and writes only if the canonical JSON changed.
9. **Encryption lifecycle** — popup Settings → `Crypto.enable(passphrase)` derives the key,
   stores `{ enabled, salt, verify }`, caches the JWK in `stickysites_cached_key`, re-encrypts
   the six note keys. **Lock Now** removes the cached key; unlock re-derives and verifies.

## Content script load order

| # | File | Namespace |
|---|------|-----------|
| 1 | `crypto-content.js` | `StickySites.Crypto` |
| 2 | `note-types.js` | `StickySites.noteTypes` |
| 3 | `prefs.js` | `StickySites.Prefs` |
| 4 | `cluster.js` | `StickySites.Cluster` |
| 5 | `todo.js` | `StickySites.Todo` |
| 6 | `outline-ops.js` | `StickySites.OutlineOps` |
| 7 | `outline.js` | `StickySites.Outline` |
| 8 | `mentions.js` | `StickySites.Mentions` |
| 9 | `panel.js` | `StickySites.Panel` |
| 10 | `sticky-inject.js` | orchestrator (no namespace) |

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
| `stickysites_prefs_v1` | `{ clusterPosition {x,y}, clusterLayout, iconOrder, enabledTypes, panelSize, panelPosition, activeOutlineId, panelMode (unused) }` |
| `stickysites_crypto_v1` | `{ enabled, salt: base64, verify: envelope }` |
| `stickysites_cached_key` | JWK of the derived AES-GCM key; present only while unlocked |

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
| `alarms` | 2-minute to-do sync period (service workers cannot hold timers) |
| `nativeMessaging` | `runtime.sendNativeMessage` to `com.mitch.todo_bridge` |

Content scripts match `<all_urls>` at `document_idle`.

## Design decisions (ADRs)

### ADR-1 Namespace pattern for content scripts
MV3 content scripts cannot `import`. Every module attaches to `window.StickySites` and the
manifest lists them in dependency order. Consequence: `popout.html` must repeat the list;
`crypto.js` (ES) duplicates `crypto-content.js` (namespace) for tests.

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

### ADR-8 Read-time schema adaptation instead of migrations
Legacy field names and keys are normalised when read. Storage keys are versioned (`_v1`)
so a breaking change can still ship as a new key.
