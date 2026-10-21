#!/usr/bin/env node
/**
 * Regenerates tests/fixtures/legacy-crypto-envelopes.json with the PRE-MIGRATION crypto code:
 *   - src/shared/crypto.js            (what the service worker runs)
 *   - src/content/crypto-content.js   (what writes users' stored notes today)
 * The fixtures are committed so the compatibility test does not depend on these files
 * staying unchanged. Re-run only to add cases; never to "fix" a failing compat test.
 *
 *   node tests/fixtures/gen-legacy-crypto-fixtures.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as shared from '../../src/shared/crypto.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const b64 = (u8) => Buffer.from(u8).toString('base64');

// crypto-content.js is a classic script that attaches to window.StickySites.
const sandbox = { window: {}, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, chrome: {} };
vm.runInNewContext(readFileSync(path.join(root, 'src/content/crypto-content.js'), 'utf8'), sandbox);
const content = sandbox.window.StickySites.Crypto;

const NOTE_VALUES = [
  { body: 'hello world', updatedAt: '2026-01-01' },
  { 'example.com': { body: 'café ✓ \u{1F4DD} <b>rich</b>', updatedAt: '2026-03-04T05:06:07Z' } },
  { items: Array.from({ length: 60 }, (_, i) => ({ id: i, text: `todo ${i} `.repeat(5), done: i % 2 === 0 })) },
  [],
  {},
];

const cases = [];
for (const [writer, api] of [['shared/crypto.js', shared], ['content/crypto-content.js', content]]) {
  for (const passphrase of ['correct horse battery staple', 'pässwörd ✓ \u{1F512}']) {
    const salt = api.generateSalt();
    const key = await api.deriveKey(passphrase, salt);
    const jwk = await crypto.subtle.exportKey('jwk', key);
    const verify = await api.encrypt(key, 'stickysites-verify'); // bare string, NOT JSON
    const values = [];
    for (const v of NOTE_VALUES) {
      const plaintext = JSON.stringify(v);
      values.push({ plaintext, envelope: await api.encrypt(key, plaintext) });
    }
    cases.push({ writer, passphrase, salt: b64(salt), jwk, verify, values });
  }
}
const out = path.join(root, 'tests/fixtures/legacy-crypto-envelopes.json');
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), pbkdf2Iterations: 600000, cases }, null, 1) + '\n');
console.log(`wrote ${path.relative(root, out)} (${cases.length} cases)`);
