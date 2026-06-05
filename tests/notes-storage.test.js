import { describe, it, expect, beforeEach } from 'vitest';

let store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
        return { ...store };
      },
      set: async (items) => { Object.assign(store, items); },
      remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
    }
  }
};

import {
  getSiteKey, readGlobalNote, writeGlobalNote,
  readSiteNote, writeSiteNote, deleteSiteNote, readAllSiteNotes,
  parseTags, createDebouncedSaver,
  getPageKey, readPageNote, writePageNote, deletePageNote, readAllPageNotes,
  readPrefs, writePrefs,
  readTodo, writeTodo, deleteTodo, readAllTodos,
  readOutline, writeOutline, deleteOutline, readAllOutlines,
  getDailyKey, readDailyNote, writeDailyNote, deleteDailyNote, readAllDailyNotes
} from '../src/shared/notes-storage.js';

describe('getSiteKey', () => {
  it('extracts hostname from URL', () => {
    expect(getSiteKey('https://example.com/path')).toBe('example.com');
  });
  it('strips www prefix', () => {
    expect(getSiteKey('https://www.example.com')).toBe('example.com');
  });
  it('returns empty string for invalid URL', () => {
    expect(getSiteKey('not-a-url')).toBe('');
  });
});

describe('parseTags', () => {
  it('returns empty array for empty input', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
  });
  it('splits on commas and spaces', () => {
    expect(parseTags('foo, bar baz')).toEqual(['#foo', '#bar', '#baz']);
  });
  it('preserves existing # prefix', () => {
    expect(parseTags('#foo #bar')).toEqual(['#foo', '#bar']);
  });
  it('deduplicates', () => {
    expect(parseTags('foo foo #foo')).toEqual(['#foo']);
  });
  it('lowercases', () => {
    expect(parseTags('FOO Bar')).toEqual(['#foo', '#bar']);
  });
});

describe('global note', () => {
  beforeEach(() => { store = {}; });

  it('reads empty note when none exists', async () => {
    const note = await readGlobalNote();
    expect(note).toEqual({ body: '', updatedAt: '' });
  });

  it('writes and reads back', async () => {
    const written = await writeGlobalNote('hello');
    expect(written.body).toBe('hello');
    expect(written.updatedAt).toBeTruthy();
    const read = await readGlobalNote();
    expect(read.body).toBe('hello');
  });
});

describe('site note', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing site', async () => {
    expect(await readSiteNote('example.com')).toBeNull();
  });

  it('writes and reads back', async () => {
    await writeSiteNote('example.com', { body: 'site note', tags: ['#test'] });
    const note = await readSiteNote('example.com');
    expect(note.body).toBe('site note');
    expect(note.tags).toEqual(['#test']);
    expect(note.key).toBe('example.com');
    expect(note.label).toBe('example.com');
  });

  it('preserves createdAt on update', async () => {
    await writeSiteNote('example.com', { body: 'first' });
    const first = await readSiteNote('example.com');
    await writeSiteNote('example.com', { body: 'second' });
    const second = await readSiteNote('example.com');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.body).toBe('second');
  });

  it('deletes a site note', async () => {
    await writeSiteNote('example.com', { body: 'delete me' });
    await deleteSiteNote('example.com');
    expect(await readSiteNote('example.com')).toBeNull();
  });

  it('reads all site notes', async () => {
    await writeSiteNote('a.com', { body: 'a' });
    await writeSiteNote('b.com', { body: 'b' });
    const all = await readAllSiteNotes();
    expect(all).toHaveLength(2);
    expect(all.map(n => n.body).sort()).toEqual(['a', 'b']);
  });
});

describe('getPageKey', () => {
  it('returns origin + pathname', () => {
    expect(getPageKey('https://facebook.com/john.doe')).toBe('https://facebook.com/john.doe');
  });
  it('strips query params', () => {
    expect(getPageKey('https://amazon.com/dp/B09V3?ref=nav')).toBe('https://amazon.com/dp/B09V3');
  });
  it('strips hash', () => {
    expect(getPageKey('https://docs.google.com/doc/d/abc#heading')).toBe('https://docs.google.com/doc/d/abc');
  });
  it('returns empty string for invalid URL', () => {
    expect(getPageKey('not-a-url')).toBe('');
  });
});

describe('page note', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing page', async () => {
    expect(await readPageNote('https://example.com/path')).toBeNull();
  });

  it('writes and reads back', async () => {
    await writePageNote('https://example.com/path', { body: 'page note', tags: ['#test'] });
    const note = await readPageNote('https://example.com/path');
    expect(note.body).toBe('page note');
    expect(note.tags).toEqual(['#test']);
    expect(note.key).toBe('https://example.com/path');
  });

  it('preserves createdAt on update', async () => {
    await writePageNote('https://example.com/p', { body: 'first' });
    const first = await readPageNote('https://example.com/p');
    await writePageNote('https://example.com/p', { body: 'second' });
    const second = await readPageNote('https://example.com/p');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.body).toBe('second');
  });

  it('deletes a page note', async () => {
    await writePageNote('https://example.com/p', { body: 'bye' });
    await deletePageNote('https://example.com/p');
    expect(await readPageNote('https://example.com/p')).toBeNull();
  });

  it('reads all page notes', async () => {
    await writePageNote('https://a.com/1', { body: 'a' });
    await writePageNote('https://b.com/2', { body: 'b' });
    const all = await readAllPageNotes();
    expect(all).toHaveLength(2);
    expect(all.map(n => n.body).sort()).toEqual(['a', 'b']);
  });
});

describe('preferences', () => {
  beforeEach(() => { store = {}; });

  it('returns defaults when none saved', async () => {
    const prefs = await readPrefs();
    expect(prefs.clusterPosition).toEqual({ x: null, y: null });
    expect(prefs.panelMode).toBe('fixed');
  });

  it('writes and reads back', async () => {
    await writePrefs({ panelMode: 'modal' });
    const prefs = await readPrefs();
    expect(prefs.panelMode).toBe('modal');
    expect(prefs.clusterPosition).toEqual({ x: null, y: null });
  });

  it('merges partial updates', async () => {
    await writePrefs({ clusterPosition: { x: 100, y: 200 } });
    await writePrefs({ panelMode: 'anchored' });
    const prefs = await readPrefs();
    expect(prefs.clusterPosition).toEqual({ x: 100, y: 200 });
    expect(prefs.panelMode).toBe('anchored');
  });
});

describe('todo', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing todo', async () => {
    expect(await readTodo()).toBeNull();
  });

  it('writes and reads back', async () => {
    const items = [{ id: '1', text: 'Buy milk', done: false }];
    await writeTodo({ items });
    const todo = await readTodo();
    expect(todo.items).toEqual(items);
  });

  it('preserves createdAt on update', async () => {
    await writeTodo({ items: [] });
    const first = await readTodo();
    await writeTodo({ items: [{ id: '1', text: 'test', done: true }] });
    const second = await readTodo();
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('deletes a todo', async () => {
    await writeTodo({ items: [] });
    await deleteTodo();
    expect(await readTodo()).toBeNull();
  });

  it('reads all todos returns single global todo', async () => {
    await writeTodo({ items: [{ id: '1', text: 'x', done: false }] });
    const all = await readAllTodos();
    expect(all).toHaveLength(1);
  });
});

describe('outline', () => {
  beforeEach(() => { store = {}; });

  it('returns null for missing outline', async () => {
    expect(await readOutline('example.com')).toBeNull();
  });

  it('writes and reads back', async () => {
    const items = [{ id: '1', text: 'Root', children: [], collapsed: false }];
    await writeOutline('example.com', { items });
    const outline = await readOutline('example.com');
    expect(outline.items).toEqual(items);
    expect(outline.key).toBe('example.com');
    expect(outline.name).toBe('example.com');
  });

  it('preserves createdAt on update', async () => {
    await writeOutline('example.com', { items: [] });
    const first = await readOutline('example.com');
    await writeOutline('example.com', { items: [{ id: '1', text: 'x', children: [], collapsed: false }] });
    const second = await readOutline('example.com');
    expect(second.createdAt).toBe(first.createdAt);
  });

  it('deletes an outline', async () => {
    await writeOutline('example.com', { items: [] });
    await deleteOutline('example.com');
    expect(await readOutline('example.com')).toBeNull();
  });

  it('reads all outlines', async () => {
    await writeOutline('a.com', { items: [] });
    await writeOutline('b.com', { items: [] });
    const all = await readAllOutlines();
    expect(all).toHaveLength(2);
  });
});

describe('daily note', () => {
  beforeEach(() => { store = {}; });

  it('getDailyKey returns YYYY-MM-DD format', () => {
    var key = getDailyKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns null for missing daily', async () => {
    expect(await readDailyNote('2026-05-26')).toBeNull();
  });

  it('writes and reads back', async () => {
    await writeDailyNote('2026-05-26', { body: 'daily note', tags: ['#today'] });
    var note = await readDailyNote('2026-05-26');
    expect(note.body).toBe('daily note');
    expect(note.tags).toEqual(['#today']);
    expect(note.key).toBe('2026-05-26');
  });

  it('preserves createdAt on update', async () => {
    await writeDailyNote('2026-05-26', { body: 'first' });
    var first = await readDailyNote('2026-05-26');
    await writeDailyNote('2026-05-26', { body: 'second' });
    var second = await readDailyNote('2026-05-26');
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.body).toBe('second');
  });

  it('deletes a daily note', async () => {
    await writeDailyNote('2026-05-26', { body: 'bye' });
    await deleteDailyNote('2026-05-26');
    expect(await readDailyNote('2026-05-26')).toBeNull();
  });

  it('reads all daily notes', async () => {
    await writeDailyNote('2026-05-25', { body: 'yesterday' });
    await writeDailyNote('2026-05-26', { body: 'today' });
    var all = await readAllDailyNotes();
    expect(all).toHaveLength(2);
  });
});

describe('legacy record fallback', () => {
  beforeEach(() => { store = {}; });

  it('readSiteNote accepts legacy siteKey records', async () => {
    store['stickysites_sites_v1'] = {
      'old.com': { siteKey: 'old.com', siteLabel: 'old.com', body: 'legacy', tags: [], createdAt: 'x', updatedAt: 'y' }
    };
    const note = await readSiteNote('old.com');
    expect(note.key).toBe('old.com');
    expect(note.body).toBe('legacy');
  });

  it('readPageNote accepts legacy pageKey records', async () => {
    store['stickysites_pages_v1'] = {
      'https://old.com/p': { pageKey: 'https://old.com/p', body: 'legacy page', tags: [] }
    };
    const note = await readPageNote('https://old.com/p');
    expect(note.key).toBe('https://old.com/p');
    expect(note.body).toBe('legacy page');
  });

  it('readOutline accepts legacy siteKey outlines and derives name from the map key', async () => {
    store['stickysites_outlines_v1'] = {
      'old.com': { siteKey: 'old.com', items: [{ id: '1', text: 'n', children: [], collapsed: false }] }
    };
    const o = await readOutline('old.com');
    expect(o.key).toBe('old.com');
    expect(o.name).toBe('old.com');
    expect(o.items).toHaveLength(1);
  });
});
