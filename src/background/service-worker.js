import '../content/crypto-content.js';
import { createNoteWriter } from '../shared/note-writer.js';
import { syncTodosWithHost, TODOS_KEY } from '../shared/todo-bridge.js';
import { syncWithDaemon, NOTE_KEYS, TOMBSTONES_KEY, CRYPTO_KEY, CACHED_KEY, PEER_STATE_KEY, DEFAULT_DAEMON_URL } from '../shared/peer-sync.js';
import { importJwk, encrypt, decrypt } from '../shared/crypto.js';

const noteWriter = createNoteWriter(chrome.storage.local);
globalThis.StickySites.Storage = { commit: noteWriter.commit, request: command => noteWriter.dispatch(command) };
async function cryptoRequest(command) {
  const vault = globalThis.StickySites.Crypto;
  switch (command.action) {
    case 'getCachedKey': return !!await vault.getCachedKey();
    case 'encryptValue': return vault.encryptValue(command.value);
    case 'decryptValue': return vault.decryptValue(command.value);
    case 'unlock': return vault.unlock(command.value);
    case 'enable': return vault.enable(command.value);
    case 'disable': return vault.disable();
    default: throw new Error('INVALID_OPERATION');
  }
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'STICKYSITES_WRITE') return;
  (msg.command?.op === 'crypto' ? cryptoRequest(msg.command) : noteWriter.dispatch(msg.command)).then(result => sendResponse({ ok: true, result }), () => sendResponse({ ok: false, error: 'STORAGE_WRITE_FAILED' }));
  return true;
});

// Credentials are entered only in the extension origin, never in a host page's DOM.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== 'STICKYSITES_UNLOCK') return;
  chrome.windows.create({ url: chrome.runtime.getURL('popup.html') + '?unlock=1', type: 'popup', width: 400, height: 600 })
    .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false, error: 'UNLOCK_WINDOW_FAILED' }));
  return true;
});

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'stickysites-parent',
    title: 'StickySites',
    contexts: ['selection']
  });

  const items = [
    { id: 'clip-global', title: 'Add to Global note' },
    { id: 'clip-site', title: 'Add to Site note' },
    { id: 'clip-page', title: 'Add to Page note' },
    { id: 'clip-todo', title: 'Add to To-do list' },
    { id: 'clip-outline', title: 'Add to Outline' },
    { id: 'clip-daily', title: 'Add to Daily note' }
  ];

  items.forEach(item => {
    chrome.contextMenus.create({
      id: item.id,
      parentId: 'stickysites-parent',
      title: item.title,
      contexts: ['selection']
    });
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const idToType = {
    'clip-global': 'global',
    'clip-site': 'site',
    'clip-page': 'page',
    'clip-todo': 'todo',
    'clip-outline': 'outline',
    'clip-daily': 'daily'
  };
  const noteTypeId = idToType[info.menuItemId];
  if (!noteTypeId) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'STICKYSITES_CLIP',
      noteTypeId: noteTypeId,
      text: info.selectionText
    });
  } catch (err) {
    // Content script not injected on this page
    console.warn('[stickysites] clip', { tabId: tab.id, noteTypeId, error: 'OPERATION_FAILED' });
  }
});

// Handle keyboard shortcut for cluster toggle
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-cluster') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE', fromCommand: true });
      } catch (err) {
        // Content script not injected on this page
        console.warn('[stickysites] toggle', { tabId: tab.id, error: 'OPERATION_FAILED' });
      }
    }
  }
});

// Open a note in its own standalone popout window
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'STICKYSITES_POPOUT') {
    const params = new URLSearchParams({
      type: msg.noteTypeId || '',
      key: msg.key || '',
      label: msg.label || ''
    });
    chrome.windows.create({
      url: chrome.runtime.getURL('popout.html') + '?' + params.toString(),
      type: 'popup',
      width: 1400,
      height: 1100
    }).catch((err) => {
      console.warn('[stickysites] popout', { noteTypeId: msg.noteTypeId, error: 'OPERATION_FAILED' });
    });
    sendResponse({ ok: true });
    return true;
  }
});

// To-do sync with the local TODO.md via the native-messaging host (optional: a missing host
// just leaves the list local). Runs on startup, every 2 minutes, and shortly after local edits.
const TODO_SYNC_ALARM = 'stickysites-todo-sync';
let todoSyncRunning = false;
let todoSyncTimer = null;

async function runTodoSync() {
  if (todoSyncRunning) return;
  todoSyncRunning = true;
  try {
    const result = await syncTodosWithHost({
      storage: chrome.storage.local,
      commit: noteWriter.commit,
      extId: chrome.runtime.id,
      sendNativeMessage: (host, msg) => chrome.runtime.sendNativeMessage(host, msg)
    });
    if (result?.error) {
      console.warn('[stickysites] todo-sync', { error: 'SYNC_FAILED' });
    }
  } catch (err) {
    // Host not installed or failed: keep working offline.
    console.warn('[stickysites] todo-sync', { error: 'OPERATION_FAILED' });
  } finally {
    todoSyncRunning = false;
  }
}

chrome.alarms.create(TODO_SYNC_ALARM, { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TODO_SYNC_ALARM) runTodoSync();
});
chrome.runtime.onStartup.addListener(runTodoSync);
chrome.runtime.onInstalled.addListener(runTodoSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[TODOS_KEY] || todoSyncRunning) return;
  clearTimeout(todoSyncTimer);
  todoSyncTimer = setTimeout(runTodoSync, 3000);
});

// Local peer sync: push our snapshot to the local daemon (peer/stickysites-peer.py) and merge every
// LAN peer's snapshot back. Runs every minute, on startup/install, and 4 s after any note changes.
// Merge logic lives in src/shared/peer-sync.js; this is only the wiring. No daemon → quiet no-op.
const PEER_SYNC_ALARM = 'stickysites-peer-sync';
let peerSyncRunning = false;
let peerSyncPromise = null;
let peerSyncTimer = null;
let peerNoDaemonLogged = false;

// Crypto adapter for the merge: decrypt/encrypt storage values with the cached vault key.
async function peerCryptoApi(stored) {
  const cfg = stored[CRYPTO_KEY];
  const jwk = stored[CACHED_KEY];
  if (!cfg?.enabled || !jwk) return null;
  const key = await importJwk(jwk);
  return {
    decrypt: async (envelope) => JSON.parse(await decrypt(key, envelope)),
    encrypt: async (value) => encrypt(key, JSON.stringify(value))
  };
}

function runPeerSync() {
  if (peerSyncPromise) return peerSyncPromise;
  peerSyncRunning = true;
  peerSyncPromise = (async () => {
  try {
    const result = await syncWithDaemon({ storage: chrome.storage.local, fetch: globalThis.fetch.bind(globalThis), daemonUrl: DEFAULT_DAEMON_URL, createCryptoApi: peerCryptoApi, commit: noteWriter.commit });
    if (result.status === 'no-daemon') {
      if (!peerNoDaemonLogged) { console.warn('[stickysites] peer-sync', { status: result.status, hint: 'install peer/stickysites-peer.py to sync across laptops' }); peerNoDaemonLogged = true; }
    } else if (result.status === 'error') {
      console.warn('[stickysites] peer-sync', { status: result.status, error: 'SYNC_FAILED' });
    } else {
      peerNoDaemonLogged = false;
    }
  } catch (err) {
    console.warn('[stickysites] peer-sync', { error: 'PEER_SYNC_FAILED' });
  } finally {
    peerSyncRunning = false;
    peerSyncPromise = null;
  }
  })();
  return peerSyncPromise;
}

chrome.alarms.create(PEER_SYNC_ALARM, { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PEER_SYNC_ALARM) runPeerSync();
});
chrome.runtime.onStartup.addListener(runPeerSync);
chrome.runtime.onInstalled.addListener(runPeerSync);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || peerSyncRunning) return;
  const relevant = [...NOTE_KEYS, TOMBSTONES_KEY, CRYPTO_KEY].some((k) => changes[k]);
  const toggled = changes[PEER_STATE_KEY] && changes[PEER_STATE_KEY].newValue?.enabled !== changes[PEER_STATE_KEY].oldValue?.enabled;
  if (!relevant && !toggled) return;
  clearTimeout(peerSyncTimer);
  peerSyncTimer = setTimeout(runPeerSync, 4000);
});
// The popup asks for an immediate sync after toggling the feature or when the user clicks "Sync now".
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'STICKYSITES_PEER_SYNC_NOW') {
    runPeerSync().then(() => chrome.storage.local.get(PEER_STATE_KEY)).then((s) => sendResponse({ ok: true, state: s[PEER_STATE_KEY] || null })).catch(() => sendResponse({ ok: false, error: 'PEER_SYNC_FAILED' }));
    return true;
  }
});
