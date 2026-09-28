# Onboarding

From zero to a merged change in about ten minutes.

## 1. Clone and install

```bash
git clone https://github.com/mithudso/stickysites.git
cd stickysites
npm install
```

## 2. Run the checks

```bash
npm run lint && npm test
```

Expected: `✔ 26 JavaScript files parse; manifest.json and package.json versions agree`, then
`Test Files 4 passed · Tests 101 passed`.

## 3. Load the extension

`chrome://extensions` → Developer mode → **Load unpacked** → repo root. The StickySites icon
appears in the toolbar.

## 4. See it work

- Visit any page: a floating cluster of colored icons appears. Click one, or press
  `Ctrl/Cmd+F1` (Global) … `F6` (Daily). `Alt+S` hides the cluster.
- Type in the panel; open the same site in another tab and watch the note sync.
- Toolbar icon → popup: search, Quick-Open, Settings (try Enable encryption, then Lock Now).
- Optional: `python3 ~/.claude/skills/todo/scripts/todo.py install-native-host`, reload, and
  watch the to-do list mirror into `TODO.md`.

## 5. Understand the codebase

Read in order:
1. `CLAUDE.md` — shape, commands, storage keys, conventions
2. `docs/ARCHITECTURE.md` — contexts, data flows, ADRs
3. `docs/COMPONENTS.md` — what each module exposes
4. `docs/DEVELOPMENT.md` — debugging and conventions
5. `docs/SECURITY.md` before touching anything crypto-related

## 6. Make a change

Good first tasks: add a test to `tests/todo-bridge.test.js` or `tests/outline-ops.test.js`;
a style fix in `src/content/sticky-inject.css`; a doc correction.

Then:
1. `npm run lint && npm test`
2. ↻ the extension at `chrome://extensions` and refresh your test page
3. Bump the patch version in `manifest.json` **and** `package.json`; log the change in
   `prompts.md` and `memory.md` (see `CLAUDE.md` → Workflow log rule)
4. Open a PR — the template asks for tests, risk, and rollback; CI runs lint, tests, and the
   index check
