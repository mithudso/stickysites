// Classic script shared by extension pages, content scripts, and the module worker.
(function (root) {
  root.StickySites = root.StickySites || {};
  var types = ['global', 'site', 'page', 'todo', 'outline', 'daily'];
  function object(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function point(v, nullable) {
    v = object(v);
    return Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : (nullable ? null : { x: null, y: null });
  }
  function prefs(raw) {
    raw = object(raw);
    var enabled = object(raw.enabledTypes), flags = {};
    types.forEach(function (id) { flags[id] = enabled[id] !== false; });
    var size = object(raw.panelSize);
    var result = {
      clusterPosition: point(raw.clusterPosition, false), panelMode: typeof raw.panelMode === 'string' ? raw.panelMode : 'fixed',
      clusterLayout: raw.clusterLayout === 'horizontal' ? 'horizontal' : 'vertical', collapseToCircle: raw.collapseToCircle === true,
      iconOrder: Array.isArray(raw.iconOrder) ? Array.from(new Set(raw.iconOrder.filter(function (id) { return types.includes(id); }))) : null,
      enabledTypes: flags, panelSize: Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0 ? { width: size.width, height: size.height } : null,
      panelPosition: point(raw.panelPosition, true)
    };
    if (typeof raw.activeOutlineId === 'string' || raw.activeOutlineId === null) result.activeOutlineId = raw.activeOutlineId;
    return result;
  }
  root.StickySites.Settings = { normalizePrefs: prefs, networkTimeoutMs: 10000, nativeTimeoutMs: 15000 };
})(globalThis);
