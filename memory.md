# StickySites Memory Log

## v1.12.1 - 2026-09-28
- User request:
  - Yes: install the peer helper on this laptop
- Completed:
  - Installed (`launchd` job `com.stickysites.peer`, peer name "m5"); found that a VPN owning the default
    route makes macOS refuse the multicast send — daemon now announces on every real LAN interface via
    multicast **and** subnet broadcast, skips tunnel interfaces, joins the group per interface and
    survives a failed join, logs once per failing path, no duplicate log lines under launchd
  - Test hardened (waits for both discovery directions); docs/README/runbook/known-issues updated
- In progress:
  - None
- Next steps:
  - Reload the extension in the real Chrome profiles so the 1.12 service worker starts pushing snapshots
  - Install on the second laptop with the printed pairing key

## v1.12.0 - 2026-09-28
- User request:
  - Add a local peer sync so laptops on the same network stay in sync with each other
- Completed:
  - `src/shared/peer-sync.js` (snapshot, vault compatibility, record-level LWW merge + tombstones,
    `syncWithDaemon`) + 24 tests; SW wiring (1-min alarm, 4 s debounce, `STICKYSITES_PEER_SYNC_NOW`,
    crypto adapter via `importJwk`); popup Settings → Local Peer Sync (On/Off, Sync now, status)
  - `peer/stickysites-peer.py` daemon (loopback API with CORS for the extension, LAN HTTPS relay with
    pinned self-signed cert + bearer token, HMAC-signed multicast discovery on the default-route
    interface with address candidates, launchd install) + `peer/test_peer.py` (2 daemons; in CI) + README
  - `importJwk` in both crypto modules; outline delete writes a tombstone; new storage keys
    `stickysites_tombstones_v1`, `stickysites_peer_v1`
  - Docs: CLAUDE.md, ARCHITECTURE (flow 9, ADR-9), SECURITY, external-calls (row 2 + outcomes),
    COMPONENTS, codebase-overview, TESTING, DEVELOPMENT, INSTALLATION, known-issues, logging,
    runbooks/peer-sync.md, PRIVACY.md, store listing; index; llms suite; version 1.12.0
  - Live smoke: real daemon + extension in Chrome for Testing → snapshot pushed, settings renders status
- In progress:
  - None
- Next steps:
  - Install the helper on each laptop (`peer/README.md`); consider a manual peer-address fallback
    for networks without multicast; tombstones for any future delete paths

## v1.11.2 - 2026-09-27
- User request:
  - Get the repo ready for Chrome Web Store submission; produce a full file listing of everything needed
- Completed:
  - `store/README.md` (asset table + dashboard walkthrough), `store/listing.md`, `store/permissions-justifications.md`,
    `PRIVACY.md` (public policy URL), 5 × 1280×800 screenshots (`scripts/store-screenshots.mjs`), promo tiles
    (`scripts/store-promo.mjs`), `scripts/build-store-zip.mjs` (`npm run build:store`, guarded), manifest
    `homepage_url` + `minimum_chrome_version`; docs/index/CLAUDE.md updated; version 1.11.2
- In progress:
  - None
- Next steps:
  - Owner: register the Chrome Web Store developer account ($5, separate from Google Play), verify email/2SV,
    trader declaration, then upload `dist/stickysites-1.11.2.zip` and paste the copy (store/README.md § 3)
  - After approval: add the store URL to README.md and docs/INSTALLATION.md

## v1.11.1 - 2026-09-27
- User request:
  - Run the repo-bootstrapper (mdb-tam standard) on this repo
- Completed:
  - Workflow: `.github/copilot-instructions.md`, `AGENTS.md`, `GEMINI.md`, `memory.md`,
    `prompts.md`, `docs/archive/`, `scripts/rotate-workflow-logs.mjs`; `CLAUDE.md` rewritten
    (v1.11.1, `alarms`/`nativeMessaging` permissions, todo-bridge, workflow log rule, stale
    semantic-indexer header removed)
  - Tooling: `scripts/check-syntax.mjs` (`npm run lint`), `scripts/check-doc-indexes.mjs`
    (`npm run docs:check-indexes`), `vitest.config.js` → `.mjs`, npm scripts for icons /
    verify:live / logs:rotate; `.github/workflows/test.yml` → `ci.yml` (lint, test, index
    check, manifest validation)
  - Dotfiles: `.vscode/launch.json`, `.vscode/mcp.json`, `.mcp.json`, `.env.example`;
    `.github/SECURITY.md` response SLA; PR template rollback section
  - Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/COMPONENTS.md`, `docs/DEVELOPMENT.md`,
    `docs/TESTING.md`, `docs/SECURITY.md`, `docs/INSTALLATION.md`, `docs/requirements.md`,
    `docs/codebase-overview.md`, `docs/integrations-and-assumptions.md`, `docs/known-issues.md`,
    `docs/onboarding.md`, `docs/external-calls.md` rewritten against v1.11 code (cached key is
    in `chrome.storage.local`, not `chrome.storage.session`; 101 tests / 4 files; function-key
    shortcuts; to-do sync); new `docs/MCP.md`, `docs/logging.md`,
    `docs/caching-and-optimization.md`, `docs/runbooks/*.md`, `docs/high_signal_file_index.json`,
    `docs/repo-bootstrap-audit-2026-09-27.md`
  - llms suite (`llms.txt`, `llms-full.txt`, `llms-small.txt`, `llms-facts.txt`) regenerated
  - Code (cdo pass): see `docs/repo-bootstrap-audit-2026-09-27.md` § Code findings
  - Hub registry path corrected to `/Users/mitch/dev/stickysites`
- In progress:
  - None
- Next steps:
  - Decide whether `src/shared/notes-storage.js` should become the storage layer the
    extension actually uses (today only tests import it) or be trimmed to what tests need
  - Shadow DOM encapsulation for injected UI (`docs/known-issues.md`)
