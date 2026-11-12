const GLOBAL_NOTE_KEY = 'stickysites_global_v1';
const SITE_NOTES_KEY = 'stickysites_sites_v1';
const PAGE_NOTES_KEY = 'stickysites_pages_v1';
const PREFS_KEY = 'stickysites_prefs_v1';
const TODOS_KEY = 'stickysites_todos_v1';
const OUTLINES_KEY = 'stickysites_outlines_v1';
const DAILY_KEY = 'stickysites_daily_v1';
// TEST-ONLY reference implementation. Runtime mutations use note-writer.js.
// This module serializes its own mutations per key; it is not a cross-context writer.
import './settings.js';
const pending = new Map();
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const collection = value => object(value) ? Object.assign(Object.create(null), value) : Object.create(null);
const recordAt = (map, key) => Object.hasOwn(map, key) && object(map[key]) ? map[key] : null;
function serialize(key, action) {
  const operation = (pending.get(key) ?? Promise.resolve()).then(action);
  const settled = operation.catch(() => {});
  pending.set(key, settled);
  settled.then(() => { if (pending.get(key) === settled) pending.delete(key); });
  return operation;
}
const normalizePrefs = value => globalThis.StickySites.Settings.normalizePrefs(value);

export function getSiteKey(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return ''; }
}

export async function readGlobalNote() {
  try {
    const stored = await chrome.storage.local.get(GLOBAL_NOTE_KEY);
    const raw = stored?.[GLOBAL_NOTE_KEY];
    return { body: String(raw?.body ?? ''), updatedAt: String(raw?.updatedAt ?? '') };
  } catch { return { body: '', updatedAt: '' }; }
}

export async function writeGlobalNote(body = '') {
  const record = { body: String(body), updatedAt: new Date().toISOString() };
  return serialize(GLOBAL_NOTE_KEY, async () => {
    await chrome.storage.local.set({ [GLOBAL_NOTE_KEY]: record });
    return record;
  });
}

export async function readSiteNote(siteKey) {
  if (!siteKey) return null;
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = collection(stored?.[SITE_NOTES_KEY]);
    const record = recordAt(map, siteKey);
    if (!record) return null;
    return {
      key: String(record.key || record.siteKey || siteKey),
      label: String(record.label || record.siteLabel || siteKey),
      body: String(record.body ?? ''),
      tags: Array.isArray(record.tags) ? record.tags : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeSiteNote(siteKey, { siteLabel = '', body = '', tags = [] } = {}) {
  if (!siteKey) return null;
  return serialize(SITE_NOTES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
      const map = collection(stored?.[SITE_NOTES_KEY]);
      const existing = recordAt(map, siteKey);
      const record = {
        key: siteKey,
        label: String(siteLabel || siteKey),
        body: String(body),
        tags: Array.isArray(tags) ? tags : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      map[siteKey] = record;
      await chrome.storage.local.set({ [SITE_NOTES_KEY]: map });
      return record;
    } catch { return null; }
  });
}

export async function deleteSiteNote(siteKey) {
  return serialize(SITE_NOTES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
      const map = collection(stored?.[SITE_NOTES_KEY]);
      delete map[siteKey];
      await chrome.storage.local.set({ [SITE_NOTES_KEY]: map });
    } catch { /* best effort */ }
  });
}

export async function readAllSiteNotes() {
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = collection(stored?.[SITE_NOTES_KEY]);
    return Object.entries(map).filter(([, r]) => object(r)).map(([k, r]) => ({
      key: String(r.key || r.siteKey || k),
      label: String(r.label || r.siteLabel || k),
      body: String(r.body ?? ''),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}

export function getPageKey(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch { return ''; }
}

export async function readPageNote(pageKey) {
  if (!pageKey) return null;
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = collection(stored?.[PAGE_NOTES_KEY]);
    const record = recordAt(map, pageKey);
    if (!record) return null;
    return {
      key: String(record.key || record.pageKey || pageKey),
      label: String(record.label || record.pageLabel || pageKey),
      body: String(record.body ?? ''),
      tags: Array.isArray(record.tags) ? record.tags : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writePageNote(pageKey, { pageLabel = '', body = '', tags = [] } = {}) {
  if (!pageKey) return null;
  return serialize(PAGE_NOTES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
      const map = collection(stored?.[PAGE_NOTES_KEY]);
      const existing = recordAt(map, pageKey);
      const record = {
        key: pageKey,
        label: String(pageLabel || pageKey),
        body: String(body),
        tags: Array.isArray(tags) ? tags : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      map[pageKey] = record;
      await chrome.storage.local.set({ [PAGE_NOTES_KEY]: map });
      return record;
    } catch { return null; }
  });
}

export async function deletePageNote(pageKey) {
  return serialize(PAGE_NOTES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
      const map = collection(stored?.[PAGE_NOTES_KEY]);
      delete map[pageKey];
      await chrome.storage.local.set({ [PAGE_NOTES_KEY]: map });
    } catch { /* best effort */ }
  });
}

export async function readAllPageNotes() {
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = collection(stored?.[PAGE_NOTES_KEY]);
    return Object.entries(map).filter(([, r]) => object(r)).map(([k, r]) => ({
      key: String(r.key || r.pageKey || k),
      label: String(r.label || r.pageLabel || k),
      body: String(r.body ?? ''),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}

export function getDailyKey() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export async function readDailyNote(dateKey) {
  if (!dateKey) dateKey = getDailyKey();
  try {
    const stored = await chrome.storage.local.get(DAILY_KEY);
    const map = collection(stored?.[DAILY_KEY]);
    const record = recordAt(map, dateKey);
    if (!record) return null;
    return {
      key: String(record.key || record.dateKey || dateKey),
      body: String(record.body ?? ''),
      tags: Array.isArray(record.tags) ? record.tags : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeDailyNote(dateKey, { body = '', tags = [] } = {}) {
  if (!dateKey) dateKey = getDailyKey();
  return serialize(DAILY_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(DAILY_KEY);
      const map = collection(stored?.[DAILY_KEY]);
      const existing = recordAt(map, dateKey);
      const record = {
        key: dateKey,
        body: String(body),
        tags: Array.isArray(tags) ? tags : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      map[dateKey] = record;
      await chrome.storage.local.set({ [DAILY_KEY]: map });
      return record;
    } catch { return null; }
  });
}

export async function deleteDailyNote(dateKey) {
  return serialize(DAILY_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(DAILY_KEY);
      const map = collection(stored?.[DAILY_KEY]);
      delete map[dateKey];
      await chrome.storage.local.set({ [DAILY_KEY]: map });
    } catch { /* best effort */ }
  });
}

export async function readAllDailyNotes() {
  try {
    const stored = await chrome.storage.local.get(DAILY_KEY);
    const map = collection(stored?.[DAILY_KEY]);
    return Object.entries(map).filter(([, r]) => object(r)).map(([k, r]) => ({
      key: String(r.key || r.dateKey || k),
      body: String(r.body ?? ''),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}

export function parseTags(input) {
  if (!input || typeof input !== 'string') return [];
  return Array.from(new Set(
    input.split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean)
      .map(t => t.startsWith('#') ? t : '#' + t)
  ));
}

export function createDebouncedSaver(fn, ms = 500) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}

export async function readPrefs() {
  try {
    const stored = await chrome.storage.local.get(PREFS_KEY);
    return normalizePrefs(stored?.[PREFS_KEY]);
  } catch { return normalizePrefs(null); }
}

export async function writePrefs(updates = {}) {
  return serialize(PREFS_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(PREFS_KEY);
      const current = normalizePrefs(stored?.[PREFS_KEY]);
      const patch = object(updates) ? updates : {};
      const merged = normalizePrefs({ ...current, ...patch, enabledTypes: { ...current.enabledTypes, ...(object(patch.enabledTypes) ? patch.enabledTypes : {}) } });
      await chrome.storage.local.set({ [PREFS_KEY]: merged });
      return merged;
    } catch { return null; }
  });
}

export async function readTodo() {
  try {
    const stored = await chrome.storage.local.get(TODOS_KEY);
    const map = collection(stored?.[TODOS_KEY]);
    const record = recordAt(map, '__global__');
    if (!record) return null;
    return {
      items: Array.isArray(record.items) ? record.items : [],
      sections: Array.isArray(record.sections) ? record.sections : [],
      tagColors: (record.tagColors && typeof record.tagColors === 'object') ? record.tagColors : {},
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeTodo({ items = [], sections, tagColors } = {}) {
  return serialize(TODOS_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(TODOS_KEY);
      const map = collection(stored?.[TODOS_KEY]);
      const existing = recordAt(map, '__global__');
      const record = {
        key: '__global__',
        items: Array.isArray(items) ? items : [],
        sections: Array.isArray(sections) ? sections : (existing?.sections || []),
        tagColors: (tagColors && typeof tagColors === 'object') ? tagColors : (existing?.tagColors || {}),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      map['__global__'] = record;
      await chrome.storage.local.set({ [TODOS_KEY]: map });
      return record;
    } catch { return null; }
  });
}

export async function deleteTodo() {
  return serialize(TODOS_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(TODOS_KEY);
      const map = collection(stored?.[TODOS_KEY]);
      delete map['__global__'];
      await chrome.storage.local.set({ [TODOS_KEY]: map });
    } catch { /* best effort */ }
  });
}

export async function readAllTodos() {
  try {
    const todo = await readTodo();
    return todo ? [todo] : [];
  } catch { return []; }
}

export async function readOutline(outlineKey) {
  if (!outlineKey) return null;
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = collection(stored?.[OUTLINES_KEY]);
    const record = recordAt(map, outlineKey);
    if (!record) return null;
    return {
      key: String(record.key || record.siteKey || outlineKey),
      name: String(record.name || outlineKey),
      items: Array.isArray(record.items) ? record.items : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeOutline(outlineKey, { name = '', items = [] } = {}) {
  if (!outlineKey) return null;
  return serialize(OUTLINES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(OUTLINES_KEY);
      const map = collection(stored?.[OUTLINES_KEY]);
      const existing = recordAt(map, outlineKey);
      const record = {
        key: outlineKey,
        name: String(name || existing?.name || outlineKey),
        items: Array.isArray(items) ? items : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      map[outlineKey] = record;
      await chrome.storage.local.set({ [OUTLINES_KEY]: map });
      return record;
    } catch { return null; }
  });
}

export async function deleteOutline(outlineKey) {
  return serialize(OUTLINES_KEY, async () => {
    try {
      const stored = await chrome.storage.local.get(OUTLINES_KEY);
      const map = collection(stored?.[OUTLINES_KEY]);
      delete map[outlineKey];
      await chrome.storage.local.set({ [OUTLINES_KEY]: map });
    } catch { /* best effort */ }
  });
}

export async function readAllOutlines() {
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = collection(stored?.[OUTLINES_KEY]);
    return Object.entries(map).filter(([, r]) => object(r)).map(([k, r]) => ({
      key: String(r.key || r.siteKey || k),
      name: String(r.name || k),
      items: Array.isArray(r.items) ? r.items : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}
