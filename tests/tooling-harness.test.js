import { afterEach, expect, it } from 'vitest';
import { accessSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function temp() { const root = mkdtempSync(path.join(os.tmpdir(), 'ss-harness-test-')); roots.push(root); return root; }
for (const failure of ['launch', 'step', 'fallback', null]) {
  it(`cleans owned resources after ${failure ?? 'success'} without deleting existing state`, async () => {
    const { withHarnessResources } = await import('../scripts/harness-resources.mjs');
    const root = temp();
    const existing = path.join(root, 'existing');
    mkdirSync(existing);
    const profiles = [], closed = [];
    const action = withHarnessResources(async (resources) => {
      profiles.push(resources.tempDir('profile-'));
      resources.ownServer({ close(callback) { closed.push('server'); callback(); } });
      if (failure === 'launch') throw new Error('synthetic launch failure');
      const first = resources.ownBrowser({ async close() { closed.push('first browser'); } });
      if (failure === 'fallback') {
        await resources.closeBrowser(first);
        profiles.push(resources.tempDir('profile-'));
        resources.ownBrowser({ async close() { closed.push('second browser'); } });
      }
      if (failure) throw new Error(`synthetic ${failure} failure`);
      return 42;
    }, { tempRoot: root });
    if (failure) await expect(action).rejects.toThrow(`synthetic ${failure} failure`);
    else expect(await action).toBe(42);
    expect(closed).toContain('server');
    if (failure !== 'launch') expect(closed.filter((name) => name === 'first browser')).toHaveLength(1);
    if (failure === 'fallback') expect(closed).toContain('second browser');
    for (const profile of profiles) expect(existsSync(profile)).toBe(false);
    expect(() => accessSync(existing)).not.toThrow();
  });
}
it('discovers available testing Chrome under the current home and names a bad override', async () => {
  const { resolveChrome } = await import('../scripts/harness-resources.mjs');
  const home = temp();
  for (const version of ['mac_arm-100', 'mac_arm-200']) {
    const executable = path.join(home, '.cache/puppeteer/chrome', version, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(executable, 'fixture'); chmodSync(executable, 0o755);
  }
  expect(resolveChrome({ env: {}, home, platform: 'darwin' })).toContain('mac_arm-200');
  expect(() => resolveChrome({ env: { SS_CHROME: path.join(home, 'absent') }, home })).toThrow(/SS_CHROME/);
});
it('preserves the original failure and closes the server if browser cleanup also fails', async () => {
  const { withHarnessResources } = await import('../scripts/harness-resources.mjs');
  const root = temp();
  let serverClosed = false, profile;
  let caught;
  try {
    await withHarnessResources(async (resources) => {
      profile = resources.tempDir('profile-');
      resources.ownBrowser({ async close() { throw new Error('synthetic close failure'); } });
      resources.ownServer({ close(callback) { serverClosed = true; callback(); } });
      throw new Error('original step failure');
    }, { tempRoot: root });
  } catch (error) { caught = error; }
  expect(caught.message).toBe('original step failure');
  expect(caught.cleanupErrors[0].message).toBe('synthetic close failure');
  expect(serverClosed).toBe(true);
  expect(existsSync(profile)).toBe(true); // Never delete a profile an unclosed browser may still own.
});

for (const stalled of ['browser', 'server']) {
  it(`bounds a stalled ${stalled} close, continues cleanup, and preserves the original failure`, async () => {
    const { vi } = await import('vitest');
    const { withHarnessResources } = await import('../scripts/harness-resources.mjs');
    vi.useFakeTimers();
    try {
      const root = temp();
      let profile, otherClosed = false, caught;
      const action = withHarnessResources(async resources => {
        profile = resources.tempDir('profile-');
        resources.ownBrowser({ close: stalled === 'browser' ? () => new Promise(() => {}) : async () => { otherClosed = true; } });
        resources.ownServer({ close(callback) { if (stalled === 'browser') { otherClosed = true; callback(); } } });
        throw new Error('original action failure');
      }, { tempRoot: root, closeTimeoutMs: 25 }).catch(error => { caught = error; });
      await vi.advanceTimersByTimeAsync(100);
      expect(caught?.message).toBe('original action failure');
      expect(caught.cleanupErrors.some(error => /timeout/i.test(error.message))).toBe(true);
      expect(otherClosed).toBe(true);
      expect(existsSync(profile)).toBe(stalled === 'browser');
      await action;
    } finally { vi.useRealTimers(); }
  });
}
