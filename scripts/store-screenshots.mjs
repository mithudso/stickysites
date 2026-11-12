#!/usr/bin/env node
/**
 * Captures the Chrome Web Store listing screenshots (1280×800 PNG) from a real unpacked build:
 *   store/screenshots/01-page-note.png   rich-text page note open on an article
 *   store/screenshots/02-todo.png        to-do list with sections, priorities, tags
 *   store/screenshots/03-outliner.png    outliner document
 *   store/screenshots/04-daily-note.png  daily note + cluster
 *   store/screenshots/05-popup.png       popup composed on a backdrop
 *
 * Seeds demo data into a throwaway profile; nothing touches your real notes.
 * Needs: npm i --no-save puppeteer-core; a Chromium that honours --load-extension
 * (Chrome for Testing; override with SS_CHROME).            Usage: npm run store:screenshots
 */
import puppeteer from 'puppeteer-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { listen, resolveChrome, withHarnessResources } from './harness-resources.mjs';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from 'canvas';
import { closePanel, openNoteForScreenshot } from './browser-checks.mjs';

await withHarnessResources(async (resources) => {
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'store', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = resolveChrome();
const W = 1280, H = 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── demo page ────────────────────────────────────────────────────────────────
const ARTICLE = `<!doctype html><html><head><meta charset="utf-8"><title>Field Guide to Sourdough — Bakehouse Journal</title>
<style>
 body{margin:0;font-family:Georgia,serif;color:#1f2937;background:#fafaf9}
 header{background:#fff;border-bottom:1px solid #e7e5e4;padding:18px 0}
 .wrap{max-width:820px;margin:0 auto;padding:0 32px}
 nav{font:14px/1 system-ui,sans-serif;color:#57534e;display:flex;gap:28px} nav b{color:#1c1917}
 h1{font-size:44px;line-height:1.1;margin:44px 0 12px;letter-spacing:-.5px}
 .meta{font:14px system-ui,sans-serif;color:#78716c;margin-bottom:28px}
 p{font-size:19px;line-height:1.65;margin:0 0 22px}
 h2{font-size:26px;margin:36px 0 12px}
 blockquote{border-left:4px solid #d6d3d1;margin:0 0 22px;padding:4px 20px;color:#57534e;font-style:italic}
</style></head><body>
<header><div class="wrap"><nav><b>Bakehouse Journal</b><span>Recipes</span><span>Technique</span><span>Equipment</span><span>Newsletter</span></nav></div></header>
<main class="wrap">
<h1>A Field Guide to Sourdough Hydration</h1>
<div class="meta">Technique · 9 min read · Updated this week</div>
<p>Hydration is the ratio of water to flour by weight, and it is the single number that most changes how a dough feels in your hands. A 65% loaf is tight and forgiving; an 85% loaf slumps, sticks, and rewards you with an open, glossy crumb.</p>
<p>Most home bakers start too high. Flour varies enormously in how much water it can hold, so the same recipe behaves differently from bag to bag. Start at 70%, learn what the dough should feel like at each stage, and then move up in five-point steps.</p>
<h2>Reading the dough</h2>
<p>After the first set of stretch-and-folds the surface should be smooth and slightly tacky, not wet. If it tears rather than stretches, it needs rest, not more flour. Bulk fermentation is finished when the dough has grown by about half, domes at the edges, and jiggles as one piece when you shake the bowl.</p>
<blockquote>"The dough tells you what it needs. The recipe only tells you where to start."</blockquote>
<h2>Scoring and steam</h2>
<p>Score at a shallow angle with a decisive stroke. Steam for the first twenty minutes keeps the crust soft enough to expand; a Dutch oven does this for free. Then vent and bake until the crust is deep mahogany — paler than that and the flavour is not there yet.</p>
<p>Let it cool completely before slicing. The crumb is still setting for an hour after the loaf leaves the oven.</p>
</main></body></html>`;
const server = resources.ownServer(http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(ARTICLE); }));
const PORT = await listen(server);
const PAGE_URL = `http://localhost:${PORT}/technique/sourdough-hydration`;

// ── launch with the unpacked extension ───────────────────────────────────────
async function launch(headless) {
  return resources.ownBrowser(await puppeteer.launch({
    executablePath: CHROME, headless,
    userDataDir: resources.tempDir('ss-store-'),
    ignoreDefaultArgs: ['--disable-extensions'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`, `--window-size=${W},${H + 90}`,
      '--no-first-run', '--no-default-browser-check', '--disable-sync', '--hide-scrollbars'],
  }));
}
let browser = await launch('new');
let page = await browser.newPage();
await page.goto(PAGE_URL, { waitUntil: 'networkidle2' });
const hasCluster = await page.waitForSelector('#stickysites-cluster', { timeout: 8000 }).then(() => true).catch(() => false);
if (!hasCluster) {
  console.log('headless did not load the extension; retrying headful');
  await resources.closeBrowser(browser);
  browser = await launch(false);
  page = await browser.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'networkidle2' });
  await page.waitForSelector('#stickysites-cluster', { timeout: 8000 });
}
const swTarget = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'), { timeout: 10000 });
const EXT_ID = new URL(swTarget.url()).host;

// ── seed demo data (throwaway profile only) ──────────────────────────────────
const now = new Date().toISOString();
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const rec = (key, label, body, tags = []) => ({ key, label, body, tags, createdAt: now, updatedAt: now });
const seed = {
  stickysites_global_v1: { body: '<h2>Reading list</h2><ul><li>Finish the hydration series</li><li>Compare Dutch oven vs. baking steel</li></ul>', updatedAt: now },
  stickysites_sites_v1: { localhost: rec('localhost', 'localhost', '<p><b>Bakehouse Journal</b> — best source for technique posts. Newsletter goes out Fridays.</p>', ['#baking']) },
  stickysites_pages_v1: { [`http://localhost:${PORT}/technique/sourdough-hydration`]: rec(`http://localhost:${PORT}/technique/sourdough-hydration`, '/technique/sourdough-hydration',
    '<h1>Hydration notes</h1><p>Start at <b>70%</b>, then move up in <i>five-point</i> steps.</p><ul><li>My flour holds ~74% comfortably</li><li>Bulk done at +50% volume, domed edges</li><li><s>Try 85% this weekend</s> — too slack, go 80%</li></ul><p>Steam 20 min · bake to deep mahogany · cool 1 h before slicing.</p><p>Tags: <span style="color:#2563eb">#sourdough</span> <span style="color:#2563eb">#technique</span></p>', ['#sourdough', '#technique']) },
  stickysites_daily_v1: { [today]: { key: today, label: today, body: '<h2>Today</h2><ul><li>Feed the starter 1:5:5 at 8 am</li><li>Mix at 70% hydration, 2% salt</li><li>Bulk in the oven with the light on</li><li>Shape at 5 pm, retard overnight</li></ul><p>Weather: warm kitchen, expect a faster bulk.</p>', createdAt: now, updatedAt: now } },
  stickysites_todos_v1: { __global__: { key: '__global__', createdAt: now, updatedAt: now, tagColors: { '#bake': '#f59e0b', '#shop': '#10b981' }, sections: [
    { id: 's1', name: 'This week' }, { id: 's2', name: 'Someday' }],
    items: [
      { id: 't1', text: 'Feed starter and note the rise time', done: true, indent: 0, priority: 2, color: '', tags: ['#bake'], note: '', section: 's1', completedAt: now },
      { id: 't2', text: 'Bake the 80% test loaf', done: false, indent: 0, priority: 5, color: '#fde68a', tags: ['#bake'], note: 'Score shallow, steam 20 min', section: 's1', completedAt: '' },
      { id: 't3', text: 'Photograph the crumb', done: false, indent: 1, priority: 0, color: '', tags: [], note: '', section: 's1', completedAt: '' },
      { id: 't4', text: 'Order bread flour (12.5% protein)', done: false, indent: 0, priority: 3, color: '', tags: ['#shop'], note: '', section: 's1', completedAt: '' },
      { id: 't5', text: 'Read up on rye starters', done: false, indent: 0, priority: 1, color: '', tags: [], note: '', section: 's2', completedAt: '' },
      { id: 't6', text: 'Build a proofing box', done: false, indent: 0, priority: 0, color: '#bfdbfe', tags: [], note: '', section: 's2', completedAt: '' },
    ] } },
  stickysites_outlines_v1: { ol_demo: { key: 'ol_demo', name: 'Bread projects', createdAt: now, updatedAt: now, items: [
    { id: 'o1', text: 'Sourdough fundamentals #learning', collapsed: false, note: '', done: false, tags: ['#learning'], children: [
      { id: 'o2', text: 'Hydration ladder: 70 → 75 → 80', collapsed: false, note: 'Five-point steps, one variable at a time', done: true, tags: [], children: [] },
      { id: 'o3', text: 'Shaping: boule vs. bâtard', collapsed: false, note: '', done: false, tags: [], children: [] },
      { id: 'o4', text: 'Scoring patterns', collapsed: false, note: '', done: false, tags: [], children: [
        { id: 'o5', text: 'Single ear', collapsed: false, note: '', done: false, tags: [], children: [] },
        { id: 'o6', text: 'Wheat stalk', collapsed: false, note: '', done: false, tags: [], children: [] } ] } ] },
    { id: 'o7', text: 'Equipment #shop', collapsed: false, note: '', done: false, tags: ['#shop'], children: [
      { id: 'o8', text: 'Dutch oven (5 qt)', collapsed: false, note: '', done: true, tags: [], children: [] },
      { id: 'o9', text: 'Bench knife', collapsed: false, note: '', done: false, tags: [], children: [] } ] },
    { id: 'o10', text: 'Bake schedule for the weekend', collapsed: false, note: '', done: false, tags: [], children: [] },
  ] } },
  stickysites_prefs_v1: { clusterPosition: { x: 1180, y: 300 }, clusterLayout: 'vertical', iconOrder: null,
    enabledTypes: { global: true, site: true, page: true, todo: true, outline: true, daily: true },
    panelSize: { width: 560, height: 620 }, panelPosition: { x: 560, y: 90 }, activeOutlineId: 'ol_demo' },
};
const seeder = await browser.newPage();
await seeder.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'networkidle2' });
await seeder.evaluate((data) => chrome.storage.local.set(data), seed);
await seeder.close();

// ── helpers ──────────────────────────────────────────────────────────────────
async function shot(p, name) {
  const file = path.join(OUT, name);
  await p.screenshot({ path: file, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`store/screenshots/${name}`);
}
await page.bringToFront();
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForSelector('#stickysites-cluster');
await sleep(400);

await openNoteForScreenshot(page, 'page', { title: 'Page note — /technique/sourdough-hydration', bodySelector: '.stickysites-panel-editor', bodyText: 'Hydration notes' });
await shot(page, '01-page-note.png'); await closePanel(page);
await openNoteForScreenshot(page, 'todo', { title: 'To-do list', bodySelector: '.stickysites-todo-text', bodyText: 'Bake the 80% test loaf' });
await shot(page, '02-todo.png'); await closePanel(page);
await openNoteForScreenshot(page, 'outline', { outlineName: 'Bread projects', bodySelector: '.stickysites-outline-text', bodyText: 'Sourdough fundamentals #learning' });
await shot(page, '03-outliner.png'); await closePanel(page);
await openNoteForScreenshot(page, 'daily', { title: 'Daily — ' + today, bodySelector: '.stickysites-panel-editor', bodyText: 'Feed the starter 1:5:5 at 8 am' });
await shot(page, '04-daily-note.png'); await closePanel(page);

// popup: capture at natural size, then compose onto a 1280×800 backdrop
const popup = await browser.newPage();
await popup.setViewport({ width: 420, height: 640, deviceScaleFactor: 2 });
await popup.goto(`chrome-extension://${EXT_ID}/popup.html`, { waitUntil: 'networkidle2' });
await sleep(700);
const rawPopup = path.join(resources.tempDir('ss-popup-'), 'raw.png');
await popup.screenshot({ path: rawPopup, fullPage: true });
await popup.close();
{
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0f172a'); g.addColorStop(1, '#334155');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const img = await loadImage(rawPopup);
  const scale = Math.min((H - 150) / img.height, 1);
  const dw = Math.round(img.width * scale), dh = Math.round(img.height * scale);
  const dx = Math.round((W - dw) / 2), dy = 40;
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#fff'; ctx.fillRect(dx, dy, dw, dh);
  ctx.shadowColor = 'transparent';
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 28px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Search, filter and export every note from the popup', W / 2, H - 42);
  fs.writeFileSync(path.join(OUT, '05-popup.png'), canvas.toBuffer('image/png'));
  console.log('store/screenshots/05-popup.png');
}

console.log(`done — ${fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length} screenshots in store/screenshots/`);

}).catch((error) => {
  console.error(error.message);
  for (const cleanupError of error.cleanupErrors ?? error.errors ?? []) console.error(`Cleanup: ${cleanupError.message}`);
  process.exitCode = 1;
});
