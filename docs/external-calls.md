# External Calls

StickySites makes external calls only through the Google Drive sync feature.
All other functionality is local (chrome.storage.local, chrome.storage.session).

## Google Drive API

| Call | File:Line | Target | Auth | Retry | Test |
|------|-----------|--------|------|-------|------|
| List files | src/shared/drive-sync.js:listFiles | GET /drive/v3/files?spaces=appDataFolder | OAuth Bearer token | None (fails silently) | TODO |
| Download file | src/shared/drive-sync.js:downloadFile | GET /drive/v3/files/{id}?alt=media | OAuth Bearer token | None | TODO |
| Create file | src/shared/drive-sync.js:createFile | POST /upload/drive/v3/files?uploadType=multipart | OAuth Bearer token | None | TODO |
| Update file | src/shared/drive-sync.js:updateFile | PATCH /upload/drive/v3/files/{id}?uploadType=media | OAuth Bearer token | None | TODO |

## Chrome Identity API

| Call | File:Line | Purpose | Retry |
|------|-----------|---------|-------|
| getAuthToken | src/shared/drive-sync.js:getToken | Get OAuth access token | Interactive prompt on failure |
| removeCachedAuthToken | src/shared/drive-sync.js:revokeToken | Sign out / revoke token | None |

## Chrome Storage

All storage calls are local and synchronous-in-practice. Not documented as
external calls since they never leave the browser.

## Gaps

- Drive API calls have no retry/backoff policy
- No structured error logging for sync failures
- No test coverage for Drive API operations (would need mocking)
