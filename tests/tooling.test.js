import { afterEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = [];
function fixture(script) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ss-tooling-test-'));
  fixtures.push(root);
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(path.join(repo, 'scripts', script), path.join(root, 'scripts', script));
  if (script === 'check-syntax.mjs') symlinkSync(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  return root;
}
function put(root, file, text = '') {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}
function run(root, script, args = []) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', script), ...args], { encoding: 'utf8', timeout: 10000 });
}
afterEach(() => { for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('store package isolation', () => {
  it('keeps ordinary runtime assets and excludes hidden files and symlinks', () => {
    const root = fixture('build-store-zip.mjs');
    put(root, 'manifest.json', '{"version":"1.0.0"}');
    put(root, 'package.json', '{"version":"1.0.0"}');
    for (const file of ['popup.html', 'popup.js', 'popup.css', 'popout.html', 'popout.js', 'popout.css', 'src/main.js', 'icons/icon16.png']) put(root, file);
    put(root, 'src/.env', 'fixture secret');
    put(root, 'icons/.private/token.json', '{}');
    put(root, 'outside.js', 'throw new Error("outside")');
    symlinkSync('../outside.js', path.join(root, 'src', 'link.js'));
    const result = run(root, 'build-store-zip.mjs');
    expect(result.status, result.stderr).toBe(0);
    const listing = execFileSync('unzip', ['-Z1', path.join(root, 'dist/stickysites-1.0.0.zip')], { encoding: 'utf8' });
    expect(listing).toContain('src/main.js');
    expect(listing).toContain('icons/icon16.png');
    expect(listing).not.toMatch(/\.env|\.private|link\.js|outside/);
  });
});

describe('documentation path gate', () => {
  function docsFixture() {
    const root = fixture('check-doc-indexes.mjs');
    put(root, 'docs/high_signal_file_index.json', '[]');
    put(root, 'docs/wiki/index.md', '# Wiki');
    return root;
  }
  it('names a missing required llms.txt', () => {
    const result = run(docsFixture(), 'check-doc-indexes.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Missing llms\.txt/);
  });
  it('requires the wiki index and resolves wiki links relative to that index', () => {
    const root = docsFixture();
    put(root, 'llms.txt', '[wiki](docs/wiki/index.md)');
    put(root, 'docs/wiki/index.md', '[guide](../guide.md)');
    put(root, 'docs/guide.md', '# Guide');
    expect(run(root, 'check-doc-indexes.mjs').status).toBe(0);
    rmSync(path.join(root, 'docs/wiki/index.md'));
    const result = run(root, 'check-doc-indexes.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/wiki/index.md');
  });
  it('rejects paths escaping the repository even if a target exists', () => {
    const root = docsFixture();
    const external = mkdtempSync(path.join(os.tmpdir(), 'ss-existing-outside-')); fixtures.push(external);
    put(external, 'outside.md', '# Existing external target');
    put(root, 'llms.txt', `[outside](${path.relative(root, path.join(external, 'outside.md'))})`);
    const result = run(root, 'check-doc-indexes.mjs');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/unsafe|outside|escape/i);
  });
});

it('syntax traversal skips directory cycles and external file symlinks', () => {
  const root = fixture('check-syntax.mjs');
  put(root, 'manifest.json', '{"version":"1.0.0"}');
  put(root, 'package.json', '{"version":"1.0.0"}');
  put(root, 'valid.js', 'const valid = true;');
  const external = mkdtempSync(path.join(os.tmpdir(), 'ss-existing-outside-')); fixtures.push(external);
  put(external, 'broken.js', 'const =;');
  symlinkSync(root, path.join(root, 'cycle'));
  symlinkSync(path.join(external, 'broken.js'), path.join(root, 'linked.js'));
  const result = run(root, 'check-syntax.mjs');
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('2 JavaScript files parse');
});

it('keeps the complete newest workflow section including fenced headings', () => {
  const root = fixture('rotate-workflow-logs.mjs');
  mkdirSync(path.join(root, '.git'));
  const newest = '## Newest\n```md\n## Fenced example\n' + 'x'.repeat(100) + '\n```\n~~~md\n## Tilde example\n~~~\n';
  put(root, 'memory.md', '# Log\n' + newest + '\n## Old\n' + 'y'.repeat(100) + '\n');
  const result = run(root, 'rotate-workflow-logs.mjs', ['--threshold=80']);
  expect(result.status, result.stderr).toBe(0);
  expect(readFileSync(path.join(root, 'memory.md'), 'utf8')).toContain(newest);
  expect(readFileSync(path.join(root, 'docs/archive/memory.md'), 'utf8')).not.toContain('Fenced example');
});

describe('workflow rotation transaction', () => {
  async function setup() {
    const root = fixture('rotate-workflow-logs.mjs');
    mkdirSync(path.join(root, '.git'));
    put(root, 'memory.md', '# Log\n\n## New\n' + 'n'.repeat(80) + '\n\n## Middle\n' + 'm'.repeat(80) + '\n\n## Old\n' + 'o'.repeat(80) + '\n');
    const { rotateLogs } = await import('../scripts/rotate-workflow-logs.mjs');
    return { root, rotateLogs };
  }
  for (const phase of ['afterArchive', 'afterLive']) {
    it(`recovers interruption ${phase} without duplicated or lost sections`, async () => {
      const { root, rotateLogs } = await setup();
      expect(() => rotateLogs({ repoRoot: root, threshold: 100, hooks: { [phase]: () => { throw new Error('synthetic interruption'); } } })).toThrow('synthetic interruption');
      rotateLogs({ repoRoot: root, threshold: 100 });
      const combined = readFileSync(path.join(root, 'memory.md'), 'utf8') + readFileSync(path.join(root, 'docs/archive/memory.md'), 'utf8');
      for (const heading of ['New', 'Middle', 'Old']) expect(combined.match(new RegExp(`^## ${heading}$`, 'gm'))).toHaveLength(1);
      expect(readFileSync(path.join(root, 'memory.md'), 'utf8')).toContain('n'.repeat(80));
    });
  }
  it('serializes competing rotators and refuses to clear an active lock', async () => {
    const { root, rotateLogs } = await setup();
    let competitor;
    rotateLogs({ repoRoot: root, threshold: 100, hooks: { afterPrepare: () => {
      competitor = run(root, 'rotate-workflow-logs.mjs', ['--threshold=100', '--recover']);
    } } });
    expect(competitor.status).toBe(1);
    expect(competitor.stderr).toContain('still active');
    const archive = readFileSync(path.join(root, 'docs/archive/memory.md'), 'utf8');
    expect(archive.match(/^## Old$/gm)).toHaveLength(1);
  });
  it('preserves an external edit and its unresolved journal', async () => {
    const { root, rotateLogs } = await setup();
    const edited = '# External edit\n## New\nKeep me\n';
    expect(() => rotateLogs({ repoRoot: root, threshold: 100, hooks: { afterPrepare: () => put(root, 'memory.md', edited) } })).toThrow('changed since rotation snapshot');
    expect(readFileSync(path.join(root, 'memory.md'), 'utf8')).toBe(edited);
    expect(() => rotateLogs({ repoRoot: root, threshold: 100 })).toThrow('changed since rotation snapshot');
    expect(readFileSync(path.join(root, '.git/stickysites-workflow-rotation/memory.md.journal.json'), 'utf8')).toContain('liveBefore');
  });
});

it('recovers an actual process interruption only after explicit dead-owner recovery', () => {
  const root = fixture('rotate-workflow-logs.mjs');
  mkdirSync(path.join(root, '.git'));
  put(root, 'memory.md', '# Log\n## New\n' + 'n'.repeat(80) + '\n## Old\n' + 'o'.repeat(80) + '\n');
  const interrupted = spawnSync(process.execPath, ['--input-type=module', '-e', `import { rotateLogs } from './scripts/rotate-workflow-logs.mjs'; rotateLogs({repoRoot: process.cwd(), threshold: 100, hooks: { afterArchive() { process.exit(23); } }});`], { cwd: root, encoding: 'utf8', timeout: 5000 });
  expect(interrupted.error).toBeUndefined(); expect(interrupted.signal).toBeNull();
  expect(interrupted.status).toBe(23);
  expect(run(root, 'rotate-workflow-logs.mjs', ['--threshold=100']).status).toBe(1);
  const resumed = run(root, 'rotate-workflow-logs.mjs', ['--threshold=100', '--recover']);
  expect(resumed.status, resumed.stderr).toBe(0);
  const combined = readFileSync(path.join(root, 'memory.md'), 'utf8') + readFileSync(path.join(root, 'docs/archive/memory.md'), 'utf8');
  expect(combined.match(/^## Old$/gm)).toHaveLength(1);
  expect(combined.match(/^## New$/gm)).toHaveLength(1);
});

it('refuses uncertain lock ownership and preserves the lock', () => {
  const root = fixture('rotate-workflow-logs.mjs');
  const lock = '.git/stickysites-workflow-rotation/rotation.lock';
  const body = JSON.stringify({ pid: 1, host: 'another-host', token: 'fixture' });
  put(root, lock, body);
  const result = run(root, 'rotate-workflow-logs.mjs', ['--recover']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('ownership is uncertain');
  expect(readFileSync(path.join(root, lock), 'utf8')).toBe(body);
});

it('validates reference-style links while ignoring fenced and inline code examples', () => {
  const root = fixture('check-doc-indexes.mjs');
  put(root, 'docs/high_signal_file_index.json', '[]');
  put(root, 'docs/wiki/index.md', '# Wiki');
  put(root, 'llms.txt', '[guide][missing]\n[missing]: absent.md\n\n```md\n[example](code-only-missing.md)\n```\n`[inline](also-code.md)`\n');
  const missing = run(root, 'check-doc-indexes.mjs');
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('absent.md');
  put(root, 'absent.md', '# Present');
  expect(run(root, 'check-doc-indexes.mjs').status).toBe(0);
  put(root, 'llms.txt', '[missing][] and [missing]\n[missing]: absent.md\n[external]: https://example.test/\n[external]\n');
  expect(run(root, 'check-doc-indexes.mjs').status).toBe(0);
  rmSync(path.join(root, 'absent.md'));
  expect(run(root, 'check-doc-indexes.mjs').status).toBe(1);
});

it('checks manifest and HTML classic entry points as Script while preserving ES modules', () => {
  const root = fixture('check-syntax.mjs');
  put(root, 'package.json', '{"version":"1.0.0"}');
  put(root, 'manifest.json', JSON.stringify({ version: '1.0.0', content_scripts: [{ js: ['content.js'] }], background: { service_worker: 'worker.js', type: 'module' } }));
  put(root, 'content.js', 'export {};');
  put(root, 'worker.js', 'export const moduleEntry = true;');
  put(root, 'future-page.html', '<script src="shared-classic.js"></script><script type="module" src="worker.js"></script>');
  put(root, 'shared-classic.js', 'export {};');
  const invalid = run(root, 'check-syntax.mjs');
  expect(invalid.status).toBe(1);
  expect(invalid.stderr).toContain('content.js');
  expect(invalid.stderr).toContain('shared-classic.js');
  put(root, 'content.js', 'globalThis.fixture = true;');
  put(root, 'shared-classic.js', '(function () {})();');
  expect(run(root, 'check-syntax.mjs').status).toBe(0);
});

it('serializes simultaneous dead-owner recovery before either process can replace the lock', async () => {
  const root = fixture('rotate-workflow-logs.mjs');
  put(root, 'memory.md', '# Log\n## New\n' + 'n'.repeat(80) + '\n## Old\n' + 'o'.repeat(80) + '\n');
  const dead = spawnSync(process.execPath, ['-e', ''], { timeout: 1000 });
  put(root, '.git/stickysites-workflow-rotation/rotation.lock', JSON.stringify({ pid: dead.pid, host: os.hostname(), token: 'dead-owner' }));
  const runner = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const id = process.argv[2];
    function pause(phase) {
      process.send({ id, phase });
      const deadline = Date.now() + 4000;
      while (!fs.existsSync(phase + '-' + id + '.go')) {
        if (Date.now() > deadline) throw new Error('fixture coordination timeout: ' + phase);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    }
    const remove = fs.rmSync;
    let intercepted = false, entered = false;
    fs.rmSync = function(file, ...args) {
      if (!intercepted && String(file).endsWith('/rotation.lock')) { intercepted = true; pause('before-delete'); }
      return remove(file, ...args);
    };
    syncBuiltinESMExports();
    const { rotateLogs } = await import('./scripts/rotate-workflow-logs.mjs');
    function transaction() { if (!entered) { entered = true; pause('entered'); } }
    try { rotateLogs({ repoRoot: process.cwd(), threshold: 100, recover: true, hooks: { afterPrepare: transaction, afterArchive: transaction } }); }
    catch (error) { process.send({ id, phase: 'refused', error: error.message }); process.exitCode = 1; }
  `;
  put(root, 'runner.mjs', runner);
  const messages = [], children = [];
  function child(id) {
    const process = spawn(globalThis.process.execPath, ['runner.mjs', id], { cwd: root, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    process.on('message', message => messages.push(message));
    process.on('exit', code => messages.push({ id, phase: 'exit', code }));
    children.push(process); return process;
  }
  async function until(predicate) {
    const deadline = Date.now() + 4500;
    while (!predicate()) { if (Date.now() > deadline) throw new Error('fixture event timeout: ' + JSON.stringify(messages)); await new Promise(resolve => setTimeout(resolve, 5)); }
  }
  const has = (id, phase) => messages.some(message => message.id === id && message.phase === phase);
  try {
    child('A'); await until(() => has('A', 'before-delete'));
    child('B'); await until(() => has('B', 'before-delete') || has('B', 'exit'));
    put(root, 'before-delete-A.go'); await until(() => has('A', 'entered'));
    if (has('B', 'before-delete')) { put(root, 'before-delete-B.go'); await until(() => has('B', 'entered') || has('B', 'exit')); }
    const owners = new Set(messages.filter(message => message.phase === 'entered').map(message => message.id));
    put(root, 'entered-A.go'); put(root, 'entered-B.go');
    await until(() => has('A', 'exit') && has('B', 'exit'));
    expect([...owners]).toEqual(['A']);
    expect(messages).toContainEqual(expect.objectContaining({ id: 'B', phase: 'refused', error: expect.stringMatching(/acquisition\.guard|still active/) }));
    expect(messages).toContainEqual({ id: 'B', phase: 'exit', code: 1 });
    const combined = readFileSync(path.join(root, 'memory.md'), 'utf8') + readFileSync(path.join(root, 'docs/archive/memory.md'), 'utf8');
    expect(combined.match(/^## New$/gm)).toHaveLength(1);
    expect(combined.match(/^## Old$/gm)).toHaveLength(1);
  } finally {
    await Promise.all(children.map(process => new Promise(resolve => {
      if (process.exitCode !== null || process.signalCode !== null) return resolve();
      process.once('close', resolve); process.kill('SIGKILL');
    })));
  }
}, 10000);
it('preserves a stale acquisition guard instead of force-recovering it', () => {
  const root = fixture('rotate-workflow-logs.mjs');
  const file = '.git/stickysites-workflow-rotation/acquisition.guard';
  put(root, file, 'uncertain guard owner');
  const result = run(root, 'rotate-workflow-logs.mjs', ['--recover']);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('manual review');
  expect(readFileSync(path.join(root, file), 'utf8')).toBe('uncertain guard owner');
});

it('refuses missing or symlinked manifest runtime assets before producing a ZIP', () => {
  for (const invalid of ['script', 'icon']) {
    const root = fixture('build-store-zip.mjs');
    put(root, 'manifest.json', JSON.stringify({ version: '1.0.0', content_scripts: [{ js: ['src/required.js'] }], icons: { 16: 'icons/required.png' } }));
    put(root, 'package.json', '{"version":"1.0.0"}');
    for (const file of ['popup.html', 'popup.js', 'popup.css', 'popout.html', 'popout.js', 'popout.css', 'src/main.js', 'icons/icon16.png']) put(root, file);
    if (invalid === 'script') put(root, 'icons/required.png');
    else { put(root, 'src/required.js'); put(root, 'outside.png'); symlinkSync('../outside.png', path.join(root, 'icons/required.png')); }
    const result = run(root, 'build-store-zip.mjs');
    expect(result.status).toBe(1); expect(result.stderr).toContain('Manifest runtime asset');
    expect(spawnSync('unzip', ['-Z1', path.join(root, 'dist/stickysites-1.0.0.zip')]).status).not.toBe(0);
  }
});

it('checks balanced destinations and indented list continuation links', () => {
  const root = fixture('check-doc-indexes.mjs');
  put(root, 'docs/high_signal_file_index.json', '[]'); put(root, 'docs/wiki/index.md', '# Wiki');
  put(root, 'docs/a(b).md', '# Present'); put(root, 'llms.txt', '[valid](docs/a(b).md)\n\n- Guide\n\n    [missing](absent.md)');
  const invalid = run(root, 'check-doc-indexes.mjs');
  expect(invalid.status).toBe(1); expect(invalid.stderr).toContain('absent.md'); expect(invalid.stderr).not.toContain('docs/a(b');
  put(root, 'absent.md', '# Present'); expect(run(root, 'check-doc-indexes.mjs').status).toBe(0);
});

for (const [name, html, expected] of [
  ['comment markers in script strings', '<script>const marker="<!--";const broken=;</script><script>const end="-->";</script>', 1],
  ['quoted greater-than attribute', '<script data-label="a>b">const valid=1;</script>', 0],
  ['inert textarea script text', '<textarea><script>const broken=;</script></textarea>', 0],
  ['classic ECMAScript MIME', '<script type="text/ecmascript">const broken=;</script>', 1],
]) {
  it(`uses HTML parsing for ${name}`, () => {
    const root = fixture('check-syntax.mjs'); put(root, 'manifest.json', '{"version":"1"}'); put(root, 'package.json', '{"version":"1"}'); put(root, 'popup.html', html);
    const result = run(root, 'check-syntax.mjs'); expect(result.status, result.stderr).toBe(expected);
  });
}

it('retains live sections and the journal when an editor replaces the archive before commit', async () => {
  const root = fixture('rotate-workflow-logs.mjs'); mkdirSync(path.join(root, '.git'));
  const original = '# Log\n## New\n' + 'n'.repeat(80) + '\n## Old\n' + 'o'.repeat(80) + '\n'; put(root, 'memory.md', original);
  const { rotateLogs } = await import('../scripts/rotate-workflow-logs.mjs');
  expect(() => rotateLogs({ repoRoot: root, threshold: 100, hooks: { afterArchive() { put(root, 'docs/archive/memory.md', '# External edit\n'); } } })).toThrow('archive changed');
  expect(readFileSync(path.join(root, 'memory.md'), 'utf8')).toBe(original);
  expect(readFileSync(path.join(root, '.git/stickysites-workflow-rotation/memory.md.journal.json'), 'utf8')).toContain('liveBefore');
});
