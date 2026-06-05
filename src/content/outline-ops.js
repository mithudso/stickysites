window.StickySites = window.StickySites || {};

// Pure tree operations for the outliner. No DOM access at load or call time —
// vitest imports this file with a stubbed `window` (see tests/outline-ops.test.js).
(function () {
  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeNode(node) {
    node = node || {};
    return {
      id: node.id || genId(),
      text: String(node.text ?? ''),
      children: Array.isArray(node.children) ? node.children.map(normalizeNode) : [],
      collapsed: !!node.collapsed,
      note: typeof node.note === 'string' ? node.note : '',
      done: !!node.done,
      tags: Array.isArray(node.tags) ? node.tags : []
    };
  }

  function normalizeItems(arr) {
    return Array.isArray(arr) ? arr.map(normalizeNode) : [];
  }

  function findParent(targetId, arr, parent) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === targetId) return { parent: parent || null, array: arr, index: i };
      if (arr[i].children && arr[i].children.length) {
        var found = findParent(targetId, arr[i].children, arr[i]);
        if (found) return found;
      }
    }
    return null;
  }

  function findNode(id, arr) {
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return arr[i];
      if (arr[i].children && arr[i].children.length) {
        var f = findNode(id, arr[i].children);
        if (f) return f;
      }
    }
    return null;
  }

  function getPathTo(items, id) {
    function walk(arr, path) {
      for (var i = 0; i < arr.length; i++) {
        var n = arr[i];
        if (n.id === id) return path.concat(n);
        if (n.children && n.children.length) {
          var found = walk(n.children, path.concat(n));
          if (found) return found;
        }
      }
      return null;
    }
    return walk(items, []);
  }

  function insertSiblingAfter(items, targetId, newNode) {
    var loc = findParent(targetId, items, null);
    if (!loc) return false;
    loc.array.splice(loc.index + 1, 0, newNode);
    return true;
  }

  function indentNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc || loc.index === 0) return false;
    var prev = loc.array[loc.index - 1];
    var node = loc.array.splice(loc.index, 1)[0];
    if (!Array.isArray(prev.children)) prev.children = [];
    prev.children.push(node);
    prev.collapsed = false;
    return true;
  }

  function outdentNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc || !loc.parent) return false;
    var parentLoc = findParent(loc.parent.id, items, null);
    if (!parentLoc) return false;
    var node = loc.array.splice(loc.index, 1)[0];
    parentLoc.array.splice(parentLoc.index + 1, 0, node);
    return true;
  }

  function moveNode(items, id, dir) {
    var loc = findParent(id, items, null);
    if (!loc) return false;
    var newIdx = loc.index + dir;
    if (newIdx < 0 || newIdx >= loc.array.length) return false;
    var node = loc.array.splice(loc.index, 1)[0];
    loc.array.splice(newIdx, 0, node);
    return true;
  }

  function removeNode(items, id) {
    var loc = findParent(id, items, null);
    if (!loc) return false;
    var node = loc.array[loc.index];
    loc.array.splice(loc.index, 1);
    if (node.children && node.children.length) {
      for (var i = 0; i < node.children.length; i++) {
        loc.array.splice(loc.index + i, 0, node.children[i]);
      }
    }
    return true;
  }

  function extractTags(text) {
    var m = String(text || '').match(/#[a-z0-9_-]+/gi) || [];
    var seen = [];
    m.forEach(function (t) {
      var lower = t.toLowerCase();
      if (seen.indexOf(lower) === -1) seen.push(lower);
    });
    return seen;
  }

  function filterTree(items, query) {
    var q = String(query || '').toLowerCase().trim();
    if (!q) return null; // null = no filter active
    var visible = new Set();
    function walk(arr, ancestors) {
      arr.forEach(function (n) {
        var hay = (n.text + ' ' + (n.note || '') + ' ' + (n.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          visible.add(n.id);
          ancestors.forEach(function (a) { visible.add(a); });
        }
        walk(n.children || [], ancestors.concat(n.id));
      });
    }
    walk(items, []);
    return visible;
  }

  var STOPWORDS = ('the and for with that this from have will your about into over then than them they were been ' +
    'being what when where which while would could should there here also just like make made more most some such ' +
    'very each other only onto upon does done dont cant wont').split(' ');

  // Reorganize a flat top-level list into a hierarchy. Priority: (a) shared
  // first tag → tag-named parents; (b) shared significant keyword (>3 chars,
  // non-stopword, in ≥2 nodes) → keyword-named parents; (c) rest → "Other".
  // Single-member groups stay ungrouped. Returns a NEW top-level array; child
  // subtrees travel with their nodes untouched.
  function autoGroup(items) {
    var top = items.slice();
    var tagGroups = {};
    var leftovers = [];

    top.forEach(function (n) {
      var tags = (n.tags && n.tags.length) ? n.tags : extractTags(n.text);
      if (tags.length) {
        (tagGroups[tags[0]] = tagGroups[tags[0]] || []).push(n);
      } else {
        leftovers.push(n);
      }
    });
    Object.keys(tagGroups).forEach(function (g) {
      if (tagGroups[g].length < 2) {
        leftovers = leftovers.concat(tagGroups[g]);
        delete tagGroups[g];
      }
    });

    var wordMap = {};
    leftovers.forEach(function (n) {
      var words = String(n.text).toLowerCase().match(/[a-z0-9']{4,}/g) || [];
      var unique = [];
      words.forEach(function (w) { if (unique.indexOf(w) === -1) unique.push(w); });
      unique.forEach(function (w) {
        if (STOPWORDS.indexOf(w) !== -1) return;
        (wordMap[w] = wordMap[w] || []).push(n);
      });
    });

    var assigned = new Set();
    var keywordGroups = {};
    Object.keys(wordMap)
      .filter(function (w) { return wordMap[w].length >= 2; })
      .sort(function (a, b) { return wordMap[b].length - wordMap[a].length || a.localeCompare(b); })
      .forEach(function (w) {
        var members = wordMap[w].filter(function (n) { return !assigned.has(n.id); });
        if (members.length >= 2) {
          keywordGroups[w] = members;
          members.forEach(function (n) { assigned.add(n.id); });
        }
      });

    var rest = leftovers.filter(function (n) { return !assigned.has(n.id); });
    var result = [];
    Object.keys(tagGroups).sort().forEach(function (g) {
      result.push({ id: genId(), text: g, children: tagGroups[g], collapsed: false, note: '', done: false, tags: [] });
    });
    Object.keys(keywordGroups).sort().forEach(function (w) {
      result.push({ id: genId(), text: w, children: keywordGroups[w], collapsed: false, note: '', done: false, tags: [] });
    });
    if (!result.length) return top; // nothing clustered — leave the list as-is
    if (rest.length) {
      result.push({ id: genId(), text: 'Other', children: rest, collapsed: false, note: '', done: false, tags: [] });
    }
    return result;
  }

  function toMarkdown(items) {
    var lines = [];
    function walk(arr, depth) {
      arr.forEach(function (n) {
        var indent = new Array(depth + 1).join('  ');
        lines.push(indent + '- ' + (n.done ? '~~' + n.text + '~~' : n.text));
        if (n.note) lines.push(indent + '  ' + n.note.replace(/\n/g, ' '));
        walk(n.children || [], depth + 1);
      });
    }
    walk(items, 0);
    return lines.join('\n');
  }

  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toOPML(items, name) {
    var lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<opml version="2.0">',
      '<head><title>' + escXml(name || 'Outline') + '</title></head>',
      '<body>'
    ];
    function walk(arr) {
      arr.forEach(function (n) {
        var attrs = ' text="' + escXml(n.text) + '"';
        if (n.note) attrs += ' _note="' + escXml(n.note) + '"';
        if (n.done) attrs += ' _complete="true"';
        if (n.children && n.children.length) {
          lines.push('<outline' + attrs + '>');
          walk(n.children);
          lines.push('</outline>');
        } else {
          lines.push('<outline' + attrs + '/>');
        }
      });
    }
    walk(items);
    lines.push('</body>', '</opml>');
    return lines.join('\n');
  }

  window.StickySites.OutlineOps = {
    genId: genId,
    normalizeNode: normalizeNode,
    normalizeItems: normalizeItems,
    findParent: findParent,
    findNode: findNode,
    getPathTo: getPathTo,
    insertSiblingAfter: insertSiblingAfter,
    indentNode: indentNode,
    outdentNode: outdentNode,
    moveNode: moveNode,
    removeNode: removeNode,
    extractTags: extractTags,
    filterTree: filterTree,
    autoGroup: autoGroup,
    toMarkdown: toMarkdown,
    toOPML: toOPML
  };
})();
