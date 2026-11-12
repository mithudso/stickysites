(function () {
  var params = new URLSearchParams(window.location.search);
  var typeId = params.get('type');
  var key = params.get('key') || '';
  var label = params.get('label') || '';

  if (!typeId) {
    document.body.textContent = 'Missing note type parameter.';
    return;
  }

  var noteTypes = window.StickySites.noteTypes;
  var noteType = null;
  for (var i = 0; i < noteTypes.length; i++) {
    if (noteTypes[i].id === typeId) {
      noteType = Object.assign({}, noteTypes[i]);
      break;
    }
  }

  if (!noteType) {
    document.body.textContent = 'Unknown note type: ' + typeId;
    return;
  }

  noteType.getKey = function () { return key; };
  noteType.getLabel = function () { return label; };

  document.title = label + ' — StickySites';

  var Panel = window.StickySites.Panel;
  Panel.init(function () {
    window.close();
  });
  var generation = 0;
  async function showUnavailable(current, message, state = 'unavailable') {
    try { await Panel.close(true); } catch { Panel.el.replaceChildren(); }
    if (current !== generation) return;
    Panel.el.textContent = message;
    Panel.el.dataset.lockState = state;
    var retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.addEventListener('click', refreshLock);
    Panel.el.appendChild(retry);
    Panel.el.classList.add('is-open');
  }
  async function refreshLock() {
    var current = ++generation, C = window.StickySites.Crypto;
    try {
      var locked = await C.isEnabled() && !await C.getCachedKey();
      if (current !== generation) return;
      if (locked) await showUnavailable(current, 'StickySites is locked. Unlock it with the extension toolbar icon.', 'locked');
      else { delete Panel.el.dataset.lockState; await Panel.open(noteType); }
    } catch {
      if (current === generation) await showUnavailable(current, 'Could not verify the lock state. Retry before viewing this note.');
    }
  }
  refreshLock();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.stickysites_cached_key || changes.stickysites_crypto_v1) refreshLock();
    else Panel.syncFromStorage(changes).catch(function () {});
  });

})();
