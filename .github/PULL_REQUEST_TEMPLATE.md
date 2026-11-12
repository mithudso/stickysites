## What changed

<!-- Describe what you changed. -->

## Why

<!-- Why is this change needed? Link to an issue if applicable. -->

## Tests

- [ ] `npm run lint && npm test` pass locally
- [ ] Changed surface exercised with relevant actual-runtime fixtures; validation and limits recorded
- [ ] (If storage or crypto changed) encrypt → lock → unlock and failure preservation covered
- [ ] Browser/manual validation recorded when run; no live activation implied by automated tests

## Risk

<!-- What could go wrong? Does this touch storage keys, permissions, or the vault? -->

- [ ] No storage key format changes (or a read-time migration is included)
- [ ] No new permissions added to `manifest.json`
- [ ] `manifest.json` and `package.json` versions bumped together

## Rollback

<!-- How does a user get back to the previous state? For an unpacked install: `git checkout <prev>` + reload. Note any storage migration that cannot be reversed. -->
