window.StickySites = window.StickySites || {};

(function () {
  var ALGO = 'AES-GCM';
  var KEY_LENGTH = 256;
  var PBKDF2_ITERATIONS = 600000;
  var IV_LENGTH = 12;
  var SALT_LENGTH = 16;
  var CRYPTO_CONFIG_KEY = 'stickysites_crypto_v1';
  var VERIFY_STRING = 'stickysites-verify';

  function arrayBufferToBase64(buffer) {
    var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  window.StickySites.Crypto = {
    _cachedKey: null,

    generateSalt: function () {
      return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    },

    deriveKey: async function (passphrase, salt) {
      var enc = new TextEncoder();
      var keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
      );
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: ALGO, length: KEY_LENGTH },
        true,
        ['encrypt', 'decrypt']
      );
    },

    encrypt: async function (key, plaintext) {
      var enc = new TextEncoder();
      var iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
      var ciphertext = await crypto.subtle.encrypt({ name: ALGO, iv: iv }, key, enc.encode(plaintext));
      return { iv: arrayBufferToBase64(iv), data: arrayBufferToBase64(ciphertext) };
    },

    decrypt: async function (key, envelope) {
      var dec = new TextDecoder();
      var iv = base64ToArrayBuffer(envelope.iv);
      var data = base64ToArrayBuffer(envelope.data);
      var plaintext = await crypto.subtle.decrypt({ name: ALGO, iv: iv }, key, data);
      return dec.decode(plaintext);
    },

    isEncrypted: function (value) {
      return !!(value && typeof value === 'object' && typeof value.iv === 'string' && typeof value.data === 'string' && !value.body && !value.items && !value.siteKey);
    },

    isEnabled: async function () {
      var stored = await chrome.storage.local.get(CRYPTO_CONFIG_KEY);
      var config = stored?.[CRYPTO_CONFIG_KEY];
      return !!(config && config.enabled);
    },

    getConfig: async function () {
      var stored = await chrome.storage.local.get(CRYPTO_CONFIG_KEY);
      return stored?.[CRYPTO_CONFIG_KEY] || null;
    },

    cacheKey: async function (key) {
      var jwk = await crypto.subtle.exportKey('jwk', key);
      await chrome.storage.local.set({ stickysites_cached_key: jwk });
      this._cachedKey = key;
    },

    getCachedKey: async function () {
      if (this._cachedKey) return this._cachedKey;
      try {
        var stored = await chrome.storage.local.get('stickysites_cached_key');
        var jwk = stored?.stickysites_cached_key;
        if (!jwk) return null;
        var key = await crypto.subtle.importKey('jwk', jwk, { name: ALGO }, true, ['encrypt', 'decrypt']);
        this._cachedKey = key;
        return key;
      } catch { return null; }
    },

    clearCachedKey: async function () {
      this._cachedKey = null;
      try { await chrome.storage.local.remove('stickysites_cached_key'); } catch {}
    },

    // Setup: enable encryption with a new passphrase
    enable: async function (passphrase) {
      var salt = this.generateSalt();
      var key = await this.deriveKey(passphrase, salt);
      var verify = await this.encrypt(key, VERIFY_STRING);
      await chrome.storage.local.set({
        [CRYPTO_CONFIG_KEY]: {
          enabled: true,
          salt: arrayBufferToBase64(salt),
          verify: verify
        }
      });
      await this.cacheKey(key);
      await this._encryptAllNotes(key);
    },

    // Unlock: verify passphrase and cache key
    unlock: async function (passphrase) {
      var config = await this.getConfig();
      if (!config || !config.enabled) return false;
      var salt = new Uint8Array(base64ToArrayBuffer(config.salt));
      var key = await this.deriveKey(passphrase, salt);
      try {
        var result = await this.decrypt(key, config.verify);
        if (result !== VERIFY_STRING) return false;
      } catch { return false; }
      await this.cacheKey(key);
      return true;
    },

    // Disable: decrypt all notes and clear config
    disable: async function () {
      var key = await this.getCachedKey();
      if (key) await this._decryptAllNotes(key);
      await chrome.storage.local.remove(CRYPTO_CONFIG_KEY);
      await this.clearCachedKey();
    },

    // Encrypt a storage value (JSON-serializable object)
    encryptValue: async function (value) {
      var key = await this.getCachedKey();
      if (!key) return value;
      return this.encrypt(key, JSON.stringify(value));
    },

    // Decrypt a storage value (returns parsed object or original if not encrypted)
    decryptValue: async function (value) {
      if (!this.isEncrypted(value)) return value;
      var key = await this.getCachedKey();
      if (!key) return value;
      try {
        var json = await this.decrypt(key, value);
        return JSON.parse(json);
      } catch { return value; }
    },

    _encryptAllNotes: async function (key) {
      var noteKeys = [
        'stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1',
        'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1'
      ];
      var stored = await chrome.storage.local.get(noteKeys);
      var updates = {};
      for (var i = 0; i < noteKeys.length; i++) {
        var k = noteKeys[i];
        var val = stored[k];
        if (val && !this.isEncrypted(val)) {
          updates[k] = await this.encrypt(key, JSON.stringify(val));
        }
      }
      if (Object.keys(updates).length) {
        await chrome.storage.local.set(updates);
      }
    },

    _decryptAllNotes: async function (key) {
      var noteKeys = [
        'stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1',
        'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1'
      ];
      var stored = await chrome.storage.local.get(noteKeys);
      var updates = {};
      for (var i = 0; i < noteKeys.length; i++) {
        var k = noteKeys[i];
        var val = stored[k];
        if (val && this.isEncrypted(val)) {
          try {
            var json = await this.decrypt(key, val);
            updates[k] = JSON.parse(json);
          } catch { /* skip if can't decrypt */ }
        }
      }
      if (Object.keys(updates).length) {
        await chrome.storage.local.set(updates);
      }
    }
  };
})();
