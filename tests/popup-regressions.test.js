import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runtime } from './helpers/runtime.js';
import { createNoteWriter } from '../src/shared/note-writer.js';
const opened = [];
afterEach(() => { for (const r of opened.splice(0)) r.close(); });
async function until(predicate) { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('popup condition timed out'); }
async function popup(initial = {}, beforeLoad) {
  const r = runtime(initial, readFileSync(new URL('../popup.html', import.meta.url), 'utf8')); opened.push(r);
  const w = r.w;
  Object.assign(w, { AbortController });
  w.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ pairKey: 'fixture-pair-key', staticPeers: [], syncDir: '', changed: [] }) }));
  w.chrome.tabs.query = async () => [{ id: 1, url: 'https://example.test/page' }];
  const writer = createNoteWriter(r.storage);
  w.chrome.runtime.sendMessage = async (message) => {
    if (message.type === 'STICKYSITES_WRITE') {
      try { return { ok: true, result: await writer.dispatch(message.command) }; } catch (error) { return { ok: false, error: error.message }; }
    }
    return {};
  };
  for (const file of ['src/shared/settings.js', 'src/shared/network.js', 'src/content/storage-content.js', 'src/content/safe-html.js', 'src/content/prefs.js', 'src/content/crypto-content.js']) r.load(file);
  const copied = [], downloads = [];
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (text) => copied.push(text) } });
  w.URL.createObjectURL = blob => { downloads.push(blob); return 'blob:fixture'; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = () => {};
  if (beforeLoad) await beforeLoad(r);
  await r.load('popup.js');
  return { ...r, copied, downloads };
}
function button(w, label) { return [...w.document.querySelectorAll('button')].find(node => node.textContent === label); }
async function settings(r) { button(r.w, 'Settings').click(); await until(() => r.w.document.getElementById('popup-settings')); }

it('immediately clears cards and settings on Lock Now and binds controls once after unlock', async () => {
  const r = await popup({ stickysites_global_v1: { body: '<p>Private subject</p><p>Private body</p>' } }, async ({ w }) => {
    await w.StickySites.Crypto.enable('fixture-passphrase');
  });
  expect(r.w.document.querySelectorAll('.note-card')).toHaveLength(1);
  await settings(r);
  const staleBack = button(r.w, 'Back');
  button(r.w, 'Lock Now').click();
  await until(() => r.w.document.getElementById('popup-lock'));
  expect(r.w.document.getElementById('popup-settings')).toBeNull();
  expect(r.w.document.getElementById('notes-list').textContent).toBe('');
  expect(r.w.document.body.textContent).not.toContain('Private subject');
  staleBack.click();
  expect(r.w.document.getElementById('app').style.display).toBe('none');
  button(r.w, 'Save all as .md').click();
  expect(r.downloads).toHaveLength(0);
  r.w.document.querySelector('#popup-lock input').value = 'fixture-passphrase';
  button(r.w, 'Unlock').click();
  await until(() => r.w.document.querySelector('.note-card'));
  button(r.w, 'Recent ▾').click();
  expect(r.w.document.getElementById('sort-btn').textContent).toBe('Oldest ▾');
});

it('restores Unlock controls after rejection and permits a subsequent attempt', async () => {
  const r = await popup({}, ({ w }) => {
    w.StickySites.Crypto.isEnabled = async () => true;
    w.StickySites.Crypto.getCachedKey = async () => null;
    w.StickySites.Crypto.unlock = vi.fn().mockRejectedValueOnce(new Error('fixture operational failure')).mockImplementation(async () => { w.StickySites.Crypto.isEnabled = async () => false; return true; });
  });
  const input = r.w.document.querySelector('#popup-lock input'); input.value = 'fixture';
  button(r.w, 'Unlock').click();
  await until(() => r.w.document.querySelector('.popup-lock-error').textContent);
  expect(button(r.w, 'Unlock').disabled).toBe(false);
  expect(r.w.document.querySelector('.popup-lock-error').textContent).not.toContain('fixture operational failure');
  input.value = 'fixture'; button(r.w, 'Unlock').click();
  await until(() => !r.w.document.getElementById('popup-lock'));
});

it('sends partial preference patches and retains simultaneous note visibility/layout changes', async () => {
  const r = await popup({ stickysites_prefs_v1: { enabledTypes: { todo: false }, activeOutlineId: 'ol_keep' } });
  const write = vi.spyOn(r.w.StickySites.Prefs, 'write');
  await settings(r);
  const global = r.w.document.querySelector('.settings-type-row input');
  global.checked = false; global.dispatchEvent(new r.w.Event('change'));
  button(r.w, 'Horizontal').click();
  await until(() => r.data.stickysites_prefs_v1.clusterLayout === 'horizontal');
  expect(write).toHaveBeenCalledWith({ enabledTypes: { global: false } });
  expect(r.data.stickysites_prefs_v1.enabledTypes).toMatchObject({ todo: false, global: false, page: true });
  expect(r.data.stickysites_prefs_v1.activeOutlineId).toBe('ol_keep');
});

it('preserves rich-text boundaries and exports every todo and nested outline item', async () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: String(i), text: 'Task ' + i, done: i === 1, indent: 0 }));
  const r = await popup({
    stickysites_global_v1: { body: '<div>First paragraph</div><div>Second<br>Third</div>' },
    stickysites_todos_v1: { __global__: { items } },
    stickysites_outlines_v1: { ol_test: { name: 'Test outline', items: [{ text: 'Root', note: 'Node note', children: [{ text: 'Nested child', done: true, children: [] }] }, { text: 'Last root', children: [] }] } },
  });
  const card = r.w.document.querySelector('.note-card');
  expect(card.querySelector('.note-subject').textContent).toBe('First paragraph');
  expect(card.querySelector('.note-preview').textContent).toBe('Second\nThird');
  card.querySelector('.note-action-btn').click();
  await until(() => r.copied.length);
  expect(r.copied[0]).toBe('First paragraph\nSecond\nThird');
  // Capture the actual Blob input without exposing popup internals.
  let markdown = '';
  r.w.Blob = class { constructor(parts) { markdown = parts.join(''); } };
  button(r.w, 'Save all as .md').click();
  expect(markdown).toContain('Second\nThird');
  expect(markdown).toContain('Task 6');
  expect(markdown).toContain('Nested child');
  expect(markdown).toContain('Node note');
  expect(markdown).toContain('- [x] Task 1');
});

it('bounds response-body waits and restores Test connection and Save controls', async () => {
  const r = await popup();
  r.w.StickySites.Settings.networkTimeoutMs = 10;
  await settings(r);
  await until(() => button(r.w, 'Test connection') && !button(r.w, 'Test connection').disabled);
  r.w.fetch = vi.fn(async () => ({ ok: true, json: () => new Promise(() => {}) }));
  button(r.w, 'Test connection').click();
  await until(() => !button(r.w, 'Test connection').disabled);
  expect(r.w.document.querySelector('.settings-test-results').textContent).toContain('NETWORK_TIMEOUT');
  button(r.w, 'Save').click();
  await until(() => !button(r.w, 'Save').disabled);
  expect(r.w.document.getElementById('popup-settings').textContent).toContain('Not saved: NETWORK_TIMEOUT');
});

it('restores encryption setup controls after an operational rejection and blocks duplicate submission', async () => {
  const r = await popup(); await settings(r);
  const enable = vi.spyOn(r.w.StickySites.Crypto, 'enable').mockRejectedValue(new Error('private fixture failure'));
  button(r.w, 'Enable').click(); await until(() => r.w.document.querySelector('.settings-passphrase-form'));
  const form = r.w.document.querySelector('.settings-passphrase-form'); form.querySelectorAll('input').forEach(input => { input.value = 'fixture'; });
  const submit = button(r.w, 'Set Passphrase'); submit.click(); submit.click();
  await until(() => form.querySelector('.popup-lock-error').textContent);
  expect(enable).toHaveBeenCalledTimes(1); expect(submit.disabled).toBe(false); expect(button(r.w, 'Enable').disabled).toBe(false);
  expect(form.textContent).not.toContain('private fixture failure');
});
it('restores Disable after vault conversion fails', async () => {
  const r = await popup({}, async ({w}) => { await w.StickySites.Crypto.enable('fixture'); }); await settings(r);
  vi.spyOn(r.w.StickySites.Crypto, 'disable').mockRejectedValue(new Error('private fixture failure'));
  button(r.w, 'Disable').click(); await until(() => r.w.document.querySelector('.settings-status').textContent.includes('Could not'));
  expect(button(r.w, 'Disable').disabled).toBe(false); expect(r.w.document.body.textContent).not.toContain('private fixture failure');
});
