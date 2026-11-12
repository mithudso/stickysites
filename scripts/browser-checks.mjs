/** Side-effect-free checks shared by opt-in browser harnesses and synthetic tests. */
export const NOTE_BUCKETS = ['stickysites_global_v1', 'stickysites_sites_v1', 'stickysites_pages_v1', 'stickysites_todos_v1', 'stickysites_outlines_v1', 'stickysites_daily_v1'];

export function populatedNoteBuckets(store) {
  return NOTE_BUCKETS.filter(key => store[key] && typeof store[key] === 'object' && Object.keys(store[key]).length > 0);
}
export function encryptedNoteBuckets(store, expectedKeys) {
  const missing = expectedKeys.filter(key => {
    const value = store[key];
    return !value || typeof value.iv !== 'string' || !value.iv || typeof value.data !== 'string' || !value.data || Object.keys(value).some(field => !['iv', 'data'].includes(field));
  });
  return { ok: missing.length === 0, missing };
}
export function persistedSiteBody(store, siteKey, expectedBody) {
  return typeof expectedBody === 'string' && expectedBody.length > 0 && store.stickysites_sites_v1?.[siteKey]?.body === expectedBody;
}
export function restoredNoteContent(before, after, expectedKeys) {
  function payload(bucket, value) {
    if (!value || typeof value !== 'object') return null;
    const record = raw => ({ body: raw?.body ?? null, items: raw?.items ?? null, name: raw?.name ?? null, tags: raw?.tags ?? null });
    return bucket === 'stickysites_global_v1' ? record(value) : Object.fromEntries(Object.keys(value).sort().map(key => [key, record(value[key])]));
  }
  return expectedKeys.every(key => JSON.stringify(payload(key, before[key])) === JSON.stringify(payload(key, after[key])));
}

// Puppeteer serializes these predicates into the page's main world. They use DOM
// state only, because content-script namespaces live in a separate execution world.
export function panelReady(expected) {
  const panel = document.querySelector('#stickysites-panel.is-open');
  if (!panel) return false;
  const title = panel.querySelector('.stickysites-panel-title');
  const switcher = panel.querySelector('.stickysites-outline-switcher');
  const identity = expected.outlineName
    ? switcher?.options[switcher.selectedIndex]?.textContent === expected.outlineName
    : title?.textContent === expected.title;
  if (!identity) return false;
  return Array.from(panel.querySelectorAll(expected.bodySelector)).some(node => String('value' in node ? node.value : node.textContent).includes(expected.bodyText));
}
export async function closePanel(page) {
  const open = await page.evaluate(() => Boolean(document.querySelector('#stickysites-panel.is-open')));
  if (!open) return;
  await page.click('#stickysites-panel .stickysites-panel-close');
  await page.waitForFunction(() => !document.querySelector('#stickysites-panel.is-open'), { timeout: 5000 });
}
export async function openNoteForScreenshot(page, typeId, expected) {
  if (!expected?.bodySelector || !expected.bodyText || !(expected.title || expected.outlineName)) throw new Error('Screenshot readiness requires an expected note identity and seeded body.');
  await closePanel(page);
  await page.click(`#stickysites-cluster .stickysites-cluster-icon[data-type-id="${typeId}"]`);
  await page.waitForFunction(panelReady, { timeout: 5000 }, expected);
}
