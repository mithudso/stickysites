# Phase 2: All-Notes Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser action popup that shows all notes with search/sort/filter, markdown export, new emoji icons, and keyboard shortcut for cluster toggle.

**Architecture:** New popup page (popup.html/css/js) reads all storage keys and renders a grouped card list. Service worker switches from action.onClicked to commands.onCommand. Content script adds STICKYSITES_OPEN message handler. Icon generation via canvas Node script.

**Tech Stack:** Vanilla JS, Chrome Extension MV3, canvas npm package for icon gen

**Spec:** `docs/superpowers/specs/2026-05-26-phase2-all-notes-popup-design.md`

---

### Task 1: Generate emoji icons

**Files:**
- Create: `scripts/generate-icons.js`
- Modify: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- Modify: `package.json` (add canvas devDependency)

- [ ] **Step 1: Install canvas package**

```bash
npm install --save-dev canvas
```

- [ ] **Step 2: Create the icon generation script**

Create `scripts/generate-icons.js`:

```js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];
const emoji = '\u{1F4DD}';
const outDir = path.join(__dirname, '..', 'icons');

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.floor(size * 0.75)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillText(emoji, size / 2, size / 2);
  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buf);
  console.log(`Generated icon${size}.png`);
}
```

- [ ] **Step 3: Run the script**

```bash
node scripts/generate-icons.js
```

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-icons.js icons/ package.json package-lock.json
git commit -m "feat: generate emoji icons for toolbar"
```

---

### Task 2: Update manifest, service worker, and orchestrator

**Files:**
- Modify: `manifest.json`
- Modify: `src/background/service-worker.js`
- Modify: `src/content/sticky-inject.js`

- [ ] **Step 1: Update manifest.json**

Replace entire `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "StickySites",
  "version": "1.2.0",
  "description": "Sticky notes for every website. Global notes, per-site notes, and per-page notes in a floating workspace.",
  "permissions": ["storage", "activeTab"],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
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

- [ ] **Step 2: Rewrite service-worker.js**

Replace entire `src/background/service-worker.js`:

```js
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-cluster') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE' });
      } catch {
        // Content script not injected on this page
      }
    }
  }
});
```

- [ ] **Step 3: Update sticky-inject.js message handler**

In `src/content/sticky-inject.js`, replace the `chrome.runtime.onMessage.addListener` block (the one that only handles `STICKYSITES_TOGGLE`) with this expanded version that also handles `STICKYSITES_OPEN`:

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

- [ ] **Step 4: Run tests**

```bash
npm test
```
Expected: All 27 tests pass.

- [ ] **Step 5: Commit**

```bash
git add manifest.json src/background/service-worker.js src/content/sticky-inject.js
git commit -m "feat: add popup config, commands shortcut, STICKYSITES_OPEN handler"
```

---

### Task 3: Create popup HTML and CSS

**Files:**
- Create: `popup.html`
- Create: `popup.css`

- [ ] **Step 1: Create popup.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=400">
  <link rel="stylesheet" href="popup.css">
  <title>StickySites</title>
</head>
<body>
  <div id="app">
    <header id="header">
      <span class="header-icon">📝</span>
      <span class="header-title">StickySites</span>
      <button id="toggle-cluster-btn" class="header-btn">Hide cluster</button>
    </header>

    <div id="search-bar">
      <input type="text" id="search-input" placeholder="Search notes...">
    </div>

    <div id="filters">
      <div id="type-filters">
        <button class="type-pill active" data-type="all">All</button>
        <button class="type-pill" data-type="global">Global</button>
        <button class="type-pill" data-type="site">Sites</button>
        <button class="type-pill" data-type="page">Pages</button>
      </div>
      <button id="sort-btn" class="sort-btn">Recent ▾</button>
    </div>

    <div id="tag-filters"></div>

    <div id="notes-list"></div>

    <footer id="footer">
      <button id="save-all-btn" class="footer-btn">Save all as .md</button>
    </footer>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  width: 400px;
  height: 600px;
  background: #0f172a;
  color: #e2e8f0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 13px;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

#header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  flex-shrink: 0;
}
.header-icon { font-size: 16px; }
.header-title { font-weight: 700; font-size: 15px; flex: 1; }
.header-btn {
  background: #334155;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.header-btn:hover { background: #475569; color: #e2e8f0; }

#search-bar { padding: 8px 12px; flex-shrink: 0; }
#search-input {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  background: rgba(15, 23, 42, 0.5);
  color: #e2e8f0;
  outline: none;
}
#search-input:focus { border-color: rgba(148, 163, 184, 0.4); }
#search-input::placeholder { color: #475569; }

#filters {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 8px;
  flex-shrink: 0;
}
#type-filters { display: flex; gap: 4px; flex: 1; }
.type-pill {
  background: #334155;
  border: none;
  color: #94a3b8;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 12px;
  cursor: pointer;
}
.type-pill:hover { color: #e2e8f0; }
.type-pill.active { background: #475569; color: #e2e8f0; }
.type-pill[data-type="global"].active { background: rgba(251, 191, 36, 0.2); color: #fde68a; }
.type-pill[data-type="site"].active { background: rgba(52, 211, 153, 0.2); color: #6ee7b7; }
.type-pill[data-type="page"].active { background: rgba(96, 165, 250, 0.2); color: #93c5fd; }
.sort-btn {
  background: none;
  border: none;
  color: #475569;
  font-size: 10px;
  cursor: pointer;
  white-space: nowrap;
}
.sort-btn:hover { color: #94a3b8; }

#tag-filters {
  display: flex;
  gap: 4px;
  padding: 0 12px 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
#tag-filters:empty { display: none; }
.tag-pill {
  background: #334155;
  color: #93c5fd;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: pointer;
  border: none;
}
.tag-pill:hover { background: #475569; }
.tag-pill.active { background: rgba(96, 165, 250, 0.3); }

#notes-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 4px;
}
#notes-list::-webkit-scrollbar { width: 6px; }
#notes-list::-webkit-scrollbar-track { background: transparent; }
#notes-list::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }

.section-header {
  padding: 8px 8px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.section-header.is-yellow { color: #fde68a; }
.section-header.is-green { color: #6ee7b7; }
.section-header.is-blue { color: #93c5fd; }

.note-card {
  margin: 0 4px 6px;
  padding: 10px;
  background: #1e293b;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease;
}
.note-card:hover { background: #243046; }
.note-card.is-dimmed { opacity: 0.5; cursor: default; }
.note-card.is-dimmed:hover { background: #1e293b; }
.note-card.border-yellow { border-left: 3px solid #fbbf24; }
.note-card.border-green { border-left: 3px solid #34d399; }
.note-card.border-blue { border-left: 3px solid #60a5fa; }

.note-subject {
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.note-preview {
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}
.note-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #475569;
  flex-wrap: wrap;
}
.note-meta-tags { margin-left: auto; }
.note-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  justify-content: flex-end;
}
.note-action-btn {
  background: #334155;
  border: none;
  color: #94a3b8;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
}
.note-action-btn:hover { background: #475569; color: #e2e8f0; }

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #475569;
  font-size: 13px;
}

#footer {
  padding: 8px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  flex-shrink: 0;
}
.footer-btn {
  width: 100%;
  background: #334155;
  border: none;
  color: #94a3b8;
  font-size: 11px;
  padding: 6px;
  border-radius: 4px;
  cursor: pointer;
}
.footer-btn:hover { background: #475569; color: #e2e8f0; }
```

- [ ] **Step 3: Commit**

```bash
git add popup.html popup.css
git commit -m "feat: add popup HTML shell and styles"
```

---

### Task 4: Create popup.js

**Files:**
- Create: `popup.js`

- [ ] **Step 1: Create popup.js with all note loading, rendering, search, sort, filter, export**

```js
(async function () {
  var GLOBAL_KEY = 'stickysites_global_v1';
  var SITES_KEY = 'stickysites_sites_v1';
  var PAGES_KEY = 'stickysites_pages_v1';

  var SORT_MODES = ['recent', 'oldest', 'alpha'];
  var SORT_LABELS = { recent: 'Recent ▾', oldest: 'Oldest ▾', alpha: 'A–Z ▾' };

  var state = {
    allNotes: [],
    typeFilter: 'all',
    sortMode: 'recent',
    searchQuery: '',
    activeTags: [],
    currentTabUrl: ''
  };

  function getSubject(body, fallbackLabel) {
    if (!body || !body.trim()) return fallbackLabel;
    var firstLine = body.split('\n')[0].trim();
    return firstLine || fallbackLabel;
  }

  function getPreview(body) {
    if (!body) return '';
    return body.split('\n').slice(1).join('\n').trim();
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    if (days < 30) return days + 'd ago';
    return new Date(iso).toLocaleDateString();
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function noteMatchesCurrentTab(note) {
    if (note.type === 'global') return true;
    try {
      var u = new URL(state.currentTabUrl);
      if (note.type === 'site') return note.key === u.hostname.replace(/^www\./, '');
      if (note.type === 'page') return note.key === (u.origin + u.pathname);
    } catch { return false; }
    return false;
  }

  async function loadAllNotes() {
    var stored = await chrome.storage.local.get([GLOBAL_KEY, SITES_KEY, PAGES_KEY]);
    var notes = [];

    var global = stored[GLOBAL_KEY];
    if (global && global.body) {
      notes.push({
        type: 'global', key: '__global__', label: 'Global note',
        body: String(global.body || ''), tags: [],
        createdAt: global.updatedAt || '', updatedAt: global.updatedAt || '',
        borderClass: 'border-yellow', sectionClass: 'is-yellow', noteTypeId: 'global'
      });
    }

    var sites = stored[SITES_KEY] || {};
    Object.values(sites).forEach(function (r) {
      notes.push({
        type: 'site', key: String(r.siteKey || ''), label: 'Site note — ' + (r.siteKey || ''),
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-green', sectionClass: 'is-green', noteTypeId: 'site'
      });
    });

    var pages = stored[PAGES_KEY] || {};
    Object.values(pages).forEach(function (r) {
      var pathLabel = '';
      try { pathLabel = new URL(r.pageKey).pathname; } catch { pathLabel = r.pageKey || ''; }
      notes.push({
        type: 'page', key: String(r.pageKey || ''), label: 'Page note — ' + pathLabel,
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-blue', sectionClass: 'is-blue', noteTypeId: 'page'
      });
    });

    return notes;
  }

  function filterNotes(notes) {
    var filtered = notes;
    if (state.typeFilter !== 'all') {
      filtered = filtered.filter(function (n) { return n.type === state.typeFilter; });
    }
    if (state.searchQuery) {
      var q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(function (n) {
        return (n.body || '').toLowerCase().includes(q);
      });
    }
    if (state.activeTags.length > 0) {
      filtered = filtered.filter(function (n) {
        return state.activeTags.every(function (tag) { return n.tags.includes(tag); });
      });
    }
    return filtered;
  }

  function sortNotes(notes) {
    var sorted = notes.slice();
    if (state.sortMode === 'recent') {
      sorted.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    } else if (state.sortMode === 'oldest') {
      sorted.sort(function (a, b) { return (a.updatedAt || '').localeCompare(b.updatedAt || ''); });
    } else if (state.sortMode === 'alpha') {
      sorted.sort(function (a, b) {
        return getSubject(a.body, a.label).localeCompare(getSubject(b.body, b.label));
      });
    }
    return sorted;
  }

  function groupByType(notes) {
    var groups = [
      { type: 'global', label: 'Global', cssClass: 'is-yellow', notes: [] },
      { type: 'site', label: 'Site Notes', cssClass: 'is-green', notes: [] },
      { type: 'page', label: 'Page Notes', cssClass: 'is-blue', notes: [] }
    ];
    notes.forEach(function (n) {
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].type === n.type) { groups[i].notes.push(n); break; }
      }
    });
    return groups.filter(function (g) { return g.notes.length > 0; });
  }

  function noteToMarkdown(note) {
    var subject = getSubject(note.body, note.label);
    var preview = getPreview(note.body);
    var lines = ['# ' + subject, ''];
    if (preview) lines.push(preview, '');
    lines.push('---');
    if (note.tags.length) lines.push('Tags: ' + note.tags.join(' '));
    if (note.type !== 'global') lines.push('Source: ' + note.type + ' — ' + note.key);
    if (note.createdAt) lines.push('Created: ' + new Date(note.createdAt).toLocaleString());
    if (note.updatedAt) lines.push('Modified: ' + new Date(note.updatedAt).toLocaleString());
    return lines.join('\n');
  }

  function allNotesToMarkdown(notes) {
    var lines = ['# StickySites Export', '', 'Exported: ' + new Date().toLocaleString(), ''];
    groupByType(notes).forEach(function (g) {
      lines.push('## ' + g.label, '');
      g.notes.forEach(function (n) {
        var subject = getSubject(n.body, n.label);
        var preview = getPreview(n.body);
        lines.push('### ' + subject, '');
        if (n.type !== 'global') lines.push('*' + n.key + '*', '');
        if (preview) lines.push(preview, '');
        lines.push('---');
        if (n.tags.length) lines.push('Tags: ' + n.tags.join(' '));
        if (n.createdAt) lines.push('Created: ' + new Date(n.createdAt).toLocaleString());
        if (n.updatedAt) lines.push('Modified: ' + new Date(n.updatedAt).toLocaleString());
        lines.push('');
      });
    });
    return lines.join('\n');
  }

  function downloadMarkdown(filename, content) {
    var blob = new Blob([content], { type: 'text/markdown' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function appendText(parent, text) {
    parent.appendChild(document.createTextNode(text));
  }

  function makeSpan(text, className) {
    var s = document.createElement('span');
    if (className) s.className = className;
    s.textContent = text;
    return s;
  }

  function renderNoteCard(note) {
    var card = document.createElement('div');
    var matches = noteMatchesCurrentTab(note);
    card.className = 'note-card ' + note.borderClass + (matches ? '' : ' is-dimmed');

    if (matches) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.note-action-btn')) return;
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          if (tabs[0] && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'STICKYSITES_OPEN', noteTypeId: note.noteTypeId
            });
          }
        });
      });
    }

    var subject = document.createElement('div');
    subject.className = 'note-subject';
    subject.textContent = getSubject(note.body, note.label);
    card.appendChild(subject);

    var previewText = getPreview(note.body);
    if (previewText) {
      var previewEl = document.createElement('div');
      previewEl.className = 'note-preview';
      previewEl.textContent = previewText;
      card.appendChild(previewEl);
    }

    var meta = document.createElement('div');
    meta.className = 'note-meta';

    var source = '';
    if (note.type === 'site') source = note.key;
    else if (note.type === 'page') {
      try { var pu = new URL(note.key); source = pu.hostname + pu.pathname; } catch { source = note.key; }
    }
    if (source) {
      meta.appendChild(makeSpan(source));
      meta.appendChild(makeSpan(' · '));
    }
    if (note.updatedAt) {
      meta.appendChild(makeSpan('Modified ' + relativeTime(note.updatedAt)));
    }
    if (note.createdAt && note.createdAt !== note.updatedAt) {
      meta.appendChild(makeSpan(' · '));
      meta.appendChild(makeSpan('Created ' + formatDate(note.createdAt)));
    }
    if (note.tags.length) {
      meta.appendChild(makeSpan(note.tags.join(' '), 'note-meta-tags'));
    }
    card.appendChild(meta);

    var actions = document.createElement('div');
    actions.className = 'note-actions';

    var copyBtn = document.createElement('button');
    copyBtn.className = 'note-action-btn';
    copyBtn.textContent = '\u{1F4CB} Copy';
    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      navigator.clipboard.writeText(note.body).then(function () {
        copyBtn.textContent = '✓ Copied';
        setTimeout(function () { copyBtn.textContent = '\u{1F4CB} Copy'; }, 1500);
      });
    });
    actions.appendChild(copyBtn);

    var saveBtn = document.createElement('button');
    saveBtn.className = 'note-action-btn';
    saveBtn.textContent = '\u{1F4BE} .md';
    saveBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var filename = getSubject(note.body, note.type + '-note').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.md';
      downloadMarkdown(filename, noteToMarkdown(note));
    });
    actions.appendChild(saveBtn);

    card.appendChild(actions);
    return card;
  }

  function collectAllTags(notes) {
    var tagSet = {};
    notes.forEach(function (n) {
      (n.tags || []).forEach(function (t) { tagSet[t] = true; });
    });
    return Object.keys(tagSet).sort();
  }

  function renderTagFilters(allTags) {
    var container = document.getElementById('tag-filters');
    while (container.firstChild) container.removeChild(container.firstChild);
    allTags.forEach(function (tag) {
      var pill = document.createElement('button');
      pill.className = 'tag-pill' + (state.activeTags.includes(tag) ? ' active' : '');
      pill.textContent = tag;
      pill.addEventListener('click', function () {
        var idx = state.activeTags.indexOf(tag);
        if (idx >= 0) state.activeTags.splice(idx, 1);
        else state.activeTags.push(tag);
        render();
      });
      container.appendChild(pill);
    });
  }

  function render() {
    var filtered = filterNotes(state.allNotes);
    var sorted = sortNotes(filtered);
    var groups = groupByType(sorted);
    var allTags = collectAllTags(state.allNotes);

    renderTagFilters(allTags);

    var list = document.getElementById('notes-list');
    while (list.firstChild) list.removeChild(list.firstChild);

    if (groups.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = state.searchQuery || state.activeTags.length ? 'No matching notes' : 'No notes yet';
      list.appendChild(empty);
      return;
    }

    groups.forEach(function (g) {
      var header = document.createElement('div');
      header.className = 'section-header ' + g.cssClass;
      header.textContent = g.label;
      list.appendChild(header);
      g.notes.forEach(function (n) { list.appendChild(renderNoteCard(n)); });
    });
  }

  // --- Init ---
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  state.currentTabUrl = (tabs[0] && tabs[0].url) || '';
  state.allNotes = await loadAllNotes();

  document.getElementById('search-input').addEventListener('input', function (e) {
    state.searchQuery = e.target.value;
    render();
  });

  document.querySelectorAll('.type-pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.type-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      state.typeFilter = pill.dataset.type;
      render();
    });
  });

  var sortBtn = document.getElementById('sort-btn');
  sortBtn.addEventListener('click', function () {
    var idx = SORT_MODES.indexOf(state.sortMode);
    state.sortMode = SORT_MODES[(idx + 1) % SORT_MODES.length];
    sortBtn.textContent = SORT_LABELS[state.sortMode];
    render();
  });

  document.getElementById('toggle-cluster-btn').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STICKYSITES_TOGGLE' });
      }
    });
    var btn = document.getElementById('toggle-cluster-btn');
    btn.textContent = btn.textContent === 'Hide cluster' ? 'Show cluster' : 'Hide cluster';
  });

  document.getElementById('save-all-btn').addEventListener('click', function () {
    downloadMarkdown('stickysites-export.md', allNotesToMarkdown(state.allNotes));
  });

  render();
})();
```

- [ ] **Step 2: Commit**

```bash
git add popup.js
git commit -m "feat: add popup.js with search, sort, filter, export"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Reload extension at chrome://extensions**
- [ ] **Step 2: Verify toolbar icon shows the 📝 emoji**
- [ ] **Step 3: Click toolbar icon — popup opens with all-notes view**
- [ ] **Step 4: Test search, sort, type filters, tag filters**
- [ ] **Step 5: Test Copy and Save .md per-note buttons**
- [ ] **Step 6: Test "Save all as .md" in footer**
- [ ] **Step 7: Test Alt+S shortcut — cluster toggles**
- [ ] **Step 8: Test clicking a matching note card — opens workspace panel**
- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "chore: phase 2 complete — all-notes popup, exports, emoji icons"
```
