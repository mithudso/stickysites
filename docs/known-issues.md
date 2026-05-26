# Known issues

## No Shadow DOM encapsulation

**Impact**: Medium
**Status**: Open

The content script injects elements directly into the host page's DOM. Host-page CSS
with aggressive selectors (e.g., `* { all: unset }` or `div { display: none }`) can
break the StickySites UI. Conversely, host-page JavaScript can read the note textarea
content.

**Workaround**: None currently. Future fix: wrap injected elements in a Shadow DOM root.

## Content script re-injection on extension update

**Impact**: Low
**Status**: Mitigated

Chrome may re-inject content scripts after an extension update. The guard clause
(`if (document.getElementById('stickysites-strip')) return;`) prevents double UI, but
event listeners from the previous injection may remain orphaned.

**Workaround**: Reload the page after updating the extension.

## No note export or backup

**Impact**: Low
**Status**: Open

Notes live only in `chrome.storage.local`. Uninstalling the extension or clearing
browser data deletes all notes with no recovery path.

## Shared storage module not used by content script

**Impact**: Low (code duplication)
**Status**: By design

`notes-storage.js` exports the same storage helpers that `sticky-inject.js` defines
inline, because MV3 content scripts cannot use ES module imports. This means storage
logic exists in two places that must be kept in sync manually.
