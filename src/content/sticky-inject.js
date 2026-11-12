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

  var lockedTypeId = null;
  var selectionGeneration = 0;
  function showLockOverlay(pendingTypeId) {
    SS.Panel.close(true);
    var overlay = document.getElementById('stickysites-lock');
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.id = 'stickysites-lock';

    var title = document.createElement('div');
    title.className = 'stickysites-lock-title';
    title.textContent = 'StickySites Locked';

    var desc = document.createElement('div');
    desc.textContent = 'Open StickySites to enter your passphrase securely.';
    var btn = document.createElement('button');
    btn.className = 'stickysites-lock-btn';
    btn.textContent = 'Unlock in StickySites';
    var error = document.createElement('div');
    error.className = 'stickysites-lock-error';
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var result = await chrome.runtime.sendMessage({ type: 'STICKYSITES_UNLOCK' });
        if (!result?.ok) throw new Error('UNLOCK_WINDOW_FAILED');
      } catch { error.textContent = 'Could not open StickySites. Use the toolbar icon to unlock.'; }
      finally { btn.disabled = false; }
    });
    lockedTypeId = pendingTypeId || lockedTypeId;
    overlay.append(title, desc, btn, error);
    document.documentElement.appendChild(overlay);
    btn.focus();
  }

  async function handleIconClick(typeId, request) {
    if (request === undefined) request = ++selectionGeneration;
    if (request !== selectionGeneration) return;
    if (!typeId) {
      lockedTypeId = null;
      var overlay = document.getElementById('stickysites-lock');
      if (overlay) overlay.remove();
      SS.Panel.close();
      return;
    }
    var unlocked;
    try { unlocked = await checkUnlocked(); } catch { unlocked = false; }
    if (request !== selectionGeneration) return;
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
    try {
      await SS.Storage.request({ op: 'clip', storageKey: nt.storageKey, key: nt.getKey(location), text: text, data: { label: nt.getLabel(location) } });
    } catch {
      showToast('Could not save clip. Unlock StickySites and try again.');
      return;
    }
    showToast('Added to ' + nt.label + ' ✓');
  }

  // Note-type shortcuts live entirely in the Ctrl/Cmd + F1..F6 handler below.
  // The previous bare-key system (1-5 / `A`, plus its 3-second number badges)
  // was removed: with no modifier required it hijacked ordinary keystrokes
  // whenever the cluster was visible and focus was on the page body, breaking
  // page typing and navigation. An earlier partial fix only stopped modifier
  // combos (Cmd/Ctrl/Alt) from being swallowed; this removes the bare-key
  // handler outright so unmodified keystrokes are never intercepted.

  // Ctrl/Cmd + F1..F6 → toggle (show/hide/switch) a specific note type
  // Works regardless of cluster visibility or host-page focus.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && SS.Cluster && SS.Cluster._hotkeyExpanded) {
      SS.Cluster.setHotkeyExpanded(false);
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    if (!/^F[1-6]$/.test(e.key)) return;
    var idx = parseInt(e.key.slice(1), 10) - 1;
    if (idx < 0 || idx >= noteTypes.length) return;
    e.preventDefault();
    e.stopPropagation();
    var nt = noteTypes[idx];
    var request = ++selectionGeneration;
    (async function () {
      try {
        var stored = await chrome.storage.local.get('stickysites_prefs_v1');
        var enabledTypes = (stored?.stickysites_prefs_v1 || {}).enabledTypes || {};
        if (enabledTypes[nt.id] === false) return;
      } catch { /* prefs unavailable — proceed */ }
      if (request !== selectionGeneration) return;
      // Same type already open → close (toggle off)
      if ((SS.Panel.activeNoteType && SS.Panel.activeNoteType.id === nt.id) || SS.Cluster.activeTypeId === nt.id) {
        SS.Cluster.setActive(null);
        handleIconClick(null, request);
        return;
      }
      // Closed or different type → ensure cluster visible then open this type
      if (SS.Cluster.hidden) SS.Cluster.toggle();
      SS.Cluster.setActive(nt.id);
      handleIconClick(nt.id, request);
    })();
  });

  SS.Panel.init(function () {
    SS.Cluster.setActive(null);
    handleIconClick(null);
  });

  await SS.Cluster.init(noteTypes, handleIconClick);

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
    // open captures its generation before flushing, so a later close or selection wins.
    SS.Panel.open(nt);
  }
  window.addEventListener('popstate', onUrlChange);
  window.addEventListener('hashchange', onUrlChange);
  setInterval(onUrlChange, 1000);

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg?.type === 'STICKYSITES_TOGGLE') {
      SS.Cluster.toggle(msg.fromCommand);
      if (SS.Cluster.hidden) handleIconClick(null);
    }
    if (msg?.type === 'STICKYSITES_OPEN') {
      var noteType = findNoteType(msg.noteTypeId);
      if (noteType) {
        var request = ++selectionGeneration;
        (async function () {
          // A popup card click can target a specific outline document.
          if (msg.key && noteType.id === 'outline') {
            await window.StickySites.Prefs.write({ activeOutlineId: msg.key });
          }
          if (request !== selectionGeneration) return;
          if (SS.Cluster.hidden) SS.Cluster.toggle();
          SS.Cluster.setActive(noteType.id);
          handleIconClick(noteType.id, request);
        })();
      }
    }
    if (msg?.type === 'STICKYSITES_CLIP') {
      clipToNote(msg.noteTypeId, msg.text);
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.stickysites_cached_key || changes.stickysites_crypto_v1) {
      var request = ++selectionGeneration;
      (async function () {
        var unlocked = await checkUnlocked();
        if (request !== selectionGeneration) return;
        if (!unlocked) { var pending = SS.Panel.activeNoteType?.id || SS.Cluster.activeTypeId; SS.Cluster.setActive(null); showLockOverlay(pending); }
        else {
          var overlay = document.getElementById('stickysites-lock');
          if (overlay) { overlay.remove(); var pending = lockedTypeId; lockedTypeId = null; if (pending) handleIconClick(pending, request); }
        }
      })().catch(function () { if (request === selectionGeneration) showLockOverlay(SS.Panel.activeNoteType?.id); });
    }
    SS.Panel.syncFromStorage(changes);
    // Live-apply cluster prefs from the popup — no page reload needed.
    if (changes.stickysites_prefs_v1 && SS.Cluster) {
      var newPrefs = changes.stickysites_prefs_v1.newValue || {};
      if (SS.Cluster.applyLayout) {
        SS.Cluster.applyLayout(newPrefs.clusterLayout || 'vertical');
      }
      if (SS.Cluster.applyCollapsePref) {
        SS.Cluster.applyCollapsePref(!!newPrefs.collapseToCircle);
      }
    }
  });
})();
