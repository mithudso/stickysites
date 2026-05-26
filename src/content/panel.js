window.StickySites = window.StickySites || {};

(function () {
  function formatSaved(iso) {
    if (!iso) return '';
    try { return 'Saved ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function parseTags(input) {
    if (!input) return [];
    return Array.from(new Set(
      input.split(/[,\s]+/).map(function (t) { return t.trim().toLowerCase(); })
        .filter(Boolean)
        .map(function (t) { return t.startsWith('#') ? t : '#' + t; })
    ));
  }

  window.StickySites.Panel = {
    el: null,
    activeNoteType: null,
    onClose: null,
    _saveTimer: null,

    init: function (onClose) {
      this.onClose = onClose;
      var panel = document.createElement('div');
      panel.id = 'stickysites-panel';
      this.el = panel;
      document.documentElement.appendChild(panel);
    },

    open: async function (noteType) {
      this.activeNoteType = noteType;
      var note = await this._readNote(noteType);
      this._render(noteType, note);
      this.el.classList.add('is-open');
    },

    close: function () {
      this.activeNoteType = null;
      this.el.classList.remove('is-open');
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    },

    _readNote: async function (noteType) {
      var key = noteType.getKey(location);
      try {
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var raw = stored?.[noteType.storageKey];
        if (noteType.storagePattern === 'single') {
          return { body: String(raw?.body ?? ''), tags: [], updatedAt: String(raw?.updatedAt ?? '') };
        }
        var map = raw || {};
        var record = map[key];
        if (!record) return null;
        return {
          body: String(record.body ?? ''),
          tags: Array.isArray(record.tags) ? record.tags : [],
          updatedAt: String(record.updatedAt ?? '')
        };
      } catch { return null; }
    },

    _writeNote: async function (noteType, body, tags) {
      var key = noteType.getKey(location);
      var now = new Date().toISOString();
      try {
        if (noteType.storagePattern === 'single') {
          var record = { body: String(body), updatedAt: now };
          await chrome.storage.local.set({ [noteType.storageKey]: record });
          return record;
        }
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var map = stored?.[noteType.storageKey] || {};
        var existing = map[key];
        map[key] = {
          key: key,
          label: noteType.getLabel(location),
          body: String(body),
          tags: Array.isArray(tags) ? tags : [],
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        await chrome.storage.local.set({ [noteType.storageKey]: map });
        return map[key];
      } catch { return null; }
    },

    _render: function (noteType, note) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      var self = this;
      var body = note?.body ?? '';
      var tags = note?.tags ?? [];
      var updatedAt = note?.updatedAt ?? '';

      var header = document.createElement('div');
      header.className = 'stickysites-panel-header';
      header.style.background = noteType.tint;
      header.style.color = noteType.tintText;

      var iconEl = document.createElement('span');
      iconEl.className = 'stickysites-panel-icon';
      iconEl.style.background = noteType.color;
      iconEl.textContent = noteType.emoji;

      var title = document.createElement('span');
      title.className = 'stickysites-panel-title';
      title.textContent = noteType.getLabel(location);

      var closeBtn = document.createElement('button');
      closeBtn.className = 'stickysites-panel-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', function () {
        if (self.onClose) self.onClose();
      });

      header.append(iconEl, title, closeBtn);

      var actions = document.createElement('div');
      actions.className = 'stickysites-panel-actions';

      var copyBtn = document.createElement('button');
      copyBtn.className = 'stickysites-panel-action-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', function () {
        var ta = self.el.querySelector('.stickysites-panel-textarea');
        if (ta) {
          navigator.clipboard.writeText(ta.value).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        }
      });
      actions.appendChild(copyBtn);

      var textarea = document.createElement('textarea');
      textarea.className = 'stickysites-panel-textarea';
      textarea.value = body;
      textarea.placeholder = noteType.getPlaceholder(location);

      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';

      var tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'stickysites-panel-tags';
      tagInput.placeholder = '#tags';
      tagInput.value = tags.join(', ');

      var meta = document.createElement('span');
      meta.className = 'stickysites-panel-meta';
      var chars = document.createElement('span');
      chars.textContent = body.length + ' chars';
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      meta.append(chars, saved);
      footer.append(tagInput, meta);

      var doSave = async function () {
        var result = await self._writeNote(
          noteType,
          textarea.value,
          parseTags(tagInput.value)
        );
        if (result) {
          chars.textContent = textarea.value.length + ' chars';
          saved.textContent = formatSaved(result.updatedAt);
        }
      };

      var debouncedSave = function () {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(doSave, 500);
      };

      textarea.addEventListener('input', debouncedSave);
      tagInput.addEventListener('input', debouncedSave);

      if (!note && noteType.storagePattern === 'map') {
        this._writeNote(noteType, '', []);
      }

      this.el.append(header, actions, textarea, footer);
    },

    syncFromStorage: function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (!changes[nt.storageKey]) return;

      var ta = this.el.querySelector('.stickysites-panel-textarea');
      if (!ta) return;

      var newValue = changes[nt.storageKey].newValue;
      if (nt.storagePattern === 'single') {
        if (newValue && ta.value !== newValue.body) ta.value = newValue.body;
      } else {
        var key = nt.getKey(location);
        var map = newValue || {};
        var record = map[key];
        if (record && ta.value !== record.body) ta.value = record.body;
      }
    }
  };
})();
