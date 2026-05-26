# Phase 5A: Context Menu and Chord Hotkeys

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Right-click context menu for clipping text to notes, chord hotkey system for opening note types

## Summary

Add a right-click context menu with 5 items for clipping highlighted text into
each note type. Add a chord hotkey system: Alt+S activates the cluster, then
1-5 opens a specific note type, A cycles through all. Number badges appear
briefly on the cluster icons as a teaching hint.

## Context Menu

### Menu structure

Parent menu: "StickySites" (created with contextMenus API)
Child items:
- "Add to Global note" (id: clip-global)
- "Add to Site note" (id: clip-site)
- "Add to Page note" (id: clip-page)
- "Add to To-do list" (id: clip-todo)
- "Add to Outline" (id: clip-outline)

Context: "selection" (only appears when text is highlighted)

### Permissions

Add "contextMenus" to manifest permissions array.

### Service worker changes

Create menus on install via chrome.runtime.onInstalled. On menu click,
send message to the active tab's content script:
{ type: 'STICKYSITES_CLIP', noteTypeId: string, text: string }

The service worker gets the selected text from info.selectionText in the
contextMenus.onClicked callback.

### Content script handling

The orchestrator receives STICKYSITES_CLIP and dispatches based on noteTypeId:

For text note types (global, site, page):
- Read the current note
- Append the clipped text with a blank line separator
- For rich text notes, wrap in a paragraph tag
- Save

For todo:
- Read the current todo list
- Add a new item { id, text: clippedText, done: false }
- Save

For outline:
- Read the current outline
- Add a new root node { id, text: clippedText, children: [], collapsed: false }
- Save

### Toast notification

After clipping, show a small toast in the bottom-left corner:
"Added to [note type] ✓"
Auto-dismiss after 2 seconds. CSS-animated fade in/out.

Toast element: div#stickysites-toast, appended to documentElement.

## Chord Hotkeys

### Key mappings

| Chord | Action |
|-------|--------|
| Alt+S | Toggle cluster visibility (existing) |
| 1 (when cluster visible) | Open Global note |
| 2 (when cluster visible) | Open Site note |
| 3 (when cluster visible) | Open Page note |
| 4 (when cluster visible) | Open To-do list |
| 5 (when cluster visible) | Open Outliner |
| A (when cluster visible) | Cycle through all note types |

### Implementation

Add a keydown listener in the orchestrator (sticky-inject.js) that checks:
1. Is the cluster visible? (not hidden)
2. Is the active element NOT an input/textarea/contenteditable? (prevent
   interference with typing)
3. Is the key 1-5 or A?

If all conditions met, open the corresponding note type.

For "A" (open all): cycle through note types. Each press of A advances to the
next type. Wraps around after the last type.

### Number badges

When the cluster becomes visible (either via Alt+S or on page load), show
small number badges (1-5) next to each icon. Badges fade out after 3 seconds.

Badge element: span.stickysites-cluster-badge, positioned absolute relative
to each icon button. Contains the number "1" through "5".

CSS: small circle, 12px, positioned top-right of each icon, semi-transparent
background, fades out via opacity transition.

## Files to modify

| File | Change |
|------|--------|
| manifest.json | Add "contextMenus" permission, bump to v1.5.0 |
| src/background/service-worker.js | Create context menus, handle clicks |
| src/content/sticky-inject.js | Handle STICKYSITES_CLIP, add chord keydown listener, toast, badges |
| src/content/sticky-inject.css | Toast styles, badge styles |

## Out of Scope

| Feature | Phase |
|---------|-------|
| Encryption at rest | 5B |
| Sync (Chrome sync + Google Drive) | 5C |
| Export to Google Docs / Apple Notes | Future |
