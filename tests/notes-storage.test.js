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
  parseTags, createDebouncedSaver
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
    expect(note.siteKey).toBe('example.com');
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
