window.StickySites = window.StickySites || {};

(function () {
  var PREFS_KEY = 'stickysites_prefs_v1';
  var DEFAULT_PREFS = { clusterPosition: { x: null, y: null }, panelMode: 'fixed' };

  window.StickySites.Prefs = {
    async read() {
      try {
        var stored = await chrome.storage.local.get(PREFS_KEY);
        var raw = stored?.[PREFS_KEY] || {};
        return Object.assign({}, DEFAULT_PREFS, raw);
      } catch { return Object.assign({}, DEFAULT_PREFS); }
    },

    async write(updates) {
      try {
        var current = await this.read();
        var merged = Object.assign({}, current, updates);
        await chrome.storage.local.set({ [PREFS_KEY]: merged });
        return merged;
      } catch { return null; }
    }
  };
})();
