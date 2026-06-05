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

  function getCleanHtml(editorEl) {
    var marks = editorEl.querySelectorAll('.stickysites-search-match');
    if (!marks.length) return editorEl.innerHTML;
    var clone = editorEl.cloneNode(true);
    clone.querySelectorAll('.stickysites-search-match').forEach(function (mark) {
      while (mark.firstChild) mark.parentNode.insertBefore(mark.firstChild, mark);
      mark.remove();
    });
    return clone.innerHTML;
  }

  window.StickySites.Panel = {
    el: null,
    activeNoteType: null,
    onClose: null,
    _saveTimer: null,
    _isExpanded: false,
    _normalSize: null,
    _flushSave: null,
    _activeKey: null,
    _activeLabel: null,
    _lastSavedBody: null,

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
      // Commit any pending edit from the previous note under ITS OWN snapshot
      // key before re-snapshotting — otherwise the armed 500ms save would fire
      // after the switch and write the old note's content under the new key.
      if (this._saveTimer) await this.flushPendingSave();
      this.activeNoteType = noteType;
      // Snapshot the storage key/label once per panel session. All reads and
      // writes use the snapshot, so a save can never land under another page's
      // key after an SPA navigation (or a daily note crossing midnight).
      this._activeKey = noteType.getKey(location);
      this._activeLabel = noteType.getLabel(location);
      this._lastSavedBody = null;
      // Cleared per-open so a stale save closure from a previous note type can
      // never write to the wrong storage key; the rich-text renderer re-sets it.
      this._flushSave = null;
      var note = await this._readNote(noteType);
      this._render(noteType, note);
      this.el.classList.add('is-open');

      try {
        var prefs = await window.StickySites.Prefs.read();
        if (prefs.panelSize) {
          this.el.style.width = prefs.panelSize.width + 'px';
          this.el.style.height = prefs.panelSize.height + 'px';
        }
        if (prefs.panelPosition) {
          var x = Math.max(0, Math.min(prefs.panelPosition.x, window.innerWidth - 350));
          var y = Math.max(0, Math.min(prefs.panelPosition.y, window.innerHeight - 250));
          this.el.style.bottom = 'auto';
          this.el.style.right = 'auto';
          this.el.style.left = x + 'px';
          this.el.style.top = y + 'px';
        }
      } catch (e) { /* prefs are non-critical — panel is already visible */ }
    },

    close: function () {
      // A pending edit is committed, not dropped: the save closure captures the
      // editor DOM and the snapshot key synchronously, before teardown below.
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        if (this._flushSave) {
          try { this._flushSave(); } catch (e) { /* save is best-effort */ }
        }
      }
      this.activeNoteType = null;
      this._isExpanded = false;
      this._flushSave = null;
      this._activeKey = null;
      this._activeLabel = null;
      this._lastSavedBody = null;
      this.el.classList.remove('is-open');
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      this.el.style.left = '';
      this.el.style.top = '';
      this.el.style.right = '';
      this.el.style.bottom = '';
      this.el.style.width = '';
      this.el.style.height = '';
    },

    _initDrag: function () {
      var self = this;
      // The popout window loads this same panel; there is nothing to pop out of
      // there, so the drag-out-to-popout behavior is disabled in that context.
      var inPopout = location.protocol === 'chrome-extension:';
      var EDGE_HINT = 28; // px from a viewport edge where the "release to pop out" hint appears
      var isDragging = false;
      var hasMoved = false;
      var poppedOut = false;
      var startX, startY, startLeft, startTop;

      function nearEdge(x, y) {
        return x <= EDGE_HINT || y <= EDGE_HINT ||
          x >= window.innerWidth - EDGE_HINT ||
          y >= window.innerHeight - EDGE_HINT;
      }

      self.el.addEventListener('mousedown', function (e) {
        if (!e.target.closest('.stickysites-panel-header')) return;
        if (e.target.closest('button')) return;
        isDragging = true;
        hasMoved = false;
        poppedOut = false;
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
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
        var rect = self.el.getBoundingClientRect();
        var newLeft = startLeft + dx;
        var newTop = startTop + dy;
        if (inPopout) {
          // Keep the panel fully on-screen inside the standalone window.
          newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
          newTop = Math.max(0, Math.min(newTop, window.innerHeight - rect.height));
        }
        self.el.style.bottom = 'auto';
        self.el.style.right = 'auto';
        self.el.style.left = newLeft + 'px';
        self.el.style.top = newTop + 'px';
        if (!inPopout && hasMoved) {
          self.el.classList.toggle('stickysites-panel--will-popout', nearEdge(e.clientX, e.clientY));
        }
      });

      // Dragging the cursor out of the viewport pops the note into its own window.
      // relatedTarget === null on a mouseout means the pointer left the window
      // entirely (element-to-element moves always carry a non-null relatedTarget).
      document.addEventListener('mouseout', function (e) {
        if (inPopout || !isDragging || poppedOut || !hasMoved) return;
        if (e.relatedTarget !== null) return;
        // A real window-exit lands at a viewport edge; this also filters out the
        // null-relatedTarget mouseout fired when the cursor crosses a mid-page iframe.
        if (!nearEdge(e.clientX, e.clientY)) return;
        poppedOut = true;
        isDragging = false;
        self.el.style.cursor = '';
        self.el.classList.remove('stickysites-panel--will-popout');
        self._popoutActiveNote();
      });

      document.addEventListener('mouseup', async function () {
        if (!isDragging) return;
        isDragging = false;
        self.el.style.cursor = '';
        self.el.classList.remove('stickysites-panel--will-popout');
        if (poppedOut) return;
        // Re-clamp into view in case it was pulled partway off-screen, then persist.
        var rect = self.el.getBoundingClientRect();
        var left = Math.max(0, Math.min(rect.left, window.innerWidth - rect.width));
        var top = Math.max(0, Math.min(rect.top, window.innerHeight - rect.height));
        self.el.style.left = left + 'px';
        self.el.style.top = top + 'px';
        if (hasMoved) {
          await window.StickySites.Prefs.write({
            panelPosition: { x: Math.round(left), y: Math.round(top) }
          });
        }
      });
    },

    _popoutActiveNote: async function () {
      var noteType = this.activeNoteType;
      if (!noteType) return;
      // Flush any pending edit so the popout window reads the latest content from
      // storage (the popout reloads the note from chrome.storage, not from the DOM).
      await this.flushPendingSave();
      chrome.runtime.sendMessage({
        type: 'STICKYSITES_POPOUT',
        noteTypeId: noteType.id,
        key: this._activeKey,
        label: this._activeLabel
      });
      if (this.onClose) this.onClose();
    },

    flushPendingSave: async function () {
      if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
      if (this._flushSave) {
        try { await this._flushSave(); } catch (e) { /* save is best-effort */ }
      }
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
      var key = this._activeKey;
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
            sections: Array.isArray(record.sections) ? record.sections : [],
            tagColors: (record.tagColors && typeof record.tagColors === 'object') ? record.tagColors : {},
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
      var key = this._activeKey;
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
          label: this._activeLabel,
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

    _writeStructured: async function (noteType, data) {
      var key = this._activeKey;
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
          key: key,
          items: Array.isArray(data.items) ? data.items : [],
          sections: Array.isArray(data.sections) ? data.sections : (existing?.sections || []),
          tagColors: (data.tagColors && typeof data.tagColors === 'object') ? data.tagColors : (existing?.tagColors || {}),
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
      popoutBtn.title = 'Open in own window';
      popoutBtn.addEventListener('click', function () {
        self._popoutActiveNote();
      });

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

      var searchToggleBtn = document.createElement('button');
      searchToggleBtn.className = 'stickysites-panel-action-btn';
      searchToggleBtn.textContent = '🔍 Find';
      actions.appendChild(searchToggleBtn);

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
          getCleanHtml(editor),
          parseTags(tagInput.value)
        );
        if (result) {
          // Remember exactly what we stored so syncFromStorage can ignore the
          // echo of our own write coming back through chrome.storage.onChanged.
          self._lastSavedBody = result.body;
          chars.textContent = getPlainText(editor).length + ' chars';
          saved.textContent = formatSaved(result.updatedAt);
        }
      };

      // Exposed so _popoutActiveNote() can flush in-flight edits before the
      // popout window reloads this note from storage.
      self._flushSave = doSave;

      var debouncedSave = function () {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(doSave, 500);
      };

      editor.addEventListener('input', debouncedSave);
      tagInput.addEventListener('input', debouncedSave);

      // ── Search & Replace ──────────────────────────────────
      var searchBar = document.createElement('div');
      searchBar.className = 'stickysites-search-bar';
      searchBar.style.display = 'none';

      var searchRow = document.createElement('div');
      searchRow.className = 'stickysites-search-row';
      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'stickysites-search-input';
      searchInput.placeholder = 'Find...';
      var prevMatchBtn = document.createElement('button');
      prevMatchBtn.className = 'stickysites-search-nav';
      prevMatchBtn.textContent = '↑';
      prevMatchBtn.title = 'Previous';
      var nextMatchBtn = document.createElement('button');
      nextMatchBtn.className = 'stickysites-search-nav';
      nextMatchBtn.textContent = '↓';
      nextMatchBtn.title = 'Next';
      var matchCount = document.createElement('span');
      matchCount.className = 'stickysites-search-count';
      matchCount.textContent = '0/0';
      var closeSearchBtn = document.createElement('button');
      closeSearchBtn.className = 'stickysites-search-close';
      closeSearchBtn.textContent = '✕';
      searchRow.append(searchInput, prevMatchBtn, nextMatchBtn, matchCount, closeSearchBtn);

      var replaceRow = document.createElement('div');
      replaceRow.className = 'stickysites-search-row';
      var replaceInput = document.createElement('input');
      replaceInput.type = 'text';
      replaceInput.className = 'stickysites-replace-input';
      replaceInput.placeholder = 'Replace...';
      var replaceBtn = document.createElement('button');
      replaceBtn.className = 'stickysites-replace-btn';
      replaceBtn.textContent = 'Replace';
      var replaceAllBtn = document.createElement('button');
      replaceAllBtn.className = 'stickysites-replace-all-btn';
      replaceAllBtn.textContent = 'All';
      replaceRow.append(replaceInput, replaceBtn, replaceAllBtn);
      searchBar.append(searchRow, replaceRow);

      var searchMatches = [];
      var currentMatchIdx = -1;

      function clearSearchHighlights() {
        editor.querySelectorAll('.stickysites-search-match').forEach(function (mark) {
          var parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        });
        editor.normalize();
        searchMatches = [];
        currentMatchIdx = -1;
        matchCount.textContent = '0/0';
      }

      function runSearch() {
        clearSearchHighlights();
        var query = searchInput.value;
        if (!query) return;
        var lowerQuery = query.toLowerCase();
        var textNodes = [];
        var walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
        var tn;
        while (tn = walker.nextNode()) textNodes.push(tn);

        var positions = [];
        for (var i = 0; i < textNodes.length; i++) {
          var text = textNodes[i].textContent;
          var lowerText = text.toLowerCase();
          var sIdx = 0;
          while ((sIdx = lowerText.indexOf(lowerQuery, sIdx)) !== -1) {
            positions.push({ node: textNodes[i], offset: sIdx, length: query.length });
            sIdx += lowerQuery.length;
          }
        }

        for (var j = positions.length - 1; j >= 0; j--) {
          var pos = positions[j];
          try {
            var range = document.createRange();
            range.setStart(pos.node, pos.offset);
            range.setEnd(pos.node, pos.offset + pos.length);
            var mark = document.createElement('mark');
            mark.className = 'stickysites-search-match';
            range.surroundContents(mark);
          } catch (e) { /* skip ranges that cross element boundaries */ }
        }

        searchMatches = Array.from(editor.querySelectorAll('.stickysites-search-match'));
        if (searchMatches.length > 0) {
          currentMatchIdx = 0;
          searchMatches[0].classList.add('is-current');
          searchMatches[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        matchCount.textContent = searchMatches.length > 0 ? '1/' + searchMatches.length : '0/0';
      }

      function navigateMatch(dir) {
        if (!searchMatches.length) return;
        searchMatches[currentMatchIdx].classList.remove('is-current');
        currentMatchIdx = (currentMatchIdx + dir + searchMatches.length) % searchMatches.length;
        searchMatches[currentMatchIdx].classList.add('is-current');
        searchMatches[currentMatchIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
        matchCount.textContent = (currentMatchIdx + 1) + '/' + searchMatches.length;
      }

      function doReplace() {
        if (!searchMatches.length || currentMatchIdx < 0) return;
        var mark = searchMatches[currentMatchIdx];
        mark.textContent = replaceInput.value;
        var parent = mark.parentNode;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
        searchMatches.splice(currentMatchIdx, 1);
        if (searchMatches.length === 0) {
          currentMatchIdx = -1;
          matchCount.textContent = '0/0';
        } else {
          if (currentMatchIdx >= searchMatches.length) currentMatchIdx = 0;
          searchMatches[currentMatchIdx].classList.add('is-current');
          searchMatches[currentMatchIdx].scrollIntoView({ block: 'center', behavior: 'smooth' });
          matchCount.textContent = (currentMatchIdx + 1) + '/' + searchMatches.length;
        }
        debouncedSave();
      }

      function doReplaceAll() {
        if (!searchMatches.length) return;
        var replacement = replaceInput.value;
        searchMatches.forEach(function (mark) {
          mark.textContent = replacement;
          var parent = mark.parentNode;
          while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
          parent.removeChild(mark);
        });
        editor.normalize();
        searchMatches = [];
        currentMatchIdx = -1;
        matchCount.textContent = '0/0';
        debouncedSave();
      }

      function toggleSearchBar() {
        if (searchBar.style.display === 'none') {
          searchBar.style.display = '';
          searchInput.focus();
          var sel = window.getSelection();
          if (sel && sel.toString().trim()) {
            searchInput.value = sel.toString().trim();
            runSearch();
          }
        } else {
          searchBar.style.display = 'none';
          clearSearchHighlights();
        }
      }

      searchToggleBtn.addEventListener('click', toggleSearchBar);
      searchInput.addEventListener('input', runSearch);
      prevMatchBtn.addEventListener('click', function () { navigateMatch(-1); });
      nextMatchBtn.addEventListener('click', function () { navigateMatch(1); });
      closeSearchBtn.addEventListener('click', function () {
        searchBar.style.display = 'none';
        clearSearchHighlights();
        editor.focus();
      });
      replaceBtn.addEventListener('click', doReplace);
      replaceAllBtn.addEventListener('click', doReplaceAll);

      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); navigateMatch(e.shiftKey ? -1 : 1); }
        if (e.key === 'Escape') { e.preventDefault(); searchBar.style.display = 'none'; clearSearchHighlights(); editor.focus(); }
      });
      replaceInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); doReplace(); }
        if (e.key === 'Escape') { e.preventDefault(); searchBar.style.display = 'none'; clearSearchHighlights(); editor.focus(); }
      });
      editor.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H' || e.key === 'f' || e.key === 'F')) {
          e.preventDefault();
          toggleSearchBar();
        }
      });
      editor.addEventListener('input', function () {
        if (searchMatches.length > 0) clearSearchHighlights();
      });

      if (!note && noteType.storagePattern === 'map') {
        this._writeNote(noteType, '', []);
      }

      this.el.append(header, actions, toolbar, searchBar, editor, footer);

      if (window.StickySites.Mentions) {
        window.StickySites.Mentions.attach(editor);
      }
    },

    _renderTodo: function (noteType, note) {
      while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
      var self = this;
      var Todo = window.StickySites.Todo;
      var data = Todo.normalizeData(note);
      var items = data.items;
      var sections = data.sections;
      var tagColors = data.tagColors;
      var updatedAt = (note && note.updatedAt) || '';

      // Local UI state (not persisted)
      var expandedNotes = {};
      var searchQuery = '';
      var sortMode = 'manual';
      var activeFilters = { priorities: [], tags: [], colors: [] };
      var completedCollapsed = true;

      // ── Header ──────────────────────────────────────────────
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
      popoutBtn.title = 'Open in own window';
      popoutBtn.addEventListener('click', function () {
        self._popoutActiveNote();
      });

      header.append(iconEl, title, popoutBtn, expandBtn, closeBtn);

      // ── Toolbar ─────────────────────────────────────────────
      var toolbar = document.createElement('div');
      toolbar.className = 'stickysites-todo-toolbar';

      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'stickysites-todo-search';
      searchInput.placeholder = 'Search tasks...';
      searchInput.addEventListener('input', function () {
        searchQuery = searchInput.value.toLowerCase();
        renderAll();
      });

      var sortSelect = document.createElement('select');
      sortSelect.className = 'stickysites-todo-sort';
      var sortOptions = [
        { label: 'Manual', value: 'manual' },
        { label: 'Priority', value: 'priority' },
        { label: 'A-Z', value: 'az' },
        { label: 'Date added', value: 'date' }
      ];
      sortOptions.forEach(function (opt) {
        var o = document.createElement('option');
        o.textContent = opt.label;
        o.value = opt.value;
        sortSelect.appendChild(o);
      });
      sortSelect.addEventListener('change', function () {
        sortMode = sortSelect.value;
        renderAll();
      });

      var filterBtn = document.createElement('button');
      filterBtn.className = 'stickysites-todo-filter-btn';
      filterBtn.textContent = '⚙ Filter';
      filterBtn.addEventListener('click', function () {
        showFilterPopup();
      });

      toolbar.append(searchInput, sortSelect, filterBtn);

      // ── List container ──────────────────────────────────────
      var listEl = document.createElement('div');
      listEl.className = 'stickysites-todo-list';

      // ── Actions row ─────────────────────────────────────────
      var actionsRow = document.createElement('div');
      actionsRow.className = 'stickysites-todo-actions';

      var addTaskBtn = document.createElement('button');
      addTaskBtn.className = 'stickysites-todo-add';
      addTaskBtn.textContent = '+ Add task';
      addTaskBtn.addEventListener('click', function () {
        var newItem = Todo.normalizeItem({ id: Todo.genId(), text: '' });
        items.push(newItem);
        renderAll();
        updateCount();
        save();
        var lastInput = listEl.querySelector('[data-item-id="' + newItem.id + '"] .stickysites-todo-text');
        if (lastInput) lastInput.focus();
      });

      var addSectionBtn = document.createElement('button');
      addSectionBtn.className = 'stickysites-todo-add';
      addSectionBtn.textContent = '+ Add section';
      addSectionBtn.addEventListener('click', function () {
        var name = prompt('Section name:');
        if (!name || !name.trim()) return;
        sections.push({ id: Todo.genId(), name: name.trim(), collapsed: false });
        renderAll();
        save();
      });

      actionsRow.append(addTaskBtn, addSectionBtn);

      // ── Footer ──────────────────────────────────────────────
      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';
      var countEl = document.createElement('span');
      countEl.className = 'stickysites-todo-count';
      var saved = document.createElement('span');
      saved.className = 'stickysites-panel-saved';
      saved.textContent = formatSaved(updatedAt);
      footer.append(countEl, saved);

      // ── Helper: updateCount ─────────────────────────────────
      function updateCount() {
        var done = items.filter(function (i) { return i.done; }).length;
        countEl.textContent = done + '/' + items.length + ' done';
      }

      // ── Helper: save (debounced 500ms) ──────────────────────
      function saveNow() {
        return self._writeStructured(noteType, {
          items: items,
          sections: sections,
          tagColors: tagColors
        }).then(function (result) {
          if (result) saved.textContent = formatSaved(result.updatedAt);
        });
      }
      function save() {
        if (self._saveTimer) clearTimeout(self._saveTimer);
        self._saveTimer = setTimeout(function () { self._saveTimer = null; saveNow(); }, 500);
      }
      self._flushSave = saveNow;

      // ── Helper: itemMatches ─────────────────────────────────
      function itemMatches(item) {
        // Search filter
        if (searchQuery) {
          var q = searchQuery;
          var textMatch = item.text.toLowerCase().indexOf(q) !== -1;
          var tagMatch = item.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
          var noteMatch = item.note.toLowerCase().indexOf(q) !== -1;
          if (!textMatch && !tagMatch && !noteMatch) return false;
        }
        // Priority filter
        if (activeFilters.priorities.length > 0) {
          if (activeFilters.priorities.indexOf(item.priority) === -1) return false;
        }
        // Tag filter
        if (activeFilters.tags.length > 0) {
          var hasTag = activeFilters.tags.some(function (ft) {
            return item.tags.indexOf(ft) !== -1;
          });
          if (!hasTag) return false;
        }
        // Color filter
        if (activeFilters.colors.length > 0) {
          if (activeFilters.colors.indexOf(item.color) === -1) return false;
        }
        return true;
      }

      // ── Helper: sortItems ───────────────────────────────────
      function sortItems(arr) {
        if (sortMode === 'manual') return arr;
        var sorted = arr.slice();
        if (sortMode === 'priority') {
          sorted.sort(function (a, b) {
            var ap = a.priority || 6;
            var bp = b.priority || 6;
            return ap - bp;
          });
        } else if (sortMode === 'az') {
          sorted.sort(function (a, b) {
            return a.text.toLowerCase().localeCompare(b.text.toLowerCase());
          });
        } else if (sortMode === 'date') {
          sorted.sort(function (a, b) {
            return a.id.localeCompare(b.id);
          });
        }
        return sorted;
      }

      // ── Helper: renderMarkdown ──────────────────────────────
      function renderMarkdown(text) {
        if (!text) return '';
        var lines = text.split('\n');
        var html = '';
        var inList = false;
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          // List items
          var listMatch = line.match(/^- (.*)$/);
          if (listMatch) {
            if (!inList) { html += '<ul>'; inList = true; }
            var content = listMatch[1];
            content = applyInlineMarkdown(content);
            html += '<li>' + content + '</li>';
            continue;
          }
          if (inList) { html += '</ul>'; inList = false; }
          // Regular line
          var processed = applyInlineMarkdown(line);
          html += (processed || '<br>');
          if (i < lines.length - 1) html += '<br>';
        }
        if (inList) html += '</ul>';
        return html;
      }

      function applyInlineMarkdown(text) {
        // Bold **text**
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic *text*
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Links [text](url) — only http/https
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        return text;
      }

      // ── Helper: showColorPalette ────────────────────────────
      function showColorPalette(anchorEl, item) {
        // Remove any existing palette
        var existing = self.el.querySelector('.stickysites-todo-palette');
        if (existing) existing.remove();

        var palette = document.createElement('div');
        palette.className = 'stickysites-todo-palette';

        Todo.COLORS.forEach(function (c) {
          var swatch = document.createElement('span');
          swatch.className = 'stickysites-todo-swatch';
          swatch.style.background = c;
          swatch.addEventListener('click', function (e) {
            e.stopPropagation();
            item.color = c;
            palette.remove();
            renderAll();
            save();
          });
          palette.appendChild(swatch);
        });

        // Clear option
        var clearSwatch = document.createElement('span');
        clearSwatch.className = 'stickysites-todo-swatch stickysites-todo-swatch-clear';
        clearSwatch.textContent = '✕';
        clearSwatch.addEventListener('click', function (e) {
          e.stopPropagation();
          item.color = '';
          palette.remove();
          renderAll();
          save();
        });
        palette.appendChild(clearSwatch);

        // Position relative to anchor
        anchorEl.style.position = 'relative';
        anchorEl.parentElement.style.position = 'relative';
        anchorEl.parentElement.appendChild(palette);

        // Dismiss on outside click
        setTimeout(function () {
          var dismiss = function (e) {
            if (!palette.contains(e.target)) {
              palette.remove();
              document.removeEventListener('click', dismiss, true);
            }
          };
          document.addEventListener('click', dismiss, true);
        }, 0);
      }

      // ── Helper: showFilterPopup ─────────────────────────────
      function showFilterPopup() {
        var existing = self.el.querySelector('.stickysites-todo-filter-popup');
        if (existing) { existing.remove(); return; }

        var popup = document.createElement('div');
        popup.className = 'stickysites-todo-filter-popup';

        // Priority group
        var priLabel = document.createElement('div');
        priLabel.className = 'stickysites-todo-filter-label';
        priLabel.textContent = 'Priority';
        popup.appendChild(priLabel);
        for (var p = 1; p <= 5; p++) {
          (function (pv) {
            var row = document.createElement('label');
            row.className = 'stickysites-todo-filter-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = activeFilters.priorities.indexOf(pv) !== -1;
            cb.addEventListener('change', function () {
              if (cb.checked) {
                activeFilters.priorities.push(pv);
              } else {
                activeFilters.priorities = activeFilters.priorities.filter(function (x) { return x !== pv; });
              }
              renderAll();
            });
            var span = document.createElement('span');
            span.textContent = 'P' + pv;
            span.style.color = Todo.PRIORITY_COLORS[pv] || '#94a3b8';
            row.append(cb, span);
            popup.appendChild(row);
          })(p);
        }

        // Tags group
        var allTags = [];
        items.forEach(function (item) {
          item.tags.forEach(function (t) {
            if (allTags.indexOf(t) === -1) allTags.push(t);
          });
        });
        if (allTags.length > 0) {
          var tagLabel = document.createElement('div');
          tagLabel.className = 'stickysites-todo-filter-label';
          tagLabel.textContent = 'Tags';
          popup.appendChild(tagLabel);
          allTags.forEach(function (tag) {
            var row = document.createElement('label');
            row.className = 'stickysites-todo-filter-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = activeFilters.tags.indexOf(tag) !== -1;
            cb.addEventListener('change', function () {
              if (cb.checked) {
                activeFilters.tags.push(tag);
              } else {
                activeFilters.tags = activeFilters.tags.filter(function (x) { return x !== tag; });
              }
              renderAll();
            });
            var span = document.createElement('span');
            span.textContent = tag;
            if (tagColors[tag]) span.style.color = tagColors[tag];
            row.append(cb, span);
            popup.appendChild(row);
          });
        }

        // Colors group
        var usedColors = [];
        items.forEach(function (item) {
          if (item.color && usedColors.indexOf(item.color) === -1) usedColors.push(item.color);
        });
        if (usedColors.length > 0) {
          var colorLabel = document.createElement('div');
          colorLabel.className = 'stickysites-todo-filter-label';
          colorLabel.textContent = 'Colors';
          popup.appendChild(colorLabel);
          usedColors.forEach(function (col) {
            var row = document.createElement('label');
            row.className = 'stickysites-todo-filter-row';
            var cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = activeFilters.colors.indexOf(col) !== -1;
            cb.addEventListener('change', function () {
              if (cb.checked) {
                activeFilters.colors.push(col);
              } else {
                activeFilters.colors = activeFilters.colors.filter(function (x) { return x !== col; });
              }
              renderAll();
            });
            var dot = document.createElement('span');
            dot.className = 'stickysites-todo-filter-color-dot';
            dot.style.background = col;
            row.append(cb, dot);
            popup.appendChild(row);
          });
        }

        // Clear filters button
        var clearBtn = document.createElement('button');
        clearBtn.className = 'stickysites-todo-filter-clear';
        clearBtn.textContent = 'Clear filters';
        clearBtn.addEventListener('click', function () {
          activeFilters = { priorities: [], tags: [], colors: [] };
          popup.remove();
          renderAll();
        });
        popup.appendChild(clearBtn);

        toolbar.style.position = 'relative';
        toolbar.appendChild(popup);

        // Dismiss on outside click
        setTimeout(function () {
          var dismiss = function (e) {
            if (!popup.contains(e.target) && e.target !== filterBtn) {
              popup.remove();
              document.removeEventListener('click', dismiss, true);
            }
          };
          document.addEventListener('click', dismiss, true);
        }, 0);
      }

      // ── Helper: renderItem ──────────────────────────────────
      function renderItem(item) {
        var container = document.createElement('div');
        container.className = 'stickysites-todo-item-container';
        container.setAttribute('data-item-id', item.id);

        var row = document.createElement('div');
        row.className = 'stickysites-todo-item' + (item.done ? ' is-done' : '');
        row.style.paddingLeft = (item.indent * 20 + 4) + 'px';

        // Drag grip
        var grip = document.createElement('span');
        grip.className = 'stickysites-todo-grip';
        grip.textContent = '⠇';

        // Checkbox
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = item.done;
        cb.className = 'stickysites-todo-checkbox';
        cb.addEventListener('change', function () {
          item.done = cb.checked;
          if (item.done) {
            item.completedAt = new Date().toISOString();
          } else {
            item.completedAt = '';
          }
          renderAll();
          updateCount();
          save();
        });

        // Color dot
        var colorDot = document.createElement('span');
        colorDot.className = 'stickysites-todo-color-dot' + (item.color ? '' : ' is-empty');
        if (item.color) {
          colorDot.style.background = item.color;
        }
        colorDot.addEventListener('click', function (e) {
          e.stopPropagation();
          showColorPalette(colorDot, item);
        });

        // Text input
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
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            if (item.indent < 3) {
              item.indent = item.indent + 1;
              row.style.paddingLeft = (item.indent * 20 + 4) + 'px';
              save();
            }
          }
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            if (item.indent > 0) {
              item.indent = item.indent - 1;
              row.style.paddingLeft = (item.indent * 20 + 4) + 'px';
              save();
            }
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            var newItem = Todo.normalizeItem({ id: Todo.genId(), text: '', section: item.section, indent: item.indent });
            var idx = items.indexOf(item);
            if (idx !== -1) {
              items.splice(idx + 1, 0, newItem);
            } else {
              items.push(newItem);
            }
            renderAll();
            updateCount();
            save();
            var newInput = listEl.querySelector('[data-item-id="' + newItem.id + '"] .stickysites-todo-text');
            if (newInput) newInput.focus();
          }
          if (e.key === 'Backspace' && input.value === '' && items.length > 1) {
            e.preventDefault();
            var idx = items.indexOf(item);
            if (idx !== -1) {
              items.splice(idx, 1);
              renderAll();
              updateCount();
              save();
              // Focus previous item
              var allInputs = listEl.querySelectorAll('.stickysites-todo-text');
              var prevIdx = Math.max(0, idx - 1);
              if (allInputs[prevIdx]) allInputs[prevIdx].focus();
            }
          }
          if (e.key === 'Escape') {
            input.blur();
          }
        });
        input.addEventListener('dblclick', function () {
          if (expandedNotes[item.id]) {
            delete expandedNotes[item.id];
          } else {
            expandedNotes[item.id] = true;
          }
          renderAll();
          // Re-focus the text input after re-render
          var refocused = listEl.querySelector('[data-item-id="' + item.id + '"] .stickysites-todo-text');
          if (refocused) refocused.focus();
        });

        // Note indicator
        var noteIndicator = document.createElement('span');
        noteIndicator.className = 'stickysites-todo-note-indicator';
        if (item.note) {
          noteIndicator.textContent = '📝';
          noteIndicator.title = 'Has notes';
        }

        // Priority badge
        var priBadge = document.createElement('span');
        priBadge.className = 'stickysites-todo-priority';
        if (item.priority > 0) {
          priBadge.textContent = 'P' + item.priority;
          priBadge.style.color = Todo.PRIORITY_COLORS[item.priority] || '#94a3b8';
        }
        priBadge.addEventListener('click', function (e) {
          e.stopPropagation();
          item.priority = (item.priority + 1) % 6;
          if (item.priority > 0) {
            priBadge.textContent = 'P' + item.priority;
            priBadge.style.color = Todo.PRIORITY_COLORS[item.priority] || '#94a3b8';
          } else {
            priBadge.textContent = '';
            priBadge.style.color = '';
          }
          save();
        });

        // Tag chips
        var tagsContainer = document.createElement('span');
        tagsContainer.className = 'stickysites-todo-tags';
        item.tags.forEach(function (tag) {
          var chip = document.createElement('span');
          chip.className = 'stickysites-todo-tag';
          chip.textContent = tag;
          if (tagColors[tag]) chip.style.background = tagColors[tag];
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            item.tags = item.tags.filter(function (t) { return t !== tag; });
            renderAll();
            save();
          });
          tagsContainer.appendChild(chip);
        });

        // Add tag "+" chip
        var addTagChip = document.createElement('span');
        addTagChip.className = 'stickysites-todo-tag stickysites-todo-tag-add';
        addTagChip.textContent = '+';
        addTagChip.addEventListener('click', function (e) {
          e.stopPropagation();
          // Replace the "+" chip with an inline input
          var tagInput = document.createElement('input');
          tagInput.type = 'text';
          tagInput.className = 'stickysites-todo-tag-input';
          tagInput.placeholder = '#tag';
          addTagChip.style.display = 'none';
          tagsContainer.appendChild(tagInput);
          tagInput.focus();
          tagInput.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              var val = tagInput.value.trim().toLowerCase();
              if (val) {
                if (!val.startsWith('#')) val = '#' + val;
                if (item.tags.indexOf(val) === -1) {
                  item.tags.push(val);
                  // If item has a color, save it to tagColors for this tag
                  if (item.color && !tagColors[val]) {
                    tagColors[val] = item.color;
                  }
                }
              }
              renderAll();
              save();
            }
            if (ev.key === 'Escape') {
              tagInput.remove();
              addTagChip.style.display = '';
            }
          });
          tagInput.addEventListener('blur', function () {
            tagInput.remove();
            addTagChip.style.display = '';
          });
        });
        tagsContainer.appendChild(addTagChip);

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'stickysites-todo-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function () {
          var idx = items.indexOf(item);
          if (idx !== -1) {
            items.splice(idx, 1);
            renderAll();
            updateCount();
            save();
          }
        });

        row.append(grip, cb, colorDot, input, noteIndicator, priBadge, tagsContainer, delBtn);
        container.appendChild(row);

        // Expanded note area
        if (expandedNotes[item.id]) {
          var noteArea = document.createElement('div');
          noteArea.className = 'stickysites-todo-note-area';
          noteArea.style.paddingLeft = (item.indent * 20 + 28) + 'px';

          if (!item.note || expandedNotes[item.id] === 'editing') {
            // Show textarea for editing
            var textarea = document.createElement('textarea');
            textarea.className = 'stickysites-todo-note-edit';
            textarea.placeholder = 'Add notes...';
            textarea.value = item.note || '';
            textarea.addEventListener('input', function () {
              item.note = textarea.value;
              // Update note indicator
              noteIndicator.textContent = item.note ? '📝' : '';
              noteIndicator.title = item.note ? 'Has notes' : '';
              save();
            });
            textarea.addEventListener('blur', function () {
              if (item.note) {
                expandedNotes[item.id] = true; // Switch to rendered view
                renderAll();
              }
            });
            noteArea.appendChild(textarea);
            // If we just opened it for editing, focus the textarea
            if (expandedNotes[item.id] === 'editing') {
              setTimeout(function () { textarea.focus(); }, 0);
            }
          } else {
            // Show rendered markdown
            // Safe: item.note is user-authored content from extension-isolated chrome.storage.local
            var rendered = document.createElement('div');
            rendered.className = 'stickysites-todo-note-rendered';
            rendered.textContent = ''; // clear first
            var mdHtml = renderMarkdown(item.note);
            // nosec — user-authored content from isolated extension storage (same pattern as editor.innerHTML on line 479)
            var mdTemp = document.createElement('div');
            mdTemp.textContent = '';
            rendered.appendChild(mdTemp);
            mdTemp.outerHTML = mdHtml;
            rendered.addEventListener('click', function () {
              expandedNotes[item.id] = 'editing';
              renderAll();
            });
            noteArea.appendChild(rendered);
          }

          container.appendChild(noteArea);
        }

        return container;
      }

      // ── Helper: renderSectionHeader ─────────────────────────
      function renderSectionHeader(sec) {
        var secHeader = document.createElement('div');
        secHeader.className = 'stickysites-todo-section-header';

        var chevron = document.createElement('span');
        chevron.className = 'stickysites-todo-section-chevron';
        chevron.textContent = sec.collapsed ? '▸' : '▾';
        chevron.addEventListener('click', function () {
          sec.collapsed = !sec.collapsed;
          renderAll();
          save();
        });

        var nameEl = document.createElement('span');
        nameEl.className = 'stickysites-todo-section-name';
        nameEl.textContent = sec.name;

        var secAddBtn = document.createElement('button');
        secAddBtn.className = 'stickysites-todo-section-add';
        secAddBtn.textContent = '+ Add';
        secAddBtn.addEventListener('click', function () {
          var newItem = Todo.normalizeItem({ id: Todo.genId(), text: '', section: sec.id });
          items.push(newItem);
          renderAll();
          updateCount();
          save();
          var newInput = listEl.querySelector('[data-item-id="' + newItem.id + '"] .stickysites-todo-text');
          if (newInput) newInput.focus();
        });

        var menuBtn = document.createElement('button');
        menuBtn.className = 'stickysites-todo-section-menu';
        menuBtn.textContent = '⋯';
        menuBtn.addEventListener('click', function () {
          var existingMenu = self.el.querySelector('.stickysites-todo-section-menu-popup');
          if (existingMenu) existingMenu.remove();

          var menu = document.createElement('div');
          menu.className = 'stickysites-todo-section-menu-popup';

          var renameOpt = document.createElement('button');
          renameOpt.className = 'stickysites-todo-section-menu-item';
          renameOpt.textContent = 'Rename';
          renameOpt.addEventListener('click', function () {
            var newName = prompt('Rename section:', sec.name);
            if (newName && newName.trim()) {
              sec.name = newName.trim();
              renderAll();
              save();
            }
            menu.remove();
          });

          var deleteOpt = document.createElement('button');
          deleteOpt.className = 'stickysites-todo-section-menu-item';
          deleteOpt.textContent = 'Delete';
          deleteOpt.addEventListener('click', function () {
            // Move section items to unsectioned
            items.forEach(function (item) {
              if (item.section === sec.id) item.section = '';
            });
            var secIdx = sections.indexOf(sec);
            if (secIdx !== -1) sections.splice(secIdx, 1);
            renderAll();
            save();
            menu.remove();
          });

          menu.append(renameOpt, deleteOpt);
          secHeader.style.position = 'relative';
          secHeader.appendChild(menu);

          setTimeout(function () {
            var dismiss = function (e) {
              if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', dismiss, true);
              }
            };
            document.addEventListener('click', dismiss, true);
          }, 0);
        });

        secHeader.append(chevron, nameEl, secAddBtn, menuBtn);
        return secHeader;
      }

      // ── Helper: renderCompletedSection ──────────────────────
      function renderCompletedSection(completedItems) {
        var section = document.createElement('div');
        section.className = 'stickysites-todo-completed-section';

        var compHeader = document.createElement('div');
        compHeader.className = 'stickysites-todo-completed-header';
        compHeader.textContent = (completedCollapsed ? '▸' : '▾') + ' Completed (' + completedItems.length + ')';
        compHeader.addEventListener('click', function () {
          completedCollapsed = !completedCollapsed;
          renderAll();
        });
        section.appendChild(compHeader);

        if (!completedCollapsed) {
          // Sort by completedAt descending
          var sorted = completedItems.slice().sort(function (a, b) {
            return (b.completedAt || '').localeCompare(a.completedAt || '');
          });
          sorted.forEach(function (item) {
            section.appendChild(renderItem(item));
          });
        }

        return section;
      }

      // ── Helper: renderAll ───────────────────────────────────
      function renderAll() {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

        // Separate active vs completed items
        var activeItems = items.filter(function (i) { return !i.done && itemMatches(i); });
        var completedItems = items.filter(function (i) { return i.done && itemMatches(i); });

        // Unsectioned active items (section is '' or undefined)
        var unsectioned = activeItems.filter(function (i) { return !i.section; });
        var sortedUnsectioned = sortItems(unsectioned);
        sortedUnsectioned.forEach(function (item) {
          listEl.appendChild(renderItem(item));
        });

        // Named sections
        sections.forEach(function (sec) {
          listEl.appendChild(renderSectionHeader(sec));
          if (!sec.collapsed) {
            var secItems = activeItems.filter(function (i) { return i.section === sec.id; });
            var sortedSecItems = sortItems(secItems);
            sortedSecItems.forEach(function (item) {
              listEl.appendChild(renderItem(item));
            });
          }
        });

        // Completed section (always at bottom)
        if (completedItems.length > 0) {
          listEl.appendChild(renderCompletedSection(completedItems));
        }
      }

      // ── Initialize ──────────────────────────────────────────
      if (items.length === 0) {
        items.push(Todo.normalizeItem({ id: Todo.genId(), text: '' }));
      }

      renderAll();
      updateCount();

      // If no existing note, create initial record
      if (!note) {
        self._writeStructured(noteType, { items: items, sections: sections, tagColors: tagColors });
      }

      this.el.append(header, toolbar, listEl, actionsRow, footer);

      Todo.DragController.init(listEl, function () { return items; }, function () { return sections; }, function () {
        renderAll();
        save();
      });

      // Auto-focus an empty task input so the user can start typing immediately.
      setTimeout(function () {
        var inputs = listEl.querySelectorAll('.stickysites-todo-text');
        for (var fi = 0; fi < inputs.length; fi++) {
          if (!inputs[fi].value) { inputs[fi].focus(); return; }
        }
        addTaskBtn.click();
      }, 0);
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
      popoutBtn.title = 'Open in own window';
      popoutBtn.addEventListener('click', function () {
        self._popoutActiveNote();
      });

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
          var result = await self._writeStructured(noteType, { items: items });
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
        self._writeStructured(noteType, { items: items });
      }

      this.el.append(header, listEl, addBtn, footer);
    },

    syncFromStorage: async function (changes) {
      if (!this.activeNoteType) return;
      var nt = this.activeNoteType;
      if (nt.storagePattern === 'structured') return;
      if (!changes[nt.storageKey]) return;

      var ed = this.el.querySelector('.stickysites-panel-editor');
      if (!ed) return;

      // Focus guard — never rewrite the DOM under the user's caret. Remote
      // changes are picked up the next time the note is opened.
      var active = document.activeElement;
      if (active && this.el.contains(active)) return;

      var newValue = changes[nt.storageKey].newValue;
      // Encrypted guard — the change event carries the stored envelope, not the
      // plaintext. Decrypt before comparing; skip entirely while locked.
      if (newValue && window.StickySites.Crypto && window.StickySites.Crypto.isEncrypted(newValue)) {
        try {
          var cachedKey = await window.StickySites.Crypto.getCachedKey();
          if (!cachedKey) return;
          newValue = await window.StickySites.Crypto.decryptValue(newValue);
        } catch { return; }
      }

      var body;
      if (nt.storagePattern === 'single') {
        body = newValue ? String(newValue.body ?? '') : '';
      } else {
        var record = (newValue || {})[this._activeKey];
        if (!record) return;
        body = String(record.body ?? '');
      }

      // Self-echo guard — our own debounced save round-tripping through onChanged.
      if (body === this._lastSavedBody) return;

      // Safe: body is user-authored content from chrome.storage.local (extension-isolated storage)
      if (ed.innerHTML !== body) ed.innerHTML = bodyToHtml(body); // nosec
    }
  };
})();
