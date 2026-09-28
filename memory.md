# StickySites Memory Log

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
