# Phase 5C: Google Drive Sync

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Auto-sync notes to Google Drive on change, Chrome sync for preferences, conflict detection with copy creation

## Summary

Sync all note data to Google Drive's appDataFolder using the Drive API,
triggered automatically 30 seconds after the last change. Preferences sync via
chrome.storage.sync. Conflicts (same note modified on two devices) create a
conflict copy. Requires Google OAuth via chrome.identity.

## Decisions

| Decision | Choice |
|----------|--------|
| Note sync target | Google Drive appDataFolder |
| Prefs sync target | chrome.storage.sync |
| Sync trigger | Auto, 30s after last change (debounced) |
| Conflict resolution | Keep both — create conflict copy |
| OAuth | chrome.identity.getAuthToken with Drive API scope |

## Architecture

### New files

| File | Purpose |
|------|---------|
| src/shared/drive-sync.js | Google Drive API client (upload/download/list) |
| src/content/sync-content.js | Namespace version for content scripts |

### Modified files

| File | Change |
|------|--------|
| manifest.json | Add identity permission, oauth2 config, bump to v1.7.0 |
| src/background/service-worker.js | Sync orchestration, alarm for periodic check |
| src/content/prefs.js | Mirror prefs to chrome.storage.sync |
| popup.html | Add sync script tag |
| popup.js | Sync status indicator, manual sync button, sign-in/out |
| popup.css | Sync status styles |

## Google Drive API Design

### Storage format

One JSON file per storage key in Drive's appDataFolder:
- stickysites_global_v1.json
- stickysites_sites_v1.json
- stickysites_pages_v1.json
- stickysites_todos_v1.json
- stickysites_outlines_v1.json
- stickysites_sync_meta.json (tracks last sync timestamps per key)

Files are encrypted if encryption is enabled (synced data is always encrypted
ciphertext, never plaintext).

### Drive API operations

Using Drive API v3 REST endpoints with fetch():
- List files: GET /drive/v3/files?spaces=appDataFolder
- Create file: POST /upload/drive/v3/files (multipart)
- Update file: PATCH /upload/drive/v3/files/{id} (multipart)
- Download file: GET /drive/v3/files/{id}?alt=media

### OAuth setup

manifest.json additions:
```json
{
  "permissions": [..., "identity"],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.appdata"]
  }
}
```

The drive.appdata scope only grants access to the hidden appDataFolder.
The user's regular Drive files are never accessible.

## Sync Flow

### On note change (auto-sync)

1. Note saved to chrome.storage.local (existing flow)
2. storage.onChanged listener detects the change
3. Start a 30-second debounce timer (reset on each new change)
4. When timer fires:
   a. Get auth token via chrome.identity.getAuthToken
   b. For each changed storage key:
      - Read local value
      - Download remote file from Drive
      - Compare updatedAt timestamps
      - If no conflict: upload local version
      - If conflict: create conflict copy locally, then upload both
   c. Update sync_meta with current timestamps
   d. Show sync status in popup (if open)

### On extension load (pull)

1. Service worker starts
2. If user is signed in (has cached auth token):
   a. Download all remote files
   b. For each key: compare with local, merge (conflict = copy)
   c. Update local storage with merged data

### Conflict detection

A conflict occurs when:
- Remote file has updatedAt > lastSyncedAt for that key
- AND local value has updatedAt > lastSyncedAt for that key
- (Both sides modified since last sync)

Resolution:
- Keep the version with the newer updatedAt as the primary
- Save the other version as a conflict copy:
  - For text notes: duplicate the note with "(conflict copy)" in the body
  - For structured types (todo/outline): duplicate with "(conflict)" in siteKey
- Both versions sync to Drive

### Sync metadata

Stored locally in stickysites_sync_meta:
```json
{
  "lastSync": "ISO8601",
  "perKey": {
    "stickysites_global_v1": { "lastSyncedAt": "ISO8601", "driveFileId": "..." },
    "stickysites_sites_v1": { "lastSyncedAt": "ISO8601", "driveFileId": "..." }
  },
  "signedIn": true
}
```

## Preferences sync via chrome.storage.sync

Cluster position and panel mode sync via chrome.storage.sync (100KB limit,
but prefs are tiny). This gives instant sync across Chrome instances without
Drive API.

The prefs module writes to BOTH chrome.storage.local (for content script use)
and chrome.storage.sync (for cross-device sync). On load, it merges: if sync
has newer data, it overwrites local.

## Popup UI additions

### Sync status indicator

In the popup header, a small sync icon:
- Gray circle: not signed in
- Green circle: synced, up to date
- Blue spinning: syncing in progress
- Orange triangle: has conflicts

### Settings panel additions

- "Google Drive Sync" toggle (sign in / sign out)
- "Sync now" manual button
- "Last synced: [timestamp]" label
- Conflict count if any

## Manifest changes

```json
{
  "version": "1.7.0",
  "permissions": ["storage", "activeTab", "contextMenus", "session", "identity"],
  "oauth2": {
    "client_id": "PLACEHOLDER.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.appdata"]
  }
}
```

## Setup instructions for the user

After implementation, the user must:
1. Go to Google Cloud Console
2. Create a new project (or use existing)
3. Enable the Google Drive API
4. Create OAuth 2.0 Client ID (type: Chrome Extension)
5. Enter the extension ID (from chrome://extensions)
6. Copy the client ID into manifest.json
7. Reload the extension

## Out of Scope

| Feature | Phase |
|---------|-------|
| Export to Google Docs / Apple Notes | Future |
| Selective sync (choose which note types to sync) | Future |
| Sync history / version rollback | Future |
