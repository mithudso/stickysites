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

  // Note: body may contain HTML from the rich text editor.
  // All note content is user-authored from chrome.storage.local (per-extension isolated storage).
  function stripHtml(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.textContent = ''; // clear
    // Parse user-authored HTML from local storage to extract text
    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    return (doc.body.textContent || '').trim();
  }

  function getSubject(body, fallbackLabel) {
    if (!body || !body.trim()) return fallbackLabel;
    var text = stripHtml(body);
    var firstLine = text.split('\n')[0].trim();
    return firstLine || fallbackLabel;
  }

  function getPreview(body) {
    if (!body) return '';
    var text = stripHtml(body);
    return text.split('\n').slice(1).join('\n').trim();
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
