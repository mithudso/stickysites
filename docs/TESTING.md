# Testing

## Framework and commands

[Vitest](https://vitest.dev/) 5.x, node environment, `globals: true` (`vitest.config.mjs`).

```bash
npm test                                   # single run — 4 files, 101 tests (~350 ms)
npm run test:watch                         # watch mode
npx vitest run tests/todo-bridge.test.js   # one file
npm run lint                               # syntax gate + version agreement (runs before tests in CI)
npm run verify:live                        # optional end-to-end harness (see below)
```

## Suites

| File | Tests | Module under test | What is covered |
|------|------:|-------------------|-----------------|
| `tests/notes-storage.test.js` | 50 | `src/shared/notes-storage.js` | `getSiteKey` (www strip, invalid URL), `getPageKey` (query/hash stripped), `getDailyKey`, `parseTags` (split, `#` prefix, dedupe, lowercase), CRUD + `createdAt` preservation + delete + readAll for global, site, page, daily, todo, outline; prefs defaults (match `prefs.js`) / write / partial merge; todo `sections`/`tagColors` round-trip |
| `tests/todo-bridge.test.js` | 23 | `src/shared/todo-bridge.js` | `buildRequest` shape and coercion; `applyHostResult` — local-only fields kept, section name↔id mapping, host-origin section pruning, `completedAt` backfill/clear, `changed` detection; `syncTodosWithHost` — encrypted skip, host error, malformed reply, no-write when unchanged, storage read/write failures |
| `tests/outline-ops.test.js` | 21 | `src/content/outline-ops.js` (with a stubbed `window`) | `findParent`, insert/indent/outdent/move/remove, `filterTree` (ancestors kept), `extractTags`, `autoGroup`, `toMarkdown`, `toOPML` |
| `tests/crypto.test.js` | 7 | `src/shared/crypto.js` | 16-byte salt, `CryptoKey` derivation, encrypt/decrypt round-trip, wrong-key failure, `isEncrypted` |

### Chrome API mocking

Tests replace `globalThis.chrome.storage.local` with an in-memory object exposing `get`, `set`,
`remove`; `beforeEach` resets it. `todo-bridge` takes `storage` and `sendNativeMessage` as
parameters, so its tests inject fakes and never touch `chrome.*`. `outline-ops` is loaded
after assigning `globalThis.window = {}` so the namespace IIFE has somewhere to attach.

## Coverage target

**Meaningful coverage of the paths that lose or corrupt data if wrong**, with assertions on
behaviour — not a blanket line-percentage. Concretely, every exported function in
`src/shared/` and `src/content/outline-ops.js` has at least one behavioural test, and every
change to storage shapes, the merge in `todo-bridge.js`, or the envelope check ships with a
test in the same PR. No numeric threshold is enforced in CI; the gate is "all tests pass"
plus the review checklist in `.github/PULL_REQUEST_TEMPLATE.md`.

## CI gates (`.github/workflows/ci.yml`)

1. `npm run lint` — `node --check` over every `.js`/`.mjs`; `manifest.json` and `package.json` versions must agree.
2. `npm test` — the 101 unit tests.
3. `npm run docs:check-indexes` — `docs/high_signal_file_index.json` and `llms.txt` links resolve.
4. `manifest.json` parses and declares `manifest_version: 3`.

## What is not unit-tested

- **DOM layers** — `panel.js`, `cluster.js`, `outline.js`, `mentions.js`, `sticky-inject.js`,
  `popup.js`, `popout.js`. They are coupled to the content-script runtime and `execCommand`.
- **Service worker wiring** — context menus, commands, alarms, `sendNativeMessage` glue
  (the merge logic it calls *is* tested).
- **Encryption end-to-end** in the namespace module (`crypto-content.js`); the primitives are
  tested through the ES twin.

These are covered by the live harness and by the manual checklist in
`docs/runbooks/load-and-reload-extension.md`.

## Live harness (`npm run verify:live`)

`scripts/verify-live.mjs` drives an unpacked build with puppeteer-core:

- Needs `npm i --no-save puppeteer-core` and a Chromium that honours `--load-extension`
  (Chrome for Testing; branded Chrome 137+ ignores it). Override the binary with `SS_CHROME`.
- Spins up a local HTTP server with classic pages and an SPA route, then checks: identity
  icons (S1), caret stability across save cycles (S2), per-page identity (S3), SPA re-key (S4),
  unfocused cross-tab sync (S5), site note (S6), outliner keyboard/zoom/filter/auto-group/export
  (S7a–k), popup labels and storage integrity (S8), encryption enable → Lock Now → locked
  popout read-only → unlock (S9a–d).
- Screenshots land in `/tmp/stickysites-verify`; exit code is non-zero on any ❌ step
  (🔍 marks probes that are informational).

## Adding tests

- Pure logic → extract into `src/shared/` or a `*-ops.js` namespace module and test it directly.
- Anything asserting on the service worker's `console.warn` failure logs →
  `vi.spyOn(console, 'warn')`; see `docs/logging.md`.
- Keep `describe` blocks per export; reset the storage mock in `beforeEach`.
