window.StickySites = window.StickySites || {};

(function () {
  window.StickySites.Cluster = {
    el: null,
    buttons: [],
    activeTypeId: null,
    hidden: false,
    onIconClick: null,

    async init(noteTypes, onIconClick) {
      this.onIconClick = onIconClick;

      var cluster = document.createElement('div');
      cluster.id = 'stickysites-cluster';

      for (var i = 0; i < noteTypes.length; i++) {
        var nt = noteTypes[i];
        var btn = document.createElement('button');
        btn.className = 'stickysites-cluster-icon ' + nt.cssClass;
        btn.title = nt.label;
        btn.textContent = nt.emoji;
        btn.dataset.typeId = nt.id;
        btn.addEventListener('click', this._makeClickHandler(nt.id));
        cluster.appendChild(btn);
        this.buttons.push({ el: btn, typeId: nt.id });
      }

      this.el = cluster;
      document.documentElement.appendChild(cluster);

      var prefs = await window.StickySites.Prefs.read();
      if (prefs.clusterPosition.x !== null && prefs.clusterPosition.y !== null) {
        cluster.style.top = prefs.clusterPosition.y + 'px';
        cluster.style.right = 'auto';
        cluster.style.left = prefs.clusterPosition.x + 'px';
      }

      this._initDrag();
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
