import './settings.js';
import { importJwk, decrypt, encrypt, isEncrypted } from './crypto.js';
import { NOTE_KEYS, CRYPTO_KEY, CACHED_KEY, TOMBSTONES_KEY, PEER_STATE_KEY } from './peer-sync.js';

const PREFS_KEY = 'stickysites_prefs_v1';
const allowed = new Set([...NOTE_KEYS, CRYPTO_KEY, CACHED_KEY, TOMBSTONES_KEY, PEER_STATE_KEY, PREFS_KEY]);
const validObject = v => v && typeof v === 'object' && !Array.isArray(v);
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function fail(code) { throw new Error(code); }

// All browser contexts send mutations to this single service-worker queue. Network work
// stays outside the queue and commits only if its input snapshot still matches storage.
export function createNoteWriter(storage) {
  let tail = Promise.resolve();
  function enqueue(fn) {
    const task = tail.then(fn);
    tail = task.catch(() => {});
    return task;
  }
  async function verifiedSet(updates) {
    await storage.set(updates);
    const actual = await storage.get(Object.keys(updates));
    if (Object.keys(updates).some(k => !equal(actual[k], updates[k]))) fail('STORAGE_VERIFY_FAILED');
  }
  async function guarded(expected, updates) {
    if (!validObject(expected) || !validObject(updates) || [...Object.keys(expected), ...Object.keys(updates)].some(k => !allowed.has(k)) || Object.keys(updates).some(k => !Object.hasOwn(expected, k))) fail('INVALID_WRITE');
    const current = await storage.get(Object.keys(expected));
    if (Object.keys(expected).some(k => !equal(current[k], expected[k]))) fail('STATE_CHANGED');
    const noteWrites = NOTE_KEYS.filter(k => Object.hasOwn(updates, k));
    if (noteWrites.length) {
      if (!Object.hasOwn(expected, CRYPTO_KEY)) fail('INVALID_WRITE');
      const config = Object.hasOwn(updates, CRYPTO_KEY) ? updates[CRYPTO_KEY] : current[CRYPTO_KEY];
      if (config?.enabled && noteWrites.some(k => updates[k] != null && !isEncrypted(updates[k]))) fail('PLAINTEXT_FORBIDDEN');
    }
    await verifiedSet(updates);
    return true;
  }
  async function mutate(msg) {
    const storageKey = msg.storageKey;
    if (!NOTE_KEYS.includes(storageKey) || typeof msg.key !== 'string') fail('INVALID_NOTE');
    const stored = await storage.get([storageKey, CRYPTO_KEY, CACHED_KEY, TOMBSTONES_KEY, PREFS_KEY]);
    const enabled = stored[CRYPTO_KEY]?.enabled;
    let key = null;
    if (enabled) {
      if (!stored[CACHED_KEY]) fail('VAULT_LOCKED');
      try { key = await importJwk(stored[CACHED_KEY]); } catch { fail('VAULT_UNREADABLE'); }
    }
    let raw = stored[storageKey];
    if (isEncrypted(raw)) {
      if (!key) fail('VAULT_LOCKED');
      try { raw = JSON.parse(await decrypt(key, raw)); } catch { fail('VAULT_UNREADABLE'); }
    }
    if (raw != null && !validObject(raw)) fail('NOTE_UNREADABLE');
    let map = Object.assign(Object.create(null), raw || {});
    let recordKey = msg.key;
    const single = storageKey === NOTE_KEYS[0];
    if (msg.op === 'clip' && storageKey === 'stickysites_outlines_v1') {
      const active = stored[PREFS_KEY]?.activeOutlineId;
      recordKey = active && Object.hasOwn(map, active) ? active : Object.keys(map)[0] || 'ol_' + crypto.randomUUID();
    }
    const existing = single ? map : (Object.hasOwn(map, recordKey) && validObject(map[recordKey]) ? map[recordKey] : {});
    const now = new Date().toISOString();
    let record;
    const updates = {};
    if (msg.op === 'delete') {
      if (single) fail('INVALID_NOTE');
      delete map[recordKey];
      const tomb = structuredClone(stored[TOMBSTONES_KEY] || {});
      tomb[storageKey] = { ...tomb[storageKey], [recordKey]: now };
      updates[TOMBSTONES_KEY] = tomb;
      record = null;
    } else {
      const data = validObject(msg.data) ? structuredClone(msg.data) : {};
      if (msg.op === 'clip') {
        if (typeof msg.text !== 'string' || !msg.text) fail('INVALID_CLIP');
        if (storageKey === 'stickysites_todos_v1' || storageKey === 'stickysites_outlines_v1') {
          const item = { id: crypto.randomUUID(), text: msg.text, done: false, indent: 0, priority: 0, color: '', tags: [], note: '', section: '', completedAt: '' };
          if (storageKey === 'stickysites_outlines_v1') { item.children = []; item.collapsed = false; data.name = existing.name || 'My outline'; }
          data.items = [...(Array.isArray(existing.items) ? existing.items : []), item];
        } else {
          const html = '<p>' + msg.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
          data.body = (existing.body ? existing.body + '<p><br></p>' : '') + html;
        }
      } else if (msg.op !== 'record') fail('INVALID_OPERATION');
      if (Array.isArray(data.items) && Array.isArray(msg.loadedIds) && Array.isArray(existing.items)) {
        const loaded = new Set(msg.loadedIds), present = new Map();
        function index(items) { items.filter(validObject).forEach(i => { present.set(String(i.id), i); if (Array.isArray(i.children)) index(i.children); }); }
        index(data.items);
        function preserve(oldItems, target) {
          oldItems.filter(validObject).forEach(i => {
            const id = String(i.id), current = present.get(id);
            if (current) {
              if (Array.isArray(i.children)) { if (!Array.isArray(current.children)) current.children = []; preserve(i.children, current.children); }
            } else if (!loaded.has(id)) { target.push(i); index([i]); }
          });
        }
        preserve(existing.items, data.items);
        const sections = Array.isArray(data.sections) ? data.sections : [];
        (Array.isArray(existing.sections) ? existing.sections : []).forEach(s => { if (s && !sections.some(x => x.id === s.id) && data.items.some(i => i.section === s.id)) sections.push(s); });
        data.sections = sections;
      }
      record = single ? { ...existing, ...data, updatedAt: now } : { ...existing, ...data, key: recordKey, createdAt: existing.createdAt || now, updatedAt: now };
      if (single) map = record; else map[recordKey] = record;
    }
    updates[storageKey] = enabled ? await encrypt(key, JSON.stringify(map)) : map;
    // A lock or vault change must also invalidate an operation already encrypting.
    const latest = await storage.get([CRYPTO_KEY, CACHED_KEY]);
    if (!equal(latest[CRYPTO_KEY], stored[CRYPTO_KEY]) || !equal(latest[CACHED_KEY], stored[CACHED_KEY])) fail('STATE_CHANGED');
    await verifiedSet(updates);
    return record;
  }
  return {
    commit: (expected, updates) => enqueue(() => guarded(expected, updates)),
    dispatch: msg => enqueue(async () => {
      if (!validObject(msg)) fail('INVALID_OPERATION');
      if (msg.op === 'commit') return guarded(msg.expected, msg.updates);
      if (msg.op === 'lock') { await verifiedSet({ [CACHED_KEY]: null }); return true; }
      if (msg.op === 'prefs') {
        const stored = await storage.get(PREFS_KEY), current = globalThis.StickySites.Settings.normalizePrefs(stored[PREFS_KEY]);
        const patch = validObject(msg.data) ? msg.data : {};
        const result = globalThis.StickySites.Settings.normalizePrefs({ ...current, ...patch, enabledTypes: { ...current.enabledTypes, ...(validObject(patch.enabledTypes) ? patch.enabledTypes : {}) } });
        await verifiedSet({ [PREFS_KEY]: result }); return result;
      }
      return mutate(msg);
    })
  };
}
