(function (window) {
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
    _cacheGeneration: 0,
    _cachedJwk: null,

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
      var state = await this._state();
      await window.StickySites.Storage.commit(state, { stickysites_cached_key: jwk });
      this._cachedKey = key;
      this._cachedJwk = JSON.stringify(jwk);
    },

    // Import a cached JWK back into a CryptoKey (mirrors importJwk in src/shared/crypto.js).
    importJwk: function (jwk) {
      return crypto.subtle.importKey('jwk', jwk, { name: ALGO }, true, ['encrypt', 'decrypt']);
    },

    getCachedKey: async function () {
      if (!crypto.subtle) return await window.StickySites.Storage.request({ op: 'crypto', action: 'getCachedKey' }) ? { remote: true } : null;
      var generation = this._cacheGeneration;
      try {
        // Read storage even when this context has an imported key: Lock Now in another
        // context must take effect here before the next read or write.
        var stored = await chrome.storage.local.get('stickysites_cached_key');
        var jwk = stored?.stickysites_cached_key;
        if (!jwk || generation !== this._cacheGeneration) return null;
        var fingerprint = JSON.stringify(jwk);
        if (this._cachedKey && this._cachedJwk === fingerprint) return this._cachedKey;
        var key = await this.importJwk(jwk);
        var latest = await chrome.storage.local.get('stickysites_cached_key');
        if (generation !== this._cacheGeneration || JSON.stringify(latest.stickysites_cached_key) !== fingerprint) return null;
        this._cachedKey = key;
        this._cachedJwk = fingerprint;
        return key;
      } catch { return null; }
    },

    clearCachedKey: async function () {
      this._cacheGeneration++;
      this._cachedKey = null;
      this._cachedJwk = null;
      await window.StickySites.Storage.request({ op: 'lock' });
    },

    _state: async function () {
      var keys = ['stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1',
        'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1',
        CRYPTO_CONFIG_KEY, 'stickysites_cached_key'];
      var raw = await chrome.storage.local.get(keys), expected = {};
      keys.forEach(function (k) { expected[k] = raw[k] ?? null; });
      return expected;
    },

    _transform: async function (state, key, encrypting) {
      var updates = {};
      for (var k of Object.keys(state)) {
        if (k === CRYPTO_CONFIG_KEY || k === 'stickysites_cached_key' || state[k] == null) continue;
        var value = state[k];
        if (encrypting && !this.isEncrypted(value)) updates[k] = await this.encrypt(key, JSON.stringify(value));
        if (!encrypting && this.isEncrypted(value)) updates[k] = JSON.parse(await this.decrypt(key, value));
      }
      return updates;
    },

    // Setup: enable encryption with a new passphrase
    enable: async function (passphrase) {
      if (!crypto.subtle) return window.StickySites.Storage.request({ op: 'crypto', action: 'enable', value: passphrase });
      var state = await this._state();
      if (state[CRYPTO_CONFIG_KEY]?.enabled) throw new Error('VAULT_ALREADY_ENABLED');
      // Refuse orphaned ciphertext rather than replacing its recovery configuration.
      if (Object.keys(state).some(k => this.isEncrypted(state[k]))) throw new Error('VAULT_UNREADABLE');
      var salt = this.generateSalt();
      var key = await this.deriveKey(passphrase, salt);
      var updates = await this._transform(state, key, true);
      updates[CRYPTO_CONFIG_KEY] = { enabled: true, salt: arrayBufferToBase64(salt), verify: await this.encrypt(key, VERIFY_STRING) };
      updates.stickysites_cached_key = await crypto.subtle.exportKey('jwk', key);
      await window.StickySites.Storage.commit(state, updates);
      this._cachedKey = null;
    },

    // Unlock: verify passphrase and cache key
    unlock: async function (passphrase) {
      if (!crypto.subtle) return window.StickySites.Storage.request({ op: 'crypto', action: 'unlock', value: passphrase });
      var state = await this._state();
      var config = state[CRYPTO_CONFIG_KEY];
      if (!config || !config.enabled) return false;
      var salt = new Uint8Array(base64ToArrayBuffer(config.salt));
      var key = await this.deriveKey(passphrase, salt);
      try {
        var result = await this.decrypt(key, config.verify);
        if (result !== VERIFY_STRING) return false;
      } catch { return false; }
      var updates = await this._transform(state, key, true);
      updates.stickysites_cached_key = await crypto.subtle.exportKey('jwk', key);
      await window.StickySites.Storage.commit(state, updates);
      this._cachedKey = null;
      return true;
    },

    // Disable: decrypt all notes and clear config
    disable: async function () {
      if (!crypto.subtle) return window.StickySites.Storage.request({ op: 'crypto', action: 'disable', value: null });
      var state = await this._state();
      if (!state[CRYPTO_CONFIG_KEY]?.enabled) return;
      var key = await this.getCachedKey();
      if (!key) throw new Error('VAULT_LOCKED');
      // Stage every decryption before the single commit. One corrupt bucket keeps
      // the entire vault and all ciphertext intact for recovery.
      var updates = await this._transform(state, key, false);
      updates[CRYPTO_CONFIG_KEY] = null;
      updates.stickysites_cached_key = null;
      await window.StickySites.Storage.commit(state, updates);
      this._cacheGeneration++;
      this._cachedKey = null;
      this._cachedJwk = null;
    },

    // Encrypt a storage value (JSON-serializable object)
    encryptValue: async function (value) {
      if (!crypto.subtle) return window.StickySites.Storage.request({ op: 'crypto', action: 'encryptValue', value: value });
      var key = await this.getCachedKey();
      if (!key) throw new Error('VAULT_LOCKED');
      return this.encrypt(key, JSON.stringify(value));
    },

    // Decrypt a storage value (returns parsed object or original if not encrypted)
    decryptValue: async function (value) {
      if (!crypto.subtle) return window.StickySites.Storage.request({ op: 'crypto', action: 'decryptValue', value: value });
      if (!this.isEncrypted(value)) return value;
      var key = await this.getCachedKey();
      if (!key) return value;
      try {
        var json = await this.decrypt(key, value);
        return JSON.parse(json);
      } catch { return value; }
    }
  };
})();

})(globalThis);
