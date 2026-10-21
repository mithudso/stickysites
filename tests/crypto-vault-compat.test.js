// Proves the envelopes users already have stored are still readable through the
// @mithudso/ai-auth-js vault, which is the precondition for ever replacing
// src/shared/crypto.js with it. Fixtures were produced by the OLD code
// (tests/fixtures/gen-legacy-crypto-fixtures.mjs), not by the library.
//
// The library is a private git repo and is deliberately NOT in package.json: CI's
// `npm ci` has no credentials to fetch it, and the extension has no bundler to
// consume it (the MV3 service worker cannot resolve a bare specifier). To run these:
//   npm i --no-save file:../libraries/ai-auth-js     # or github:mithudso/ai-auth-js
// Without it the suite is skipped, not failed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importJwk, decrypt as oldDecrypt, encrypt as oldEncrypt } from '../src/shared/crypto.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/legacy-crypto-envelopes.json', import.meta.url), 'utf8'));

let vault = null;
try {
  vault = await import('@mithudso/ai-auth-js/vault');
} catch {
  vault = null;
}

// Old stored shape {iv, data} -> vault shape {v, salt, iv, ct}. A CryptoKey is the
// "secret", so salt/iter are not needed (salt is '' exactly as vault.encrypt emits
// for a CryptoKey secret).
const toVault = (env) => ({ v: 1, salt: '', iv: env.iv, ct: env.data });
const fromVault = (env) => ({ iv: env.iv, data: env.ct });

describe.skipIf(!vault)('legacy crypto.js envelopes through @mithudso/ai-auth-js/vault', () => {
  it('the fixtures cover both writers and unicode passphrases', () => {
    expect(new Set(fixtures.cases.map((c) => c.writer))).toEqual(
      new Set(['shared/crypto.js', 'content/crypto-content.js'])
    );
    expect(fixtures.cases.some((c) => /[^\x00-\x7f]/.test(c.passphrase))).toBe(true);
  });

  for (const c of fixtures.cases) {
    const label = `${c.writer} / ${JSON.stringify(c.passphrase)}`;

    it(`vault.deriveKey yields the identical AES key (${label})`, async () => {
      const key = await vault.deriveKey(c.passphrase, c.salt, { extractable: true });
      const jwk = await crypto.subtle.exportKey('jwk', key);
      expect(jwk.k).toBe(c.jwk.k);
    });

    it(`vault.decrypt reads every stored note envelope (${label})`, async () => {
      const key = await vault.deriveKey(c.passphrase, c.salt);
      for (const v of c.values) {
        expect(await vault.decrypt(key, toVault(v.envelope))).toEqual(JSON.parse(v.plaintext));
      }
    });

    it(`vault.decrypt works with the cached JWK the service worker imports (${label})`, async () => {
      const key = await importJwk(c.jwk);
      for (const v of c.values) {
        expect(await vault.decrypt(key, toVault(v.envelope))).toEqual(JSON.parse(v.plaintext));
      }
    });

    it(`what the vault writes is readable by the OLD decrypt after reshaping (${label})`, async () => {
      const key = await importJwk(c.jwk);
      for (const v of c.values) {
        const written = fromVault(await vault.encrypt(key, JSON.parse(v.plaintext)));
        expect(Object.keys(written).sort()).toEqual(['data', 'iv']);
        expect(JSON.parse(await oldDecrypt(key, written))).toEqual(JSON.parse(v.plaintext));
      }
    });

    it(`GAP: vault.decrypt cannot read the bare-string verify envelope (${label})`, async () => {
      // crypto-content.js verifies a passphrase by decrypting the plaintext
      // 'stickysites-verify', which is not JSON. The old decrypt returns it as-is;
      // vault.decrypt JSON.parses and throws. Existing users' `verify` envelopes
      // therefore need a text-mode decrypt in the library before crypto-content.js
      // could use it.
      const key = await importJwk(c.jwk);
      expect(await oldDecrypt(key, c.verify)).toBe('stickysites-verify');
      await expect(vault.decrypt(key, toVault(c.verify))).rejects.toThrow();
    });
  }

  it('GAP: vault.decrypt rejects an unmodified legacy envelope (no `v`)', async () => {
    const c = fixtures.cases[0];
    const key = await importJwk(c.jwk);
    await expect(vault.decrypt(key, c.values[0].envelope)).rejects.toThrow(/version/i);
  });

  it('the old encrypt still round-trips (guards the fixtures helper imports)', async () => {
    const key = await importJwk(fixtures.cases[0].jwk);
    expect(await oldDecrypt(key, await oldEncrypt(key, 'x'))).toBe('x');
  });
});
