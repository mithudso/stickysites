// Local peer sync: keep two or more browsers on the same LAN converged without a server.
//
// The extension never talks to the network itself. A small local daemon (peer/stickysites-peer.py)
// discovers peers on the LAN and exchanges *snapshots*; the extension pushes its snapshot to the
// daemon over loopback HTTP and pulls every peer's latest snapshot back. All merge logic is here so
// it can be unit-tested; the service worker only wires storage + fetch + crypto into syncWithDaemon().
//
// Snapshot = { version, deviceId, ts, notes: { [storageKey]: value }, tombstones, crypto }
//   notes values are the raw storage values (an { iv, data } envelope when the vault is on).
//   tombstones = { [storageKey]: { [recordKey]: deletedAtISO } } — plaintext, keys + timestamps only.
//   crypto = { enabled, salt } | null — used to decide whether two peers can understand each other.
//
// Merge = record-level last-writer-wins on `updatedAt`, tombstones included; ties keep local.

export const NOTE_KEYS = [
  'stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1',
  'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1'
];
export const TOMBSTONES_KEY = 'stickysites_tombstones_v1';
export const CRYPTO_KEY = 'stickysites_crypto_v1';
export const CACHED_KEY = 'stickysites_cached_key';
export const PEER_STATE_KEY = 'stickysites_peer_v1';
export const SNAPSHOT_VERSION = 1;
export const DEFAULT_DAEMON_URL = 'http://127.0.0.1:47831';
const GLOBAL_KEY = 'stickysites_global_v1';
const SINGLE = '__single__';

export function isEnvelope(v) {
  return !!(v && typeof v === 'object' && typeof v.iv === 'string' && typeof v.data === 'string' &&
    !v.body && !v.items && !v.siteKey);
}

export function genDeviceId() {
  const bytes = new Uint8Array(8);
  (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); });
  return 'dev_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Storage value → { recordKey: record } so every note type merges the same way.
export function recordsOf(storageKey, value) {
  if (!value || typeof value !== 'object') return {};
  if (storageKey === GLOBAL_KEY) return (value.body != null || value.updatedAt) ? { [SINGLE]: value } : {};
  const out = {};
  for (const [k, rec] of Object.entries(value)) if (rec && typeof rec === 'object') out[k] = rec;
  return out;
}

// { recordKey: record } → storage value shape.
export function fromRecords(storageKey, records) {
  if (storageKey === GLOBAL_KEY) return records[SINGLE] || { body: '', updatedAt: '' };
  return { ...records };
}

function ts(v) { return typeof v === 'string' ? v : ''; }

export function buildSnapshot({ deviceId, notes, tombstones, crypto, ts: when }) {
  const cfg = crypto && crypto.enabled ? { enabled: true, salt: String(crypto.salt || '') } : null;
  const out = {};
  for (const k of NOTE_KEYS) if (notes && notes[k] != null) out[k] = notes[k];
  const snap = { version: SNAPSHOT_VERSION, deviceId: String(deviceId), ts: when || new Date().toISOString(), notes: out, tombstones: tombstones || {}, crypto: cfg };
  // Full config (salt + verify token) lets a peer with encryption off adopt this vault; the
  // passphrase itself is never part of it.
  if (cfg) snap.cryptoFull = { enabled: true, salt: crypto.salt, verify: crypto.verify };
  return snap;
}

// How a remote snapshot's vault relates to ours.
//   'compatible'   both off, or both on with the same salt → records can be merged
//   'adopt-remote' we are off, remote is on → take its config, then we are locked until unlock
//   'remote-off'   we are on (unlocked), remote is off → merge its plaintext; it will adopt ours
//   'mismatch'     both on with different salts → cannot merge; user must disable on one side
export function cryptoCompatibility(local, remote) {
  const l = !!(local && local.enabled), r = !!(remote && remote.enabled);
  if (!l && !r) return 'compatible';
  if (!l && r) return 'adopt-remote';
  if (l && !r) return 'remote-off';
  return String(local.salt || '') === String(remote.salt || '') ? 'compatible' : 'mismatch';
}

// Merge plaintext note maps. `local`/`remotes` are { notes: {storageKey: plainValue}, tombstones }.
// Returns { notes, tombstones, changedKeys, stats }.
export function mergeNotes(local, remotes) {
  const notes = {}; const tombstones = {}; const changedKeys = new Set();
  const stats = { applied: 0, deleted: 0, kept: 0 };
  const allTomb = [local.tombstones || {}, ...remotes.map((r) => r.tombstones || {})];
  for (const key of NOTE_KEYS) {
    const localRecs = recordsOf(key, local.notes && local.notes[key]);
    const remoteRecs = remotes.map((r) => recordsOf(key, r.notes && r.notes[key]));
    const tomb = {};
    for (const t of allTomb) for (const [rk, when] of Object.entries(t[key] || {})) if (ts(when) > ts(tomb[rk])) tomb[rk] = when;
    const keys = new Set([...Object.keys(localRecs), ...remoteRecs.flatMap((r) => Object.keys(r)), ...Object.keys(tomb)]);
    const merged = {};
    for (const rk of keys) {
      let winner = localRecs[rk] || null; let winTs = winner ? ts(winner.updatedAt) : ''; let fromRemote = false;
      for (const recs of remoteRecs) {
        const cand = recs[rk];
        if (cand && ts(cand.updatedAt) > winTs) { winner = cand; winTs = ts(cand.updatedAt); fromRemote = true; }
      }
      const deletedAt = ts(tomb[rk]);
      if (deletedAt && (!winner || deletedAt > winTs)) {
        if (localRecs[rk]) { changedKeys.add(key); stats.deleted++; }
        continue; // tombstone wins → record absent
      }
      if (!winner) continue;
      merged[rk] = winner;
      if (fromRemote) { changedKeys.add(key); stats.applied++; } else stats.kept++;
    }
    notes[key] = fromRecords(key, merged);
    // keep only tombstones that still matter (no live record newer than them)
    const keptTomb = {};
    for (const [rk, when] of Object.entries(tomb)) if (!merged[rk]) keptTomb[rk] = when;
    if (Object.keys(keptTomb).length) tombstones[key] = keptTomb;
  }
  return { notes, tombstones, changedKeys: [...changedKeys], stats };
}

// Full round: read → push → pull → merge → write. Dependencies are injected for testability.
//   storage: chrome.storage.local-like { get(keys), set(obj) }
//   fetch:   fetch-like; daemonUrl: base URL of the local daemon
//   cryptoApi: { decrypt(value) → plain, encrypt(value) → envelope } using the cached key, or null
//   now: () → ISO string
export async function syncWithDaemon({ storage, fetch, daemonUrl = DEFAULT_DAEMON_URL, cryptoApi = null, now = () => new Date().toISOString() }) {
  let stored;
  try { stored = await storage.get([...NOTE_KEYS, TOMBSTONES_KEY, CRYPTO_KEY, CACHED_KEY, PEER_STATE_KEY]); }
  catch (err) { return { status: 'error', error: 'storage read failed: ' + (err?.message || err) }; }
  const state = stored[PEER_STATE_KEY] || {};
  if (state.enabled === false) return { status: 'disabled' };
  const deviceId = state.deviceId || genDeviceId();
  const localCrypto = stored[CRYPTO_KEY] || null;
  const enabled = !!(localCrypto && localCrypto.enabled);
  const unlocked = enabled && !!stored[CACHED_KEY] && !!cryptoApi;
  const rawNotes = {}; for (const k of NOTE_KEYS) if (stored[k] != null) rawNotes[k] = stored[k];
  const tombstones = stored[TOMBSTONES_KEY] || {};

  // 1. push our snapshot (raw values: envelopes stay envelopes)
  const snapshot = buildSnapshot({ deviceId, notes: rawNotes, tombstones, crypto: localCrypto, ts: now() });
  let res;
  try {
    res = await fetch(daemonUrl + '/snapshot', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) });
  } catch (err) {
    const r = { status: 'no-daemon', deviceId, error: err?.message || 'daemon unreachable' };
    await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: r.status, error: r.error } });
    return r;
  }
  if (!res.ok) return { status: 'error', deviceId, error: 'daemon rejected snapshot: HTTP ' + res.status };

  // 2. pull peers
  let peersBody;
  try {
    const r = await fetch(daemonUrl + '/peers/snapshots');
    if (!r.ok) return { status: 'error', deviceId, error: 'peers fetch: HTTP ' + r.status };
    peersBody = await r.json();
  } catch (err) { return { status: 'error', deviceId, error: err?.message || 'peers fetch failed' }; }
  const peers = Array.isArray(peersBody?.peers) ? peersBody.peers : [];
  const result = { status: 'ok', deviceId, peers: [], changedKeys: [], stats: { applied: 0, deleted: 0, kept: 0 } };
  // Peers the daemon heard from but could not fetch a snapshot from (error, or no snapshot yet)
  const unreachable = peers.filter((p) => p.error);
  if (peers.length && unreachable.length === peers.length) {
    result.status = 'unreachable';
    result.peers = unreachable.map((p) => ({ id: p.id, name: p.name, state: 'unreachable', error: p.error, ...(p.via ? { via: p.via } : {}) }));
    await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: result.status, peers: result.peers } });
    return result;
  }
  if (!peers.length) {
    result.status = 'no-peers';
    await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: result.status, peers: [] } });
    return result;
  }

  if (enabled && !unlocked) {
    result.status = 'locked'; result.peers = peers.map((p) => ({ id: p.id, name: p.name, state: 'locked' }));
    await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: result.status, peers: result.peers } });
    return result;
  }

  // 3. decide per peer, decrypt what we can
  const usable = [];
  let adopt = null;
  for (const p of peers) {
    const snap = p.snapshot;
    const info = { id: p.id, name: p.name, state: 'ok' };
    if (p.via) info.via = p.via;
    if (p.error) { info.state = 'unreachable'; info.error = p.error; result.peers.push(info); continue; }
    if (!snap || snap.version !== SNAPSHOT_VERSION || snap.deviceId === deviceId) { info.state = snap ? 'self-or-unknown' : 'no-snapshot'; result.peers.push(info); continue; }
    const compat = cryptoCompatibility(localCrypto, snap.crypto);
    info.state = compat;
    if (compat === 'mismatch') { result.peers.push(info); continue; }
    if (compat === 'adopt-remote') { adopt = adopt || { peer: p.name, cfg: snap.crypto }; result.peers.push(info); continue; }
    // compatible (same salt, or both off) or remote-off: plaintext or decryptable envelopes
    const plain = {};
    let bad = false;
    for (const k of NOTE_KEYS) {
      const v = snap.notes && snap.notes[k];
      if (v == null) continue;
      if (isEnvelope(v)) {
        try { plain[k] = await cryptoApi.decrypt(v); } catch { bad = true; break; }
      } else plain[k] = v;
    }
    if (bad) { info.state = 'undecryptable'; result.peers.push(info); continue; }
    usable.push({ notes: plain, tombstones: snap.tombstones || {} });
    result.peers.push(info);
  }

  // adopt a peer's vault config: we become locked until the user enters that passphrase
  if (adopt && !enabled) {
    const remoteSnap = peers.find((p) => p.name === adopt.peer)?.snapshot;
    const cfg = remoteSnap?.cryptoFull || null;
    if (cfg && cfg.enabled && cfg.salt && cfg.verify) {
      try { await storage.set({ [CRYPTO_KEY]: cfg }); } catch {}
      result.status = 'adopted-remote-vault';
      await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: result.status, peers: result.peers } });
      return result;
    }
  }

  if (!usable.length) {
    result.status = result.peers.some((p) => p.state === 'mismatch') ? 'mismatch' : 'no-peers';
    await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: result.status, peers: result.peers } });
    return result;
  }

  // 4. merge on plaintext
  const localPlain = {};
  for (const k of NOTE_KEYS) {
    const v = rawNotes[k];
    if (v == null) continue;
    if (isEnvelope(v)) { try { localPlain[k] = await cryptoApi.decrypt(v); } catch { return { status: 'error', deviceId, error: 'cannot decrypt local ' + k }; } }
    else localPlain[k] = v;
  }
  const merged = mergeNotes({ notes: localPlain, tombstones }, usable);
  result.changedKeys = merged.changedKeys; result.stats = merged.stats;

  // 5. write changed keys (encrypting when the vault is on) + tombstones
  const writes = {};
  for (const k of merged.changedKeys) writes[k] = enabled ? await cryptoApi.encrypt(merged.notes[k]) : merged.notes[k];
  if (JSON.stringify(merged.tombstones) !== JSON.stringify(tombstones)) writes[TOMBSTONES_KEY] = merged.tombstones;
  if (Object.keys(writes).length) {
    try { await storage.set(writes); } catch (err) { return { status: 'error', deviceId, error: 'storage write failed: ' + (err?.message || err) }; }
  }
  await writeState(storage, { ...state, deviceId, lastSync: now(), lastResult: { status: 'ok', peers: result.peers, changedKeys: merged.changedKeys, stats: merged.stats } });
  return result;
}

async function writeState(storage, state) {
  try { await storage.set({ [PEER_STATE_KEY]: state }); } catch {}
}

// Helper for writers that delete a record: remember the deletion so peers drop it too.
export function addTombstone(tombstones, storageKey, recordKey, when) {
  const out = { ...(tombstones || {}) };
  out[storageKey] = { ...(out[storageKey] || {}), [recordKey]: when || new Date().toISOString() };
  return out;
}
