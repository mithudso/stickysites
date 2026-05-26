# Onboarding

New to StickySites? Here's how to get from zero to contributing in 5 minutes.

## 1. Clone and install

```bash
git clone <repo-url>
cd stickysites
npm install
```

## 2. Run tests

```bash
npm test
```

Expected: 48 tests pass across 2 test files.

## 3. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked** and select the repo root
4. The StickySites icon (notepad) appears in the toolbar

## 4. Verify it works

- Visit any webpage
- You should see a floating pill with 6 colored circles (top-right corner)
- Click any circle to open the note workspace panel
- Click the toolbar icon to open the all-notes popup

## 5. Understand the codebase

Read these in order:
1. [CLAUDE.md](../CLAUDE.md) — project overview and conventions
2. [docs/ARCHITECTURE.md](ARCHITECTURE.md) — how the pieces fit together
3. [docs/COMPONENTS.md](COMPONENTS.md) — what each file does
4. [docs/DEVELOPMENT.md](DEVELOPMENT.md) — commands, debugging, packaging

## 6. Make your first change

Good first tasks:
- Add a test case to `tests/notes-storage.test.js`
- Improve a CSS style in `src/content/sticky-inject.css`
- Update documentation in `docs/`

After making changes:
1. Run `npm test` to verify
2. Reload the extension at `chrome://extensions` (click the reload icon)
3. Refresh the page you're testing on
