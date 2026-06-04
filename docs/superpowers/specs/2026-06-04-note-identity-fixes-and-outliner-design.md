# StickySites v1.10 — Note-identity fixes + Outliner overhaul

**Date:** 2026-06-04
**Status:** Approved (design presented and accepted in session)
**Scope:** Two bug families (editor caret reset, page-note identity) plus three features
(daily-date display, identity-bearing cluster icons, outliner overhaul with a global named
library).

---

## 1. Bug — cursor flicker while editing (panel.js)

### Cause

Every debounced save round-trips through `chrome.storage.onChanged` →
`Panel.syncFromStorage()` (panel.js:1937) in the **same tab**, which reassigns
`editor.innerHTML`. Reassigning `innerHTML` on a focused `contenteditable` resets the caret
to the start. With encryption enabled it is worse: the change event carries the encrypted
`{iv, data}` envelope, `newValue.body` is `undefined`, and the editor is **erased**
mid-typing.

### Fix

`syncFromStorage` gains three guards, applied in order:

1. **Self-echo guard** — `doSave` records the exact body it wrote in
   `Panel._lastSavedBody`; an incoming change whose body equals it is ignored.
2. **Focus guard** — never touch `innerHTML` while the editor (or tag input) has focus.
   The user is typing; remote changes are picked up on the next open.
3. **Encrypted guard** — if the incoming value `isEncrypted`, decrypt it (async) before
   comparing; if the key is locked, skip entirely. No more wipes.

Cross-tab sync still works: an unfocused panel still receives remote updates.

*Alternative considered:* caret save/restore around the rewrite. Rejected — fragile across
HTML normalization, and the guards make the rewrite unnecessary in every editing scenario.

### Acceptance

- Typing continuously in any rich-text note never moves the caret.
- With encryption enabled and unlocked, typing never erases content.
- Editing the same note in tab B while tab A's panel is open but unfocused still updates
  tab A.

---

## 2. Bug — page note bleeding across pages

### Cause

The page key (`origin + pathname`) is computed correctly at open time but **recomputed live
at save time** (`noteType.getKey(location)` inside `_writeNote`). On any site with
client-side navigation (SPA routing, `history.pushState`), the panel survives navigation and
the next debounced save writes *page A's content under page B's key*. The contamination is
persisted — afterwards even clean full-reload opens show the same note on both pages.

### Fix

1. **Key capture at open** — `Panel.open()` snapshots `key` and `label` once
   (`_activeKey` / `_activeLabel`); all reads/writes for that panel session use the
   snapshot. A save can never land under a different page's key. Side benefit: a daily note
   open across midnight no longer writes today's text under tomorrow's date.
2. **URL-change watcher** — while the cluster/panel is present, listen to `popstate` +
   `hashchange` + a 1 s `location.href` poll. On change:
   - if a location-dependent note (site/page) is open, **flush any pending debounced save
     first** (it writes under the captured old key — no data loss), then re-open the panel
     for the new URL (fresh key, fresh content);
   - refresh the cluster icon text (see §5).

Already-contaminated records are not auto-unmixed (indistinguishable from intentional
content); users clean those by hand.

### Acceptance

- On an SPA: open page note on route A, navigate client-side to route B, type — content is
  saved under B only if the panel was re-opened for B; the A-session panel never writes
  under B's key.
- Page notes on `example.com/index.html` and `example.com/contactus.html` are independent.

---

## 3. Bug — popup reads a schema production never writes

### Cause

`src/shared/notes-storage.js` (writes `siteKey`/`pageKey`/`dateKey` fields) is imported by
**nothing at runtime — only vitest**. The real writer is panel.js, which writes
`key` + `label`. popup.js reads the test-only field names, so every site/page/daily card
shows an empty source ("Page note — "), and `noteMatchesCurrentTab` always fails → cards
permanently dimmed and unclickable.

### Fix

Canonical record schema = what production already writes: **`key` + `label`**.

- popup.js reads `r.key` with fallback `r.siteKey || r.pageKey || r.dateKey` for old
  stored records.
- notes-storage.js and `tests/notes-storage.test.js` are aligned to the canonical schema.
- Result: popup labels show domain/path/date again; matching cards un-dim and open on
  click.

### Acceptance

- Popup shows "Site note — example.com", "Page note — /contactus.html",
  "Daily — 2026-06-04" for records written through the panel.
- Cards matching the active tab are clickable and open the note.
- `npm test` passes against the canonical schema.

---

## 4. Feature — daily note shows the current date

- Panel header already shows "Daily — YYYY-MM-DD" (no change).
- Popup card label fixed by §3.
- Cluster icon becomes a mini calendar showing today's **day-of-month** (e.g. "4"),
  tooltip = full date (delivered by §5).

Out of scope (not requested after clarification): auto-inserting the date into the note
body.

---

## 5. Feature — identity-bearing cluster icons ("short text in circle")

Each note type gains a `getIconContent(loc)` (and `getIconTitle(loc)`) in the
note-types registry; cluster.js renders from it.

| Type | Icon content (32 px circle) | Tooltip |
|---|---|---|
| Global | 🌐 | Global note |
| Site | domain fragment: hostname minus `www.`, first dot-label, sliced to 4 chars ("exam" for example.com), ~9 px font | full hostname |
| Page | last path segment, truncated with ellipsis | full pathname |
| Todo | ✓ (unchanged) | unchanged |
| Outline | ≡ (unchanged) | unchanged |
| Daily | day-of-month number | Daily — YYYY-MM-DD |

Details:

- Text centered, single line, `overflow: hidden`, no wrap; path `/` renders "/".
- The §2 URL watcher refreshes the page/site icon text after SPA navigations.
- Popup Quick-Open buttons keep their existing text labels (unchanged).

**Adjacent fix folded in:** number-chord hotkeys (1–5) currently use registry order while
badges number the *displayed* (re-orderable) cluster order. After a manual reorder, "3"
opens the wrong type. Chords will follow the same visible order the badges show (hidden
types skipped).

### Acceptance

- On `https://www.example.com/contactus.html`: site icon shows a domain fragment with
  tooltip `example.com`; page icon shows a path fragment with tooltip `/contactus.html`;
  global icon is a globe; daily icon shows today's day number.
- After reordering icons, pressing the number shown on a badge opens that badge's note.

---

## 6. Feature — Outliner overhaul (global named library + full suite)

### Storage model (read-time adaptation, no migration pass)

`stickysites_outlines_v1` stays a **flat map** (Drive-sync `getNewestTimestamp` compatible),
but entries become named documents:

```
ol_<id> → { name, items, createdAt, updatedAt }
```

- Legacy hostname-keyed records are read-time adapted: `name` defaults to the map key.
  They are rewritten under the same key on next save (no key churn), gaining a `name`.
- The **last-active outline id** is stored in `stickysites_prefs_v1`
  (`activeOutlineId`).
- The popout passes an explicit outline id via the existing `key` URL param.
- Node shape gains optional fields: `{ id, text, children, collapsed, note, done, tags }`
  (all optional, normalized on read).

### New module `src/content/outline.js`

Registered in `manifest.json` and `popout.html` before panel.js, exposing
`window.StickySites.Outline` (same pattern as todo.js). panel.js `_renderOutline`
delegates to it. Pure tree operations (insert/move/indent/outdent/zoom/filter/group/
export/auto-tag/normalize) are written importable-with-stubbed-`window` so vitest covers
them.

### Capabilities

1. **Document switcher** (panel header area): dropdown listing all outlines +
   New / Rename / Delete / Duplicate ("Save As"). Auto-save remains implicit (500 ms
   debounce).
2. **Keyboard power editing**: ↑/↓ traverse visible rows; Alt+↑/↓ move node (with
   subtree) among siblings; Enter inserts a sibling below with correct focus (fixes the
   existing "focus any empty input" bug); Backspace on an empty node deletes it (children
   promoted) and focuses the previous row; Tab/Shift+Tab keep focus on the moved node.
3. **Zoom & collapse**: clicking a bullet zooms/hoists into that node (Workflowy-style)
   with a breadcrumb to zoom back out; the chevron still collapses; Collapse All /
   Expand All buttons.
4. **Node extras**: per-node notes (toggleable, todo-style); per-node checkbox complete
   state with strikethrough; tree-aware drag-to-reorder (drop as sibling of target;
   subtree moves along).
5. **Search & filter**: filter box shows matching nodes plus their ancestors; matches on
   text and tags.
6. **Export**: current outline as **Markdown** (indented bullets) and **OPML**, downloaded
   as a file.
7. **Auto-tagging**: `#tag` tokens typed in node text become tag chips automatically;
   chips removable; filter matches tags.
8. **Auto-group ("conceptual sort")**: an optional action in a ⋯ menu that reorganizes the
   top-level flat list into a hierarchy. Heuristic, in priority order: (a) nodes sharing a
   tag are grouped under a parent named after that tag (a node's first tag wins if it has
   several); (b) remaining nodes sharing a significant keyword — lowercase word > 3 chars,
   not a stopword, occurring in ≥ 2 nodes — are grouped under that keyword; (c) the rest go
   under "Other". Groups of one are left ungrouped. Pure local heuristic (no network/LLM).
   One-click Undo restores the pre-group snapshot exactly.

### Clip integration

- "Add to Outline" context menu appends to the **active** outline.
- Adjacent data-loss fix: the clip handler currently drops `sections`/`tagColors` when
  clipping to the todo list — preserve all existing record fields.

### Acceptance

- Create two outlines, switch between them from any site, rename and delete one.
- Pre-existing site outline still opens with its content, named by hostname.
- Enter/Tab/Shift+Tab/Alt+arrows behave with stable focus; zoom in/out via bullet +
  breadcrumb; filter and exports produce correct output; `#tags` chip automatically;
  auto-group produces a sane hierarchy and Undo restores exactly.

---

## 7. Tests & verification

- **Unit (vitest)**: outline tree ops imported from `src/content/outline.js` with stubbed
  `window`; notes-storage tests updated to canonical schema; existing crypto tests
  untouched.
- **Live (Chrome DevTools MCP, unpacked extension)**: reproduce flicker and page-bleed
  before the fix; confirm both gone after; click through outliner flows (switcher, zoom,
  keyboard, export); verify icons on a real site.

---

## 8. Versioning & docs

- `manifest.json` 1.9.0 → **1.10.0**.
- CLAUDE.md updated: version, outliner storage model/feature list, icon behavior,
  new content-script load order, canonical record schema, syncFromStorage guards.
- docs/ updated where they describe the outliner, popup, or storage schema.

## 9. Non-goals

- No un-mixing of already-contaminated page-note records.
- No date auto-insertion into the daily note body.
- No framework/bundler; everything stays vanilla JS, classic content scripts.
- No change to popup Quick-Open labels.
