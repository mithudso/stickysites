# Runbook: cut a release (zip for the Chrome Web Store)

**Precondition**: `main` green in CI; `manifest.json` and `package.json` carry the same new
version (`npm run lint` enforces this); `memory.md` / `prompts.md` updated.

## Steps

1. Bump the version in **both** files (patch for fixes, minor for features):
   ```bash
   npm version <new-version> --no-git-tag-version
   # Set manifest.json to the same version; review the diff.
   npm run lint
   ```
2. Commit, push, merge via PR (CI must pass).
3. If a release tag is wanted, tag the verified merged commit with that release version.
   Do not tag an unfinished branch or overwrite an existing tag.
4. Build the store zip (runtime files only; the script refuses on version drift):
   ```bash
   npm run build:store        # → dist/stickysites-<version>.zip + printed file listing
   ```
5. Upload on the item's **Package** tab in the Chrome Web Store developer dashboard and
   submit for review. Full walkthrough and listing copy: `store/README.md`.

## Verification

- `unzip -l stickysites-<version>.zip` lists no `tests/`, `docs/`, `node_modules/`, `scripts/`,
  or `.remember/` entries.
- Load the unzipped folder unpacked in a fresh profile and run the checks in
  `load-and-reload-extension.md`.

## Rollback

Unpacked test installs: use a clean isolated checkout of the previous tag, then reload
only the intended test profile. Preserve unrelated work and active sessions. Store installs: upload the
previous zip as a new version (store versions must increase — bump patch again).
Storage keys are versioned (`_v1`) and readers adapt legacy shapes, so no data migration
runs on downgrade.
