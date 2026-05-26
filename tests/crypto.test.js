import { describe, it, expect } from 'vitest';
import {
  generateSalt, deriveKey, encrypt, decrypt, isEncrypted
} from '../src/shared/crypto.js';

describe('crypto', () => {
  it('generateSalt returns 16 bytes', () => {
    var salt = generateSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.length).toBe(16);
  });

  it('deriveKey returns a CryptoKey', async () => {
    var salt = generateSalt();
    var key = await deriveKey('test-passphrase', salt);
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
  });

  it('encrypt and decrypt round-trip', async () => {
    var salt = generateSalt();
    var key = await deriveKey('my-password', salt);
    var plaintext = '{"body":"hello world","updatedAt":"2026-01-01"}';
    var envelope = await encrypt(key, plaintext);
    expect(envelope.iv).toBeTruthy();
    expect(envelope.data).toBeTruthy();
    var decrypted = await decrypt(key, envelope);
    expect(decrypted).toBe(plaintext);
  });

  it('decrypt fails with wrong key', async () => {
    var salt = generateSalt();
    var key1 = await deriveKey('correct-password', salt);
    var key2 = await deriveKey('wrong-password', salt);
    var envelope = await encrypt(key1, 'secret data');
    await expect(decrypt(key2, envelope)).rejects.toThrow();
  });

  it('isEncrypted detects encrypted envelopes', () => {
    expect(isEncrypted({ iv: 'abc', data: 'def' })).toBe(true);
    expect(isEncrypted({ body: 'hello', updatedAt: '2026' })).toBe(false);
    expect(isEncrypted({ iv: 'abc', data: 'def', body: 'x' })).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted('string')).toBe(false);
  });
});
