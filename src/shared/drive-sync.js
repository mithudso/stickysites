const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SYNC_META_KEY = 'stickysites_sync_meta';
const NOTE_KEYS = [
  'stickysites_global_v1',
  'stickysites_sites_v1',
  'stickysites_pages_v1',
  'stickysites_todos_v1',
  'stickysites_outlines_v1',
  'stickysites_daily_v1'
];

async function getToken() {
  return new Promise(function (resolve, reject) {
    chrome.identity.getAuthToken({ interactive: true }, function (token) {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}

async function revokeToken() {
  return new Promise(function (resolve) {
    chrome.identity.getAuthToken({ interactive: false }, function (token) {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token: token }, function () {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

async function listFiles(token) {
  var res = await fetch(DRIVE_API + '/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Drive list failed: ' + res.status);
  var data = await res.json();
  return data.files || [];
}

async function downloadFile(token, fileId) {
  var res = await fetch(DRIVE_API + '/files/' + fileId + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Drive download failed: ' + res.status);
  return res.json();
}

async function createFile(token, name, content) {
  var metadata = { name: name, parents: ['appDataFolder'] };
  var form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));
  var res = await fetch(UPLOAD_API + '/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: form
  });
  if (!res.ok) throw new Error('Drive create failed: ' + res.status);
  return res.json();
}

async function updateFile(token, fileId, content) {
  var res = await fetch(UPLOAD_API + '/files/' + fileId + '?uploadType=media', {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(content)
  });
  if (!res.ok) throw new Error('Drive update failed: ' + res.status);
  return res.json();
}

async function getSyncMeta() {
  var stored = await chrome.storage.local.get(SYNC_META_KEY);
  return stored?.[SYNC_META_KEY] || { lastSync: null, perKey: {}, signedIn: false };
}

async function setSyncMeta(meta) {
  await chrome.storage.local.set({ [SYNC_META_KEY]: meta });
}

export {
  getToken, revokeToken, listFiles, downloadFile, createFile, updateFile,
  getSyncMeta, setSyncMeta, NOTE_KEYS, SYNC_META_KEY
};
