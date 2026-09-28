# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Semantic search first

Before grepping, query the machine-wide `global_ai_hub` MCP server (`hub_search_codebase`,
`hub_search_symbols`, `hub_ask`) — it indexes this repo. Config: `.mcp.json`. Fall back to
`grep`/`Read` when the server is unreachable. This repo ships no indexer of its own; see
`docs/MCP.md`.

## Repository shape

Chrome Extension (Manifest V3), vanilla JavaScript, no build step, single package.
Version: **1.11.1** (`manifest.json` is canonical; `package.json` must match — `npm run lint` checks).

```
stickysites/
  manifest.json            # MV3 manifest — permissions, content scripts (load order!), SW, command
  package.json             # Dev tooling only (vitest, canvas) + npm scripts
  vitest.config.mjs        # Vitest config (node environment, globals)
  popup.html / .js / .css  # Browser action popup: Quick-Open, search, sort, filter, export, settings
  popout.html / .js / .css # Standalone popout window: loads note type from URL params, Panel full-page
  src/
    background/
      service-worker.js    # ES module: context menus, Alt+S command, popout window, to-do sync
    content/               # Classic scripts, loaded in manifest order (no ES modules)
      crypto-content.js    # window.StickySites.Crypto — AES-GCM namespace (loaded first)
      note-types.js        # window.StickySites.noteTypes — 6 type descriptors, identity icons
      prefs.js             # window.StickySites.Prefs — read/write stickysites_prefs_v1
      cluster.js           # window.StickySites.Cluster — floating pill, drag, reorder, layout
      todo.js              # window.StickySites.Todo — item normalisation + drag controller
      outline-ops.js       # window.StickySites.OutlineOps — pure tree ops (unit-tested)
      outline.js           # window.StickySites.Outline — outliner UI, global doc library
      mentions.js          # window.StickySites.Mentions — @-mention autocomplete
      panel.js             # window.StickySites.Panel — panel, rich text, find/replace, to-do UI
      sticky-inject.js     # Orchestrator: wiring, lock overlay, clip, F-key shortcuts, SPA watch
      sticky-inject.css    # All injected styles (z-index near INT32_MAX)
    shared/                # ES modules — service worker + vitest
      todo-bridge.js       # Native-messaging to-do sync (used by the SW; unit-tested)
      crypto.js            # AES-GCM primitives (ES duplicate of crypto-content.js; tests)
      notes-storage.js     # Storage CRUD reference implementation (tests only today)
  tests/                   # 4 vitest files, 101 tests
  scripts/
    check-syntax.mjs       # npm run lint — node --check + manifest/package version agreement
    check-doc-indexes.mjs  # npm run docs:check-indexes — path-validates the retrieval indexes
    rotate-workflow-logs.mjs # npm run logs:rotate — memory.md/prompts.md → docs/archive/
    generate-icons.js      # npm run icons — regenerate icons/*.png (canvas)
    verify-live.mjs        # npm run verify:live — puppeteer harness (Chrome for Testing)
  docs/                    # Architecture, components, security, testing, runbooks, indexes
  icons/                   # 16 / 48 / 128 px
  llms*.txt                # LLM context suite (index, full, small, facts)
  .github/                 # ci.yml, dependabot, CODEOWNERS, templates, copilot-instructions.md
```

## Commands

```bash
npm install                 # dev deps only
npm run lint                # syntax gate for every .js/.mjs + version agreement (CI step 1)
npm test                    # vitest run — 101 tests, node env, chrome mocked (CI step 2)
npm run test:watch          # watch mode
npx vitest run tests/outline-ops.test.js   # one file
npm run docs:check-indexes  # docs/high_signal_file_index.json + llms.txt links resolve (CI step 3)
npm run docs:check-indexes -- --prune      # drop dead index entries
npm run logs:rotate         # rotate memory.md / prompts.md when > ~200 KB
npm run icons               # regenerate icons/
npm run verify:live         # needs: npm i --no-save puppeteer-core; Chrome for Testing (SS_CHROME)
```

Loading: `chrome://extensions` → Developer mode → Load unpacked → repo root → ↻ after changes.
Manifest changes also need every test tab closed and reopened. Runbook:
`docs/runbooks/load-and-reload-extension.md`.

## Runtime architecture

```
 host page tab ──────────────────────────────────┐
   content scripts (10, classic, window.StickySites.*)
   ├─ Cluster (floating pill)  ─ click ─▶ Panel.open(type)
   ├─ Panel (editor / to-do / outliner) ─ 500 ms debounce ─▶ chrome.storage.local
   └─ sticky-inject: lock overlay, clip, Ctrl/Cmd+F1..F6, SPA re-key,
        chrome.runtime.onMessage (TOGGLE / OPEN / CLIP), storage.onChanged → Panel.syncFromStorage
                     ▲ tabs.sendMessage                  │ runtime.sendMessage(POPOUT)
 service worker (ES module) ─────────────────────────────┘
   context menus (6 clips) · Alt+S command · windows.create(popout.html)
   to-do sync: alarms (2 min) + 3 s after todos change → sendNativeMessage(com.mitch.todo_bridge)
 popup.html (Quick-Open, search, settings)   popout.html (Panel full-window)
 chrome.storage.local: stickysites_*_v1 keys, stickysites_cached_key (JWK)
```

No network calls. The only out-of-browser boundary is the optional native-messaging host
(`docs/external-calls.md`).

### Module system split
- **Content scripts** (`src/content/`) are classic scripts in `manifest.json` order; they
  cannot `import`. All logic hangs off `window.StickySites.*`. `mentions.js` and `panel.js`
  depend on namespaces set up by earlier scripts. `popout.html` loads the same files with
  `<script>` tags (minus `cluster.js` and `sticky-inject.js`); `popup.html` loads only
  `crypto-content.js` + `popup.js`.
- **Service worker** is `"type": "module"` and imports `src/shared/todo-bridge.js`.
- **Shared modules** (`src/shared/`) are ES modules. `crypto-content.js` is the
  namespace-style duplicate of `crypto.js` — same algorithm, different packaging; change
  both together. `notes-storage.js` is a reference CRUD layer exercised by tests; the
  extension's runtime reads/writes storage directly in `panel.js`, `outline.js`,
  `sticky-inject.js`, `popup.js`.

### Canonical record schema
Map-pattern records (site/page/daily) store `key` + `label`. Readers must fall back to the
legacy field names (`siteKey`/`pageKey`/`dateKey`, `siteLabel`/`pageLabel`) written before
v1.10. Structured records (todo/outline) also store `key`.

### Note types (6)
| ID       | Color  | Label       | Storage key                  | Pattern    | Key |
|----------|--------|-------------|------------------------------|------------|-----|
| global   | yellow | Global note | `stickysites_global_v1`      | single     | `__global__` |
| site     | green  | Site note   | `stickysites_sites_v1`       | map        | hostname without `www.` |
| page     | blue   | Page note   | `stickysites_pages_v1`       | map        | origin + pathname |
| todo     | purple | To-do list  | `stickysites_todos_v1`       | structured | `__global__` |
| outline  | orange | Outliner    | `stickysites_outlines_v1`    | structured | `''` — panel resolves the doc |
| daily    | red    | Daily note  | `stickysites_daily_v1`       | map        | `YYYY-MM-DD` |

The outliner is a global library of named documents — not site-keyed. Its panel resolves the
active document itself (`activeOutlineId` pref); `getKey` returns `''`.

### Storage keys (all `chrome.storage.local`)
```
stickysites_global_v1     # { body, updatedAt }
stickysites_sites_v1      # hostname → { key, label, body, tags, createdAt, updatedAt }
stickysites_pages_v1      # origin+path → { key, label, body, tags, ... }
stickysites_todos_v1      # { __global__: { key, items, sections, tagColors, ... } }
stickysites_outlines_v1   # ol_<id> → { key, name, items, ... } (legacy hostname keys adapt at read)
stickysites_daily_v1      # YYYY-MM-DD → { key, body, ... }
stickysites_prefs_v1      # { clusterPosition, clusterLayout, iconOrder, enabledTypes,
                          #   panelSize, panelPosition, activeOutlineId, panelMode (unused) }
stickysites_crypto_v1     # { enabled, salt (base64), verify (AES envelope) }
stickysites_cached_key    # JWK of the derived AES-GCM key — persists until Lock Now
```
`chrome.storage.session` is **not** used (an earlier design cached the key there).

### Permissions
`storage`, `activeTab`, `contextMenus`, `alarms` (to-do sync period), `nativeMessaging`
(to-do sync host). No host permissions beyond the content-script match.

### Encryption (opt-in, AES-256-GCM)
- Enabled from the popup Settings panel.
- On enable: random 16-byte salt, PBKDF2 (600,000 iterations, SHA-256) → AES-GCM-256 key,
  encrypts a verify string, re-encrypts all 6 note keys.
- The key is exported as JWK into `stickysites_cached_key`. It persists until **Lock Now**
  in the popup or `StickySites.Crypto.clearCachedKey()`.
- Encrypted values are `{ iv: string, data: string }`. `isEncrypted()` requires that shape
  and the absence of `body`, `items`, `siteKey`.
- Locked-vault rule: never write plaintext to a note key while enabled and no cached key.
  The lock overlay appears in-page; the outliner shows a lock notice instead of auto-creating;
  the to-do sync skips encrypted data.

### Rich text editor (panel.js)
- Panel is moveable (drag header) and resizable from any edge or corner (8 grips;
  `_initResize` pins to absolute left/top on grab); expand/shrink toggle; popout button.
  Size and position persist in prefs (`panelSize`, `panelPosition`).
- `contenteditable` with a 19-tool toolbar in 2 rows. Row 1: Bold, Italic, Underline,
  Strikethrough, H1, H2, H3, UL, OL, Checkbox, Align L/C/R, HR, Indent, Outdent. Row 2:
  font family (5), font size (4), color picker. Uses `document.execCommand`. Auto-save 500 ms.
- **Find & Replace**: `Cmd/Ctrl+F` / `Cmd/Ctrl+H`; ↑/↓, counter, Replace, Replace All;
  `<mark>` highlights stripped before save via `getCleanHtml()`.
- The panel snapshots `_activeKey`/`_activeLabel` at `open()`; every read/write uses the
  snapshot, so a save can never land under another page's key after SPA navigation.
  `flushPendingSave()` commits a pending edit (popout, close, note switch, SPA re-key).
- `syncFromStorage` guards: self-echo (skips the body this panel just wrote), focus (never
  rewrites while focused — re-checked after async decryption), encryption (decrypts the
  envelope, skips while locked/undecryptable). Rich-text types only.

### To-do list (panel.js + todo.js)
- Items: `{ id, text, done, indent 0–3, priority 0–5, color, tags, note, section, completedAt }`;
  sections, tag colors; grip drag-reorder (`Todo.DragController`).
- Keys: Enter new item, Tab/Shift+Tab indent, Backspace on empty deletes, Esc blurs.
- Opening auto-focuses the first empty task input (creates one if none).
- `_writeStructured` keeps items another writer (the TODO.md sync) added while the panel
  was open, via `_loadedIds`.

### To-do sync with TODO.md (service-worker.js + shared/todo-bridge.js)
- `chrome.runtime.sendNativeMessage('com.mitch.todo_bridge', { cmd: 'sync', ext, items, sections })`.
  The host (`~/.claude/skills/todo/scripts/todo_host`, installed by
  `python3 ~/.claude/skills/todo/scripts/todo.py install-native-host`) owns the three-way merge.
- Triggers: `onStartup`, `onInstalled`, alarm `stickysites-todo-sync` every 2 min, 3 s after
  `stickysites_todos_v1` changes. `todoSyncRunning` guards re-entrancy.
- `applyHostResult` keeps StickySites-only fields, maps section names ↔ ids, prunes empty
  host-origin sections, and compares canonical JSON so unchanged syncs never write.
- Skipped when the todos value is an encrypted envelope. Host missing → warning, list stays local.

### Popout window
- ⧉ button or dragging the panel header until the cursor leaves the viewport
  (`mouseout` with `relatedTarget === null`; `.stickysites-panel--will-popout` hint within
  28 px of an edge; disabled inside `chrome-extension:` pages).
- Both route through `Panel._popoutActiveNote()` → flush save → `STICKYSITES_POPOUT` → SW
  `chrome.windows.create` (1400×1100) with `popout.html?type=&key=&label=`.
- `popout.js` overrides `getKey()`/`getLabel()` on a cloned note type, then `Panel.open()`.

### Context menus
`StickySites` parent (selection context) with 6 children: Add to Global / Site / Page /
To-do / Outline / Daily → `STICKYSITES_CLIP` to the active tab.

### Keyboard
- `Alt+S` (browser command in `manifest.json`) toggles the cluster.
- `Ctrl/Cmd+F1…F6` → Global, Site, Page, Todo, Outline, Daily. Toggle semantics
  (closed → open; same open → close; different → switch). Fire regardless of cluster
  visibility or focus; respect `enabledTypes`; route through the lock check.
- **No bare-key hotkeys.** An earlier `1`–`5`/`A` scheme (with 3-second number badges)
  hijacked ordinary typing and broke `Cmd+A`; it was removed entirely.

### Cluster (cluster.js)
Floating draggable pill, one icon per enabled type, position/layout/order from prefs.
Long-press (400 ms) to reorder. Icons are identity-bearing: 🌐 (global), first 4 chars of
the domain (site), trailing path segment (page), day of month (daily); full value in the
tooltip; refreshed on SPA navigation via `Cluster.refreshIcons()`.

### Outliner (outline.js + outline-ops.js)
Global library of named docs (switcher in the header; New/Rename/Duplicate/Delete in ⋯).
Keys: Enter, Tab/Shift+Tab, Alt+↑/↓, ↑/↓, Backspace-on-empty, Ctrl/Cmd+Enter (done), Esc.
Bullet click zooms (breadcrumb back); chevron collapses; per-node notes; checkboxes;
grip drag; `#tag` chips; filter (matches + ancestors); Export Markdown/OPML; Auto-group
with 10 s Undo. `outline-ops.js` holds the pure tree ops (vitest with a stubbed `window`).

### @-mentions (mentions.js)
`@` in the editor opens a dropdown: Link, Date, Contact, File; filters as you type; inserts a
`.stickysites-mention-chip`.

### Popup
Quick-Open row (6 buttons, respects `enabledTypes`; falls back to a popout on `chrome://`),
search, sort (Recent / Oldest / A–Z), type tabs, tag filter, Markdown export, Settings
(encryption Enable / Disable / Lock Now, note-type visibility, cluster layout), lock screen.
Writes prefs directly with `chrome.storage.local` (it does not load `prefs.js`).

### SPA navigation
`sticky-inject.js` watches `popstate`/`hashchange` + a 1 s `href` poll; on change it refreshes
cluster icons and re-opens an open site/page note under the new key (flushing first).

## Conventions
- Vanilla JS only — no frameworks, transpilers, bundlers, or runtime npm deps.
- New content script → add to `manifest.json` **after** its dependencies, and to `popout.html`
  if the popout needs it.
- All injected DOM uses the `stickysites-` prefix; z-index near INT32_MAX.
- Storage keys versioned (`_v1`); adapt legacy shapes at read time, never bulk-migrate.
- Debounce auto-save at 500 ms; flush before close / switch / popout / re-key.
- `chrome.storage.local` only (no size limit); never `chrome.storage.sync`.
- Logging: `console.warn('[stickysites] <subsystem>', {...})` on integration failure paths
  only; never log note content or key material (`docs/logging.md`).
- 2-space indent, LF (`.editorconfig`); content scripts use `var` in the namespace IIFEs.

## Message types
| Type                  | Direction                | Purpose |
|-----------------------|--------------------------|---------|
| `STICKYSITES_TOGGLE`  | SW / popup → content     | Toggle cluster visibility |
| `STICKYSITES_OPEN`    | popup → content          | Open a note type (`noteTypeId`, optional `key` for an outline doc) |
| `STICKYSITES_CLIP`    | SW → content             | Clip selected text into a note |
| `STICKYSITES_POPOUT`  | content / popup → SW     | Open note in a standalone window |
| native `{cmd:'sync'}` | SW → `com.mitch.todo_bridge` | Two-way to-do sync (`docs/external-calls.md`) |

## MCP servers
None shipped. `global_ai_hub` (`.mcp.json`) is the developer's local semantic index over this
repo — use it for "where is X" before grepping. Details: `docs/MCP.md`.

## Workflow log rule
On every change in this repo:
1. Append the request to `prompts.md`: `## Prompt vN - <ISO timestamp>` / `- User request:` / `  - <text>`.
2. Update `memory.md` (newest section first): active task, completed, in progress, next steps,
   files changed.
3. Bump the patch version in **both** `manifest.json` and `package.json` (`npm run lint` fails on drift).
4. Run `npm run logs:rotate` if either log passes ~200 KB.
