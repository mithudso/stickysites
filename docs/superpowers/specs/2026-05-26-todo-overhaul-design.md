# To-Do List Overhaul — Design Spec

## Summary

Upgrade the flat to-do list into a full-featured task manager with sections,
indentation, priorities, color-coded tags, expandable notes, drag-to-reorder,
search/sort/filter, and a collapsible Completed section.

## Data Model

### Item shape (expanded from `{ id, text, done }`)

```js
{
  id: string,           // unique ID (unchanged)
  text: string,         // task text (unchanged)
  done: boolean,        // completion state (unchanged)
  indent: number,       // 0-3 nesting depth (Tab/Shift-Tab)
  priority: number,     // 1-5 (0 = unset)
  color: string,        // hex color code or '' for none
  tags: string[],       // e.g. ['work', 'urgent']
  note: string,         // markdown-ish expandable note (plain text stored)
  section: string,      // section ID this item belongs to ('' = unsectioned)
  completedAt: string   // ISO timestamp when marked done
}
```

### List-level structure

```js
{
  sections: [
    { id: string, name: string, collapsed: boolean }
  ],
  items: [ ... ],       // flat array, ordered by display position
  tagColors: {          // tag → color associations
    'work': '#60a5fa',
    'urgent': '#f87171'
  }
}
```

### Backward compatibility

Old items without the new fields get defaults on read:
`indent: 0, priority: 0, color: '', tags: [], note: '', section: '', completedAt: ''`.
Old records without `sections` or `tagColors` default to `[]` and `{}`.

The storage key `stickysites_todos_v1` is unchanged. The data shape expands
but the key and pattern (`structured`, map by hostname) stay the same.

## UI Layout

### Panel structure

```
┌─────────────────────────────────────────┐
│ ✓ To-do — github.com        ⧉  ⤢  ✕   │  header
├─────────────────────────────────────────┤
│ 🔍 Search...  │ Sort ▾ │ Filter ▾      │  toolbar
├─────────────────────────────────────────┤
│ ▾ Work                        + Add   ⋯ │  section header
│   ⠿ ☐ ● Build login page  P2  #work   │  item row
│     ⠿ ☐ ● Design mockup   P3          │  indented child
│   ⠿ ☐   Fix deploy bug    P1  #urgent │  no color dot
├─────────────────────────────────────────┤
│ ▾ Personal                    + Add   ⋯ │  section header
│   ⠿ ☐   Buy groceries                  │
├─────────────────────────────────────────┤
│ ▸ Completed (3)                         │  collapsed by default
├─────────────────────────────────────────┤
│ + Add task   + Add section              │  bottom actions
├─────────────────────────────────────────┤
│ 5/8 done                    Saved 3:42p │  footer
└─────────────────────────────────────────┘
```

### Toolbar

- **Search** — text input that filters items in real-time by text, tags, or
  note content. Items not matching are hidden; sections with no visible items
  are hidden.
- **Sort dropdown** — Manual (default, preserves drag order), Priority (P1
  first), Alphabetical, Date added (oldest first).
- **Filter dropdown** — checkboxes grouped by: priority (1-5), tag (with
  color dots), color. Multiple filters combine with AND. "Clear filters"
  button at the bottom.

### Section headers

- Click chevron (▾/▸) to collapse/expand the section body.
- "+" button adds an item directly to that section.
- "⋯" overflow menu: Rename, Delete (moves items to unsectioned), Group by
  priority, Group by tag.
- Unsectioned items appear above the first named section (no header row).

### Item row elements (left to right)

1. **Drag handle** (`⠿`) — visible on hover, mousedown starts drag
2. **Checkbox** — toggles done state
3. **Color dot** — small colored circle; click opens 8-color palette popover
   (+ clear option). Hidden when no color set; appears as subtle outline on hover.
4. **Text input** — inline editable task text
5. **Note indicator** (`📝`) — shown when `note` is non-empty
6. **Priority badge** (`P1`–`P5`) — click to cycle 0→1→2→3→4→5→0. Color-coded:
   P1 red, P2 orange, P3 yellow, P4 blue, P5 gray.
7. **Tag chips** — small colored pills showing each tag. Click chip to remove.
   "+" chip to add a new tag (inline input).
8. **Delete button** (`×`) — visible on hover

### Completed section

- Always at the bottom, below all named sections.
- Collapsed by default (▸). Click chevron to expand.
- Shows count in the header: "Completed (N)".
- When an item's checkbox is checked: item moves to Completed, `completedAt`
  is set to current ISO timestamp.
- When an item in Completed is unchecked: item moves back to its original
  `section` (or unsectioned if the section was deleted).
- Items in Completed are sorted by `completedAt` descending (most recent first).

### Expanded note (double-click)

- Double-clicking item text toggles a note area below the item row.
- The note area is a `textarea` with placeholder "Add notes...".
- On blur, basic markdown renders inline:
  - `**bold**` → bold
  - `*italic*` → italic
  - `[text](url)` → clickable link
  - `- item` at line start → bullet list
- On focus/click, switches back to editable plain text.
- A small `📝` icon appears next to items that have non-empty notes.

## Keyboard Shortcuts

All shortcuts apply while an item's text input is focused:

| Key | Action |
|-----|--------|
| Enter | Create new item below, same section and indent level |
| Backspace (empty) | Delete item, focus previous item |
| Tab | Indent one level (max 3) |
| Shift+Tab | Outdent one level (min 0) |
| Escape | Blur the input |

Tab/Shift-Tab are intercepted with `e.preventDefault()` to avoid browser
focus change. Indentation is visual (padding-left) and stored in `indent`.

## Drag-to-Reorder

- A grip handle (`⠿`) appears on the left of each item row on hover.
- `mousedown` on the grip: item gets `opacity: 0.5`, a 2px horizontal line
  indicator appears at potential drop positions.
- `mousemove` on `document`: drop indicator follows the cursor vertically,
  snapping to between-item positions.
- Items can be dropped:
  - Within the same section (reorder)
  - Between sections (move to new section, updates `item.section`)
  - Onto a section header (places item at top of that section)
- Dropping into the Completed section is blocked (items move there via checkbox only).
- `mouseup`: item moves to the new position in the `items` array, save fires.
- Indentation is preserved during drag.

## Tag & Color System

### Color palette

8 preset colors for both items and tags:
`#f87171` (red), `#fb923c` (orange), `#fbbf24` (yellow), `#34d399` (green),
`#60a5fa` (blue), `#a78bfa` (purple), `#f472b6` (pink), `#94a3b8` (gray).

### Color dot behavior

- Click the color dot area to open a palette popover (8 swatches + "clear"
  option).
- Selecting a color sets `item.color` and saves.
- The color dot is a small filled circle (8px) to the left of the text.

### Tag behavior

- Tags are stored as an array of lowercase strings on each item.
- Tag chips appear after the text, styled as small pills.
- Click "+" chip → inline text input appears, type tag name, Enter to confirm.
- Click an existing tag chip → removes it from the item.
- When a tag is first created on an item that has a color, that color is
  stored in `tagColors[tagName]` at the list level.
- Tags render in their associated color everywhere (chips, filter dropdown).
- Tags without an associated color render in default gray.

### Auto-grouping

Available from the section "⋯" menu or a future toolbar toggle:
- **Group by priority** — creates virtual P1–P5 sections. Items return to
  original sections when toggled off.
- **Group by tag** — creates one virtual section per tag. Untagged items
  appear in an "Other" section. Multi-tagged items appear in the first tag's
  section.
- Auto-grouping is a view-only toggle stored in component state (not persisted).
  It doesn't modify the underlying `items` or `sections` data.

## Scope

### Files modified

- `src/content/panel.js` — rewrite `_renderTodo` method (bulk of the work).
  The method will be significantly larger; consider extracting helper functions
  within the same IIFE closure for readability.
- `src/content/sticky-inject.css` — new styles for: sections, indentation
  levels, drag ghost/indicator, note expansion, tag chips, priority badges,
  color dot/palette, toolbar, completed section.

### No new files

All changes are within the existing panel rendering and CSS. No new content
scripts or shared modules needed.

### What stays the same

- Storage key and pattern (`stickysites_todos_v1`, structured, map by hostname)
- Encryption/decryption flow (same `_writeStructured` path)
- Drive sync (same mechanism, larger JSON payloads)
- Context menu clipping (adds items with default values for new fields)
- Debounced auto-save at 500ms
- Panel header, drag, resize, expand/shrink (existing panel chrome)

## Error Handling

- Malformed items (missing `id` or `text`) are silently dropped on read.
- Unknown `section` IDs on items are treated as unsectioned.
- Tag color lookups that miss return default gray.
- All DOM operations are synchronous within `renderList()`; save is async
  but failure is silent (existing pattern).
