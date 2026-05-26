# Phase 2: All-Notes Popup, Exports, and Icon

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Extension icon, browser action popup with search/sort/filter, copy-as-markdown, save-to-file, subject line convention, cluster toggle shortcut

## Summary

Replace the extension toolbar icon with a 📝 emoji PNG. Change the toolbar click
to open a browser action popup showing all notes in a unified grouped list with
search, sort, type filtering, and tag filtering. Add per-note and bulk markdown
export. Move the cluster toggle to a keyboard shortcut (Alt+S) and a button in
the popup header.

## Decisions

| Decision | Choice | Alternatives considered |
|----------|--------|------------------------|
| All-notes location | Browser action popup | New tab page, inject into page |
| Note organization | Unified list grouped by type | Mixed list with badges, tabbed by type |
| Cluster toggle | Alt+S shortcut + popup header button | Shortcut only, popup toggle only |
| Export format | Markdown (.md) | Plain text, both .md and .txt |
| Subject line | First line of body (display convention) | Separate subject field in schema |

## New Files

| File | Purpose |
|------|---------|
| `popup.html` | HTML shell for the browser action popup |
| `popup.css` | Dark theme styles for the popup |
| `popup.js` | Reads all notes, renders grouped list, search/sort/filter/tags, export |
| `scripts/generate-icons.js` | Node script to render 📝 emoji to 16/48/128px PNGs |

## Modified Files

| File | Change |
|------|--------|
| `manifest.json` | Add `default_popup`, add `commands` for keyboard shortcut, bump to v1.2.0 |
| `src/background/service-worker.js` | Replace `action.onClicked` with `commands.onCommand` for toggle |
| `icons/icon16.png`, `icon48.png`, `icon128.png` | Replaced with 📝 emoji PNGs |

## Extension Icon

Generate PNG icons with the 📝 emoji on a transparent background at 16, 48,
and 128px. Use a Node script (`scripts/generate-icons.js`) that draws to an
OffscreenCanvas (via the `canvas` npm package) and writes the PNGs.

Run once: `node scripts/generate-icons.js`

## Manifest Changes

```json
{
  "version": "1.2.0",
  "action": {
    "default_icon": "icons/icon48.png",
    "default_title": "StickySites",
    "default_popup": "popup.html"
  },
  "commands": {
    "toggle-cluster": {
      "suggested_key": { "default": "Alt+S" },
      "description": "Toggle StickySites cluster visibility"
    }
  }
}
```

## Service Worker Changes

Remove the `chrome.action.onClicked` listener. Add:

```js
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-cluster') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE' });
      } catch { /* content script not injected */ }
    }
  }
});
```

## Toolbar Behavior Change

- **Before:** Clicking toolbar icon sends `STICKYSITES_TOGGLE` to toggle cluster.
- **After:** Clicking toolbar icon opens the all-notes popup. Cluster toggle via
  Alt+S shortcut or "Hide/Show cluster" button in the popup header.

## Subject Line Convention

The first line of any note body is treated as the subject/title. This is a
display convention with no schema changes:

- **Workspace panel:** No change — still a single textarea. First line naturally
  becomes the subject.
- **All-notes popup:** Each note card shows the first line as a bold title and
  lines 2+ as a truncated preview (2-line clamp with ellipsis).
- **Markdown export:** First line becomes an `# H1` heading.
- **Empty notes:** Card shows the note's label (e.g., "Site note — github.com")
  as the title.

Extraction logic:

```js
function getSubject(body, fallbackLabel) {
  if (!body || !body.trim()) return fallbackLabel;
  const firstLine = body.split('\n')[0].trim();
  return firstLine || fallbackLabel;
}

function getPreview(body) {
  if (!body) return '';
  const lines = body.split('\n');
  return lines.slice(1).join('\n').trim();
}
```

## All-Notes Popup

### Data flow

1. Popup opens → `popup.js` reads all three storage keys
2. Flattens into a unified array, each entry tagged with type and color metadata
3. Groups by type: Global → Site Notes → Page Notes
4. Renders as scrollable card list

### Note card contents

- **Subject** (bold) — first line of body, or fallback label
- **Preview** (muted) — lines 2+, 2-line clamp with ellipsis
- **Source** — domain or path depending on type
- **Timestamps** — "Modified [relative time]" and "Created [date]"
- **Tags** — tag pills at bottom-right
- **Left border** — colored by type (yellow/green/blue)

### Search

Text input at top. Filters across subject + body. Case-insensitive substring
match. Filters in real-time as user types (no debounce needed — small dataset).

### Sort

Dropdown or button: Recent (modified desc, default), Oldest (modified asc),
Alphabetical (subject A-Z). Sort applies within each group section.

### Type filter

Pill buttons: All | Global | Sites | Pages. Selecting a type hides the other
sections. "All" shows all sections.

### Tag filter

Tags are collected from all visible notes and displayed as clickable pills below
the search bar. Clicking a tag filters to only notes containing that tag.
Clicking again removes the filter. Multiple tags = AND filter (note must have
all selected tags).

### Actions per note card

- **Click card** — if the note matches the current tab (global notes always match;
  site notes match when the current tab's domain matches; page notes match when
  the current tab's URL matches), sends message to active tab to open that note
  in the workspace panel. Message: `{ type: 'STICKYSITES_OPEN', noteTypeId }`.
  Cards that don't match the current tab are visually dimmed and not clickable
  (copy/save still work).
- **Copy button** (📋 icon) — copies note body to clipboard
- **Save button** (💾 icon) — downloads as `.md` file

### Bulk actions

- **"Save all as .md"** button in footer — downloads all notes as a single
  markdown file with type section headers

### Cluster toggle

- "Hide/Show cluster" button in popup header
- Sends `STICKYSITES_TOGGLE` message to active tab via
  `chrome.tabs.sendMessage`

## Export Formats

### Single note → .md

```markdown
# Subject (first line)

Body text (remaining lines)

---
Tags: #meeting #q3
Source: site — github.com
Created: 2026-05-20 14:30
Modified: 2026-05-26 09:15
```

### All notes → .md

```markdown
# StickySites Export

Exported: 2026-05-26 10:30

## Global Notes

### Quick reference links

Body text...

---
Tags: #reference
Created: 2026-05-20 14:30
Modified: 2026-05-26 09:15

## Site Notes

### Meeting notes for Acme Corp

*salesforce.com*

Body text...

---
Tags: #meeting #q3
Created: 2026-05-22 10:00
Modified: 2026-05-25 16:45

## Page Notes

### John Doe profile notes

*facebook.com/john.doe*

Body text...

---
Tags: #contact
Created: 2026-05-24 11:20
Modified: 2026-05-26 05:10
```

### Download mechanism

Uses blob URL + programmatic anchor click. No `downloads` permission needed:

```js
function downloadMarkdown(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

## Content Script Changes

The orchestrator (`sticky-inject.js`) needs a new message handler for
`STICKYSITES_OPEN`:

```js
chrome.runtime.onMessage.addListener(function (msg) {
  if (msg?.type === 'STICKYSITES_TOGGLE') {
    SS.Cluster.toggle();
    if (SS.Cluster.hidden) SS.Panel.close();
  }
  if (msg?.type === 'STICKYSITES_OPEN') {
    var noteType = null;
    for (var i = 0; i < noteTypes.length; i++) {
      if (noteTypes[i].id === msg.noteTypeId) { noteType = noteTypes[i]; break; }
    }
    if (noteType) {
      if (SS.Cluster.hidden) SS.Cluster.toggle();
      SS.Cluster.setActive(noteType.id);
      SS.Panel.open(noteType);
    }
  }
});
```

## Out of Scope (Later Phases)

| Feature | Phase |
|---------|-------|
| Rich text editing (bold, fonts, bullets, checkboxes) | 3 |
| To-do list icon | 4 |
| Outliner icon | 4 |
| Export to Google Docs / Apple Notes | 5 |
