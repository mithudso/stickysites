# Phase 5B: Encryption at Rest

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Opt-in AES-GCM encryption for all note data, passphrase-based key derivation, unlock on extension load

## Summary

Add opt-in encryption that encrypts all note data in chrome.storage.local using
AES-256-GCM derived from a user passphrase via PBKDF2. The derived key is cached
in chrome.storage.session for the browser session. When encryption is enabled,
a passphrase dialog appears on extension load (popup open or cluster interaction).
Existing plaintext notes are encrypted when the feature is enabled.

## Decisions

| Decision | Choice |
|----------|--------|
| Algorithm | AES-256-GCM via Web Crypto API |
| Key derivation | PBKDF2 with 600,000 iterations, SHA-256 |
| Key storage | chrome.storage.session (per browser session) |
| When to prompt | On extension load when encryption is enabled |
| Opt-in model | Off by default, enable from popup settings |

## Architecture

### New files

| File | Purpose |
|------|---------|
| src/shared/crypto.js | Encrypt/decrypt functions, PBKDF2 key derivation |
| src/content/lock-screen.js | Passphrase prompt UI injected into page |

### Modified files

| File | Change |
|------|--------|
| src/content/panel.js | Wrap _readNote/_writeNote with decrypt/encrypt |
| src/content/sticky-inject.js | Check lock state before showing panel, add lock-screen |
| src/background/service-worker.js | Validate passphrase, cache key in session storage |
| popup.js | Check lock state, show unlock prompt or notes |
| popup.html | Add settings gear and encryption toggle UI |
| popup.css | Lock screen and settings styles |
| manifest.json | Bump to v1.6.0 |

### Storage schema additions

| Key | Contents |
|-----|----------|
| stickysites_crypto_v1 | { enabled: bool, salt: base64, verify: base64-encrypted-known-string } |

The salt is generated once when encryption is first enabled. The verify field
is a known string ("stickysites-verify") encrypted with the derived key. On
unlock, we attempt to decrypt the verify field. If it succeeds, the passphrase
is correct.

## Crypto module (src/shared/crypto.js)

ES module exporting:

```
deriveKey(passphrase, salt) -> CryptoKey
encrypt(key, plaintext) -> { iv: base64, data: base64 }
decrypt(key, { iv, data }) -> plaintext
generateSalt() -> Uint8Array (16 bytes)
isEncrypted(value) -> bool (checks for { iv, data } shape)
```

AES-GCM with 12-byte random IV per encryption. PBKDF2 with 600,000 iterations
of SHA-256 for key derivation.

## Encryption wrapper

A thin wrapper around the existing storage read/write functions. When encryption
is enabled:

- On write: JSON.stringify the note object, encrypt it, store the encrypted
  envelope { iv, data } in place of the plaintext object
- On read: check if the stored value has { iv, data } shape. If so, decrypt
  and JSON.parse. If not (legacy plaintext), return as-is.

This means encrypted and unencrypted notes can coexist during migration.

## Unlock flow

1. User enables encryption in popup settings -> enters passphrase twice
2. Salt generated, key derived, verify string encrypted, all stored in
   stickysites_crypto_v1
3. Derived key cached in chrome.storage.session
4. All existing notes encrypted in-place

On next browser session:
1. Popup opens or user clicks cluster icon
2. Check chrome.storage.session for cached key
3. If no key: show passphrase prompt
4. User enters passphrase, key derived, verify field decrypted to confirm
5. If correct: key cached in session, proceed
6. If wrong: show error, let user retry

## Disable encryption flow

1. User toggles encryption off in settings
2. All notes decrypted and re-saved as plaintext
3. stickysites_crypto_v1 cleared
4. Session key cleared

## Content script lock screen

When encryption is enabled and no session key exists, the cluster icons are
visible but clicking one shows a small lock overlay instead of the panel.
The lock overlay has a passphrase input and unlock button. On successful
unlock, the panel opens normally.

## Popup lock screen

When encryption is enabled and no session key exists, the popup shows a
centered passphrase prompt instead of the notes list. On unlock, it
loads and displays notes normally.

## Out of Scope

| Feature | Phase |
|---------|-------|
| Sync (Chrome sync + Google Drive) | 5C |
| Biometric unlock | Future |
| Per-note encryption (some encrypted, some not) | Future |
