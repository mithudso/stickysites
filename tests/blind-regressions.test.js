import { expect, it, vi } from 'vitest';
import { runtime } from './helpers/runtime.js';
import { createNoteWriter } from '../src/shared/note-writer.js';
import { mergeNotes, NOTE_KEYS } from '../src/shared/peer-sync.js';
import { syncTodosWithHost, TODOS_KEY } from '../src/shared/todo-bridge.js';
import { writePrefs } from '../src/shared/notes-storage.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup(initial = {}, options) {
  const r = runtime(initial, '', options), writer = createNoteWriter(r.storage);
  r.w.chrome.runtime.sendMessage = async message => ({ ok: true, result: await writer.dispatch(message.command) });
  ['src/shared/settings.js', 'src/content/storage-content.js', 'src/content/crypto-content.js', 'src/content/safe-html.js', 'src/content/prefs.js', 'src/content/note-types.js', 'src/content/todo.js', 'src/content/outline-ops.js', 'src/content/panel.js'].forEach(r.load);
  if (!options?.deferPanelInit) r.w.StickySites.Panel.init(() => {});
  return r;
}
function blurPanel(r) { r.w.document.body.tabIndex = -1; r.w.document.body.focus(); }

it('clears deleted map content and adopts remote tags before the next body save', async () => {
  const sk = 'stickysites_sites_v1', key = 'example.test';
  const r = setup({ [sk]: { [key]: { body: 'original', tags: ['#old'] } } });
  try {
    const p = r.w.StickySites.Panel;
    await p.open(r.w.StickySites.noteTypes.find(n => n.id === 'site')); await tick(); blurPanel(r);
    const remote = { [key]: { body: 'remote', tags: ['#new'] } };
    await r.storage.set({ [sk]: remote }); await p.syncFromStorage({ [sk]: { newValue: remote } });
    expect(p.el.querySelector('.stickysites-panel-tags').value).toContain('new');
    const editor = p.el.querySelector('.stickysites-panel-editor');
    editor.textContent = 'local next'; editor.dispatchEvent(new r.w.Event('input')); await p.flushPendingSave();
    expect(r.data[sk][key].tags).toEqual(['#new']);
    blurPanel(r); await r.storage.set({ [sk]: {} }); await p.syncFromStorage({ [sk]: { newValue: {} } });
    expect(editor.textContent).toBe(''); expect(p.el.querySelector('.stickysites-panel-tags').value).toBe('');
    editor.textContent = 'new after deletion'; editor.dispatchEvent(new r.w.Event('input')); await p.flushPendingSave();
    expect(r.data[sk][key].body).not.toContain('local next');
  } finally { r.close(); }
});

it('opening populated or collapsed TODOs preserves their stored tasks', async () => {
  for (const collapsed of [false, true]) {
    const original = { items: [{ id: 'keep', text: 'existing', section: 's' }], sections: [{ id: 's', name: 'Section', collapsed }], tagColors: {} };
    const r = setup({ [TODOS_KEY]: { __global__: original } });
    try {
      const p = r.w.StickySites.Panel, nt = r.w.StickySites.noteTypes.find(n => n.id === 'todo');
      for (let i = 0; i < 2; i++) { await p.open(nt); await tick(); await p.flushPendingSave(); await p.close(); }
      const stored = r.data[TODOS_KEY].__global__;
      expect(stored.items.map(({ id, text }) => ({ id, text }))).toEqual(original.items.map(({ id, text }) => ({ id, text })));
      expect(stored.sections).toEqual(original.sections); expect(stored.tagColors).toEqual(original.tagColors);
    } finally { r.close(); }
  }
});

it('lets stale mention keys and IME confirmation retain their native behavior', () => {
  for (const mode of ['Enter', 'Tab', 'composition']) {
    const r = runtime();
    try {
      r.load('src/content/mentions.js');
      const editor = r.w.document.createElement('div'); editor.textContent = '@tod'; r.w.document.body.append(editor);
      const range = r.w.document.createRange(); range.setStart(editor.firstChild, 4); range.collapse(true); r.w.getSelection().addRange(range);
      r.w.StickySites.Mentions.attach(editor); editor.dispatchEvent(new r.w.Event('input'));
      if (mode !== 'composition') { range.setStart(editor.firstChild, 0); range.collapse(true); }
      const event = new r.w.KeyboardEvent('keydown', { key: mode === 'composition' ? 'Enter' : mode, isComposing: mode === 'composition', bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false); expect(editor.querySelector('.stickysites-mention-chip')).toBeNull();
    } finally { r.close(); }
  }
});

it('normalizes unique outline identities and preserves every node during regrouping', () => {
  const r = runtime();
  try {
    r.load('src/content/outline-ops.js'); const ops = r.w.StickySites.OutlineOps;
    const input = [{ id: 'x', text: 'birthday cake' }, { id: 'y', text: 'birthday party' }, { id: 'x', text: 'unique' }];
    const normalized = ops.normalizeItems(input);
    expect(new Set(normalized.map(n => n.id)).size).toBe(3);
    function texts(items) { return items.flatMap(n => [n.text, ...texts(n.children || [])]); }
    expect(texts(ops.autoGroup(normalized))).toContain('unique');
    expect(texts(ops.autoGroup(input))).toContain('unique');
    const xml = ops.toOPML([{ text: 'keep\u000bUnicode 😀', note: 'line\u0000note', children: [] }]);
    const parsed = new r.w.DOMParser().parseFromString(xml, 'text/xml');
    expect(parsed.querySelector('parsererror')).toBeNull(); expect(parsed.querySelector('outline').getAttribute('text')).toContain('Unicode 😀');
  } finally { r.close(); }
});

it('retains one nonempty TODO section identity and renders each task once', async () => {
  const r = setup({ [TODOS_KEY]: { __global__: { items: [{ id: 'a', text: 'Assigned', section: 's' }, { id: 'b', text: 'Unsectioned' }], sections: [{ id: 's', name: 'First' }, { id: 's', name: 'Duplicate' }, { id: '', name: 'Empty' }] } } });
  try {
    await r.w.StickySites.Panel.open(r.w.StickySites.noteTypes.find(n => n.id === 'todo')); await tick();
    expect([...r.w.document.querySelectorAll('.stickysites-todo-text')].map(n => n.value).sort()).toEqual(['Assigned', 'Unsectioned']);
  } finally { r.close(); }
});

it('converges equal-time conflicts in either direction and remains idempotent', () => {
  const key = NOTE_KEYS[0], stamp = '2026-11-12T12:00:00.000Z';
  const a = { notes: { [key]: { body: 'a', updatedAt: stamp } } }, b = { notes: { [key]: { body: 'b', updatedAt: stamp } } };
  const ab = mergeNotes(a, [b]), ba = mergeNotes(b, [a]);
  expect(ab.notes[key]).toEqual(ba.notes[key]); expect(mergeNotes(ab, [ba]).changedKeys).toEqual([]);
});

it('rejects incomplete native items without erasing content and permits explicit clearing', async () => {
  const original = { __global__: { items: [{ id: 'a', text: 'Important', done: true, note: 'Details', section: '' }] } };
  const r = runtime({ [TODOS_KEY]: original });
  try {
    const set = vi.spyOn(r.storage, 'set');
    const result = await syncTodosWithHost({ storage: r.storage, extId: 'synthetic', sendNativeMessage: async () => ({ ok: true, items: [{ id: 'a' }] }) });
    expect(result.error).toBeTruthy(); expect(set).not.toHaveBeenCalled(); expect(r.data[TODOS_KEY]).toEqual(original);
    const clear = await syncTodosWithHost({ storage: r.storage, extId: 'synthetic', sendNativeMessage: async () => ({ ok: true, items: [{ id: 'a', text: '', done: false, note: '', section: '' }] }) });
    expect(clear.error).toBeUndefined(); expect(r.data[TODOS_KEY].__global__.items[0]).toMatchObject({ text: '', done: false, note: '' });
  } finally { r.close(); }
});

async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await tick(); }
  throw new Error('Synthetic state did not settle');
}
it('keeps a dismissed selection closed after its earlier unlock check completes', async () => {
  const r = setup({}, { deferPanelInit: true });
  try {
    r.load('src/content/cluster.js'); await r.load('src/content/sticky-inject.js');
    const ss = r.w.StickySites; let release;
    ss.Crypto.isEnabled = () => new Promise(resolve => { release = resolve; });
    ss.Cluster._handleClick('global'); await until(() => release);
    ss.Cluster._handleClick('global'); release(false); await tick(); await tick();
    expect(ss.Panel.activeNoteType).toBeNull(); expect(ss.Cluster.activeTypeId).toBeNull();
    expect(ss.Panel.el.classList.contains('is-open')).toBe(false);
  } finally { r.close(); }
});

it('refreshes idle popouts, preserves dirty edits, and fails closed on lock-read failure', async () => {
  const r = setup({ stickysites_global_v1: { body: 'private original', tags: [] } }, { deferPanelInit: true, url: 'https://example.test/popout.html?type=global&key=__global__&label=Global' });
  try {
    r.load('popout.js'); const p = r.w.StickySites.Panel;
    await until(() => p.activeNoteType); await tick(); blurPanel(r);
    await r.storage.set({ stickysites_global_v1: { body: 'remote update', tags: [] } });
    await until(() => p.el.textContent.includes('remote update'));
    const editor = p.el.querySelector('.stickysites-panel-editor');
    editor.textContent = 'dirty edit'; editor.dispatchEvent(new r.w.Event('input'));
    await r.storage.set({ stickysites_global_v1: { body: 'another remote', tags: [] } });
    expect(editor.textContent).toBe('dirty edit'); await p.flushPendingSave();
    r.w.StickySites.Crypto.isEnabled = async () => { throw new Error('synthetic storage failure'); };
    await r.storage.set({ stickysites_cached_key: null });
    await until(() => p.el.dataset.lockState === 'unavailable');
    expect(p.el.textContent).not.toContain('dirty edit'); expect(p.el.textContent).not.toContain('synthetic storage failure');
    r.w.StickySites.Crypto.isEnabled = async () => false; p.el.querySelector('button').click();
    await until(() => p.el.textContent.includes('dirty edit'));
    r.w.StickySites.Crypto.isEnabled = async () => true;
    await r.storage.set({ stickysites_cached_key: null }); await until(() => p.el.dataset.lockState === 'locked');
    expect(p.el.textContent).not.toContain('dirty edit');
  } finally { r.close(); }
});

it('isolates storage observer errors from writes and complete multi-key removal', async () => {
  const r = runtime({ a: 1, b: 2 });
  try {
    const observed = []; r.w.chrome.storage.onChanged.addListener(() => { throw new Error('synthetic observer failure'); });
    r.w.chrome.storage.onChanged.addListener(changes => observed.push(changes));
    await expect(r.storage.set({ a: 3 })).resolves.toBeUndefined();
    await expect(r.storage.remove(['a', 'b'])).resolves.toBeUndefined();
    expect(r.data).toEqual({}); expect(Object.keys(observed[1]).sort()).toEqual(['a', 'b']);
    expect(r.observerErrors.splice(0)).toHaveLength(2);
  } finally { r.close(); }
});

it('does not persist fallback preference defaults after a failed reference read', async () => {
  const key = 'stickysites_prefs_v1', initial = { collapseToCircle: false, enabledTypes: { todo: false }, clusterLayout: 'horizontal' };
  const r = runtime({ [key]: initial });
  try {
    vi.stubGlobal('chrome', r.w.chrome); vi.spyOn(r.storage, 'get').mockRejectedValueOnce(new Error('synthetic read failure'));
    const set = vi.spyOn(r.storage, 'set'); expect(await writePrefs({ collapseToCircle: true })).toBeNull();
    expect(set).not.toHaveBeenCalled(); expect(r.data[key]).toEqual(initial);
  } finally { vi.unstubAllGlobals(); r.close(); }
});
