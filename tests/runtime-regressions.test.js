async function entered(predicate) { for (let i=0;i<200;i++) { if(predicate()) return; await new Promise(resolve=>setTimeout(resolve,1)); } throw Error('fixture callback deadline'); }
import { describe, it, expect } from 'vitest';
import { runtime } from './helpers/runtime.js';
const CONFIG = 'stickysites_crypto_v1', NOTES = 'stickysites_global_v1';
describe('actual browser modules', () => {
  it('keeps vault config and ciphertext when disabling without a key', async () => {
    const r = runtime({ [CONFIG]: { enabled: true }, [NOTES]: { iv: 'a', data: 'b' } });
    try { r.load('src/content/crypto-content.js'); await expect(r.w.StickySites.Crypto.disable()).rejects.toThrow(); expect(r.data[CONFIG].enabled).toBe(true); expect(r.data[NOTES]).toEqual({ iv: 'a', data: 'b' }); } finally { r.close(); }
  });
  it('does not enable a second vault over existing ciphertext', async () => {
    const r = runtime({ [CONFIG]: { enabled: true, salt: 'old' }, [NOTES]: { iv: 'a', data: 'b' } });
    try { r.load('src/content/crypto-content.js'); await expect(r.w.StickySites.Crypto.enable('replacement')).rejects.toThrow(); expect(r.data[CONFIG].salt).toBe('old'); } finally { r.close(); }
  });
  it('inserts a selected mention and emits input', () => {
    const r = runtime();
    try { r.load('src/content/mentions.js'); const ed = r.w.document.createElement('div'); ed.textContent = '@tod'; r.w.document.body.append(ed); const range = r.w.document.createRange(); range.setStart(ed.firstChild, 4); range.collapse(true); r.w.getSelection().addRange(range); const m = r.w.StickySites.Mentions; m.attach(ed); ed.dispatchEvent(new r.w.Event('input')); ed.dispatchEvent(new r.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); expect(ed.querySelector('.stickysites-mention-chip')).not.toBeNull(); expect(ed.textContent).not.toContain('@tod'); } finally { r.close(); }
  });
  it('refuses an unreadable outline instead of treating it as an empty library', async () => {
    const r = runtime({ stickysites_outlines_v1: { iv: 'a', data: 'b' } });
    try { r.load('src/content/crypto-content.js'); r.load('src/content/outline.js'); await expect(r.w.StickySites.Outline.readLibrary()).rejects.toThrow(); } finally { r.close(); }
  });
  it('groups inherited property names without throwing', () => {
    const r = runtime(); try { r.load('src/content/outline-ops.js'); expect(() => r.w.StickySites.OutlineOps.autoGroup([{id:'a',text:'a',tags:['constructor']},{id:'b',text:'b',tags:['constructor']}])).not.toThrow(); } finally { r.close(); }
  });
  it('normalizes malformed to-do entries individually', () => {
    const r = runtime(); try { r.load('src/content/todo.js'); expect(r.w.StickySites.Todo.normalizeData({items:[null, {text:'valid'}]}).items.map(i => i.text)).toEqual(['valid']); } finally { r.close(); }
  });
});

import { createNoteWriter } from '../src/shared/note-writer.js';
function bind(r) { const writer = createNoteWriter(r.storage); r.w.chrome.runtime.sendMessage = async msg => { try { return { ok: true, result: await writer.dispatch(msg.command) }; } catch (err) { return { ok: false, error: err.message }; } }; ['src/shared/settings.js','src/content/storage-content.js','src/content/crypto-content.js','src/content/safe-html.js','src/content/prefs.js'].forEach(r.load); return writer; }
it('serializes concurrent record, clip, deletion/tombstone, and preference mutations', async () => {
  const r = runtime(); try { const writer = bind(r); const sk='stickysites_sites_v1'; await Promise.all(['a','b'].map(key=>writer.dispatch({op:'record',storageKey:sk,key,data:{body:key}}))); expect(Object.keys(r.data[sk]).sort()).toEqual(['a','b']); await Promise.all(['first','second'].map(text=>writer.dispatch({op:'clip',storageKey:sk,key:'a',text}))); expect(r.data[sk].a.body).toContain('first'); expect(r.data[sk].a.body).toContain('second'); await Promise.all([writer.dispatch({op:'prefs',data:{enabledTypes:{site:false}}}),writer.dispatch({op:'prefs',data:{enabledTypes:{page:false}}})]); expect(r.data.stickysites_prefs_v1.enabledTypes).toMatchObject({site:false,page:false}); await writer.dispatch({op:'delete',storageKey:sk,key:'a'}); expect(r.data[sk].a).toBeUndefined(); expect(r.data.stickysites_tombstones_v1[sk].a).toBeTruthy(); } finally {r.close();}
});
it('performs a vault round trip and preserves all buckets if one ciphertext is corrupt',async()=>{
  const r=runtime({[NOTES]:{body:'private'},stickysites_sites_v1:{site:{body:'second'}}});try{bind(r);const c=r.w.StickySites.Crypto;await c.enable('pass');const original=structuredClone(r.data);expect(r.data[NOTES].iv).toBeTruthy();await expect(c.enable('other')).rejects.toThrow('VAULT_ALREADY_ENABLED');await r.storage.set({stickysites_sites_v1:{iv:'bad',data:'bad'}});const broken=structuredClone(r.data);await expect(c.disable()).rejects.toThrow();expect(r.data).toEqual(broken);await r.storage.set(original);await c.disable();expect(r.data[NOTES]).toEqual({body:'private'});expect(r.data[CONFIG]).toBeNull();}finally{r.close();}
});
it('a pending key import cannot undo Lock Now',async()=>{
  const r=runtime();try{bind(r);const c=r.w.StickySites.Crypto;await c.enable('pass');c._cachedKey=null;let release;const actual=c.importJwk.bind(c);c.importJwk=jwk=>new Promise(resolve=>{release=async()=>resolve(await actual(jwk));});const pending=c.getCachedKey();await entered(()=>release);await c.clearCachedKey();await release();expect(await pending).toBeNull();expect(await c.getCachedKey()).toBeNull();}finally{r.close();}
});
it('preserves locked records through the actual panel writer and refuses unreadable reads',async()=>{
  const r=runtime({[CONFIG]:{enabled:true},[NOTES]:{iv:'x',data:'y'}});try{bind(r);r.load('src/content/panel.js');const p=r.w.StickySites.Panel;p._activeKey='__global__';const nt={storageKey:NOTES,storagePattern:'single'};expect(await p._writeNote(nt,'replacement',[])).toBeNull();expect(r.data[NOTES]).toEqual({iv:'x',data:'y'});await expect(p._readNote(nt)).rejects.toThrow();}finally{r.close();}
});
it('keeps the newest panel open when an earlier asynchronous read finishes last',async()=>{
  const r=runtime();try{bind(r);r.load('src/content/panel.js');const p=r.w.StickySites.Panel;p.init(()=>{});p._addResizeGrips=()=>{};let release;const a={id:'a',getKey:()=> 'a',getLabel:()=> 'A'},b={id:'b',getKey:()=> 'b',getLabel:()=> 'B'};p._readNote=nt=>nt===a?new Promise(resolve=>{release=resolve;}):Promise.resolve({body:'B'});const rendered=[];p._render=nt=>rendered.push(nt.id);const older=p.open(a);await entered(()=>release);await p.open(b);release({body:'A'});await older;expect(rendered).toEqual(['b']);expect(p._activeKey).toBe('b');}finally{r.close();}
});
it('flush waits for a save whose debounce already fired',async()=>{
  const r=runtime();try{bind(r);r.load('src/content/panel.js');const p=r.w.StickySites.Panel;let release;const pending=new Promise(resolve=>{release=resolve;});p._trackSave(pending);let done=false;const flush=p.flushPendingSave().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);release();await flush;expect(done).toBe(true);}finally{r.close();}
});
it('sanitizes imported rich text before it can create live resource or event nodes',()=>{
  const r=runtime();try{bind(r);const html=r.w.StickySites.Html.sanitize('<p onclick="x()">hello<img src="https://leak.test"><a href="javascript:x()">link</a><span style="color:red;background-image:url(https://leak.test)">red</span></p><script>x()</script>');const ed=r.w.document.createElement('div');ed.innerHTML=html;expect(ed.querySelector('img,script,[onclick],[src]')).toBeNull();expect(ed.querySelector('a').hasAttribute('href')).toBe(false);expect(ed.querySelector('span').style.backgroundImage).toBe('');expect(ed.querySelector('span').style.color).toBe('red');expect(ed.textContent).toBe('hellolinkred');expect(r.w.StickySites.Html.text('<p>one</p><p>two<br>three</p>')).toBe('one\ntwo\nthree');}finally{r.close();}
});
it('rejects stale guarded commits and reports a failed storage readback',async()=>{
  const r=runtime({[NOTES]:{body:'new'}});try{const writer=bind(r);await expect(writer.commit({[NOTES]:{body:'old'}},{[NOTES]:{body:'stale'}})).rejects.toThrow('STATE_CHANGED');r.storage.set=async()=>{};await expect(writer.dispatch({op:'prefs',data:{collapseToCircle:true}})).rejects.toThrow('STORAGE_VERIFY_FAILED');}finally{r.close();}
});
it('cancels a quoted-ID drag on blur and accepts another drag after refocus',()=>{
  const r=runtime();try{r.load('src/content/todo.js');const list=r.w.document.createElement('div');list.innerHTML='<div data-item-id="a"><div class="stickysites-todo-item"><span class="stickysites-todo-grip">grip</span></div></div><div><div class="stickysites-todo-item">target</div></div>';list.lastChild.setAttribute('data-item-id','"');r.w.document.body.append(list);const items=[{id:'a'},{id:'"'}],drag=r.w.StickySites.Todo.DragController;let reordered=0;drag.init(list,()=>items,()=>[],()=>reordered++);const start=()=>list.querySelector('.stickysites-todo-grip').dispatchEvent(new r.w.MouseEvent('mousedown',{button:0,bubbles:true}));start();r.w.document.dispatchEvent(new r.w.MouseEvent('mousemove',{clientY:20}));expect(drag._indicator).not.toBeNull();r.w.dispatchEvent(new r.w.Event('blur'));expect(drag._dragging).toBe(false);expect(drag._indicator).toBeNull();start();expect(drag._dragging).toBe(true);r.w.document.dispatchEvent(new r.w.MouseEvent('mousemove',{clientY:20}));r.w.document.dispatchEvent(new r.w.MouseEvent('mouseup'));expect(reordered).toBe(1);expect(items[1].id).toBe('a');}finally{r.close();}
});
it('does not commit plaintext through a guarded write under an enabled vault',async()=>{
  const r=runtime({[CONFIG]:{enabled:true},[NOTES]:{iv:'a',data:'b'}});try{const writer=bind(r);await expect(writer.commit({[CONFIG]:r.data[CONFIG],[NOTES]:r.data[NOTES]},{[NOTES]:{body:'plaintext'}})).rejects.toThrow('PLAINTEXT_FORBIDDEN');expect(r.data[NOTES]).toEqual({iv:'a',data:'b'});}finally{r.close();}
});
