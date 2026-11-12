import { it, expect } from 'vitest';
import { runtime } from './helpers/runtime.js';
import { createNoteWriter } from '../src/shared/note-writer.js';
const GLOBAL='stickysites_global_v1', OUTLINES='stickysites_outlines_v1';
const files=['src/shared/settings.js','src/content/storage-content.js','src/content/crypto-content.js','src/content/safe-html.js','src/content/prefs.js','src/content/note-types.js','src/content/todo.js','src/content/outline-ops.js','src/content/outline.js','src/content/mentions.js','src/content/panel.js'];
function app(initial={}) {
  const r=runtime(initial),writer=createNoteWriter(r.storage);
  r.w.chrome.runtime.sendMessage=async msg=>{try{return{ok:true,result:await writer.dispatch(msg.command)};}catch(err){return{ok:false,error:err.message};}};
  files.forEach(r.load);const ss=r.w.StickySites;ss.Panel.init(()=>{});
  return Object.assign(r,{ss,writer,type:id=>ss.noteTypes.find(t=>t.id===id)});
}
async function until(predicate,label='fixture callback') {
  for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1));}
  throw Error('Timed out waiting for '+label);
}
it('keeps existing text when a mention selection has moved',()=>{
  const r=app();try{const ed=r.w.document.createElement('div');ed.textContent='@tod KEEP';r.w.document.body.append(ed);const range=r.w.document.createRange();range.setStart(ed.firstChild,4);range.collapse(true);r.w.getSelection().addRange(range);r.ss.Mentions.attach(ed);ed.dispatchEvent(new r.w.Event('input'));range.setStart(ed.firstChild,ed.textContent.length);range.collapse(true);r.w.getSelection().removeAllRanges();r.w.getSelection().addRange(range);ed.dispatchEvent(new r.w.KeyboardEvent('keydown',{key:'Enter'}));expect(ed.textContent).toBe('@tod KEEP');}finally{r.close();}
});
it('preserves supported native FONT formatting while stripping executable attributes',()=>{
  const r=app();try{const ed=r.w.document.createElement('div');ed.innerHTML=r.ss.Html.sanitize('<font face="Georgia" size="5" color="#ff0000" onclick="evil()">formatted</font>');const font=ed.firstChild;expect(font.getAttribute('face')||font.style.fontFamily).toContain('Georgia');expect(font.getAttribute('size')||font.style.fontSize).toBeTruthy();expect(font.getAttribute('color')||font.style.color).toBeTruthy();expect(font.hasAttribute('onclick')).toBe(false);}finally{r.close();}
});
it('round trips OPML attribute whitespace',()=>{
  const r=app();try{const note='first\nsecond\tindented\rreturn';const xml=r.ss.OutlineOps.toOPML([{id:'a',text:'title',note,children:[]}],'test');const parsed=new r.w.DOMParser().parseFromString(xml,'text/xml');expect(parsed.querySelector('outline').getAttribute('_note')).toBe(note);}finally{r.close();}
});
it('persists live rich-text checkbox state',async()=>{
  const r=app({[GLOBAL]:{body:'<p><input type="checkbox"><input type="checkbox"></p>'}});try{await r.ss.Panel.open(r.type('global'));const ed=r.ss.Panel.el.querySelector('.stickysites-panel-editor');const boxes=ed.querySelectorAll('input');boxes[0].checked=true;ed.dispatchEvent(new r.w.Event('input'));await r.ss.Panel.flushPendingSave();await r.ss.Panel.open(r.type('global'));const restored=r.ss.Panel.el.querySelectorAll('input[type="checkbox"]');expect(Array.from(restored,b=>b.checked)).toEqual([true,false]);}finally{r.close();}
});
it('preserves dirty text when a storage event arrives after blur',async()=>{
  const r=app({[GLOBAL]:{body:'<p>original</p>'}});try{const p=r.ss.Panel;await p.open(r.type('global'));const ed=p.el.querySelector('.stickysites-panel-editor');ed.innerHTML='<p>local edit</p>';ed.dispatchEvent(new r.w.Event('input'));ed.blur();await p.syncFromStorage({[GLOBAL]:{newValue:{body:'<p>remote</p>'}}});expect(ed.textContent).toBe('local edit');await p.flushPendingSave();expect(r.data[GLOBAL].body).toContain('local edit');}finally{r.close();}
});
it('drains an edit made while a note transition awaits its first save',async()=>{
  const r=app({stickysites_sites_v1:{a:{body:'a'},b:{body:'b'}}});try{const p=r.ss.Panel,base=r.type('site'),a={...base,getKey:()=> 'a'},b={...base,getKey:()=> 'b'};await p.open(a);const ed=p.el.querySelector('.stickysites-panel-editor');ed.innerHTML='<p>first A</p>';ed.dispatchEvent(new r.w.Event('input'));const original=r.ss.Storage.request.bind(r.ss.Storage);let release;r.ss.Storage.request=cmd=>cmd.op==='record'&&cmd.key==='a'&&!release?new Promise(resolve=>{release=()=>original(cmd).then(resolve);}):original(cmd);const switching=p.open(b);await until(()=>release);ed.innerHTML='<p>second A</p>';ed.dispatchEvent(new r.w.Event('input'));await release();await switching;await new Promise(resolve=>setTimeout(resolve,550));await p.flushPendingSave();expect(r.data.stickysites_sites_v1.b.body).toBe('b');expect(r.data.stickysites_sites_v1.a.body).toContain('second A');}finally{r.close();}
});
it('preserves a clip added after the outline view loaded',async()=>{
  const r=app({[OUTLINES]:{ol_a:{key:'ol_a',name:'A',items:[{id:'a',text:'original',children:[]}]}}});try{const p=r.ss.Panel;await p.open(r.type('outline'));await r.writer.dispatch({op:'clip',storageKey:OUTLINES,key:'',text:'new clip'});const input=p.el.querySelector('.stickysites-outline-text');input.value='edited A';input.dispatchEvent(new r.w.Event('input'));await p.flushPendingSave();expect(r.data[OUTLINES].ol_a.items.map(i=>i.text)).toEqual(['edited A','new clip']);}finally{r.close();}
});
it('keeps a failed outline edit available for a retry',async()=>{
  const r=app({[OUTLINES]:{ol_a:{key:'ol_a',name:'A',items:[{id:'a',text:'original',children:[]}]}}});try{const p=r.ss.Panel;await p.open(r.type('outline'));const original=r.ss.Storage.request.bind(r.ss.Storage);r.ss.Storage.request=cmd=>cmd.op==='record'?Promise.reject(Error('disk unavailable')):original(cmd);const input=p.el.querySelector('.stickysites-outline-text');input.value='unsaved';input.dispatchEvent(new r.w.Event('input'));await expect(p.flushPendingSave()).rejects.toThrow('NOTE_WRITE_FAILED');await p.open(r.type('global'));expect(p.activeNoteType.id).toBe('outline');expect(input.value).toBe('unsaved');r.ss.Storage.request=original;await p.flushPendingSave();await p.open(r.type('global'));expect(r.data[OUTLINES].ol_a.items[0].text).toBe('unsaved');}finally{r.close();}
});
it('normalizes duplicate to-do identities without dropping tasks',()=>{
  const r=app();try{const data=r.ss.Todo.normalizeData({items:[{id:'a',text:'first'},{id:'a',text:'second'},{id:'b',text:'third'}]});expect(new Set(data.items.map(i=>i.id)).size).toBe(3);expect(data.items.map(i=>i.text)).toEqual(['first','second','third']);}finally{r.close();}
});
it('keeps tasks with missing or malformed sections visible as unsectioned',()=>{
  const r=app();try{const data=r.ss.Todo.normalizeData({items:[{id:'a',section:'missing'},{id:'b',section:'good'}],sections:[null,{id:'good',name:'Good'}]});expect(data.items.map(i=>i.section)).toEqual(['','good']);}finally{r.close();}
});
it('clears an already open popout after another context locks the vault',async()=>{
  const r=app({[GLOBAL]:{body:'secret popout'}});try{await r.ss.Crypto.enable('pass');r.w.history.replaceState({},'','?type=global&key=__global__&label=Global');r.load('popout.js');await until(()=>r.ss.Panel.el.textContent.includes('secret popout'));await r.ss.Crypto.clearCachedKey();await until(()=>!r.ss.Panel.el.textContent.includes('secret popout'));expect(r.ss.Panel.el.textContent).toMatch(/locked/i);}finally{r.close();}
});
it('bounds the sanitizer argument count for wide unknown wrappers',()=>{
  const r=app();try{const actual=r.w.Element.prototype.replaceWith;r.w.Element.prototype.replaceWith=function(...args){if(args.length>128)throw new RangeError('fixture engine argument limit');return actual.apply(this,args);};const ed=r.w.document.createElement('div');ed.innerHTML=r.ss.Html.sanitize('<section>'+'<br>'.repeat(512)+'</section>');expect(ed.querySelectorAll('br')).toHaveLength(512);expect(ed.querySelector('section')).toBeNull();}finally{r.close();}
});
it('clamps restored cluster geometry and cancels background dragging on blur', async () => {
  const r=app({stickysites_prefs_v1:{clusterPosition:{x:2000,y:2000}}});
  try {
    r.load('src/content/cluster.js');const w=r.w;
    const original=w.HTMLElement.prototype.getBoundingClientRect;
    w.HTMLElement.prototype.getBoundingClientRect=function(){return this.id==='stickysites-cluster'?{left:parseFloat(this.style.left)||0,top:parseFloat(this.style.top)||0,width:40,height:260}:original.call(this);};
    await r.ss.Cluster.init(r.ss.noteTypes,()=>{});const el=r.ss.Cluster.el;
    expect(parseFloat(el.style.left)).toBe(w.innerWidth-40);expect(parseFloat(el.style.top)).toBe(w.innerHeight-260);
    el.dispatchEvent(new w.MouseEvent('mousedown',{clientX:10,clientY:10,bubbles:true}));w.dispatchEvent(new w.Event('blur'));
    const left=el.style.left;w.document.dispatchEvent(new w.MouseEvent('mousemove',{clientX:200,clientY:200}));expect(el.style.left).toBe(left);expect(el.style.cursor).toBe('');
    Object.defineProperty(w,'innerWidth',{value:500,configurable:true});w.dispatchEvent(new w.Event('resize'));expect(parseFloat(el.style.left)).toBe(460);
    el.dispatchEvent(new w.MouseEvent('mousedown',{clientX:10,clientY:10,bubbles:true}));w.document.dispatchEvent(new w.MouseEvent('mousemove',{clientX:0,clientY:0}));expect(parseFloat(el.style.left)).toBe(450);
  }finally{r.close();}
});
it('does not let a delayed todo focus callback save into a later note session', async () => {
  const r=app({stickysites_todos_v1:{__global__:{items:[{id:'a',text:'existing task'}]}}});try{
    const p=r.ss.Panel;await p.open(r.type('todo'));await p.open(r.type('site'));
    await new Promise(resolve=>setTimeout(resolve,600));await p.flushPendingSave();
    expect(r.data.stickysites_todos_v1['example.test']).toBeUndefined();
    expect(r.data.stickysites_todos_v1.__global__.items).toHaveLength(1);
  }finally{r.close();}
});
