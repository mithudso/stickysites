# Integrations and Assumptions

## External services

| Service | Purpose | Auth | Failure mode |
|---------|---------|------|-------------|
| Chrome Storage API | Note persistence | Built-in (per-extension) | Extension non-functional without it |
| Chrome Storage Session | Encryption key caching | Built-in (per-session) | User re-enters passphrase |

StickySites makes no external network calls — there are no third-party service integrations.

## Hardcoded assumptions

| Assumption | Location | Impact if wrong |
|------------|----------|-----------------|
| chrome.storage.local available | All storage operations | Extension cannot function |
| Web Crypto API available | src/shared/crypto.js, src/content/crypto-content.js | Encryption feature unavailable |
| content_scripts run at document_idle | manifest.json | UI may inject before DOM is ready |
| Max z-index ~2^31 | sticky-inject.css | Cluster may appear behind host-page overlays |

## Environment differences

| Context | Module system | chrome.storage.session | Notes |
|---------|--------------|----------------------|-------|
| Content scripts | Namespace (window.StickySites) | Yes (with setAccessLevel) | 7 scripts loaded sequentially |
| Service worker | ES modules (import/export) | Yes (native) | Context menus, commands, popout window |
| Popup page | Script tags | Yes (native) | Loads crypto-content.js via tag |
| Vitest tests | ES modules | Mocked | chrome.storage.local mocked in-memory |
