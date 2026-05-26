import { getToken, revokeToken, listFiles, downloadFile, createFile, updateFile, getSyncMeta, setSyncMeta, NOTE_KEYS } from '../shared/drive-sync.js';

// Create context menus on install
chrome.runtime.onInstalled.addListener(() => {
  // Allow content scripts to access session storage for encryption key caching
  chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

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
  } catch {
    // Content script not injected on this page
  }
});

// Handle keyboard shortcut for cluster toggle
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-cluster') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STICKYSITES_TOGGLE' });
      } catch {
        // Content script not injected on this page
      }
    }
  }
});

// --- Google Drive Sync ---

let syncTimer = null;
const SYNC_DEBOUNCE_MS = 30000;

// Auto-sync: watch for note storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const changedNoteKeys = Object.keys(changes).filter(k => NOTE_KEYS.includes(k));
  if (changedNoteKeys.length === 0) return;

  // Debounce sync
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    doSync().catch(err => console.warn('[StickySites] Auto-sync failed:', err.message));
  }, SYNC_DEBOUNCE_MS);
});

// Handle sync messages from popup/content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'STICKYSITES_SYNC_NOW') {
    doSync().then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
  if (msg?.type === 'STICKYSITES_SYNC_SIGNIN') {
    handleSignIn().then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg?.type === 'STICKYSITES_SYNC_SIGNOUT') {
    handleSignOut().then(() => sendResponse({ ok: true })).catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

async function handleSignIn() {
  const token = await getToken();
  if (!token) throw new Error('Failed to get auth token');
  const meta = await getSyncMeta();
  meta.signedIn = true;
  await setSyncMeta(meta);
  await doSync();
}

async function handleSignOut() {
  await revokeToken();
  const meta = await getSyncMeta();
  meta.signedIn = false;
  await setSyncMeta(meta);
}

async function doSync() {
  const meta = await getSyncMeta();
  if (!meta.signedIn) return;

  let token;
  try {
    token = await getToken();
  } catch {
    return; // Not signed in or token expired
  }
  if (!token) return;

  const remoteFiles = await listFiles(token);
  const fileMap = {};
  remoteFiles.forEach(f => { fileMap[f.name] = f; });

  const localData = await chrome.storage.local.get(NOTE_KEYS);

  for (const key of NOTE_KEYS) {
    const fileName = key + '.json';
    const localValue = localData[key];
    const remoteFile = fileMap[fileName];
    const keyMeta = meta.perKey[key] || { lastSyncedAt: null, driveFileId: null };

    if (!localValue && !remoteFile) {
      continue; // Nothing to sync
    }

    if (localValue && !remoteFile) {
      // Local only — push to Drive
      const created = await createFile(token, fileName, localValue);
      meta.perKey[key] = { lastSyncedAt: new Date().toISOString(), driveFileId: created.id };
      continue;
    }

    if (!localValue && remoteFile) {
      // Remote only — pull from Drive
      const remoteData = await downloadFile(token, remoteFile.id);
      await chrome.storage.local.set({ [key]: remoteData });
      meta.perKey[key] = { lastSyncedAt: new Date().toISOString(), driveFileId: remoteFile.id };
      continue;
    }

    // Both exist — check for conflicts
    const remoteData = await downloadFile(token, remoteFile.id);
    const localUpdated = getNewestTimestamp(localValue);
    const remoteUpdated = getNewestTimestamp(remoteData);
    const lastSynced = keyMeta.lastSyncedAt || '1970-01-01T00:00:00Z';

    const localChanged = localUpdated > lastSynced;
    const remoteChanged = remoteUpdated > lastSynced;

    if (localChanged && remoteChanged) {
      // Conflict — keep both
      await createConflictCopy(key, localValue, remoteData, localUpdated, remoteUpdated);
      // Push the winner (newest) to Drive
      const winner = localUpdated >= remoteUpdated ? localValue : remoteData;
      await updateFile(token, remoteFile.id, winner);
      if (localUpdated < remoteUpdated) {
        await chrome.storage.local.set({ [key]: remoteData });
      }
    } else if (localChanged) {
      // Local is newer — push
      await updateFile(token, remoteFile.id, localValue);
    } else if (remoteChanged) {
      // Remote is newer — pull
      await chrome.storage.local.set({ [key]: remoteData });
    }
    // else: no changes on either side

    meta.perKey[key] = { lastSyncedAt: new Date().toISOString(), driveFileId: remoteFile.id };
  }

  meta.lastSync = new Date().toISOString();
  await setSyncMeta(meta);
}

function getNewestTimestamp(value) {
  if (!value) return '1970-01-01T00:00:00Z';
  // Single record (global)
  if (value.updatedAt) return value.updatedAt;
  // Map of records (sites, pages, todos, outlines)
  if (typeof value === 'object') {
    let newest = '1970-01-01T00:00:00Z';
    for (const k of Object.keys(value)) {
      const rec = value[k];
      if (rec && rec.updatedAt && rec.updatedAt > newest) {
        newest = rec.updatedAt;
      }
    }
    return newest;
  }
  return '1970-01-01T00:00:00Z';
}

async function createConflictCopy(key, localValue, remoteValue, localTs, remoteTs) {
  // The loser (older timestamp) becomes a conflict copy
  const loser = localTs < remoteTs ? localValue : remoteValue;
  if (!loser || typeof loser !== 'object') return;

  const conflictKey = key + '_conflict_' + Date.now();
  await chrome.storage.local.set({ [conflictKey]: loser });
  // Note: conflict copies are stored with a unique key and will appear
  // in storage but not in the normal note UI. The popup can show a
  // conflict notification.
}
