const ALGO = 'AES-GCM';
const KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 600000;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

export async function deriveKey(passphrase, salt) {
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(key, plaintext) {
  var enc = new TextEncoder();
  var iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  var ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv },
    key,
    enc.encode(plaintext)
  );
  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(ciphertext)
  };
}

export async function decrypt(key, envelope) {
  var dec = new TextDecoder();
  var iv = base64ToArrayBuffer(envelope.iv);
  var data = base64ToArrayBuffer(envelope.data);
  var plaintext = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv },
    key,
    data
  );
  return dec.decode(plaintext);
}

export function isEncrypted(value) {
  return !!(value && typeof value === 'object' && typeof value.iv === 'string' && typeof value.data === 'string' && !value.body && !value.items);
}

function arrayBufferToBase64(buffer) {
  var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  var binary = '';
  for (var i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
