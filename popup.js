(async function () {
  var GLOBAL_KEY = 'stickysites_global_v1';
  var SITES_KEY = 'stickysites_sites_v1';
  var PAGES_KEY = 'stickysites_pages_v1';
  var TODOS_KEY = 'stickysites_todos_v1';
  var OUTLINES_KEY = 'stickysites_outlines_v1';
  var DAILY_KEY = 'stickysites_daily_v1';

  var SORT_MODES = ['recent', 'oldest', 'alpha'];
  var SORT_LABELS = { recent: 'Recent ▾', oldest: 'Oldest ▾', alpha: 'A–Z ▾' };

  var Crypto = window.StickySites?.Crypto || null;

  var state = {
    allNotes: [],
    typeFilter: 'all',
    sortMode: 'recent',
    searchQuery: '',
    activeTags: [],
    currentTabUrl: ''
  };

  // --- Lock screen for popup ---
  async function checkAndShowLock() {
    if (!Crypto) return true;
    var enabled = await Crypto.isEnabled();
    if (!enabled) return true;
    var key = await Crypto.getCachedKey();
    if (key) return true;
    showPopupLock();
    return false;
  }

  function showPopupLock() {
    var app = document.getElementById('app');
    app.style.display = 'none';

    var existing = document.getElementById('popup-lock');
    if (existing) existing.remove();

    var lock = document.createElement('div');
    lock.id = 'popup-lock';

    var title = document.createElement('div');
    title.className = 'popup-lock-title';
    title.textContent = 'StickySites Locked';

    var desc = document.createElement('div');
    desc.className = 'popup-lock-desc';
    desc.textContent = 'Enter your passphrase to access notes.';

    var input = document.createElement('input');
    input.type = 'password';
    input.className = 'popup-lock-input';
    input.placeholder = 'Passphrase...';

    var btn = document.createElement('button');
    btn.className = 'popup-lock-btn';
    btn.textContent = 'Unlock';

    var error = document.createElement('div');
    error.className = 'popup-lock-error';

    async function doUnlock() {
      if (!input.value) return;
      btn.disabled = true;
      btn.textContent = 'Unlocking...';
      var ok = await Crypto.unlock(input.value);
      if (ok) {
        lock.remove();
        app.style.display = '';
        await initPopup();
      } else {
        error.textContent = 'Wrong passphrase';
        input.value = '';
        input.focus();
        btn.disabled = false;
        btn.textContent = 'Unlock';
      }
    }

    btn.addEventListener('click', doUnlock);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doUnlock();
    });

    lock.append(title, desc, input, btn, error);
    document.body.appendChild(lock);
    input.focus();
  }

  // --- Settings panel ---
  async function showSettings() {
    var app = document.getElementById('app');
    app.style.display = 'none';

    var existing = document.getElementById('popup-settings');
    if (existing) existing.remove();

    var panel = document.createElement('div');
    panel.id = 'popup-settings';

    var header = document.createElement('div');
    header.className = 'settings-header';
    var title = document.createElement('span');
    title.textContent = 'Settings';
    title.className = 'settings-title';
    var backBtn = document.createElement('button');
    backBtn.className = 'header-btn';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', function () {
      panel.remove();
      app.style.display = '';
    });
    header.append(title, backBtn);

    // Encryption section
    var section = document.createElement('div');
    section.className = 'settings-section';

    var sectionTitle = document.createElement('div');
    sectionTitle.className = 'settings-section-title';
    sectionTitle.textContent = 'Encryption';

    var sectionDesc = document.createElement('div');
    sectionDesc.className = 'settings-section-desc';
    sectionDesc.textContent = 'Encrypt all notes at rest with AES-256-GCM.';

    var toggleRow = document.createElement('div');
    toggleRow.className = 'settings-toggle-row';

    var toggleLabel = document.createElement('span');
    toggleLabel.textContent = 'Encryption';

    var toggleBtn = document.createElement('button');
    toggleBtn.className = 'settings-toggle-btn';

    var statusMsg = document.createElement('div');
    statusMsg.className = 'settings-status';

    async function updateToggleState() {
      if (!Crypto) {
        toggleBtn.textContent = 'Unavailable';
        toggleBtn.disabled = true;
        return;
      }
      var enabled = await Crypto.isEnabled();
      if (enabled) {
        toggleBtn.textContent = 'Disable';
        toggleBtn.className = 'settings-toggle-btn is-on';
        statusMsg.textContent = 'Encryption is enabled.';
        statusMsg.style.color = '#34d399';
      } else {
        toggleBtn.textContent = 'Enable';
        toggleBtn.className = 'settings-toggle-btn';
        statusMsg.textContent = 'Encryption is disabled.';
        statusMsg.style.color = '#94a3b8';
      }
    }

    toggleBtn.addEventListener('click', async function () {
      if (!Crypto) return;
      var enabled = await Crypto.isEnabled();
      if (enabled) {
        // Disable encryption
        toggleBtn.disabled = true;
        toggleBtn.textContent = 'Disabling...';
        await Crypto.disable();
        await updateToggleState();
        await updateLockBtnState();
        toggleBtn.disabled = false;
        var form = panel.querySelector('.settings-passphrase-form');
        if (form) form.remove();
      } else {
        // Show passphrase setup form
        showPassphraseForm(section, async function (passphrase) {
          toggleBtn.disabled = true;
          toggleBtn.textContent = 'Enabling...';
          await Crypto.enable(passphrase);
          await updateToggleState();
          toggleBtn.disabled = false;
          var form = panel.querySelector('.settings-passphrase-form');
          if (form) form.remove();
        });
      }
    });

    var lockBtn = document.createElement('button');
    lockBtn.className = 'settings-toggle-btn';
    lockBtn.textContent = 'Lock Now';
    lockBtn.style.display = 'none';

    async function updateLockBtnState() {
      if (!Crypto) { lockBtn.style.display = 'none'; return; }
      var enabled = await Crypto.isEnabled();
      if (!enabled) { lockBtn.style.display = 'none'; return; }
      var key = await Crypto.getCachedKey();
      lockBtn.style.display = key ? '' : 'none';
    }

    lockBtn.addEventListener('click', async function () {
      await Crypto.clearCachedKey();
      lockBtn.style.display = 'none';
      statusMsg.textContent = 'Locked. Re-enter passphrase to unlock.';
      statusMsg.style.color = '#fbbf24';
    });

    toggleRow.append(toggleLabel, toggleBtn, lockBtn);
    section.append(sectionTitle, sectionDesc, toggleRow, statusMsg);

    updateLockBtnState();

    // --- Sync section ---
    var settingsEl = section;

    var syncLabel = document.createElement('div');
    syncLabel.className = 'settings-label';
    syncLabel.textContent = 'Google Drive Sync';

    var syncMeta = await window.StickySites?.Sync?.getMeta() || { signedIn: false, lastSync: null };

    var syncBtn = document.createElement('button');
    syncBtn.className = 'settings-btn';
    syncBtn.textContent = syncMeta.signedIn ? 'Sign out' : 'Sign in to Google';
    syncBtn.addEventListener('click', async function () {
      if (syncMeta.signedIn) {
        window.StickySites.Sync.signOut();
        syncBtn.textContent = 'Sign in to Google';
        syncNowBtn.style.display = 'none';
        syncInfo.textContent = '';
        updateSyncStatus();
      } else {
        syncBtn.textContent = 'Signing in...';
        syncBtn.disabled = true;
        var result = await window.StickySites.Sync.signIn();
        syncMeta = await window.StickySites.Sync.getMeta();
        syncBtn.textContent = syncMeta.signedIn ? 'Sign out' : 'Sign in to Google';
        syncBtn.disabled = false;
        if (syncMeta.signedIn) {
          syncNowBtn.style.display = '';
          syncInfo.textContent = 'Synced!';
        } else {
          syncInfo.textContent = result.error || 'Sign-in failed';
          syncInfo.style.color = '#f87171';
        }
        updateSyncStatus();
      }
    });

    var syncNowBtn = document.createElement('button');
    syncNowBtn.className = 'settings-btn';
    syncNowBtn.textContent = 'Sync now';
    syncNowBtn.style.display = syncMeta.signedIn ? '' : 'none';
    syncNowBtn.addEventListener('click', function () {
      syncNowBtn.textContent = 'Syncing...';
      window.StickySites.Sync.requestSync();
      setTimeout(async function () {
        syncNowBtn.textContent = 'Sync now';
        var m = await window.StickySites.Sync.getMeta();
        if (m.lastSync) syncInfo.textContent = 'Last: ' + new Date(m.lastSync).toLocaleString();
        updateSyncStatus();
      }, 2000);
    });

    var syncInfo = document.createElement('div');
    syncInfo.className = 'settings-info';
    if (syncMeta.lastSync) {
      syncInfo.textContent = 'Last: ' + new Date(syncMeta.lastSync).toLocaleString();
    }

    settingsEl.append(syncLabel, syncBtn, syncNowBtn, syncInfo);

    // --- Note Type Visibility ---
    var typesLabel = document.createElement('div');
    typesLabel.className = 'settings-label';
    typesLabel.textContent = 'Note Types';

    var typesContainer = document.createElement('div');
    typesContainer.className = 'settings-types';

    var prefs = await chrome.storage.local.get('stickysites_prefs_v1');
    var prefsData = prefs?.stickysites_prefs_v1 || {};
    var enabledTypes = prefsData.enabledTypes || { global: true, site: true, page: true, todo: true, outline: true, daily: true };

    var typeNames = {
      global: 'Global (Yellow)',
      site: 'Site (Green)',
      page: 'Page (Blue)',
      todo: 'To-do (Purple)',
      outline: 'Outliner (Orange)',
      daily: 'Daily (Red)'
    };

    Object.keys(typeNames).forEach(function (typeId) {
      var row = document.createElement('label');
      row.className = 'settings-type-row';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = enabledTypes[typeId] !== false;
      cb.addEventListener('change', async function () {
        enabledTypes[typeId] = cb.checked;
        var stored = await chrome.storage.local.get('stickysites_prefs_v1');
        var p = stored?.stickysites_prefs_v1 || {};
        p.enabledTypes = enabledTypes;
        await chrome.storage.local.set({ stickysites_prefs_v1: p });
      });

      var label = document.createElement('span');
      label.textContent = typeNames[typeId];

      row.append(cb, label);
      typesContainer.appendChild(row);
    });

    // --- Cluster Layout ---
    var layoutLabel = document.createElement('div');
    layoutLabel.className = 'settings-label';
    layoutLabel.textContent = 'Cluster Layout';

    var layoutRow = document.createElement('div');
    layoutRow.className = 'settings-layout-row';

    var currentLayout = prefsData.clusterLayout || 'vertical';

    var vertBtn = document.createElement('button');
    vertBtn.className = 'settings-layout-btn' + (currentLayout === 'vertical' ? ' active' : '');
    vertBtn.textContent = 'Vertical';
    vertBtn.addEventListener('click', async function () {
      var stored = await chrome.storage.local.get('stickysites_prefs_v1');
      var p = stored?.stickysites_prefs_v1 || {};
      p.clusterLayout = 'vertical';
      await chrome.storage.local.set({ stickysites_prefs_v1: p });
      vertBtn.classList.add('active');
      horizBtn.classList.remove('active');
    });

    var horizBtn = document.createElement('button');
    horizBtn.className = 'settings-layout-btn' + (currentLayout === 'horizontal' ? ' active' : '');
    horizBtn.textContent = 'Horizontal';
    horizBtn.addEventListener('click', async function () {
      var stored = await chrome.storage.local.get('stickysites_prefs_v1');
      var p = stored?.stickysites_prefs_v1 || {};
      p.clusterLayout = 'horizontal';
      await chrome.storage.local.set({ stickysites_prefs_v1: p });
      horizBtn.classList.add('active');
      vertBtn.classList.remove('active');
    });

    layoutRow.append(vertBtn, horizBtn);

    var layoutHint = document.createElement('div');
    layoutHint.className = 'settings-info';
    layoutHint.textContent = 'Reload page to apply layout change. Hold an icon to reorder.';

    settingsEl.append(typesLabel, typesContainer, layoutLabel, layoutRow, layoutHint);

    panel.append(header, section);
    document.body.appendChild(panel);
    updateToggleState();
  }

  function showPassphraseForm(parent, onSubmit) {
    var existing = parent.querySelector('.settings-passphrase-form');
    if (existing) existing.remove();

    var form = document.createElement('div');
    form.className = 'settings-passphrase-form';

    var input1 = document.createElement('input');
    input1.type = 'password';
    input1.className = 'popup-lock-input';
    input1.placeholder = 'New passphrase...';

    var input2 = document.createElement('input');
    input2.type = 'password';
    input2.className = 'popup-lock-input';
    input2.placeholder = 'Confirm passphrase...';

    var error = document.createElement('div');
    error.className = 'popup-lock-error';

    var confirmBtn = document.createElement('button');
    confirmBtn.className = 'popup-lock-btn';
    confirmBtn.textContent = 'Set Passphrase';

    confirmBtn.addEventListener('click', function () {
      if (!input1.value) { error.textContent = 'Passphrase required'; return; }
      if (input1.value.length < 4) { error.textContent = 'At least 4 characters'; return; }
      if (input1.value !== input2.value) { error.textContent = 'Passphrases do not match'; return; }
      error.textContent = '';
      onSubmit(input1.value);
    });

    input2.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') confirmBtn.click();
    });

    form.append(input1, input2, error, confirmBtn);
    parent.appendChild(form);
    input1.focus();
  }

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
    if (note.type === 'global' || note.type === 'todo' || note.type === 'outline') return true;
    if (note.type === 'daily') return note.key === todayKey();
    try {
      var u = new URL(state.currentTabUrl);
      if (note.type === 'site') return note.key === u.hostname.replace(/^www\./, '');
      if (note.type === 'page') return note.key === (u.origin + u.pathname);
    } catch { return false; }
    return false;
  }

  async function loadAllNotes() {
    var stored = await chrome.storage.local.get([GLOBAL_KEY, SITES_KEY, PAGES_KEY, TODOS_KEY, OUTLINES_KEY, DAILY_KEY]);
    // Decrypt any encrypted storage values
    if (Crypto) {
      var keys = [GLOBAL_KEY, SITES_KEY, PAGES_KEY, TODOS_KEY, OUTLINES_KEY, DAILY_KEY];
      for (var di = 0; di < keys.length; di++) {
        var dk = keys[di];
        if (stored[dk] && Crypto.isEncrypted(stored[dk])) {
          stored[dk] = await Crypto.decryptValue(stored[dk]);
        }
      }
    }
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
      r = r || {};
      var sk = String(r.key || r.siteKey || '');
      notes.push({
        type: 'site', key: sk, label: 'Site note — ' + sk,
        body: String(r.body || ''), tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-green', sectionClass: 'is-green', noteTypeId: 'site'
      });
    });

    var pages = stored[PAGES_KEY] || {};
    Object.values(pages).forEach(function (r) {
      r = r || {};
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

    var todos = stored[TODOS_KEY] || {};
    var globalTodo = todos['__global__'];
    if (globalTodo) {
      var items = Array.isArray(globalTodo.items) ? globalTodo.items : [];
      var firstItem = items.length ? items[0].text : '';
      var preview = items.slice(0, 4).map(function (i) { return (i.done ? '✓ ' : '☐ ') + i.text; }).join('\n');
      notes.push({
        type: 'todo', key: '__global__', label: 'To-do list',
        body: firstItem + '\n' + preview, tags: [],
        createdAt: String(globalTodo.createdAt || ''), updatedAt: String(globalTodo.updatedAt || ''),
        borderClass: 'border-purple', sectionClass: 'is-purple', noteTypeId: 'todo'
      });
    }

    var outlines = stored[OUTLINES_KEY] || {};
    Object.keys(outlines).forEach(function (k) {
      var r = outlines[k] || {};
      var items = Array.isArray(r.items) ? r.items : [];
      var firstNode = items.length ? items[0].text : '';
      var preview = items.slice(0, 4).map(function (n) { return '• ' + n.text; }).join('\n');
      notes.push({
        type: 'outline', key: String(r.key || k), label: 'Outline — ' + String(r.name || k),
        body: firstNode + '\n' + preview, tags: [],
        createdAt: String(r.createdAt || ''), updatedAt: String(r.updatedAt || ''),
        borderClass: 'border-orange', sectionClass: 'is-orange', noteTypeId: 'outline'
      });
    });

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
      { type: 'page', label: 'Page Notes', cssClass: 'is-blue', notes: [] },
      { type: 'todo', label: 'To-Do Lists', cssClass: 'is-purple', notes: [] },
      { type: 'outline', label: 'Outlines', cssClass: 'is-orange', notes: [] },
      { type: 'daily', label: 'Daily Notes', cssClass: 'is-red', notes: [] }
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
              type: 'STICKYSITES_OPEN', noteTypeId: note.noteTypeId, key: note.key
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

  var QUICK_OPEN_TYPES = [
    { id: 'global',  label: 'Global',  emoji: '\u{1F310}', cssClass: 'is-yellow' },
    { id: 'site',    label: 'Site',    emoji: '\u{1F4DD}', cssClass: 'is-green' },
    { id: 'page',    label: 'Page',    emoji: '\u{1F4DD}', cssClass: 'is-blue' },
    { id: 'todo',    label: 'Todo',    emoji: '✓',    cssClass: 'is-purple' },
    { id: 'outline', label: 'Outline', emoji: '≡',    cssClass: 'is-orange' },
    { id: 'daily',   label: 'Daily',   emoji: '\u{1F4C5}', cssClass: 'is-red' }
  ];

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

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

  async function openNoteType(typeId, tab) {
    if (tab && tab.id && tab.url && /^https?:/.test(tab.url)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_OPEN', noteTypeId: typeId });
        window.close();
        return;
      } catch { /* content script not available — fall through to popout */ }
    }
    var target = await computePopoutTarget(typeId, tab && tab.url);
    chrome.runtime.sendMessage({
      type: 'STICKYSITES_POPOUT',
      noteTypeId: typeId,
      key: target.key,
      label: target.label
    });
    window.close();
  }

  function renderQuickOpen(tab, enabledTypes) {
    var container = document.getElementById('quick-open');
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    QUICK_OPEN_TYPES.forEach(function (nt) {
      if (enabledTypes[nt.id] === false) return;
      var btn = document.createElement('button');
      btn.className = 'quick-open-btn ' + nt.cssClass;
      btn.title = 'Open ' + nt.label.toLowerCase() + ' note';
      var emoji = document.createElement('span');
      emoji.className = 'qo-emoji';
      emoji.textContent = nt.emoji;
      var label = document.createElement('span');
      label.className = 'qo-label';
      label.textContent = nt.label;
      btn.append(emoji, label);
      btn.addEventListener('click', function () { openNoteType(nt.id, tab); });
      container.appendChild(btn);
    });
  }

  async function initPopup() {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    state.currentTabUrl = (tabs[0] && tabs[0].url) || '';
    state.allNotes = await loadAllNotes();

    // Filter by enabled types from prefs
    var prefsStored = await chrome.storage.local.get('stickysites_prefs_v1');
    var enabledTypes = (prefsStored?.stickysites_prefs_v1 || {}).enabledTypes || {};
    state.allNotes = state.allNotes.filter(function (n) {
      return enabledTypes[n.type] !== false; // default to enabled
    });

    renderQuickOpen(tabs[0], enabledTypes);

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
  }

  // Sync status indicator
  async function updateSyncStatus() {
    var indicator = document.getElementById('sync-status');
    if (!indicator) return;
    if (!window.StickySites?.Sync) { indicator.style.display = 'none'; return; }
    var meta = await window.StickySites.Sync.getMeta();
    if (!meta.signedIn) {
      indicator.style.color = '#475569';
      indicator.title = 'Sync: not signed in';
    } else if (meta.lastSync) {
      indicator.style.color = '#34d399';
      indicator.title = 'Last synced: ' + new Date(meta.lastSync).toLocaleString();
    } else {
      indicator.style.color = '#fbbf24';
      indicator.title = 'Sync: pending first sync';
    }
  }

  // Settings button (always available)
  document.getElementById('settings-btn').addEventListener('click', function () {
    showSettings();
  });

  // Check lock state before initializing
  var unlocked = await checkAndShowLock();
  if (unlocked) {
    await initPopup();
    updateSyncStatus();
  }
})();
