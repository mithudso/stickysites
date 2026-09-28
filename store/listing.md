# Chrome Web Store listing copy — StickySites 1.12.4

Paste-ready text for every field in the Developer Dashboard. Character limits are the
store's; counts are given where they matter.

## Store listing tab

**Extension name** (from manifest, ≤ 45 chars)
```
StickySites
```

**Summary** (from manifest `description`, ≤ 132 chars — currently 105)
```
Sticky notes for every website. Global notes, per-site notes, and per-page notes in a floating workspace.
```

**Description** (≤ 16,000 chars; plain text, line breaks kept)
```
StickySites puts a sticky note on every website — and keeps everything on your device.

A small floating cluster of icons sits on each page. Click one to open a note that belongs to
that place:

• Global note — one shared note you see everywhere
• Site note — one note per domain
• Page note — one note per exact page
• Daily note — one note per calendar day
• To-do list — sections, nested items, priorities, colors, tags, per-item notes, drag to reorder
• Outliner — a library of named outlines with zoom, collapse, tags, filter, Markdown/OPML export

WRITE THE WAY YOU THINK
• Rich text editor: headings, bold/italic/underline/strikethrough, lists, checkboxes, alignment, fonts, colors
• Find & Replace (Ctrl/Cmd+F, Ctrl/Cmd+H)
• Type @ for links, dates, contacts and file references
• #tags inside any note; auto-save after half a second; live sync between open tabs

STAY IN FLOW
• Alt+S shows or hides the cluster; Ctrl/Cmd+F1…F6 jump straight to a note type
• Right-click any selected text → StickySites → clip it into a note
• Move and resize the panel, or pop a note out into its own window — drag it off the page
• Notes follow single-page apps as the URL changes

PRIVATE BY DESIGN
• No account, no servers, no analytics, no network requests — ever
• All notes live in Chrome's local extension storage on your computer
• Optional AES-256-GCM encryption with a passphrase you choose; lock and unlock any time
• Export everything as Markdown from the popup

THE POPUP
Search across every note, sort by recency or name, filter by type or tag, export, and manage
settings (encryption, which note types are shown, cluster layout).

OPTIONAL: KEEP YOUR OWN LAPTOPS IN SYNC — WITHOUT THE CLOUD
Install the small open-source peer helper on two or more of your computers with the same
pairing key and they keep each other's notes converged over your local network only: multicast
discovery, pinned TLS, record-level merge. No account, nothing leaves your LAN.

OPTIONAL: SYNC YOUR TO-DO LIST WITH A LOCAL FILE
Power users can install a small companion program on their own computer so the to-do list
mirrors into a Markdown file. It never leaves your machine, and the extension works fully
without it.

Open source (MIT): https://github.com/mithudso/stickysites
Privacy policy: https://github.com/mithudso/stickysites/blob/main/PRIVACY.md
```

**Category**: Workflow & Planning (fallback if not offered: Tools / Productivity)

**Language**: English (United States)

**Store icon**: `store/promo/icon-128.png` (128×128 PNG)

**Screenshots** (1280×800 PNG, upload in this order; ≥ 1 required, 5 recommended)
1. `store/screenshots/01-page-note.png` — rich-text page note on an article
2. `store/screenshots/02-todo.png` — to-do list with sections, priorities, tags
3. `store/screenshots/03-outliner.png` — outliner document
4. `store/screenshots/04-daily-note.png` — daily note with the cluster
5. `store/screenshots/05-popup.png` — popup: search, filter, export

**Small promo tile** (440×280): `store/promo/small-tile-440x280.png`
**Marquee promo tile** (1400×560, optional): `store/promo/marquee-1400x560.png`

**Official URL**: https://github.com/mithudso/stickysites (only selectable after verifying the
domain in Search Console — skip; leave blank)
**Homepage URL**: https://github.com/mithudso/stickysites
**Support URL**: https://github.com/mithudso/stickysites/issues
**Mature content**: No

## Privacy tab

**Single purpose description** (one paragraph)
```
StickySites lets the user write and keep notes attached to the website, page, or date they are
viewing — plus a to-do list and an outliner — stored locally in the browser with optional
encryption. Every feature (floating icon cluster, note panel, right-click clipping, popup
search/export, optional local to-do file sync) exists only to create, find, and manage those
personal notes.
```

**Permission justifications** — see `store/permissions-justifications.md` (one entry per
permission plus the host-permission entry for the content script).

**Remote code**: No, I am not using remote code. (All JavaScript ships in the package;
nothing is fetched or eval'd.)

**Data usage — "What user data do you plan to collect?"**: leave **every box unchecked**.
The extension stores user-authored notes locally and transmits nothing. Selected page text is
only read when the user explicitly clips it via the context menu, and it is stored locally.

**Certifications** (tick all three):
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
```
https://github.com/mithudso/stickysites/blob/main/PRIVACY.md
```

## Distribution tab

- **Visibility**: Public (or Unlisted for a soft launch — link-only, still reviewed)
- **Regions**: All regions
- **Pricing**: Free (no in-app purchases)

## Package tab

Upload `dist/stickysites-1.12.4.zip` (built by `npm run build:store`). Version comes from
`manifest.json`; every later upload must have a higher version.

## Reviewer notes (optional "Notes for reviewer" field — recommended)
```
StickySites is a local-only note-taking extension. It makes no network requests; all data is
in chrome.storage.local. The content script runs on all URLs because the core feature is a
note attached to whatever page the user is on. `nativeMessaging` + `alarms` power an optional
sync of the to-do list with a local Markdown file through a companion program the user
installs themselves; without it the code path exits quietly. The service worker also
fetches http://127.0.0.1:47831 (an optional local helper the user installs for LAN sync between
their own machines; CORS-gated to the extension origin, no host permission required; unreachable
→ silent no-op). Encryption (AES-256-GCM) is opt-in from the popup Settings. Source: https://github.com/mithudso/stickysites
```
