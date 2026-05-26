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

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    SS.Panel.syncFromStorage(changes);
  });
})();
