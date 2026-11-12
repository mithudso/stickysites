import { afterEach, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function put(root, name, body) { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), body); }
function fixture(mode) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ss-vault-import-')); roots.push(root);
  put(root, 'package.json', '{"type":"module"}');
  put(root, 'node_modules/vitest/package.json', '{"type":"module","exports":"./index.js"}');
  put(root, 'node_modules/vitest/index.js', 'export const describe = { skipIf(skipped) { console.log("VAULT_SKIP:" + skipped); return () => {}; } }; export const it = () => {}; export const expect = () => {};');
  mkdirSync(path.join(root, 'tests/fixtures'), { recursive: true });
  mkdirSync(path.join(root, 'src/shared'), { recursive: true });
  copyFileSync(new URL('./crypto-vault-compat.test.js', import.meta.url), path.join(root, 'tests/crypto-vault-compat.test.js'));
  copyFileSync(new URL('./fixtures/legacy-crypto-envelopes.json', import.meta.url), path.join(root, 'tests/fixtures/legacy-crypto-envelopes.json'));
  copyFileSync(new URL('../src/shared/crypto.js', import.meta.url), path.join(root, 'src/shared/crypto.js'));
  if (mode !== 'absent') {
    const exports = mode === 'missing-export' ? {} : { './vault': './vault.js' };
    put(root, 'node_modules/@mithudso/ai-auth-js/package.json', JSON.stringify({ type: 'module', exports }));
    put(root, 'node_modules/@mithudso/ai-auth-js/vault.js', mode === 'throws' ? 'throw new Error("VAULT_INITIALIZATION_BROKEN");' : mode === 'transitive' ? 'import "./absent-transitive.js";' : 'export const deriveKey = () => {};');
  }
  return spawnSync(process.execPath, ['tests/crypto-vault-compat.test.js'], { cwd: root, encoding: 'utf8' });
}
it('skips only a genuinely absent optional private package', () => {
  const result = fixture('absent'); expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain('VAULT_SKIP:true');
});
for (const mode of ['throws', 'missing-export', 'transitive']) {
  it(`fails an installed vault with ${mode}`, () => {
    const result = fixture(mode); expect(result.status).not.toBe(0); expect(result.stdout).not.toContain('VAULT_SKIP:true');
  });
}
