# Repository bootstrap audit — 2026-11-12

Repository: `mithudso/stickysites`. Baseline: `a4dc8246a9faa9743539ddbf20dd2810113b9e11`.
This audit accompanies the 1.13.1 maintenance change. The dated optimizer report and
coverage ledger account for executable review, findings, tests, exclusions, and rollback.

## Scope and decisions

The maintained product remains a vanilla Manifest V3 extension with no build step and no
runtime npm dependencies. The optional stdlib-Python daemon/CLI remains optional. This task
used an isolated worktree and preserved the primary checkout, other branches, and the open
Dependabot PR. Only task-owned changes are delivered.

The prior [2026-09-27 audit](repo-bootstrap-audit-2026-09-27.md) was read before changes.
Its retractions remain binding: no invented server operations registry/dashboard, no duplicate
semantic indexer, and no change from the deliberate local JWK cache to session storage.
Shadow DOM encapsulation remains an existing design limitation rather than a maintenance
redesign. Read-time legacy schema adaptation and versioned storage keys remain intact.

## Workflow and repository metadata

| Standard | Result and evidence |
|---|---|
| Copilot default strategy | Required heading is first; read-before-edit, checks, verified commands, and paired version/log rules are present. Safe automated fixtures replace a mandatory live activation. |
| Canonical and Gemini guidance | CLAUDE repository shape, commands, module boundaries, key schema, and workflows match the current code. GEMINI points to shared conventions. Brittle test counts removed. |
| Agent catalog | AGENTS correctly states no repo-local agent directories. External native host and optional global MCP dependencies are documented. No agent catalog invented. |
| Workflow logs | New versioned 1.13.1 entries preserve prior contents. Both logs remain below the rotation threshold. Rotation itself now has fence-aware sections, journal recovery, and cooperating locks. |
| Versions / toolchain | Manifest and package are 1.13.1. `.nvmrc` selects Node22; engines narrow supported releases to the actual dev-tool requirements. No runtime package added. |
| Formatting / Git metadata | Existing EditorConfig and LF/binary attributes retained. Gitignore covers dependencies, environment files, build/test outputs, caches and Python bytecode. |
| Environment reference | `.env.example` covers both browser harnesses' SS_CHROME and daemon STICKYSITES_HOME. Values are placeholders; no dotenv loader is claimed. |
| VS Code | Existing formatter/debug configs retained; ESLint/Python recommendations and synthetic Python unittest debug configuration added. MCP server names/command shape agree across configs; sensitive configuration bodies are not concatenated into retrieval guides. |
| CI | PR checks install locked dev dependencies, run syntax/semantic lint, Vitest, actual-daemon synthetic tests, index/generated drift checks, package validation, and manifest validation. Action v4 references are SHA pinned. |
| Dependency updates | Weekly npm and GitHub Actions Dependabot entries. Compatible Vitest/Vite refresh removes the baseline advisory. ESLint9 avoids the new minimatch advisory in the proposed ESLint10 graph; no forced dependency override. |
| Ownership / templates | Existing CODEOWNERS, issue templates and contribution policy retained. PR validation template records fixture coverage and live-check limitations without implying activation. |
| Funding | Valid YAML; supported provider usernames and custom links preserve the existing destinations. |
| Security / legal | Existing MIT license, code of conduct, and vulnerability-response SLA retained without new grants or promises. Security scope now describes optional network/folder integrations accurately. |

## Documentation and retrieval

Architecture, components, requirements, installation, development, testing, logging, privacy,
integrations, known issues, runbooks, and store copy were reconciled against source. The
maintained [wiki index](wiki/index.md) is present. Guides distinguish synthetic runtime tests
from browser layout, native-host, installed service, real LAN, and cloud-provider validation.

The text-only `scripts/generate-docs.mjs` inventories tracked and nonignored new files without
a file cap. It labels generated assets, frozen compatibility data, historical plans and private
operator context. It generates the high-signal index, codebase overview, llms index, complete
selected public-guide text, separate abstracts, and source-derived configuration facts.
`--check` detects drift; path checks reject repository escapes and missing required indexes.
Private workflow logs, archives, and agent/MCP configuration bodies are excluded from the
concatenated public guides. No semantic indexing or embedding operation was requested or intentionally invoked. Earlier
pre-control fixture runs remain unverified for inherited configuration effects. The optimizer
report records their source-bound paths/time window and the later hostile-hook isolation test.

## External-call standards

The full inventory is [external-calls.md](external-calls.md), including daemon administration,
child processes, browser tooling, file writes, and the optional global developer MCP boundary.
The server-oriented standard is adapted explicitly rather than reported as literal compliance.

| Standard | Applicability and verified behavior |
|---|---|
| CLI or MCP trigger | Existing browser controls/messages, optional daemon CLI, and npm tooling provide actual triggers. A server MCP registry is inapplicable to this extension. |
| Central failure log | Browser console diagnostics use operation/error fields; daemon has a local log; developer commands fail with named diagnostics. No hosted JSONL logging service is added. |
| Remediation by outcome | The external-call guide maps vault, malformed response, timeout, stale input, and persistence outcomes. Normal alarms retry later; auth/config/data failures require inspection. No destructive auto-remediation. |
| Dashboard/status card | Popup peer status and existing daemon CLI are the product surfaces. Server dashboard cards and tam_ops registrations are inapplicable; no dashboard runtime is invented. |
| Datastore verification | The authoritative worker queue reads fresh values, commits atomically and verifies storage readback. Long sync calls use guarded commits. Daemon config/snapshot state is published after successful disk replacement. External native-host file persistence and cloud propagation are not independently verified. |

## Extended checks and retained boundaries

- The extension has a vault, local cached JWK, native host authorization, LAN pairing/bearer/
  certificate pinning, and signed folder snapshots. Security documentation describes each.
  Passphrases are entered only in extension-origin windows. An open panel remains readable
  by host-page scripts. Sanitization prevents imported markup
  from adding active/resource nodes; it does not claim DOM isolation.
- Encrypted snapshots still expose tombstone keys/timestamps, vault config and device/folder
  metadata. Vault-off snapshots contain plaintext notes. A folder signature does not encrypt
  the file. User-selected cloud providers may transfer data outside the LAN.
- No OAuth/cookie server, offscreen document, repo-local MCP server, native-host directory,
  or context-skill package is shipped here. Their runtime inventories/self-tests are N/A.
- Optional global hub read-only lookup worked. Project registration is refreshed through its
  supported CLI with the original primary path, remote, and preserved status; readback is
  required. No registry reset or duplicate index is used.
- Maintained source and tracked-path review found no customer export/dataset to import or
  publish. Frozen crypto vectors are synthetic compatibility data and remain unchanged.
  No customer research, private transcript, cache, or unrelated working tree is staged.
- Concept/semantic corpus mutation is outside this task. Existing global search is an
  optional developer integration, not a required extension runtime.

## Verification and limits

Baseline: syntax, existing JS tests, index checks and packaging passed. Homebrew Python's
original seven-test fixture failed with `RuntimeError: peers never discovered each other`;
Apple Python passed with cleanup warnings. The replacement fixture imports the actual daemon,
uses temporary homes and ephemeral loopback HTTP/TLS/UDP ports, and exercises signed unicast
discovery. Before the guard update, it passed under both installed interpreters and simultaneous runs.
Later guarded verification covers exact inherited TCP fixtures and injected UDP parsing.
The batch guard has no UDP fixture allowance; full actual discovery remains a CI gate.

The final command matrix, exact counts, independent gate result, and residual Low findings
are recorded in the optimizer report. Optional private-vault package tests remain skipped
when that package is absent; always-on tests decrypt the unchanged legacy corpus with the
real shared primitives. No browser install/reload, installed helper, native-host call, launchd
change, real LAN transmission, cloud sync, store publication, or semantic run is claimed.

## Delivery and rollback

Delivery requires passing checks on the final PR commit, an actual merge, and verification of
the intended content on remote main. The local receipt records the PR URL, merge identity,
checks, original-checkout synchronization, and task-worktree cleanup after that verification.
Literal source rollback commands and centralized snapshots are in the optimizer report.
Reverting code does not undo user data edits made after installation; back up/export first.
