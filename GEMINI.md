# GEMINI.md

Gemini CLI instructions for this repo. Canonical conventions live in `CLAUDE.md` —
follow its **Conventions**, **Commands**, and **Workflow log rule** sections verbatim.

Quick facts:

- Chrome Extension, Manifest V3, vanilla JavaScript, **no build step**. Load the repo root
  unpacked at `chrome://extensions`.
- Content scripts (`src/content/`) are classic scripts sharing `window.StickySites.*`;
  only the service worker is an ES module. Load order in `manifest.json` matters.
- Checks: `npm run lint && npm test` (syntax gate + 125 vitest unit tests; `npm run test:peer` for the daemon). CI mirrors this.
- Storage: `chrome.storage.local` only, keys `stickysites_*_v1` + `stickysites_cached_key`.
  Encryption invariants (never write plaintext while locked, `{ iv, data }` envelopes)
  must not be weakened — see `docs/SECURITY.md`.
- Bump `manifest.json` **and** `package.json` versions together; CI fails on drift.

Gemini-only tool mappings: none. There are no repo-local skills to `activate_skill`; use
the shell for the npm scripts above.
