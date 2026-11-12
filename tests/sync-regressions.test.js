import { it, expect, vi } from 'vitest';
import { runtime } from './helpers/runtime.js';
import { syncWithDaemon, CRYPTO_KEY, CACHED_KEY, NOTE_KEYS } from '../src/shared/peer-sync.js';
import { syncTodosWithHost, TODOS_KEY } from '../src/shared/todo-bridge.js';
const peer = { name: 'p', id: 'p', snapshot: { version: 1, deviceId: 'p', notes: { [NOTE_KEYS[0]]: { body: 'remote', updatedAt: '2026-03-01' } } } };
it('ignores malformed peer entries without losing a valid peer', async () => {
  const r = runtime(); try { const result = await syncWithDaemon({storage:r.storage, fetch:async url=>url.endsWith('/snapshot')?{ok:true}:{ok:true,json:async()=>({peers:[null,3,peer]})}}); expect(result.status).toBe('ok'); expect(r.data[NOTE_KEYS[0]].body).toBe('remote'); } finally { r.close(); }
});
it('does not overwrite a note edited while peer fetch is pending', async () => {
  const r = runtime({[NOTE_KEYS[0]]:{body:'original',updatedAt:'2026-01-01'}}); try { const result = await syncWithDaemon({ storage:r.storage, fetch:async url=> {if(url.endsWith('/snapshot'))return {ok:true}; await r.storage.set({[NOTE_KEYS[0]]:{body:'new local',updatedAt:'2026-02-01'}});return {ok:true,json:async()=>({peers:[peer]})};}}); expect(result.status).toBe('error'); expect(r.data[NOTE_KEYS[0]].body).toBe('new local'); } finally {r.close();}
});
it.each([[null], [{}], [{id:'a'},{id:'a'}]])('rejects malformed native reply identities: %j', async (...items) => {
  const r=runtime({[TODOS_KEY]:{__global__:{items:[{id:'original',text:'kept'}]}}}); try{const result=await syncTodosWithHost({storage:r.storage,extId:'test',sendNativeMessage:async()=>({ok:true,items})});expect(result.error).toBeTruthy();expect(r.data[TODOS_KEY].__global__.items[0].id).toBe('original');}finally{r.close();}
});
it('does not replace a newer vault when native response arrives',async()=>{
  const r=runtime({[TODOS_KEY]:{__global__:{items:[]}}});try{const result=await syncTodosWithHost({storage:r.storage,extId:'test',sendNativeMessage:async()=>{await r.storage.set({[CRYPTO_KEY]:{enabled:true},[TODOS_KEY]:{iv:'i',data:'encrypted'}});return{ok:true,items:[{id:'a'}]};}});expect(result.error).toBeTruthy();expect(r.data[TODOS_KEY]).toEqual({iv:'i',data:'encrypted'});}finally{r.close();}
});
it('bounds a peer response body that never resolves',async()=>{
  vi.useFakeTimers();const r=runtime();try{const pending=syncWithDaemon({storage:r.storage,fetch:async url=>url.endsWith('/snapshot')?{ok:true}:{ok:true,json:()=>new Promise(()=>{})}});await vi.advanceTimersByTimeAsync(10001);expect((await pending).status).toBe('error');}finally{r.close();vi.useRealTimers();}
});

import { mergeNotes } from '../src/shared/peer-sync.js';
import { applyHostResult } from '../src/shared/todo-bridge.js';
it('rejects poisoned timestamps and orders valid instants instead of their spelling',()=>{
  const key=NOTE_KEYS[0];const local={notes:{[key]:{body:'local',updatedAt:'2026-01-01T11:00:00+02:00'}}};
  const result=mergeNotes(local,[{notes:{[key]:{body:'poison',updatedAt:'z'}},tombstones:{[key]:{__single__:'z'}}},{notes:{[key]:{body:'newer',updatedAt:'2026-01-01T10:00:00Z'}}}]);expect(result.notes[key].body).toBe('newer');expect(result.tombstones[key]).toBeUndefined();
});
it('keeps local records on equal parsed instants with different precision',()=>{
  const key=NOTE_KEYS[0];const result=mergeNotes({notes:{[key]:{body:'local',updatedAt:'2026-01-01T00:00:00.900Z'}}},[{notes:{[key]:{body:'remote',updatedAt:'2026-01-01T00:00:00.9Z'}}}]);expect(result.notes[key].body).toBe('local');
});
it('accepts removal of host-owned grouping while preserving user-owned grouping',()=>{
  const host={items:[{id:'a',text:'A',section:'s'}],sections:[{id:'s',name:'Groceries',origin:'host'}]};const result=applyHostResult(host,[{id:'a',text:'A',section:''}]);expect(result.items[0].section).toBe('');expect(result.sections).toEqual([]);
});
