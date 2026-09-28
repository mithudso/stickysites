## What changed

<!-- Describe what you changed. -->

## Why

<!-- Why is this change needed? Link to an issue if applicable. -->

## Tests

- [ ] `npm run lint && npm test` pass locally
- [ ] Extension reloaded at `chrome://extensions` and the changed surface exercised on a real page
- [ ] (If storage or crypto changed) `npm run verify:live` run, or manual check of encrypt → lock → unlock

## Risk

<!-- What could go wrong? Does this touch storage keys, permissions, or the vault? -->

- [ ] No storage key format changes (or a read-time migration is included)
- [ ] No new permissions added to `manifest.json`
- [ ] `manifest.json` and `package.json` versions bumped together

## Rollback

<!-- How does a user get back to the previous state? For an unpacked install: `git checkout <prev>` + reload. Note any storage migration that cannot be reversed. -->
