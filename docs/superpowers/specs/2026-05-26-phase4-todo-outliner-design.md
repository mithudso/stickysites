# Phase 4: To-Do List and Outliner

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Two new note types — to-do list (purple) and outliner (orange) — with structured JSON storage and custom panel renderers

## Summary

Add a 4th (purple to-do list) and 5th (orange outliner) icon to the floating
cluster. Both use structured JSON storage rather than HTML, with custom panel
renderers that replace the rich text editor when active.

## Decisions

| Decision | Choice |
|----------|--------|
| Todo color | #a78bfa (purple/violet) |
| Outliner color | #fb923c (orange) |
| Storage | Structured JSON (items array / tree) |
| Scope | Per-domain (like site notes) |

## New Storage Keys

| Key | Shape |
|-----|-------|
| stickysites_todos_v1 | { [domain]: { siteKey, items: [{id, text, done}], createdAt, updatedAt } } |
| stickysites_outlines_v1 | { [domain]: { siteKey, items: [{id, text, children: [...], collapsed}], createdAt, updatedAt } } |

Both scoped per-domain (same as site notes) since todos and outlines are
typically context-specific.

## Icon Registry Additions

Two new entries in note-types.js:

- id: todo, color: #a78bfa, cssClass: is-purple, emoji: checkmark, storagePattern: structured
- id: outline, color: #fb923c, cssClass: is-orange, emoji: outline icon, storagePattern: structured

## Panel Rendering

When panel.js receives a note type with storagePattern: structured, it skips
the rich text editor and toolbar. Instead it renders a custom UI:

### Todo List
- Each item: checkbox + text input + delete button
- Add item button at bottom
- Completion count in footer (e.g. "3/7 done")
- Enter key in text input adds new item below
- Empty items auto-delete on blur
- Items can be reordered by drag (stretch goal — skip if complex)

### Outliner
- Each node: bullet + text input + indent/outdent buttons
- Add node button at bottom
- Enter key adds sibling node below
- Tab indents, Shift+Tab outdents
- Click bullet to collapse/expand children
- Depth indicated by left padding (20px per level)

## CSS Additions

- .is-purple { background: #a78bfa; color: #3b0764; }
- .is-orange { background: #fb923c; color: #431407; }
- Todo item styles: checkbox, text input, delete button
- Outliner node styles: bullet, indentation, collapse indicator

## Popup.js Updates

- Load todos and outlines from storage
- Display in grouped list with purple/orange borders
- Subject: first item text (todo) or first root node text (outline)
- Preview: next few items as comma-separated text

## Files to Modify

| File | Change |
|------|--------|
| src/content/note-types.js | Add todo and outline entries |
| src/content/panel.js | Add structured renderers for todo and outline |
| src/content/sticky-inject.css | Add purple/orange styles, todo/outline UI styles |
| src/shared/notes-storage.js | Add todo and outline CRUD functions |
| popup.js | Load and display todo/outline notes |
| manifest.json | Bump to v1.4.0 |

## Out of Scope

| Feature | Phase |
|---------|-------|
| Drag-to-reorder todo items | Future |
| Export to Google Docs / Apple Notes | 5 |
