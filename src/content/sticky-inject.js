(async function () {
  if (document.getElementById('stickysites-cluster')) return;

  var SS = window.StickySites;
  var noteTypes = SS.noteTypes;

  function findNoteType(id) {
    for (var i = 0; i < noteTypes.length; i++) {
      if (noteTypes[i].id === id) return noteTypes[i];
    }
    return null;
  }

  async function checkUnlocked() {
    if (!window.StickySites.Crypto) return true;
    var enabled = await window.StickySites.Crypto.isEnabled();
    if (!enabled) return true;
    var key = await window.StickySites.Crypto.getCachedKey();
    return !!key;
  }

  function showLockOverlay(pendingTypeId) {
    SS.Panel.close();
    var overlay = document.getElementById('stickysites-lock');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'stickysites-lock';

    var title = document.createElement('div');
    title.className = 'stickysites-lock-title';
    title.textContent = 'StickySites Locked';

    var input = document.createElement('input');
    input.type = 'password';
    input.className = 'stickysites-lock-input';
    input.placeholder = 'Enter passphrase...';

    var btn = document.createElement('button');
    btn.className = 'stickysites-lock-btn';
    btn.textContent = 'Unlock';

    var error = document.createElement('div');
    error.className = 'stickysites-lock-error';

    async function doUnlock() {
      if (!input.value) return;
      var ok = await window.StickySites.Crypto.unlock(input.value);
      if (ok) {
        overlay.remove();
        if (pendingTypeId) handleIconClick(pendingTypeId);
      } else {
        error.textContent = 'Wrong passphrase';
        input.value = '';
        input.focus();
      }
    }

    btn.addEventListener('click', doUnlock);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') doUnlock();
    });

    overlay.append(title, input, btn, error);
    document.documentElement.appendChild(overlay);
    input.focus();
  }

  async function handleIconClick(typeId) {
    if (!typeId) {
      SS.Panel.close();
      return;
    }
    var unlocked = await checkUnlocked();
    if (!unlocked) {
      showLockOverlay(typeId);
      return;
    }
    var noteType = findNoteType(typeId);
    if (noteType) SS.Panel.open(noteType);
    else SS.Panel.close();
  }

  // Toast notification
  function showToast(message) {
    var existing = document.getElementById('stickysites-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'stickysites-toast';
    toast.textContent = message;
    document.documentElement.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add('is-visible');
    });
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () { toast.remove(); }, 300);
    }, 2000);
  }

  // Clip text into a note
  async function clipToNote(noteTypeId, text) {
    var nt = findNoteType(noteTypeId);
    if (!nt || !text) return;
    // While locked, a write would silently lose the clip (the stored value is
    // an envelope this context can't decrypt). Tell the user instead.
    if (!await checkUnlocked()) {
      showToast('StickySites is locked — unlock to clip');
      return;
    }
    var key = nt.getKey(location);
    var C = window.StickySites.Crypto;

    if (nt.storagePattern === 'structured') {
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
        // Append to the active outline document (or the first in the library / a new one).
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
    } else {
      var stored = await chrome.storage.local.get(nt.storageKey);
      var raw = stored?.[nt.storageKey];
      if (raw && C && C.isEncrypted(raw)) raw = await C.decryptValue(raw);
      var htmlSnippet = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';

      if (nt.storagePattern === 'single') {
        var body = (raw && raw.body) || '';
        var newBody = body ? body + '<p><br></p>' + htmlSnippet : htmlSnippet;
        var record = { body: newBody, updatedAt: new Date().toISOString() };
        var toStore = record;
        if (C && await C.isEnabled() && await C.getCachedKey()) {
          toStore = await C.encryptValue(record);
        }
        await chrome.storage.local.set({ [nt.storageKey]: toStore });
      } else {
        var map = raw || {};
        var record = map[key];
        var body = (record && record.body) || '';
        var newBody = body ? body + '<p><br></p>' + htmlSnippet : htmlSnippet;
        map[key] = {
          key: key,
          label: nt.getLabel(location),
          body: newBody,
          tags: (record && Array.isArray(record.tags)) ? record.tags : [],
          createdAt: (record && record.createdAt) || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        var mapToStore = map;
        if (C && await C.isEnabled() && await C.getCachedKey()) {
          mapToStore = await C.encryptValue(map);
        }
        await chrome.storage.local.set({ [nt.storageKey]: mapToStore });
      }
    }
    showToast('Added to ' + nt.label + ' ✓');
  }

  // Number badges on cluster icons
  var badgeTimeout = null;
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
          handleIconClick(nt.id);
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
        handleIconClick(cycled.id);
      }
    }
  });

  // Ctrl/Cmd + F1..F6 → toggle (show/hide/switch) a specific note type
  // Works regardless of cluster visibility or host-page focus.
  document.addEventListener('keydown', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    if (!/^F[1-6]$/.test(e.key)) return;
    var idx = parseInt(e.key.slice(1), 10) - 1;
    if (idx < 0 || idx >= noteTypes.length) return;
    e.preventDefault();
    e.stopPropagation();
    var nt = noteTypes[idx];
    (async function () {
      try {
        var stored = await chrome.storage.local.get('stickysites_prefs_v1');
        var enabledTypes = (stored?.stickysites_prefs_v1 || {}).enabledTypes || {};
        if (enabledTypes[nt.id] === false) return;
      } catch { /* prefs unavailable — proceed */ }
      // Same type already open → close (toggle off)
      if (SS.Panel.activeNoteType && SS.Panel.activeNoteType.id === nt.id) {
        SS.Cluster.setActive(null);
        SS.Panel.close();
        return;
      }
      // Closed or different type → ensure cluster visible then open this type
      if (SS.Cluster.hidden) SS.Cluster.toggle();
      SS.Cluster.setActive(nt.id);
      handleIconClick(nt.id);
    })();
  });

  SS.Panel.init(function () {
    SS.Cluster.setActive(null);
    SS.Panel.close();
  });

  await SS.Cluster.init(noteTypes, handleIconClick);

  // Show badges on initial load if cluster is visible
  if (!SS.Cluster.hidden) showBadges();

  // Patch toggle to show badges when cluster becomes visible
  var originalToggle = SS.Cluster.toggle.bind(SS.Cluster);
  SS.Cluster.toggle = function () {
    originalToggle();
    if (!SS.Cluster.hidden) showBadges();
  };

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

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg?.type === 'STICKYSITES_TOGGLE') {
      SS.Cluster.toggle();
      if (SS.Cluster.hidden) SS.Panel.close();
    }
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
    if (msg?.type === 'STICKYSITES_CLIP') {
      clipToNote(msg.noteTypeId, msg.text);
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    SS.Panel.syncFromStorage(changes);
    // Live-apply a cluster-layout change from the popup — no page reload needed.
    if (changes.stickysites_prefs_v1 && SS.Cluster.applyLayout) {
      var newPrefs = changes.stickysites_prefs_v1.newValue || {};
      SS.Cluster.applyLayout(newPrefs.clusterLayout || 'vertical');
    }
  });
})();
