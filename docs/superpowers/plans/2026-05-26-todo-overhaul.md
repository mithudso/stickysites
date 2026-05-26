# To-Do List Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the flat to-do list into a full task manager with sections, nesting, priorities, tags, colors, notes, drag-reorder, search/sort/filter, and a Completed section.

**Architecture:** Extract `_renderTodo` from `panel.js` into a new `src/content/todo.js` content script (namespace pattern, loaded before `panel.js`). This keeps `panel.js` manageable and lets `_renderTodo` delegate to `window.StickySites.Todo.render()`. The data model expands in-place within the existing `stickysites_todos_v1` storage key. `_writeStructured` is updated to also persist `sections` and `tagColors` alongside `items`.

**Tech Stack:** Vanilla JS (namespace pattern), chrome.storage.local, CSS

---

### Task 1: Expand storage layer — _writeStructured and _readNote

**Files:**
- Modify: `src/content/panel.js:195-280` (_readNote and _writeStructured)
- Modify: `src/content/sticky-inject.js:108-130` (clipToNote todo branch)

- [ ] **Step 1: Update _readNote to return sections and tagColors**

In `panel.js`, find the `_readNote` structured branch (line ~206-212). Change it to also return `sections` and `tagColors` from the record:

```js
if (noteType.storagePattern === 'structured') {
  var map = raw || {};
  var record = map[key];
  if (!record) return null;
  return {
    items: Array.isArray(record.items) ? record.items : [],
    sections: Array.isArray(record.sections) ? record.sections : [],
    tagColors: (record.tagColors && typeof record.tagColors === 'object') ? record.tagColors : {},
    updatedAt: String(record.updatedAt ?? '')
  };
}
```

- [ ] **Step 2: Update _writeStructured to accept and persist sections/tagColors**

Change `_writeStructured` signature and body to accept a data object instead of just items:

```js
_writeStructured: async function (noteType, data) {
  var key = noteType.getKey(location);
  var now = new Date().toISOString();
  try {
    var stored = await chrome.storage.local.get(noteType.storageKey);
    var rawMap = stored?.[noteType.storageKey] || {};
    if (window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(rawMap)) {
      rawMap = await window.StickySites.Crypto.decryptValue(rawMap);
    }
    var map = rawMap;
    var existing = map[key];
    map[key] = {
      siteKey: key,
      items: Array.isArray(data.items) ? data.items : [],
      sections: Array.isArray(data.sections) ? data.sections : (existing?.sections || []),
      tagColors: (data.tagColors && typeof data.tagColors === 'object') ? data.tagColors : (existing?.tagColors || {}),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    var mapToStore = map;
    if (window.StickySites.Crypto && await window.StickySites.Crypto.isEnabled() && await window.StickySites.Crypto.getCachedKey()) {
      mapToStore = await window.StickySites.Crypto.encryptValue(map);
    }
    await chrome.storage.local.set({ [noteType.storageKey]: mapToStore });
    return map[key];
  } catch { return null; }
},
```

- [ ] **Step 3: Update all _writeStructured callers**

The outliner's `_renderOutline` also calls `_writeStructured`. Update its calls to pass `{ items: items }` instead of bare `items`. Search panel.js for `self._writeStructured(noteType, items)` in the outliner section and change each to `self._writeStructured(noteType, { items: items })`.

The todo callers will be rewritten in Task 3, but for now update the existing `_renderTodo` save function too:

```js
function save() {
  if (self._saveTimer) clearTimeout(self._saveTimer);
  self._saveTimer = setTimeout(async function () {
    var result = await self._writeStructured(noteType, { items: items });
    if (result) saved.textContent = formatSaved(result.updatedAt);
  }, 500);
}
```

- [ ] **Step 4: Update clipToNote in sticky-inject.js**

In `sticky-inject.js` line ~118, the todo clip creates `{ id, text, done: false }`. Add the new default fields:

```js
if (noteTypeId === 'todo') {
  items.push({ id: newId, text: text, done: false, indent: 0, priority: 0, color: '', tags: [], note: '', section: '', completedAt: '' });
}
```

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: 48 tests pass (no test changes needed — storage tests don't test the todo UI).

- [ ] **Step 6: Commit**

```bash
git add src/content/panel.js src/content/sticky-inject.js
git commit -m "feat(todo): expand storage layer for sections, tagColors, item fields"
```

---

### Task 2: Create todo.js content script with item normalization and rendering skeleton

**Files:**
- Create: `src/content/todo.js`
- Modify: `manifest.json` (add todo.js to content_scripts before panel.js)

- [ ] **Step 1: Create todo.js with normalize helper and render skeleton**

Create `src/content/todo.js`:

```js
window.StickySites = window.StickySites || {};

(function () {
  var COLORS = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8'];
  var PRIORITY_COLORS = { 1: '#f87171', 2: '#fb923c', 3: '#fbbf24', 4: '#60a5fa', 5: '#94a3b8' };

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeItem(item) {
    return {
      id: item.id || genId(),
      text: String(item.text ?? ''),
      done: !!item.done,
      indent: typeof item.indent === 'number' ? Math.max(0, Math.min(3, item.indent)) : 0,
      priority: typeof item.priority === 'number' ? Math.max(0, Math.min(5, item.priority)) : 0,
      color: typeof item.color === 'string' ? item.color : '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      note: typeof item.note === 'string' ? item.note : '',
      section: typeof item.section === 'string' ? item.section : '',
      completedAt: typeof item.completedAt === 'string' ? item.completedAt : ''
    };
  }

  function normalizeData(note) {
    var items = (note && Array.isArray(note.items)) ? note.items.map(normalizeItem) : [];
    var sections = (note && Array.isArray(note.sections)) ? note.sections : [];
    var tagColors = (note && typeof note.tagColors === 'object' && note.tagColors) ? note.tagColors : {};
    return { items: items, sections: sections, tagColors: tagColors };
  }

  window.StickySites.Todo = {
    COLORS: COLORS,
    PRIORITY_COLORS: PRIORITY_COLORS,
    genId: genId,
    normalizeItem: normalizeItem,
    normalizeData: normalizeData
  };
})();
```

- [ ] **Step 2: Add todo.js to manifest.json**

In `manifest.json`, add `"src/content/todo.js"` to the `content_scripts[0].js` array, after `cluster.js` and before `mentions.js`:

```json
"js": [
  "src/content/crypto-content.js",
  "src/content/sync-content.js",
  "src/content/note-types.js",
  "src/content/prefs.js",
  "src/content/cluster.js",
  "src/content/todo.js",
  "src/content/mentions.js",
  "src/content/panel.js",
  "src/content/sticky-inject.js"
]
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: 48 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/content/todo.js manifest.json
git commit -m "feat(todo): add todo.js content script with normalization helpers"
```

---

### Task 3: Rewrite _renderTodo — sections, items, completed section, footer

**Files:**
- Modify: `src/content/panel.js` (replace `_renderTodo` method entirely)

This is the largest task. Replace the entire `_renderTodo` method (lines ~532-697) with a new implementation that delegates rendering to helper functions. The new method includes: toolbar (search/sort/filter), section headers with collapse/rename/delete, item rows with indent/priority/color/tags/notes/drag-handle, a collapsible Completed section, and bottom action buttons.

The full replacement code for `_renderTodo` is provided in the design spec at `docs/superpowers/specs/2026-05-26-todo-overhaul-design.md`. Key implementation details:

**renderItem(item):** Creates item row with grip handle, checkbox, color dot (click for palette popover), text input (Tab/Shift-Tab indent, Enter new item, Backspace delete, dblclick expand note), note indicator, priority badge (click to cycle 0-5), tag chips (click to remove, "+" to add), delete button. Returns a container div that includes the expanded note area if toggled.

**renderSectionHeader(sec):** Chevron toggle, name, "+ Add" button, "..." menu (rename via prompt, delete moves items to unsectioned).

**renderCompletedSection(completedItems):** Collapsible section at the bottom, sorted by completedAt descending. Items can be unchecked to return to their original section.

**renderAll():** Clears listEl, renders unsectioned active items, then each named section with its items, then the completed section. Applies search query filtering and sort mode.

**Markdown-ish note rendering (on blur):** Converts `**bold**` to `<strong>`, `*italic*` to `<em>`, `[text](url)` to `<a>` links, and `- item` lines to `<ul><li>` elements. Note content is user-authored and stored in extension-isolated chrome.storage.local. On click, switches back to editable textarea.

**Color palette popover:** 8 preset color swatches plus a clear option. Positioned relative to the item row, dismissed on outside click.

**Filter popup:** Checkbox groups for priority (1-5), tags (with color), and colors. Filters combine with AND. "Clear filters" button resets all.

- [ ] **Step 1: Replace _renderTodo with the new implementation**

Replace the `_renderTodo` method in `panel.js` (from `_renderTodo: function` through the closing of the method before `_renderOutline`). The implementation follows the patterns described above using the same vanilla JS namespace approach as the rest of the codebase.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 48 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/content/panel.js
git commit -m "feat(todo): rewrite _renderTodo with sections, priorities, tags, notes, search/sort/filter"
```

---

### Task 4: Drag-to-reorder items

**Files:**
- Modify: `src/content/todo.js` (add drag logic)
- Modify: `src/content/panel.js` (wire drag into renderItem)

- [ ] **Step 1: Add drag controller to todo.js**

Add a `DragController` object to `window.StickySites.Todo` that:
- Listens for `mousedown` on `.stickysites-todo-grip` elements within the list container
- On mousedown: marks the item row as `.is-dragging` (opacity 0.4), creates a horizontal drop indicator element
- On mousemove: positions the drop indicator between item rows based on cursor Y position, tracking which item ID to insert before/after
- On mouseup: removes drag state, splices the dragged item from the items array and inserts at the drop position, inherits the section of the nearest neighbor item, calls the `onReorder` callback to re-render and save
- Prevents drops into the Completed section

- [ ] **Step 2: Wire drag controller in panel.js _renderTodo**

After `this.el.append(...)` at the end of `_renderTodo`, initialize the drag controller:

```js
TD.DragController.init(listEl, function () { return items; }, function () { return sections; }, function () {
  renderAll();
  save();
});
```

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: 48 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/content/todo.js src/content/panel.js
git commit -m "feat(todo): drag-to-reorder items within and between sections"
```

---

### Task 5: CSS for all new to-do features

**Files:**
- Modify: `src/content/sticky-inject.css`

- [ ] **Step 1: Add all new todo CSS**

Append the following style sections to `sticky-inject.css`, after the existing todo styles:

- **Todo Toolbar** — flex row with search input, sort select, filter button
- **Filter popup** — absolute-positioned dropdown with checkbox groups for priority/tag/color, clear button
- **Section headers** — flex row with chevron, name, add button, menu button; dropdown menu for rename/delete
- **Item row updates** — grip handle (visible on hover, cursor: grab), color dot (8px circle, hidden when empty until hover), note indicator, priority badge (color-coded, click to cycle), tags (small pills with color), tag input, tag add button
- **Color palette** — absolute-positioned flex row of 18px swatches with active/clear states
- **Expanded note** — padded area below item row with markdown rendering styles (links, bold, italic, lists) and textarea edit mode
- **Drop indicator** — 2px absolute-positioned indigo line
- **Bottom actions** — flex row for add task / add section buttons
- **Completed section** — items at reduced opacity (0.6)

All new classes use the `stickysites-todo-` prefix. Colors use the existing Slate palette from the codebase. Font sizes 9-12px matching existing component scale.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: 48 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/content/sticky-inject.css
git commit -m "feat(todo): add CSS for sections, toolbar, tags, colors, notes, drag"
```

---

### Task 6: Final integration test and version bump

**Files:**
- Modify: `manifest.json` (version bump)
- Modify: `package.json` (version bump)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: 48 tests pass.

- [ ] **Step 2: Bump version to 1.9.0**

In `manifest.json`, change `"version": "1.8.0"` to `"version": "1.9.0"`.
In `package.json`, change `"version": "1.8.0"` to `"version": "1.9.0"`.

- [ ] **Step 3: Commit and push**

```bash
git add manifest.json package.json
git commit -m "chore: bump version to 1.9.0 for todo overhaul"
git push
```
