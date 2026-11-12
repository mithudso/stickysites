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
  async function refreshLock() {
    var current = ++generation, C = window.StickySites.Crypto;
    var locked = await C.isEnabled() && !await C.getCachedKey();
    if (current !== generation) return;
    if (locked) {
      await Panel.close(true);
      if (current !== generation) return;
      Panel.el.textContent = 'StickySites is locked. Unlock it with the extension toolbar icon.';
      Panel.el.classList.add('is-open');
    } else await Panel.open(noteType);
  }
  refreshLock();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes.stickysites_cached_key || changes.stickysites_crypto_v1)) refreshLock();
  });

})();
