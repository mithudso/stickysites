window.StickySites = window.StickySites || {};

// Outliner UI — a global library of named outline documents stored as a flat
// map in stickysites_outlines_v1. Legacy hostname-keyed records are adapted at
// read time (their map key doubles as the document name) and keep their key
// forever; new documents get ol_-prefixed keys.
(function () {
  var STORAGE_KEY = 'stickysites_outlines_v1';

  function formatSaved(iso) {
    if (!iso) return '';
    try { return 'Saved ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function newDocKey() {
    return 'ol_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  async function isLocked() {
    var C = window.StickySites.Crypto;
    if (!C) return false;
    if (!await C.isEnabled()) return false;
    return !(await C.getCachedKey());
  }

  async function readRawMap() {
    var C = window.StickySites.Crypto;
    var stored = await chrome.storage.local.get(STORAGE_KEY);
    var raw = stored?.[STORAGE_KEY] || {};
    if (raw && C && C.isEncrypted(raw)) {
      try { raw = await C.decryptValue(raw); } catch { raw = {}; }
      if (C.isEncrypted(raw)) raw = {}; // still locked / wrong key — treat as empty, never write back
    }
    return raw;
  }

  async function writeRawMap(map) {
    var C = window.StickySites.Crypto;
    var toStore = map;
    if (C && await C.isEnabled()) {
      var cachedKey = await C.getCachedKey();
      // Locked: writing now would replace the encrypted envelope with
      // plaintext and permanently destroy every doc inside it. Refuse.
      if (!cachedKey) return false;
      toStore = await C.encryptValue(map);
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: toStore });
    return true;
  }

  async function readLibrary() {
    var map = await readRawMap();
    var docs = Object.keys(map).map(function (k) {
      var r = map[k] || {};
      return {
        key: k,
        name: String(r.name || k),
        items: Array.isArray(r.items) ? r.items : [],
        createdAt: String(r.createdAt || ''),
        updatedAt: String(r.updatedAt || '')
      };
    });
    docs.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
    return { map: map, docs: docs };
  }

  async function writeDoc(docKey, name, items) {
    var map = await readRawMap();
    var existing = map[docKey];
    map[docKey] = {
      key: docKey,
      name: String(name),
      items: items,
      createdAt: (existing && existing.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    var ok = await writeRawMap(map);
    return ok ? map[docKey] : null;
  }

  async function deleteDoc(docKey) {
    var map = await readRawMap();
    delete map[docKey];
    await writeRawMap(map);
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  window.StickySites.Outline = {
    readLibrary: readLibrary,
    writeDoc: writeDoc,
    newDocKey: newDocKey,

    // explicitKey: chosen by the in-panel switcher; otherwise the noteType's
    // getKey (popout URL param) or the activeOutlineId pref wins.
    render: async function (panel, noteType, explicitKey) {
      var self = this;
      var Ops = window.StickySites.OutlineOps;
      var el = panel.el;
      while (el.firstChild) el.removeChild(el.firstChild);

      // Locked vault: an empty read here is indistinguishable from "no
      // outlines yet" — bail instead of auto-creating (and thereby clobbering).
      if (await isLocked()) {
        var lockMsg = document.createElement('div');
        lockMsg.className = 'stickysites-outline-locked';
        lockMsg.textContent = 'StickySites is locked. Unlock it to use the outliner.';
        el.appendChild(lockMsg);
        return;
      }

      // ── Resolve the document ────────────────────────────────
      var requested = explicitKey || '';
      if (!requested) {
        try { requested = noteType.getKey(location) || ''; } catch { requested = ''; }
      }
      var lib = await readLibrary();
      var prefs = await window.StickySites.Prefs.read();
      var docKey = null;
      if (requested && lib.map[requested]) docKey = requested;
      else if (prefs.activeOutlineId && lib.map[prefs.activeOutlineId]) docKey = prefs.activeOutlineId;
      else if (lib.docs.length) docKey = lib.docs[0].key;
      if (!docKey) {
        docKey = newDocKey();
        await writeDoc(docKey, 'My outline', []);
        lib = await readLibrary();
      }
      await window.StickySites.Prefs.write({ activeOutlineId: docKey });

      var doc = null;
      for (var di = 0; di < lib.docs.length; di++) {
        if (lib.docs[di].key === docKey) { doc = lib.docs[di]; break; }
      }
      var docName = doc ? doc.name : 'My outline';
      var items = Ops.normalizeItems(doc ? doc.items : []);
      if (items.length === 0) items.push(Ops.normalizeNode({ text: '' }));
      var updatedAt = doc ? doc.updatedAt : '';

      // The popout and drag-out read these instead of recomputing from location.
      panel._activeKey = docKey;
      panel._activeLabel = 'Outline — ' + docName;
      if (location.protocol === 'chrome-extension:') {
        document.title = panel._activeLabel + ' — StickySites';
      }

      // ── UI state (not persisted) ────────────────────────────
      var zoomId = null;
      var filterQuery = '';
      var openNotes = {};
      var undoSnapshot = null;

      function rerenderDoc(key) {
        // Full re-entry: flush pending writes, then re-render with the new doc.
        panel.flushPendingSave().then(function () {
          self.render(panel, noteType, key);
        });
      }

      // ── Header ──────────────────────────────────────────────
      var header = document.createElement('div');
      header.className = 'stickysites-panel-header';
      header.style.background = noteType.tint;
      header.style.color = noteType.tintText;
      var iconEl = document.createElement('span');
      iconEl.className = 'stickysites-panel-icon';
      iconEl.style.background = noteType.color;
      iconEl.textContent = noteType.emoji;

      var switcher = document.createElement('select');
      switcher.className = 'stickysites-outline-switcher';
      lib.docs.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d.key;
        opt.textContent = d.name;
        if (d.key === docKey) opt.selected = true;
        switcher.appendChild(opt);
      });
      switcher.addEventListener('change', function () {
        rerenderDoc(switcher.value);
      });

      var closeBtn = document.createElement('button');
      closeBtn.className = 'stickysites-panel-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', function () { if (panel.onClose) panel.onClose(); });

      var expandBtn = document.createElement('button');
      expandBtn.className = 'stickysites-panel-headerbtn';
      expandBtn.textContent = '⤢';
      expandBtn.title = 'Expand';
      expandBtn.addEventListener('click', function () {
        panel._toggleExpand();
        expandBtn.textContent = panel._isExpanded ? '⤡' : '⤢';
        expandBtn.title = panel._isExpanded ? 'Shrink' : 'Expand';
      });

      var popoutBtn = document.createElement('button');
      popoutBtn.className = 'stickysites-panel-headerbtn';
      popoutBtn.textContent = '⧉';
      popoutBtn.title = 'Open in own window';
      popoutBtn.addEventListener('click', function () { panel._popoutActiveNote(); });

      header.append(iconEl, switcher, popoutBtn, expandBtn, closeBtn);

      // ── Toolbar ─────────────────────────────────────────────
      var toolbar = document.createElement('div');
      toolbar.className = 'stickysites-outline-toolbar';

      var searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'stickysites-outline-search';
      searchInput.placeholder = 'Filter...';
      searchInput.addEventListener('input', function () {
        filterQuery = searchInput.value;
        renderAll();
      });

      var collapseAllBtn = document.createElement('button');
      collapseAllBtn.className = 'stickysites-outline-toolbtn';
      collapseAllBtn.textContent = '⊟';
      collapseAllBtn.title = 'Collapse all';
      collapseAllBtn.addEventListener('click', function () {
        setAllCollapsed(items, true);
        renderAll();
        save();
      });

      var expandAllBtn = document.createElement('button');
      expandAllBtn.className = 'stickysites-outline-toolbtn';
      expandAllBtn.textContent = '⊞';
      expandAllBtn.title = 'Expand all';
      expandAllBtn.addEventListener('click', function () {
        setAllCollapsed(items, false);
        renderAll();
        save();
      });

      var menuBtn = document.createElement('button');
      menuBtn.className = 'stickysites-outline-toolbtn';
      menuBtn.textContent = '⋯';
      menuBtn.title = 'More actions';
      menuBtn.addEventListener('click', showMenu);

      toolbar.append(searchInput, collapseAllBtn, expandAllBtn, menuBtn);

      function setAllCollapsed(arr, value) {
        arr.forEach(function (n) {
          if (n.children && n.children.length) {
            n.collapsed = value;
            setAllCollapsed(n.children, value);
          }
        });
      }

      function showMenu() {
        var existing = el.querySelector('.stickysites-outline-menu');
        if (existing) { existing.remove(); return; }
        var menu = document.createElement('div');
        menu.className = 'stickysites-outline-menu';

        function item(label, fn) {
          var b = document.createElement('button');
          b.className = 'stickysites-outline-menu-item';
          b.textContent = label;
          b.addEventListener('click', function () { menu.remove(); fn(); });
          return b;
        }

        menu.append(
          item('New outline…', async function () {
            var name = prompt('Outline name:');
            if (!name || !name.trim()) return;
            var key = newDocKey();
            await writeDoc(key, name.trim(), []);
            rerenderDoc(key);
          }),
          item('Rename…', async function () {
            var name = prompt('Rename outline:', docName);
            if (!name || !name.trim()) return;
            docName = name.trim();
            panel._activeLabel = 'Outline — ' + docName;
            await saveNow();
            rerenderDoc(docKey);
          }),
          item('Duplicate', async function () {
            var key = newDocKey();
            await writeDoc(key, docName + ' copy', JSON.parse(JSON.stringify(items)));
            rerenderDoc(key);
          }),
          item('Delete…', async function () {
            if (!confirm('Delete outline "' + docName + '"? This cannot be undone.')) return;
            await deleteDoc(docKey);
            await window.StickySites.Prefs.write({ activeOutlineId: null });
            rerenderDoc('');
          }),
          item('Auto-group into hierarchy', function () {
            doAutoGroup();
          }),
          item('Export Markdown', function () {
            var base = docName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'outline';
            downloadText(base + '.md', Ops.toMarkdown(items), 'text/markdown');
          }),
          item('Export OPML', function () {
            var base = docName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'outline';
            downloadText(base + '.opml', Ops.toOPML(items, docName), 'text/xml');
          })
        );

        toolbar.style.position = 'relative';
        toolbar.appendChild(menu);
        setTimeout(function () {
          var dismiss = function (e) {
            if (!menu.contains(e.target) && e.target !== menuBtn) {
              menu.remove();
              document.removeEventListener('click', dismiss, true);
            }
          };
          document.addEventListener('click', dismiss, true);
        }, 0);
      }

      // ── Breadcrumb (zoom) ───────────────────────────────────
      var breadcrumb = document.createElement('div');
      breadcrumb.className = 'stickysites-outline-breadcrumb';

      function renderBreadcrumb() {
        while (breadcrumb.firstChild) breadcrumb.removeChild(breadcrumb.firstChild);
        if (!zoomId) { breadcrumb.style.display = 'none'; return; }
        breadcrumb.style.display = '';
        var path = Ops.getPathTo(items, zoomId) || [];
        var crumbs = [{ id: null, label: docName }];
        path.slice(0, -1).forEach(function (n) {
          crumbs.push({ id: n.id, label: n.text || '(untitled)' });
        });
        crumbs.forEach(function (c, i) {
          var b = document.createElement('button');
          b.className = 'stickysites-outline-crumb';
          b.textContent = c.label;
          b.addEventListener('click', function () {
            zoomId = c.id;
            renderBreadcrumb();
            renderAll();
          });
          breadcrumb.appendChild(b);
          if (i < crumbs.length - 1) {
            var sep = document.createElement('span');
            sep.className = 'stickysites-outline-crumb-sep';
            sep.textContent = '›';
            breadcrumb.appendChild(sep);
          }
        });
        var zoomed = path[path.length - 1];
        if (zoomed) {
          var title = document.createElement('input');
          title.type = 'text';
          title.className = 'stickysites-outline-zoom-title';
          title.value = zoomed.text;
          title.addEventListener('input', function () {
            zoomed.text = title.value;
            zoomed.tags = Ops.extractTags(title.value);
            save();
          });
          breadcrumb.appendChild(title);
        }
      }

      // ── List ────────────────────────────────────────────────
      var listEl = document.createElement('div');
      listEl.className = 'stickysites-outline-list';

      // ── Undo bar (auto-group) ───────────────────────────────
      var undoBar = document.createElement('div');
      undoBar.className = 'stickysites-outline-undobar';
      undoBar.style.display = 'none';
      var undoMsg = document.createElement('span');
      undoMsg.textContent = 'Outline regrouped.';
      var undoBtn = document.createElement('button');
      undoBtn.className = 'stickysites-outline-toolbtn';
      undoBtn.textContent = 'Undo';
      undoBtn.addEventListener('click', function () {
        if (!undoSnapshot) return;
        items.length = 0;
        Array.prototype.push.apply(items, Ops.normalizeItems(undoSnapshot));
        undoSnapshot = null;
        undoBar.style.display = 'none';
        zoomId = null;
        renderBreadcrumb();
        renderAll();
        updateCount();
        save();
      });
      undoBar.append(undoMsg, undoBtn);

      var undoTimer = null;
      function doAutoGroup() {
        undoSnapshot = JSON.parse(JSON.stringify(items));
        var grouped = Ops.autoGroup(items);
        items.length = 0;
        Array.prototype.push.apply(items, grouped);
        zoomId = null;
        renderBreadcrumb();
        renderAll();
        updateCount();
        save();
        undoBar.style.display = '';
        if (undoTimer) clearTimeout(undoTimer);
        undoTimer = setTimeout(function () { undoBar.style.display = 'none'; }, 10000);
      }

      // ── Footer ──────────────────────────────────────────────
      var footer = document.createElement('div');
      footer.className = 'stickysites-panel-footer';
      var nodeCount = document.createElement('span');
      var savedEl = document.createElement('span');
      savedEl.className = 'stickysites-panel-saved';
      savedEl.textContent = formatSaved(updatedAt);
      footer.append(nodeCount, savedEl);

      function countNodes(arr) {
        var c = 0;
        arr.forEach(function (n) {
          c += 1;
          if (n.children && n.children.length) c += countNodes(n.children);
        });
        return c;
      }

      function updateCount() {
        nodeCount.textContent = countNodes(items) + ' nodes';
      }

      // ── Saving ──────────────────────────────────────────────
      function saveNow() {
        return writeDoc(docKey, docName, items).then(function (rec) {
          if (rec) savedEl.textContent = formatSaved(rec.updatedAt);
        });
      }
      function save() {
        if (panel._saveTimer) clearTimeout(panel._saveTimer);
        panel._saveTimer = setTimeout(function () { panel._saveTimer = null; saveNow(); }, 500);
      }
      panel._flushSave = saveNow;

      // ── Rendering ───────────────────────────────────────────
      function getRenderRoots() {
        if (!zoomId) return items;
        var z = Ops.findNode(zoomId, items);
        return z ? z.children : items;
      }

      function focusNode(id, caretStart) {
        var inp = listEl.querySelector('input[data-node-id="' + id + '"]');
        if (inp) {
          inp.focus();
          var p = caretStart ? 0 : inp.value.length;
          inp.setSelectionRange(p, p);
        }
      }

      function visibleInputs() {
        return Array.from(listEl.querySelectorAll('.stickysites-outline-text'));
      }

      function renderChips(chipsEl, node, input) {
        while (chipsEl.firstChild) chipsEl.removeChild(chipsEl.firstChild);
        (node.tags || []).forEach(function (tag) {
          var chip = document.createElement('span');
          chip.className = 'stickysites-outline-tag';
          chip.textContent = tag;
          chip.title = 'Remove tag';
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            // Auto-tags derive from the text; removing the chip removes the token.
            node.text = node.text.replace(new RegExp('\\s*' + escapeRegExp(tag) + '\\b', 'gi'), '').trim();
            node.tags = Ops.extractTags(node.text);
            if (input) input.value = node.text;
            renderChips(chipsEl, node, input);
            save();
          });
          chipsEl.appendChild(chip);
        });
      }

      function renderNode(node, depth, visibleSet) {
        if (visibleSet && !visibleSet.has(node.id)) return null;

        var container = document.createElement('div');

        var row = document.createElement('div');
        row.className = 'stickysites-outline-node' + (node.done ? ' is-done' : '');
        row.dataset.nodeId = node.id;
        row.style.paddingLeft = (depth * 20 + 8) + 'px';

        var grip = document.createElement('span');
        grip.className = 'stickysites-outline-grip';
        grip.textContent = '⠇';

        var hasChildren = node.children && node.children.length;
        var chevron = document.createElement('span');
        chevron.className = 'stickysites-outline-chevron';
        chevron.textContent = hasChildren ? (node.collapsed ? '▸' : '▾') : '';
        chevron.addEventListener('click', function () {
          if (!hasChildren) return;
          node.collapsed = !node.collapsed;
          renderAll();
          save();
        });

        var bullet = document.createElement('span');
        bullet.className = 'stickysites-outline-bullet';
        bullet.textContent = '•';
        bullet.title = 'Zoom in';
        bullet.addEventListener('click', function () {
          zoomId = node.id;
          renderBreadcrumb();
          renderAll();
        });

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'stickysites-outline-check';
        cb.checked = node.done;
        cb.addEventListener('change', function () {
          node.done = cb.checked;
          renderAll();
          save();
        });

        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'stickysites-outline-text';
        input.value = node.text;
        input.placeholder = 'New item...';
        input.dataset.nodeId = node.id;

        var chipsEl = document.createElement('span');
        chipsEl.className = 'stickysites-outline-tags';
        renderChips(chipsEl, node, input);

        input.addEventListener('input', function () {
          node.text = input.value;
          node.tags = Ops.extractTags(input.value);
          renderChips(chipsEl, node, input); // in-place — keeps focus in the input
          save();
        });

        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            node.done = !node.done;
            renderAll();
            focusNode(node.id);
            save();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            var newNode = Ops.normalizeNode({ text: '' });
            if (Ops.insertSiblingAfter(items, node.id, newNode)) {
              renderAll();
              updateCount();
              save();
              focusNode(newNode.id);
            }
            return;
          }
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            if (Ops.indentNode(items, node.id)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if (e.key === 'Tab' && e.shiftKey) {
            e.preventDefault();
            var loc = Ops.findParent(node.id, items, null);
            // Don't outdent past the zoomed root — the node would leave the view.
            if (loc && loc.parent && loc.parent.id !== zoomId && Ops.outdentNode(items, node.id)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
            e.preventDefault();
            if (Ops.moveNode(items, node.id, e.key === 'ArrowUp' ? -1 : 1)) {
              renderAll();
              save();
              focusNode(node.id);
            }
            return;
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            var inputs = visibleInputs();
            var idx = inputs.indexOf(input);
            var next = inputs[idx + (e.key === 'ArrowUp' ? -1 : 1)];
            if (next) {
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
            }
            return;
          }
          if (e.key === 'Backspace' && input.value === '') {
            e.preventDefault();
            var inputs2 = visibleInputs();
            var idx2 = inputs2.indexOf(input);
            var loc2 = Ops.findParent(node.id, items, null);
            if (loc2 && !(countNodes(items) === 1)) {
              Ops.removeNode(items, node.id);
              renderAll();
              updateCount();
              save();
              var remaining = visibleInputs();
              var target = remaining[Math.max(0, idx2 - 1)];
              if (target) {
                target.focus();
                target.setSelectionRange(target.value.length, target.value.length);
              }
            }
            return;
          }
          if (e.key === 'Escape') input.blur();
        });

        var noteBtn = document.createElement('button');
        noteBtn.className = 'stickysites-outline-notebtn' + (node.note ? ' has-note' : '');
        noteBtn.textContent = '\u{1F4DD}';
        noteBtn.title = node.note ? 'Edit note' : 'Add note';
        noteBtn.addEventListener('click', function () {
          openNotes[node.id] = !openNotes[node.id];
          renderAll();
          if (openNotes[node.id]) {
            var ta = listEl.querySelector('textarea[data-node-id="' + node.id + '"]');
            if (ta) ta.focus();
          }
        });

        var delBtn = document.createElement('button');
        delBtn.className = 'stickysites-outline-delete';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function () {
          Ops.removeNode(items, node.id);
          renderAll();
          updateCount();
          save();
        });

        row.append(grip, chevron, bullet, cb, input, chipsEl, noteBtn, delBtn);
        container.appendChild(row);

        if (openNotes[node.id]) {
          var noteArea = document.createElement('div');
          noteArea.className = 'stickysites-outline-note-area';
          noteArea.style.paddingLeft = (depth * 20 + 36) + 'px';
          var ta = document.createElement('textarea');
          ta.className = 'stickysites-outline-note-edit';
          ta.placeholder = 'Add notes...';
          ta.value = node.note || '';
          ta.dataset.nodeId = node.id;
          ta.addEventListener('input', function () {
            node.note = ta.value;
            noteBtn.classList.toggle('has-note', !!node.note);
            save();
          });
          noteArea.appendChild(ta);
          container.appendChild(noteArea);
        }

        var ignoreCollapse = !!visibleSet; // expand everything while filtering
        if ((!node.collapsed || ignoreCollapse) && hasChildren) {
          node.children.forEach(function (child) {
            var childEl = renderNode(child, depth + 1, visibleSet);
            if (childEl) container.appendChild(childEl);
          });
        }

        return container;
      }

      function renderAll() {
        while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
        var visibleSet = Ops.filterTree(items, filterQuery);
        getRenderRoots().forEach(function (n) {
          var nodeEl = renderNode(n, 0, visibleSet);
          if (nodeEl) listEl.appendChild(nodeEl);
        });
      }

      // ── Drag to reorder (tree-aware) ────────────────────────
      listEl.addEventListener('mousedown', function (e) {
        var grip = e.target.closest('.stickysites-outline-grip');
        if (!grip) return;
        var rowEl = grip.closest('.stickysites-outline-node');
        var dragId = rowEl && rowEl.dataset.nodeId;
        if (!dragId) return;
        e.preventDefault();
        rowEl.classList.add('is-dragging');
        var indicator = document.createElement('div');
        indicator.className = 'stickysites-outline-drop-indicator';
        listEl.style.position = 'relative';
        listEl.appendChild(indicator);
        var targetId = null;
        var after = false;

        function onMove(ev) {
          var rows = Array.from(listEl.querySelectorAll('.stickysites-outline-node'))
            .filter(function (r) { return r.dataset.nodeId !== dragId; });
          var best = null, bestDist = Infinity, bestAfter = false;
          rows.forEach(function (r) {
            var rect = r.getBoundingClientRect();
            var mid = rect.top + rect.height / 2;
            var d = Math.abs(ev.clientY - mid);
            if (d < bestDist) { bestDist = d; best = r; bestAfter = ev.clientY > mid; }
          });
          if (!best) { targetId = null; indicator.style.display = 'none'; return; }
          // Refuse to drop a node into its own subtree.
          var path = Ops.getPathTo(items, best.dataset.nodeId) || [];
          var inOwnSubtree = false;
          path.forEach(function (n) { if (n.id === dragId) inOwnSubtree = true; });
          if (inOwnSubtree) { targetId = null; indicator.style.display = 'none'; return; }
          targetId = best.dataset.nodeId;
          after = bestAfter;
          var listRect = listEl.getBoundingClientRect();
          var rect2 = best.getBoundingClientRect();
          indicator.style.display = '';
          indicator.style.top = ((after ? rect2.bottom : rect2.top) - listRect.top + listEl.scrollTop) + 'px';
        }

        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          rowEl.classList.remove('is-dragging');
          indicator.remove();
          if (targetId) {
            var from = Ops.findParent(dragId, items, null);
            if (from) {
              var moved = from.array.splice(from.index, 1)[0];
              var to = Ops.findParent(targetId, items, null);
              if (to) {
                to.array.splice(to.index + (after ? 1 : 0), 0, moved);
              } else {
                from.array.splice(from.index, 0, moved); // target vanished — put it back
              }
              renderAll();
              updateCount();
              save();
            }
          }
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      // ── Add node ────────────────────────────────────────────
      var addBtn = document.createElement('button');
      addBtn.className = 'stickysites-outline-add';
      addBtn.textContent = '+ Add node';
      addBtn.addEventListener('click', function () {
        var newNode = Ops.normalizeNode({ text: '' });
        getRenderRoots().push(newNode);
        renderAll();
        updateCount();
        save();
        focusNode(newNode.id);
      });

      // ── Assemble ────────────────────────────────────────────
      renderBreadcrumb();
      renderAll();
      updateCount();
      if (!doc) saveNow();

      el.append(header, toolbar, breadcrumb, listEl, addBtn, undoBar, footer);
    }
  };
})();
