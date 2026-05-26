window.StickySites = window.StickySites || {};

(function () {
  var COLORS = ['#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8'];
  var PRIORITY_COLORS = { 1: '#f87171', 2: '#fb923c', 3: '#fbbf24', 4: '#60a5fa', 5: '#94a3b8' };

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeItem(item) {
    return {
      id: item.id || genId(),
      text: String(item.text ?? ''),
      done: !!item.done,
      indent: typeof item.indent === 'number' ? Math.max(0, Math.min(3, item.indent)) : 0,
      priority: typeof item.priority === 'number' ? Math.max(0, Math.min(5, item.priority)) : 0,
      color: typeof item.color === 'string' ? item.color : '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      note: typeof item.note === 'string' ? item.note : '',
      section: typeof item.section === 'string' ? item.section : '',
      completedAt: typeof item.completedAt === 'string' ? item.completedAt : ''
    };
  }

  function normalizeData(note) {
    var items = (note && Array.isArray(note.items)) ? note.items.map(normalizeItem) : [];
    var sections = (note && Array.isArray(note.sections)) ? note.sections : [];
    var tagColors = (note && typeof note.tagColors === 'object' && note.tagColors) ? note.tagColors : {};
    return { items: items, sections: sections, tagColors: tagColors };
  }

  var DragController = {
    _listEl: null,
    _getItems: null,
    _getSections: null,
    _onReorder: null,
    _dragging: false,
    _dragItemId: null,
    _dragRow: null,
    _indicator: null,
    _targetId: null,
    _insertAfter: false,
    _onMouseMove: null,
    _onMouseUp: null,

    init: function (listEl, getItems, getSections, onReorder) {
      var self = this;
      self._listEl = listEl;
      self._getItems = getItems;
      self._getSections = getSections;
      self._onReorder = onReorder;

      listEl.addEventListener('mousedown', function (e) {
        var grip = e.target.closest('.stickysites-todo-grip');
        if (!grip) return;
        var container = grip.closest('[data-item-id]');
        if (!container) return;
        var itemId = container.getAttribute('data-item-id');
        var row = grip.closest('.stickysites-todo-item');
        if (!row) return;

        e.preventDefault();

        self._dragging = true;
        self._dragItemId = itemId;
        self._dragRow = row;
        self._targetId = null;
        self._insertAfter = false;

        row.classList.add('is-dragging');

        var indicator = document.createElement('div');
        indicator.className = 'stickysites-todo-drop-indicator';
        indicator.style.position = 'absolute';
        indicator.style.left = '12px';
        indicator.style.right = '12px';
        indicator.style.height = '2px';
        listEl.style.position = 'relative';
        listEl.appendChild(indicator);
        self._indicator = indicator;

        self._onMouseMove = function (ev) {
          if (!self._dragging) return;
          var cursorY = ev.clientY;
          var rows = listEl.querySelectorAll('.stickysites-todo-item:not(.is-dragging)');
          var bestTarget = null;
          var bestAfter = false;
          var bestDist = Infinity;

          for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            // Skip items inside the completed section
            if (r.closest('.stickysites-todo-completed-section')) continue;
            var rect = r.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;
            var dist = Math.abs(cursorY - midY);
            if (dist < bestDist) {
              bestDist = dist;
              var rContainer = r.closest('[data-item-id]');
              if (rContainer) {
                bestTarget = rContainer.getAttribute('data-item-id');
                bestAfter = cursorY > midY;
              }
            }
          }

          if (bestTarget) {
            self._targetId = bestTarget;
            self._insertAfter = bestAfter;
            // Position indicator
            var targetContainer = listEl.querySelector('[data-item-id="' + bestTarget + '"]');
            if (targetContainer) {
              var targetRow = targetContainer.querySelector('.stickysites-todo-item');
              if (targetRow) {
                var listRect = listEl.getBoundingClientRect();
                var targetRect = targetRow.getBoundingClientRect();
                var indicatorY;
                if (bestAfter) {
                  indicatorY = targetRect.bottom - listRect.top + listEl.scrollTop;
                } else {
                  indicatorY = targetRect.top - listRect.top + listEl.scrollTop;
                }
                indicator.style.top = indicatorY + 'px';
              }
            }
          } else {
            self._targetId = null;
          }
        };

        self._onMouseUp = function () {
          if (!self._dragging) return;

          row.classList.remove('is-dragging');
          if (self._indicator) {
            self._indicator.remove();
            self._indicator = null;
          }

          if (self._targetId && self._targetId !== self._dragItemId) {
            var items = self._getItems();
            var dragIdx = -1;
            var targetIdx = -1;
            for (var i = 0; i < items.length; i++) {
              if (items[i].id === self._dragItemId) dragIdx = i;
              if (items[i].id === self._targetId) targetIdx = i;
            }
            if (dragIdx !== -1 && targetIdx !== -1) {
              var draggedItem = items.splice(dragIdx, 1)[0];
              // Recalculate target index after splice
              var newTargetIdx = -1;
              for (var j = 0; j < items.length; j++) {
                if (items[j].id === self._targetId) { newTargetIdx = j; break; }
              }
              if (newTargetIdx !== -1) {
                var insertIdx = self._insertAfter ? newTargetIdx + 1 : newTargetIdx;
                items.splice(insertIdx, 0, draggedItem);
                // Update section to match the target item's section
                var targetItem = null;
                for (var k = 0; k < items.length; k++) {
                  if (items[k].id === self._targetId) { targetItem = items[k]; break; }
                }
                if (targetItem) {
                  draggedItem.section = targetItem.section;
                }
                self._onReorder();
              }
            }
          }

          self._dragging = false;
          self._dragItemId = null;
          self._dragRow = null;
          self._targetId = null;
          self._insertAfter = false;

          document.removeEventListener('mousemove', self._onMouseMove);
          document.removeEventListener('mouseup', self._onMouseUp);
          self._onMouseMove = null;
          self._onMouseUp = null;
        };

        document.addEventListener('mousemove', self._onMouseMove);
        document.addEventListener('mouseup', self._onMouseUp);
      });
    }
  };

  window.StickySites.Todo = {
    COLORS: COLORS,
    PRIORITY_COLORS: PRIORITY_COLORS,
    genId: genId,
    normalizeItem: normalizeItem,
    normalizeData: normalizeData,
    DragController: DragController
  };
})();
