# Development

## Prerequisites

- Node.js ≥ 22 (`.nvmrc`) for tests and tooling — the extension itself needs no Node
- Chrome or a Chromium-based browser (Edge, Brave, Arc, Chrome Beta)
- No build step: Chrome loads the repo root directly

## Setup

```bash
git clone https://github.com/mithudso/stickysites.git && cd stickysites
npm install          # vitest + canvas (dev dependencies only)
npm run lint && npm test
```

## Loading the extension

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the repo root
3. After code changes click ↻ on the StickySites card
4. If `manifest.json` changed (script, permission, command): reload the extension **and**
   close/reopen the tabs you test in — Chrome does not re-inject into existing tabs
5. CSS changes in `src/content/sticky-inject.css` need a page reload on the target site

Runbook with verification steps: `runbooks/load-and-reload-extension.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` | `node --check` every `.js`/`.mjs`; fails if `manifest.json` and `package.json` versions differ |
| `npm test` | 125 unit tests (vitest, node env, mocked `chrome`) |
| `npm run test:peer` | Two peer daemons on ephemeral ports (Python unittest, needs `openssl`) |
| `npm run test:watch` | Watch mode |
| `npx vitest run tests/<file>` | One test file |
| `npm run docs:check-indexes` | Validate `docs/high_signal_file_index.json` paths and `llms.txt` links; `-- --prune` drops dead entries |
| `npm run logs:rotate` | Archive old `memory.md` / `prompts.md` sections once past ~200 KB |
| `npm run icons` | Regenerate `icons/*.png` |
| `npm run verify:live` | Puppeteer end-to-end harness (`npm i --no-save puppeteer-core`; Chrome for Testing via `SS_CHROME`) |
| `npm run build:store` | Chrome Web Store zip in `dist/` (runtime files only) |
| `npm run store:screenshots` / `npm run store:promo` | Regenerate the store listing images |

CI runs lint → test → index check → manifest validation (`.github/workflows/ci.yml`).

## Project structure

See `codebase-overview.md` for every file. The short version:

```
src/background/service-worker.js   ES module: menus, Alt+S, popout, to-do sync
src/content/*.js                   10 classic scripts in manifest order → window.StickySites.*
src/content/sticky-inject.css      all injected styles
src/shared/*.js                    ES modules: todo-bridge, peer-sync (SW + tests), crypto, notes-storage (tests)
peer/                              local peer-sync daemon (Python) + its test + README
popup.* / popout.*                 extension pages
tests/                             vitest
scripts/                           lint, index check, log rotation, icons, live harness
docs/                              this documentation + runbooks + indexes
```

## Module system

Content scripts cannot `import`; each attaches to `window.StickySites`:

`Crypto` → `noteTypes` → `Prefs` → `Cluster` → `Todo` → `OutlineOps` → `Outline` → `Mentions`
→ `Panel` → orchestrator (`sticky-inject.js`). Adding a script means adding it to
`manifest.json` **after** its dependencies and to `popout.html` if the popout needs it.

`src/shared/` are ES modules: `todo-bridge.js` is imported by the service worker;
`crypto.js` (twin of `crypto-content.js`) and `notes-storage.js` (reference CRUD) are used by
tests. Keep the two crypto files in lock-step.

## Conventions

- **No frameworks, no build** — vanilla JS and CSS.
- **Prefix everything** injected with `stickysites-`; z-index near INT32_MAX.
- **Versioned storage keys** (`_v1`); adapt legacy shapes at read time, never bulk-migrate.
- **500 ms debounce** on auto-save; `flushPendingSave()` before close / switch / popout / re-key.
- **Snapshot the key at `open()`** — never re-derive `_activeKey` mid-session.
- **Locked vault ⇒ no plaintext writes.** Check `Crypto.getCachedKey()` before writing a note key.
- **Logging**: `console.warn('[stickysites] <subsystem>', {...})` on integration failure paths
  only; never note content or key material (`logging.md`).
- **Versions**: bump `manifest.json` and `package.json` together; log the change in
  `prompts.md` / `memory.md` (see `CLAUDE.md` → Workflow log rule).
- 2-space indent, LF, final newline (`.editorconfig`); content scripts use `var` inside the
  namespace IIFEs.

## Debugging

| Context | How |
|---|---|
| Content script | DevTools on the page → Console / Elements; look for `#stickysites-cluster`, `#stickysites-panel` |
| Service worker | `chrome://extensions` → StickySites → **Service worker**; `[stickysites]` warnings show sync/tab failures |
| Popup / popout | Right-click the page → Inspect |
| Storage | any extension console: `chrome.storage.local.get(null, console.log)` |
| Encryption state | `chrome.storage.local.get(['stickysites_crypto_v1','stickysites_cached_key'], console.log)` — a JWK under `stickysites_cached_key` means unlocked |
| To-do sync | `runbooks/todo-sync-troubleshooting.md` |
| Peer sync | popup → Settings → Local Peer Sync status; `python3 peer/stickysites-peer.py status`; `~/.stickysites/peer.log`; `runbooks/peer-sync.md` |

Encrypted storage values appear as `{ iv, data }` envelopes instead of records.

## Packaging

`runbooks/release-packaging.md` — version bump, tag, store zip, rollback.
