# Phase 1: Floating Notes Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opaque fixed sidebar with a floating draggable icon cluster, add page-level (blue) notes, and render notes in a larger workspace panel.

**Architecture:** Modular content script using `window.StickySites` namespace (no bundler). Icon registry defines note types declaratively. Panel reads/writes storage generically based on `storagePattern` field (`'single'` for global, `'map'` for site/page). Cluster handles drag with position persistence.

**Tech Stack:** Vanilla JS, Chrome Extension MV3, Vitest for unit tests, `chrome.storage.local`

**Spec:** `docs/superpowers/specs/2026-05-26-phase1-floating-notes-design.md`

---

### Task 1: Test infrastructure + existing storage function tests

**Files:**
- Create: `tests/notes-storage.test.js`

- [ ] **Step 1: Create test file with chrome storage mock and tests for existing functions**

```js
// tests/notes-storage.test.js
import { describe, it, expect, beforeEach } from 'vitest';

let store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
        return { ...store };
      },
      set: async (items) => { Object.assign(store, items); },
      remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
    }
  }
};

import {
  getSiteKey, readGlobalNote, writeGlobalNote,
  readSiteNote, writeSiteNote, deleteSiteNote, readAllSiteNotes,
  parseTags, createDebouncedSaver
} from '../src/shared/notes-storage.js';

describe('getSiteKey', () => {
  it('extracts hostname from URL', () => {
    expect(getSiteKey('https://example.com/path')).toBe('example.com');
  });
  it('strips www prefix', () => {
    expect(getSiteKey('https://www.example.com')).toBe('example.com');
  });
  it('returns empty string for invalid URL', () => {
    expect(getSiteKey('not-a-url')).toBe('');
  });
});

describe('parseTags', () => {
  it('returns empty array for empty input', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });
  it('splits on commas and spaces', () => {
    expect(parseTags('foo, bar baz')).toEqual(['#foo', '#bar', '#baz']);
  });
  it('preserves existing # prefix', () => {
    expect(parseTags('#foo #bar')).toEqual(['#foo', '#bar']);
  });
  it('deduplicates', () => {
    expect(parseTags('foo foo #foo')).toEqual(['#foo']);
  });
  it('lowercases', () => {
    expect(parseTags('FOO Bar')).toEqual(['#foo', '#bar']);
  });
});

describe('global note', () => {
  beforeEach(() => { store = {}; });

  it('reads empty note when none exists', async () => {
    const note = await readGlobalNote();
    expect(note).toEqual({ body: '', updatedAt: '' });
  });

  it('writes and reads back', async () => {
    const written = await writeGlobalNote('hello');
    expect(written.body).toBe('hello');
    expect(written.updatedAt).toBeTruthy();
    const read = await readGlobalNote();
    expect(read.body).toBe('hello');
  });
});

describe('site note', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing site', async () => {
    expect(await readSiteNote('example.com')).toBeNull();
  });

  it('writes and reads back', async () => {
    await writeSiteNote('example.com', { body: 'site note', tags: ['#test'] });
    const note = await readSiteNote('example.com');
    expect(note.body).toBe('site note');
    expect(note.tags).toEqual(['#test']);
    expect(note.siteKey).toBe('example.com');
  });

  it('preserves createdAt on update', async () => {
    await writeSiteNote('example.com', { body: 'first' });
    const first = await readSiteNote('example.com');
    await writeSiteNote('example.com', { body: 'second' });
    const second = await readSiteNote('example.com');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.body).toBe('second');
  });

  it('deletes a site note', async () => {
    await writeSiteNote('example.com', { body: 'delete me' });
    await deleteSiteNote('example.com');
    expect(await readSiteNote('example.com')).toBeNull();
  });

  it('reads all site notes', async () => {
    await writeSiteNote('a.com', { body: 'a' });
    await writeSiteNote('b.com', { body: 'b' });
    const all = await readAllSiteNotes();
    expect(all).toHaveLength(2);
    expect(all.map(n => n.body).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass (these test existing, already-implemented functions)

- [ ] **Step 3: Commit**

```bash
git add tests/notes-storage.test.js
git commit -m "test: add unit tests for existing notes-storage functions"
```

---

### Task 2: Add page note CRUD to notes-storage.js (TDD)

**Files:**
- Modify: `src/shared/notes-storage.js`
- Modify: `tests/notes-storage.test.js`

- [ ] **Step 1: Add failing tests for getPageKey and page note CRUD**

Append to `tests/notes-storage.test.js`, after the existing imports add the new imports:

Replace the import line at the top with:

```js
import {
  getSiteKey, readGlobalNote, writeGlobalNote,
  readSiteNote, writeSiteNote, deleteSiteNote, readAllSiteNotes,
  parseTags, createDebouncedSaver,
  getPageKey, readPageNote, writePageNote, deletePageNote, readAllPageNotes
} from '../src/shared/notes-storage.js';
```

Append these test blocks at the end of the file:

```js
describe('getPageKey', () => {
  it('returns origin + pathname', () => {
    expect(getPageKey('https://facebook.com/john.doe')).toBe('https://facebook.com/john.doe');
  });
  it('strips query params', () => {
    expect(getPageKey('https://amazon.com/dp/B09V3?ref=nav')).toBe('https://amazon.com/dp/B09V3');
  });
  it('strips hash', () => {
    expect(getPageKey('https://docs.google.com/doc/d/abc#heading')).toBe('https://docs.google.com/doc/d/abc');
  });
  it('returns empty string for invalid URL', () => {
    expect(getPageKey('not-a-url')).toBe('');
  });
});

describe('page note', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing page', async () => {
    expect(await readPageNote('https://example.com/path')).toBeNull();
  });

  it('writes and reads back', async () => {
    await writePageNote('https://example.com/path', { body: 'page note', tags: ['#test'] });
    const note = await readPageNote('https://example.com/path');
    expect(note.body).toBe('page note');
    expect(note.tags).toEqual(['#test']);
    expect(note.pageKey).toBe('https://example.com/path');
  });

  it('preserves createdAt on update', async () => {
    await writePageNote('https://example.com/p', { body: 'first' });
    const first = await readPageNote('https://example.com/p');
    await writePageNote('https://example.com/p', { body: 'second' });
    const second = await readPageNote('https://example.com/p');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.body).toBe('second');
  });

  it('deletes a page note', async () => {
    await writePageNote('https://example.com/p', { body: 'bye' });
    await deletePageNote('https://example.com/p');
    expect(await readPageNote('https://example.com/p')).toBeNull();
  });

  it('reads all page notes', async () => {
    await writePageNote('https://a.com/1', { body: 'a' });
    await writePageNote('https://b.com/2', { body: 'b' });
    const all = await readAllPageNotes();
    expect(all).toHaveLength(2);
    expect(all.map(n => n.body).sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npm test`
Expected: FAIL — `getPageKey` is not exported from notes-storage.js

- [ ] **Step 3: Implement page note functions in notes-storage.js**

Add after the `SITE_NOTES_KEY` constant at the top of `src/shared/notes-storage.js`:

```js
const PAGE_NOTES_KEY = 'stickysites_pages_v1';
```

Add these functions after the `readAllSiteNotes` function:

```js
export function getPageKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch { return ''; }
}

export async function readPageNote(pageKey) {
  if (!pageKey) return null;
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    const record = map[pageKey];
    if (!record) return null;
    return {
      pageKey: String(record.pageKey || pageKey),
      pageLabel: String(record.pageLabel || pageKey),
      body: String(record.body ?? ''),
      tags: Array.isArray(record.tags) ? record.tags : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writePageNote(pageKey, { pageLabel = '', body = '', tags = [] } = {}) {
  if (!pageKey) return null;
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    const existing = map[pageKey];
    const record = {
      pageKey,
      pageLabel: String(pageLabel || pageKey),
      body: String(body),
      tags: Array.isArray(tags) ? tags : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    map[pageKey] = record;
    await chrome.storage.local.set({ [PAGE_NOTES_KEY]: map });
    return record;
  } catch { return null; }
}

export async function deletePageNote(pageKey) {
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    delete map[pageKey];
    await chrome.storage.local.set({ [PAGE_NOTES_KEY]: map });
  } catch { /* best effort */ }
}

export async function readAllPageNotes() {
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    return Object.values(map).map(r => ({
      pageKey: String(r.pageKey || ''),
      pageLabel: String(r.pageLabel || ''),
      body: String(r.body ?? ''),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/notes-storage.js tests/notes-storage.test.js
git commit -m "feat: add page note CRUD to notes-storage"
```

---

### Task 3: Add preferences CRUD to notes-storage.js (TDD)

**Files:**
- Modify: `src/shared/notes-storage.js`
- Modify: `tests/notes-storage.test.js`

- [ ] **Step 1: Add failing tests for readPrefs and writePrefs**

Update the import line in `tests/notes-storage.test.js`:

```js
import {
  getSiteKey, readGlobalNote, writeGlobalNote,
  readSiteNote, writeSiteNote, deleteSiteNote, readAllSiteNotes,
  parseTags, createDebouncedSaver,
  getPageKey, readPageNote, writePageNote, deletePageNote, readAllPageNotes,
  readPrefs, writePrefs
} from '../src/shared/notes-storage.js';
```

Append this test block at the end:

```js
describe('preferences', () => {
  beforeEach(() => { store = {}; });

  it('returns defaults when none saved', async () => {
    const prefs = await readPrefs();
    expect(prefs.clusterPosition).toEqual({ x: null, y: null });
    expect(prefs.panelMode).toBe('fixed');
  });

  it('writes and reads back', async () => {
    await writePrefs({ panelMode: 'modal' });
    const prefs = await readPrefs();
    expect(prefs.panelMode).toBe('modal');
    expect(prefs.clusterPosition).toEqual({ x: null, y: null });
  });

  it('merges partial updates', async () => {
    await writePrefs({ clusterPosition: { x: 100, y: 200 } });
    await writePrefs({ panelMode: 'anchored' });
    const prefs = await readPrefs();
    expect(prefs.clusterPosition).toEqual({ x: 100, y: 200 });
    expect(prefs.panelMode).toBe('anchored');
  });
});
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `npm test`
Expected: FAIL — `readPrefs` is not exported

- [ ] **Step 3: Implement prefs functions in notes-storage.js**

Add after the `PAGE_NOTES_KEY` constant:

```js
const PREFS_KEY = 'stickysites_prefs_v1';
const DEFAULT_PREFS = { clusterPosition: { x: null, y: null }, panelMode: 'fixed' };
```

Add these functions at the end of the file (before the closing of the module):

```js
export async function readPrefs() {
  try {
    const stored = await chrome.storage.local.get(PREFS_KEY);
    const raw = stored?.[PREFS_KEY] || {};
    return { ...DEFAULT_PREFS, ...raw };
  } catch { return { ...DEFAULT_PREFS }; }
}

export async function writePrefs(updates = {}) {
  try {
    const current = await readPrefs();
    const merged = { ...current, ...updates };
    await chrome.storage.local.set({ [PREFS_KEY]: merged });
    return merged;
  } catch { return null; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/shared/notes-storage.js tests/notes-storage.test.js
git commit -m "feat: add preferences CRUD to notes-storage"
```

---

### Task 4: Create note-types.js (icon registry)

**Files:**
- Create: `src/content/note-types.js`

- [ ] **Step 1: Create the icon registry file**

```js
// src/content/note-types.js
window.StickySites = window.StickySites || {};

window.StickySites.noteTypes = [
  {
    id: 'global',
    color: '#fbbf24',
    tint: 'rgba(251,191,36,0.15)',
    tintText: '#fde68a',
    label: 'Global note',
    emoji: '\u{1F4DD}',
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
    getPlaceholder: function (loc) { return 'Notes for ' + loc.hostname.replace(/^www\./, '') + '. Only visible on this domain.'; }
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
    getPlaceholder: function () { return 'Notes for this page only.'; }
  }
];
```

- [ ] **Step 2: Commit**

```bash
git add src/content/note-types.js
git commit -m "feat: add note-types icon registry"
```

---

### Task 5: Create prefs.js (content script preferences)

**Files:**
- Create: `src/content/prefs.js`

- [ ] **Step 1: Create the prefs namespace module**

```js
// src/content/prefs.js
window.StickySites = window.StickySites || {};

(function () {
  var PREFS_KEY = 'stickysites_prefs_v1';
  var DEFAULT_PREFS = { clusterPosition: { x: null, y: null }, panelMode: 'fixed' };

  window.StickySites.Prefs = {
    async read() {
      try {
        var stored = await chrome.storage.local.get(PREFS_KEY);
        var raw = stored?.[PREFS_KEY] || {};
        return Object.assign({}, DEFAULT_PREFS, raw);
      } catch { return Object.assign({}, DEFAULT_PREFS); }
    },

    async write(updates) {
      try {
        var current = await this.read();
        var merged = Object.assign({}, current, updates);
        await chrome.storage.local.set({ [PREFS_KEY]: merged });
        return merged;
      } catch { return null; }
    }
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/content/prefs.js
git commit -m "feat: add prefs namespace module for content script"
```

---

### Task 6: Create cluster.js (floating pill + drag)

**Files:**
- Create: `src/content/cluster.js`

- [ ] **Step 1: Create the cluster manager**

```js
// src/content/cluster.js
window.StickySites = window.StickySites || {};

(function () {
  window.StickySites.Cluster = {
    el: null,
    buttons: [],
    activeTypeId: null,
    hidden: false,
    onIconClick: null,

    async init(noteTypes, onIconClick) {
      this.onIconClick = onIconClick;

      var cluster = document.createElement('div');
      cluster.id = 'stickysites-cluster';

      for (var i = 0; i < noteTypes.length; i++) {
        var nt = noteTypes[i];
        var btn = document.createElement('button');
        btn.className = 'stickysites-cluster-icon ' + nt.cssClass;
        btn.title = nt.label;
        btn.textContent = nt.emoji;
        btn.dataset.typeId = nt.id;
        btn.addEventListener('click', this._makeClickHandler(nt.id));
        cluster.appendChild(btn);
        this.buttons.push({ el: btn, typeId: nt.id });
      }

      this.el = cluster;
      document.documentElement.appendChild(cluster);

      var prefs = await window.StickySites.Prefs.read();
      if (prefs.clusterPosition.x !== null && prefs.clusterPosition.y !== null) {
        cluster.style.top = prefs.clusterPosition.y + 'px';
        cluster.style.right = 'auto';
        cluster.style.left = prefs.clusterPosition.x + 'px';
      }

      this._initDrag();
    },

    _makeClickHandler: function (typeId) {
      var self = this;
      return function (e) {
        e.stopPropagation();
        if (self._wasDragging) { self._wasDragging = false; return; }
        self._handleClick(typeId);
      };
    },

    _handleClick: function (typeId) {
      if (this.activeTypeId === typeId) {
        this.setActive(null);
        if (this.onIconClick) this.onIconClick(null);
      } else {
        this.setActive(typeId);
        if (this.onIconClick) this.onIconClick(typeId);
      }
    },

    setActive: function (typeId) {
      this.activeTypeId = typeId;
      for (var i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i];
        b.el.classList.toggle('is-active', b.typeId === typeId);
      }
    },

    toggle: function () {
      this.hidden = !this.hidden;
      this.el.classList.toggle('is-hidden', this.hidden);
      if (this.hidden) {
        this.setActive(null);
        if (this.onIconClick) this.onIconClick(null);
      }
    },

    _initDrag: function () {
      var self = this;
      var isDragging = false;
      var hasMoved = false;
      var startX, startY, startLeft, startTop;

      this.el.addEventListener('mousedown', function (e) {
        if (e.target !== self.el) return;
        isDragging = true;
        hasMoved = false;
        var rect = self.el.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        self.el.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
        var newLeft = startLeft + dx;
        var newTop = startTop + dy;

        var rect = self.el.getBoundingClientRect();
        var maxLeft = window.innerWidth - rect.width;
        var maxTop = window.innerHeight - rect.height;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        self.el.style.right = 'auto';
        self.el.style.left = newLeft + 'px';
        self.el.style.top = newTop + 'px';
      });

      document.addEventListener('mouseup', async function () {
        if (!isDragging) return;
        isDragging = false;
        self.el.style.cursor = '';
        if (hasMoved) {
          self._wasDragging = true;
          var rect = self.el.getBoundingClientRect();
          await window.StickySites.Prefs.write({
            clusterPosition: { x: Math.round(rect.left), y: Math.round(rect.top) }
          });
        }
      });
    }
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/content/cluster.js
git commit -m "feat: add floating cluster with drag support"
```

---

### Task 7: Create panel.js (workspace panel)

**Files:**
- Create: `src/content/panel.js`

- [ ] **Step 1: Create the panel manager**

```js
// src/content/panel.js
window.StickySites = window.StickySites || {};

(function () {
  function formatSaved(iso) {
    if (!iso) return '';
    try { return 'Saved ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function parseTags(input) {
    if (!input) return [];
    return Array.from(new Set(
      input.split(/[,\s]+/).map(function (t) { return t.trim().toLowerCase(); })
        .filter(Boolean)
        .map(function (t) { return t.startsWith('#') ? t : '#' + t; })
    ));
  }

  window.StickySites.Panel = {
    el: null,
    activeNoteType: null,
    onClose: null,
    _saveTimer: null,

    init: function (onClose) {
      this.onClose = onClose;
      var panel = document.createElement('div');
      panel.id = 'stickysites-panel';
      this.el = panel;
      document.documentElement.appendChild(panel);
    },

    open: async function (noteType) {
      this.activeNoteType = noteType;
      var note = await this._readNote(noteType);
      this._render(noteType, note);
      this.el.classList.add('is-open');
    },

    close: function () {
      this.activeNoteType = null;
      this.el.classList.remove('is-open');
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    },

    _readNote: async function (noteType) {
      var key = noteType.getKey(location);
      try {
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var raw = stored?.[noteType.storageKey];
        if (noteType.storagePattern === 'single') {
          return { body: String(raw?.body ?? ''), tags: [], updatedAt: String(raw?.updatedAt ?? '') };
        }
        var map = raw || {};
        var record = map[key];
        if (!record) return null;
        return {
          body: String(record.body ?? ''),
          tags: Array.isArray(record.tags) ? record.tags : [],
          updatedAt: String(record.updatedAt ?? '')
        };
      } catch { return null; }
    },

    _writeNote: async function (noteType, body, tags) {
      var key = noteType.getKey(location);
      var now = new Date().toISOString();
      try {
        if (noteType.storagePattern === 'single') {
          var record = { body: String(body), updatedAt: now };
          await chrome.storage.local.set({ [noteType.storageKey]: record });
          return record;
        }
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var map = stored?.[noteType.storageKey] || {};
        var existing = map[key];
        map[key] = {
          key: key,
          label: noteType.getLabel(location),
          body: String(body),
          tags: Array.isArray(tags) ? tags : [],
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        await chrome.storage.local.set({ [noteType.storageKey]: map });
        return map[key];
      } catch { return null; }
    },

    _render: function (noteType, note) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      var self = this;
      var body = note?.body ?? '';
      var tags = note?.tags ?? [];
      var updatedAt = note?.updatedAt ?? '';

      // Header
      var header = document.createElement('div');
      header.className = 'stickysites-panel-header';
      header.style.background = noteType.tint;
      header.style.color = noteType.tintText;

      var iconEl = document.createElement('span');
      iconEl.className = 'stickysites-panel-icon';
      iconEl.style.background = noteType.color;
      iconEl.textContent = noteType.emoji;

      var title = document.createElement('span');
      title.className = 'stickysites-panel-title';
      title.textContent = noteType.getLabel(location);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'stickysites-panel-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', function () {
        if (self.onClose) self.onClose();
      });

      header.append(iconEl, title, closeBtn);

      // Actions
      var actions = document.createElement('div');
      actions.className = 'stickysites-panel-actions';

      var copyBtn = document.createElement('button');
      copyBtn.className = 'stickysites-panel-action-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', function () {
        var ta = self.el.querySelector('.stickysites-panel-textarea');
        if (ta) {
          navigator.clipboard.writeText(ta.value).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        }
      });
      actions.appendChild(copyBtn);

      // Textarea
      var textarea = document.createElement('textarea');
      textarea.className = 'stickysites-panel-textarea';
      textarea.value = body;
      textarea.placeholder = noteType.getPlaceholder(location);

      // Footer
      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';

      var tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'stickysites-panel-tags';
      tagInput.placeholder = '#tags';
      tagInput.value = tags.join(', ');

      var meta = document.createElement('span');
      meta.className = 'stickysites-panel-meta';
      var chars = document.createElement('span');
      chars.textContent = body.length + ' chars';
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      meta.append(chars, saved);
      footer.append(tagInput, meta);

      // Auto-save with 500ms debounce
      var doSave = async function () {
        var result = await self._writeNote(
          noteType,
          textarea.value,
          parseTags(tagInput.value)
        );
        if (result) {
          chars.textContent = textarea.value.length + ' chars';
          saved.textContent = formatSaved(result.updatedAt);
        }
      };

      var debouncedSave = function () {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(doSave, 500);
      };

      textarea.addEventListener('input', debouncedSave);
      tagInput.addEventListener('input', debouncedSave);

      // Auto-create empty note for map types
      if (!note && noteType.storagePattern === 'map') {
        this._writeNote(noteType, '', []);
      }

      this.el.append(header, actions, textarea, footer);
    },

    syncFromStorage: function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (!changes[nt.storageKey]) return;

      var ta = this.el.querySelector('.stickysites-panel-textarea');
      if (!ta) return;

      var newValue = changes[nt.storageKey].newValue;
      if (nt.storagePattern === 'single') {
        if (newValue && ta.value !== newValue.body) ta.value = newValue.body;
      } else {
        var key = nt.getKey(location);
        var map = newValue || {};
        var record = map[key];
        if (record && ta.value !== record.body) ta.value = record.body;
      }
    }
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/content/panel.js
git commit -m "feat: add workspace panel with generic note read/write"
```

---

### Task 8: Rewrite sticky-inject.js (orchestrator)

**Files:**
- Modify: `src/content/sticky-inject.js` (complete rewrite)

- [ ] **Step 1: Replace the entire file with the new orchestrator**

```js
// src/content/sticky-inject.js
(async function () {
  if (document.getElementById('stickysites-cluster')) return;

  var SS = window.StickySites;
  var noteTypes = SS.noteTypes;

  function handleIconClick(typeId) {
    if (!typeId) {
      SS.Panel.close();
      return;
    }
    var noteType = null;
    for (var i = 0; i < noteTypes.length; i++) {
      if (noteTypes[i].id === typeId) { noteType = noteTypes[i]; break; }
    }
    if (noteType) SS.Panel.open(noteType);
    else SS.Panel.close();
  }

  SS.Panel.init(function () {
    SS.Cluster.setActive(null);
    SS.Panel.close();
  });

  await SS.Cluster.init(noteTypes, handleIconClick);

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg?.type === 'STICKYSITES_TOGGLE') {
      SS.Cluster.toggle();
      if (SS.Cluster.hidden) SS.Panel.close();
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    SS.Panel.syncFromStorage(changes);
  });
})();
```

- [ ] **Step 2: Commit**

```bash
git add src/content/sticky-inject.js
git commit -m "refactor: rewrite orchestrator to wire modular components"
```

---

### Task 9: Rewrite sticky-inject.css

**Files:**
- Modify: `src/content/sticky-inject.css` (complete rewrite)

- [ ] **Step 1: Replace the entire file with new styles**

```css
/* ── Floating Cluster ── */
#stickysites-cluster {
  position: fixed;
  top: 20px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border-radius: 24px;
  z-index: 2147483640;
  background: rgba(30, 41, 59, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  cursor: grab;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  user-select: none;
}
#stickysites-cluster.is-hidden { display: none; }

.stickysites-cluster-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.stickysites-cluster-icon:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}
.stickysites-cluster-icon.is-yellow { background: #fbbf24; color: #78350f; }
.stickysites-cluster-icon.is-green  { background: #34d399; color: #064e3b; }
.stickysites-cluster-icon.is-blue   { background: #60a5fa; color: #1e3a5f; }
.stickysites-cluster-icon.is-active {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* ── Workspace Panel ── */
#stickysites-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 450px;
  height: min(400px, 50vh);
  display: flex;
  flex-direction: column;
  z-index: 2147483639;
  background: #1e293b;
  color: #e2e8f0;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
#stickysites-panel.is-open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.stickysites-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 12px 12px 0 0;
}
.stickysites-panel-icon {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  flex-shrink: 0;
}
.stickysites-panel-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stickysites-panel-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: inherit;
  padding: 2px 6px;
  border-radius: 4px;
  opacity: 0.7;
}
.stickysites-panel-close:hover {
  background: rgba(255, 255, 255, 0.08);
  opacity: 1;
}

/* Actions row */
.stickysites-panel-actions {
  display: flex;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}
.stickysites-panel-action-btn {
  background: #334155;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.stickysites-panel-action-btn:hover {
  background: #475569;
  color: #e2e8f0;
}

/* Textarea */
.stickysites-panel-textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  background: transparent;
  color: #e2e8f0;
}
.stickysites-panel-textarea::placeholder {
  color: #475569;
}

/* Footer */
.stickysites-panel-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  font-size: 11px;
  color: #94a3b8;
}
.stickysites-panel-tags {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 11px;
  background: rgba(15, 23, 42, 0.5);
  color: #e2e8f0;
  outline: none;
}
.stickysites-panel-tags:focus {
  border-color: rgba(148, 163, 184, 0.4);
}
.stickysites-panel-meta {
  display: flex;
  gap: 8px;
  white-space: nowrap;
  margin-left: auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/content/sticky-inject.css
git commit -m "refactor: rewrite CSS for floating cluster + workspace panel"
```

---

### Task 10: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update content_scripts to load all modules and bump version**

Replace the entire `manifest.json` content:

```json
{
  "manifest_version": 3,
  "name": "StickySites",
  "version": "1.1.0",
  "description": "Sticky notes for every website. Global notes, per-site notes, and per-page notes in a floating workspace.",
  "permissions": ["storage", "activeTab"],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_icon": "icons/icon48.png",
    "default_title": "StickySites"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": [
        "src/content/note-types.js",
        "src/content/prefs.js",
        "src/content/cluster.js",
        "src/content/panel.js",
        "src/content/sticky-inject.js"
      ],
      "css": ["src/content/sticky-inject.css"],
      "run_at": "document_idle"
    }
  ],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  }
}
```

- [ ] **Step 2: Run tests to make sure nothing broke**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: update manifest for modular content scripts, bump to v1.1.0"
```

---

### Task 11: Manual verification in Chrome

- [ ] **Step 1: Load the extension in Chrome**

1. Open `chrome://extensions`
2. If already loaded, click the reload icon on the StickySites card
3. If not loaded, click "Load unpacked" and select the repo root

- [ ] **Step 2: Verify cluster appears**

Open any webpage (e.g., `https://example.com`). Confirm:
- A vertical pill with 3 colored circles (yellow, green, blue) appears in the top-right
- No opaque sidebar strip

- [ ] **Step 3: Verify drag behavior**

Click and drag the pill background (between the icons). Confirm:
- The cluster follows the mouse
- It stays within the viewport bounds
- After dropping, reload the page — the cluster should appear in the saved position

- [ ] **Step 4: Verify global note (yellow)**

Click the yellow icon. Confirm:
- A workspace panel (~450px) appears in the bottom-right corner
- Header shows "Global note" with yellow tint
- Type text — it auto-saves (check "Saved" timestamp updates)
- Click the yellow icon again — panel closes
- Open a different tab, click yellow icon — same note content appears

- [ ] **Step 5: Verify site note (green)**

Click the green icon. Confirm:
- Panel header shows "Site note — [domain]"
- Type text + tags — both auto-save
- Navigate to a different domain — green note shows different (or empty) content
- Navigate back — original note is preserved

- [ ] **Step 6: Verify page note (blue)**

Click the blue icon. Confirm:
- Panel header shows "Page note — [pathname]"
- Type text — auto-saves
- Navigate to a different page on the same domain — blue note shows different content
- Navigate back — original page note is preserved

- [ ] **Step 7: Verify toolbar toggle**

Click the StickySites icon in the Chrome toolbar. Confirm:
- The cluster hides
- If a panel was open, it closes too
- Click again — cluster reappears

- [ ] **Step 8: Verify Copy button**

Open any note, type some text, click "Copy". Confirm:
- Button text changes to "Copied!" briefly
- Paste into another app — the text appears

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore: phase 1 complete — floating cluster, page notes, workspace panel"
```
