import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runtime } from './helpers/runtime.js';
import { createNoteWriter } from '../src/shared/note-writer.js';
const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const settle = async predicate => { for (let i=0;i<200;i++) { if(predicate())return; await new Promise(resolve=>setTimeout(resolve,1)); } throw Error('fixture did not settle'); };
it('loads the manifest scripts and edits every actual panel type through the worker writer',async()=>{
  const r=runtime();
  try {
    const writer=createNoteWriter(r.storage), incoming=[];
    r.w.chrome.runtime.onMessage.addListener=fn=>incoming.push(fn);
    r.w.chrome.runtime.sendMessage=async msg=>{try{return{ok:true,result:await writer.dispatch(msg.command)};}catch(err){return{ok:false,error:err.message};}};
    manifest.content_scripts[0].js.forEach(r.load);
    await settle(()=>r.w.document.querySelectorAll('.stickysites-cluster-icon').length===6);
    const ss=r.w.StickySites;
    for (const id of ['global','site','page','daily']) {
      const nt=ss.noteTypes.find(t=>t.id===id);
      await ss.Panel.open(nt);
      const editor=ss.Panel.el.querySelector('.stickysites-panel-editor');
      expect(editor).not.toBeNull();editor.innerHTML='<p>'+id+' text</p>';editor.dispatchEvent(new r.w.Event('input',{bubbles:true}));
      await ss.Panel.flushPendingSave();
      const raw=r.data[nt.storageKey],record=nt.storagePattern==='single'?raw:raw[nt.getKey(r.w.location)];expect(record.body).toContain(id+' text');
    }
    const todo=ss.noteTypes.find(t=>t.id==='todo');await ss.Panel.open(todo);const task=ss.Panel.el.querySelector('.stickysites-todo-text');task.value='actual task edit';task.dispatchEvent(new r.w.Event('input'));await ss.Panel.flushPendingSave();expect(r.data.stickysites_todos_v1.__global__.items[0].text).toBe('actual task edit');
    const outline=ss.noteTypes.find(t=>t.id==='outline');await ss.Panel.open(outline);const node=ss.Panel.el.querySelector('.stickysites-outline-text');node.value='actual outline edit';node.dispatchEvent(new r.w.Event('input'));await ss.Panel.flushPendingSave();expect(Object.values(r.data.stickysites_outlines_v1)[0].items[0].text).toBe('actual outline edit');expect(Object.keys(r.data.stickysites_outlines_v1)).toHaveLength(1);
    incoming.forEach(fn=>fn({type:'STICKYSITES_CLIP',noteTypeId:'global',text:'clipped text'}));
    await settle(()=>r.data.stickysites_global_v1.body.includes('clipped text'));
    await ss.Crypto.enable('integration-pass');await ss.Panel.open(ss.noteTypes[0]);expect(ss.Panel.el.textContent).toContain('Global');await ss.Crypto.clearCachedKey();await settle(()=>r.w.document.getElementById('stickysites-lock'));expect(ss.Panel.el.textContent).not.toContain('clipped text');expect(r.data.stickysites_global_v1.iv).toBeTruthy();expect(r.w.document.querySelector('#stickysites-lock input[type=password]')).toBeNull();const sent=[];const original=r.w.chrome.runtime.sendMessage;r.w.chrome.runtime.sendMessage=async msg=>{sent.push(msg);return msg.type==='STICKYSITES_UNLOCK'?{ok:true}:original(msg);};r.w.document.querySelector('.stickysites-lock-btn').click();await settle(()=>sent.length);expect(sent).toContainEqual({type:'STICKYSITES_UNLOCK'});await ss.Crypto.unlock('integration-pass');await settle(()=>!r.w.document.getElementById('stickysites-lock'));await settle(()=>ss.Panel.el.textContent.includes('clipped text'));
  } finally {r.close();}
});
it('does not reopen a navigated note after the user closes it during its save',async()=>{
  const r=runtime();try{
    const writer=createNoteWriter(r.storage);r.w.chrome.runtime.sendMessage=async msg=>({ok:true,result:await writer.dispatch(msg.command)});
    manifest.content_scripts[0].js.forEach(r.load);await settle(()=>r.w.document.querySelectorAll('.stickysites-cluster-icon').length===6);
    const p=r.w.StickySites.Panel;await p.open(r.w.StickySites.noteTypes.find(t=>t.id==='page'));
    let release;const actual=p.flushPendingSave.bind(p);p.flushPendingSave=()=>release?actual():new Promise(resolve=>{release=resolve;});
    r.w.history.pushState({},'','/next');r.w.dispatchEvent(new r.w.PopStateEvent('popstate'));await settle(()=>release);
    await p.close(true);release();await new Promise(resolve=>setTimeout(resolve,20));p.flushPendingSave=actual;
    expect(p.activeNoteType).toBeNull();expect(p.el.classList.contains('is-open')).toBe(false);
  }finally{r.close();}
});
