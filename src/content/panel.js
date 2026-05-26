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
    _isExpanded: false,
    _normalSize: null,

    init: function (onClose) {
      this.onClose = onClose;
      var panel = document.createElement('div');
      panel.id = 'stickysites-panel';
      this.el = panel;
      document.documentElement.appendChild(panel);
      this._initDrag();
      this._initResize();
    },

    open: async function (noteType) {
      this.activeNoteType = noteType;
      var note = await this._readNote(noteType);
      this._render(noteType, note);

      // Restore saved size
      var prefs = await window.StickySites.Prefs.read();
      if (prefs.panelSize) {
        this.el.style.width = prefs.panelSize.width + 'px';
        this.el.style.height = prefs.panelSize.height + 'px';
      }
      // Restore saved position
      if (prefs.panelPosition) {
        this.el.style.bottom = 'auto';
        this.el.style.right = 'auto';
        this.el.style.left = prefs.panelPosition.x + 'px';
        this.el.style.top = prefs.panelPosition.y + 'px';
      }

      this.el.classList.add('is-open');
    },

    close: function () {
      this.activeNoteType = null;
      this._isExpanded = false;
      this.el.classList.remove('is-open');
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    },

    _initDrag: function () {
      var self = this;
      var isDragging = false;
      var startX, startY, startLeft, startTop;

      self.el.addEventListener('mousedown', function (e) {
        if (!e.target.closest('.stickysites-panel-header')) return;
        if (e.target.closest('button')) return;
        isDragging = true;
        var rect = self.el.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        self.el.style.cursor = 'grabbing';
        e.preventDefault();
      });

      document.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var newLeft = startLeft + dx;
        var newTop = startTop + dy;
        var rect = self.el.getBoundingClientRect();
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
        self.el.style.bottom = 'auto';
        self.el.style.right = 'auto';
        self.el.style.left = newLeft + 'px';
        self.el.style.top = newTop + 'px';
      });

      document.addEventListener('mouseup', async function () {
        if (!isDragging) return;
        isDragging = false;
        self.el.style.cursor = '';
        var rect = self.el.getBoundingClientRect();
        await window.StickySites.Prefs.write({
          panelPosition: { x: Math.round(rect.left), y: Math.round(rect.top) }
        });
      });
    },

    _initResize: function () {
      var self = this;
      var handle = document.createElement('div');
      handle.className = 'stickysites-panel-resize';
      self.el.appendChild(handle);

      var isResizing = false;
      var startX, startY, startW, startH;

      handle.addEventListener('mousedown', function (e) {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startW = self.el.offsetWidth;
        startH = self.el.offsetHeight;
        e.preventDefault();
        e.stopPropagation();
      });

      document.addEventListener('mousemove', function (e) {
        if (!isResizing) return;
        var newW = Math.max(350, Math.min(startW + (e.clientX - startX), window.innerWidth * 0.9));
        var newH = Math.max(250, Math.min(startH + (e.clientY - startY), window.innerHeight * 0.9));
        self.el.style.width = newW + 'px';
        self.el.style.height = newH + 'px';
      });

      document.addEventListener('mouseup', async function () {
        if (!isResizing) return;
        isResizing = false;
        await window.StickySites.Prefs.write({
          panelSize: { width: self.el.offsetWidth, height: self.el.offsetHeight }
        });
      });
    },

    _toggleExpand: function () {
      if (!this._isExpanded) {
        this._normalSize = { width: this.el.offsetWidth, height: this.el.offsetHeight };
        this.el.style.width = '900px';
        this.el.style.height = Math.min(800, window.innerHeight * 0.9) + 'px';
        this._isExpanded = true;
      } else {
        if (this._normalSize) {
          this.el.style.width = this._normalSize.width + 'px';
          this.el.style.height = this._normalSize.height + 'px';
        }
        this._isExpanded = false;
      }
    },

    _readNote: async function (noteType) {
      var key = noteType.getKey(location);
      try {
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var raw = stored?.[noteType.storageKey];
        if (raw && window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(raw)) {
          raw = await window.StickySites.Crypto.decryptValue(raw);
        }
        if (noteType.storagePattern === 'single') {
          return { body: String(raw?.body ?? ''), tags: [], updatedAt: String(raw?.updatedAt ?? '') };
        }
        if (noteType.storagePattern === 'structured') {
          var map = raw || {};
          var record = map[key];
          if (!record) return null;
          return {
            items: Array.isArray(record.items) ? record.items : [],
            updatedAt: String(record.updatedAt ?? '')
          };
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
          var toStore = record;
          if (window.StickySites.Crypto && await window.StickySites.Crypto.isEnabled() && await window.StickySites.Crypto.getCachedKey()) {
            toStore = await window.StickySites.Crypto.encryptValue(record);
          }
          await chrome.storage.local.set({ [noteType.storageKey]: toStore });
          return record;
        }
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var rawMap = stored?.[noteType.storageKey] || {};
        if (window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(rawMap)) {
          rawMap = await window.StickySites.Crypto.decryptValue(rawMap);
        }
        var map = rawMap;
        var existing = map[key];
        map[key] = {
          key: key,
          label: noteType.getLabel(location),
          body: String(body),
          tags: Array.isArray(tags) ? tags : [],
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        var mapToStore = map;
        if (window.StickySites.Crypto && await window.StickySites.Crypto.isEnabled() && await window.StickySites.Crypto.getCachedKey()) {
          mapToStore = await window.StickySites.Crypto.encryptValue(map);
        }
        await chrome.storage.local.set({ [noteType.storageKey]: mapToStore });
        return map[key];
      } catch { return null; }
    },

    _writeStructured: async function (noteType, items) {
      var key = noteType.getKey(location);
      var now = new Date().toISOString();
      try {
        var stored = await chrome.storage.local.get(noteType.storageKey);
        var rawMap = stored?.[noteType.storageKey] || {};
        if (window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(rawMap)) {
          rawMap = await window.StickySites.Crypto.decryptValue(rawMap);
        }
        var map = rawMap;
        var existing = map[key];
        map[key] = {
          siteKey: key,
          items: Array.isArray(items) ? items : [],
          createdAt: existing?.createdAt || now,
          updatedAt: now
        };
        var mapToStore = map;
        if (window.StickySites.Crypto && await window.StickySites.Crypto.isEnabled() && await window.StickySites.Crypto.getCachedKey()) {
          mapToStore = await window.StickySites.Crypto.encryptValue(map);
        }
        await chrome.storage.local.set({ [noteType.storageKey]: mapToStore });
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

      if (noteType.storagePattern === 'structured') {
        if (noteType.id === 'todo') { this._renderTodo(noteType, note); return; }
        if (noteType.id === 'outline') { this._renderOutline(noteType, note); return; }
      }

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

      var expandBtn = document.createElement('button');
      expandBtn.className = 'stickysites-panel-headerbtn';
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand';
      expandBtn.addEventListener('click', function () {
        self._toggleExpand();
        expandBtn.textContent = self._isExpanded ? '⤡' : '⤢';
        expandBtn.title = self._isExpanded ? 'Shrink' : 'Expand';
      });

      var popoutBtn = document.createElement('button');
      popoutBtn.className = 'stickysites-panel-headerbtn';
      popoutBtn.textContent = '⧉';
      popoutBtn.title = 'Open in window (coming soon)';

      header.append(iconEl, title, popoutBtn, expandBtn, closeBtn);

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

      if (window.StickySites.Mentions) {
        window.StickySites.Mentions.attach(editor);
      }
    },

    _renderTodo: function (noteType, note) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      var self = this;
      var items = (note && note.items) ? note.items.slice() : [];
      var updatedAt = (note && note.updatedAt) || '';

      // Header (same pattern as existing)
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
      closeBtn.addEventListener('click', function () { if (self.onClose) self.onClose(); });

      var expandBtn = document.createElement('button');
      expandBtn.className = 'stickysites-panel-headerbtn';
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand';
      expandBtn.addEventListener('click', function () {
        self._toggleExpand();
        expandBtn.textContent = self._isExpanded ? '⤡' : '⤢';
        expandBtn.title = self._isExpanded ? 'Shrink' : 'Expand';
      });

      var popoutBtn = document.createElement('button');
      popoutBtn.className = 'stickysites-panel-headerbtn';
      popoutBtn.textContent = '⧉';
      popoutBtn.title = 'Open in window (coming soon)';

      header.append(iconEl, title, popoutBtn, expandBtn, closeBtn);

      // Todo list container
      var listEl = document.createElement('div');
      listEl.className = 'stickysites-todo-list';

      // Footer
      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';
      var countEl = document.createElement('span');
      countEl.className = 'stickysites-todo-count';
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      footer.append(countEl, saved);

      function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

      function updateCount() {
        var done = items.filter(function (i) { return i.done; }).length;
        countEl.textContent = done + '/' + items.length + ' done';
      }

      function save() {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(async function () {
          var result = await self._writeStructured(noteType, items);
          if (result) saved.textContent = formatSaved(result.updatedAt);
        }, 500);
      }

      function renderItem(item, index) {
        var row = document.createElement('div');
        row.className = 'stickysites-todo-item' + (item.done ? ' is-done' : '');

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = item.done;
        cb.className = 'stickysites-todo-checkbox';
        cb.addEventListener('change', function () {
          item.done = cb.checked;
          row.classList.toggle('is-done', item.done);
          updateCount();
          save();
        });

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'stickysites-todo-text';
        input.value = item.text;
        input.placeholder = 'New task...';
        input.addEventListener('input', function () {
          item.text = input.value;
          save();
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var newItem = { id: genId(), text: '', done: false };
            items.splice(index + 1, 0, newItem);
            renderList();
            updateCount();
            save();
            var nextInput = listEl.children[index + 1];
            if (nextInput) {
              var ni = nextInput.querySelector('.stickysites-todo-text');
              if (ni) ni.focus();
            }
          }
          if (e.key === 'Backspace' && input.value === '' && items.length > 1) {
            e.preventDefault();
            items.splice(index, 1);
            renderList();
            updateCount();
            save();
            var prevIdx = Math.max(0, index - 1);
            var prevInput = listEl.children[prevIdx];
            if (prevInput) {
              var pi = prevInput.querySelector('.stickysites-todo-text');
              if (pi) pi.focus();
            }
          }
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'stickysites-todo-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function () {
          items.splice(index, 1);
          renderList();
          updateCount();
          save();
        });

        row.append(cb, input, delBtn);
        return row;
      }

      function renderList() {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        items.forEach(function (item, i) {
          listEl.appendChild(renderItem(item, i));
        });
      }

      // Add button
      var addBtn = document.createElement('button');
      addBtn.className = 'stickysites-todo-add';
      addBtn.textContent = '+ Add task';
      addBtn.addEventListener('click', function () {
        items.push({ id: genId(), text: '', done: false });
        renderList();
        updateCount();
        save();
        var last = listEl.lastChild;
        if (last) {
          var li = last.querySelector('.stickysites-todo-text');
          if (li) li.focus();
        }
      });

      // Initialize with at least one empty item if empty
      if (items.length === 0) {
        items.push({ id: genId(), text: '', done: false });
      }

      renderList();
      updateCount();

      // If no existing note, create one
      if (!note) {
        self._writeStructured(noteType, items);
      }

      this.el.append(header, listEl, addBtn, footer);
    },

    _renderOutline: function (noteType, note) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      var self = this;
      var items = (note && note.items) ? JSON.parse(JSON.stringify(note.items)) : [];
      var updatedAt = (note && note.updatedAt) || '';

      // Header
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
      closeBtn.addEventListener('click', function () { if (self.onClose) self.onClose(); });

      var expandBtn = document.createElement('button');
      expandBtn.className = 'stickysites-panel-headerbtn';
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand';
      expandBtn.addEventListener('click', function () {
        self._toggleExpand();
        expandBtn.textContent = self._isExpanded ? '⤡' : '⤢';
        expandBtn.title = self._isExpanded ? 'Shrink' : 'Expand';
      });

      var popoutBtn = document.createElement('button');
      popoutBtn.className = 'stickysites-panel-headerbtn';
      popoutBtn.textContent = '⧉';
      popoutBtn.title = 'Open in window (coming soon)';

      header.append(iconEl, title, popoutBtn, expandBtn, closeBtn);

      var listEl = document.createElement('div');
      listEl.className = 'stickysites-outline-list';

      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';
      var nodeCount = document.createElement('span');
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      footer.append(nodeCount, saved);

      function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

      function countNodes(arr) {
        var c = 0;
        arr.forEach(function (n) {
          c += 1;
          if (n.children && n.children.length) c += countNodes(n.children);
        });
        return c;
      }

      function updateNodeCount() {
        nodeCount.textContent = countNodes(items) + ' nodes';
      }

      function save() {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(async function () {
          var result = await self._writeStructured(noteType, items);
          if (result) saved.textContent = formatSaved(result.updatedAt);
        }, 500);
      }

      function findParent(targetId, arr, parent) {
        for (var i = 0; i < arr.length; i++) {
          if (arr[i].id === targetId) return { parent: parent, array: arr, index: i };
          if (arr[i].children && arr[i].children.length) {
            var found = findParent(targetId, arr[i].children, arr[i]);
            if (found) return found;
          }
        }
        return null;
      }

      function renderNode(node, depth) {
        var row = document.createElement('div');
        row.className = 'stickysites-outline-node';
        row.style.paddingLeft = (depth * 20 + 8) + 'px';

        var bullet = document.createElement('span');
        bullet.className = 'stickysites-outline-bullet';
        bullet.textContent = (node.children && node.children.length) ? (node.collapsed ? '▸' : '▾') : '•';
        bullet.addEventListener('click', function () {
          if (node.children && node.children.length) {
            node.collapsed = !node.collapsed;
            renderAll();
            save();
          }
        });

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'stickysites-outline-text';
        input.value = node.text;
        input.placeholder = 'New item...';
        input.addEventListener('input', function () {
          node.text = input.value;
          save();
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            var loc = findParent(node.id, items, null);
            if (loc) {
              var newNode = { id: genId(), text: '', children: [], collapsed: false };
              loc.array.splice(loc.index + 1, 0, newNode);
              renderAll();
              updateNodeCount();
              save();
              // Focus the new node's input
              var allInputs = listEl.querySelectorAll('.stickysites-outline-text');
              for (var j = 0; j < allInputs.length; j++) {
                if (allInputs[j].value === '' && allInputs[j] !== input) {
                  allInputs[j].focus();
                  break;
                }
              }
            }
          }
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            // Indent: move node to be child of previous sibling
            var loc = findParent(node.id, items, null);
            if (loc && loc.index > 0) {
              var prevSibling = loc.array[loc.index - 1];
              loc.array.splice(loc.index, 1);
              if (!prevSibling.children) prevSibling.children = [];
              prevSibling.children.push(node);
              prevSibling.collapsed = false;
              renderAll();
              save();
              // Refocus
              var allInputs = listEl.querySelectorAll('.stickysites-outline-text');
              allInputs.forEach(function (inp) { if (inp.dataset.nodeId === node.id) inp.focus(); });
            }
          }
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            // Outdent: move node to parent's level
            var loc = findParent(node.id, items, null);
            if (loc && loc.parent) {
              var parentLoc = findParent(loc.parent.id, items, null);
              if (parentLoc) {
                loc.array.splice(loc.index, 1);
                parentLoc.array.splice(parentLoc.index + 1, 0, node);
                renderAll();
                save();
                var allInputs = listEl.querySelectorAll('.stickysites-outline-text');
                allInputs.forEach(function (inp) { if (inp.dataset.nodeId === node.id) inp.focus(); });
              }
            }
          }
          if (e.key === 'Backspace' && input.value === '') {
            e.preventDefault();
            var loc = findParent(node.id, items, null);
            if (loc && !(items.length === 1 && !loc.parent)) {
              // Move children to parent level
              if (node.children && node.children.length) {
                for (var c = node.children.length - 1; c >= 0; c--) {
                  loc.array.splice(loc.index + 1, 0, node.children[c]);
                }
              }
              loc.array.splice(loc.index, 1);
              renderAll();
              updateNodeCount();
              save();
            }
          }
        });
        input.dataset.nodeId = node.id;

        var delBtn = document.createElement('button');
        delBtn.className = 'stickysites-outline-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function () {
          var loc = findParent(node.id, items, null);
          if (loc) {
            loc.array.splice(loc.index, 1);
            renderAll();
            updateNodeCount();
            save();
          }
        });

        row.append(bullet, input, delBtn);

        var container = document.createElement('div');
        container.appendChild(row);

        if (!node.collapsed && node.children && node.children.length) {
          node.children.forEach(function (child) {
            container.appendChild(renderNode(child, depth + 1));
          });
        }

        return container;
      }

      function renderAll() {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        items.forEach(function (node) {
          listEl.appendChild(renderNode(node, 0));
        });
      }

      var addBtn = document.createElement('button');
      addBtn.className = 'stickysites-outline-add';
      addBtn.textContent = '+ Add node';
      addBtn.addEventListener('click', function () {
        items.push({ id: genId(), text: '', children: [], collapsed: false });
        renderAll();
        updateNodeCount();
        save();
        var last = listEl.querySelectorAll('.stickysites-outline-text');
        if (last.length) last[last.length - 1].focus();
      });

      if (items.length === 0) {
        items.push({ id: genId(), text: '', children: [], collapsed: false });
      }

      renderAll();
      updateNodeCount();

      if (!note) {
        self._writeStructured(noteType, items);
      }

      this.el.append(header, listEl, addBtn, footer);
    },

    syncFromStorage: function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (nt.storagePattern === 'structured') return;
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
