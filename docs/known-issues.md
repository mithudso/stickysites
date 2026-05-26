# Known issues

## No Shadow DOM encapsulation

**Impact**: Low–Medium
**Status**: Open

The content scripts inject elements directly into the host page's DOM. Host-page CSS
with aggressive selectors (e.g., `* { all: unset }` or broad `div` rules) can break
the StickySites UI. Conversely, host-page JavaScript can read the note panel's DOM.

The floating cluster design (v1.7.0) reduces the visual footprint compared to the old
fixed sidebar, but does not fully eliminate the risk.

**Workaround**: None currently. Future fix: wrap injected elements in a Shadow DOM root.

## Content script re-injection on extension update

**Impact**: Low
**Status**: Mitigated

Chrome may re-inject content scripts after an extension update. The guard clause
(`if (document.getElementById('stickysites-cluster')) return;`) prevents double UI,
but event listeners from the previous injection may remain orphaned.

**Workaround**: Reload the page after updating the extension.

## Google Drive sync requires a real OAuth client_id

**Impact**: High (Drive sync non-functional without it)
**Status**: Open

The `manifest.json` `oauth2.client_id` field contains a placeholder value. Drive sync
will fail for any user who installs the extension without replacing this with a valid
OAuth 2.0 client ID registered in Google Cloud Console with the
`https://www.googleapis.com/auth/drive.appdata` scope.

**Workaround**: Register a project at console.cloud.google.com, create OAuth credentials
for a Chrome Extension, and replace the `client_id` in `manifest.json` before packaging.

## PBKDF2 key derivation is slow on low-end devices

**Impact**: Low (UX)
**Status**: By design

Key derivation uses 600,000 PBKDF2 iterations, which is the NIST-recommended minimum
for 2023. On low-end mobile or older desktop hardware this can take 2–4 seconds each
time the user enters their passphrase to unlock. There is no loading indicator during
derivation, so the unlock button appears to hang.

**Workaround**: None. Future improvement: add a spinner or "Unlocking…" message during
derivation.

## Conflict copies are not surfaced in the popup UI

**Impact**: Low
**Status**: Open

When Drive sync detects a write conflict (both local and remote data changed since the
last sync), the losing copy is saved under a `_conflict_<timestamp>` key in
`chrome.storage.local`. These copies accumulate silently and are never shown to the user
or offered for review/deletion.

**Workaround**: Conflicts can be inspected manually via the Chrome DevTools
Application → Storage panel. Future improvement: show a conflict badge in the popup
with a diff/merge UI.

## package.json version does not match manifest version

**Impact**: Low (tooling confusion)
**Status**: Open

`package.json` declares version `1.0.0`, while `manifest.json` declares `1.7.0`.
The npm version field has no runtime effect but can cause confusion when using
automated release tools that read from `package.json`.

**Workaround**: Manually keep both versions in sync. Future improvement: add a
pre-release script that reads the manifest version and updates `package.json`.
