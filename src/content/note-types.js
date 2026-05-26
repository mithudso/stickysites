window.StickySites = window.StickySites || {};

window.StickySites.noteTypes = [
  {
    id: 'global',
    color: '#fbbf24',
    tint: 'rgba(251,191,36,0.15)',
    tintText: '#fde68a',
    label: 'Global note',
    emoji: '\u{1F4DD}',
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
    getPlaceholder: function (loc) { return 'Notes for ' + loc.hostname.replace(/^www\./, '') + '. Only visible on this domain.'; }
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
    getPlaceholder: function () { return 'Notes for this page only.'; }
  }
];
