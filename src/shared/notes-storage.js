const GLOBAL_NOTE_KEY = 'stickysites_global_v1';
const SITE_NOTES_KEY = 'stickysites_sites_v1';
const PAGE_NOTES_KEY = 'stickysites_pages_v1';
const PREFS_KEY = 'stickysites_prefs_v1';
const TODOS_KEY = 'stickysites_todos_v1';
const OUTLINES_KEY = 'stickysites_outlines_v1';
const DAILY_KEY = 'stickysites_daily_v1';
const DEFAULT_PREFS = { clusterPosition: { x: null, y: null }, panelMode: 'fixed' };

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
  await chrome.storage.local.set({ [GLOBAL_NOTE_KEY]: record });
  return record;
}

export async function readSiteNote(siteKey) {
  if (!siteKey) return null;
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = stored?.[SITE_NOTES_KEY] || {};
    const record = map[siteKey];
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
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = stored?.[SITE_NOTES_KEY] || {};
    const existing = map[siteKey];
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
}

export async function deleteSiteNote(siteKey) {
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = stored?.[SITE_NOTES_KEY] || {};
    delete map[siteKey];
    await chrome.storage.local.set({ [SITE_NOTES_KEY]: map });
  } catch { /* best effort */ }
}

export async function readAllSiteNotes() {
  try {
    const stored = await chrome.storage.local.get(SITE_NOTES_KEY);
    const map = stored?.[SITE_NOTES_KEY] || {};
    return Object.values(map).map(r => ({
      key: String(r.key || r.siteKey || ''),
      label: String(r.label || r.siteLabel || ''),
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
    const map = stored?.[PAGE_NOTES_KEY] || {};
    const record = map[pageKey];
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
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    const existing = map[pageKey];
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
}

export async function deletePageNote(pageKey) {
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    delete map[pageKey];
    await chrome.storage.local.set({ [PAGE_NOTES_KEY]: map });
  } catch { /* best effort */ }
}

export async function readAllPageNotes() {
  try {
    const stored = await chrome.storage.local.get(PAGE_NOTES_KEY);
    const map = stored?.[PAGE_NOTES_KEY] || {};
    return Object.values(map).map(r => ({
      key: String(r.key || r.pageKey || ''),
      label: String(r.label || r.pageLabel || ''),
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
    const map = stored?.[DAILY_KEY] || {};
    const record = map[dateKey];
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
  try {
    const stored = await chrome.storage.local.get(DAILY_KEY);
    const map = stored?.[DAILY_KEY] || {};
    const existing = map[dateKey];
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
}

export async function deleteDailyNote(dateKey) {
  try {
    const stored = await chrome.storage.local.get(DAILY_KEY);
    const map = stored?.[DAILY_KEY] || {};
    delete map[dateKey];
    await chrome.storage.local.set({ [DAILY_KEY]: map });
  } catch { /* best effort */ }
}

export async function readAllDailyNotes() {
  try {
    const stored = await chrome.storage.local.get(DAILY_KEY);
    const map = stored?.[DAILY_KEY] || {};
    return Object.values(map).map(r => ({
      key: String(r.key || r.dateKey || ''),
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
    const raw = stored?.[PREFS_KEY] || {};
    return { ...DEFAULT_PREFS, ...raw };
  } catch { return { ...DEFAULT_PREFS }; }
}

export async function writePrefs(updates = {}) {
  try {
    const current = await readPrefs();
    const merged = { ...current, ...updates };
    await chrome.storage.local.set({ [PREFS_KEY]: merged });
    return merged;
  } catch { return null; }
}

export async function readTodo() {
  try {
    const stored = await chrome.storage.local.get(TODOS_KEY);
    const map = stored?.[TODOS_KEY] || {};
    const record = map['__global__'];
    if (!record) return null;
    return {
      items: Array.isArray(record.items) ? record.items : [],
      createdAt: String(record.createdAt || ''),
      updatedAt: String(record.updatedAt || '')
    };
  } catch { return null; }
}

export async function writeTodo({ items = [] } = {}) {
  try {
    const stored = await chrome.storage.local.get(TODOS_KEY);
    const map = stored?.[TODOS_KEY] || {};
    const existing = map['__global__'];
    const record = {
      key: '__global__',
      items: Array.isArray(items) ? items : [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    map['__global__'] = record;
    await chrome.storage.local.set({ [TODOS_KEY]: map });
    return record;
  } catch { return null; }
}

export async function deleteTodo() {
  try {
    const stored = await chrome.storage.local.get(TODOS_KEY);
    const map = stored?.[TODOS_KEY] || {};
    delete map['__global__'];
    await chrome.storage.local.set({ [TODOS_KEY]: map });
  } catch { /* best effort */ }
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
    const map = stored?.[OUTLINES_KEY] || {};
    const record = map[outlineKey];
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
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = stored?.[OUTLINES_KEY] || {};
    const existing = map[outlineKey];
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
}

export async function deleteOutline(outlineKey) {
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = stored?.[OUTLINES_KEY] || {};
    delete map[outlineKey];
    await chrome.storage.local.set({ [OUTLINES_KEY]: map });
  } catch { /* best effort */ }
}

export async function readAllOutlines() {
  try {
    const stored = await chrome.storage.local.get(OUTLINES_KEY);
    const map = stored?.[OUTLINES_KEY] || {};
    return Object.entries(map).map(([k, r]) => ({
      key: String(r.key || k),
      name: String(r.name || k),
      items: Array.isArray(r.items) ? r.items : [],
      createdAt: String(r.createdAt || ''),
      updatedAt: String(r.updatedAt || '')
    }));
  } catch { return []; }
}
