# Integrations and Assumptions

## External services

| Service | Purpose | Auth | Failure mode |
|---------|---------|------|-------------|
| Google Drive API v3 | Note sync across devices | OAuth via chrome.identity (drive.appdata scope) | Sync fails silently; notes remain in local storage |
| Chrome Storage API | Note persistence | Built-in (per-extension) | Extension non-functional without it |
| Chrome Storage Session | Encryption key caching | Built-in (per-session) | User re-enters passphrase |
| Chrome Identity API | Google OAuth token management | Built-in | Sync unavailable; notes work locally |

## Hardcoded assumptions

| Assumption | Location | Impact if wrong |
|------------|----------|-----------------|
| chrome.storage.local available | All storage operations | Extension cannot function |
| Web Crypto API available | src/shared/crypto.js, src/content/crypto-content.js | Encryption feature unavailable |
| content_scripts run at document_idle | manifest.json | UI may inject before DOM is ready |
| Max z-index ~2^31 | sticky-inject.css | Cluster may appear behind host-page overlays |
| OAuth client_id in manifest | manifest.json oauth2 section | Drive sync will fail until real ID provided |

## Environment differences

| Context | Module system | chrome.storage.session | Notes |
|---------|--------------|----------------------|-------|
| Content scripts | Namespace (window.StickySites) | Yes (with setAccessLevel) | 7 scripts loaded sequentially |
| Service worker | ES modules (import/export) | Yes (native) | Single file with Drive sync imports |
| Popup page | Script tags | Yes (native) | Loads crypto-content.js + sync-content.js via tags |
| Vitest tests | ES modules | Mocked | chrome.storage.local mocked in-memory |
