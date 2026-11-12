# Chrome Web Store submission kit — StickySites

Submission assets and instructions for publishing StickySites on the Chrome Web Store.
The account owner completes the publishing steps. The package version comes from
`manifest.json`; rebuild and verify the kit for each release.

> **Account note.** A Google Play developer account does **not** cover the Chrome Web Store.
> Complete the current Chrome Web Store registration requirements shown in its developer console.
> Everything else below assumes that registration is done (step 1).

## File listing

| # | Asset | Path | Spec | Status |
|---|---|---|---|---|
| 1 | Upload package | `dist/stickysites-<version>.zip` (rebuild: `npm run build:store`) | zip with `manifest.json` at root; no dev files | Rebuild and inspect the current package |
| 2 | Store icon | `store/promo/icon-128.png` (copy of `icons/icon128.png`) | 128×128 PNG | ✅ |
| 3 | Screenshot 1 | `store/screenshots/01-page-note.png` | 1280×800 PNG | Existing asset; refresh and inspect for the submitted build |
| 4 | Screenshot 2 | `store/screenshots/02-todo.png` | 1280×800 PNG | ✅ |
| 5 | Screenshot 3 | `store/screenshots/03-outliner.png` | 1280×800 PNG | ✅ |
| 6 | Screenshot 4 | `store/screenshots/04-daily-note.png` | 1280×800 PNG | ✅ |
| 7 | Screenshot 5 | `store/screenshots/05-popup.png` | 1280×800 PNG | ✅ |
| 8 | Small promo tile | `store/promo/small-tile-440x280.png` | 440×280 PNG | ✅ |
| 9 | Marquee promo tile (optional) | `store/promo/marquee-1400x560.png` | 1400×560 PNG | ✅ |
| 10 | Listing copy (name, summary, description, category, URLs, reviewer notes) | `store/listing.md` | summary ≤ 132 chars (105), description ≤ 16 000 | ✅ paste-ready |
| 11 | Single-purpose statement + data-usage answers | `store/listing.md` → Privacy tab | — | ✅ |
| 12 | Permission justifications (5 permissions + host permission + remote code) | `store/permissions-justifications.md` | one box each | ✅ paste-ready |
| 13 | Privacy policy (public URL) | `PRIVACY.md` → https://github.com/mithudso/stickysites/blob/main/PRIVACY.md | public HTTPS URL | Public URL; confirm the published policy matches the submitted build |
| 14 | Manifest fields | `manifest.json`: `name`, `description`, `version from manifest`, `icons` 16/48/128, `homepage_url`, `minimum_chrome_version 116` | store requirements | ✅ |
| 15 | Regenerate screenshots after UI changes | `npm run store:screenshots` (needs `npm i --no-save puppeteer-core` + Chrome for Testing) | — | ✅ script |
| 16 | Regenerate promo tiles | `npm run store:promo` | — | ✅ script |
| 17 | Developer account registration | https://chrome.google.com/webstore/devconsole | — | ⬜ **you** |
| 18 | Publisher email verification + 2-Step Verification on the Google account | dashboard → Account | required before first publish | ⬜ **you** |
| 19 | Trader / non-trader declaration (EU Digital Services Act) | dashboard → Account | complete the classification that applies to the publisher | ⬜ **you** |
| 20 | Upload zip, paste copy, upload images, submit for review | dashboard → Items → New item | — | ⬜ **you** (walkthrough below) |

## Step-by-step

### 1. Register (once)
1. Sign in at https://chrome.google.com/webstore/devconsole with the Google account you want
   as publisher.
2. Accept the current developer agreement and complete the console's registration steps.
3. **Account** tab → set a publisher display name, verify the contact email (a code is
   mailed), enable 2-Step Verification on the account, and complete the **trader status**
   declaration.

### 2. Build and verify the current package
```bash
# From the repository root
npm run lint && npm test && npm run build:store
```
→ `dist/stickysites-<version>.zip`. The script refuses to package if `manifest.json` and
`package.json` versions differ or if any dev file sneaks in.

### 3. Create the item
1. Dashboard → **Items** → **New item** → upload `dist/stickysites-<version>.zip`.
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
   - Data usage: review the current form against local, paired-LAN, and optional cloud-folder
     transfers described in `PRIVACY.md`; the publisher makes the certifications
   - Privacy policy URL: `https://github.com/mithudso/stickysites/blob/main/PRIVACY.md`
4. **Distribution** tab: Public (or Unlisted for a soft launch), all regions, free.
5. **Save draft** → **Submit for review**. Leave "Publish automatically after review" on.

### 4. What to expect in review
- Content scripts on `<all_urls>` count as **broad host permissions**, which routes the item
  to a fuller review; timing varies. The reviewer-notes text in
  `store/listing.md` explains why (core feature = note on any page) and discloses the
  optional local/LAN/cloud-folder sync without claiming hosted telemetry.
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

## Pre-flight checklist (verify for each submitted build)
- [x] `manifest_version: 3`; `name` ≤ 45 chars; `description` ≤ 132 chars; icons 16/48/128 present
- [x] No `key` field, no remote code, no `eval`, no external resources
- [ ] Required automated checks pass for the submitted commit; record actual runner results
- [ ] Current-build fresh-profile smoke completed when authorized (cluster injects, all six
      note types open, popup renders)
- [ ] Current package contains only runtime files (script-verified)
- [ ] Privacy policy matches storage, visible host-page DOM, native messaging, paired LAN,
      shared/cloud folders, plaintext metadata, encryption, and absence of hosted collection
- [ ] Optional: enable encryption in a fresh profile and confirm lock/unlock before submitting
      (`docs/runbooks/encryption-lock-and-recovery.md`)
