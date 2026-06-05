import { describe, it, expect, beforeAll } from 'vitest';

let Ops;

beforeAll(async () => {
  globalThis.window = globalThis;
  await import('../src/content/outline-ops.js');
  Ops = globalThis.StickySites.OutlineOps;
});

function node(id, text, children) {
  return { id, text, children: children || [], collapsed: false, note: '', done: false, tags: [] };
}

function tree() {
  // a
  //   a1
  //   a2
  // b
  return [
    node('a', 'alpha', [node('a1', 'alpha one'), node('a2', 'alpha two')]),
    node('b', 'beta')
  ];
}

describe('normalizeNode / normalizeItems', () => {
  it('fills defaults and recurses', () => {
    const n = Ops.normalizeNode({ text: 'x', children: [{ text: 'y' }] });
    expect(n.id).toBeTruthy();
    expect(n.done).toBe(false);
    expect(n.tags).toEqual([]);
    expect(n.note).toBe('');
    expect(n.children[0].text).toBe('y');
    expect(n.children[0].id).toBeTruthy();
  });
  it('normalizes arrays', () => {
    expect(Ops.normalizeItems([{ text: 'a' }])).toHaveLength(1);
    expect(Ops.normalizeItems(null)).toEqual([]);
  });
});

describe('findParent / findNode / getPathTo', () => {
  it('finds nested nodes with their containing array', () => {
    const items = tree();
    const loc = Ops.findParent('a2', items, null);
    expect(loc.parent.id).toBe('a');
    expect(loc.index).toBe(1);
    expect(loc.array).toBe(items[0].children);
  });
  it('findNode returns the node', () => {
    expect(Ops.findNode('a1', tree()).text).toBe('alpha one');
    expect(Ops.findNode('zz', tree())).toBeNull();
  });
  it('getPathTo returns ancestors including the node', () => {
    const path = Ops.getPathTo(tree(), 'a2');
    expect(path.map(n => n.id)).toEqual(['a', 'a2']);
    expect(Ops.getPathTo(tree(), 'zz')).toBeNull();
  });
});

describe('structure edits', () => {
  it('insertSiblingAfter inserts at the right spot', () => {
    const items = tree();
    Ops.insertSiblingAfter(items, 'a1', node('n', 'new'));
    expect(items[0].children.map(n => n.id)).toEqual(['a1', 'n', 'a2']);
  });
  it('indentNode moves under previous sibling', () => {
    const items = tree();
    expect(Ops.indentNode(items, 'b')).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].children.map(n => n.id)).toEqual(['a1', 'a2', 'b']);
  });
  it('indentNode refuses the first sibling', () => {
    const items = tree();
    expect(Ops.indentNode(items, 'a')).toBe(false);
  });
  it('outdentNode moves after the parent', () => {
    const items = tree();
    expect(Ops.outdentNode(items, 'a1')).toBe(true);
    expect(items.map(n => n.id)).toEqual(['a', 'a1', 'b']);
  });
  it('moveNode swaps with siblings and respects bounds', () => {
    const items = tree();
    expect(Ops.moveNode(items, 'a2', -1)).toBe(true);
    expect(items[0].children.map(n => n.id)).toEqual(['a2', 'a1']);
    expect(Ops.moveNode(items, 'a2', -1)).toBe(false);
  });
  it('removeNode promotes children', () => {
    const items = tree();
    expect(Ops.removeNode(items, 'a')).toBe(true);
    expect(items.map(n => n.id)).toEqual(['a1', 'a2', 'b']);
  });
});

describe('extractTags', () => {
  it('extracts unique lowercase #tags', () => {
    expect(Ops.extractTags('Fix #Bug and #bug in #auth-flow')).toEqual(['#bug', '#auth-flow']);
  });
  it('returns empty for none', () => {
    expect(Ops.extractTags('nothing here')).toEqual([]);
  });
});

describe('filterTree', () => {
  it('returns matches plus their ancestors', () => {
    const visible = Ops.filterTree(tree(), 'alpha one');
    expect(visible.has('a1')).toBe(true);
    expect(visible.has('a')).toBe(true);
    expect(visible.has('a2')).toBe(false);
    expect(visible.has('b')).toBe(false);
  });
  it('returns null for an empty query', () => {
    expect(Ops.filterTree(tree(), '')).toBeNull();
  });
});

describe('autoGroup', () => {
  it('groups by shared first tag', () => {
    const items = [
      node('1', 'call dentist #errands'),
      node('2', 'buy milk #errands'),
      node('3', 'ship the release #work'),
      node('4', 'review PR #work')
    ];
    const out = Ops.autoGroup(items);
    const names = out.map(n => n.text).sort();
    expect(names).toEqual(['#errands', '#work']);
    expect(out.find(n => n.text === '#errands').children).toHaveLength(2);
  });
  it('groups leftovers by shared keyword and leaves singles ungrouped', () => {
    const items = [
      node('1', 'plan birthday party'),
      node('2', 'birthday cake order'),
      node('3', 'totally unrelated')
    ];
    const out = Ops.autoGroup(items);
    const group = out.find(n => n.text === 'birthday');
    expect(group).toBeTruthy();
    expect(group.children).toHaveLength(2);
    const other = out.find(n => n.text === 'Other');
    expect(other.children.map(n => n.id)).toEqual(['3']);
  });
  it('leaves everything alone when nothing clusters', () => {
    const items = [node('1', 'aaaa'), node('2', 'bbbb')];
    const out = Ops.autoGroup(items);
    expect(out.map(n => n.id)).toEqual(['1', '2']);
  });
  it('ignores apostrophe contractions in the keyword pass', () => {
    const items = [
      node('1', "don't forget the report"),
      node('2', "don't skip the report review"),
      node('3', 'totally unrelated')
    ];
    const out = Ops.autoGroup(items);
    // "don't" must not form a group; "report" must.
    expect(out.find(n => n.text === "don't")).toBeUndefined();
    const group = out.find(n => n.text === 'report');
    expect(group).toBeTruthy();
    expect(group.children).toHaveLength(2);
  });
});

describe('exports', () => {
  it('toMarkdown indents two spaces per level and strikes done items', () => {
    const items = tree();
    items[0].children[0].done = true;
    const md = Ops.toMarkdown(items);
    expect(md.split('\n')).toEqual([
      '- alpha',
      '  - ~~alpha one~~',
      '  - alpha two',
      '- beta'
    ]);
  });
  it('toOPML escapes and nests', () => {
    const items = [node('1', 'a < b', [node('2', 'child "q"')])];
    const xml = Ops.toOPML(items, 'My & outline');
    expect(xml).toContain('<title>My &amp; outline</title>');
    expect(xml).toContain('text="a &lt; b"');
    expect(xml).toContain('text="child &quot;q&quot;"');
    expect(xml.indexOf('<outline text="a &lt; b">')).toBeGreaterThan(-1);
    expect(xml).toContain('</outline>');
  });
});
