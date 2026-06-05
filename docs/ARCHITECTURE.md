# Architecture

## Overview

StickySites is a Chrome Extension (Manifest V3) that injects a floating note workspace
into every web page. It stores notes locally in Chrome Storage with optional AES-256-GCM
encryption and optional Google Drive sync. There are no external servers or analytics.

## System context

```
  User
    |
    v
  Chrome Browser
    |
    +-- Service Worker (background, type: module)
    |     Context menus, keyboard commands, Drive sync orchestration
    |
    +-- Content Scripts (per tab, 11 files loaded in order)
    |     Floating cluster pill + slide-in panel UI
    |     Reads/writes notes via chrome.storage.local
    |     Encryption/decryption via WebCrypto API
    |
    +-- Popup Page (popup.html / popup.js)
    |     All-notes list view with search, sort, filter, export
    |     Settings: encryption toggle, Drive sync sign-in/sign-out
    |
    +-- Chrome Storage
          chrome.storage.local  — notes, prefs, crypto config, sync meta
          chrome.storage.session — cached encryption key (JWK, cleared on browser close)
```

The only external network call is to the Google Drive API (`googleapis.com`), and only
when the user has explicitly signed in to Drive sync.

## Data flow

1. **Page load** — Content scripts run at `document_idle`. `sticky-inject.js` checks for
   an existing `#stickysites-cluster` element to prevent double-injection, then
   initializes the cluster (floating pill) and panel UI.

2. **Open note** — User clicks a note-type icon in the cluster (or presses a digit key
   1–6, or uses the chord key `a`). `sticky-inject.js` calls `SS.Panel.open(noteType)`.
   If encryption is enabled and the session key is not cached, a lock overlay is shown
   instead.

3. **Rich text editing** — `panel.js` renders a `contenteditable` div with a toolbar
   (bold, italic, underline, lists, link) for `global`/`site`/`page` note types.
   `todo` and `outline` types render custom item-list renderers. All changes debounce
   500 ms before writing to `chrome.storage.local`.

4. **Encryption at rest** — When encryption is enabled, storage values are AES-GCM
   encrypted envelopes `{ iv, data }` before being written. On read, the session key
   (cached in `chrome.storage.session`) is used to decrypt in-memory. If the key is
   absent the lock overlay is shown.

5. **Cross-tab sync** — `chrome.storage.onChanged` fires in every tab that has the
   content scripts. `panel.js` receives storage changes via `SS.Panel.syncFromStorage()`
   and updates the open panel if the changed key matches the current note type.

6. **Drive sync** — After any note storage change, the service worker debounces a 30-second
   timer then calls `doSync()`. Sync compares local vs. remote timestamps; conflicts
   produce a `_conflict_<ts>` copy in local storage and the newest version wins.

7. **Context menu clips** — Right-clicking selected text shows a "StickySites" submenu.
   The service worker sends a `STICKYSITES_CLIP` message to the active tab. The content
   script appends the text to the target note type without opening the panel.

8. **Toggle visibility** — The keyboard shortcut `Alt+S` (or toolbar icon, if configured)
   sends `STICKYSITES_TOGGLE` to the active tab, toggling the cluster and closing the panel.

## Content script module loading order

Because MV3 content scripts do not support ES module `import`, all content-script modules
attach themselves to the `window.StickySites` namespace in a defined load order:

| Load order | File | Namespace key |
|-----------|------|---------------|
| 1 | `crypto-content.js` | `window.StickySites.Crypto` |
| 2 | `sync-content.js` | `window.StickySites.Sync` |
| 3 | `note-types.js` | `window.StickySites.noteTypes` |
| 4 | `prefs.js` | `window.StickySites.Prefs` |
| 5 | `cluster.js` | `window.StickySites.Cluster` |
| 6 | `todo.js` | `window.StickySites.Todo` |
| 7 | `outline-ops.js` | `window.StickySites.OutlineOps` |
| 8 | `outline.js` | `window.StickySites.Outline` |
| 9 | `mentions.js` | `window.StickySites.Mentions` |
| 10 | `panel.js` | `window.StickySites.Panel` |
| 11 | `sticky-inject.js` | (orchestrator — consumes all of the above) |

The service worker and popup use ES modules (`import`/`export`) and can reference the
shared modules in `src/shared/` directly.

## Storage schema

All persistent data lives in `chrome.storage.local`. When encryption is enabled, note
values are replaced with `{ iv: base64, data: base64 }` envelopes.

| Key | Shape | Notes |
|-----|-------|-------|
| `stickysites_global_v1` | `{ body: string, updatedAt: ISO8601 }` | Single global note (rich HTML body) |
| `stickysites_sites_v1` | `{ [domain]: SiteNote }` | Map keyed by hostname without `www.` |
| `stickysites_pages_v1` | `{ [origin+path]: PageNote }` | Map keyed by `origin + pathname` |
| `stickysites_todos_v1` | `{ __global__: TodoRecord }` | Single global to-do record |
| `stickysites_outlines_v1` | `{ [outlineKey]: OutlineRecord }` | Named outline library (`ol_<id>` keys; legacy hostname keys adapt at read time) |
| `stickysites_daily_v1` | `{ [YYYY-MM-DD]: DailyNote }` | Map keyed by date string |
| `stickysites_prefs_v1` | `{ clusterPosition: { x, y }, panelMode: string }` | User preferences |
| `stickysites_crypto_v1` | `{ enabled: bool, salt: base64, verify: envelope }` | Encryption config |
| `stickysites_sync_meta` | `{ signedIn: bool, lastSync: ISO8601, perKey: { [key]: SyncKeyMeta } }` | Drive sync state |

**chrome.storage.session** (cleared on browser close):

| Key | Shape | Notes |
|-----|-------|-------|
| `stickysites_session_key` | JWK object | Derived AES-GCM key cached for the browser session |

**SiteNote**: `{ key, label, body: richHTML, tags: string[], createdAt, updatedAt }` (legacy: `siteKey`, `siteLabel`)

**PageNote**: `{ key, label, body: richHTML, tags: string[], createdAt, updatedAt }` (legacy: `pageKey`, `pageLabel`)

**TodoRecord**: `{ key, items: [{ id, text, done }], createdAt, updatedAt }` (global; key is `'__global__'`)

**OutlineRecord**: `{ key, name, items: [{ id, text, children, collapsed }], createdAt, updatedAt }` (key is `ol_<id>`; legacy keys are hostname strings)

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Read/write `chrome.storage.local` and `chrome.storage.session` |
| `activeTab` | Send messages to the current tab |
| `contextMenus` | Register the "StickySites" right-click submenu |
| `identity` | Google OAuth token acquisition for Drive sync |

## Design decisions

### Namespace pattern for content scripts

Content scripts cannot use ES module `import`. All content-script modules attach to
`window.StickySites` and are loaded by the manifest in dependency order. The shared
`src/shared/` modules are ES modules used only by the service worker, popup, and tests.

### IIFE guard clause

`sticky-inject.js` exits early if `#stickysites-cluster` already exists, preventing
double-injection when Chrome re-injects content scripts after extension updates.

### Session-scoped key caching

The derived AES-GCM key is stored as a JWK in `chrome.storage.session` so the user
only enters their passphrase once per browser session. `chrome.storage.session` is
accessible to content scripts because the service worker sets
`setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })` on install.

### Drive sync debounce

Auto-sync is debounced at 30 seconds after the last note change to avoid excessive
API calls during rapid editing. The popup can also trigger an immediate sync.

### Conflict resolution

When both local and remote data changed since the last sync, the newest version wins
and the loser is saved to a `_conflict_<timestamp>` key in local storage. These copies
are not yet surfaced in the UI.
