window.StickySites = window.StickySites || {};

(function () {
  window.StickySites.Cluster = {
    el: null,
    buttons: [],
    activeTypeId: null,
    hidden: false,
    onIconClick: null,
    _wasDragging: false,
    _reorderTarget: null,

    async init(noteTypes, onIconClick) {
      this.onIconClick = onIconClick;

      var cluster = document.createElement('div');
      cluster.id = 'stickysites-cluster';

      var prefs = await window.StickySites.Prefs.read();
      var iconOrder = prefs.iconOrder || null;
      var clusterLayout = prefs.clusterLayout || 'vertical';

      if (clusterLayout === 'horizontal') {
        cluster.classList.add('is-horizontal');
      }

      var ordered = noteTypes.slice();
      if (iconOrder && Array.isArray(iconOrder)) {
        ordered.sort(function (a, b) {
          var ai = iconOrder.indexOf(a.id);
          var bi = iconOrder.indexOf(b.id);
          if (ai === -1) ai = 999;
          if (bi === -1) bi = 999;
          return ai - bi;
        });
      }

      for (var i = 0; i < ordered.length; i++) {
        var nt = ordered[i];
        var btn = document.createElement('button');
        btn.className = 'stickysites-cluster-icon ' + nt.cssClass;
        btn.title = nt.label;
        btn.textContent = nt.emoji;
        btn.dataset.typeId = nt.id;
        btn.draggable = false;
        btn.addEventListener('click', this._makeClickHandler(nt.id));
        cluster.appendChild(btn);
        this.buttons.push({ el: btn, typeId: nt.id });
      }

      this.el = cluster;
      document.documentElement.appendChild(cluster);

      if (prefs.clusterPosition.x !== null && prefs.clusterPosition.y !== null) {
        cluster.style.top = prefs.clusterPosition.y + 'px';
        cluster.style.right = 'auto';
        cluster.style.left = prefs.clusterPosition.x + 'px';
      }

      var enabledTypes = prefs.enabledTypes || {};
      for (var j = 0; j < this.buttons.length; j++) {
        var b = this.buttons[j];
        if (enabledTypes[b.typeId] === false) {
          b.el.style.display = 'none';
        }
      }

      this._initDrag();
      this._initReorder();
    },

    _makeClickHandler: function (typeId) {
      var self = this;
      return function (e) {
        e.stopPropagation();
        if (self._wasDragging) { self._wasDragging = false; return; }
        self._handleClick(typeId);
      };
    },

    _handleClick: function (typeId) {
      if (this.activeTypeId === typeId) {
        this.setActive(null);
        if (this.onIconClick) this.onIconClick(null);
      } else {
        this.setActive(typeId);
        if (this.onIconClick) this.onIconClick(typeId);
      }
    },

    setActive: function (typeId) {
      this.activeTypeId = typeId;
      for (var i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i];
        b.el.classList.toggle('is-active', b.typeId === typeId);
      }
    },

    toggle: function () {
      this.hidden = !this.hidden;
      this.el.classList.toggle('is-hidden', this.hidden);
      if (this.hidden) {
        this.setActive(null);
        if (this.onIconClick) this.onIconClick(null);
      }
    },

    _initReorder: function () {
      var self = this;
      var holdTimer = null;
      var isReordering = false;
      var dragBtn = null;
      var placeholder = null;
      var startIdx = -1;

      this.buttons.forEach(function (b) {
        b.el.addEventListener('mousedown', function (e) {
          if (e.button !== 0) return;
          var target = b;
          holdTimer = setTimeout(function () {
            holdTimer = null;
            isReordering = true;
            dragBtn = target;
            startIdx = self._getVisibleIndex(target.el);
            target.el.classList.add('is-reordering');
            self.el.classList.add('is-reorder-mode');
            e.preventDefault();
          }, 400);
        });

        b.el.addEventListener('mouseup', function () {
          if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        });

        b.el.addEventListener('mouseleave', function () {
          if (holdTimer && !isReordering) { clearTimeout(holdTimer); holdTimer = null; }
        });
      });

      document.addEventListener('mousemove', function (e) {
        if (!isReordering || !dragBtn) return;
        var cluster = self.el;
        var icons = Array.from(cluster.querySelectorAll('.stickysites-cluster-icon:not([style*="display: none"])'));
        var mousePos = cluster.classList.contains('is-horizontal') ? e.clientX : e.clientY;

        for (var i = 0; i < icons.length; i++) {
          if (icons[i] === dragBtn.el) continue;
          var rect = icons[i].getBoundingClientRect();
          var mid = cluster.classList.contains('is-horizontal')
            ? rect.left + rect.width / 2
            : rect.top + rect.height / 2;
          if (mousePos < mid) {
            cluster.insertBefore(dragBtn.el, icons[i]);
            break;
          } else if (i === icons.length - 1) {
            cluster.appendChild(dragBtn.el);
          }
        }
      });

      document.addEventListener('mouseup', async function () {
        if (!isReordering) return;
        isReordering = false;
        if (dragBtn) {
          dragBtn.el.classList.remove('is-reordering');
          self.el.classList.remove('is-reorder-mode');

          var icons = Array.from(self.el.querySelectorAll('.stickysites-cluster-icon'));
          var newOrder = icons.map(function (el) { return el.dataset.typeId; });
          self.buttons = newOrder.map(function (id) {
            for (var i = 0; i < self.buttons.length; i++) {
              if (self.buttons[i].typeId === id) return self.buttons[i];
            }
            return null;
          }).filter(Boolean);

          await window.StickySites.Prefs.write({ iconOrder: newOrder });
          dragBtn = null;
        }
      });
    },

    _getVisibleIndex: function (el) {
      var icons = Array.from(this.el.querySelectorAll('.stickysites-cluster-icon:not([style*="display: none"])'));
      return icons.indexOf(el);
    },

    _initDrag: function () {
      var self = this;
      var isDragging = false;
      var hasMoved = false;
      var startX, startY, startLeft, startTop;

      this.el.addEventListener('mousedown', function (e) {
        if (e.target !== self.el) return;
        isDragging = true;
        hasMoved = false;
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
        var newLeft = startLeft + dx;
        var newTop = startTop + dy;

        var rect = self.el.getBoundingClientRect();
        var maxLeft = window.innerWidth - rect.width;
        var maxTop = window.innerHeight - rect.height;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        self.el.style.right = 'auto';
        self.el.style.left = newLeft + 'px';
        self.el.style.top = newTop + 'px';
      });

      document.addEventListener('mouseup', async function () {
        if (!isDragging) return;
        isDragging = false;
        self.el.style.cursor = '';
        if (hasMoved) {
          self._wasDragging = true;
          var rect = self.el.getBoundingClientRect();
          await window.StickySites.Prefs.write({
            clusterPosition: { x: Math.round(rect.left), y: Math.round(rect.top) }
          });
        }
      });
    }
  };
})();
