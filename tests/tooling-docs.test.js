import { afterEach, expect, it } from 'vitest';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = [];
const gitEnvironments = new Map();
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function put(root, file, body) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), body);
}
function fixture(ambient = process.env) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ss-docs-test-')); roots.push(root);
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(path.join(repo, 'scripts/generate-docs.mjs'), path.join(root, 'scripts/generate-docs.mjs'));
  const gitState = mkdtempSync(path.join(os.tmpdir(), 'ss-docs-git-state-')); roots.push(gitState);
  const template = path.join(gitState, 'empty-template'); mkdirSync(template);
  const globalConfig = path.join(gitState, 'empty-global'); writeFileSync(globalConfig, '');
  const env = Object.fromEntries(Object.entries(ambient).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig, GIT_TERMINAL_PROMPT: '0' });
  gitEnvironments.set(root, env);
  execFileSync('git', ['init', '-q', '--template=' + template], { cwd: root, env, timeout: 10000 });
  const configured = spawnSync('git', ['config', '--path', '--get', 'core.hooksPath'], { cwd: root, env, encoding: 'utf8', timeout: 10000 });
  if (configured.status !== 1) throw new Error('Fixture unexpectedly configured core.hooksPath.');
  const hooks = path.join(root, '.git/hooks');
  if (existsSync(hooks) && readdirSync(hooks).length) throw new Error('Fixture hooks inventory is not empty.');
  put(root, '.gitignore', 'ignored/\n');
  put(root, 'manifest.json', JSON.stringify({ version: '1.0.0', manifest_version: 3, permissions: ['storage'], content_scripts: [{ js: ['src/known.js'] }], background: { service_worker: 'src/sw.js', type: 'module' } }));
  put(root, 'package.json', JSON.stringify({ version: '1.0.0', scripts: { test: 'vitest run' } }));
  put(root, 'README.md', '# Project\n\nA maintained public guide.\n\n' + 'Full source content.\n'.repeat(250));
  put(root, 'docs/wiki/index.md', '# Wiki\n\nA guide index.\n');
  put(root, 'docs/high_signal_file_index.json', JSON.stringify([{ path: 'src/known.js', purpose: 'Known maintained behavior.', layer: 'shared', exports: ['known'], depends_on: [], patterns: ['pure'] }]));
  put(root, 'src/known.js', 'export const known = 42;\n');
  put(root, 'src/sw.js', 'export const worker = true;\n');
  put(root, 'memory.md', 'PRIVATE_WORKFLOW_SENTINEL');
  put(root, 'prompts.md', 'PRIVATE_PROMPT_SENTINEL');
  put(root, '.codex/config.toml', 'PRIVATE_CONFIG_SENTINEL');
  put(root, '.mcp.json', 'PRIVATE_MCP_SENTINEL');
  put(root, 'docs/archive/memory.md', 'PRIVATE_ARCHIVE_SENTINEL');
  put(root, 'ignored/private.md', 'IGNORED_SENTINEL');
  put(root, 'tests/fixtures/legacy-crypto-envelopes.json', '{}');
  put(root, 'docs/superpowers/plans/old.md', '# Old plan');
  for (let i = 0; i < 140; i++) put(root, `src/file-${i}.js`, `export const value${i} = ${i};\n`);
  return root;
}
function run(root, ...args) { return spawnSync(process.execPath, ['scripts/generate-docs.mjs', ...args], { cwd: root, env: gitEnvironments.get(root), encoding: 'utf8', timeout: 10000 }); }
it('generates complete deterministic indexes and full public docs without private bodies', () => {
  const root = fixture();
  const first = run(root); expect(first.status, first.stderr).toBe(0);
  const files = ['docs/high_signal_file_index.json', 'docs/codebase-overview.md', 'llms.txt', 'llms-full.txt', 'llms-small.txt', 'llms-facts.txt'];
  const initial = files.map((file) => readFileSync(path.join(root, file), 'utf8'));
  const index = JSON.parse(initial[0]);
  expect(index.filter((entry) => entry.path.startsWith('src/'))).toHaveLength(142);
  expect(index.find((entry) => entry.path === 'src/known.js')).toMatchObject({ purpose: 'Known maintained behavior.', exports: ['known'], patterns: ['pure'] });
  expect(index.find((entry) => entry.path.includes('legacy-crypto'))).toMatchObject({ classification: 'frozen fixture' });
  expect(index.find((entry) => entry.path.includes('plans/old'))).toMatchObject({ classification: 'historical plan' });
  expect(index.some((entry) => entry.path.startsWith('ignored/'))).toBe(false);
  expect(initial[3]).toContain('Full source content.\n'.repeat(250));
  expect(initial.join('\n')).not.toMatch(/PRIVATE_.*_SENTINEL|IGNORED_SENTINEL/);
  const second = run(root); expect(second.status, second.stderr).toBe(0);
  expect(files.map((file) => readFileSync(path.join(root, file), 'utf8'))).toEqual(initial);
  expect(run(root, '--check').status).toBe(0);
  put(root, 'docs/new-report.md', '# New report\n\nRecorded task results.\n');
  const drift = run(root, '--check'); expect(drift.status).toBe(1); expect(drift.stderr).toMatch(/drift|stale/i);
  expect(run(root).status).toBe(0);
  expect(readFileSync(path.join(root, 'llms.txt'), 'utf8')).toContain('docs/new-report.md');
});
it('refuses generated-output symlinks without overwriting their targets', () => {
  const root = fixture();
  const target = path.join(root, 'README.md');
  symlinkSync(target, path.join(root, 'llms-full.txt')); 
  const original = readFileSync(target, 'utf8');
  const result = run(root);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('output symlink');
  expect(readFileSync(target, 'utf8')).toBe(original);
});
for (const config of ['manifest.json', 'package.json']) {
  it(`refuses external symlinked ${config} before reading or emitting its fields`, () => {
    const root = fixture();
    const external = mkdtempSync(path.join(os.tmpdir(), 'ss-external-config-')); roots.push(external);
    const source = path.join(external, 'external.json');
    writeFileSync(source, JSON.stringify({ version: 'EXTERNAL_CONFIG_SENTINEL', scripts: { private: 'EXTERNAL_CONFIG_SENTINEL' } }));
    rmSync(path.join(root, config)); symlinkSync(source, path.join(root, config));
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(config);
    for (const file of ['docs/high_signal_file_index.json', 'docs/codebase-overview.md', 'llms.txt', 'llms-full.txt', 'llms-small.txt', 'llms-facts.txt']) {
      try { expect(readFileSync(path.join(root, file), 'utf8')).not.toContain('EXTERNAL_CONFIG_SENTINEL'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  });
}
it('indexes dated maintenance audits but excludes their bodies from guide concatenation', () => {
  const root = fixture();
  for (const file of ['docs/code-deep-optimizer-report-2026-11-12.md', 'docs/maintenance-ledger-2026-11-12.md']) put(root, file, '# Audit record\n\nAUDIT_BODY_SENTINEL\n');
  const result = run(root); expect(result.status, result.stderr).toBe(0);
  const index = JSON.parse(readFileSync(path.join(root, 'docs/high_signal_file_index.json'), 'utf8'));
  expect(index.find(entry => entry.path.includes('maintenance-ledger')).classification).toBe('audit record');
  expect(index.find(entry => entry.path.includes('code-deep-optimizer-report')).classification).toBe('audit record');
  expect(readFileSync(path.join(root, 'llms-full.txt'), 'utf8')).not.toContain('AUDIT_BODY_SENTINEL');
});

it('isolates fixture commits from hostile inherited Git globals and templates', () => {
  const hostile = mkdtempSync(path.join(os.tmpdir(), 'ss-hostile-git-')); roots.push(hostile);
  const sentinel = path.join(hostile, 'hook-ran');
  put(hostile, 'template/hooks/post-commit', '#!/bin/sh\nprintf fired > "' + sentinel + '"\n');
  chmodSync(path.join(hostile, 'template/hooks/post-commit'), 0o755);
  put(hostile, 'global', '[core]\n hooksPath = ' + path.join(hostile, 'template/hooks') + '\n');
  const root = fixture({ ...process.env, GIT_CONFIG_GLOBAL: path.join(hostile, 'global'), GIT_TEMPLATE_DIR: path.join(hostile, 'template'), GIT_DIR: path.join(hostile, 'selected.git'), GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: path.join(hostile, 'template/hooks') });
  const env = gitEnvironments.get(root);
  execFileSync('git', ['add', 'README.md'], { cwd: root, env, timeout: 10000 });
  // fixture() verifies the effective hook path and empty hook inventory first.
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic fixture'], { cwd: root, env, timeout: 10000 });
  expect(existsSync(sentinel)).toBe(false);
  expect(run(root).status).toBe(0);
});
