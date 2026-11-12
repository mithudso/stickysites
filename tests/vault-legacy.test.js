// Always-on compatibility coverage uses the frozen legacy corpus and real shared crypto.
// It does not require the optional private vault package or regenerate the fixtures.
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { deriveKey, decrypt, encrypt, importJwk } from '../src/shared/crypto.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/legacy-crypto-envelopes.json', import.meta.url), 'utf8'));
for (const legacy of fixtures.cases) {
  it(`decrypts stored envelopes from ${legacy.writer} with its original derived and cached keys (${JSON.stringify(legacy.passphrase)})`, async () => {
    const derived = await deriveKey(legacy.passphrase, new Uint8Array(Buffer.from(legacy.salt, 'base64')));
    expect((await crypto.subtle.exportKey('jwk', derived)).k).toBe(legacy.jwk.k);
    const cached = await importJwk(legacy.jwk);
    for (const key of [derived, cached]) {
      expect(await decrypt(key, legacy.verify)).toBe('stickysites-verify');
      for (const value of legacy.values) expect(await decrypt(key, value.envelope)).toBe(value.plaintext);
    }
    expect(await decrypt(cached, await encrypt(cached, 'round-trip'))).toBe('round-trip');
  });
}
