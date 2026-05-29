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
  Panel.open(noteType);

  var resize = document.querySelector('.stickysites-panel-resize');
  if (resize) resize.remove();
})();
