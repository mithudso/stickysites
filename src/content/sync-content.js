window.StickySites = window.StickySites || {};

(function () {
  var SYNC_META_KEY = 'stickysites_sync_meta';

  function sendAndWait(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (response) {
        resolve(response || { ok: false, error: 'No response from service worker' });
      });
    });
  }

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
      return sendAndWait({ type: 'STICKYSITES_SYNC_NOW' });
    },

    signIn: function () {
      return sendAndWait({ type: 'STICKYSITES_SYNC_SIGNIN' });
    },

    signOut: function () {
      return sendAndWait({ type: 'STICKYSITES_SYNC_SIGNOUT' });
    }
  };
})();
