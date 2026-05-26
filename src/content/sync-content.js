window.StickySites = window.StickySites || {};

(function () {
  var SYNC_META_KEY = 'stickysites_sync_meta';

  window.StickySites.Sync = {
    isSignedIn: async function () {
      var stored = await chrome.storage.local.get(SYNC_META_KEY);
      var meta = stored?.[SYNC_META_KEY];
      return !!(meta && meta.signedIn);
    },

    getMeta: async function () {
      var stored = await chrome.storage.local.get(SYNC_META_KEY);
      return stored?.[SYNC_META_KEY] || { lastSync: null, perKey: {}, signedIn: false };
    },

    requestSync: function () {
      chrome.runtime.sendMessage({ type: 'STICKYSITES_SYNC_NOW' });
    },

    signIn: function () {
      chrome.runtime.sendMessage({ type: 'STICKYSITES_SYNC_SIGNIN' });
    },

    signOut: function () {
      chrome.runtime.sendMessage({ type: 'STICKYSITES_SYNC_SIGNOUT' });
    }
  };
})();
