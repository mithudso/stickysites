# Requirements

## Functional Requirements

### Note Types
- **Global note** — single note visible on all websites
- **Site note** — one note per domain (hostname, www-stripped)
- **Page note** — one note per origin+pathname (query/hash excluded)
- **To-do list** — per-site checklist with add/delete/reorder
- **Outliner** — global library of named outline documents with indent/outdent/collapse, zoom/hoist, keyboard navigation, and export
- **Daily note** — one note per calendar date (YYYY-MM-DD key)

### Editor
- Rich text via `contenteditable` with 19-tool formatting toolbar
- Auto-save debounced at 500 ms
- @-mention autocomplete triggered by `@` (links, dates, contacts, files)
- Tag input per note (comma/space separated, auto-prefixed with `#`)
- Copy-to-clipboard action

### Navigation
- Floating cluster pill with one icon per note type
- Drag-to-reorder icons (long-press 400 ms)
- Horizontal/vertical layout toggle (stored in prefs)
- Chord hotkeys: Alt+S toggle, 1-5 open by index, A cycles all types
- Context menus: right-click selected text to clip into any note type

### Panel
- Moveable (drag header), resizable (drag bottom-right handle)
- Expand/shrink toggle, popout button (placeholder)
- Position and size persisted to prefs, clamped to viewport on restore

### Popup Dashboard
- Search across all note types
- Sort by recent, oldest, or alphabetical
- Filter by note type tabs and active tags
- Export all notes as markdown
- Settings: encryption toggle, Drive sign-in/sign-out, manual sync

### Encryption
- Opt-in AES-256-GCM at rest via Web Crypto API
- PBKDF2 key derivation: 600,000 iterations, SHA-256
- Session key cached in `chrome.storage.session` (cleared on browser close)
- Lock overlay with passphrase input when session key is missing

### Google Drive Sync
- OAuth2 via `chrome.identity.getAuthToken`, scope: `drive.appdata`
- Auto-sync 30 seconds after storage changes (debounced)
- Conflict resolution: newest `updatedAt` wins, loser saved as conflict copy

## Non-Functional Requirements

- Vanilla JavaScript only — no frameworks, transpilers, or bundlers
- Chrome Manifest V3 compliant
- Content scripts use `window.StickySites.*` namespace (no ES modules)
- Service worker uses ES module imports from `src/shared/`
- All injected DOM uses `stickysites-` prefix for IDs and classes
- z-index values near INT32_MAX to overlay host-page content
- Storage keys versioned with `_v1` suffix for future migrations
- 2-space indentation, LF line endings

## Dependencies

### Runtime
None — the extension has zero runtime dependencies.

### Development
| Package | Purpose |
|---------|---------|
| vitest 4.x | Unit test runner (node environment) |
| canvas 3.x | Icon generation script (macOS emoji rendering fallback) |

## Browser Requirements

- Chrome 116+ (MV3 service worker module support)
- Chromium-based browsers with MV3 support (Edge, Brave, etc.)

## Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Read/write notes, prefs, crypto config, sync metadata |
| `activeTab` | Access the active tab for content script messaging |
| `contextMenus` | Right-click "Add to..." menus for text clipping |
| `identity` | OAuth2 token for Google Drive sync |
