# Chrome Web Store submission kit — StickySites

Everything needed to publish StickySites on the Chrome Web Store, what is already done, and
the handful of steps only the account owner can do. Version in this kit: **1.11.2**.

> **Account note.** A Google Play developer account does **not** cover the Chrome Web Store.
> The store has its own one-time **US$5** developer registration on the same Google account.
> Everything else below assumes that registration is done (step 1).

## File listing

| # | Asset | Path | Spec | Status |
|---|---|---|---|---|
| 1 | Upload package | `dist/stickysites-1.11.2.zip` (rebuild: `npm run build:store`) | zip with `manifest.json` at root; 30 files, ~67 KB; no dev files | ✅ built, contents verified by the script |
| 2 | Store icon | `store/promo/icon-128.png` (copy of `icons/icon128.png`) | 128×128 PNG | ✅ |
| 3 | Screenshot 1 | `store/screenshots/01-page-note.png` | 1280×800 PNG | ✅ generated from a live build |
| 4 | Screenshot 2 | `store/screenshots/02-todo.png` | 1280×800 PNG | ✅ |
| 5 | Screenshot 3 | `store/screenshots/03-outliner.png` | 1280×800 PNG | ✅ |
| 6 | Screenshot 4 | `store/screenshots/04-daily-note.png` | 1280×800 PNG | ✅ |
| 7 | Screenshot 5 | `store/screenshots/05-popup.png` | 1280×800 PNG | ✅ |
| 8 | Small promo tile | `store/promo/small-tile-440x280.png` | 440×280 PNG | ✅ |
| 9 | Marquee promo tile (optional) | `store/promo/marquee-1400x560.png` | 1400×560 PNG | ✅ |
| 10 | Listing copy (name, summary, description, category, URLs, reviewer notes) | `store/listing.md` | summary ≤ 132 chars (105), description ≤ 16 000 | ✅ paste-ready |
| 11 | Single-purpose statement + data-usage answers | `store/listing.md` → Privacy tab | — | ✅ |
| 12 | Permission justifications (5 permissions + host permission + remote code) | `store/permissions-justifications.md` | one box each | ✅ paste-ready |
| 13 | Privacy policy (public URL) | `PRIVACY.md` → https://github.com/mithudso/stickysites/blob/main/PRIVACY.md | public HTTPS URL | ✅ live once this branch is merged to `main` |
| 14 | Manifest fields | `manifest.json`: `name`, `description`, `version 1.11.2`, `icons` 16/48/128, `homepage_url`, `minimum_chrome_version 116` | store requirements | ✅ |
| 15 | Regenerate screenshots after UI changes | `npm run store:screenshots` (needs `npm i --no-save puppeteer-core` + Chrome for Testing) | — | ✅ script |
| 16 | Regenerate promo tiles | `npm run store:promo` | — | ✅ script |
| 17 | Developer account registration ($5) | https://chrome.google.com/webstore/devconsole | — | ⬜ **you** |
| 18 | Publisher email verification + 2-Step Verification on the Google account | dashboard → Account | required before first publish | ⬜ **you** |
| 19 | Trader / non-trader declaration (EU Digital Services Act) | dashboard → Account | required; "non-trader" for a free hobby extension | ⬜ **you** |
| 20 | Upload zip, paste copy, upload images, submit for review | dashboard → Items → New item | — | ⬜ **you** (walkthrough below) |

## Step-by-step

### 1. Register (once)
1. Sign in at https://chrome.google.com/webstore/devconsole with the Google account you want
   as publisher.
2. Accept the developer agreement and pay the one-time US$5 registration fee.
3. **Account** tab → set a publisher display name, verify the contact email (a code is
   mailed), enable 2-Step Verification on the account, and complete the **trader status**
   declaration.

### 2. Build the package (done — rebuild only if you change code)
```bash
cd /Users/mitch/dev/stickysites
npm run lint && npm test && npm run build:store
```
→ `dist/stickysites-1.11.2.zip`. The script refuses to package if `manifest.json` and
`package.json` versions differ or if any dev file sneaks in.

### 3. Create the item
1. Dashboard → **Items** → **New item** → upload `dist/stickysites-1.11.2.zip`.
2. **Store listing** tab — paste from `store/listing.md`:
   - Description (the long text block)
   - Category: **Workflow & Planning** (or Tools)
   - Language: English (United States)
   - Store icon: `store/promo/icon-128.png`
   - Screenshots: upload `store/screenshots/01…05` in order
   - Small promo tile: `store/promo/small-tile-440x280.png`; Marquee: `store/promo/marquee-1400x560.png`
   - Homepage URL: `https://github.com/mithudso/stickysites`; Support URL: `https://github.com/mithudso/stickysites/issues`
3. **Privacy** tab:
   - Single purpose: paste from `store/listing.md`
   - Permission justifications: one box each from `store/permissions-justifications.md`
     (`storage`, `activeTab`, `contextMenus`, `alarms`, `nativeMessaging`, **Host permission**)
   - Remote code: **No**
   - Data usage: leave all boxes unchecked; tick the three certifications
   - Privacy policy URL: `https://github.com/mithudso/stickysites/blob/main/PRIVACY.md`
4. **Distribution** tab: Public (or Unlisted for a soft launch), all regions, free.
5. **Save draft** → **Submit for review**. Leave "Publish automatically after review" on.

### 4. What to expect in review
- Content scripts on `<all_urls>` count as **broad host permissions**, which routes the item
  to a fuller review — typically 1–3 days, occasionally longer. The reviewer-notes text in
  `store/listing.md` explains why (core feature = note on any page) and that there is no
  network activity.
- `nativeMessaging` is unusual for a consumer extension; the justification explains it is
  optional and local-only. If the reviewer asks for the companion program, point at
  `~/.claude/skills/todo/scripts/todo.py` in the repo the host lives in, or offer to drop
  the permission in a follow-up version (it is a self-contained code path in
  `src/background/service-worker.js` + `src/shared/todo-bridge.js`).
- A rejection arrives by email with a policy code; fix, bump the version, rebuild, re-upload.

### 5. After approval
- The item URL will be `https://chromewebstore.google.com/detail/<item-id>`; add it to
  `README.md` and `docs/INSTALLATION.md` → "Chrome Web Store" (currently "Not yet published").
- Updates: bump `manifest.json` + `package.json` (CI enforces agreement), `npm run build:store`,
  upload the new zip on the item's **Package** tab, submit. Store versions must always increase.
- Keep `PRIVACY.md` at the same URL; update its date when it changes.

## Pre-flight checklist (all green as of this kit)
- [x] `manifest_version: 3`; `name` ≤ 45 chars; `description` ≤ 132 chars; icons 16/48/128 present
- [x] No `key` field, no remote code, no `eval`, no external resources
- [x] `npm run lint && npm test` green (101 tests); CI green on `main`
- [x] Fresh-profile smoke test performed by the screenshot harness (cluster injects, all six
      note types open, popup renders)
- [x] Package contains only runtime files (script-verified)
- [x] Privacy policy covers storage, page access, native messaging, encryption, no collection
- [ ] Optional: enable encryption in a fresh profile and confirm lock/unlock before submitting
      (`docs/runbooks/encryption-lock-and-recovery.md`)
