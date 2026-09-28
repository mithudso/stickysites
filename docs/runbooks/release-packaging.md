# Runbook: cut a release (zip for the Chrome Web Store)

**Precondition**: `main` green in CI; `manifest.json` and `package.json` carry the same new
version (`npm run lint` enforces this); `memory.md` / `prompts.md` updated.

## Steps

1. Bump the version in **both** files (patch for fixes, minor for features):
   ```bash
   # example: 1.11.1
   sed -i '' 's/"version": "[0-9.]*"/"version": "1.11.1"/' manifest.json package.json
   npm run lint
   ```
2. Commit, push, merge via PR (CI must pass).
3. Tag: `git tag v1.11.1 && git push origin v1.11.1`.
4. Build the store zip from a clean tree (dev files excluded):
   ```bash
   zip -r stickysites-1.11.1.zip manifest.json icons/ src/ popup.html popup.js popup.css \
     popout.html popout.js popout.css -x "*.DS_Store"
   ```
5. Upload at the Chrome Web Store developer dashboard (not yet published — see
   `docs/INSTALLATION.md`).

## Verification

- `unzip -l stickysites-1.11.1.zip` lists no `tests/`, `docs/`, `node_modules/`, `scripts/`,
  or `.remember/` entries.
- Load the unzipped folder unpacked in a fresh profile and run the checks in
  `load-and-reload-extension.md`.

## Rollback

Unpacked installs: `git checkout <previous tag>` and click ↻. Store installs: upload the
previous zip as a new version (store versions must increase — bump patch again).
Storage keys are versioned (`_v1`) and readers adapt legacy shapes, so no data migration
runs on downgrade.
