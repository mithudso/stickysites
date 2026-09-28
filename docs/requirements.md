# Requirements

## Functional

### Note types
- **Global** — one note on every site
- **Site** — one per hostname (www-stripped)
- **Page** — one per origin + pathname (query/hash excluded)
- **To-do** — one global list: nested items (indent 0–3), sections, priority 0–5, colors,
  tags, per-item notes, completion timestamps, drag-reorder; optional two-way sync with a
  local `TODO.md` via native messaging
- **Outliner** — global library of named documents: indent/outdent, move, collapse, zoom,
  per-node notes, done state, `#tag` chips, filter, auto-group with undo, Markdown/OPML export
- **Daily** — one per `YYYY-MM-DD`

### Editor
- Rich text via `contenteditable` with a 19-tool toolbar (two rows)
- Find & Replace (`Cmd/Ctrl+F` / `Cmd/Ctrl+H`), match counter, Replace All
- `@` mention autocomplete (link, date, contact, file); inline `#tags`
- Auto-save debounced at 500 ms; live cross-tab sync without clobbering a focused editor

### Navigation and shell
- Floating cluster pill with identity-bearing icons; drag to position; long-press to reorder;
  horizontal/vertical layout; per-type visibility
- `Alt+S` toggles the cluster; `Ctrl/Cmd+F1…F6` toggle the six note types; no bare-key hotkeys
- Context menu: clip selected text into any note type
- Panel: move by header, resize from any edge/corner, expand/shrink, pop out to its own window
  (button or drag off the page); size/position persisted
- SPA-aware: icons and open site/page notes re-key on URL change

### Popup
- Quick-Open row; search; sort Recent / Oldest / A–Z; type and tag filters; Markdown export
- Settings: encryption Enable / Disable / Lock Now, note-type visibility, cluster layout
- Lock screen when the vault is locked

### Encryption
- Opt-in AES-256-GCM; PBKDF2 (600,000 iterations, SHA-256, 16-byte salt)
- Derived key cached as JWK in `chrome.storage.local` until Lock Now
- Lock overlay in-page; no plaintext writes while locked; to-do sync skipped while encrypted

## Non-functional

- Vanilla JavaScript/CSS; no frameworks, transpilers, bundlers, or runtime npm dependencies
- Chrome Manifest V3; content scripts as classic scripts on `window.StickySites.*`; module
  service worker
- All injected DOM prefixed `stickysites-`; z-index near INT32_MAX
- Storage keys versioned `_v1`; legacy shapes adapted at read time
- Data never leaves the device except the optional local to-do host
- Unit tests for every shared/pure module; CI: lint, test, index check, manifest validation
- 2-space indent, LF line endings

## Dependencies

**Runtime**: none.

| Dev package | Purpose |
|---|---|
| vitest 5.x | Unit test runner (node environment) |
| canvas 3.x | `npm run icons` |
| puppeteer-core (not in `package.json`; `npm i --no-save`) | `npm run verify:live` |

**External (optional)**: Python 3 + `~/.claude/skills/todo/` for the native-messaging host.

## Browser requirements

- Chrome 116+ (MV3 module service worker, `chrome.alarms`, `chrome.runtime.sendNativeMessage`)
- Chromium-based browsers with MV3 support; native host manifest is per-browser

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Notes, prefs, crypto config, cached key |
| `activeTab` | Message the active tab from the SW and popup |
| `contextMenus` | Clip submenu |
| `alarms` | 2-minute to-do sync schedule |
| `nativeMessaging` | To-do sync host |
