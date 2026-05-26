# Development

## Prerequisites

- Node.js 22+ (for running tests and icon generation)
- Chrome or Chromium browser (for loading the extension)
- No build step required — source files are loaded directly by Chrome

## Setup

```bash
git clone <repo-url> && cd stickysites
npm install          # installs vitest + canvas (dev dependencies only)
```

## Loading the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** and select this repo root
4. The StickySites notepad icon appears in the toolbar

After making code changes, click the reload icon on the extension card at
`chrome://extensions` to pick up changes. CSS changes in content scripts require
a full page reload on the target site.

**Important:** If you change `manifest.json` (e.g., adding a content script file
or permission), you must reload the extension AND close/reopen all tabs.

## Commands

| Command | What it does |
|---------|-------------|
| `npm test` | Run 42 unit tests once (vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `node scripts/generate-icons.js` | Regenerate toolbar icon PNGs |

## Project structure

```
src/
  background/
    service-worker.js       — Context menus, keyboard commands, Drive sync (225 lines)
  content/
    crypto-content.js       — AES-GCM encryption namespace (198 lines)
    sync-content.js         — Drive sync messaging namespace (30 lines)
    note-types.js           — Icon registry: 5 note types (74 lines)
    prefs.js                — Cluster position + panel mode (25 lines)
    cluster.js              — Floating draggable pill + badges (130 lines)
    panel.js                — Rich text editor, todo, outliner renderers (793 lines)
    sticky-inject.js        — Orchestrator: wiring, clip, chord keys, toast, lock (259 lines)
    sticky-inject.css       — All injected styles (471 lines)
  shared/
    notes-storage.js        — Chrome Storage CRUD for all types (304 lines)
    crypto.js               — AES-GCM (ES module for tests) (71 lines)
    drive-sync.js           — Google Drive API client (91 lines)
popup.html / popup.js / popup.css  — Browser action popup (all-notes view)
tests/                              — Vitest unit tests (42 tests)
scripts/                            — Icon generation
```

## Module system

Content scripts cannot use ES `import`. They share state via a namespace:

- `window.StickySites.Crypto` — encryption (loaded first)
- `window.StickySites.Sync` — sync messaging
- `window.StickySites.noteTypes` — icon registry array
- `window.StickySites.Prefs` — preferences read/write
- `window.StickySites.Cluster` — floating pill manager
- `window.StickySites.Panel` — workspace panel renderer

The `src/shared/` ES modules are used by the service worker (`import`) and
Vitest tests. `crypto-content.js` is the namespace duplicate of `crypto.js`.

## Conventions

- **No frameworks** — vanilla JS, vanilla CSS. No build, no transpile, no bundle.
- **Prefix everything** — DOM elements use `stickysites-` prefix.
- **Versioned storage keys** — all keys include `_v1`.
- **500ms debounce** — auto-save fires 500ms after the last keystroke.
- **Tailwind Slate palette** — color tokens follow Tailwind's Slate scale.
- **`var` in content scripts** — content scripts use `var` (not `let`/`const`)
  for consistency with the namespace IIFE pattern.

## Debugging

- **Content script**: DevTools on any page → Console. Look for `#stickysites-cluster`.
- **Service worker**: `chrome://extensions` → click "Service worker" link.
- **Popup**: Right-click the popup → Inspect.
- **Storage**: In any extension context console:
  ```js
  chrome.storage.local.get(null, console.log)     // all local data
  chrome.storage.session.get(null, console.log)    // session key (if encrypted)
  ```
- **Encrypted storage**: If encryption is enabled, storage values show `{iv, data}`
  instead of plaintext objects.

## Packaging for distribution

```bash
# Create a .zip for Chrome Web Store upload (exclude dev files)
zip -r stickysites.zip manifest.json icons/ src/ popup.* \
  -x "*.DS_Store" -x "node_modules/*" -x "tests/*" -x "scripts/*"
```

## Google Drive sync setup

To enable Drive sync, you need a Google Cloud OAuth client ID:

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable the **Google Drive API**
3. Create an OAuth 2.0 Client ID (type: Chrome Extension)
4. Enter your extension ID (from `chrome://extensions`)
5. Replace the placeholder in `manifest.json` → `oauth2.client_id`
6. Reload the extension
