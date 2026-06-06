# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository shape

Chrome Extension (Manifest V3), vanilla JavaScript, no build step.
Version: **1.10.0**

```
stickysites/
  manifest.json            # MV3 manifest — permissions, content scripts, SW
  package.json             # Dev tooling only (vitest)
  popup.html               # Browser action popup
  popup.js                 # Popup: search, sort, filter, export, settings
  popup.css                # Popup styles
  popout.html              # Standalone popout editor window
  popout.js                # Popout: loads note type from URL params, opens Panel full-page
  popout.css               # Popout overrides (panel fills window, hides expand/popout btns)
  vitest.config.js         # Vitest config (node environment)
  src/
    background/
      service-worker.js    # Context menus, commands, popout window (ES module)
    content/               # Loaded in order as classic scripts (no ES modules)
      crypto-content.js    # window.StickySites.Crypto — AES-GCM namespace (loaded first)
      note-types.js        # window.StickySites.noteTypes — icon registry (6 types)
      prefs.js             # window.StickySites.Prefs — cluster position / panel mode
      cluster.js           # window.StickySites.Cluster — floating draggable pill + drag
      todo.js              # window.StickySites.Todo — to-do list renderer
      outline-ops.js       # window.StickySites.OutlineOps — pure outline tree ops (unit-tested)
      outline.js           # window.StickySites.Outline — outliner UI (global named library)
      mentions.js          # window.StickySites.Mentions — @-mention autocomplete (links,
                           #   dates, contacts, files)
      panel.js             # window.StickySites.Panel — workspace panel, rich text editor,
                           #   todo list, outliner
      sticky-inject.js     # Orchestrator: wiring, clip handler, chord keys, toast
      sticky-inject.css    # All injected styles (z-index near INT32_MAX)
    shared/                # ES modules — used by service worker and vitest tests
      notes-storage.js     # Chrome Storage CRUD (all 6 note types + prefs)
      crypto.js            # AES-GCM primitives (ES module duplicate of crypto-content.js)
  tests/
    crypto.test.js         # AES-GCM unit tests
    notes-storage.test.js  # Storage CRUD unit tests
    outline-ops.test.js    # Outline tree-op unit tests
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

### Canonical record schema

Map-pattern records (site/page/daily) store `key` + `label`. Readers must fall back to the legacy field names (`siteKey`/`pageKey`/`dateKey`, `siteLabel`/`pageLabel`) written before v1.10. Structured records (todo/outline) also store `key`.

### Note types (6)
| ID       | Color  | Label       | Storage key                  | Pattern    |
|----------|--------|-------------|------------------------------|------------|
| global   | yellow | Global note | `stickysites_global_v1`      | single     |
| site     | green  | Site note   | `stickysites_sites_v1`       | map        |
| page     | blue   | Page note   | `stickysites_pages_v1`       | map        |
| todo     | purple | To-do list  | `stickysites_todos_v1`       | structured |
| outline  | orange | Outliner    | `stickysites_outlines_v1`    | structured |
| daily    | red    | Daily note  | `stickysites_daily_v1`       | map        |

The outliner is a global library of named documents — not site-keyed. Its panel resolves the active document itself (`activeOutlineId` pref); `getKey` returns `''`.

### Storage keys (8 primary)
```
stickysites_global_v1     # Single note record { body, updatedAt }
stickysites_sites_v1      # Map of hostname → { key, label, body, tags, ... }
stickysites_pages_v1      # Map of origin+path → { key, label, body, tags, ... }
stickysites_todos_v1      # Global todo: { __global__: { key, items: [...], ... } }
stickysites_outlines_v1   # Map of outlineKey → { key, name, items, ... } — named outline docs (ol_<id> keys; legacy hostname keys adapt at read time)
stickysites_daily_v1      # Map of YYYY-MM-DD → { key, body, ... }
stickysites_prefs_v1      # { clusterPosition, panelMode, clusterLayout, iconOrder, enabledTypes, panelSize, panelPosition, activeOutlineId }
stickysites_crypto_v1     # { enabled, salt (base64), verify (AES envelope) }
```

Also in `chrome.storage.local`:
```
stickysites_cached_key    # JWK export of the cached AES-GCM key (persists until manually locked)
```

### Permissions
`storage`, `activeTab`, `contextMenus`

### Encryption (opt-in, AES-256-GCM)
- Enabled from the popup Settings panel.
- On enable: generates a random 16-byte salt, derives an AES-GCM 256-bit key via PBKDF2
  (600,000 iterations, SHA-256), encrypts a verify string, then re-encrypts all 6 note keys.
- The derived key is exported as JWK and cached in `chrome.storage.local` as
  `stickysites_cached_key`. It persists until manually locked via the popup "Lock Now"
  button or by calling `StickySites.Crypto.clearCachedKey()`.
- Encrypted values are stored as `{ iv: string, data: string }`. `isEncrypted()` detects this
  shape (must not have `body`, `items`, or `siteKey` keys).
- The lock overlay appears in-page if the cluster is opened while locked.

### Rich text editor (panel.js)
- Panel is moveable (drag header) and resizable (drag bottom-right handle), with
  expand/shrink toggle and popout button.
- `contenteditable` div with a 19-tool formatting toolbar (2 rows).
- Row 1 (buttons): Bold, Italic, Underline, Strikethrough, H1, H2, H3, Unordered list,
  Ordered list, Checkbox, Align left, Align center, Align right, HR, Indent, Outdent.
- Row 2 (dropdowns + picker): Font family (5 options), Font size (4 sizes), Text color picker.
- Toolbar uses `document.execCommand`. Auto-save debounced at 500 ms.
- **Find & Replace**: "🔍 Find" button in actions bar (or `Cmd/Ctrl+F`/`Cmd/Ctrl+H`).
  Search bar with ↑/↓ navigation, match counter, Replace, and Replace All. Matches
  highlighted as `<mark>` elements; highlights stripped before saving via `getCleanHtml()`.
- The panel snapshots `_activeKey`/`_activeLabel` at `open()`; every read/write uses the snapshot, so a save can never land under a different page's key after an SPA navigation. `flushPendingSave()` commits a pending debounced edit (popout, panel close, note switch, SPA re-key).
- `syncFromStorage` guards against clobbering the editor: self-echo (skips the body this panel just wrote), focus (never rewrites while the editor is focused — re-checked after async decryption), encryption (decrypts the envelope, skips while locked or undecryptable).

### Popout window
- The ⧉ button in the panel header opens the current note in its own browser window.
- **Drag-out-to-popout**: dragging the panel by its header until the cursor leaves the
  browser viewport also pops the note out. Detected in `_initDrag` via a `mouseout` whose
  `relatedTarget === null` (pointer left the window). A dashed-outline hint with the label
  "Drag off the page to pop out" (`.stickysites-panel--will-popout`) appears once the cursor
  is within 28 px of any edge. Disabled inside the popout window itself
  (`location.protocol === 'chrome-extension:'`).
- Both the ⧉ button and drag-out route through `Panel._popoutActiveNote()`, which first
  flushes the debounced save (`Panel._flushSave`, set by the rich-text renderer and cleared
  on every `open()`/`close()`) so the popout reads the latest content from storage.
- Content script sends `STICKYSITES_POPOUT` message to the service worker.
- Service worker calls `chrome.windows.create()` (1400×1100) with
  `popout.html?type=...&key=...&label=...`.
- `popout.html` loads the same namespace scripts (crypto, note-types, prefs, todo, outline-ops, outline, mentions,
  panel) and `popout.js` overrides `getKey()`/`getLabel()` on the note type before calling
  `Panel.open()`. CSS overrides make the panel fill the window.

### Context menus (right-click)
- On installed, creates a `StickySites` parent menu for `selection` contexts with 6 children:
  Add to Global / Site / Page / To-do / Outline / Daily.
- Clips selected text by sending `STICKYSITES_CLIP` to the active tab's content script.

### Chord hotkeys
- `Alt+S` (registered as a browser command in `manifest.json`) toggles the cluster
  visibility on the active tab.
- When the cluster is visible, number keys `1`–`5` open the first 5 note types in the VISIBLE cluster order (reorder/hide aware — matches the number badges).
- `A` cycles through all 6 note types in the visible cluster order.
- Number badges appear on cluster icons for 3 seconds after the cluster becomes visible.
- Number/`A` hotkeys are suppressed when focus is in an `input`, `textarea`, or
  `contenteditable`.
- All chord key actions route through the lock check (shows the lock overlay if encryption is enabled and no session key is cached).

### Function-key shortcuts (Ctrl/Cmd + F1–F6)
- `Ctrl+F1` → Global, `Ctrl+F2` → Site, `Ctrl+F3` → Page, `Ctrl+F4` → Todo,
  `Ctrl+F5` → Outline, `Ctrl+F6` → Daily. `metaKey` works too on macOS.
- Toggle semantics: closed → open; same type open → close; different type open → switch.
- Unlike the number-chord hotkeys, these fire **regardless of cluster visibility or input
  focus** — they're dedicated function keys, so the user always wants them to work.
- Respect the `enabledTypes` pref (hidden note types are no-ops).

### Cluster (cluster.js)
- Floating draggable pill with one icon per note type, positioned from saved prefs.
- Drag-to-reorder: long-press an icon to rearrange within the cluster.
- Layout toggle: horizontal or vertical orientation, stored in prefs as `clusterLayout`.
- Icons are identity-bearing: 🌐 (global), domain fragment ≤4 chars (site), trailing path segment (page), day-of-month (daily) — full value in the tooltip; refreshed on SPA navigation via `Cluster.refreshIcons()`.

### @-mention autocomplete (mentions.js)
- Typing `@` in the rich text editor triggers an autocomplete dropdown.
- Four categories: Link (paste URL, current page URL), Date (today, tomorrow, this week,
  pick date), Contact (name, email), File (file reference).
- Dropdown is positioned near the caret and filters as the user types.

### Popup
- Browser action popup (`popup.html` / `popup.js` / `popup.css`).
- Features: **Quick-Open row** (6 colored buttons, one per note type — opens the matching
  note in the active tab's panel, falling back to a popout window on chrome:// pages),
  search bar, sort (Recent / Oldest / A–Z), type filter tabs, active tag filter, export
  button.
- Quick-Open buttons respect the same `enabledTypes` pref used to filter the cluster.
- Settings panel: toggle AES-256 encryption, note-type visibility, cluster layout.
- Passphrase lock screen shown if encryption is enabled and the session key is missing.

### To-do auto-focus
- When the to-do panel opens (in-page or popout), it auto-focuses the first empty task
  input — or creates a new one if none exists — so the user can immediately start typing.

### Outliner (outline.js + outline-ops.js)
- Global library of named outline documents (switcher in the panel header; New/Rename/Duplicate/Delete in the ⋯ menu).
- Keyboard: Enter (sibling below), Tab/Shift+Tab (indent/outdent), Alt+↑/↓ (move with subtree), ↑/↓ (traverse), Backspace on empty (delete, promote children), Ctrl/Cmd+Enter (toggle done).
- Bullet click zooms (breadcrumb to zoom out); chevron collapses; Collapse/Expand All in the toolbar.
- Per-node notes (📝), checkboxes with strikethrough, drag-to-reorder by the ⠇ grip, `#tags` auto-chip from text, filter box (matches + ancestors), Export Markdown/OPML, heuristic Auto-group with Undo.
- Locked-vault safe: the renderer shows a lock notice instead of auto-creating, and writes are refused while locked.
- `outline-ops.js` holds the pure tree operations; vitest imports it with a stubbed `window` (tests/outline-ops.test.js).

### SPA navigation
- `sticky-inject.js` watches `popstate`/`hashchange` + a 1 s `href` poll; on URL change it refreshes cluster icons and re-opens an open site/page note under the new URL's key (flushing the pending save under the old key first).

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

## Message types

| Type                        | Direction              | Purpose                              |
|-----------------------------|------------------------|--------------------------------------|
| `STICKYSITES_TOGGLE`        | SW → content           | Toggle cluster visibility            |
| `STICKYSITES_OPEN`          | SW → content           | Open a specific note type (optional `key` targets an outline doc) |
| `STICKYSITES_CLIP`          | SW → content           | Clip selected text into a note       |
| `STICKYSITES_POPOUT`        | content → SW           | Open note in standalone popout window|
