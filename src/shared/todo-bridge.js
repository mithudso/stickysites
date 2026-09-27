// Sync the global to-do list with the local TODO.md through the native-messaging host
// com.mitch.todo_bridge (installed by ~/.claude/skills/todo/scripts/todo.py install-native-host).
// The host owns the three-way merge; this module only builds the request and folds the reply
// back into the stored record without losing StickySites-only fields (priority, tags, color...).

export const TODO_HOST = 'com.mitch.todo_bridge';
export const TODOS_KEY = 'stickysites_todos_v1';
const RECORD_KEY = '__global__';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function buildRequest(record, extId) {
  return {
    cmd: 'sync',
    ext: extId,
    items: (record?.items || []).map((i) => ({
      id: String(i.id), text: String(i.text ?? ''), done: !!i.done,
      note: String(i.note ?? ''), section: String(i.section ?? '')
    })),
    sections: (record?.sections || []).map((s) => ({ id: String(s.id), name: String(s.name ?? '') }))
  };
}

// hostItems carry a section *name* ('' = unsectioned). Items the host placed unsectioned keep a
// user-made local section, so a custom grouping in the browser survives the round trip.
export function applyHostResult(record, hostItems) {
  hostItems = Array.isArray(hostItems) ? hostItems.filter((h) => h && typeof h === 'object') : [];
  const existing = new Map((record?.items || []).map((i) => [String(i.id), i]));
  const sections = (record?.sections || []).map((s) => ({ ...s }));
  const hostNames = new Set(hostItems.map((h) => h.section).filter(Boolean).map(String));
  const sectionId = (name) => {
    let sec = sections.find((s) => s.name === name);
    if (!sec) {
      sec = { id: genId(), name, collapsed: name.startsWith('Sessions · '), origin: 'host' };
      sections.push(sec);
    }
    return sec.id;
  };
  const sectionName = (id) => sections.find((s) => s.id === id)?.name || '';

  let backfilledCompletedAt = false;
  const items = hostItems.map((h) => {
    const local = existing.get(String(h.id));
    const hostSection = h.section ? String(h.section) : '';
    let section = hostSection ? sectionId(hostSection) : '';
    if (!hostSection && local?.section && !hostNames.has(sectionName(local.section))) {
      section = local.section;
    }
    const merged = {
      id: String(h.id), text: String(h.text ?? ''), done: !!h.done,
      indent: local?.indent ?? 0, priority: local?.priority ?? 0, color: local?.color ?? '',
      tags: local?.tags ?? [], note: String(h.note ?? ''), section,
      completedAt: local?.completedAt ?? ''
    };
    if (merged.done && !merged.completedAt) {
      merged.completedAt = new Date().toISOString();
      backfilledCompletedAt = true;
    }
    if (!merged.done) merged.completedAt = '';
    return merged;
  });

  // Drop sections the host is responsible for once they no longer hold anything; keep every
  // user-made one. Sections created above are tagged origin:'host' regardless of name; the
  // name-based fallback only covers sections persisted before that tag existed.
  const used = new Set(items.map((i) => i.section));
  const keptSections = sections.filter((s) => used.has(s.id) || !(s.origin === 'host' || isHostSection(s.name)));
  const changed = backfilledCompletedAt ||
    stableStringify(stripVolatile(record?.items || [])) !== stableStringify(stripVolatile(items)) ||
    stableStringify(record?.sections || []) !== stableStringify(keptSections);
  return { items, sections: keptSections, changed };
}

function isHostSection(name) {
  return name === 'From braindumps' || String(name).startsWith('Sessions · ');
}

function stripVolatile(items) {
  return items.map(({ completedAt, ...rest }) => rest);
}

// JSON.stringify is key-order sensitive; items/sections built in this module use a fixed key
// order that can differ from how a record was constructed elsewhere, so compare with a
// canonical (key-sorted) serialization instead of raw JSON.stringify.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function isEncryptedValue(v) {
  // Same test as Crypto.isEncrypted in src/content/crypto-content.js.
  return !!(v && typeof v === 'object' && typeof v.iv === 'string' && typeof v.data === 'string' &&
    !v.body && !v.items && !v.siteKey);
}

export async function syncTodosWithHost({ storage, sendNativeMessage, extId }) {
  let stored;
  try {
    stored = await storage.get(TODOS_KEY);
  } catch (err) {
    return { error: err?.message || 'storage read failed' };
  }
  const map = stored?.[TODOS_KEY] || {};
  // Encrypted notes stay encrypted at rest; the plaintext file must not receive them.
  if (isEncryptedValue(map)) return { skipped: 'encrypted' };
  const record = map[RECORD_KEY] || { key: RECORD_KEY, items: [], sections: [], tagColors: {} };
  let reply;
  try {
    reply = await sendNativeMessage(TODO_HOST, buildRequest(record, extId));
  } catch (err) {
    return { error: err?.message || 'native messaging failed' };
  }
  if (!reply?.ok) return { error: reply?.error || 'no reply from host' };
  if (!Array.isArray(reply.items)) return { error: 'malformed reply from host' };
  let merged;
  try {
    merged = applyHostResult(record, reply.items);
  } catch (err) {
    return { error: err?.message || 'malformed reply from host' };
  }
  const { items, sections, changed } = merged;
  if (!changed) return { changed: false, count: items.length };
  const now = new Date().toISOString();
  map[RECORD_KEY] = { ...record, key: RECORD_KEY, items, sections, createdAt: record.createdAt || now, updatedAt: now };
  try {
    await storage.set({ [TODOS_KEY]: map });
  } catch (err) {
    return { error: err?.message || 'storage write failed' };
  }
  return { changed: true, count: items.length };
}
