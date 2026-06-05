# StickySites v1.10 — Note-identity fixes + Outliner overhaul: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the contenteditable caret-reset and page-note key-bleed bugs, unify the storage record schema the popup reads, give cluster icons identity (domain/path/date), and rebuild the Outliner as a global named library with a full editing suite.

**Architecture:** All runtime logic stays in classic content scripts on the `window.StickySites.*` namespace (no ES modules in content scripts). Two new content scripts are added: `outline-ops.js` (pure tree operations, unit-tested by vitest via a stubbed `window`) and `outline.js` (outliner UI, replaces `Panel._renderOutline`). Panel gains key-snapshotting (`_activeKey`/`_activeLabel`) so saves can never land under a different page's key; `syncFromStorage` gains self-echo/focus/encryption guards.

**Tech Stack:** Vanilla JS, Chrome MV3, `chrome.storage.local`, vitest 4 (node env). No bundler, no frameworks.

**Spec:** `docs/superpowers/specs/2026-06-04-note-identity-fixes-and-outliner-design.md`

**Branch:** `feat/note-identity-fixes-and-outliner` (already created; spec committed).

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/shared/notes-storage.js` | Modify | Canonical `key`+`label` record schema (test-aligned with production) |
| `tests/notes-storage.test.js` | Modify | Assert canonical schema + legacy fallback |
| `popup.js` | Modify | Read canonical schema w/ legacy fallback; fix card matching/clicks; outline names; async popout target |
| `src/content/panel.js` | Modify | Key snapshot, `flushPendingSave`, sync guards, outline delegation, todo flush |
| `src/content/note-types.js` | Modify (full rewrite) | `getIconContent`/`getIconTitle`, 🌐 global, outline → library key |
| `src/content/cluster.js` | Modify | Registry-driven icon rendering, `refreshIcons`, visible-order helpers |
| `src/content/sticky-inject.js` | Modify | URL watcher, chord visible-order, clip fixes, OPEN-with-key |
| `src/content/sticky-inject.css` | Modify | Text-icon styles, outline UI styles |
| `src/content/outline-ops.js` | Create | Pure outline tree operations (testable) |
| `src/content/outline.js` | Create | Outliner UI: library switcher, zoom, keyboard, drag, export, auto-group |
| `tests/outline-ops.test.js` | Create | Unit tests for tree ops |
| `manifest.json` | Modify | Register new scripts; version 1.10.0 |
| `popout.html` | Modify | Register new scripts |
| `package.json` | Modify | Version 1.10.0 |
| `CLAUDE.md`, `docs/*.md` | Modify | Document new model |

Run all tests with: `npm test` (vitest run, node environment). Tests mock `chrome` per-file.

---

### Task 1: Canonical record schema in notes-storage.js (TDD)

Production (panel.js) writes map records as `{ key, label, body, tags, createdAt, updatedAt }`. `notes-storage.js` writes `siteKey`/`pageKey`/`dateKey` + `siteLabel`/`pageLabel` — a schema nothing at runtime produces. Align the shared module (and its tests) to the canonical schema, keeping read-time fallback for legacy fields.

**Files:**
- Modify: `src/shared/notes-storage.js`
- Test: `tests/notes-storage.test.js`

- [ ] **Step 1: Update the tests to assert the canonical schema (failing first)**

In `tests/notes-storage.test.js` make these exact changes:

1. In `describe('site note')` → `'writes and reads back'`: replace
   `expect(note.siteKey).toBe('example.com');` with:

```js
    expect(note.key).toBe('example.com');
    expect(note.label).toBe('example.com');
```

2. In `describe('page note')` → `'writes and reads back'`: replace
   `expect(note.pageKey).toBe('https://example.com/path');` with:

```js
    expect(note.key).toBe('https://example.com/path');
```

3. In `describe('daily note')` → `'writes and reads back'`: replace
   `expect(note.dateKey).toBe('2026-05-26');` with:

```js
    expect(note.key).toBe('2026-05-26');
```

4. In `describe('outline')` → `'writes and reads back'`: replace
   `expect(outline.siteKey).toBe('example.com');` with:

```js
    expect(outline.key).toBe('example.com');
    expect(outline.name).toBe('example.com');
```

5. Add a new describe block at the end of the file (legacy fallback — readers must
   accept records written by old versions):

```js
describe('legacy record fallback', () => {
  beforeEach(() => { store = {}; });

  it('readSiteNote accepts legacy siteKey records', async () => {
    store['stickysites_sites_v1'] = {
      'old.com': { siteKey: 'old.com', siteLabel: 'old.com', body: 'legacy', tags: [], createdAt: 'x', updatedAt: 'y' }
    };
    const note = await readSiteNote('old.com');
    expect(note.key).toBe('old.com');
    expect(note.body).toBe('legacy');
  });

  it('readPageNote accepts legacy pageKey records', async () => {
    store['stickysites_pages_v1'] = {
      'https://old.com/p': { pageKey: 'https://old.com/p', body: 'legacy page', tags: [] }
    };
    const note = await readPageNote('https://old.com/p');
    expect(note.key).toBe('https://old.com/p');
    expect(note.body).toBe('legacy page');
  });

  it('readOutline accepts legacy siteKey outlines and derives name from the map key', async () => {
    store['stickysites_outlines_v1'] = {
      'old.com': { siteKey: 'old.com', items: [{ id: '1', text: 'n', children: [], collapsed: false }] }
    };
    const o = await readOutline('old.com');
    expect(o.key).toBe('old.com');
    expect(o.name).toBe('old.com');
    expect(o.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify the new assertions fail**

Run: `npm test`
Expected: FAIL — `note.key` is `undefined` in the updated assertions and the new describe block.

- [ ] **Step 3: Align notes-storage.js to the canonical schema**

In `src/shared/notes-storage.js`:

Replace `readSiteNote`'s return object with:

```js
    return {
      key: String(record.key || record.siteKey || siteKey),
      label: String(record.label || record.siteLabel || siteKey),
      body: String(record.body ?? ''),
      tags: Array.isArray(record.tags) ? record.tags : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
```

Replace `writeSiteNote`'s `record` literal with:

```js
    const record = {
      key: siteKey,
      label: String(siteLabel || siteKey),
      body: String(body),
      tags: Array.isArray(tags) ? tags : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
```

Replace `readAllSiteNotes`'s mapper with:

```js
    return Object.values(map).map(r => ({
      key: String(r.key || r.siteKey || ''),
      label: String(r.label || r.siteLabel || ''),
      body: String(r.body ?? ''),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
```

Apply the same pattern to the page-note trio (`readPageNote` / `writePageNote` /
`readAllPageNotes`): canonical `key` (fallback `r.pageKey`), canonical `label`
(fallback `r.pageLabel`), writes produce `key` + `label`.

Apply the same to the daily trio (`readDailyNote` / `writeDailyNote` /
`readAllDailyNotes`): canonical `key` (fallback `r.dateKey`); daily has no label
field — writes produce `{ key, body, tags, createdAt, updatedAt }`.

Replace the outline trio with the library-document shape:

```js
export async function readOutline(outlineKey) {
  if (!outlineKey) return null;
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = stored?.[OUTLINES_KEY] || {};
    const record = map[outlineKey];
    if (!record) return null;
    return {
      key: String(record.key || record.siteKey || outlineKey),
      name: String(record.name || outlineKey),
      items: Array.isArray(record.items) ? record.items : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeOutline(outlineKey, { name = '', items = [] } = {}) {
  if (!outlineKey) return null;
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = stored?.[OUTLINES_KEY] || {};
    const existing = map[outlineKey];
    const record = {
      key: outlineKey,
      name: String(name || existing?.name || outlineKey),
      items: Array.isArray(items) ? items : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    map[outlineKey] = record;
    await chrome.storage.local.set({ [OUTLINES_KEY]: map });
    return record;
  } catch { return null; }
}
```

And `readAllOutlines`'s mapper becomes:

```js
    return Object.entries(map).map(([k, r]) => ({
      key: String(r.key || k),
      name: String(r.name || k),
      items: Array.isArray(r.items) ? r.items : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
```

In `writeTodo`, replace `siteKey: '__global__',` with `key: '__global__',`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/shared/notes-storage.js tests/notes-storage.test.js
git commit -m "fix(storage): align notes-storage schema with production (canonical key+label)"
```

---

### Task 2: Popup reads the canonical schema

popup.js reads `r.siteKey` / `r.pageKey` / `r.dateKey`, which production never writes — so cards lose their labels and never match the current tab (always dimmed, never clickable). Switch to canonical-with-fallback, fix the match logic for todo/outline/daily, and pass the note key on card clicks (used by Task 9 for outlines).

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Fix `noteMatchesCurrentTab`**

Replace the whole function with:

```js
  function noteMatchesCurrentTab(note) {
    if (note.type === 'global' || note.type === 'todo' || note.type === 'outline') return true;
    if (note.type === 'daily') return note.key === todayKey();
    try {
      var u = new URL(state.currentTabUrl);
      if (note.type === 'site') return note.key === u.hostname.replace(/^www\./, '');
      if (note.type === 'page') return note.key === (u.origin + u.pathname);
    } catch { return false; }
    return false;
  }
```

(`todayKey()` is declared later in the file; function declarations hoist.)

- [ ] **Step 2: Fix `loadAllNotes` record reads**

In `loadAllNotes`, replace the sites block's push with:

```js
    Object.values(sites).forEach(function (r) {
      var sk = String(r.key || r.siteKey || '');
      notes.push({
        type: 'site', key: sk, label: 'Site note — ' + sk,
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-green', sectionClass: 'is-green', noteTypeId: 'site'
      });
    });
```

Replace the pages block with:

```js
    var pages = stored[PAGES_KEY] || {};
    Object.values(pages).forEach(function (r) {
      var pk = String(r.key || r.pageKey || '');
      var pathLabel = '';
      try { pathLabel = new URL(pk).pathname; } catch { pathLabel = pk; }
      notes.push({
        type: 'page', key: pk, label: 'Page note — ' + pathLabel,
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-blue', sectionClass: 'is-blue', noteTypeId: 'page'
      });
    });
```

Replace the outlines block with (named-library aware, legacy tolerant):

```js
    var outlines = stored[OUTLINES_KEY] || {};
    Object.keys(outlines).forEach(function (k) {
      var r = outlines[k] || {};
      var items = Array.isArray(r.items) ? r.items : [];
      var firstNode = items.length ? items[0].text : '';
      var preview = items.slice(0, 4).map(function (n) { return '• ' + n.text; }).join('\n');
      notes.push({
        type: 'outline', key: String(r.key || k), label: 'Outline — ' + String(r.name || r.siteKey || k),
        body: firstNode + '\n' + preview, tags: [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-orange', sectionClass: 'is-orange', noteTypeId: 'outline'
      });
    });
```

Replace the dailies block with:

```js
    var dailies = stored[DAILY_KEY] || {};
    Object.keys(dailies).forEach(function (k) {
      var r = dailies[k] || {};
      var dk = String(r.key || r.dateKey || k);
      notes.push({
        type: 'daily', key: dk, label: 'Daily — ' + dk,
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-red', sectionClass: 'is-red', noteTypeId: 'daily'
      });
    });
```

- [ ] **Step 3: Pass the note key on card click**

In `renderNoteCard`, inside the `chrome.tabs.sendMessage` call, add `key: note.key`:

```js
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'STICKYSITES_OPEN', noteTypeId: note.noteTypeId, key: note.key
            });
```

- [ ] **Step 4: Update the Quick-Open globe**

In `QUICK_OPEN_TYPES`, change the global entry's emoji to the globe:

```js
    { id: 'global',  label: 'Global',  emoji: '\u{1F310}', cssClass: 'is-yellow' },
```

- [ ] **Step 5: Run tests + commit**

Run: `npm test` → PASS (popup has no unit suite; this catches accidental shared-module breakage).

```bash
git add popup.js
git commit -m "fix(popup): read canonical record schema; un-dim matching cards; pass key on open"
```

---

### Task 3: Panel key snapshot + flushPendingSave

A save currently recomputes `noteType.getKey(location)` at write time, so a panel that survives an SPA navigation writes old content under the new page's key. Snapshot key+label at `open()`; route all reads/writes/popouts through the snapshot. Extract the flush logic so the URL watcher (Task 6) can reuse it, and make the todo renderer flushable.

**Files:**
- Modify: `src/content/panel.js`

- [ ] **Step 1: Add the state fields**

In the `window.StickySites.Panel = {` object literal header (next to `_flushSave: null,`), add:

```js
    _activeKey: null,
    _activeLabel: null,
    _lastSavedBody: null,
```

- [ ] **Step 2: Snapshot in `open()`, clear in `close()`**

At the top of `open()`, after `this.activeNoteType = noteType;` insert:

```js
      // Snapshot the storage key/label once per panel session. All reads and
      // writes use the snapshot, so a save can never land under another page's
      // key after an SPA navigation (or a daily note crossing midnight).
      this._activeKey = noteType.getKey(location);
      this._activeLabel = noteType.getLabel(location);
      this._lastSavedBody = null;
```

In `close()`, after `this._flushSave = null;` insert:

```js
      this._activeKey = null;
      this._activeLabel = null;
      this._lastSavedBody = null;
```

- [ ] **Step 3: Use the snapshot in reads/writes**

- In `_readNote`: replace `var key = noteType.getKey(location);` with `var key = this._activeKey;`
- In `_writeNote`: replace `var key = noteType.getKey(location);` with `var key = this._activeKey;` and replace `label: noteType.getLabel(location),` with `label: this._activeLabel,`
- In `_writeStructured`: replace `var key = noteType.getKey(location);` with `var key = this._activeKey;` and replace `siteKey: key,` with `key: key,`

- [ ] **Step 4: Extract `flushPendingSave` and use it in `_popoutActiveNote`**

Replace `_popoutActiveNote` with:

```js
    _popoutActiveNote: async function () {
      var noteType = this.activeNoteType;
      if (!noteType) return;
      // Flush any pending edit so the popout window reads the latest content from
      // storage (the popout reloads the note from chrome.storage, not from the DOM).
      await this.flushPendingSave();
      chrome.runtime.sendMessage({
        type: 'STICKYSITES_POPOUT',
        noteTypeId: noteType.id,
        key: this._activeKey,
        label: this._activeLabel
      });
      if (this.onClose) this.onClose();
    },

    flushPendingSave: async function () {
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      if (this._flushSave) {
        try { await this._flushSave(); } catch (e) { /* save is best-effort */ }
      }
    },
```

- [ ] **Step 5: Make the todo renderer flushable**

In `_renderTodo`, replace the `save()` helper with:

```js
      function saveNow() {
        return self._writeStructured(noteType, {
          items: items,
          sections: sections,
          tagColors: tagColors
        }).then(function (result) {
          if (result) saved.textContent = formatSaved(result.updatedAt);
        });
      }
      function save() {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(function () { self._saveTimer = null; saveNow(); }, 500);
      }
      self._flushSave = saveNow;
```

- [ ] **Step 6: Commit**

```bash
git add src/content/panel.js
git commit -m "fix(panel): snapshot note key at open so saves never bleed across SPA navigations"
```

---

### Task 4: syncFromStorage guards (cursor-flicker + encrypted-wipe fix)

Every debounced save echoes back through `chrome.storage.onChanged` in the same tab and rewrites `editor.innerHTML`, resetting the caret. With encryption on, the change event carries `{iv, data}` so `newValue.body` is `undefined` and the editor is erased. Add self-echo / focus / encrypted guards.

**Files:**
- Modify: `src/content/panel.js`

- [ ] **Step 1: Record the last saved body in `doSave`**

In `_render`, replace the `doSave` function with:

```js
      var doSave = async function () {
        var result = await self._writeNote(
          noteType,
          getCleanHtml(editor),
          parseTags(tagInput.value)
        );
        if (result) {
          // Remember exactly what we stored so syncFromStorage can ignore the
          // echo of our own write coming back through chrome.storage.onChanged.
          self._lastSavedBody = result.body;
          chars.textContent = getPlainText(editor).length + ' chars';
          saved.textContent = formatSaved(result.updatedAt);
        }
      };
```

- [ ] **Step 2: Replace `syncFromStorage`**

Replace the whole `syncFromStorage` method with:

```js
    syncFromStorage: async function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (nt.storagePattern === 'structured') return;
      if (!changes[nt.storageKey]) return;

      var ed = this.el.querySelector('.stickysites-panel-editor');
      if (!ed) return;

      // Focus guard — never rewrite the DOM under the user's caret. Remote
      // changes are picked up the next time the note is opened.
      var active = document.activeElement;
      if (active && this.el.contains(active)) return;

      var newValue = changes[nt.storageKey].newValue;
      // Encrypted guard — the change event carries the stored envelope, not the
      // plaintext. Decrypt before comparing; skip entirely while locked.
      if (newValue && window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(newValue)) {
        try {
          var cachedKey = await window.StickySites.Crypto.getCachedKey();
          if (!cachedKey) return;
          newValue = await window.StickySites.Crypto.decryptValue(newValue);
        } catch { return; }
      }

      var body;
      if (nt.storagePattern === 'single') {
        body = newValue ? String(newValue.body ?? '') : '';
      } else {
        var record = (newValue || {})[this._activeKey];
        if (!record) return;
        body = String(record.body ?? '');
      }

      // Self-echo guard — our own debounced save round-tripping through onChanged.
      if (body === this._lastSavedBody) return;

      // Safe: body is user-authored content from chrome.storage.local (extension-isolated storage)
      if (ed.innerHTML !== body) ed.innerHTML = bodyToHtml(body); // nosec
    }
```

(The caller in sticky-inject.js fires-and-forgets; making this async needs no caller change.)

- [ ] **Step 3: Commit**

```bash
git add src/content/panel.js
git commit -m "fix(panel): stop syncFromStorage clobbering the editor (caret reset, encrypted wipe)"
```

---

### Task 5: Identity-bearing cluster icons

Registry-driven icon content: 🌐 globe (global), domain fragment (site), trailing path segment (page), day-of-month (daily). Cluster renders from the registry and can refresh after SPA navigations.

**Files:**
- Modify: `src/content/note-types.js` (full rewrite below)
- Modify: `src/content/cluster.js`
- Modify: `src/content/sticky-inject.css`

- [ ] **Step 1: Rewrite note-types.js**

Replace the entire file with (note: outline `getKey` stays hostname-based until Task 9 swaps the renderer — changing it earlier would break the current outliner):

```js
window.StickySites = window.StickySites || {};

(function () {
  function domainFragment(loc) {
    // "www.example.com" → "exam": first dot-label, minus www, max 4 chars.
    var label = loc.hostname.replace(/^www\./, '').split('.')[0] || loc.hostname;
    return label.slice(0, 4);
  }

  function pathFragment(loc) {
    // Last path segment, ellipsized: "/contactus.html" → "con…"; "/" → "/".
    var seg = loc.pathname.split('/').filter(Boolean).pop() || '/';
    return seg.length > 4 ? seg.slice(0, 3) + '…' : seg;
  }

  window.StickySites.noteTypes = [
    {
      id: 'global',
      color: '#fbbf24',
      tint: 'rgba(251,191,36,0.15)',
      tintText: '#fde68a',
      label: 'Global note',
      emoji: '\u{1F310}',
      cssClass: 'is-yellow',
      storageKey: 'stickysites_global_v1',
      storagePattern: 'single',
      getKey: function () { return '__global__'; },
      getLabel: function () { return 'Global note'; },
      getPlaceholder: function () { return 'Type a note here. Visible on every website.'; }
    },
    {
      id: 'site',
      color: '#34d399',
      tint: 'rgba(52,211,153,0.15)',
      tintText: '#6ee7b7',
      label: 'Site note',
      emoji: '\u{1F4DD}',
      cssClass: 'is-green',
      storageKey: 'stickysites_sites_v1',
      storagePattern: 'map',
      getKey: function (loc) { return loc.hostname.replace(/^www\./, ''); },
      getLabel: function (loc) { return 'Site note — ' + loc.hostname.replace(/^www\./, ''); },
      getPlaceholder: function (loc) { return 'Notes for ' + loc.hostname.replace(/^www\./, '') + '. Only visible on this domain.'; },
      getIconContent: function (loc) { return domainFragment(loc); },
      getIconTitle: function (loc) { return loc.hostname.replace(/^www\./, ''); }
    },
    {
      id: 'page',
      color: '#60a5fa',
      tint: 'rgba(96,165,250,0.15)',
      tintText: '#93c5fd',
      label: 'Page note',
      emoji: '\u{1F4DD}',
      cssClass: 'is-blue',
      storageKey: 'stickysites_pages_v1',
      storagePattern: 'map',
      getKey: function (loc) { return loc.origin + loc.pathname; },
      getLabel: function (loc) { return 'Page note — ' + loc.pathname; },
      getPlaceholder: function () { return 'Notes for this page only.'; },
      getIconContent: function (loc) { return pathFragment(loc); },
      getIconTitle: function (loc) { return loc.pathname; }
    },
    {
      id: 'todo',
      color: '#a78bfa',
      tint: 'rgba(167,139,250,0.15)',
      tintText: '#c4b5fd',
      label: 'To-do list',
      emoji: '✓',
      cssClass: 'is-purple',
      storageKey: 'stickysites_todos_v1',
      storagePattern: 'structured',
      getKey: function () { return '__global__'; },
      getLabel: function () { return 'To-do list'; },
      getPlaceholder: function () { return 'Add your to-do items.'; }
    },
    {
      id: 'outline',
      color: '#fb923c',
      tint: 'rgba(251,146,60,0.15)',
      tintText: '#fdba74',
      label: 'Outliner',
      emoji: '≡',
      cssClass: 'is-orange',
      storageKey: 'stickysites_outlines_v1',
      storagePattern: 'structured',
      getKey: function (loc) { return loc.hostname.replace(/^www\./, ''); },
      getLabel: function (loc) { return 'Outline — ' + loc.hostname.replace(/^www\./, ''); },
      getPlaceholder: function () { return 'Organize your thoughts.'; }
    },
    {
      id: 'daily',
      color: '#f87171',
      tint: 'rgba(248,113,113,0.15)',
      tintText: '#fca5a5',
      label: 'Daily note',
      emoji: '\u{1F4C5}',
      cssClass: 'is-red',
      storageKey: 'stickysites_daily_v1',
      storagePattern: 'map',
      getKey: function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      },
      getLabel: function () {
        var d = new Date();
        return 'Daily — ' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      },
      getPlaceholder: function () { return 'What happened today?'; },
      getIconContent: function () { return String(new Date().getDate()); },
      getIconTitle: function () { return this.getLabel(); }
    }
  ];
})();
```

- [ ] **Step 2: Cluster renders from the registry**

In `src/content/cluster.js`:

1. In `init`, replace the button-creation loop body's two lines
   `btn.title = nt.label;` and `btn.textContent = nt.emoji;` with a call to the
   shared helper, and store the noteType on the button record:

```js
      for (var i = 0; i < ordered.length; i++) {
        var nt = ordered[i];
        var btn = document.createElement('button');
        btn.className = 'stickysites-cluster-icon ' + nt.cssClass;
        btn.dataset.typeId = nt.id;
        btn.draggable = false;
        this._setIconContent(btn, nt);
        btn.addEventListener('click', this._makeClickHandler(nt.id));
        cluster.appendChild(btn);
        this.buttons.push({ el: btn, typeId: nt.id, noteType: nt });
      }
```

2. Add three methods to the Cluster object (after `setActive`):

```js
    _setIconContent: function (btn, nt) {
      var content = nt.getIconContent ? nt.getIconContent(location) : nt.emoji;
      btn.textContent = content;
      btn.title = nt.getIconTitle ? nt.getIconTitle(location) : nt.label;
      // Text fragments (3+ chars) get the small-type treatment; single glyphs
      // and day numbers keep the default 14px.
      btn.classList.toggle('has-text', String(content).length > 2);
    },

    refreshIcons: function () {
      for (var i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i];
        if (b.noteType) this._setIconContent(b.el, b.noteType);
      }
    },

    getVisibleIcons: function () {
      return Array.from(this.el.querySelectorAll('.stickysites-cluster-icon'))
        .filter(function (el) { return el.style.display !== 'none'; });
    },

    getVisibleTypeIds: function () {
      return this.getVisibleIcons().map(function (el) { return el.dataset.typeId; });
    },
```

- [ ] **Step 3: CSS for text icons**

In `src/content/sticky-inject.css`, after the `.stickysites-cluster-icon:hover` rule, add:

```css
.stickysites-cluster-icon.has-text {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  overflow: hidden;
  padding: 0 2px;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/content/note-types.js src/content/cluster.js src/content/sticky-inject.css
git commit -m "feat(icons): identity-bearing cluster icons (globe, domain, path, day number)"
```

---

### Task 6: URL-change watcher (SPA navigation)

Detect same-tab URL changes (`popstate`, `hashchange`, 1 s poll), flush the pending save (which writes under the captured *old* key — no loss, no bleed), then re-open the panel for the new URL and refresh the icons.

**Files:**
- Modify: `src/content/sticky-inject.js`

- [ ] **Step 1: Add the watcher**

In `sticky-inject.js`, after the `SS.Cluster.toggle` patch block (`var originalToggle = ...` section) and before `chrome.runtime.onMessage.addListener`, insert:

```js
  // ── SPA navigation watcher ─────────────────────────────────────────────
  // Client-side route changes don't reload content scripts. Refresh the
  // location-dependent icons, and re-open any location-dependent note for the
  // new URL. The pending save is flushed first — it writes under the key
  // captured at open() time, so old content can never land under the new key.
  var lastHref = location.href;
  function onUrlChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    if (SS.Cluster.refreshIcons) SS.Cluster.refreshIcons();
    var nt = SS.Panel.activeNoteType;
    if (!nt) return;
    if (nt.id !== 'site' && nt.id !== 'page') return;
    var newKey = nt.getKey(location);
    if (newKey === SS.Panel._activeKey) return;
    (async function () {
      await SS.Panel.flushPendingSave();
      SS.Panel.open(nt);
    })();
  }
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  setInterval(onUrlChange, 1000);
```

- [ ] **Step 2: Commit**

```bash
git add src/content/sticky-inject.js
git commit -m "fix(inject): re-key panel and refresh icons on SPA navigations"
```

---

### Task 7: Number chords follow the visible cluster order

Badges number the *displayed* (re-orderable, visibility-filtered) icons, but the chord handler indexes the static registry — after a reorder, "3" opens the wrong note. Make chords, the `A` cycle, and the badges all use the same visible DOM order.

**Files:**
- Modify: `src/content/sticky-inject.js`

- [ ] **Step 1: Rewrite the chord keydown handler**

Replace the first `document.addEventListener('keydown', ...)` block (the one guarded by `if (SS.Cluster.hidden) return;`) with:

```js
  // Chord hotkey system — numbers/`A` follow the *visible* cluster order so
  // they always agree with the number badges (icons can be reordered/hidden).
  var chordCycleIndex = 0;
  document.addEventListener('keydown', function (e) {
    if (SS.Cluster.hidden) return;
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    var key = e.key;
    if (key >= '1' && key <= '5') {
      var visibleIds = SS.Cluster.getVisibleTypeIds();
      var idx = parseInt(key) - 1;
      if (idx < visibleIds.length) {
        var nt = findNoteType(visibleIds[idx]);
        if (nt) {
          e.preventDefault();
          SS.Cluster.setActive(nt.id);
          SS.Panel.open(nt);
        }
      }
    }
    if (key === 'a' || key === 'A') {
      var ids = SS.Cluster.getVisibleTypeIds();
      if (!ids.length) return;
      e.preventDefault();
      chordCycleIndex = (chordCycleIndex + 1) % ids.length;
      var cycled = findNoteType(ids[chordCycleIndex]);
      if (cycled) {
        SS.Cluster.setActive(cycled.id);
        SS.Panel.open(cycled);
      }
    }
  });
```

(Delete the old `var chordCycleIndex = 0;` line above the old handler — it moves into this block.)

- [ ] **Step 2: Badge only the visible icons, in DOM order**

Replace the `showBadges` function body's loop with:

```js
  function showBadges() {
    if (badgeTimeout) clearTimeout(badgeTimeout);
    var icons = SS.Cluster.getVisibleIcons();
    icons.forEach(function (el, i) {
      var existing = el.querySelector('.stickysites-cluster-badge');
      if (existing) existing.remove();
      var badge = document.createElement('span');
      badge.className = 'stickysites-cluster-badge';
      badge.textContent = (i < 5) ? String(i + 1) : '';
      el.style.position = 'relative';
      el.appendChild(badge);
      requestAnimationFrame(function () { badge.classList.add('is-visible'); });
    });
    badgeTimeout = setTimeout(function () {
      var badges = document.querySelectorAll('.stickysites-cluster-badge');
      badges.forEach(function (b) { b.classList.remove('is-visible'); });
      setTimeout(function () {
        badges.forEach(function (b) { b.remove(); });
      }, 300);
    }, 3000);
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/content/sticky-inject.js
git commit -m "fix(hotkeys): number chords and badges share the visible cluster order"
```

---

### Task 8: Outline tree operations module (TDD)

Pure, DOM-free tree operations on `window.StickySites.OutlineOps`. Vitest imports the classic script with a stubbed `window` (the file only defines and attaches — it never touches `document` at load time).

**Files:**
- Create: `src/content/outline-ops.js`
- Test: `tests/outline-ops.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/outline-ops.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';

let Ops;

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('../src/content/outline-ops.js');
  Ops = globalThis.StickySites.OutlineOps;
});

function node(id, text, children) {
  return { id, text, children: children || [], collapsed: false, note: '', done: false, tags: [] };
}

function tree() {
  // a
  //   a1
  //   a2
  // b
  return [
    node('a', 'alpha', [node('a1', 'alpha one'), node('a2', 'alpha two')]),
    node('b', 'beta')
  ];
}

describe('normalizeNode / normalizeItems', () => {
  it('fills defaults and recurses', () => {
    const n = Ops.normalizeNode({ text: 'x', children: [{ text: 'y' }] });
    expect(n.id).toBeTruthy();
    expect(n.done).toBe(false);
    expect(n.tags).toEqual([]);
    expect(n.note).toBe('');
    expect(n.children[0].text).toBe('y');
    expect(n.children[0].id).toBeTruthy();
  });
  it('normalizes arrays', () => {
    expect(Ops.normalizeItems([{ text: 'a' }])).toHaveLength(1);
    expect(Ops.normalizeItems(null)).toEqual([]);
  });
});

describe('findParent / findNode / getPathTo', () => {
  it('finds nested nodes with their containing array', () => {
    const items = tree();
    const loc = Ops.findParent('a2', items, null);
    expect(loc.parent.id).toBe('a');
    expect(loc.index).toBe(1);
    expect(loc.array).toBe(items[0].children);
  });
  it('findNode returns the node', () => {
    expect(Ops.findNode('a1', tree()).text).toBe('alpha one');
    expect(Ops.findNode('zz', tree())).toBeNull();
  });
  it('getPathTo returns ancestors including the node', () => {
    const path = Ops.getPathTo(tree(), 'a2');
    expect(path.map(n => n.id)).toEqual(['a', 'a2']);
    expect(Ops.getPathTo(tree(), 'zz')).toBeNull();
  });
});

describe('structure edits', () => {
  it('insertSiblingAfter inserts at the right spot', () => {
    const items = tree();
    Ops.insertSiblingAfter(items, 'a1', node('n', 'new'));
    expect(items[0].children.map(n => n.id)).toEqual(['a1', 'n', 'a2']);
  });
  it('indentNode moves under previous sibling', () => {
    const items = tree();
    expect(Ops.indentNode(items, 'b')).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].children.map(n => n.id)).toEqual(['a1', 'a2', 'b']);
  });
  it('indentNode refuses the first sibling', () => {
    const items = tree();
    expect(Ops.indentNode(items, 'a')).toBe(false);
  });
  it('outdentNode moves after the parent', () => {
    const items = tree();
    expect(Ops.outdentNode(items, 'a1')).toBe(true);
    expect(items.map(n => n.id)).toEqual(['a', 'a1', 'b']);
  });
  it('moveNode swaps with siblings and respects bounds', () => {
    const items = tree();
    expect(Ops.moveNode(items, 'a2', -1)).toBe(true);
    expect(items[0].children.map(n => n.id)).toEqual(['a2', 'a1']);
    expect(Ops.moveNode(items, 'a2', -1)).toBe(false);
  });
  it('removeNode promotes children', () => {
    const items = tree();
    expect(Ops.removeNode(items, 'a')).toBe(true);
    expect(items.map(n => n.id)).toEqual(['a1', 'a2', 'b']);
  });
});

describe('extractTags', () => {
  it('extracts unique lowercase #tags', () => {
    expect(Ops.extractTags('Fix #Bug and #bug in #auth-flow')).toEqual(['#bug', '#auth-flow']);
  });
  it('returns empty for none', () => {
    expect(Ops.extractTags('nothing here')).toEqual([]);
  });
});

describe('filterTree', () => {
  it('returns matches plus their ancestors', () => {
    const visible = Ops.filterTree(tree(), 'alpha one');
    expect(visible.has('a1')).toBe(true);
    expect(visible.has('a')).toBe(true);
    expect(visible.has('a2')).toBe(false);
    expect(visible.has('b')).toBe(false);
  });
  it('returns null for an empty query', () => {
    expect(Ops.filterTree(tree(), '')).toBeNull();
  });
});

describe('autoGroup', () => {
  it('groups by shared first tag', () => {
    const items = [
      node('1', 'call dentist #errands'),
      node('2', 'buy milk #errands'),
      node('3', 'ship the release #work'),
      node('4', 'review PR #work')
    ];
    const out = Ops.autoGroup(items);
    const names = out.map(n => n.text).sort();
    expect(names).toEqual(['#errands', '#work']);
    expect(out.find(n => n.text === '#errands').children).toHaveLength(2);
  });
  it('groups leftovers by shared keyword and leaves singles ungrouped', () => {
    const items = [
      node('1', 'plan birthday party'),
      node('2', 'birthday cake order'),
      node('3', 'totally unrelated')
    ];
    const out = Ops.autoGroup(items);
    const group = out.find(n => n.text === 'birthday');
    expect(group).toBeTruthy();
    expect(group.children).toHaveLength(2);
    const other = out.find(n => n.text === 'Other');
    expect(other.children.map(n => n.id)).toEqual(['3']);
  });
  it('leaves everything alone when nothing clusters', () => {
    const items = [node('1', 'aaaa'), node('2', 'bbbb')];
    const out = Ops.autoGroup(items);
    expect(out.map(n => n.id)).toEqual(['1', '2']);
  });
});

describe('exports', () => {
  it('toMarkdown indents two spaces per level and strikes done items', () => {
    const items = tree();
    items[0].children[0].done = true;
    const md = Ops.toMarkdown(items);
    expect(md.split('\n')).toEqual([
      '- alpha',
      '  - ~~alpha one~~',
      '  - alpha two',
      '- beta'
    ]);
  });
  it('toOPML escapes and nests', () => {
    const items = [node('1', 'a < b', [node('2', 'child "q"')])];
    const xml = Ops.toOPML(items, 'My & outline');
    expect(xml).toContain('<title>My &amp; outline</title>');
    expect(xml).toContain('text="a &lt; b"');
    expect(xml).toContain('text="child &quot;q&quot;"');
    expect(xml.indexOf('<outline text="a &lt; b">')).toBeGreaterThan(-1);
    expect(xml).toContain('</outline>');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/content/outline-ops.js'`.

- [ ] **Step 3: Implement `src/content/outline-ops.js`**

```js
window.StickySites = window.StickySites || {};

// Pure tree operations for the outliner. No DOM access at load or call time —
// vitest imports this file with a stubbed `window` (see tests/outline-ops.test.js).
(function () {
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeNode(node) {
    node = node || {};
    return {
      id: node.id || genId(),
      text: String(node.text ?? ''),
      children: Array.isArray(node.children) ? node.children.map(normalizeNode) : [],
      collapsed: !!node.collapsed,
      note: typeof node.note === 'string' ? node.note : '',
      done: !!node.done,
      tags: Array.isArray(node.tags) ? node.tags : []
    };
  }

  function normalizeItems(arr) {
    return Array.isArray(arr) ? arr.map(normalizeNode) : [];
  }

  function findParent(targetId, arr, parent) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === targetId) return { parent: parent || null, array: arr, index: i };
      if (arr[i].children && arr[i].children.length) {
        var found = findParent(targetId, arr[i].children, arr[i]);
        if (found) return found;
      }
    }
    return null;
  }

  function findNode(id, arr) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
      if (arr[i].children && arr[i].children.length) {
        var f = findNode(id, arr[i].children);
        if (f) return f;
      }
    }
    return null;
  }

  function getPathTo(items, id) {
    function walk(arr, path) {
      for (var i = 0; i < arr.length; i++) {
        var n = arr[i];
        if (n.id === id) return path.concat(n);
        if (n.children && n.children.length) {
          var found = walk(n.children, path.concat(n));
          if (found) return found;
        }
      }
      return null;
    }
    return walk(items, []);
  }

  function insertSiblingAfter(items, targetId, newNode) {
    var loc = findParent(targetId, items, null);
    if (!loc) return false;
    loc.array.splice(loc.index + 1, 0, newNode);
    return true;
  }

  function indentNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc || loc.index === 0) return false;
    var prev = loc.array[loc.index - 1];
    var node = loc.array.splice(loc.index, 1)[0];
    if (!Array.isArray(prev.children)) prev.children = [];
    prev.children.push(node);
    prev.collapsed = false;
    return true;
  }

  function outdentNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc || !loc.parent) return false;
    var parentLoc = findParent(loc.parent.id, items, null);
    if (!parentLoc) return false;
    var node = loc.array.splice(loc.index, 1)[0];
    parentLoc.array.splice(parentLoc.index + 1, 0, node);
    return true;
  }

  function moveNode(items, id, dir) {
    var loc = findParent(id, items, null);
    if (!loc) return false;
    var newIdx = loc.index + dir;
    if (newIdx < 0 || newIdx >= loc.array.length) return false;
    var node = loc.array.splice(loc.index, 1)[0];
    loc.array.splice(newIdx, 0, node);
    return true;
  }

  function removeNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc) return false;
    var node = loc.array[loc.index];
    loc.array.splice(loc.index, 1);
    if (node.children && node.children.length) {
      for (var i = 0; i < node.children.length; i++) {
        loc.array.splice(loc.index + i, 0, node.children[i]);
      }
    }
    return true;
  }

  function extractTags(text) {
    var m = String(text || '').match(/#[a-z0-9_-]+/gi) || [];
    var seen = [];
    m.forEach(function (t) {
      var lower = t.toLowerCase();
      if (seen.indexOf(lower) === -1) seen.push(lower);
    });
    return seen;
  }

  function filterTree(items, query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return null; // null = no filter active
    var visible = new Set();
    function walk(arr, ancestors) {
      arr.forEach(function (n) {
        var hay = (n.text + ' ' + (n.note || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          visible.add(n.id);
          ancestors.forEach(function (a) { visible.add(a); });
        }
        walk(n.children || [], ancestors.concat(n.id));
      });
    }
    walk(items, []);
    return visible;
  }

  var STOPWORDS = ('the and for with that this from have will your about into over then than them they were been ' +
    'being what when where which while would could should there here also just like make made more most some such ' +
    'very each other only onto upon does done dont cant wont').split(' ');

  // Reorganize a flat top-level list into a hierarchy. Priority: (a) shared
  // first tag → tag-named parents; (b) shared significant keyword (>3 chars,
  // non-stopword, in ≥2 nodes) → keyword-named parents; (c) rest → "Other".
  // Single-member groups stay ungrouped. Returns a NEW top-level array; child
  // subtrees travel with their nodes untouched.
  function autoGroup(items) {
    var top = items.slice();
    var tagGroups = {};
    var leftovers = [];

    top.forEach(function (n) {
      var tags = (n.tags && n.tags.length) ? n.tags : extractTags(n.text);
      if (tags.length) {
        (tagGroups[tags[0]] = tagGroups[tags[0]] || []).push(n);
      } else {
        leftovers.push(n);
      }
    });
    Object.keys(tagGroups).forEach(function (g) {
      if (tagGroups[g].length < 2) {
        leftovers = leftovers.concat(tagGroups[g]);
        delete tagGroups[g];
      }
    });

    var wordMap = {};
    leftovers.forEach(function (n) {
      var words = String(n.text).toLowerCase().match(/[a-z0-9']{4,}/g) || [];
      var unique = [];
      words.forEach(function (w) { if (unique.indexOf(w) === -1) unique.push(w); });
      unique.forEach(function (w) {
        if (STOPWORDS.indexOf(w) !== -1) return;
        (wordMap[w] = wordMap[w] || []).push(n);
      });
    });

    var assigned = new Set();
    var keywordGroups = {};
    Object.keys(wordMap)
      .filter(function (w) { return wordMap[w].length >= 2; })
      .sort(function (a, b) { return wordMap[b].length - wordMap[a].length || a.localeCompare(b); })
      .forEach(function (w) {
        var members = wordMap[w].filter(function (n) { return !assigned.has(n.id); });
        if (members.length >= 2) {
          keywordGroups[w] = members;
          members.forEach(function (n) { assigned.add(n.id); });
        }
      });

    var rest = leftovers.filter(function (n) { return !assigned.has(n.id); });
    var result = [];
    Object.keys(tagGroups).sort().forEach(function (g) {
      result.push({ id: genId(), text: g, children: tagGroups[g], collapsed: false, note: '', done: false, tags: [] });
    });
    Object.keys(keywordGroups).sort().forEach(function (w) {
      result.push({ id: genId(), text: w, children: keywordGroups[w], collapsed: false, note: '', done: false, tags: [] });
    });
    if (!result.length) return top; // nothing clustered — leave the list as-is
    if (rest.length) {
      result.push({ id: genId(), text: 'Other', children: rest, collapsed: false, note: '', done: false, tags: [] });
    }
    return result;
  }

  function toMarkdown(items) {
    var lines = [];
    function walk(arr, depth) {
      arr.forEach(function (n) {
        var indent = new Array(depth + 1).join('  ');
        lines.push(indent + '- ' + (n.done ? '~~' + n.text + '~~' : n.text));
        if (n.note) lines.push(indent + '  ' + n.note.replace(/\n/g, ' '));
        walk(n.children || [], depth + 1);
      });
    }
    walk(items, 0);
    return lines.join('\n');
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toOPML(items, name) {
    var lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<opml version="2.0">',
      '<head><title>' + escXml(name || 'Outline') + '</title></head>',
      '<body>'
    ];
    function walk(arr) {
      arr.forEach(function (n) {
        var attrs = ' text="' + escXml(n.text) + '"';
        if (n.note) attrs += ' _note="' + escXml(n.note) + '"';
        if (n.done) attrs += ' _complete="true"';
        if (n.children && n.children.length) {
          lines.push('<outline' + attrs + '>');
          walk(n.children);
          lines.push('</outline>');
        } else {
          lines.push('<outline' + attrs + '/>');
        }
      });
    }
    walk(items);
    lines.push('</body>', '</opml>');
    return lines.join('\n');
  }

  window.StickySites.OutlineOps = {
    genId: genId,
    normalizeNode: normalizeNode,
    normalizeItems: normalizeItems,
    findParent: findParent,
    findNode: findNode,
    getPathTo: getPathTo,
    insertSiblingAfter: insertSiblingAfter,
    indentNode: indentNode,
    outdentNode: outdentNode,
    moveNode: moveNode,
    removeNode: removeNode,
    extractTags: extractTags,
    filterTree: filterTree,
    autoGroup: autoGroup,
    toMarkdown: toMarkdown,
    toOPML: toOPML
  };
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `outline-ops` and existing suites green.

- [ ] **Step 5: Commit**

```bash
git add src/content/outline-ops.js tests/outline-ops.test.js
git commit -m "feat(outline): pure tree-operations module with unit tests"
```

---

### Task 9: Outliner UI — global named library

The big one. New `src/content/outline.js` renders the outliner: document switcher, zoom/breadcrumb, keyboard suite, notes/checkboxes/drag, filter, exports, auto-group with undo. panel.js delegates to it; note-types.js stops keying outlines by hostname; the popup and message plumbing pass explicit outline keys.

**Files:**
- Create: `src/content/outline.js`
- Modify: `src/content/panel.js` (delegate `_renderOutline`, delete old renderer)
- Modify: `src/content/note-types.js` (outline entry)
- Modify: `src/content/sticky-inject.js` (`STICKYSITES_OPEN` with key)
- Modify: `popup.js` (async popout target for outlines)
- Modify: `manifest.json`, `popout.html` (script registration)
- Modify: `src/content/sticky-inject.css` (outline UI styles)

- [ ] **Step 1: Create `src/content/outline.js`**

```js
window.StickySites = window.StickySites || {};

// Outliner UI — a global library of named outline documents stored as a flat
// map in stickysites_outlines_v1. Legacy hostname-keyed records are adapted at
// read time (their map key doubles as the document name) and keep their key
// forever; new documents get ol_-prefixed keys.
(function () {
  var STORAGE_KEY = 'stickysites_outlines_v1';

  function formatSaved(iso) {
    if (!iso) return '';
    try { return 'Saved ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function newDocKey() {
    return 'ol_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function readRawMap() {
    var C = window.StickySites.Crypto;
    var stored = await chrome.storage.local.get(STORAGE_KEY);
    var raw = stored?.[STORAGE_KEY] || {};
    if (raw && C && C.isEncrypted(raw)) {
      try { raw = await C.decryptValue(raw); } catch { raw = {}; }
    }
    return raw;
  }

  async function writeRawMap(map) {
    var C = window.StickySites.Crypto;
    var toStore = map;
    if (C && await C.isEnabled() && await C.getCachedKey()) {
      toStore = await C.encryptValue(map);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
  }

  async function readLibrary() {
    var map = await readRawMap();
    var docs = Object.keys(map).map(function (k) {
      var r = map[k] || {};
      return {
        key: k,
        name: String(r.name || k),
        items: Array.isArray(r.items) ? r.items : [],
        createdAt: String(r.createdAt || ''),
        updatedAt: String(r.updatedAt || '')
      };
    });
    docs.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    return { map: map, docs: docs };
  }

  async function writeDoc(docKey, name, items) {
    var map = await readRawMap();
    var existing = map[docKey];
    map[docKey] = {
      key: docKey,
      name: String(name),
      items: items,
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await writeRawMap(map);
    return map[docKey];
  }

  async function deleteDoc(docKey) {
    var map = await readRawMap();
    delete map[docKey];
    await writeRawMap(map);
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.StickySites.Outline = {
    readLibrary: readLibrary,
    writeDoc: writeDoc,
    newDocKey: newDocKey,

    // explicitKey: chosen by the in-panel switcher; otherwise the noteType's
    // getKey (popout URL param / popup card) or the activeOutlineId pref wins.
    render: async function (panel, noteType, explicitKey) {
      var self = this;
      var Ops = window.StickySites.OutlineOps;
      var el = panel.el;
      while (el.firstChild) el.removeChild(el.firstChild);

      // ── Resolve the document ────────────────────────────────
      var requested = explicitKey || '';
      if (!requested) {
        try { requested = noteType.getKey(location) || ''; } catch { requested = ''; }
      }
      var lib = await readLibrary();
      var prefs = await window.StickySites.Prefs.read();
      var docKey = null;
      if (requested && lib.map[requested]) docKey = requested;
      else if (prefs.activeOutlineId && lib.map[prefs.activeOutlineId]) docKey = prefs.activeOutlineId;
      else if (lib.docs.length) docKey = lib.docs[0].key;
      if (!docKey) {
        docKey = newDocKey();
        await writeDoc(docKey, 'My outline', []);
        lib = await readLibrary();
      }
      await window.StickySites.Prefs.write({ activeOutlineId: docKey });

      var doc = null;
      for (var di = 0; di < lib.docs.length; di++) {
        if (lib.docs[di].key === docKey) { doc = lib.docs[di]; break; }
      }
      var docName = doc ? doc.name : 'My outline';
      var items = Ops.normalizeItems(doc ? doc.items : []);
      if (items.length === 0) items.push(Ops.normalizeNode({ text: '' }));
      var updatedAt = doc ? doc.updatedAt : '';

      // The popout and drag-out read these instead of recomputing from location.
      panel._activeKey = docKey;
      panel._activeLabel = 'Outline — ' + docName;
      if (location.protocol === 'chrome-extension:') {
        document.title = panel._activeLabel + ' — StickySites';
      }

      // ── UI state (not persisted) ────────────────────────────
      var zoomId = null;
      var filterQuery = '';
      var openNotes = {};
      var undoSnapshot = null;

      function rerenderDoc(key) {
        // Full re-entry: flush pending writes, then re-render with the new doc.
        panel.flushPendingSave().then(function () {
          self.render(panel, noteType, key);
        });
      }

      // ── Header ──────────────────────────────────────────────
      var header = document.createElement('div');
      header.className = 'stickysites-panel-header';
      header.style.background = noteType.tint;
      header.style.color = noteType.tintText;
      var iconEl = document.createElement('span');
      iconEl.className = 'stickysites-panel-icon';
      iconEl.style.background = noteType.color;
      iconEl.textContent = noteType.emoji;

      var switcher = document.createElement('select');
      switcher.className = 'stickysites-outline-switcher';
      lib.docs.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d.key;
        opt.textContent = d.name;
        if (d.key === docKey) opt.selected = true;
        switcher.appendChild(opt);
      });
      switcher.addEventListener('change', function () {
        rerenderDoc(switcher.value);
      });

      var closeBtn = document.createElement('button');
      closeBtn.className = 'stickysites-panel-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', function () { if (panel.onClose) panel.onClose(); });

      var expandBtn = document.createElement('button');
      expandBtn.className = 'stickysites-panel-headerbtn';
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand';
      expandBtn.addEventListener('click', function () {
        panel._toggleExpand();
        expandBtn.textContent = panel._isExpanded ? '⤡' : '⤢';
        expandBtn.title = panel._isExpanded ? 'Shrink' : 'Expand';
      });

      var popoutBtn = document.createElement('button');
      popoutBtn.className = 'stickysites-panel-headerbtn';
      popoutBtn.textContent = '⧉';
      popoutBtn.title = 'Open in own window';
      popoutBtn.addEventListener('click', function () { panel._popoutActiveNote(); });

      header.append(iconEl, switcher, popoutBtn, expandBtn, closeBtn);

      // ── Toolbar ─────────────────────────────────────────────
      var toolbar = document.createElement('div');
      toolbar.className = 'stickysites-outline-toolbar';

      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'stickysites-outline-search';
      searchInput.placeholder = 'Filter...';
      searchInput.addEventListener('input', function () {
        filterQuery = searchInput.value;
        renderAll();
      });

      var collapseAllBtn = document.createElement('button');
      collapseAllBtn.className = 'stickysites-outline-toolbtn';
      collapseAllBtn.textContent = '⊟';
      collapseAllBtn.title = 'Collapse all';
      collapseAllBtn.addEventListener('click', function () {
        setAllCollapsed(items, true);
        renderAll();
        save();
      });

      var expandAllBtn = document.createElement('button');
      expandAllBtn.className = 'stickysites-outline-toolbtn';
      expandAllBtn.textContent = '⊞';
      expandAllBtn.title = 'Expand all';
      expandAllBtn.addEventListener('click', function () {
        setAllCollapsed(items, false);
        renderAll();
        save();
      });

      var menuBtn = document.createElement('button');
      menuBtn.className = 'stickysites-outline-toolbtn';
      menuBtn.textContent = '⋯';
      menuBtn.title = 'More actions';
      menuBtn.addEventListener('click', showMenu);

      toolbar.append(searchInput, collapseAllBtn, expandAllBtn, menuBtn);

      function setAllCollapsed(arr, value) {
        arr.forEach(function (n) {
          if (n.children && n.children.length) {
            n.collapsed = value;
            setAllCollapsed(n.children, value);
          }
        });
      }

      function showMenu() {
        var existing = el.querySelector('.stickysites-outline-menu');
        if (existing) { existing.remove(); return; }
        var menu = document.createElement('div');
        menu.className = 'stickysites-outline-menu';

        function item(label, fn) {
          var b = document.createElement('button');
          b.className = 'stickysites-outline-menu-item';
          b.textContent = label;
          b.addEventListener('click', function () { menu.remove(); fn(); });
          return b;
        }

        menu.append(
          item('New outline…', async function () {
            var name = prompt('Outline name:');
            if (!name || !name.trim()) return;
            var key = newDocKey();
            await writeDoc(key, name.trim(), []);
            rerenderDoc(key);
          }),
          item('Rename…', async function () {
            var name = prompt('Rename outline:', docName);
            if (!name || !name.trim()) return;
            docName = name.trim();
            panel._activeLabel = 'Outline — ' + docName;
            await saveNow();
            rerenderDoc(docKey);
          }),
          item('Duplicate', async function () {
            var key = newDocKey();
            await writeDoc(key, docName + ' copy', JSON.parse(JSON.stringify(items)));
            rerenderDoc(key);
          }),
          item('Delete…', async function () {
            if (!confirm('Delete outline "' + docName + '"? This cannot be undone.')) return;
            await deleteDoc(docKey);
            await window.StickySites.Prefs.write({ activeOutlineId: null });
            rerenderDoc('');
          }),
          item('Auto-group into hierarchy', function () {
            doAutoGroup();
          }),
          item('Export Markdown', function () {
            var base = docName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'outline';
            downloadText(base + '.md', Ops.toMarkdown(items), 'text/markdown');
          }),
          item('Export OPML', function () {
            var base = docName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'outline';
            downloadText(base + '.opml', Ops.toOPML(items, docName), 'text/xml');
          })
        );

        toolbar.style.position = 'relative';
        toolbar.appendChild(menu);
        setTimeout(function () {
          var dismiss = function (e) {
            if (!menu.contains(e.target) && e.target !== menuBtn) {
              menu.remove();
              document.removeEventListener('click', dismiss, true);
            }
          };
          document.addEventListener('click', dismiss, true);
        }, 0);
      }

      // ── Breadcrumb (zoom) ───────────────────────────────────
      var breadcrumb = document.createElement('div');
      breadcrumb.className = 'stickysites-outline-breadcrumb';

      function renderBreadcrumb() {
        while (breadcrumb.firstChild) breadcrumb.removeChild(breadcrumb.firstChild);
        if (!zoomId) { breadcrumb.style.display = 'none'; return; }
        breadcrumb.style.display = '';
        var path = Ops.getPathTo(items, zoomId) || [];
        var crumbs = [{ id: null, label: docName }];
        path.slice(0, -1).forEach(function (n) {
          crumbs.push({ id: n.id, label: n.text || '(untitled)' });
        });
        crumbs.forEach(function (c, i) {
          var b = document.createElement('button');
          b.className = 'stickysites-outline-crumb';
          b.textContent = c.label;
          b.addEventListener('click', function () {
            zoomId = c.id;
            renderBreadcrumb();
            renderAll();
          });
          breadcrumb.appendChild(b);
          if (i < crumbs.length - 1) {
            var sep = document.createElement('span');
            sep.className = 'stickysites-outline-crumb-sep';
            sep.textContent = '›';
            breadcrumb.appendChild(sep);
          }
        });
        var zoomed = path[path.length - 1];
        if (zoomed) {
          var title = document.createElement('input');
          title.type = 'text';
          title.className = 'stickysites-outline-zoom-title';
          title.value = zoomed.text;
          title.addEventListener('input', function () {
            zoomed.text = title.value;
            zoomed.tags = Ops.extractTags(title.value);
            save();
          });
          breadcrumb.appendChild(title);
        }
      }

      // ── List ────────────────────────────────────────────────
      var listEl = document.createElement('div');
      listEl.className = 'stickysites-outline-list';

      // ── Undo bar (auto-group) ───────────────────────────────
      var undoBar = document.createElement('div');
      undoBar.className = 'stickysites-outline-undobar';
      undoBar.style.display = 'none';
      var undoMsg = document.createElement('span');
      undoMsg.textContent = 'Outline regrouped.';
      var undoBtn = document.createElement('button');
      undoBtn.className = 'stickysites-outline-toolbtn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', function () {
        if (!undoSnapshot) return;
        items.length = 0;
        Array.prototype.push.apply(items, Ops.normalizeItems(undoSnapshot));
        undoSnapshot = null;
        undoBar.style.display = 'none';
        zoomId = null;
        renderBreadcrumb();
        renderAll();
        updateCount();
        save();
      });
      undoBar.append(undoMsg, undoBtn);

      var undoTimer = null;
      function doAutoGroup() {
        undoSnapshot = JSON.parse(JSON.stringify(items));
        var grouped = Ops.autoGroup(items);
        items.length = 0;
        Array.prototype.push.apply(items, grouped);
        zoomId = null;
        renderBreadcrumb();
        renderAll();
        updateCount();
        save();
        undoBar.style.display = '';
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(function () { undoBar.style.display = 'none'; }, 10000);
      }

      // ── Footer ──────────────────────────────────────────────
      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';
      var nodeCount = document.createElement('span');
      var savedEl = document.createElement('span');
      savedEl.className = 'stickysites-panel-saved';
      savedEl.textContent = formatSaved(updatedAt);
      footer.append(nodeCount, savedEl);

      function countNodes(arr) {
        var c = 0;
        arr.forEach(function (n) {
          c += 1;
          if (n.children && n.children.length) c += countNodes(n.children);
        });
        return c;
      }

      function updateCount() {
        nodeCount.textContent = countNodes(items) + ' nodes';
      }

      // ── Saving ──────────────────────────────────────────────
      function saveNow() {
        return writeDoc(docKey, docName, items).then(function (rec) {
          if (rec) savedEl.textContent = formatSaved(rec.updatedAt);
        });
      }
      function save() {
        if (panel._saveTimer) clearTimeout(panel._saveTimer);
        panel._saveTimer = setTimeout(function () { panel._saveTimer = null; saveNow(); }, 500);
      }
      panel._flushSave = saveNow;

      // ── Rendering ───────────────────────────────────────────
      function getRenderRoots() {
        if (!zoomId) return items;
        var z = Ops.findNode(zoomId, items);
        return z ? z.children : items;
      }

      function focusNode(id, caretStart) {
        var inp = listEl.querySelector('input[data-node-id="' + id + '"]');
        if (inp) {
          inp.focus();
          var p = caretStart ? 0 : inp.value.length;
          inp.setSelectionRange(p, p);
        }
      }

      function visibleInputs() {
        return Array.from(listEl.querySelectorAll('.stickysites-outline-text'));
      }

      function renderChips(chipsEl, node, input) {
        while (chipsEl.firstChild) chipsEl.removeChild(chipsEl.firstChild);
        (node.tags || []).forEach(function (tag) {
          var chip = document.createElement('span');
          chip.className = 'stickysites-outline-tag';
          chip.textContent = tag;
          chip.title = 'Remove tag';
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            // Auto-tags derive from the text; removing the chip removes the token.
            node.text = node.text.replace(new RegExp('\\s*' + escapeRegExp(tag) + '\\b', 'gi'), '').trim();
            node.tags = Ops.extractTags(node.text);
            if (input) input.value = node.text;
            renderChips(chipsEl, node, input);
            save();
          });
          chipsEl.appendChild(chip);
        });
      }

      function renderNode(node, depth, visibleSet) {
        if (visibleSet && !visibleSet.has(node.id)) return null;

        var container = document.createElement('div');

        var row = document.createElement('div');
        row.className = 'stickysites-outline-node' + (node.done ? ' is-done' : '');
        row.dataset.nodeId = node.id;
        row.style.paddingLeft = (depth * 20 + 8) + 'px';

        var grip = document.createElement('span');
        grip.className = 'stickysites-outline-grip';
        grip.textContent = '⠇';

        var hasChildren = node.children && node.children.length;
        var chevron = document.createElement('span');
        chevron.className = 'stickysites-outline-chevron';
        chevron.textContent = hasChildren ? (node.collapsed ? '▸' : '▾') : '';
        chevron.addEventListener('click', function () {
          if (!hasChildren) return;
          node.collapsed = !node.collapsed;
          renderAll();
          save();
        });

        var bullet = document.createElement('span');
        bullet.className = 'stickysites-outline-bullet';
        bullet.textContent = '•';
        bullet.title = 'Zoom in';
        bullet.addEventListener('click', function () {
          zoomId = node.id;
          renderBreadcrumb();
          renderAll();
        });

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'stickysites-outline-check';
        cb.checked = node.done;
        cb.addEventListener('change', function () {
          node.done = cb.checked;
          renderAll();
          save();
        });

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'stickysites-outline-text';
        input.value = node.text;
        input.placeholder = 'New item...';
        input.dataset.nodeId = node.id;

        var chipsEl = document.createElement('span');
        chipsEl.className = 'stickysites-outline-tags';
        renderChips(chipsEl, node, input);

        input.addEventListener('input', function () {
          node.text = input.value;
          node.tags = Ops.extractTags(input.value);
          renderChips(chipsEl, node, input); // in-place — keeps focus in the input
          save();
        });

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            node.done = !node.done;
            renderAll();
            focusNode(node.id);
            save();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            var newNode = Ops.normalizeNode({ text: '' });
            if (Ops.insertSiblingAfter(items, node.id, newNode)) {
              renderAll();
              updateCount();
              save();
              focusNode(newNode.id);
            }
            return;
          }
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            if (Ops.indentNode(items, node.id)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            var loc = Ops.findParent(node.id, items, null);
            // Don't outdent past the zoomed root — the node would leave the view.
            if (loc && loc.parent && loc.parent.id !== zoomId && Ops.outdentNode(items, node.id)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
            e.preventDefault();
            if (Ops.moveNode(items, node.id, e.key === 'ArrowUp' ? -1 : 1)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            var inputs = visibleInputs();
            var idx = inputs.indexOf(input);
            var next = inputs[idx + (e.key === 'ArrowUp' ? -1 : 1)];
            if (next) {
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
            }
            return;
          }
          if (e.key === 'Backspace' && input.value === '') {
            e.preventDefault();
            var inputs2 = visibleInputs();
            var idx2 = inputs2.indexOf(input);
            var loc2 = Ops.findParent(node.id, items, null);
            if (loc2 && !(countNodes(items) === 1)) {
              Ops.removeNode(items, node.id);
              renderAll();
              updateCount();
              save();
              var remaining = visibleInputs();
              var target = remaining[Math.max(0, idx2 - 1)];
              if (target) {
                target.focus();
                target.setSelectionRange(target.value.length, target.value.length);
              }
            }
            return;
          }
          if (e.key === 'Escape') input.blur();
        });

        var noteBtn = document.createElement('button');
        noteBtn.className = 'stickysites-outline-notebtn' + (node.note ? ' has-note' : '');
        noteBtn.textContent = '\u{1F4DD}';
        noteBtn.title = node.note ? 'Edit note' : 'Add note';
        noteBtn.addEventListener('click', function () {
          openNotes[node.id] = !openNotes[node.id];
          renderAll();
          if (openNotes[node.id]) {
            var ta = listEl.querySelector('textarea[data-node-id="' + node.id + '"]');
            if (ta) ta.focus();
          }
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'stickysites-outline-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function () {
          Ops.removeNode(items, node.id);
          renderAll();
          updateCount();
          save();
        });

        row.append(grip, chevron, bullet, cb, input, chipsEl, noteBtn, delBtn);
        container.appendChild(row);

        if (openNotes[node.id]) {
          var noteArea = document.createElement('div');
          noteArea.className = 'stickysites-outline-note-area';
          noteArea.style.paddingLeft = (depth * 20 + 36) + 'px';
          var ta = document.createElement('textarea');
          ta.className = 'stickysites-outline-note-edit';
          ta.placeholder = 'Add notes...';
          ta.value = node.note || '';
          ta.dataset.nodeId = node.id;
          ta.addEventListener('input', function () {
            node.note = ta.value;
            noteBtn.classList.toggle('has-note', !!node.note);
            save();
          });
          noteArea.appendChild(ta);
          container.appendChild(noteArea);
        }

        var ignoreCollapse = !!visibleSet; // expand everything while filtering
        if ((!node.collapsed || ignoreCollapse) && hasChildren) {
          node.children.forEach(function (child) {
            var childEl = renderNode(child, depth + 1, visibleSet);
            if (childEl) container.appendChild(childEl);
          });
        }

        return container;
      }

      function renderAll() {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        var visibleSet = Ops.filterTree(items, filterQuery);
        getRenderRoots().forEach(function (n) {
          var nodeEl = renderNode(n, 0, visibleSet);
          if (nodeEl) listEl.appendChild(nodeEl);
        });
      }

      // ── Drag to reorder (tree-aware) ────────────────────────
      listEl.addEventListener('mousedown', function (e) {
        var grip = e.target.closest('.stickysites-outline-grip');
        if (!grip) return;
        var rowEl = grip.closest('.stickysites-outline-node');
        var dragId = rowEl && rowEl.dataset.nodeId;
        if (!dragId) return;
        e.preventDefault();
        rowEl.classList.add('is-dragging');
        var indicator = document.createElement('div');
        indicator.className = 'stickysites-outline-drop-indicator';
        listEl.style.position = 'relative';
        listEl.appendChild(indicator);
        var targetId = null;
        var after = false;

        function onMove(ev) {
          var rows = Array.from(listEl.querySelectorAll('.stickysites-outline-node'))
            .filter(function (r) { return r.dataset.nodeId !== dragId; });
          var best = null, bestDist = Infinity, bestAfter = false;
          rows.forEach(function (r) {
            var rect = r.getBoundingClientRect();
            var mid = rect.top + rect.height / 2;
            var d = Math.abs(ev.clientY - mid);
            if (d < bestDist) { bestDist = d; best = r; bestAfter = ev.clientY > mid; }
          });
          if (!best) { targetId = null; indicator.style.display = 'none'; return; }
          // Refuse to drop a node into its own subtree.
          var path = Ops.getPathTo(items, best.dataset.nodeId) || [];
          var inOwnSubtree = false;
          path.forEach(function (n) { if (n.id === dragId) inOwnSubtree = true; });
          if (inOwnSubtree) { targetId = null; indicator.style.display = 'none'; return; }
          targetId = best.dataset.nodeId;
          after = bestAfter;
          var listRect = listEl.getBoundingClientRect();
          var rect2 = best.getBoundingClientRect();
          indicator.style.display = '';
          indicator.style.top = ((after ? rect2.bottom : rect2.top) - listRect.top + listEl.scrollTop) + 'px';
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          rowEl.classList.remove('is-dragging');
          indicator.remove();
          if (targetId) {
            var from = Ops.findParent(dragId, items, null);
            if (from) {
              var moved = from.array.splice(from.index, 1)[0];
              var to = Ops.findParent(targetId, items, null);
              if (to) {
                to.array.splice(to.index + (after ? 1 : 0), 0, moved);
              } else {
                from.array.splice(from.index, 0, moved); // target vanished — put it back
              }
              renderAll();
              updateCount();
              save();
            }
          }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // ── Add node ────────────────────────────────────────────
      var addBtn = document.createElement('button');
      addBtn.className = 'stickysites-outline-add';
      addBtn.textContent = '+ Add node';
      addBtn.addEventListener('click', function () {
        var newNode = Ops.normalizeNode({ text: '' });
        getRenderRoots().push(newNode);
        renderAll();
        updateCount();
        save();
        focusNode(newNode.id);
      });

      // ── Assemble ────────────────────────────────────────────
      renderBreadcrumb();
      renderAll();
      updateCount();
      if (!doc) saveNow();

      el.append(header, toolbar, breadcrumb, listEl, addBtn, undoBar, footer);
    }
  };
})();
```

- [ ] **Step 2: panel.js delegates and drops the old renderer**

In `src/content/panel.js`:

1. In `_render`, replace
   `if (noteType.id === 'outline') { this._renderOutline(noteType, note); return; }` with:

```js
        if (noteType.id === 'outline') { window.StickySites.Outline.render(this, noteType); return; }
```

2. Delete the entire `_renderOutline` method (from `_renderOutline: function (noteType, note) {` through its closing `},` — currently panel.js:1692-1935).

- [ ] **Step 3: note-types.js outline entry becomes location-independent**

In `src/content/note-types.js`, in the outline entry, replace the `getKey`/`getLabel` lines with:

```js
      getKey: function () { return ''; },
      getLabel: function () { return 'Outliner'; },
```

(The renderer resolves the actual document and overwrites `panel._activeKey`/`_activeLabel`; the popout still works because popout.js overrides `getKey` with the URL param.)

- [ ] **Step 4: STICKYSITES_OPEN accepts an outline key**

In `src/content/sticky-inject.js`, replace the `STICKYSITES_OPEN` branch of the `chrome.runtime.onMessage` listener with:

```js
    if (msg?.type === 'STICKYSITES_OPEN') {
      var noteType = findNoteType(msg.noteTypeId);
      if (noteType) {
        (async function () {
          // A popup card click can target a specific outline document.
          if (msg.key && noteType.id === 'outline') {
            await window.StickySites.Prefs.write({ activeOutlineId: msg.key });
          }
          if (SS.Cluster.hidden) SS.Cluster.toggle();
          SS.Cluster.setActive(noteType.id);
          SS.Panel.open(noteType);
        })();
      }
    }
```

- [ ] **Step 5: popup popout target resolves the active outline**

In `popup.js`, make `computePopoutTarget` async with an outline branch, and await it:

```js
  async function computePopoutTarget(typeId, tabUrl) {
    if (typeId === 'global') return { key: '__global__', label: 'Global note' };
    if (typeId === 'todo') return { key: '__global__', label: 'To-do list' };
    if (typeId === 'daily') { var d = todayKey(); return { key: d, label: 'Daily — ' + d }; }
    if (typeId === 'outline') {
      var stored = await chrome.storage.local.get('stickysites_prefs_v1');
      var pid = (stored?.stickysites_prefs_v1 || {}).activeOutlineId || '';
      return { key: pid, label: 'Outliner' };
    }
    try {
      var u = new URL(tabUrl);
      var host = u.hostname.replace(/^www\./, '');
      if (typeId === 'site') return { key: host, label: 'Site note — ' + host };
      if (typeId === 'page') return { key: u.origin + u.pathname, label: 'Page note — ' + u.pathname };
    } catch { /* fall through */ }
    return { key: '', label: '' };
  }
```

And in `openNoteType`, change `var target = computePopoutTarget(typeId, tab && tab.url);`
to `var target = await computePopoutTarget(typeId, tab && tab.url);`.

- [ ] **Step 6: Register the new scripts**

In `manifest.json`, in the content-scripts `js` array, insert after `"src/content/todo.js"`:

```json
        "src/content/outline-ops.js",
        "src/content/outline.js",
```

In `popout.html`, insert after the `todo.js` script tag:

```html
  <script src="src/content/outline-ops.js"></script>
  <script src="src/content/outline.js"></script>
```

- [ ] **Step 7: Outline UI styles**

Append to `src/content/sticky-inject.css`:

```css
/* Outliner — library, toolbar, tree */
.stickysites-outline-switcher {
  flex: 1;
  min-width: 0;
  background: rgba(15, 23, 42, 0.35);
  color: inherit;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 3px 6px;
}
.stickysites-outline-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}
.stickysites-outline-search {
  flex: 1;
  min-width: 0;
  background: rgba(15, 23, 42, 0.5);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 8px;
}
.stickysites-outline-toolbtn {
  background: rgba(148, 163, 184, 0.12);
  color: #cbd5e1;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 8px;
}
.stickysites-outline-toolbtn:hover { background: rgba(148, 163, 184, 0.25); }
.stickysites-outline-menu {
  position: absolute;
  top: 100%;
  right: 8px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 180px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.stickysites-outline-menu-item {
  background: none;
  border: none;
  color: #e2e8f0;
  cursor: pointer;
  font-size: 12px;
  padding: 8px 12px;
  text-align: left;
}
.stickysites-outline-menu-item:hover { background: rgba(148, 163, 184, 0.15); }
.stickysites-outline-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}
.stickysites-outline-crumb {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.stickysites-outline-crumb:hover { color: #e2e8f0; text-decoration: underline; }
.stickysites-outline-crumb-sep { color: #475569; font-size: 12px; }
.stickysites-outline-zoom-title {
  flex-basis: 100%;
  background: none;
  border: none;
  outline: none;
  color: #f8fafc;
  font-size: 15px;
  font-weight: 700;
  padding: 4px 0 0;
}
.stickysites-outline-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 0;
}
.stickysites-outline-node.is-dragging { opacity: 0.4; }
.stickysites-outline-node.is-done .stickysites-outline-text {
  text-decoration: line-through;
  color: #64748b;
}
.stickysites-outline-grip {
  color: #475569;
  cursor: grab;
  font-size: 11px;
  user-select: none;
}
.stickysites-outline-chevron {
  width: 12px;
  color: #94a3b8;
  cursor: pointer;
  font-size: 10px;
  text-align: center;
  user-select: none;
}
.stickysites-outline-bullet {
  color: #fb923c;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}
.stickysites-outline-bullet:hover { transform: scale(1.4); }
.stickysites-outline-check { accent-color: #fb923c; }
.stickysites-outline-tags { display: inline-flex; gap: 3px; }
.stickysites-outline-tag {
  background: rgba(251, 146, 60, 0.2);
  border-radius: 8px;
  color: #fdba74;
  cursor: pointer;
  font-size: 10px;
  padding: 1px 6px;
  white-space: nowrap;
}
.stickysites-outline-notebtn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  opacity: 0.25;
}
.stickysites-outline-notebtn.has-note { opacity: 1; }
.stickysites-outline-note-area { padding: 2px 8px 4px 0; }
.stickysites-outline-note-edit {
  width: 100%;
  min-height: 40px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #cbd5e1;
  font-size: 12px;
  padding: 6px 8px;
  resize: vertical;
}
.stickysites-outline-drop-indicator {
  position: absolute;
  left: 12px;
  right: 12px;
  height: 2px;
  background: #fb923c;
  pointer-events: none;
}
.stickysites-outline-undobar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(251, 146, 60, 0.12);
  color: #fdba74;
  font-size: 12px;
}
```

- [ ] **Step 8: Run tests + commit**

Run: `npm test` → PASS.

```bash
git add src/content/outline.js src/content/panel.js src/content/note-types.js src/content/sticky-inject.js src/content/sticky-inject.css popup.js manifest.json popout.html
git commit -m "feat(outline): global named outline library with zoom, keyboard suite, export, auto-group"
```

---

### Task 10: Clip handler — active outline + todo field preservation

Clipping to the outline must append to the *active* document; clipping to the todo list currently drops `sections`/`tagColors` (data loss).

**Files:**
- Modify: `src/content/sticky-inject.js`

- [ ] **Step 1: Replace the structured branch of `clipToNote`**

In `clipToNote`, replace everything inside `if (nt.storagePattern === 'structured') { ... }` with:

```js
      var stored = await chrome.storage.local.get(nt.storageKey);
      var rawMap = stored?.[nt.storageKey] || {};
      if (C && C.isEncrypted(rawMap)) rawMap = await C.decryptValue(rawMap);
      var map = rawMap;
      var newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var nowIso = new Date().toISOString();

      if (noteTypeId === 'todo') {
        var record = map[key];
        var items = (record && Array.isArray(record.items)) ? record.items : [];
        items.push({ id: newId, text: text, done: false, indent: 0, priority: 0, color: '', tags: [], note: '', section: '', completedAt: '' });
        // Preserve sections/tagColors and any other fields the panel wrote.
        map[key] = Object.assign({}, record, {
          key: key,
          items: items,
          createdAt: (record && record.createdAt) || nowIso,
          updatedAt: nowIso
        });
      } else if (noteTypeId === 'outline') {
        // Append to the active outline document (or the most recent / a new one).
        var prefsStored = await chrome.storage.local.get('stickysites_prefs_v1');
        var pid = (prefsStored?.stickysites_prefs_v1 || {}).activeOutlineId;
        var docKey = (pid && map[pid]) ? pid : Object.keys(map)[0];
        if (!docKey) docKey = 'ol_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var oRecord = map[docKey];
        var oItems = (oRecord && Array.isArray(oRecord.items)) ? oRecord.items : [];
        oItems.push({ id: newId, text: text, children: [], collapsed: false, note: '', done: false, tags: [] });
        map[docKey] = Object.assign({}, oRecord, {
          key: docKey,
          name: (oRecord && (oRecord.name || docKey)) || 'My outline',
          items: oItems,
          createdAt: (oRecord && oRecord.createdAt) || nowIso,
          updatedAt: nowIso
        });
      }

      var mapToStore = map;
      if (C && await C.isEnabled() && await C.getCachedKey()) {
        mapToStore = await C.encryptValue(map);
      }
      await chrome.storage.local.set({ [nt.storageKey]: mapToStore });
```

- [ ] **Step 2: Commit**

```bash
git add src/content/sticky-inject.js
git commit -m "fix(clip): clip to active outline; stop dropping todo sections and tag colors"
```

---

### Task 11: Version bump + documentation

**Files:**
- Modify: `manifest.json`, `package.json` (version)
- Modify: `CLAUDE.md`
- Modify: `docs/*.md` (stale outliner/schema claims)

- [ ] **Step 1: Bump versions**

In `manifest.json` and `package.json`: `"version": "1.10.0"`.

- [ ] **Step 2: Update CLAUDE.md**

Targeted edits (keep surrounding structure):

1. `Version: **1.8.0**` → `Version: **1.10.0**`.
2. In the repo tree comments, add below the `todo.js` line:
   `outline-ops.js        # window.StickySites.OutlineOps — pure outline tree ops (unit-tested)` and
   `outline.js            # window.StickySites.Outline — outliner UI (global named library)`.
3. Note-types table, outline row: change pattern note to `structured (global library of named docs, keys ol_<id>; legacy hostname keys adapted at read time)`.
4. Storage keys block: change the `stickysites_outlines_v1` line to
   `stickysites_outlines_v1  # Map of outlineKey → { key, name, items, ... } (named outline docs)`
   and the prefs line to include `activeOutlineId`.
5. Add a `### Canonical record schema` bullet under Key facts:
   "Map-pattern records store `key` + `label` (site/page/daily). Readers must fall back to legacy `siteKey`/`pageKey`/`dateKey` fields written before v1.10."
6. Add under "Rich text editor": "`syncFromStorage` guards: self-echo (skips the body this panel just wrote), focus (never rewrites while the editor is focused), encryption (decrypts the envelope or skips while locked). Panel snapshots `_activeKey`/`_activeLabel` at `open()` — all saves use the snapshot."
7. Chord hotkeys section: note that number chords and badges follow the **visible cluster order** (reorder-aware), not registry order.
8. Add an icons note under Cluster: "Cluster icons are identity-bearing: 🌐 (global), domain fragment (site), trailing path segment (page), day-of-month (daily); refreshed on SPA navigation by the URL watcher in sticky-inject.js."
9. Message types table: STICKYSITES_OPEN purpose becomes "Open a specific note type (optional `key` selects an outline doc)".

- [ ] **Step 3: Sweep docs/ for stale claims**

Run: `grep -rn -i "outline\|siteKey\|pageKey" docs/*.md`
For each hit describing the outliner as per-site/hostname-keyed, or describing record
fields as `siteKey`/`pageKey`/`dateKey`, update to the new canonical wording from Step 2.
Files most likely affected: `docs/ARCHITECTURE.md`, `docs/COMPONENTS.md`,
`docs/codebase-overview.md`, `docs/TESTING.md`.

- [ ] **Step 4: Commit**

```bash
git add manifest.json package.json CLAUDE.md docs/
git commit -m "chore: bump to 1.10.0; document outline library, canonical schema, icon identity"
```

---

### Task 12: Full test run + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `npm test`
Expected: PASS — crypto, notes-storage (canonical + legacy fallback), outline-ops.

- [ ] **Step 2: Live verification (Chrome DevTools MCP or manual)**

Load the unpacked extension (`chrome://extensions` → reload). Then verify, on a real site:

1. **Flicker**: open a Site note, type continuously for ~5 s (past several 500 ms save
   cycles). Caret must never jump. Repeat with encryption enabled+unlocked — content must
   never blank.
2. **Page identity**: on an SPA (e.g. any GitHub repo page), open the Page note, type
   "AAA", client-side-navigate to another page; the panel must reload empty (new key);
   type "BBB"; navigate back — "AAA" intact, no cross-contamination in
   `chrome.storage.local` (`stickysites_pages_v1` has distinct keys/bodies).
3. **Popup**: cards show "Site note — <host>", "Page note — /<path>", "Daily — <date>";
   the cards matching the current tab are not dimmed and open on click.
4. **Icons**: globe (global), 4-char domain (site), path fragment (page), day number
   (daily); tooltips show full values; page icon updates after SPA navigation.
5. **Chords**: reorder two icons (long-press drag), press Alt+S to re-show badges; the
   number shown on each badge opens that icon's note.
6. **Outliner**: create a second outline via ⋯ → New; switch between docs from another
   site; Enter/Tab/Shift+Tab/Alt+↑↓ behave with stable focus; bullet click zooms with
   breadcrumb; filter shows matches with ancestors; `#tag` typing chips instantly;
   ⋯ → Auto-group produces tag/keyword parents and Undo restores; Export Markdown/OPML
   download correct files; popout opens the same document.
7. **Clip**: select text → right-click → Add to Outline lands in the active outline;
   Add to To-do preserves existing sections.

- [ ] **Step 3: Fix anything found, re-run, commit fixes**

```bash
git add -A
git commit -m "fix: live-verification follow-ups"
```

---

## Self-review notes (already applied)

- Outline `getKey` stays hostname-based through Tasks 5-8 and only changes in Task 9
  together with the renderer swap — no intermediate broken state.
- `panel._activeKey` is written by `Panel.open()` (Task 3) and overwritten by
  `Outline.render()` (Task 9) — popout/drag-out always reads the resolved doc key.
- `flushPendingSave` (Task 3) is reused by the URL watcher (Task 6), `_popoutActiveNote`
  (Task 3), and the outline doc switcher (Task 9); todo (Task 3) and outline (Task 9)
  renderers both set `_flushSave` so structured edits survive flushes.
- Names consistent across tasks: `OutlineOps.{normalizeNode,normalizeItems,findParent,findNode,getPathTo,insertSiblingAfter,indentNode,outdentNode,moveNode,removeNode,extractTags,filterTree,autoGroup,toMarkdown,toOPML,genId}`;
  `Cluster.{_setIconContent,refreshIcons,getVisibleIcons,getVisibleTypeIds}`;
  `Panel.{_activeKey,_activeLabel,_lastSavedBody,flushPendingSave}`.
