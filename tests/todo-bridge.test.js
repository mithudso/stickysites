import { describe, it, expect } from 'vitest';
import { applyHostResult, buildRequest, isEncryptedValue, syncTodosWithHost, TODOS_KEY, TODO_HOST } from '../src/shared/todo-bridge.js';

const rec = (items, sections = []) => ({ key: '__global__', items, sections, tagColors: {} });

describe('buildRequest', () => {
  it('sends ids, text, done, note, section and section names', () => {
    const req = buildRequest(rec([{ id: 'a', text: 'A', done: true, priority: 3, section: 's1' }],
      [{ id: 's1', name: 'Groceries', collapsed: false }]), 'ext1');
    expect(req).toEqual({
      cmd: 'sync', ext: 'ext1',
      items: [{ id: 'a', text: 'A', done: true, note: '', section: 's1' }],
      sections: [{ id: 's1', name: 'Groceries' }]
    });
  });

  it('coerces section id and name to strings', () => {
    const req = buildRequest(rec([], [{ id: 7, name: undefined, collapsed: false }]), 'ext1');
    expect(req.sections).toEqual([{ id: '7', name: '' }]);
  });
});

describe('applyHostResult', () => {
  it('keeps browser-only fields and adopts host text/done', () => {
    const r = rec([{ id: 'a', text: 'old', done: false, priority: 2, tags: ['x'], color: '#f00', indent: 1, note: '', section: '', completedAt: '' }]);
    const { items, changed } = applyHostResult(r, [{ id: 'a', text: 'new', done: true, note: 'meta', section: '' }]);
    expect(changed).toBe(true);
    expect(items[0]).toMatchObject({ id: 'a', text: 'new', done: true, priority: 2, tags: ['x'], color: '#f00', indent: 1, note: 'meta' });
    expect(items[0].completedAt).not.toBe('');
  });

  it('creates host sections by name and removes empty host sections', () => {
    const r = rec([], [{ id: 'old', name: 'Sessions · gone', collapsed: true }, { id: 'u', name: 'Mine', collapsed: false }]);
    const { items, sections } = applyHostResult(r, [{ id: 'b', text: 'B', done: false, note: '', section: 'From braindumps' }]);
    const names = sections.map((s) => s.name);
    expect(names).toEqual(['Mine', 'From braindumps']);
    expect(items[0].section).toBe(sections.find((s) => s.name === 'From braindumps').id);
  });

  it('keeps a user-made section when the host files the item as unsectioned', () => {
    const r = rec([{ id: 'a', text: 'A', done: false, section: 'u' }], [{ id: 'u', name: 'Mine', collapsed: false }]);
    const { items } = applyHostResult(r, [{ id: 'a', text: 'A', done: false, note: '', section: '' }]);
    expect(items[0].section).toBe('u');
  });

  it('reports no change for an identical round trip', () => {
    const first = applyHostResult(rec([]), [{ id: 'a', text: 'A', done: false, note: '', section: 'Sessions · hub' }]);
    const again = applyHostResult(rec(first.items, first.sections),
      [{ id: 'a', text: 'A', done: false, note: '', section: 'Sessions · hub' }]);
    expect(again.changed).toBe(false);
  });

  it('does not report a change when only key insertion order differs', () => {
    const r = {
      key: '__global__', sections: [], tagColors: {},
      items: [{ note: '', tags: [], color: '', priority: 0, indent: 0, done: false, text: 'A', id: 'a', section: '' }]
    };
    const { changed } = applyHostResult(r, [{ id: 'a', text: 'A', done: false, note: '', section: '' }]);
    expect(changed).toBe(false);
  });

  it('coerces a malformed host text/note into strings', () => {
    const r = rec([{ id: 'a', text: 'old', done: false, note: '', section: '' }]);
    const { items } = applyHostResult(r, [{ id: 'a', text: 42, done: false, note: null, section: '' }]);
    expect(items[0]).toMatchObject({ text: '42', note: '' });
  });

  it('adopts the host note even when a local note already exists', () => {
    const r = rec([{ id: 'a', text: 'A', done: false, note: 'old local note', section: '' }]);
    const { items } = applyHostResult(r, [{ id: 'a', text: 'A', done: false, note: 'edited in TODO.md', section: '' }]);
    expect(items[0].note).toBe('edited in TODO.md');
  });

  it('coerces a non-string host section instead of throwing', () => {
    const r = rec([{ id: 'a', text: 'A', done: false, section: '' }]);
    expect(() => applyHostResult(r, [{ id: 'a', text: 'A', done: false, note: '', section: 42 }])).not.toThrow();
    const { items, sections } = applyHostResult(r, [{ id: 'a', text: 'A', done: false, note: '', section: 42 }]);
    expect(items[0].section).toBe(sections.find((s) => s.name === '42').id);
  });

  it('ignores null/non-object elements in the host reply instead of throwing', () => {
    const r = rec([{ id: 'a', text: 'A', done: false, section: '' }]);
    expect(() => applyHostResult(r, [null, { id: 'a', text: 'A', done: false, note: '', section: '' }, 'oops'])).not.toThrow();
    const { items } = applyHostResult(r, [null, { id: 'a', text: 'A', done: false, note: '', section: '' }, 'oops']);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a');
  });

  it('flags a freshly backfilled completedAt as a change even when nothing else differs', () => {
    const r = rec([{ id: 'a', text: 'A', done: true, indent: 0, priority: 0, color: '', tags: [], note: '', section: '', completedAt: '' }]);
    const { changed, items } = applyHostResult(r, [{ id: 'a', text: 'A', done: true, note: '', section: '' }]);
    expect(changed).toBe(true);
    expect(items[0].completedAt).not.toBe('');
  });

  it('prunes an empty host-created section even when its name does not match the reserved patterns', () => {
    const first = applyHostResult(rec([]), [{ id: 'a', text: 'A', done: false, note: '', section: 'Groceries' }]);
    const second = applyHostResult(rec(first.items, first.sections), []);
    expect(second.sections).toEqual([]);
  });
});

describe('isEncryptedValue', () => {
  it('matches an encrypted envelope', () => {
    expect(isEncryptedValue({ iv: 'x', data: 'y' })).toBe(true);
  });

  it('rejects a todos record even though it is an object', () => {
    expect(isEncryptedValue({ items: [], sections: [] })).toBe(false);
  });

  it('rejects an envelope-shaped value that also carries body/items/siteKey', () => {
    expect(isEncryptedValue({ iv: 'x', data: 'y', body: 'z' })).toBe(false);
    expect(isEncryptedValue({ iv: 'x', data: 'y', items: [] })).toBe(false);
    expect(isEncryptedValue({ iv: 'x', data: 'y', siteKey: 'k' })).toBe(false);
  });
});

describe('syncTodosWithHost', () => {
  const fakeStorage = (value) => {
    const data = { [TODOS_KEY]: value };
    return { data, get: async (k) => ({ [k]: data[k] }), set: async (o) => Object.assign(data, o) };
  };

  it('skips encrypted lists without calling the host', async () => {
    let called = false;
    const res = await syncTodosWithHost({
      storage: fakeStorage({ iv: 'x', data: 'y' }), extId: 'e',
      sendNativeMessage: async () => { called = true; }
    });
    expect(res).toEqual({ skipped: 'encrypted' });
    expect(called).toBe(false);
  });

  it('writes the merged list returned by the host', async () => {
    const storage = fakeStorage({ __global__: rec([{ id: 'a', text: 'A', done: false, section: '' }]) });
    let sentTo;
    const res = await syncTodosWithHost({
      storage, extId: 'e',
      sendNativeMessage: async (host, msg) => {
        sentTo = host;
        return { ok: true, items: [...msg.items, { id: 'b', text: 'B', done: false, note: '', section: '' }] };
      }
    });
    expect(sentTo).toBe(TODO_HOST);
    expect(res).toEqual({ changed: true, count: 2 });
    expect(storage.data[TODOS_KEY].__global__.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('surfaces host errors without writing', async () => {
    const storage = fakeStorage({});
    const res = await syncTodosWithHost({ storage, extId: 'e', sendNativeMessage: async () => ({ ok: false, error: 'boom' }) });
    expect(res).toEqual({ error: 'boom' });
    expect(storage.data[TODOS_KEY]).toEqual({});
  });

  it('returns an error instead of throwing when native messaging fails', async () => {
    const storage = fakeStorage({});
    const res = await syncTodosWithHost({
      storage, extId: 'e', sendNativeMessage: async () => { throw new Error('host disconnected'); }
    });
    expect(res).toEqual({ error: 'host disconnected' });
    expect(storage.data[TODOS_KEY]).toEqual({});
  });

  it('rejects a malformed (non-array) items reply without wiping stored todos', async () => {
    const storage = fakeStorage({ __global__: rec([{ id: 'a', text: 'A', done: false, section: '' }]) });
    const res = await syncTodosWithHost({ storage, extId: 'e', sendNativeMessage: async () => ({ ok: true, items: 'oops' }) });
    expect(res).toEqual({ error: 'malformed reply from host' });
    expect(storage.data[TODOS_KEY].__global__.items).toHaveLength(1);
  });

  it('returns an error instead of throwing when storage.get fails', async () => {
    const res = await syncTodosWithHost({
      storage: { get: async () => { throw new Error('quota exceeded'); } }, extId: 'e',
      sendNativeMessage: async () => ({ ok: true, items: [] })
    });
    expect(res).toEqual({ error: 'quota exceeded' });
  });

  it('returns an error instead of throwing when storage.set fails', async () => {
    const storage = fakeStorage({ __global__: rec([{ id: 'a', text: 'A', done: false, section: '' }]) });
    storage.set = async () => { throw new Error('disk full'); };
    const res = await syncTodosWithHost({
      storage, extId: 'e',
      sendNativeMessage: async (host, msg) => ({ ok: true, items: [...msg.items, { id: 'b', text: 'B', done: false, note: '', section: '' }] })
    });
    expect(res).toEqual({ error: 'disk full' });
  });
});
