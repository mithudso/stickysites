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

  function handleIconClick(typeId) {
    if (!typeId) {
      SS.Panel.close();
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
    var key = nt.getKey(location);

    if (nt.storagePattern === 'structured') {
      var stored = await chrome.storage.local.get(nt.storageKey);
      var map = stored?.[nt.storageKey] || {};
      var record = map[key];
      var items = (record && Array.isArray(record.items)) ? record.items : [];
      var newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      if (noteTypeId === 'todo') {
        items.push({ id: newId, text: text, done: false });
      } else if (noteTypeId === 'outline') {
        items.push({ id: newId, text: text, children: [], collapsed: false });
      }

      map[key] = {
        siteKey: key,
        items: items,
        createdAt: (record && record.createdAt) || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ [nt.storageKey]: map });
    } else {
      var stored = await chrome.storage.local.get(nt.storageKey);
      var raw = stored?.[nt.storageKey];
      var htmlSnippet = '<p>' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';

      if (nt.storagePattern === 'single') {
        var body = (raw && raw.body) || '';
        var newBody = body ? body + '<p><br></p>' + htmlSnippet : htmlSnippet;
        await chrome.storage.local.set({ [nt.storageKey]: { body: newBody, updatedAt: new Date().toISOString() } });
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
        await chrome.storage.local.set({ [nt.storageKey]: map });
      }
    }
    showToast('Added to ' + nt.label + ' ✓');
  }

  // Number badges on cluster icons
  var badgeTimeout = null;
  function showBadges() {
    if (badgeTimeout) clearTimeout(badgeTimeout);
    SS.Cluster.buttons.forEach(function (b, i) {
      var existing = b.el.querySelector('.stickysites-cluster-badge');
      if (existing) existing.remove();
      var badge = document.createElement('span');
      badge.className = 'stickysites-cluster-badge';
      badge.textContent = (i < 5) ? String(i + 1) : '';
      b.el.style.position = 'relative';
      b.el.appendChild(badge);
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

  // Chord hotkey system
  var chordCycleIndex = 0;
  document.addEventListener('keydown', function (e) {
    if (SS.Cluster.hidden) return;
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

    var key = e.key;
    if (key >= '1' && key <= '5') {
      var idx = parseInt(key) - 1;
      if (idx < noteTypes.length) {
        e.preventDefault();
        SS.Cluster.setActive(noteTypes[idx].id);
        SS.Panel.open(noteTypes[idx]);
      }
    }
    if (key === 'a' || key === 'A') {
      e.preventDefault();
      chordCycleIndex = (chordCycleIndex + 1) % noteTypes.length;
      var nt = noteTypes[chordCycleIndex];
      SS.Cluster.setActive(nt.id);
      SS.Panel.open(nt);
    }
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

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg?.type === 'STICKYSITES_TOGGLE') {
      SS.Cluster.toggle();
      if (SS.Cluster.hidden) SS.Panel.close();
    }
    if (msg?.type === 'STICKYSITES_OPEN') {
      var noteType = findNoteType(msg.noteTypeId);
      if (noteType) {
        if (SS.Cluster.hidden) SS.Cluster.toggle();
        SS.Cluster.setActive(noteType.id);
        SS.Panel.open(noteType);
      }
    }
    if (msg?.type === 'STICKYSITES_CLIP') {
      clipToNote(msg.noteTypeId, msg.text);
    }
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    SS.Panel.syncFromStorage(changes);
  });
})();
