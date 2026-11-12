import { afterEach, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';

import { closePanel, completedDownload, openNoteForScreenshot as openNote, encryptedNoteBuckets, persistedSiteBody, popupReady, restoredNoteContent } from '../scripts/browser-checks.mjs';

function mockPage() {
  const state = { open: true, title: 'Page note — /old', body: 'old body' };
  const expected = { typeId: 'todo', title: 'To-do list', bodySelector: '.stickysites-todo-text', bodyText: 'seeded task' };
  function open() { setTimeout(() => Object.assign(state, { open: true, title: expected.title, body: expected.bodyText }), 1200); }
  const panel = { classList: { contains: () => state.open }, querySelector: selector => selector.includes('title') ? { textContent: state.title } : null, querySelectorAll: () => [{ value: state.body, textContent: state.body }] };
  const document = { querySelector: selector => selector.includes('panel') && state.open ? panel : null, querySelectorAll: () => [{ dataset: { typeId: 'todo' }, click: open }] };
  const evaluate = (fn, args = []) => vm.runInNewContext(`(${fn.toString()})(...args)`, { args, document, window: {} });
  const page = {
    async evaluate(fn, ...args) { return evaluate(fn, args); },
    async click(selector) { if (selector.includes('panel-close')) state.open = false; else open(); },
    async waitForSelector() {},
    waitForFunction(fn, options = {}, ...args) {
      return new Promise((resolve, reject) => {
        const start = Date.now();
        const poll = () => { if (evaluate(fn, args)) resolve(); else if (Date.now() - start >= options.timeout) reject(new Error('synthetic readiness timeout')); else setTimeout(poll, 10); }; poll();
      });
    },
    async screenshot() { return { ...state }; },
  };
  return { page, state, expected };
}
afterEach(() => vi.useRealTimers());
it('closes the real DOM control before waiting for delayed requested identity and body', async () => {
  vi.useFakeTimers();
  const { page, state, expected } = mockPage();
  const closing = closePanel(page);
  await vi.advanceTimersByTimeAsync(400); await closing;
  expect(state.open).toBe(false);
  let captured;
  const capture = openNote(page, 'todo', expected).then(async () => { captured = await page.screenshot(); });
  await vi.advanceTimersByTimeAsync(600);
  expect(captured).toBeUndefined();
  await vi.advanceTimersByTimeAsync(700); await capture;
  expect(captured).toMatchObject({ title: expected.title, body: expected.bodyText });
});

it('rejects encryption coverage with a plaintext populated page bucket', () => {
  const encrypted = { iv: 'fixture-iv', data: 'fixture-ciphertext' };
  const keys = ['stickysites_outlines_v1', 'stickysites_pages_v1'];
  const store = { stickysites_outlines_v1: encrypted, stickysites_pages_v1: { page: { body: 'plaintext' } } };
  expect(encryptedNoteBuckets(store, keys)).toEqual({ ok: false, missing: ['stickysites_pages_v1'] });
  store.stickysites_pages_v1 = encrypted;
  expect(encryptedNoteBuckets(store, keys).ok).toBe(true);
});
it('rejects a dropped site body and verifies restored contents across buckets', () => {
  expect(persistedSiteBody({ stickysites_sites_v1: { localhost: { body: '' } } }, 'localhost', 'SITE-NOTE')).toBe(false);
  const before = { stickysites_sites_v1: { localhost: { body: 'SITE-NOTE' } }, stickysites_outlines_v1: { ol_one: { items: [{ text: 'Keep' }] } } };
  expect(persistedSiteBody(before, 'localhost', 'SITE-NOTE')).toBe(true);
  expect(restoredNoteContent(before, structuredClone(before), Object.keys(before))).toBe(true);
  const after = structuredClone(before); after.stickysites_sites_v1.localhost.body = '';
  expect(restoredNoteContent(before, after, Object.keys(before))).toBe(false);
});
it('times out without capturing if requested seeded content never renders', async () => {
  vi.useFakeTimers();
  const { page, expected } = mockPage();
  let caught;
  const opening = openNote(page, 'todo', { ...expected, bodyText: 'never rendered' }).catch(error => { caught = error; });
  await vi.advanceTimersByTimeAsync(5100); await opening;
  expect(caught.message).toContain('readiness timeout');
});

it('does not capture the right body under the wrong identity', async () => {
  vi.useFakeTimers(); const { page, state, expected } = mockPage(); let captured;
  const opening = openNote(page, 'todo', expected).then(() => { captured = true; });
  setTimeout(() => Object.assign(state, { open: true, title: 'Wrong note', body: expected.bodyText }), 200);
  await vi.advanceTimersByTimeAsync(500); expect(captured).toBeUndefined();
  await vi.advanceTimersByTimeAsync(800); await opening; expect(captured).toBe(true);
});
it('requires all seeded popup cards and all TODO section metadata', () => {
  const cards = [{ textContent: 'Reading list' }];
  const check = () => vm.runInNewContext(`(${popupReady.toString()})(expected)`, { expected: ['Reading list', 'Hydration notes'], document: { querySelectorAll: () => cards } });
  expect(check()).toBe(false); cards.push({ textContent: 'Hydration notes' }); expect(check()).toBe(true);
  const key = 'stickysites_todos_v1', before = { [key]: { __global__: { items: [], sections: [{ id: 's', name: 'Keep' }], tagColors: { work: '#fff' } } } };
  for (const field of ['sections', 'tagColors']) { const after = structuredClone(before); after[key].__global__[field] = field === 'sections' ? [] : {}; expect(restoredNoteContent(before, after, [key])).toBe(false); }
});
it('awaits delayed download completion and removes every listener', async () => {
  vi.useFakeTimers(); const session = new EventEmitter();
  let result; const pending = completedDownload(session, () => { session.emit('Browser.downloadWillBegin', { guid: 'owned', suggestedFilename: 'outline.md' }); }).then(name => { result = name; });
  await vi.advanceTimersByTimeAsync(1500); expect(result).toBeUndefined();
  session.emit('Browser.downloadProgress', { guid: 'owned', state: 'completed' }); await pending;
  expect(result).toBe('owned'); expect(session.eventNames()).toEqual([]);
});
it('bounds never-completed downloads and rejects cancellation', async () => {
  vi.useFakeTimers();
  for (const cancel of [false, true]) {
    const session = new EventEmitter(); let caught;
    const pending = completedDownload(session, () => { session.emit('Browser.downloadWillBegin', { guid: 'owned', suggestedFilename: 'outline.md' }); if (cancel) session.emit('Browser.downloadProgress', { guid: 'owned', state: 'canceled' }); }, 100).catch(error => { caught = error; });
    await vi.advanceTimersByTimeAsync(101); await pending;
    expect(caught.message).toMatch(cancel ? /canceled/ : /timeout/); expect(session.eventNames()).toEqual([]);
  }
});
