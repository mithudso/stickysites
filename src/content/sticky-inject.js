(async () => {
  if (document.getElementById('stickysites-strip')) return;

  const GLOBAL_NOTE_KEY = 'stickysites_global_v1';
  const SITE_NOTES_KEY = 'stickysites_sites_v1';

  function getSiteKey() {
    try { return location.hostname.replace(/^www\./, ''); }
    catch { return ''; }
  }

  function formatSaved(iso) {
    if (!iso) return '';
    try { return 'Saved ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  }

  function clearChildren(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function debounce(fn, ms = 500) {
    let t = null;
    return (...a) => { if (t) clearTimeout(t); t = setTimeout(() => { t = null; fn(...a); }, ms); };
  }

  // Storage helpers (inline to avoid module import in content script)
  async function readGlobal() {
    try {
      const s = await chrome.storage.local.get(GLOBAL_NOTE_KEY);
      const r = s?.[GLOBAL_NOTE_KEY];
      return { body: String(r?.body ?? ''), updatedAt: String(r?.updatedAt ?? '') };
    } catch { return { body: '', updatedAt: '' }; }
  }
  async function writeGlobal(body) {
    const rec = { body: String(body), updatedAt: new Date().toISOString() };
    await chrome.storage.local.set({ [GLOBAL_NOTE_KEY]: rec });
    return rec;
  }
  async function readSite(key) {
    if (!key) return null;
    try {
      const s = await chrome.storage.local.get(SITE_NOTES_KEY);
      const m = s?.[SITE_NOTES_KEY] || {};
      return m[key] || null;
    } catch { return null; }
  }
  async function writeSite(key, body, tags = []) {
    if (!key) return;
    try {
      const s = await chrome.storage.local.get(SITE_NOTES_KEY);
      const m = s?.[SITE_NOTES_KEY] || {};
      const existing = m[key];
      m[key] = {
        siteKey: key, siteLabel: key, body: String(body),
        tags: Array.isArray(tags) ? tags : [],
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await chrome.storage.local.set({ [SITE_NOTES_KEY]: m });
    } catch { /* best effort */ }
  }

  const siteKey = getSiteKey();
  let activeDrawer = null;

  // Build strip
  const strip = document.createElement('div');
  strip.id = 'stickysites-strip';

  const yellowBtn = document.createElement('button');
  yellowBtn.className = 'stickysites-icon is-yellow';
  yellowBtn.title = 'Global note';
  yellowBtn.textContent = '\u{1F4DD}';
  yellowBtn.addEventListener('click', () => toggleDrawer('yellow'));

  const greenBtn = document.createElement('button');
  greenBtn.className = 'stickysites-icon is-green';
  greenBtn.title = 'Site note: ' + siteKey;
  greenBtn.textContent = '\u{1F4DD}';
  greenBtn.addEventListener('click', () => toggleDrawer('green'));

  strip.appendChild(yellowBtn);
  strip.appendChild(greenBtn);

  // Build drawer
  const drawer = document.createElement('div');
  drawer.id = 'stickysites-drawer';

  document.documentElement.appendChild(strip);
  document.documentElement.appendChild(drawer);

  function toggleDrawer(type) {
    if (activeDrawer === type) { closeDrawer(); return; }
    openDrawer(type);
  }

  function closeDrawer() {
    activeDrawer = null;
    drawer.classList.remove('is-open');
    yellowBtn.classList.remove('is-active');
    greenBtn.classList.remove('is-active');
  }

  async function openDrawer(type) {
    activeDrawer = type;
    yellowBtn.classList.toggle('is-active', type === 'yellow');
    greenBtn.classList.toggle('is-active', type === 'green');
    if (type === 'yellow') await renderYellow();
    else await renderGreen();
    drawer.classList.add('is-open');
  }

  async function renderYellow() {
    const note = await readGlobal();
    clearChildren(drawer);
    const header = document.createElement('div');
    header.className = 'stickysites-drawer-header is-yellow';
    const title = document.createElement('span');
    title.className = 'stickysites-drawer-title';
    title.textContent = 'Global note';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'stickysites-drawer-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeDrawer);
    header.append(title, closeBtn);

    const textarea = document.createElement('textarea');
    textarea.className = 'stickysites-textarea';
    textarea.value = note.body;
    textarea.placeholder = 'Type a note here. Visible on every website.';
    textarea.style.flex = '1';

    const footer = document.createElement('div');
    footer.className = 'stickysites-footer';
    const chars = document.createElement('span');
    chars.textContent = note.body.length + ' chars';
    const saved = document.createElement('span');
    saved.className = 'stickysites-saved';
    saved.textContent = formatSaved(note.updatedAt);
    footer.append(chars, saved);

    const save = debounce(async () => {
      const r = await writeGlobal(textarea.value);
      chars.textContent = textarea.value.length + ' chars';
      saved.textContent = formatSaved(r.updatedAt);
    });
    textarea.addEventListener('input', save);
    drawer.append(header, textarea, footer);
  }

  async function renderGreen() {
    let note = await readSite(siteKey);
    if (!note) {
      await writeSite(siteKey, siteKey + '\n---\n', []);
      note = await readSite(siteKey);
    }
    clearChildren(drawer);
    const header = document.createElement('div');
    header.className = 'stickysites-drawer-header is-green';
    const title = document.createElement('span');
    title.className = 'stickysites-drawer-title';
    title.textContent = 'Site note: ' + siteKey;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'stickysites-drawer-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeDrawer);
    header.append(title, closeBtn);

    const textarea = document.createElement('textarea');
    textarea.className = 'stickysites-textarea';
    textarea.value = note?.body || '';
    textarea.placeholder = 'Notes for ' + siteKey + '. Only visible on this site.';
    textarea.style.flex = '1';

    const footer = document.createElement('div');
    footer.className = 'stickysites-footer';
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.placeholder = '#tags';
    tagInput.value = (note?.tags || []).join(', ');
    const saved = document.createElement('span');
    saved.className = 'stickysites-saved';
    saved.textContent = formatSaved(note?.updatedAt);
    footer.append(tagInput, saved);

    const parseTags = (v) => {
      if (!v) return [];
      return [...new Set(v.split(/[,\s]+/).map(t => t.trim().toLowerCase()).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t))];
    };

    const save = debounce(async () => {
      await writeSite(siteKey, textarea.value, parseTags(tagInput.value));
      saved.textContent = formatSaved(new Date().toISOString());
    });
    textarea.addEventListener('input', save);
    tagInput.addEventListener('input', save);
    drawer.append(header, textarea, footer);
  }

  // Listen for toggle from browser action
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'STICKYSITES_TOGGLE') {
      strip.classList.toggle('is-hidden');
      if (strip.classList.contains('is-hidden')) closeDrawer();
    }
  });

  // Sync across tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (activeDrawer === 'yellow' && changes[GLOBAL_NOTE_KEY]) {
      const ta = drawer.querySelector('.stickysites-textarea');
      const nv = changes[GLOBAL_NOTE_KEY].newValue;
      if (ta && nv && ta.value !== nv.body) ta.value = nv.body;
    }
    if (activeDrawer === 'green' && changes[SITE_NOTES_KEY]) {
      const ta = drawer.querySelector('.stickysites-textarea');
      const nm = changes[SITE_NOTES_KEY].newValue || {};
      const note = nm[siteKey];
      if (ta && note && ta.value !== note.body) ta.value = note.body;
    }
  });
})();
