// Live verification harness for StickySites v1.10 (untracked; not part of the extension).
// Drives system Chrome with the unpacked extension via puppeteer-core.
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.cwd();
// Branded Chrome 137+ ignores --load-extension; use Chrome for Testing / Chromium.
// Override with SS_CHROME=/path/to/binary. Requires: npm i --no-save puppeteer-core
const CHROME = process.env.SS_CHROME ||
  '/Users/mitch/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOT_DIR = '/tmp/stickysites-verify';
fs.mkdirSync(SHOT_DIR, { recursive: true });
const DOWNLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-dl-'));
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-profile-'));

const results = [];
function record(icon, name, detail) {
  results.push({ icon, name, detail });
  console.log(`${icon} ${name}${detail ? ' — ' + detail : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Test server: classic pages + SPA route ────────────────────────────────
const PAGE = (title, body) => `<!doctype html><html><head><title>${title}</title></head>
<body><h1>${title}</h1>${body}<p>${'lorem ipsum '.repeat(20)}</p></body></html>`;
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  if (req.url === '/contactus.html') return res.end(PAGE('Contact Us', '<a href="/index.html">home</a>'));
  return res.end(PAGE('Home', '<a href="/contactus.html">contact</a><button id="spa" onclick="history.pushState({},\'\',\'/spa-route\')">spa nav</button>'));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const BASE = `http://localhost:${PORT}`;

// ── Launch Chrome with the unpacked extension ─────────────────────────────
async function launch(headless) {
  return puppeteer.launch({
    executablePath: CHROME,
    headless,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ss-profile-')),
    // Puppeteer's defaults include --disable-extensions, which defeats --load-extension.
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${REPO}`,
      `--load-extension=${REPO}`,
      '--no-first-run', '--no-default-browser-check', '--disable-sync',
    ],
  });
}
let browser = await launch('new');

async function clusterAppears(page) {
  try { await page.waitForSelector('#stickysites-cluster', { timeout: 8000 }); return true; }
  catch { return false; }
}

let page = await browser.newPage();
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2' });
if (!await clusterAppears(page)) {
  console.log('headless=new did not load the extension; retrying headful');
  await browser.close();
  browser = await launch(false);
  page = await browser.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2' });
  if (!await clusterAppears(page)) { record('❌', 'extension load', 'cluster never appeared'); process.exit(1); }
}
record('✅', 'extension loaded', 'cluster injected');

// Extension id via service worker target
const swTarget = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 10000 });
const EXT_ID = new URL(swTarget.url()).host;

// Helpers operating on the current page
const icons = (p) => p.$$eval('#stickysites-cluster .stickysites-cluster-icon', els =>
  els.map(e => {
    // The 3s number badges are child spans — exclude them from the icon text.
    const clone = e.cloneNode(true);
    clone.querySelectorAll('.stickysites-cluster-badge').forEach(b => b.remove());
    return { type: e.dataset.typeId, text: clone.textContent, title: e.title };
  }));
async function openNote(p, typeId) {
  await p.click(`#stickysites-cluster .stickysites-cluster-icon[data-type-id="${typeId}"]`).catch(async () => {
    // dataset attr selector fallback
    await p.evaluate((t) => {
      document.querySelectorAll('#stickysites-cluster .stickysites-cluster-icon')
        .forEach(b => { if (b.dataset.typeId === t) b.click(); });
    }, typeId);
  });
  await p.waitForSelector('#stickysites-panel.is-open', { timeout: 5000 });
  await sleep(300);
}
const editorText = (p) => p.$eval('.stickysites-panel-editor', e => e.textContent);

// ── S1: identity icons ─────────────────────────────────────────────────────
{
  const ic = await icons(page);
  const by = Object.fromEntries(ic.map(i => [i.type, i]));
  const day = String(new Date().getDate());
  const checks = [
    [by.global?.text === '🌐', `global=${by.global?.text}`],
    [by.site?.text === 'loca' && by.site?.title === 'localhost', `site=${by.site?.text}/${by.site?.title}`],
    [by.page?.text === 'ind…' && by.page?.title === '/index.html', `page=${by.page?.text}/${by.page?.title}`],
    [by.daily?.text === day, `daily=${by.daily?.text} (want ${day})`],
    [by.todo?.text === '✓' && by.outline?.text === '≡', 'todo/outline glyphs'],
  ];
  const bad = checks.filter(c => !c[0]);
  record(bad.length ? '❌' : '✅', 'S1 identity icons', checks.map(c => c[1]).join(', '));
  await page.screenshot({ path: `${SHOT_DIR}/s1-cluster.png` });
}

// ── S2: caret stability while typing across save cycles ───────────────────
{
  await openNote(page, 'page');
  await page.click('.stickysites-panel-editor');
  const SENT = 'The quick brown fox jumps over the lazy dog';
  await page.keyboard.type(SENT, { delay: 90 }); // ~4s of typing → ~7 debounced saves + echoes
  await sleep(800);
  const txt = await editorText(page);
  const caretAtEnd = await page.evaluate(() => {
    const s = getSelection();
    return s && s.isCollapsed && s.focusOffset === (s.focusNode?.textContent || '').length;
  });
  const ok = txt === SENT && caretAtEnd;
  record(ok ? '✅' : '❌', 'S2 caret stability', `text="${txt}" caretAtEnd=${caretAtEnd}`);
  await page.screenshot({ path: `${SHOT_DIR}/s2-editor.png` });
}

// ── S3: page-note identity across full page loads ──────────────────────────
{
  await page.goto(`${BASE}/contactus.html`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#stickysites-cluster');
  await openNote(page, 'page');
  const fresh = await editorText(page);
  await page.click('.stickysites-panel-editor');
  await page.keyboard.type('CONTACT-ONLY', { delay: 40 });
  await sleep(800);
  await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#stickysites-cluster');
  await openNote(page, 'page');
  const home = await editorText(page);
  const ok = fresh === '' && home.includes('quick brown fox') && !home.includes('CONTACT-ONLY');
  record(ok ? '✅' : '❌', 'S3 per-page identity', `freshEmpty=${fresh === ''} home="${home.slice(0, 50)}..."`);
}

// ── S4: SPA navigation re-keys panel + refreshes icon ──────────────────────
{
  // page note for /index.html is open from S3
  await page.click('#spa'); // history.pushState('/spa-route')
  await sleep(1800);        // 1s poll + re-open
  const ic = await icons(page);
  const pageIcon = ic.find(i => i.type === 'page');
  const rekeyed = await editorText(page);
  await page.click('.stickysites-panel-editor');
  await page.keyboard.type('SPA-CONTENT', { delay: 40 });
  await sleep(900);
  const iconOk = pageIcon?.text === 'spa…' && pageIcon?.title === '/spa-route';
  const ok = iconOk && rekeyed === '';
  record(ok ? '✅' : '❌', 'S4 SPA re-key', `icon=${pageIcon?.text}/${pageIcon?.title} freshEditor="${rekeyed}"`);
}

// ── S5 (probe): cross-tab sync still works on an UNFOCUSED panel ──────────
{
  // Headful Chrome throttles background tabs — bring each tab to front before driving it.
  const tab2 = await browser.newPage();
  await tab2.bringToFront();
  await tab2.goto(`${BASE}/contactus.html`, { waitUntil: 'networkidle2' });
  await tab2.waitForSelector('#stickysites-cluster');
  const tab1 = await browser.newPage();
  await tab1.bringToFront();
  await tab1.goto(`${BASE}/contactus.html`, { waitUntil: 'networkidle2' });
  await tab1.waitForSelector('#stickysites-cluster');
  await openNote(tab1, 'page');
  await tab1.click('h1'); // blur the editor — panel open but unfocused
  await tab2.bringToFront();
  await openNote(tab2, 'page');
  await tab2.click('.stickysites-panel-editor');
  // append to existing CONTACT-ONLY content (caret lands at start in a fresh open; End not needed for contains-check)
  await tab2.keyboard.type(' XTAB', { delay: 40 });
  await sleep(1200); // save (500ms) + onChanged echo into tab1
  await tab1.bringToFront();
  await sleep(300);
  const t1 = await tab1.$eval('.stickysites-panel-editor', e => e.textContent);
  const ok = t1.includes('XTAB');
  record(ok ? '🔍✅' : '🔍❌', 'S5 probe: unfocused cross-tab sync', `tab1="${t1.slice(0, 50)}"`);
  await tab1.close(); await tab2.close();
  await page.bringToFront();
}

// ── S6: site note (for popup labels later) ─────────────────────────────────
{
  await openNote(page, 'site');
  await page.click('.stickysites-panel-editor');
  await page.keyboard.type('SITE-NOTE', { delay: 40 });
  await sleep(800);
  record('✅', 'S6 site note created', '');
}

// ── S7: outliner — library, keyboard, zoom, filter, auto-group, export ─────
{
  await openNote(page, 'outline');
  await page.waitForSelector('.stickysites-outline-switcher');
  const optCount0 = await page.$eval('.stickysites-outline-switcher', s => s.options.length);

  const typeRow = async (text) => { await page.keyboard.type(text, { delay: 25 }); };
  await page.click('.stickysites-outline-text'); // first (empty) node
  await typeRow('buy milk #errands');
  await page.keyboard.press('Enter');
  await typeRow('call dentist #errands');
  await page.keyboard.press('Enter');
  await typeRow('ship the release #work');
  await page.keyboard.press('Enter');
  await typeRow('review PR #work');
  await sleep(700);

  const chips = await page.$$eval('.stickysites-outline-tag', els => els.map(e => e.textContent));
  const chipsOk = chips.filter(c => c === '#errands').length === 2 && chips.filter(c => c === '#work').length === 2;
  record(chipsOk ? '✅' : '❌', 'S7a auto-tag chips', chips.join(','));

  // Tab indents the focused (last) node under its previous sibling
  await page.keyboard.press('Tab');
  await sleep(100);
  const indented = await page.$$eval('.stickysites-outline-node', els =>
    els.map(e => ({ t: e.querySelector('.stickysites-outline-text').value, pad: e.style.paddingLeft })));
  const last = indented[indented.length - 1];
  const tabOk = last.t === 'review PR #work' && last.pad === '28px';
  await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
  await sleep(100);
  record(tabOk ? '✅' : '❌', 'S7b Tab indent', `pad=${last.pad}`);

  // Alt+ArrowUp moves node up among siblings
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowUp'); await page.keyboard.up('Alt');
  await sleep(100);
  let order = await page.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  const moveOk = order[2] === 'review PR #work' && order[3] === 'ship the release #work';
  await page.keyboard.down('Alt'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Alt');
  await sleep(100);
  record(moveOk ? '✅' : '❌', 'S7c Alt+arrow move', order.join(' | '));

  // Ctrl+Enter toggles done (strikethrough)
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control');
  await sleep(150);
  const doneCount = await page.$$eval('.stickysites-outline-node.is-done', els => els.length);
  await page.focus('.stickysites-outline-text[data-node-id]'); // refocus any
  record(doneCount === 1 ? '🔍✅' : '🔍❌', 'S7d probe: Ctrl+Enter done toggle', `done rows=${doneCount}`);

  // Zoom via bullet, breadcrumb back
  await page.evaluate(() => document.querySelectorAll('.stickysites-outline-bullet')[0].click());
  await sleep(150);
  const crumb = await page.$eval('.stickysites-outline-breadcrumb', e => e.textContent).catch(() => '');
  const zoomTitle = await page.$eval('.stickysites-outline-zoom-title', e => e.value).catch(() => '');
  const zoomOk = crumb.includes('My outline') && zoomTitle === 'buy milk #errands';
  await page.evaluate(() => document.querySelector('.stickysites-outline-crumb').click());
  await sleep(150);
  record(zoomOk ? '✅' : '❌', 'S7e zoom + breadcrumb', `crumb="${crumb}" title="${zoomTitle}"`);

  // Filter shows matches only
  await page.click('.stickysites-outline-search');
  await page.keyboard.type('dentist');
  await sleep(200);
  const visible = await page.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  const filterOk = visible.length === 1 && visible[0].includes('dentist');
  await page.$eval('.stickysites-outline-search', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(200);
  record(filterOk ? '✅' : '❌', 'S7f filter', visible.join(' | '));

  // Auto-group + Undo
  const menuItem = async (label) => {
    await page.evaluate(() => document.querySelector('.stickysites-outline-toolbar button[title="More actions"]').click());
    await page.waitForSelector('.stickysites-outline-menu');
    await page.evaluate((l) => {
      [...document.querySelectorAll('.stickysites-outline-menu-item')].find(b => b.textContent === l)?.click();
    }, label);
  };
  await menuItem('Auto-group into hierarchy');
  await sleep(400);
  const grouped = await page.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  const groupOk = grouped[0] === '#errands' && grouped.includes('#work');
  await page.screenshot({ path: `${SHOT_DIR}/s7-autogroup.png` });
  const undoVisible = await page.$eval('.stickysites-outline-undobar', e => e.style.display !== 'none');
  await page.evaluate(() => document.querySelector('.stickysites-outline-undobar button').click());
  await sleep(300);
  const restored = await page.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  const undoOk = restored.length === 4 && restored[0] === 'buy milk #errands';
  record(groupOk && undoVisible && undoOk ? '✅' : '❌', 'S7g auto-group + undo',
    `grouped=[${grouped.join(',')}] restored=${restored.length} rows`);

  // New outline via prompt → switcher gains a doc
  page.once('dialog', d => d.accept('Second Brain'));
  await menuItem('New outline…');
  await sleep(700);
  await page.waitForSelector('.stickysites-outline-switcher');
  const sw = await page.$eval('.stickysites-outline-switcher', s =>
    ({ n: s.options.length, sel: s.options[s.selectedIndex].textContent }));
  const newOk = sw.n === optCount0 + 1 && sw.sel === 'Second Brain';
  await page.click('.stickysites-outline-text');
  await page.keyboard.type('hello second brain', { delay: 25 });
  await sleep(700);
  record(newOk ? '✅' : '❌', 'S7h new outline + switcher', `docs=${sw.n} selected=${sw.sel}`);

  // Switch back to the first doc
  await page.evaluate(() => {
    const s = document.querySelector('.stickysites-outline-switcher');
    const opt = [...s.options].find(o => o.textContent === 'My outline');
    s.value = opt.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(700);
  const backRows = await page.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  record(backRows.includes('buy milk #errands') ? '✅' : '❌', 'S7i switch docs', backRows.join(' | '));

  // Export Markdown (capture the download)
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR, eventsEnabled: true });
  await menuItem('Export Markdown');
  await sleep(1200);
  const files = fs.readdirSync(DOWNLOAD_DIR).filter(f => f.endsWith('.md'));
  let mdOk = false, mdHead = '';
  if (files.length) {
    mdHead = fs.readFileSync(path.join(DOWNLOAD_DIR, files[0]), 'utf8').split('\n')[0];
    mdOk = mdHead === '- buy milk #errands';
  }
  record(mdOk ? '✅' : '❌', 'S7j export markdown', `${files[0] || 'NO FILE'}: "${mdHead}"`);

  // Probe: Backspace on an empty node deletes it and focuses the previous row
  await page.$$eval('.stickysites-outline-text', els => els[els.length - 1].focus());
  await page.keyboard.press('End');
  await page.keyboard.press('Enter'); // new empty node
  await sleep(150);
  const before = (await page.$$eval('.stickysites-outline-text', els => els.length));
  await page.keyboard.press('Backspace');
  await sleep(150);
  const after = (await page.$$eval('.stickysites-outline-text', els => els.length));
  const focusedVal = await page.evaluate(() => document.activeElement?.value || '');
  record(after === before - 1 && focusedVal !== '' ? '🔍✅' : '🔍❌',
    'S7k probe: backspace-empty delete', `rows ${before}→${after}, focus="${focusedVal}"`);
}

// ── S8: popup labels + storage integrity ───────────────────────────────────
{
  const popup = await browser.newPage();
  await popup.bringToFront();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'networkidle2' });
  await sleep(600);
  const text = await popup.$eval('body', b => b.innerText);
  const checks = [
    [text.includes('localhost'), 'site label localhost'],
    [text.includes('/index.html'), 'page label /index.html'],
    [text.includes('/contactus.html'), 'page label /contactus.html'],
    [text.includes('/spa-route'), 'page label /spa-route'],
    [text.includes('My outline') && text.includes('Second Brain'), 'outline names'],
  ];
  const bad = checks.filter(c => !c[0]).map(c => c[1]);
  record(bad.length ? '❌' : '✅', 'S8a popup labels', bad.length ? 'MISSING: ' + bad.join(', ') : 'all labels present');
  await popup.screenshot({ path: `${SHOT_DIR}/s8-popup.png`, fullPage: true });

  const store = await popup.evaluate(() => chrome.storage.local.get(null));
  const pages = store.stickysites_pages_v1 || {};
  const keys = Object.keys(pages);
  const bodyOf = (suffix) => (Object.entries(pages).find(([k]) => k.endsWith(suffix))?.[1].body) || '';
  const noBleed =
    bodyOf('/index.html').includes('quick brown fox') && !bodyOf('/index.html').includes('SPA-CONTENT') &&
    bodyOf('/contactus.html').includes('CONTACT-ONLY') && bodyOf('/contactus.html').includes('XTAB') &&
    bodyOf('/spa-route').includes('SPA-CONTENT') && !bodyOf('/spa-route').includes('quick brown fox');
  const outlines = store.stickysites_outlines_v1 || {};
  const oKeys = Object.keys(outlines);
  const outlineOk = oKeys.length === 2 && oKeys.every(k => k.startsWith('ol_')) &&
    Object.values(outlines).map(o => o.name).sort().join(',') === 'My outline,Second Brain';
  record(noBleed ? '✅' : '❌', 'S8b storage: no cross-page bleed', `${keys.length} page keys: ${keys.join(' , ')}`);
  record(outlineOk ? '✅' : '❌', 'S8c storage: outline library', `${oKeys.join(',')} names=${Object.values(outlines).map(o => o.name).join('/')}`);
  await popup.close();
}

// ── S9: encryption — enable, lock, locked-vault safety, unlock ─────────────
{
  const PASS = 'verify-pass-1234';

  // S9a: enable encryption from the popup settings (PBKDF2 600k iterations +
  // re-encrypt of all 6 note keys — allow generous time).
  const popup = await browser.newPage();
  await popup.bringToFront();
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'networkidle2' });
  await popup.click('#settings-btn');
  await popup.waitForSelector('.settings-toggle-btn');
  await popup.evaluate(() => {
    [...document.querySelectorAll('.settings-toggle-btn')].find(b => b.textContent === 'Enable')?.click();
  });
  await popup.waitForSelector('.settings-passphrase-form .popup-lock-input');
  const passInputs = await popup.$$('.settings-passphrase-form .popup-lock-input');
  await passInputs[0].type(PASS);
  await passInputs[1].type(PASS);
  await popup.click('.settings-passphrase-form .popup-lock-btn');
  await popup.waitForFunction(
    () => [...document.querySelectorAll('.settings-toggle-btn')].some(b => b.textContent === 'Disable'),
    { timeout: 30000 });
  let store = await popup.evaluate(() => chrome.storage.local.get(null));
  let env = store.stickysites_outlines_v1 || {};
  const encOk = typeof env.iv === 'string' && typeof env.data === 'string' &&
    !Object.keys(env).some(k => k.startsWith('ol_'));
  record(encOk ? '✅' : '❌', 'S9a enable encryption', `outlines value keys=[${Object.keys(env).join(',')}]`);

  // S9b: Lock Now. We're still inside the settings panel (showSettings()
  // hides #app, which contains #settings-btn) and the enable path never calls
  // updateLockBtnState(), so Lock Now is hidden in the current panel. A real
  // user closes and reopens the popup — for the harness, reload the page.
  await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'networkidle2' });
  await popup.click('#settings-btn');
  await popup.waitForFunction(
    () => [...document.querySelectorAll('.settings-toggle-btn')]
      .some(b => b.textContent === 'Lock Now' && b.style.display !== 'none'),
    { timeout: 5000 });
  await popup.evaluate(() => {
    [...document.querySelectorAll('.settings-toggle-btn')].find(b => b.textContent === 'Lock Now')?.click();
  });
  await sleep(400);
  store = await popup.evaluate(() => chrome.storage.local.get('stickysites_cached_key'));
  const lockOk = !store.stickysites_cached_key;
  record(lockOk ? '✅' : '❌', 'S9b Lock Now clears cached key', '');
  await popup.close();

  // S9c (probe): a locked outline popout must show the lock notice and must
  // NOT auto-create a doc (which would clobber the envelope with plaintext).
  const pop = await browser.newPage();
  await pop.bringToFront();
  await pop.goto(`chrome-extension://${EXT_ID}/popout.html?type=outline&label=Outliner`, { waitUntil: 'networkidle2' });
  const lockedNotice = await pop.waitForSelector('.stickysites-outline-locked', { timeout: 5000 })
    .then(() => true).catch(() => false);
  await sleep(1500); // give any (buggy) auto-create write a chance to land
  const after = await pop.evaluate(() => chrome.storage.local.get('stickysites_outlines_v1'));
  const v = after.stickysites_outlines_v1 || {};
  const envelopeSurvived = typeof v.iv === 'string' && typeof v.data === 'string';
  await pop.screenshot({ path: `${SHOT_DIR}/s9-locked-popout.png` });
  record(lockedNotice && envelopeSurvived ? '🔍✅' : '🔍❌', 'S9c probe: locked popout is read-only',
    `notice=${lockedNotice} envelopeSurvived=${envelopeSurvived}`);
  await pop.close();

  // S9d: locked in-page icon click → lock overlay → unlock restores content.
  const tab = await browser.newPage();
  await tab.bringToFront();
  await tab.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2' });
  await tab.waitForSelector('#stickysites-cluster');
  await tab.evaluate(() => {
    document.querySelectorAll('#stickysites-cluster .stickysites-cluster-icon')
      .forEach(b => { if (b.dataset.typeId === 'outline') b.click(); });
  });
  const overlayShown = await tab.waitForSelector('#stickysites-lock', { timeout: 5000 })
    .then(() => true).catch(() => false);
  await tab.type('.stickysites-lock-input', PASS);
  await tab.click('.stickysites-lock-btn');
  await tab.waitForSelector('.stickysites-outline-switcher', { timeout: 15000 });
  await sleep(300);
  const rows = await tab.$$eval('.stickysites-outline-text', els => els.map(e => e.value));
  const unlockOk = overlayShown && rows.includes('buy milk #errands');
  record(unlockOk ? '✅' : '❌', 'S9d unlock restores outline', `overlay=${overlayShown} rows=[${rows.join(' | ')}]`);
  await tab.close();
}

await browser.close();
server.close();
const fails = results.filter(r => r.icon.includes('❌')).length;
console.log(`\n=== ${results.length} steps, ${fails} failures. Screenshots in ${SHOT_DIR} ===`);
process.exit(fails ? 1 : 0);
