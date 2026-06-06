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

## PBKDF2 key derivation is slow on low-end devices

**Impact**: Low (UX)
**Status**: By design

Key derivation uses 600,000 PBKDF2 iterations, which is the NIST-recommended minimum
for 2023. On low-end mobile or older desktop hardware this can take 2–4 seconds each
time the user enters their passphrase to unlock. There is no loading indicator during
derivation, so the unlock button appears to hang.

**Workaround**: None. Future improvement: add a spinner or "Unlocking…" message during
derivation.

