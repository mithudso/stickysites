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

  window.StickySites.Todo = {
    COLORS: COLORS,
    PRIORITY_COLORS: PRIORITY_COLORS,
    genId: genId,
    normalizeItem: normalizeItem,
    normalizeData: normalizeData
  };
})();
