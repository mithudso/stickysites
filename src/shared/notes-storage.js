const GLOBAL_NOTE_KEY = 'stickysites_global_v1';
const SITE_NOTES_KEY = 'stickysites_sites_v1';
const PAGE_NOTES_KEY = 'stickysites_pages_v1';
const PREFS_KEY = 'stickysites_prefs_v1';
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
      siteKey: String(record.siteKey || siteKey),
      siteLabel: String(record.siteLabel || siteKey),
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
      siteKey,
      siteLabel: String(siteLabel || siteKey),
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
      siteKey: String(r.siteKey || ''),
      siteLabel: String(r.siteLabel || ''),
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
      pageKey: String(record.pageKey || pageKey),
      pageLabel: String(record.pageLabel || pageKey),
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
      pageKey,
      pageLabel: String(pageLabel || pageKey),
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
      pageKey: String(r.pageKey || ''),
      pageLabel: String(r.pageLabel || ''),
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
