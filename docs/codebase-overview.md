# Codebase overview

## Root

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome Extension MV3 manifest — permissions, content script load order, service worker, popup, commands, OAuth config |
| `package.json` | NPM config — Vitest dev dependency, test scripts |
| `popup.html` | Extension popup page shell — loaded when user clicks the toolbar icon |
| `popup.js` | Popup logic — all-notes view (search, sort, filter, export) + settings (encryption, Drive sync) |
| `popup.css` | Popup styles |
| `CLAUDE.md` | Claude Code project guide |
| `README.md` | User-facing project overview and install instructions |

## `src/background/`

| File | Lines | Purpose |
|------|-------|---------|
| `service-worker.js` | 225 | ES module. Context menus (6 note types), `toggle-cluster` command, Drive sync orchestration (auto-sync, sign-in/out, conflict resolution) |

## `src/content/`

Content scripts loaded in order by the manifest. Each attaches to `window.StickySites`
because MV3 content scripts cannot use ES module imports.

| File | Lines | Purpose |
|------|-------|---------|
| `crypto-content.js` | 198 | AES-256-GCM encrypt/decrypt, PBKDF2 key derivation, session key caching, enable/unlock/disable flows |
| `sync-content.js` | 30 | Thin facade for Drive sync message-passing to service worker |
| `note-types.js` | 94 | 6 note type descriptors: global, site, page, todo, outline, daily |
| `prefs.js` | 25 | Read/write cluster position and panel mode preferences |
| `cluster.js` | 130 | Floating pill UI — 6 icon buttons, drag-to-reposition, active state, toggle visibility |
| `mentions.js` | — | @-mention autocomplete: links, dates, contacts, files — dropdown triggered by `@` in the editor |
| `panel.js` | 793 | Moveable, resizable note panel — rich text editor (toolbar), todo renderer, outline renderer, auto-save, cross-tab sync |
| `sticky-inject.js` | 259 | Orchestrator — init, encryption gate, lock overlay, toast, clip handler, chord hotkeys (1–5, a), message listener |
| `sticky-inject.css` | 471 | All injected UI styles — cluster, panel, lock overlay, toast, dark theme, animations |

## `src/shared/`

ES modules used by the service worker, popup, and unit tests. Not loadable as content
scripts directly.

| File | Lines | Purpose |
|------|-------|---------|
| `notes-storage.js` | 304 | CRUD for all 6 note types + prefs: getSiteKey, getPageKey, read/write/delete/readAll for global/site/page/todo/outline/daily, parseTags, createDebouncedSaver |
| `crypto.js` | 71 | Pure crypto primitives: generateSalt, deriveKey (PBKDF2), encrypt, decrypt, isEncrypted |
| `drive-sync.js` | 91 | Google Drive API client: getToken, revokeToken, listFiles, downloadFile, createFile, updateFile, getSyncMeta, setSyncMeta |

## `tests/`

| File | Lines | Tests | Purpose |
|------|-------|-------|---------|
| `notes-storage.test.js` | 266 | 43 | Full CRUD coverage for all note types + prefs + parseTags/getSiteKey/getPageKey |
| `crypto.test.js` | 46 | 5 | generateSalt, deriveKey, encrypt/decrypt round-trip, wrong-key failure, isEncrypted |

## `icons/`

| File | Purpose |
|------|---------|
| `icon16.png` | Favicon-size extension icon |
| `icon48.png` | Toolbar and management page icon |
| `icon128.png` | Chrome Web Store and install dialog icon |

## `docs/`

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | System context, data flow, storage schema, content script load order, design decisions |
| `COMPONENTS.md` | Module-by-module reference — responsibilities, key functions, exports |
| `DEVELOPMENT.md` | Setup, commands, conventions, debugging, packaging |
| `INSTALLATION.md` | Install and uninstall instructions |
| `SECURITY.md` | Threat model, encryption details, permissions audit, data handling |
| `TESTING.md` | Test framework, test inventory, mocking strategy, coverage gaps |
| `known-issues.md` | Known bugs, limitations, and workarounds |
| `codebase-overview.md` | This file — file-by-file inventory with line counts |
