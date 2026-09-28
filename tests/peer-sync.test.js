import { describe, it, expect } from 'vitest';
import {
  NOTE_KEYS, TOMBSTONES_KEY, CRYPTO_KEY, CACHED_KEY, PEER_STATE_KEY,
  buildSnapshot, recordsOf, fromRecords, cryptoCompatibility, mergeNotes, syncWithDaemon, addTombstone, isEnvelope, genDeviceId
} from '../src/shared/peer-sync.js';

const site = (key, body, updatedAt) => ({ key, label: key, body, tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt });

describe('recordsOf / fromRecords', () => {
  it('maps the single global note to one record and back', () => {
    const g = { body: 'hi', updatedAt: '2026-01-02T00:00:00.000Z' };
    const recs = recordsOf('stickysites_global_v1', g);
    expect(Object.keys(recs)).toEqual(['__single__']);
    expect(fromRecords('stickysites_global_v1', recs)).toEqual(g);
    expect(fromRecords('stickysites_global_v1', {})).toEqual({ body: '', updatedAt: '' });
  });
  it('passes map records through and ignores junk', () => {
    const recs = recordsOf('stickysites_sites_v1', { a: site('a', 'x', '1'), b: null, c: 'nope' });
    expect(Object.keys(recs)).toEqual(['a']);
  });
  it('treats non-objects as empty', () => {
    expect(recordsOf('stickysites_sites_v1', undefined)).toEqual({});
    expect(recordsOf('stickysites_global_v1', {})).toEqual({});
  });
});

describe('buildSnapshot', () => {
  it('includes only note keys and a reduced crypto config', () => {
    const snap = buildSnapshot({ deviceId: 'd1', notes: { stickysites_sites_v1: {}, stickysites_prefs_v1: { x: 1 } }, tombstones: {}, crypto: { enabled: true, salt: 's', verify: { iv: 'a', data: 'b' } }, ts: 'T' });
    expect(snap).toEqual({ version: 1, deviceId: 'd1', ts: 'T', notes: { stickysites_sites_v1: {} }, tombstones: {}, crypto: { enabled: true, salt: 's' }, cryptoFull: { enabled: true, salt: 's', verify: { iv: 'a', data: 'b' } } });
  });
  it('emits crypto null when disabled', () => {
    const off = buildSnapshot({ deviceId: 'd', notes: {}, crypto: { enabled: false }, ts: 'T' });
    expect(off.crypto).toBeNull();
    expect(off.cryptoFull).toBeUndefined();
  });
});

describe('cryptoCompatibility', () => {
  it('classifies every combination', () => {
    expect(cryptoCompatibility(null, null)).toBe('compatible');
    expect(cryptoCompatibility(null, { enabled: true, salt: 'a' })).toBe('adopt-remote');
    expect(cryptoCompatibility({ enabled: true, salt: 'a' }, null)).toBe('remote-off');
    expect(cryptoCompatibility({ enabled: true, salt: 'a' }, { enabled: true, salt: 'a' })).toBe('compatible');
    expect(cryptoCompatibility({ enabled: true, salt: 'a' }, { enabled: true, salt: 'b' })).toBe('mismatch');
  });
});

describe('mergeNotes', () => {
  it('newer remote record wins, older remote record loses, ties keep local', () => {
    const local = { notes: { stickysites_sites_v1: { a: site('a', 'local-a', '2026-01-02T00:00:00Z'), b: site('b', 'local-b', '2026-01-05T00:00:00Z'), c: site('c', 'local-c', '2026-01-03T00:00:00Z') } } };
    const remote = { notes: { stickysites_sites_v1: { a: site('a', 'remote-a', '2026-01-03T00:00:00Z'), b: site('b', 'remote-b', '2026-01-04T00:00:00Z'), c: site('c', 'remote-c', '2026-01-03T00:00:00Z') } } };
    const m = mergeNotes(local, [remote]);
    const s = m.notes.stickysites_sites_v1;
    expect(s.a.body).toBe('remote-a');
    expect(s.b.body).toBe('local-b');
    expect(s.c.body).toBe('local-c');
    expect(m.changedKeys).toEqual(['stickysites_sites_v1']);
    expect(m.stats).toEqual({ applied: 1, deleted: 0, kept: 2 });
  });
  it('adds records only the remote has and reports no change for identical data', () => {
    const local = { notes: { stickysites_pages_v1: { p: site('p', 'x', '2026-01-01T00:00:00Z') } } };
    const remote = { notes: { stickysites_pages_v1: { p: site('p', 'x', '2026-01-01T00:00:00Z'), q: site('q', 'y', '2026-01-01T00:00:00Z') } } };
    const m = mergeNotes(local, [remote]);
    expect(Object.keys(m.notes.stickysites_pages_v1).sort()).toEqual(['p', 'q']);
    expect(m.changedKeys).toEqual(['stickysites_pages_v1']);
    expect(mergeNotes(local, [local]).changedKeys).toEqual([]);
  });
  it('a newer tombstone deletes a record on both sides; an older one does not', () => {
    const local = { notes: { stickysites_daily_v1: { '2026-01-01': site('2026-01-01', 'old', '2026-01-01T00:00:00Z'), '2026-01-02': site('2026-01-02', 'kept', '2026-01-09T00:00:00Z') } }, tombstones: {} };
    const remote = { notes: {}, tombstones: { stickysites_daily_v1: { '2026-01-01': '2026-01-05T00:00:00Z', '2026-01-02': '2026-01-05T00:00:00Z' } } };
    const m = mergeNotes(local, [remote]);
    expect(m.notes.stickysites_daily_v1['2026-01-01']).toBeUndefined();
    expect(m.notes.stickysites_daily_v1['2026-01-02'].body).toBe('kept');
    expect(m.tombstones.stickysites_daily_v1).toEqual({ '2026-01-01': '2026-01-05T00:00:00Z' });
    expect(m.stats.deleted).toBe(1);
  });
  it('merges the global note by updatedAt and todos as one record', () => {
    const local = { notes: { stickysites_global_v1: { body: 'L', updatedAt: '2026-01-01T00:00:00Z' }, stickysites_todos_v1: { __global__: { key: '__global__', items: [{ id: '1' }], updatedAt: '2026-01-03T00:00:00Z' } } } };
    const remote = { notes: { stickysites_global_v1: { body: 'R', updatedAt: '2026-01-02T00:00:00Z' }, stickysites_todos_v1: { __global__: { key: '__global__', items: [], updatedAt: '2026-01-02T00:00:00Z' } } } };
    const m = mergeNotes(local, [remote]);
    expect(m.notes.stickysites_global_v1.body).toBe('R');
    expect(m.notes.stickysites_todos_v1.__global__.items).toEqual([{ id: '1' }]);
    expect(m.changedKeys).toEqual(['stickysites_global_v1']);
  });
  it('records without updatedAt lose to any timestamped record', () => {
    const local = { notes: { stickysites_sites_v1: { a: { key: 'a', body: 'legacy' } } } };
    const remote = { notes: { stickysites_sites_v1: { a: site('a', 'new', '2026-01-01T00:00:00Z') } } };
    expect(mergeNotes(local, [remote]).notes.stickysites_sites_v1.a.body).toBe('new');
  });
  it('handles three peers', () => {
    const mk = (b, t) => ({ notes: { stickysites_sites_v1: { a: site('a', b, t) } } });
    const m = mergeNotes(mk('l', '2026-01-01T00:00:00Z'), [mk('r1', '2026-01-03T00:00:00Z'), mk('r2', '2026-01-02T00:00:00Z')]);
    expect(m.notes.stickysites_sites_v1.a.body).toBe('r1');
  });
});

describe('addTombstone / helpers', () => {
  it('adds without mutating', () => {
    const t = { stickysites_sites_v1: { a: 'T1' } };
    const out = addTombstone(t, 'stickysites_sites_v1', 'b', 'T2');
    expect(out.stickysites_sites_v1).toEqual({ a: 'T1', b: 'T2' });
    expect(t.stickysites_sites_v1).toEqual({ a: 'T1' });
  });
  it('isEnvelope and genDeviceId', () => {
    expect(isEnvelope({ iv: 'a', data: 'b' })).toBe(true);
    expect(isEnvelope({ iv: 'a', data: 'b', body: 'x' })).toBe(false);
    expect(genDeviceId()).toMatch(/^dev_[0-9a-f]{16}$/);
  });
});

// ── syncWithDaemon orchestration with fakes ──────────────────────────────────
function fakeStorage(init) {
  const store = { ...init };
  return {
    store,
    get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, store[k]])),
    set: async (obj) => { Object.assign(store, obj); }
  };
}
function fakeFetch({ peers = [], putStatus = 200, fail = false }) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts) => {
      calls.push({ url, opts });
      if (fail) throw new Error('ECONNREFUSED');
      if (url.endsWith('/snapshot')) return { ok: putStatus === 200, status: putStatus };
      if (url.endsWith('/peers/snapshots')) return { ok: true, status: 200, json: async () => ({ peers }) };
      return { ok: false, status: 404 };
    }
  };
}
const fakeCrypto = { decrypt: async (v) => JSON.parse(Buffer.from(v.data, 'base64').toString()), encrypt: async (v) => ({ iv: 'iv', data: Buffer.from(JSON.stringify(v)).toString('base64') }) };
const enc = (v) => ({ iv: 'iv', data: Buffer.from(JSON.stringify(v)).toString('base64') });

describe('syncWithDaemon', () => {
  it('reports no-daemon when the loopback fetch fails, touches no notes, records the status', async () => {
    const storage = fakeStorage({ stickysites_sites_v1: { a: site('a', 'x', '1') } });
    const { fetch } = fakeFetch({ fail: true });
    const r = await syncWithDaemon({ storage, fetch });
    expect(r.status).toBe('no-daemon');
    expect(storage.store.stickysites_sites_v1.a.body).toBe('x');
    expect(storage.store[PEER_STATE_KEY].lastResult.status).toBe('no-daemon');
  });
  it('respects the enabled=false switch', async () => {
    const storage = fakeStorage({ [PEER_STATE_KEY]: { enabled: false } });
    const { fetch, calls } = fakeFetch({});
    expect((await syncWithDaemon({ storage, fetch })).status).toBe('disabled');
    expect(calls.length).toBe(0);
  });
  it('pushes a snapshot, applies a newer remote record, and records state', async () => {
    const storage = fakeStorage({ stickysites_sites_v1: { a: site('a', 'local', '2026-01-01T00:00:00Z') } });
    const remote = { id: 'p1', name: 'laptop-b', snapshot: { version: 1, deviceId: 'dev_b', ts: 'T', notes: { stickysites_sites_v1: { a: site('a', 'remote', '2026-01-02T00:00:00Z') } }, tombstones: {}, crypto: null } };
    const { fetch, calls } = fakeFetch({ peers: [remote] });
    const r = await syncWithDaemon({ storage, fetch, now: () => 'NOW' });
    expect(r.status).toBe('ok');
    expect(calls[0].opts.method).toBe('PUT');
    const pushed = JSON.parse(calls[0].opts.body);
    expect(pushed.notes.stickysites_sites_v1.a.body).toBe('local');
    expect(storage.store.stickysites_sites_v1.a.body).toBe('remote');
    expect(storage.store[PEER_STATE_KEY].lastSync).toBe('NOW');
    expect(storage.store[PEER_STATE_KEY].deviceId).toMatch(/^dev_/);
    expect(storage.store[PEER_STATE_KEY].lastResult.stats.applied).toBe(1);
  });
  it('ignores its own snapshot echoed back and reports no-peers', async () => {
    const storage = fakeStorage({ [PEER_STATE_KEY]: { deviceId: 'dev_me' }, stickysites_sites_v1: {} });
    const { fetch } = fakeFetch({ peers: [{ id: 'x', name: 'me', snapshot: { version: 1, deviceId: 'dev_me', notes: {}, tombstones: {}, crypto: null } }] });
    const r = await syncWithDaemon({ storage, fetch });
    expect(r.status).toBe('no-peers');
    expect(storage.store[PEER_STATE_KEY].lastResult.status).toBe('no-peers');
    expect(storage.store[PEER_STATE_KEY].lastResult.peers).toEqual([{ id: 'x', name: 'me', state: 'self-or-unknown' }]);
    expect(storage.store[PEER_STATE_KEY].deviceId).toBe('dev_me');
  });
  it('skips merging while the local vault is locked', async () => {
    const storage = fakeStorage({ [CRYPTO_KEY]: { enabled: true, salt: 's', verify: {} }, stickysites_sites_v1: enc({}) });
    const { fetch } = fakeFetch({ peers: [{ id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: {}, tombstones: {}, crypto: { enabled: true, salt: 's' } } }] });
    const r = await syncWithDaemon({ storage, fetch, cryptoApi: fakeCrypto });
    expect(r.status).toBe('locked');
    expect(storage.store.stickysites_sites_v1).toEqual(enc({}));
    expect(storage.store[PEER_STATE_KEY].lastResult.status).toBe('locked');
  });
  it('merges decrypted envelopes when both vaults share a salt and re-encrypts the result', async () => {
    const storage = fakeStorage({ [CRYPTO_KEY]: { enabled: true, salt: 's', verify: {} }, [CACHED_KEY]: { k: 1 }, stickysites_sites_v1: enc({ a: site('a', 'local', '2026-01-01T00:00:00Z') }) });
    const remote = { id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: { stickysites_sites_v1: enc({ a: site('a', 'remote', '2026-01-02T00:00:00Z') }) }, tombstones: {}, crypto: { enabled: true, salt: 's' } } };
    const { fetch } = fakeFetch({ peers: [remote] });
    const r = await syncWithDaemon({ storage, fetch, cryptoApi: fakeCrypto });
    expect(r.status).toBe('ok');
    expect(isEnvelope(storage.store.stickysites_sites_v1)).toBe(true);
    expect((await fakeCrypto.decrypt(storage.store.stickysites_sites_v1)).a.body).toBe('remote');
  });
  it('reports mismatch and changes nothing when salts differ', async () => {
    const storage = fakeStorage({ [CRYPTO_KEY]: { enabled: true, salt: 's1', verify: {} }, [CACHED_KEY]: { k: 1 }, stickysites_sites_v1: enc({ a: site('a', 'local', '1') }) });
    const { fetch } = fakeFetch({ peers: [{ id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: { stickysites_sites_v1: enc({}) }, tombstones: {}, crypto: { enabled: true, salt: 's2' } } }] });
    const r = await syncWithDaemon({ storage, fetch, cryptoApi: fakeCrypto });
    expect(r.status).toBe('mismatch');
    expect(r.peers[0].state).toBe('mismatch');
    expect(storage.store[PEER_STATE_KEY].lastResult.status).toBe('mismatch');
  });
  it('adopts a remote vault config when local encryption is off', async () => {
    const storage = fakeStorage({ stickysites_sites_v1: { a: site('a', 'plain', '1') } });
    const cfg = { enabled: true, salt: 's', verify: { iv: 'v', data: 'd' } };
    const { fetch } = fakeFetch({ peers: [{ id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: {}, tombstones: {}, crypto: { enabled: true, salt: 's' }, cryptoFull: cfg } }] });
    const r = await syncWithDaemon({ storage, fetch });
    expect(r.status).toBe('adopted-remote-vault');
    expect(storage.store[CRYPTO_KEY]).toEqual(cfg);
    expect(storage.store.stickysites_sites_v1.a.body).toBe('plain'); // untouched until unlocked
  });
  it('merges a plaintext peer into an unlocked vault (remote-off)', async () => {
    const storage = fakeStorage({ [CRYPTO_KEY]: { enabled: true, salt: 's', verify: {} }, [CACHED_KEY]: { k: 1 }, stickysites_sites_v1: enc({}) });
    const { fetch } = fakeFetch({ peers: [{ id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: { stickysites_sites_v1: { a: site('a', 'from-plain', '2026-01-01T00:00:00Z') } }, tombstones: {}, crypto: null } }] });
    const r = await syncWithDaemon({ storage, fetch, cryptoApi: fakeCrypto });
    expect(r.status).toBe('ok');
    expect((await fakeCrypto.decrypt(storage.store.stickysites_sites_v1)).a.body).toBe('from-plain');
  });
  it('propagates tombstones from a peer and persists the merged tombstone map', async () => {
    const storage = fakeStorage({ stickysites_outlines_v1: { ol_1: { key: 'ol_1', name: 'x', items: [], updatedAt: '2026-01-01T00:00:00Z' } } });
    const { fetch } = fakeFetch({ peers: [{ id: 'p', name: 'b', snapshot: { version: 1, deviceId: 'dev_b', notes: {}, tombstones: { stickysites_outlines_v1: { ol_1: '2026-01-02T00:00:00Z' } }, crypto: null } }] });
    const r = await syncWithDaemon({ storage, fetch });
    expect(r.stats.deleted).toBe(1);
    expect(storage.store.stickysites_outlines_v1).toEqual({});
    expect(storage.store[TOMBSTONES_KEY]).toEqual({ stickysites_outlines_v1: { ol_1: '2026-01-02T00:00:00Z' } });
  });
});
