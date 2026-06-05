window.StickySites = window.StickySites || {};

(function () {
  function domainFragment(loc) {
    // "www.example.com" → "exam": first dot-label, minus www, max 4 chars.
    var label = loc.hostname.replace(/^www\./, '').split('.')[0] || loc.hostname;
    return label.slice(0, 4);
  }

  function pathFragment(loc) {
    // Last path segment, ellipsized: "/contactus.html" → "con…"; "/" → "/".
    var seg = loc.pathname.split('/').filter(Boolean).pop() || '/';
    return seg.length > 4 ? seg.slice(0, 3) + '…' : seg;
  }

  window.StickySites.noteTypes = [
    {
      id: 'global',
      color: '#fbbf24',
      tint: 'rgba(251,191,36,0.15)',
      tintText: '#fde68a',
      label: 'Global note',
      emoji: '\u{1F310}',
      cssClass: 'is-yellow',
      storageKey: 'stickysites_global_v1',
      storagePattern: 'single',
      getKey: function () { return '__global__'; },
      getLabel: function () { return 'Global note'; },
      getPlaceholder: function () { return 'Type a note here. Visible on every website.'; }
    },
    {
      id: 'site',
      color: '#34d399',
      tint: 'rgba(52,211,153,0.15)',
      tintText: '#6ee7b7',
      label: 'Site note',
      emoji: '\u{1F4DD}',
      cssClass: 'is-green',
      storageKey: 'stickysites_sites_v1',
      storagePattern: 'map',
      getKey: function (loc) { return loc.hostname.replace(/^www\./, ''); },
      getLabel: function (loc) { return 'Site note — ' + loc.hostname.replace(/^www\./, ''); },
      getPlaceholder: function (loc) { return 'Notes for ' + loc.hostname.replace(/^www\./, '') + '. Only visible on this domain.'; },
      getIconContent: function (loc) { return domainFragment(loc); },
      getIconTitle: function (loc) { return loc.hostname.replace(/^www\./, ''); }
    },
    {
      id: 'page',
      color: '#60a5fa',
      tint: 'rgba(96,165,250,0.15)',
      tintText: '#93c5fd',
      label: 'Page note',
      emoji: '\u{1F4DD}',
      cssClass: 'is-blue',
      storageKey: 'stickysites_pages_v1',
      storagePattern: 'map',
      getKey: function (loc) { return loc.origin + loc.pathname; },
      getLabel: function (loc) { return 'Page note — ' + loc.pathname; },
      getPlaceholder: function () { return 'Notes for this page only.'; },
      getIconContent: function (loc) { return pathFragment(loc); },
      getIconTitle: function (loc) { return loc.pathname; }
    },
    {
      id: 'todo',
      color: '#a78bfa',
      tint: 'rgba(167,139,250,0.15)',
      tintText: '#c4b5fd',
      label: 'To-do list',
      emoji: '✓',
      cssClass: 'is-purple',
      storageKey: 'stickysites_todos_v1',
      storagePattern: 'structured',
      getKey: function () { return '__global__'; },
      getLabel: function () { return 'To-do list'; },
      getPlaceholder: function () { return 'Add your to-do items.'; }
    },
    {
      id: 'outline',
      color: '#fb923c',
      tint: 'rgba(251,146,60,0.15)',
      tintText: '#fdba74',
      label: 'Outliner',
      emoji: '≡',
      cssClass: 'is-orange',
      storageKey: 'stickysites_outlines_v1',
      storagePattern: 'structured',
      getKey: function () { return ''; },
      getLabel: function () { return 'Outliner'; },
      getPlaceholder: function () { return 'Organize your thoughts.'; }
    },
    {
      id: 'daily',
      color: '#f87171',
      tint: 'rgba(248,113,113,0.15)',
      tintText: '#fca5a5',
      label: 'Daily note',
      emoji: '\u{1F4C5}',
      cssClass: 'is-red',
      storageKey: 'stickysites_daily_v1',
      storagePattern: 'map',
      getKey: function () {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      },
      getLabel: function () {
        var d = new Date();
        return 'Daily — ' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      },
      getPlaceholder: function () { return 'What happened today?'; },
      getIconContent: function () { return String(new Date().getDate()); },
      getIconTitle: function () { return this.getLabel(); }
    }
  ];
})();
