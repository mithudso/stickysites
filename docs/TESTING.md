# Testing

## Framework

[Vitest](https://vitest.dev/) v4.1+ — fast, ESM-native test runner.

## Commands

```bash
npm test            # single run
npm run test:watch  # watch mode with HMR
```

## Test structure

```
tests/
  notes-storage.test.js   — 43 tests for the shared storage module
  crypto.test.js          — 5 tests for the shared crypto module
```

Total: **48 tests** across 2 files.

## `tests/notes-storage.test.js`

Tests all exports from `src/shared/notes-storage.js` using a `chrome.storage.local` mock
implemented as an in-memory `store` object. Each `describe` block calls `beforeEach(() => { store = {}; })` to reset state.

### Test suites

| Suite | Tests | What is covered |
|-------|-------|-----------------|
| `getSiteKey` | 3 | hostname extraction, `www.` stripping, invalid URL returns `''` |
| `parseTags` | 5 | empty input, comma/space splitting, `#` prefix preservation, deduplication, lowercasing |
| `global note` | 2 | empty read, write + read round-trip |
| `site note` | 5 | null on miss, write + read round-trip, `createdAt` preservation on update, delete, read-all |
| `getPageKey` | 4 | `origin + pathname` extraction, query-string stripped, hash stripped, invalid URL returns `''` |
| `page note` | 5 | null on miss, write + read round-trip, `createdAt` preservation, delete, read-all |
| `preferences` | 3 | default values, write + read back, partial merge |
| `todo` | 5 | null on miss, write + read round-trip, `createdAt` preservation, delete, read-all |
| `outline` | 5 | null on miss, write + read round-trip, `createdAt` preservation, delete, read-all |
| `daily note` | 6 | getDailyKey format, null on miss, write + read round-trip, `createdAt` preservation, delete, read-all |

### Chrome API mocking

```js
let store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, store[k]]));
        return { ...store };
      },
      set: async (items) => { Object.assign(store, items); },
      remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
    }
  }
};
```

## `tests/crypto.test.js`

Tests the pure cryptographic primitives in `src/shared/crypto.js`. Uses the Web Crypto
API available in the Vitest environment.

| Test | What is covered |
|------|-----------------|
| `generateSalt returns 16 bytes` | Returns a `Uint8Array` of length 16 |
| `deriveKey returns a CryptoKey` | Returns a secret `CryptoKey` from passphrase + salt |
| `encrypt and decrypt round-trip` | Encrypted envelope decrypts back to the original plaintext |
| `decrypt fails with wrong key` | Decrypting with a different derived key throws |
| `isEncrypted detects encrypted envelopes` | Correctly identifies `{ iv, data }` vs. plain note shapes |

## What is not unit-tested

- **DOM injection** in `sticky-inject.js`, `cluster.js`, `panel.js` — tightly coupled to
  the Chrome content-script runtime. Validate manually or with Playwright E2E tests using
  `launchPersistentContext` with the extension loaded.
- **Service worker message passing** — integration test territory, not unit tests.
- **Drive sync** in `service-worker.js` / `drive-sync.js` — requires mocking the Drive API
  and `chrome.identity`; currently covered by manual testing only.
- **Popup** (`popup.js`) — DOM-heavy; covered by manual testing and visual inspection.

## Coverage priorities for future tests

1. `createDebouncedSaver()` — timer behavior and cancellation
2. `clipToNote()` in `sticky-inject.js` — requires DOM + storage mocks
3. Drive sync conflict logic in `service-worker.js` — timestamp comparison edge cases
4. Popup search/sort/filter logic in `popup.js` — pure filtering functions are extractable
