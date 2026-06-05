# Components

## Service Worker (`src/background/service-worker.js`) — 225 lines

Background script running as an ES module. Handles three responsibilities:

**Context menus**: On `onInstalled`, creates a "StickySites" parent menu item (shown on
text selection) with six children: Add to Global note, Site note, Page note, To-do list,
Outline, Daily note. On click, sends `STICKYSITES_CLIP` to the active tab.

**Keyboard commands**: Listens for the `toggle-cluster` command (`Alt+S`) and sends
`STICKYSITES_TOGGLE` to the active tab.

**Drive sync orchestration**: Watches `chrome.storage.local` for changes to any of the
six note keys. Debounces 30 seconds, then calls `doSync()`. Also handles
`STICKYSITES_SYNC_NOW`, `STICKYSITES_SYNC_SIGNIN`, and `STICKYSITES_SYNC_SIGNOUT` messages
from the popup/content scripts.

On install, calls `chrome.storage.session.setAccessLevel` to allow content scripts to
read `chrome.storage.session` (needed for session key caching).

**Dependencies**: `src/shared/drive-sync.js` (imported as ES module)

---

## `src/content/crypto-content.js` — 198 lines

Attaches `window.StickySites.Crypto`. Implements AES-256-GCM encryption and decryption
for note storage values. Mirrors the pure ES module in `src/shared/crypto.js` but also
includes higher-level helpers for enabling/disabling encryption and caching the derived key.

### Key methods

| Method | Purpose |
|--------|---------|
| `generateSalt()` | Returns 16 random bytes |
| `deriveKey(passphrase, salt)` | PBKDF2 (600 K iterations, SHA-256) → AES-GCM-256 CryptoKey |
| `encrypt(key, plaintext)` | Returns `{ iv: base64, data: base64 }` |
| `decrypt(key, envelope)` | Decrypts `{ iv, data }` → plaintext string |
| `isEncrypted(value)` | Detects `{ iv, data }` envelope shape |
| `isEnabled()` | Reads `stickysites_crypto_v1` from local storage |
| `enable(passphrase)` | Derives key, stores config, encrypts all existing notes |
| `unlock(passphrase)` | Derives key, verifies against stored verify blob, caches key |
| `disable()` | Decrypts all notes, removes crypto config and session key |
| `cacheKey(key)` / `getCachedKey()` | Stores/retrieves the CryptoKey as JWK in `chrome.storage.session` |
| `encryptValue(value)` / `decryptValue(value)` | Convenience wrappers for note read/write |

---

## `src/content/sync-content.js` — 30 lines

Attaches `window.StickySites.Sync`. Thin message-passing facade for Drive sync operations.
All actual sync logic lives in the service worker.

| Method | Purpose |
|--------|---------|
| `isSignedIn()` | Reads `signedIn` from sync meta in local storage |
| `getMeta()` | Returns full sync meta object |
| `requestSync()` | Sends `STICKYSITES_SYNC_NOW` to service worker |
| `signIn()` / `signOut()` | Sends sign-in/sign-out messages to service worker |

---

## `src/content/note-types.js` — 74 lines

Attaches `window.StickySites.noteTypes` — an array of 6 note type descriptor objects.
Each descriptor defines the type's identity, color, storage key, storage pattern, and
key/label/placeholder accessor functions.

| id | color | storageKey | storagePattern |
|----|-------|------------|----------------|
| `global` | amber | `stickysites_global_v1` | `single` |
| `site` | green | `stickysites_sites_v1` | `map` |
| `page` | blue | `stickysites_pages_v1` | `map` |
| `todo` | purple | `stickysites_todos_v1` | `structured` |
| `outline` | orange | `stickysites_outlines_v1` | `library` |
| `daily` | red | `stickysites_daily_v1` | `map` |

**storagePattern values**:
- `single` — storage value is one record (`{ body, updatedAt }`)
- `map` — storage value is a keyed object of records
- `structured` — storage value is a keyed object of item-list records

---

## `src/content/prefs.js` — 25 lines

Attaches `window.StickySites.Prefs`. Reads and writes `stickysites_prefs_v1` in local
storage. Default prefs: `{ clusterPosition: { x: null, y: null }, panelMode: 'fixed' }`.

| Method | Purpose |
|--------|---------|
| `read()` | Returns merged defaults + stored prefs |
| `write(updates)` | Merges updates into current prefs and saves |

---

## `src/content/cluster.js` — 130 lines

Attaches `window.StickySites.Cluster`. Manages the floating pill (`#stickysites-cluster`)
that contains one button per note type.

**Init**: Creates a `div#stickysites-cluster`, appends one `button` per note type, reads
saved cluster position from prefs, then starts the drag handler.

**Drag**: On `mousedown` of the cluster background, tracks mouse delta and updates
`left`/`top` CSS. On `mouseup`, persists the new position to prefs via `Prefs.write()`.
Drag is distinguished from click by a 3-pixel movement threshold.

**Active state**: `setActive(typeId)` adds/removes `is-active` on buttons. Clicking the
currently active button deactivates it and closes the panel.

**Toggle**: `toggle()` adds/removes `is-hidden` on the cluster element and closes the panel.

---

## `src/content/mentions.js`

Attaches `window.StickySites.Mentions`. Provides @-mention autocomplete for the rich text
editor. Typing `@` in a `contenteditable` note body opens a dropdown with categorized
mention items: Link (paste URL, current page URL), Date (today, tomorrow, this week, pick
date), Contact (name, email), and File (file reference). Selecting an item inserts formatted
text at the cursor position.

---

## `src/content/panel.js` — 793 lines

Attaches `window.StickySites.Panel`. The largest module. Manages the slide-in note panel
(`#stickysites-panel`).

**init(onClose)**: Creates the panel DOM and registers its close callback.

**open(noteType)**: Reads the note from storage (decrypting if needed), then renders the
appropriate editor for the note type:
- `global`, `site`, `page`: rich text editor (`contenteditable` div) with a toolbar
  (bold, italic, underline, ordered/unordered list, link insertion).
- `todo`: custom item-list renderer with checkboxes. Items can be added, toggled, and deleted.
- `outline`: global named library of outline documents; panel shows a doc switcher. Renderer backed by `outline.js` + `outline-ops.js`.

**Auto-save**: All editor changes debounce 500 ms then write back to `chrome.storage.local`,
encrypting if needed.

**syncFromStorage(changes)**: Called by `sticky-inject.js` when `chrome.storage.onChanged`
fires. Updates the open panel's content if the changed key matches the current note type
and the value has actually changed.

**close()**: Slides the panel out and clears its state.

---

## `src/content/sticky-inject.js` — 259 lines

The orchestrator content script. Runs as an async IIFE at `document_idle`. Exits early
if `#stickysites-cluster` already exists.

**Responsibilities**:
- Initializes `SS.Panel` and `SS.Cluster`, passing the `handleIconClick` callback.
- **Encryption gate**: Before opening any panel, checks whether encryption is enabled and
  whether the session key is cached. If locked, shows the `#stickysites-lock` overlay with
  a passphrase input instead of opening the panel.
- **Lock overlay**: DOM-built passphrase dialog. On successful unlock, proceeds to open the
  pending note type panel.
- **Toast notifications**: Lightweight `#stickysites-toast` element for clip confirmations.
- **Clip handler** (`clipToNote`): Receives `STICKYSITES_CLIP` messages, appends the
  selected text to the target note type (respecting encryption), and shows a toast.
- **Number badges** (`showBadges`): Shows 1–6 number badges on cluster icons for 3 seconds
  when the cluster becomes visible.
- **Chord hotkeys**: Digit keys `1`–`6` open the corresponding note type. Key `a` cycles
  through note types sequentially. Hotkeys are suppressed when focus is in an input field.
- **Message listener**: Handles `STICKYSITES_TOGGLE`, `STICKYSITES_OPEN`, `STICKYSITES_CLIP`.
- **Storage change listener**: Forwards `chrome.storage.onChanged` events to `SS.Panel.syncFromStorage`.

---

## `src/shared/notes-storage.js` — 304 lines

ES module exporting all Chrome Storage CRUD operations for every note type plus prefs.
Used by the service worker, popup, and unit tests.

### Exports

| Function | Signature | Returns |
|----------|-----------|---------|
| `getSiteKey` | `(url: string)` | `string` — hostname without `www.` |
| `getPageKey` | `(url: string)` | `string` — `origin + pathname` |
| `readGlobalNote` | `()` | `{ body, updatedAt }` |
| `writeGlobalNote` | `(body: string)` | `{ body, updatedAt }` |
| `readSiteNote` | `(key: string)` | `SiteNote \| null` |
| `writeSiteNote` | `(key, { siteLabel, body, tags })` | `SiteNote \| null` |
| `deleteSiteNote` | `(key: string)` | `void` |
| `readAllSiteNotes` | `()` | `SiteNote[]` |
| `readPageNote` | `(key: string)` | `PageNote \| null` |
| `writePageNote` | `(key, { pageLabel, body, tags })` | `PageNote \| null` |
| `deletePageNote` | `(key: string)` | `void` |
| `readAllPageNotes` | `()` | `PageNote[]` |
| `readTodo` | `()` | `TodoRecord \| null` |
| `writeTodo` | `({ items })` | `TodoRecord \| null` |
| `deleteTodo` | `()` | `void` |
| `readAllTodos` | `()` | `TodoRecord[]` |
| `readOutline` | `(outlineKey: string)` | `OutlineRecord \| null` |
| `writeOutline` | `(outlineKey, { name, items })` | `OutlineRecord \| null` |
| `deleteOutline` | `(outlineKey: string)` | `void` |
| `readAllOutlines` | `()` | `OutlineRecord[]` |
| `readPrefs` | `()` | `Prefs` |
| `writePrefs` | `(updates: Partial<Prefs>)` | `Prefs \| null` |
| `parseTags` | `(input: string)` | `string[]` — normalized, deduped, `#`-prefixed |
| `createDebouncedSaver` | `(fn, ms?)` | debounced function |

---

## `src/shared/crypto.js` — 71 lines

Pure ES module with the cryptographic primitives. Used directly by unit tests. The
content script counterpart (`crypto-content.js`) replicates these functions plus adds
higher-level enable/unlock/disable logic and session key caching.

### Exports

| Function | Purpose |
|----------|---------|
| `generateSalt()` | 16 random bytes (Uint8Array) |
| `deriveKey(passphrase, salt)` | PBKDF2 (600 K iterations) → AES-GCM-256 CryptoKey |
| `encrypt(key, plaintext)` | Returns `{ iv: base64, data: base64 }` |
| `decrypt(key, envelope)` | Returns plaintext string |
| `isEncrypted(value)` | Returns `true` if value is an `{ iv, data }` envelope |

---

## `src/shared/drive-sync.js` — 91 lines

ES module wrapping the Google Drive REST API (Drive v3, `appDataFolder` scope). Used
only by the service worker.

### Exports

| Export | Purpose |
|--------|---------|
| `getToken()` | Calls `chrome.identity.getAuthToken` (interactive) |
| `revokeToken()` | Removes cached auth token |
| `listFiles(token)` | Lists files in `appDataFolder` |
| `downloadFile(token, fileId)` | Downloads and JSON-parses a file |
| `createFile(token, name, content)` | Creates a new file in `appDataFolder` |
| `updateFile(token, fileId, content)` | Updates an existing file (media upload) |
| `getSyncMeta()` / `setSyncMeta(meta)` | Read/write `stickysites_sync_meta` |
| `NOTE_KEYS` | Array of the 6 note storage keys watched for sync |
| `SYNC_META_KEY` | The sync meta storage key string |

---

## Popup (`popup.html` / `popup.js` / `popup.css`) — 45 / 733 / 366 lines

A separate extension page (not injected into host pages). Opened via the toolbar icon
`default_popup`.

**All-notes view**: Shows every note across all 6 types in a unified list. Supports:
- Text search across note bodies
- Sort by updated date (newest/oldest) or by site key alphabetically
- Filter by note type
- Export all notes as JSON

**Settings panel**: Toggle encryption on/off (prompts for passphrase). Sign in / sign out
of Google Drive sync and trigger an immediate sync.

**Dependencies**: Communicates with the service worker via `chrome.runtime.sendMessage`
for sync operations. Reads notes directly from `chrome.storage.local`.
