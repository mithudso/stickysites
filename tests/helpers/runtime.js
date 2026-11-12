import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
export function runtime(initial = {}, html = '', options = {}) {
  const dom = new JSDOM(html || '<!doctype html><body></body>', { url: options.url || 'https://example.test/page', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: options.crypto || webcrypto });
  Object.assign(w, { TextEncoder, TextDecoder, structuredClone });
  w.Range.prototype.getBoundingClientRect = () => ({ bottom: 0, left: 0 });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const data = structuredClone(initial), listeners = [], observerErrors = [];
  function notify(changes) {
    for (const listener of listeners) {
      try { listener(structuredClone(changes), 'local'); }
      catch (error) { observerErrors.push(error); }
    }
  }
  const storage = {
    async get(keys) { keys = keys == null ? Object.keys(data) : typeof keys === 'string' ? [keys] : keys; return structuredClone(Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))); },
    async set(updates) { const changes = {}; for (const [k, v] of Object.entries(updates)) { changes[k] = { oldValue: structuredClone(data[k]), newValue: structuredClone(v) }; data[k] = structuredClone(v); } notify(changes); },
    async remove(keys) { const changes = {}; for (const k of [].concat(keys)) { changes[k] = { oldValue: structuredClone(data[k]) }; delete data[k]; } notify(changes); }
  };
  w.chrome = { storage: { local: storage, onChanged: { addListener: fn => listeners.push(fn) } }, runtime: { sendMessage: async () => { throw Error('NO_WRITER'); }, onMessage: { addListener() {} } }, tabs: { query: async () => [] } };
  const load = path => w.eval(readFileSync(new URL('../../' + path, import.meta.url), 'utf8'));
  return { w, data, storage, load, observerErrors, close() { dom.window.close(); if (observerErrors.length) throw new AggregateError(observerErrors, 'Synthetic storage observers failed'); } };
}
