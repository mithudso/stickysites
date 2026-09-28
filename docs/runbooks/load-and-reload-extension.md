# Runbook: load, reload, and verify the unpacked extension

**Precondition**: repo checked out; `npm run lint && npm test` green.

## Steps

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the repo root (the directory containing `manifest.json`).
3. After any code change click **↻** on the StickySites card.
4. If `manifest.json` changed (new content script, permission, command): reload the
   extension **and** close/reopen every tab you are testing in — Chrome does not re-inject
   content scripts into existing tabs.
5. CSS-only changes in `src/content/sticky-inject.css` need a page reload on the target site.

## Verification

- Visit any `http(s)` page: the floating cluster (`#stickysites-cluster`) appears.
- `Ctrl/Cmd+F1` opens the Global note; `Alt+S` hides/shows the cluster.
- Toolbar icon opens the popup with the Quick-Open row.
- Automated: `npm i --no-save puppeteer-core && npm run verify:live` (needs Chrome for Testing;
  branded Chrome 137+ ignores `--load-extension`; override the binary with `SS_CHROME`).

## Escalation

- Cluster never appears → DevTools console on the page; look for a syntax error naming a
  `src/content/*.js` file, then `npm run lint`.
- Service worker "inactive" with errors → click **Service worker** on the card and read the
  `[stickysites]` warnings (see `docs/logging.md`).
