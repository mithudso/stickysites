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
  notes-storage.test.js   — unit tests for shared storage module
```

### What to test

The shared storage module (`src/shared/notes-storage.js`) is the primary test
target because:

1. It exports pure-ish functions with clear inputs/outputs
2. It can be tested with a `chrome.storage.local` mock
3. The content script's inline helpers mirror these functions

### Chrome API mocking

Tests must mock `chrome.storage.local` since Vitest runs in Node, not Chrome.
Recommended pattern:

```js
const store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: store[keys] };
        return Object.fromEntries(
          Object.entries(store).filter(([k]) => keys.includes(k))
        );
      },
      set: async (items) => Object.assign(store, items),
      remove: async (keys) => {
        for (const k of [].concat(keys)) delete store[k];
      }
    }
  }
};
```

### What not to unit-test

- DOM injection logic in `sticky-inject.js` — this is tightly coupled to the
  Chrome content script runtime. Validate it manually or with Playwright E2E tests
  using `launchPersistentContext` with the extension loaded.
- Service worker message passing — test integration, not unit.

## Coverage

No coverage target set yet. Priority areas:

1. `parseTags()` — edge cases with mixed delimiters, duplicates, empty input
2. `getSiteKey()` — URL parsing, `www.` stripping, invalid URLs
3. `readSiteNote()` / `writeSiteNote()` — round-trip consistency, missing keys
4. `createDebouncedSaver()` — timer behavior
