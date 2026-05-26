# Phase 1: Floating Notes Overhaul

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Floating draggable cluster, page-level notes, workspace panel, modular refactor

## Summary

Replace the opaque fixed sidebar with a floating draggable icon cluster. Add a
third note type (page-level, blue). Render notes in a larger workspace panel
(~450px) in the bottom-right corner. Refactor the monolithic content script into
focused modules using a namespace pattern.

## Decisions

| Decision | Choice | Alternatives considered |
|----------|--------|------------------------|
| Icon grouping | Draggable cluster (vertical pill) | Independent floaters, expandable FAB |
| Panel position | Fixed bottom-right (default) | Anchored-to-cluster, center modal (available as settings) |
| Panel size | Larger workspace (~450px wide) | Compact card (~360px) |
| Page note URL matching | Origin + pathname (strip query params + hash) | Exact URL, user-editable pattern |
| Cluster extensibility | Extensible icon registry from day one | Fixed at 3 icons |
| Module system | Namespace pattern (`window.StickySites`) | Bundler, single IIFE |

## Architecture

Three-layer structure retained (service worker, content script, shared module)
with a modular refactor of the content script.

### Modules

- **Icon Registry** (`note-types.js`) — array of note-type definitions. Each entry:
  `{ id, color, label, emoji, storageKey, getKey(location) }`. Phase 1 ships with
  3 entries: `global`, `site`, `page`.
- **Cluster Manager** (`cluster.js`) — renders the floating pill, handles drag with
  position persistence, dispatches click to the correct note type.
- **Panel Manager** (`panel.js`) — renders the workspace panel, populates it based
  on which icon was clicked. Handles header, textarea, action buttons, tags, footer.
- **Preferences** (`prefs.js`) — read/write cluster position and panel mode setting.
- **Orchestrator** (`sticky-inject.js`) — init guard, wires cluster + panel +
  cross-tab sync + toggle message listener.

### File structure

```
src/
  content/
    note-types.js          # Icon registry
    cluster.js             # Cluster rendering, drag logic, click dispatch
    panel.js               # Panel rendering, textarea, header, footer, actions
    prefs.js               # Read/write cluster position + panel mode
    sticky-inject.js       # Orchestrator: init guard, wiring, sync
    sticky-inject.css      # Updated styles (floating cluster, workspace panel)
  background/
    service-worker.js      # Unchanged — sends STICKYSITES_TOGGLE
  shared/
    notes-storage.js       # Extended with page-note CRUD
```

### Manifest content_scripts change

```json
"js": [
  "src/content/note-types.js",
  "src/content/prefs.js",
  "src/content/cluster.js",
  "src/content/panel.js",
  "src/content/sticky-inject.js"
]
```

Files load sequentially into the same isolated world and communicate via
`window.StickySites` namespace.

## Storage Schema

Existing keys are untouched (backward compatible). New keys are additive.

| Key | Shape | Scope |
|-----|-------|-------|
| `stickysites_global_v1` | `{ body, updatedAt }` | One note, everywhere (existing) |
| `stickysites_sites_v1` | `{ [domain]: SiteNote }` | One note per domain (existing) |
| `stickysites_pages_v1` | `{ [origin+pathname]: PageNote }` | One note per page URL (new) |
| `stickysites_prefs_v1` | `{ clusterPosition, panelMode }` | User preferences (new) |

**SiteNote:** `{ siteKey, siteLabel, body, tags[], createdAt, updatedAt }`

**PageNote:** `{ pageKey, pageLabel, body, tags[], createdAt, updatedAt }` — same
shape as SiteNote. `pageKey` is `origin + pathname` with query params and hash
stripped.

**Preferences:**
- `clusterPosition`: `{ x: number | null, y: number | null }` — null means
  default (top-right, 20px from edges). Persisted on drag end.
- `panelMode`: `"fixed"` (default) | `"anchored"` | `"modal"`

## UI Behavior

### Floating Cluster

- Vertical pill with rounded ends, semi-transparent dark background, backdrop blur
- Default position: top-right corner (20px from edges)
- Drag: mousedown on pill background starts drag, mousemove repositions, mouseup
  saves to `stickysites_prefs_v1`. Position is clamped to viewport bounds so the
  cluster can never be dragged off-screen.
- One global cluster position (not per-domain)
- Active icon: white outline ring. Click active icon again to close panel (toggle).

### Note Panel (Larger Workspace)

- Default: fixed bottom-right corner, 20px from edges
- Size: ~450px wide, min(400px, 50vh) tall
- Configurable: `panelMode` setting for anchored-to-cluster or center modal
- Sections top-to-bottom:
  1. **Header** — colored tint by note type, label + scope info, close button
  2. **Action buttons** — Copy to clipboard (Phase 1 only; markdown + file save
     slots reserved for later phases)
  3. **Textarea** — monospace, fills remaining space, 500ms debounce auto-save
  4. **Footer** — tag input, character count, last-saved timestamp

### Toolbar Icon

Same as current: toggles cluster visibility. If cluster is hidden, panel closes too.

### Cross-tab Sync

Same `chrome.storage.onChanged` mechanism. Extended to watch
`stickysites_pages_v1` in addition to the existing two keys.

## Page Note URL Matching

`getKey(location)` for the page note type returns `location.origin + location.pathname`.

Examples:
- `https://facebook.com/john.doe` → `https://facebook.com/john.doe`
- `https://amazon.com/dp/B09V3KXJPB?ref=nav` → `https://amazon.com/dp/B09V3KXJPB`
- `https://docs.google.com/doc/d/abc#h=xyz` → `https://docs.google.com/doc/d/abc`

## Migration

- Existing storage keys untouched — no version bump needed
- New keys start empty and populate on first use
- Old `sticky-inject.js` IIFE replaced entirely (not patched)
- Inline storage helpers removed; all storage logic in `notes-storage.js` (shared
  module) and duplicated in thin form within content script namespace

## Out of Scope (Later Phases)

| Feature | Phase |
|---------|-------|
| All-notes view (popup with search/sort/filter) | 2 |
| Copy as Markdown, Save to file buttons | 2 |
| Rich text editing (bold, fonts, bullets, checkboxes) | 3 |
| To-do list icon | 4 |
| Outliner icon | 4 |
| Export to Google Docs / Apple Notes | 5 |
