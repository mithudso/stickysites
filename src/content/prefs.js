window.StickySites = window.StickySites || {};
(function () {
  window.StickySites.Prefs = {
    async read() {
      try {
        var stored = await chrome.storage.local.get('stickysites_prefs_v1');
        return window.StickySites.Settings.normalizePrefs(stored.stickysites_prefs_v1);
      } catch { return window.StickySites.Settings.normalizePrefs(null); }
    },
    async write(updates) {
      try { return await window.StickySites.Storage.request({ op: 'prefs', data: updates }); }
      catch { console.warn('[stickysites] prefs', { error: 'PREFS_WRITE_FAILED' }); return null; }
    }
  };
})();
