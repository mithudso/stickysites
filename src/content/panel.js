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

  function isHtml(str) {
    return str && /^<[a-z][\s\S]*>/i.test(str.trim());
  }

  function plainTextToHtml(text) {
    if (!text) return '';
    return text.split('\n').map(function (line) {
      var escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<p>' + (escaped || '<br>') + '</p>';
    }).join('');
  }

  function bodyToHtml(body) {
    if (!body) return '';
    return isHtml(body) ? body : plainTextToHtml(body);
  }

  function getPlainText(editorEl) {
    return editorEl.textContent || editorEl.innerText || '';
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

    _buildToolbar: function (editorEl) {
      var toolbar = document.createElement('div');
      toolbar.className = 'stickysites-panel-toolbar';

      function makeBtn(label, command, value) {
        var btn = document.createElement('button');
        btn.className = 'stickysites-toolbar-btn';
        btn.textContent = label;
        btn.type = 'button';
        btn.addEventListener('mousedown', function (e) {
          e.preventDefault();
          if (command === 'insertHTML') {
            document.execCommand('insertHTML', false, value);
          } else {
            document.execCommand(command, false, value || null);
          }
          editorEl.focus();
        });
        return btn;
      }

      function makeSep() {
        var sep = document.createElement('span');
        sep.className = 'stickysites-toolbar-sep';
        return sep;
      }

      // Row 1: formatting buttons
      var row1 = document.createElement('div');
      row1.className = 'stickysites-toolbar-row';

      row1.appendChild(makeBtn('B', 'bold'));
      row1.appendChild(makeBtn('I', 'italic'));
      row1.appendChild(makeBtn('U', 'underline'));
      row1.appendChild(makeBtn('S', 'strikeThrough'));
      row1.appendChild(makeSep());
      row1.appendChild(makeBtn('H1', 'formatBlock', 'h1'));
      row1.appendChild(makeBtn('H2', 'formatBlock', 'h2'));
      row1.appendChild(makeBtn('H3', 'formatBlock', 'h3'));
      row1.appendChild(makeSep());
      row1.appendChild(makeBtn('•', 'insertUnorderedList'));
      row1.appendChild(makeBtn('1.', 'insertOrderedList'));
      row1.appendChild(makeBtn('☐', 'insertHTML', '<label><input type="checkbox"> </label>'));
      row1.appendChild(makeSep());
      row1.appendChild(makeBtn('⪷', 'justifyLeft'));
      row1.appendChild(makeBtn('≡', 'justifyCenter'));
      row1.appendChild(makeBtn('⪸', 'justifyRight'));
      row1.appendChild(makeBtn('—', 'insertHorizontalRule'));
      row1.appendChild(makeBtn('→', 'indent'));
      row1.appendChild(makeBtn('←', 'outdent'));

      // Row 2: dropdowns and color
      var row2 = document.createElement('div');
      row2.className = 'stickysites-toolbar-row';

      var fontFamilySelect = document.createElement('select');
      fontFamilySelect.className = 'stickysites-toolbar-btn';
      var fontFamilies = [
        { label: 'Sans-serif', value: '' },
        { label: 'Serif', value: 'serif' },
        { label: 'Monospace', value: 'monospace' },
        { label: 'Georgia', value: 'Georgia' },
        { label: 'Courier New', value: 'Courier New' }
      ];
      fontFamilies.forEach(function (ff) {
        var opt = document.createElement('option');
        opt.textContent = ff.label;
        opt.value = ff.value;
        fontFamilySelect.appendChild(opt);
      });
      fontFamilySelect.addEventListener('change', function () {
        if (fontFamilySelect.value) {
          document.execCommand('fontName', false, fontFamilySelect.value);
        }
        editorEl.focus();
      });
      row2.appendChild(fontFamilySelect);

      var fontSizeSelect = document.createElement('select');
      fontSizeSelect.className = 'stickysites-toolbar-btn';
      var fontSizes = [
        { label: 'Small', value: '1' },
        { label: 'Normal', value: '3' },
        { label: 'Large', value: '5' },
        { label: 'XL', value: '7' }
      ];
      fontSizes.forEach(function (fs) {
        var opt = document.createElement('option');
        opt.textContent = fs.label;
        opt.value = fs.value;
        if (fs.value === '3') opt.selected = true;
        fontSizeSelect.appendChild(opt);
      });
      fontSizeSelect.addEventListener('change', function () {
        document.execCommand('fontSize', false, fontSizeSelect.value);
        editorEl.focus();
      });
      row2.appendChild(fontSizeSelect);

      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'stickysites-toolbar-btn';
      colorInput.value = '#e2e8f0';
      colorInput.addEventListener('input', function () {
        document.execCommand('foreColor', false, colorInput.value);
        editorEl.focus();
      });
      row2.appendChild(colorInput);

      toolbar.append(row1, row2);
      return toolbar;
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
        var ed = self.el.querySelector('.stickysites-panel-editor');
        if (ed) {
          navigator.clipboard.writeText(getPlainText(ed)).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
          });
        }
      });
      actions.appendChild(copyBtn);

      // Build editor — content is user-authored HTML from extension-isolated chrome.storage.local only
      var editor = document.createElement('div');
      editor.className = 'stickysites-panel-editor';
      editor.contentEditable = 'true';
      // Safe: body is user-authored content read from chrome.storage.local (extension-isolated storage)
      editor.innerHTML = bodyToHtml(body); // nosec — user-authored content from isolated extension storage
      if (!body) {
        editor.dataset.placeholder = noteType.getPlaceholder(location);
      }

      var toolbar = self._buildToolbar(editor);

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
      chars.textContent = getPlainText(editor).length + ' chars';
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      meta.append(chars, saved);
      footer.append(tagInput, meta);

      var doSave = async function () {
        var result = await self._writeNote(
          noteType,
          editor.innerHTML,
          parseTags(tagInput.value)
        );
        if (result) {
          chars.textContent = getPlainText(editor).length + ' chars';
          saved.textContent = formatSaved(result.updatedAt);
        }
      };

      var debouncedSave = function () {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(doSave, 500);
      };

      editor.addEventListener('input', debouncedSave);
      tagInput.addEventListener('input', debouncedSave);

      if (!note && noteType.storagePattern === 'map') {
        this._writeNote(noteType, '', []);
      }

      this.el.append(header, actions, toolbar, editor, footer);
    },

    syncFromStorage: function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (!changes[nt.storageKey]) return;

      var ed = this.el.querySelector('.stickysites-panel-editor');
      if (!ed) return;

      var newValue = changes[nt.storageKey].newValue;
      if (nt.storagePattern === 'single') {
        // Safe: newValue.body is user-authored content from chrome.storage.local (extension-isolated storage)
        if (newValue && ed.innerHTML !== newValue.body) ed.innerHTML = bodyToHtml(newValue.body); // nosec
      } else {
        var key = nt.getKey(location);
        var map = newValue || {};
        var record = map[key];
        // Safe: record.body is user-authored content from chrome.storage.local (extension-isolated storage)
        if (record && ed.innerHTML !== record.body) ed.innerHTML = bodyToHtml(record.body); // nosec
      }
    }
  };
})();
