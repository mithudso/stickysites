window.StickySites = window.StickySites || {};

(function () {
  var MENTION_ITEMS = [
    { category: 'Link', icon: '🔗', items: [
      { label: 'Paste URL', value: 'link', action: 'prompt', prompt: 'Enter URL:' },
      { label: 'Current page URL', value: 'pageurl', action: 'insert-url' }
    ]},
    { category: 'Date', icon: '📅', items: [
      { label: 'Today', value: 'today', action: 'insert-date', format: 'today' },
      { label: 'Tomorrow', value: 'tomorrow', action: 'insert-date', format: 'tomorrow' },
      { label: 'This week', value: 'thisweek', action: 'insert-date', format: 'thisweek' },
      { label: 'Pick date...', value: 'pickdate', action: 'prompt-date' }
    ]},
    { category: 'Contact', icon: '👤', items: [
      { label: 'Add name', value: 'contact', action: 'prompt', prompt: 'Enter name:' },
      { label: 'Add email', value: 'email', action: 'prompt', prompt: 'Enter email:' }
    ]},
    { category: 'File', icon: '📎', items: [
      { label: 'Attach file reference', value: 'file', action: 'prompt', prompt: 'Enter file path or name:' }
    ]}
  ];

  function formatDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function getDateValue(format) {
    var d = new Date();
    if (format === 'today') return formatDate(d);
    if (format === 'tomorrow') { d.setDate(d.getDate() + 1); return formatDate(d); }
    if (format === 'thisweek') {
      var end = new Date(d);
      end.setDate(end.getDate() + (7 - end.getDay()));
      return formatDate(d) + ' → ' + formatDate(end);
    }
    return formatDate(d);
  }

  window.StickySites.Mentions = {
    dropdown: null,
    editorEl: null,
    query: '',
    atPosition: null,
    visible: false,
    selectedIndex: 0,
    flatItems: [],

    attach: function (editorEl) {
      this.editorEl = editorEl;
      var self = this;

      editorEl.addEventListener('input', function () {
        self._checkForTrigger();
      });

      editorEl.addEventListener('keydown', function (e) {
        if (!self.visible) return;
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          self.selectedIndex = (self.selectedIndex + 1) % self.flatItems.length;
          self._renderItems();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          self.selectedIndex = (self.selectedIndex - 1 + self.flatItems.length) % self.flatItems.length;
          self._renderItems();
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (self.flatItems.length > 0) {
            e.preventDefault();
            self._selectItem(self.flatItems[self.selectedIndex]);
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          self.hide();
        }
      });

      document.addEventListener('click', function (e) {
        if (self.dropdown && !self.dropdown.contains(e.target) && e.target !== editorEl) {
          self.hide();
        }
      });
    },

    _checkForTrigger: function () {
      var sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      var range = sel.getRangeAt(0);
      if (!this.editorEl.contains(range.startContainer)) { this.hide(); return; }

      var textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) { this.hide(); return; }

      var text = textNode.textContent;
      var offset = range.startOffset;
      var atIdx = text.lastIndexOf('@', offset - 1);

      if (atIdx === -1) { this.hide(); return; }

      var beforeAt = atIdx > 0 ? text.charAt(atIdx - 1) : ' ';
      if (beforeAt !== ' ' && beforeAt !== '\n' && atIdx !== 0) { this.hide(); return; }

      this.query = text.substring(atIdx + 1, offset).toLowerCase();
      this.atPosition = { node: textNode, offset: atIdx };
      this._buildFlatItems();
      this.selectedIndex = 0;

      if (this.flatItems.length > 0) {
        this.show();
        this._positionDropdown(range);
        this._renderItems();
      } else {
        this.hide();
      }
    },

    _buildFlatItems: function () {
      var q = this.query;
      var flat = [];
      MENTION_ITEMS.forEach(function (cat) {
        var matchedItems = cat.items.filter(function (item) {
          if (!q) return true;
          return item.label.toLowerCase().includes(q) || cat.category.toLowerCase().includes(q);
        });
        if (matchedItems.length > 0) {
          flat.push({ type: 'header', label: cat.icon + ' ' + cat.category });
          matchedItems.forEach(function (item) {
            flat.push({ type: 'item', label: item.label, data: item });
          });
        }
      });
      this.flatItems = flat.filter(function (f) { return f.type === 'item'; });
    },

    _getAllDisplayItems: function () {
      var q = this.query;
      var display = [];
      MENTION_ITEMS.forEach(function (cat) {
        var matchedItems = cat.items.filter(function (item) {
          if (!q) return true;
          return item.label.toLowerCase().includes(q) || cat.category.toLowerCase().includes(q);
        });
        if (matchedItems.length > 0) {
          display.push({ type: 'header', label: cat.icon + ' ' + cat.category });
          matchedItems.forEach(function (item) {
            display.push({ type: 'item', label: item.label, data: item });
          });
        }
      });
      return display;
    },

    show: function () {
      if (!this.dropdown) {
        this.dropdown = document.createElement('div');
        this.dropdown.id = 'stickysites-mentions';
        document.documentElement.appendChild(this.dropdown);
      }
      this.dropdown.style.display = 'block';
      this.visible = true;
    },

    hide: function () {
      if (this.dropdown) this.dropdown.style.display = 'none';
      this.visible = false;
      this.query = '';
      this.atPosition = null;
    },

    _positionDropdown: function (range) {
      var rect = range.getBoundingClientRect();
      this.dropdown.style.top = (rect.bottom + 4) + 'px';
      this.dropdown.style.left = rect.left + 'px';
    },

    _renderItems: function () {
      if (!this.dropdown) return;
      while (this.dropdown.firstChild) this.dropdown.removeChild(this.dropdown.firstChild);
      var self = this;
      var display = this._getAllDisplayItems();
      var itemIdx = 0;

      display.forEach(function (entry) {
        if (entry.type === 'header') {
          var h = document.createElement('div');
          h.className = 'stickysites-mention-header';
          h.textContent = entry.label;
          self.dropdown.appendChild(h);
        } else {
          var row = document.createElement('div');
          row.className = 'stickysites-mention-item';
          if (itemIdx === self.selectedIndex) row.classList.add('is-selected');
          row.textContent = entry.label;
          var capturedData = entry.data;
          row.addEventListener('mousedown', function (e) {
            e.preventDefault();
            self._selectItem({ data: capturedData });
          });
          self.dropdown.appendChild(row);
          itemIdx++;
        }
      });
    },

    _selectItem: function (flatItem) {
      var item = flatItem.data;
      var self = this;
      this.hide();

      var insertText = '';

      if (item.action === 'insert-date') {
        insertText = getDateValue(item.format);
      } else if (item.action === 'insert-url') {
        insertText = location.href;
      } else if (item.action === 'prompt') {
        var val = prompt(item.prompt);
        if (!val) return;
        insertText = val;
      } else if (item.action === 'prompt-date') {
        var val = prompt('Enter date (YYYY-MM-DD):');
        if (!val) return;
        insertText = val;
      }

      if (!insertText || !self.atPosition) return;

      var node = self.atPosition.node;
      var atOff = self.atPosition.offset;
      var sel = window.getSelection();
      var currentOffset = sel.getRangeAt(0).startOffset;

      var before = node.textContent.substring(0, atOff);
      var after = node.textContent.substring(currentOffset);
      node.textContent = before + after;

      var chip = document.createElement('span');
      chip.className = 'stickysites-mention-chip';
      chip.contentEditable = 'false';
      chip.textContent = insertText;
      chip.dataset.mentionType = item.value;

      var range = document.createRange();
      range.setStart(node, atOff);
      range.collapse(true);

      range.insertNode(chip);

      var spaceNode = document.createTextNode(' ');
      chip.parentNode.insertBefore(spaceNode, chip.nextSibling);

      range.setStartAfter(spaceNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      if (self.editorEl) {
        self.editorEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  };
})();
