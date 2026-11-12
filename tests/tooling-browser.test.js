import { afterEach, expect, it, vi } from 'vitest';
import vm from 'node:vm';

import { closePanel, openNoteForScreenshot as openNote, encryptedNoteBuckets, persistedSiteBody, restoredNoteContent } from '../scripts/browser-checks.mjs';

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
