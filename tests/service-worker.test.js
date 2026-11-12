import { it, expect, vi } from 'vitest';
import { runtime } from './helpers/runtime.js';
it('Sync now awaits the already active actual service-worker round',async()=>{
  vi.useFakeTimers();const r=runtime();const messages=[],alarms=[];const event={addListener(){}};
  try{
    const chrome={storage:{local:r.storage,onChanged:{addListener(){}}},runtime:{id:'fixture',onMessage:{addListener:fn=>messages.push(fn)},onInstalled:event,onStartup:event},alarms:{create(){},onAlarm:{addListener:fn=>alarms.push(fn)}},contextMenus:{create(){},onClicked:event},commands:{onCommand:event}};
    vi.stubGlobal('chrome',chrome);let release;
    const fetch=vi.fn(url=>url.endsWith('/snapshot')?new Promise(resolve=>{release=()=>resolve({ok:true});}):Promise.resolve({ok:true,json:async()=>({peers:[]})}));vi.stubGlobal('fetch',fetch);
    await import('../src/background/service-worker.js');alarms.forEach(fn=>fn({name:'stickysites-peer-sync'}));
    for(let i=0;i<20&&!release;i++)await Promise.resolve();expect(release).toBeTypeOf('function');
    const response=vi.fn();expect(messages.map(fn=>fn({type:'STICKYSITES_PEER_SYNC_NOW'},{},response))).toContain(true);await Promise.resolve();expect(response).not.toHaveBeenCalled();release();
    for(let i=0;i<40&&!response.mock.calls.length;i++)await Promise.resolve();expect(response).toHaveBeenCalledWith({ok:true,state:expect.objectContaining({lastResult:expect.objectContaining({status:'no-peers'})})});
  }finally{r.close();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();}
});

it('handles HTTP-content vault operations in the actual worker without content WebCrypto', async () => {
  vi.resetModules();
  const { webcrypto } = await import('node:crypto');
  const r = runtime({}, '', { url: 'http://example.test/page', crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } });
  const messages = [], event = { addListener() {} };
  try {
    vi.stubGlobal('crypto', webcrypto);
    const chrome = { storage: { local: r.storage, onChanged: { addListener() {} } }, runtime: { id: 'fixture', onMessage: { addListener: fn => messages.push(fn) }, onInstalled: event, onStartup: event }, alarms: { create() {}, onAlarm: event }, contextMenus: { create() {}, onClicked: event }, commands: { onCommand: event } };
    vi.stubGlobal('chrome', chrome);
    await import('../src/background/service-worker.js');
    r.w.chrome.runtime.sendMessage = message => new Promise((resolve, reject) => {
      const returns = messages.map(fn => fn(message, {}, resolve));
      if (!returns.includes(true)) reject(Error('ASYNC_CHANNEL_CLOSED'));
    });
    for (const file of ['src/content/storage-content.js', 'src/content/crypto-content.js']) r.load(file);
    const C = r.w.StickySites.Crypto;
    await r.storage.set({ stickysites_global_v1: { body: 'HTTP private note' } });
    await C.enable('fixture-pass');
    expect(r.data.stickysites_global_v1).toMatchObject({ iv: expect.any(String), data: expect.any(String) });
    expect(r.data.stickysites_global_v1.body).toBeUndefined();
    expect(await C.getCachedKey()).toBeTruthy();
    expect((await C.decryptValue(r.data.stickysites_global_v1)).body).toBe('HTTP private note');
    await C.clearCachedKey(); expect(await C.getCachedKey()).toBeNull();
    expect(await C.unlock('wrong')).toBe(false); expect(await C.unlock('fixture-pass')).toBe(true);
    expect((await C.decryptValue(r.data.stickysites_global_v1)).body).toBe('HTTP private note');
    await C.disable(); expect(r.data.stickysites_global_v1.body).toBe('HTTP private note');
  } finally { r.close(); vi.unstubAllGlobals(); }
});
it('opens a fixed extension-origin unlock window and retains the asynchronous message channel', async () => {
  vi.resetModules(); const r = runtime(), messages = [], event = { addListener() {} }, create = vi.fn(async () => ({}));
  try {
    vi.stubGlobal('chrome', { storage: { local: r.storage, onChanged: event }, runtime: { id: 'fixture', getURL: path => 'chrome-extension://fixture/' + path, onMessage: { addListener: fn => messages.push(fn) }, onInstalled: event, onStartup: event }, alarms: { create() {}, onAlarm: event }, contextMenus: { create() {}, onClicked: event }, commands: { onCommand: event }, windows: { create } });
    await import('../src/background/service-worker.js'); const reply = vi.fn();
    const returns = messages.map(fn => fn({ type: 'STICKYSITES_UNLOCK', url: 'https://evil.test' }, {}, reply)); expect(returns).toContain(true);
    await Promise.resolve(); expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://fixture/popup.html?unlock=1', type: 'popup', width: 400, height: 600 }); expect(reply).toHaveBeenCalledWith({ ok: true });
  } finally { r.close(); vi.unstubAllGlobals(); }
});

it('rejects a vault rotation during adapter creation and encrypts a subsequent round with the current key', async () => {
  vi.resetModules();
  const { webcrypto } = await import('node:crypto');
  const { importJwk, decrypt } = await import('../src/shared/crypto.js');
  const makeJwk = async () => webcrypto.subtle.exportKey('jwk', await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']));
  const a = await makeJwk(), b = await makeJwk(), config = 'stickysites_crypto_v1', cached = 'stickysites_cached_key', note = 'stickysites_global_v1';
  const r = runtime({ [config]: { enabled: true, salt: 'a' }, [cached]: a }), alarms = [], messages = [], event = { addListener() {} };
  const imported = webcrypto.subtle.importKey.bind(webcrypto.subtle); let rotated = false;
  try {
    vi.stubGlobal('crypto', webcrypto);
    vi.spyOn(webcrypto.subtle, 'importKey').mockImplementation(async (...args) => {
      const key = await imported(...args);
      if (!rotated) { rotated = true; await r.storage.set({ [config]: { enabled: true, salt: 'b' }, [cached]: b }); }
      return key;
    });
    vi.stubGlobal('chrome', { storage: { local: r.storage, onChanged: event }, runtime: { id: 'fixture', onMessage: { addListener: fn => messages.push(fn) }, onInstalled: event, onStartup: event }, alarms: { create() {}, onAlarm: { addListener: fn => alarms.push(fn) } }, contextMenus: { create() {}, onClicked: event }, commands: { onCommand: event } });
    vi.stubGlobal('fetch', async url => url.endsWith('/snapshot') ? { ok: true } : { ok: true, json: async () => ({ peers: [{ snapshot: { version: 1, deviceId: 'remote', notes: { [note]: { body: 'imported note', updatedAt: '2026-11-12T12:00:00Z' } } } }] }) });
    await import('../src/background/service-worker.js');
    function round() { return new Promise(resolve => { messages.forEach(fn => fn({ type: 'STICKYSITES_PEER_SYNC_NOW' }, {}, resolve)); }); }
    await round(); expect(rotated).toBe(true); expect(r.data[note]).toBeUndefined();
    await round();
    const currentKey = await importJwk(b);
    expect(JSON.parse(await decrypt(currentKey, r.data[note])).body).toBe('imported note');
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); r.close(); }
});
