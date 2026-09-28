# Copilot Instructions

## Default Execution Strategy

**Always apply these rules to every task without being asked:**

1. **Read before editing.** Open every file you are about to change, plus `manifest.json`
   (content-script load order) and the module it depends on. Never edit `panel.js`,
   `outline.js`, or `sticky-inject.js` from memory of an older version.
2. **Run the checks after every change.** `npm run lint && npm test` (syntax gate + 101 unit
   tests). Then reload the unpacked extension at `chrome://extensions` and exercise the
   changed surface on a real page — the UI layer has no unit tests.
3. **Never invent commands, paths, permissions, or storage keys.** Everything runnable is in
   `package.json` → `scripts`; every storage key is listed in `CLAUDE.md`. If something is
   unknown, write `# TODO:` with where to find the answer.
4. **Follow the workflow log rule.** Append the request to `prompts.md`, update `memory.md`,
   and bump the patch version in **both** `manifest.json` and `package.json` (CI fails if
   they disagree).
5. **Parallelism first:** split independent doc/code subtasks across parallel agents; only
   serialize where a later step needs an earlier result.
6. **No truncation, no "continue?" pauses.** Batch files over ~300 lines and keep going.
7. **Completion summary:** finish with a table of every file produced, its line count, and status.

## Orientation

Read in this order: `README.md` → `CLAUDE.md` → `docs/ARCHITECTURE.md` →
`docs/COMPONENTS.md` → `docs/DEVELOPMENT.md`. Anything touching encryption or the
native-messaging to-do sync: `docs/SECURITY.md` and `docs/external-calls.md` first.

## Build, Test, and Validation Commands

There is no build step. Chrome loads the repo root unpacked.

| Command | What it does |
|---|---|
| `npm install` | Dev deps only (vitest, canvas) |
| `npm test` | `vitest run` — 4 files, 101 unit tests (node env, mocked `chrome`) |
| `npm run test:watch` | Vitest watch mode |
| `npx vitest run tests/outline-ops.test.js` | Single test file |
| `npm run lint` | `node --check` every `.js`/`.mjs` + manifest↔package version agreement |
| `npm run docs:check-indexes` | Path-validate `docs/high_signal_file_index.json` and `llms.txt` links (`-- --prune` drops dead entries) |
| `npm run logs:rotate` | Rotate `memory.md` / `prompts.md` sections into `docs/archive/` once past ~200 KB |
| `npm run icons` | Regenerate `icons/*.png` (needs `canvas`) |
| `npm run verify:live` | Puppeteer harness against Chrome for Testing (`npm i --no-save puppeteer-core`; set `SS_CHROME`) |
| `npm run build:store` | Chrome Web Store zip → `dist/` (runtime files only; version-drift guard) |
| `npm run store:screenshots` / `store:promo` | Regenerate `store/screenshots/` and `store/promo/` |
| Load extension | `chrome://extensions` → Developer mode → Load unpacked → repo root; click ↻ after edits |

CI (`.github/workflows/ci.yml`) runs lint → test → index check → manifest validation on every push and PR to `main`.

## High-level Architecture

- **Content scripts** (`src/content/*.js`, 10 classic scripts in manifest order) run on
  `<all_urls>` at `document_idle`. They share state through `window.StickySites.*`
  (Crypto, noteTypes, Prefs, Cluster, Todo, OutlineOps, Outline, Mentions, Panel);
  `sticky-inject.js` is the orchestrator. No ES `import` is possible here.
- **Service worker** (`src/background/service-worker.js`, ES module): context menus,
  `Alt+S` command, popout window creation, and the optional to-do sync
  (`chrome.runtime.sendNativeMessage` → host `com.mitch.todo_bridge`, every 2 min via
  `chrome.alarms` and 3 s after a to-do edit).
- **Popup** (`popup.html/js/css`) and **popout** (`popout.html/js/css`) are extension pages
  loading the same namespace scripts with plain `<script>` tags.
- **Shared ES modules** (`src/shared/`) are consumed by the service worker
  (`todo-bridge.js`) and by vitest (`crypto.js`, `notes-storage.js`, `todo-bridge.js`).
- **Storage**: everything lives in `chrome.storage.local` under versioned keys
  (`stickysites_*_v1`); the cached AES key is `stickysites_cached_key`. No network calls.
- **Messages**: `STICKYSITES_TOGGLE` / `STICKYSITES_OPEN` / `STICKYSITES_CLIP` (SW or popup →
  content) and `STICKYSITES_POPOUT` (content or popup → SW).

## Key Conventions

1. Vanilla JS only — no frameworks, transpilers, bundlers, or npm runtime dependencies.
2. Content scripts are classic scripts; add new ones to `manifest.json` **after** the
   modules they depend on and also to `popout.html` if the popout needs them.
3. Every injected DOM id/class starts with `stickysites-`; z-index stays near INT32_MAX.
4. Storage keys are versioned (`_v1`); map records store `key` + `label` and readers fall
   back to legacy `siteKey`/`pageKey`/`dateKey`, `siteLabel`/`pageLabel`.
5. Auto-save is debounced at 500 ms; always `flushPendingSave()` before switching note,
   closing, popping out, or re-keying on SPA navigation.
6. The panel snapshots `_activeKey`/`_activeLabel` at `open()` and never re-derives them
   mid-session — this is what stops a save landing under another page's key.
7. Never write plaintext to a note key while the vault is locked (`Crypto.getCachedKey()`
   is null and encryption is enabled). Readers must treat `{ iv, data }` as an envelope.
8. `src/content/crypto-content.js` and `src/shared/crypto.js` implement the same
   algorithm in two packagings — change both together.
9. No bare-key hotkeys. Only `Alt+S` (browser command) and `Ctrl/Cmd+F1…F6`; bare digits
   and `a` broke page typing and `Cmd+A` in the past.
10. Bump `manifest.json` and `package.json` versions together on every change.
