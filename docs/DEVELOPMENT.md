# Development

## Prerequisites

- A Node.js version matching `.nvmrc` and `package.json` engines for tests and tooling — the extension itself needs no Node
- Chrome or a Chromium-based browser (Edge, Brave, Arc, Chrome Beta)
- No build step: Chrome loads the repo root directly

## Setup

```bash
git clone https://github.com/mithudso/stickysites.git && cd stickysites
npm ci               # locked development dependencies
npm run lint && npm test
```

## Loading the extension

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select the repo root
3. For an explicitly requested live smoke, click ↻ on the StickySites card
4. If `manifest.json` changed (script, permission, command): reload the extension **and**
   close/reopen the tabs you test in — Chrome does not re-inject into existing tabs
5. CSS changes in `src/content/sticky-inject.css` need a page reload on the target site

Runbook with verification steps: `runbooks/load-and-reload-extension.md`.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` | Syntax checks, ESLint, and manifest/package version agreement |
| `npm test` | Vitest pure modules and actual-script runtime regressions with jsdom |
| `npm run test:peer` | Two peer daemons on ephemeral ports (Python unittest, needs `openssl`) |
| `npm run test:watch` | Watch mode |
| `npx vitest run tests/<file>` | One test file |
| `npm run docs:generate` | Regenerate public retrieval docs from tracked sources; private workflow/config bodies stay excluded |
| `npm run docs:check-generated` | Fail if generated docs differ from current sources |
| `npm run docs:check-indexes` | Validate `docs/high_signal_file_index.json` paths and `llms.txt` links; `-- --prune` drops dead entries |
| `npm run logs:rotate` | Archive old `memory.md` / `prompts.md` sections once past ~200 KB |
| `npm run icons` | Regenerate `icons/*.png` |
| `npm run verify:live` | Puppeteer end-to-end harness (`npm i --no-save puppeteer-core`; Chrome for Testing via `SS_CHROME`) |
| `npm run build:store` | Chrome Web Store zip in `dist/` (runtime files only) |
| `npm run store:screenshots` / `npm run store:promo` | Regenerate the store listing images |

CI runs the configured syntax/ESLint, Vitest, synthetic peer, documentation, package, and
manifest checks (`.github/workflows/ci.yml`). Do not activate the live browser, native host,
or installed daemon during automated maintenance.

## Project structure

See `codebase-overview.md` for every file. The short version:

```
src/background/service-worker.js   ES module: menus, Alt+S, popout, to-do sync
src/content/*.js                   classic scripts in manifest order → window.StickySites.*
src/content/sticky-inject.css      all injected styles
src/shared/*.js                    writer/sync/crypto ES modules; portable classic settings/network helpers
peer/                              local peer-sync daemon (Python) + its test + README
popup.* / popout.*                 extension pages
tests/                             vitest
scripts/                           lint, index check, log rotation, icons, live harness
docs/                              this documentation + runbooks + indexes
```

## Module system

Content scripts cannot `import`; each attaches to `window.StickySites`:

`Settings` → request helper → mutation IPC → HTML filter → `Crypto` → `noteTypes` →
`Prefs` → `Cluster` → `Todo` → `OutlineOps` → `Outline` → `Mentions` → `Panel` → orchestrator (`sticky-inject.js`). Adding a script means adding it to
`manifest.json` **after** its dependencies and to `popout.html` if the popout needs it.

`src/shared/note-writer.js` owns the service worker mutation queue; `storage-content.js`
sends commands to it. It reads current state and verifies writes. Native/peer sync calls
commit only while their input remains current (`STATE_CHANGED` otherwise). `settings.js`
and `network.js` are classic helpers shared with extension pages. Keep the two crypto
implementations in lock-step; `notes-storage.js` remains a plaintext test reference.

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
