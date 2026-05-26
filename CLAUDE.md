# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Chrome Extension (Manifest V3), vanilla JavaScript, no build step.
Version: **1.8.0**

```
stickysites/
  manifest.json            # MV3 manifest — permissions, content scripts, SW, oauth2
  package.json             # Dev tooling only (vitest)
  popup.html               # Browser action popup
  popup.js                 # Popup: search, sort, filter, export, settings, Drive sync
  popup.css                # Popup styles
  vitest.config.js         # Vitest config (node environment)
  src/
    background/
      service-worker.js    # Context menus, commands, Drive sync orchestration (ES module)
    content/               # Loaded in order as classic scripts (no ES modules)
      crypto-content.js    # window.StickySites.Crypto — AES-GCM namespace (loaded first)
      sync-content.js      # window.StickySites.Sync — Drive sync namespace
      note-types.js        # window.StickySites.noteTypes — icon registry (6 types)
      prefs.js             # window.StickySites.Prefs — cluster position / panel mode
      cluster.js           # window.StickySites.Cluster — floating draggable pill + drag
      mentions.js          # window.StickySites.Mentions — @-mention autocomplete (links,
                           #   dates, contacts, files)
      panel.js             # window.StickySites.Panel — workspace panel, rich text editor,
                           #   todo list, outliner
      sticky-inject.js     # Orchestrator: wiring, clip handler, chord keys, toast
      sticky-inject.css    # All injected styles (z-index near INT32_MAX)
    shared/                # ES modules — used by service worker and vitest tests
      notes-storage.js     # Chrome Storage CRUD (all 6 note types + prefs)
      crypto.js            # AES-GCM primitives (ES module duplicate of crypto-content.js)
      drive-sync.js        # Google Drive API client (Drive appDataFolder)
  tests/
    crypto.test.js         # AES-GCM unit tests
    notes-storage.test.js  # Storage CRUD unit tests
  docs/                    # Architecture, testing, security, components docs
  icons/                   # Extension icons (16, 48, 128 px)
  scripts/
    generate-icons.js      # Icon generation utility
```

## Key facts

### Module system split
- **Content scripts** (`src/content/`) are loaded as classic scripts in the order listed in
  `manifest.json`. They cannot use ES module `import`. All logic is exposed on
  `window.StickySites.*` namespace.
- **Service worker** (`src/background/service-worker.js`) is declared `"type": "module"` and
  uses ES module imports from `src/shared/`.
- **Shared modules** (`src/shared/`) are ES modules for use by the service worker and vitest.
- `crypto-content.js` is the namespace-style duplicate of `crypto.js` — same algorithm,
  different packaging. Do not conflate them.
- Content script load order in `manifest.json` matters — e.g. `mentions.js` depends on
  namespace objects set up by earlier scripts.

### Note types (6)
| ID       | Color  | Label       | Storage key                  | Pattern    |
|----------|--------|-------------|------------------------------|------------|
| global   | yellow | Global note | `stickysites_global_v1`      | single     |
| site     | green  | Site note   | `stickysites_sites_v1`       | map        |
| page     | blue   | Page note   | `stickysites_pages_v1`       | map        |
| todo     | purple | To-do list  | `stickysites_todos_v1`       | structured |
| outline  | orange | Outliner    | `stickysites_outlines_v1`    | structured |
| daily    | red    | Daily note  | `stickysites_daily_v1`       | map        |

### Storage keys (8 primary)
```
stickysites_global_v1     # Single note record { body, updatedAt }
stickysites_sites_v1      # Map of hostname → { siteKey, siteLabel, body, tags, ... }
stickysites_pages_v1      # Map of origin+path → { pageKey, pageLabel, body, tags, ... }
stickysites_todos_v1      # Map of hostname → { siteKey, items: [...], ... }
stickysites_outlines_v1   # Map of hostname → { siteKey, items: [...], ... }
stickysites_daily_v1      # Map of YYYY-MM-DD → { body, updatedAt }
stickysites_prefs_v1      # { clusterPosition: {x, y}, panelMode: 'fixed' }
stickysites_crypto_v1     # { enabled, salt (base64), verify (AES envelope) }
```

Plus in `chrome.storage.local`:
```
stickysites_sync_meta     # { lastSync, signedIn, perKey: { [key]: { lastSyncedAt, driveFileId } } }
```

Plus in `chrome.storage.session` (cleared on browser close):
```
stickysites_session_key   # JWK export of the cached AES-GCM key
```

### Permissions
`storage`, `activeTab`, `contextMenus`, `identity`

### Encryption (opt-in, AES-256-GCM)
- Enabled from the popup Settings panel.
- On enable: generates a random 16-byte salt, derives an AES-GCM 256-bit key via PBKDF2
  (600,000 iterations, SHA-256), encrypts a verify string, then re-encrypts all 6 note keys.
- The derived key is exported as JWK and cached in `chrome.storage.session` for the browser
  session. Content scripts read it back via `StickySites.Crypto.getCachedKey()`.
- Encrypted values are stored as `{ iv: string, data: string }`. `isEncrypted()` detects this
  shape (must not have `body`, `items`, or `siteKey` keys).
- The lock overlay appears in-page if the cluster is opened while locked.

### Google Drive sync (OAuth)
- Uses `chrome.identity.getAuthToken` (OAuth2) with scope
  `https://www.googleapis.com/auth/drive.appdata`.
- The `oauth2.client_id` in `manifest.json` is a real registered client ID.
- Sync is triggered automatically 30 seconds after any note storage change (debounced).
- Manual sync, sign-in, and sign-out are triggered via `chrome.runtime.sendMessage` from the
  popup (`STICKYSITES_SYNC_NOW`, `STICKYSITES_SYNC_SIGNIN`, `STICKYSITES_SYNC_SIGNOUT`).
- Conflict resolution: newest `updatedAt` timestamp wins; the loser is saved as
  `stickysites_[key]_conflict_[timestamp]` in `chrome.storage.local`.

### Rich text editor (panel.js)
- Panel is moveable (drag header) and resizable (drag bottom-right handle), with
  expand/shrink toggle and popout button (placeholder).
- `contenteditable` div with a 19-tool formatting toolbar (2 rows).
- Row 1 (buttons): Bold, Italic, Underline, Strikethrough, H1, H2, H3, Unordered list,
  Ordered list, Checkbox, Align left, Align center, Align right, HR, Indent, Outdent.
- Row 2 (dropdowns + picker): Font family (5 options), Font size (4 sizes), Text color picker.
- Toolbar uses `document.execCommand`. Auto-save debounced at 500 ms.

### Context menus (right-click)
- On installed, creates a `StickySites` parent menu for `selection` contexts with 6 children:
  Add to Global / Site / Page / To-do / Outline / Daily.
- Clips selected text by sending `STICKYSITES_CLIP` to the active tab's content script.

### Chord hotkeys
- `Alt+S` (registered as a browser command in `manifest.json`) toggles the cluster
  visibility on the active tab.
- When the cluster is visible, number keys `1`–`5` open the first 5 note types (daily has
  no chord shortcut).
- `A` cycles through all 6 note types in order.
- Number badges appear on cluster icons for 3 seconds after the cluster becomes visible.
- Hotkeys are suppressed when focus is in an `input`, `textarea`, or `contenteditable`.

### Cluster (cluster.js)
- Floating draggable pill with one icon per note type, positioned from saved prefs.
- Drag-to-reorder: long-press an icon to rearrange within the cluster.
- Layout toggle: horizontal or vertical orientation, stored in prefs as `clusterLayout`.

### @-mention autocomplete (mentions.js)
- Typing `@` in the rich text editor triggers an autocomplete dropdown.
- Four categories: Link (paste URL, current page URL), Date (today, tomorrow, this week,
  pick date), Contact (name, email), File (file reference).
- Dropdown is positioned near the caret and filters as the user types.

### Popup
- Browser action popup (`popup.html` / `popup.js` / `popup.css`).
- Features: search bar, sort (Recent / Oldest / A–Z), type filter tabs, active tag filter,
  export button.
- Settings panel: toggle AES-256 encryption, Drive sign-in/sign-out, manual sync trigger.
- Passphrase lock screen shown if encryption is enabled and the session key is missing.

### Conventions
- Vanilla JS only — no frameworks, no transpilers, no bundlers.
- All DOM elements injected into host pages use `stickysites-` prefix for IDs and classes.
- z-index values are near INT32_MAX to overlay host-page content.
- Storage keys are versioned (`_v1` suffix) to allow future migrations.
- Debounce auto-save at 500 ms.
- Prefer `chrome.storage.local` over `chrome.storage.sync` (no size limits).

## Commands

```bash
npm test            # vitest run (unit tests, single pass)
npm run test:watch  # vitest (watch mode)
```

Tests run in node environment. They mock `chrome` APIs where needed.

## Loading the extension

1. `chrome://extensions` → Enable Developer mode
2. "Load unpacked" → select this repo root
3. After code changes, click the reload button on the extension card
4. For Drive sync: the OAuth client ID in `manifest.json` must be registered in Google Cloud
   Console with the extension's ID as an allowed origin.

## Message types

| Type                        | Direction              | Purpose                              |
|-----------------------------|------------------------|--------------------------------------|
| `STICKYSITES_TOGGLE`        | SW → content           | Toggle cluster visibility            |
| `STICKYSITES_OPEN`          | SW → content           | Open a specific note type            |
| `STICKYSITES_CLIP`          | SW → content           | Clip selected text into a note       |
| `STICKYSITES_SYNC_NOW`      | popup → SW             | Trigger immediate Drive sync         |
| `STICKYSITES_SYNC_SIGNIN`   | popup → SW             | Initiate Drive OAuth sign-in + sync  |
| `STICKYSITES_SYNC_SIGNOUT`  | popup → SW             | Revoke Drive OAuth token             |
