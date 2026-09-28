# StickySites

[![CI](https://github.com/mithudso/stickysites/actions/workflows/ci.yml/badge.svg)](https://github.com/mithudso/stickysites/actions/workflows/ci.yml)

Sticky notes for every website. A Chrome Extension (Manifest V3, v1.12.0) with six note
types, a floating draggable icon cluster, a rich-text workspace panel with find & replace and
@-mention autocomplete, a full to-do list that can sync with a local `TODO.md`, a global
outliner library, opt-in AES-256-GCM encryption at rest, and optional peer-to-peer sync between
your own laptops on the same network. No servers, no internet calls.

## Note types

| Color  | Type        | Scope |
|--------|-------------|-------|
| Yellow | Global      | One shared note, visible on every site |
| Green  | Site        | One note per domain |
| Blue   | Page        | One note per exact URL path |
| Purple | To-do list  | One global checklist with sections, priorities, tags, colors |
| Orange | Outliner    | Global library of named hierarchical outlines |
| Red    | Daily       | One note per calendar date (YYYY-MM-DD) |

## Features

### Floating icon cluster
- Draggable pill with one identity-bearing icon per note type (🌐, domain fragment, path
  segment, day of month); long-press to reorder; horizontal or vertical layout
- **Alt+S** shows/hides the cluster; **Ctrl/Cmd+F1…F6** open Global, Site, Page, To-do,
  Outline, Daily (toggle: same key closes, another key switches)
- Icons and open site/page notes follow SPA navigation automatically

### Workspace panel
- Move by the header; resize from any edge or corner; expand/shrink toggle
- **Pop out** to a standalone window with the ⧉ button — or drag the panel off the page
- Rich text editor with a 19-tool toolbar (bold, italic, underline, strikethrough, H1–H3,
  lists, checkbox, alignment, rule, indent/outdent, font family, font size, color)
- **Find & Replace** (`Cmd/Ctrl+F` / `Cmd/Ctrl+H`) with match counter and Replace All
- `@` mentions: links, dates, contacts, files; inline `#tags`; auto-save after 500 ms
- Live cross-tab sync — edits in one tab appear in every other open panel

### To-do list
- Nested items (Tab/Shift+Tab), sections, priority 0–5, color swatches, tags, per-item notes,
  drag-to-reorder, completed timestamps
- Optional two-way sync with a local `TODO.md` through a native-messaging host
  (`docs/external-calls.md`); works fully offline without it

### Outliner
- Library of named outline documents with a switcher; New / Rename / Duplicate / Delete
- Keyboard-first: Enter, Tab/Shift+Tab, Alt+↑/↓, Ctrl/Cmd+Enter to complete
- Zoom into any node (breadcrumb back), collapse, per-node notes, `#tag` chips, filter,
  heuristic Auto-group with Undo, export to Markdown or OPML

### Context menu
- Right-click selected text → **StickySites** → clip into any of the six note types

### Popup
- Quick-Open row (one button per note type), full-text search, sort (Recent / Oldest / A–Z),
  type and tag filters, Markdown export
- Settings: encryption Enable / Disable / **Lock Now**, note-type visibility, cluster layout

### Local peer sync (optional)
- Keep two or more of your laptops converged over the local network — no account, no cloud
- A tiny stdlib-Python helper on each machine discovers peers (multicast + subnet broadcast, pairing key) and relays
  snapshots over pinned TLS; merging is record-level last-writer-wins inside the extension
- Encrypted vaults sync as envelopes; enable encryption on one laptop and the others adopt it
- Setup: `python3 peer/stickysites-peer.py install` — see [peer/README.md](peer/README.md)

### Encryption at rest
- Opt-in AES-256-GCM; key derived from your passphrase with PBKDF2 (600,000 iterations, SHA-256)
- The derived key is cached locally until you click **Lock Now**; an in-page lock overlay
  asks for the passphrase when locked. There is no passphrase recovery — see
  `docs/runbooks/encryption-lock-and-recovery.md`

## Quick start

1. Clone this repository
2. Open `chrome://extensions`, enable **Developer mode**
3. **Load unpacked** → select the repo root
4. Visit any page: click a cluster icon, or press **Ctrl/Cmd+F1**

Full details: [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Development

```bash
npm install                 # vitest + canvas (dev only)
npm run lint                # syntax gate for every script + version agreement
npm test                    # 125 unit tests (vitest, node env, chrome mocked)
npm run docs:check-indexes  # retrieval indexes point at real files
```

No build step — Chrome loads the repo root directly. Requires Node ≥ 22 for the tooling.
See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) and [docs/TESTING.md](docs/TESTING.md).

## Tech stack

- Chrome Extension Manifest V3 (content scripts + module service worker)
- Vanilla JavaScript and CSS — no frameworks, transpilers, or bundlers
- Web Crypto API (PBKDF2, AES-256-GCM)
- Vitest for unit tests; puppeteer-core harness for live verification

## Documentation

| Document | Contents |
|----------|----------|
| [CLAUDE.md](CLAUDE.md) | Agent guide: shape, commands, conventions, storage keys, workflow log rule |
| [Architecture](docs/ARCHITECTURE.md) | Runtime contexts, data flows, storage schema, design decisions |
| [Components](docs/COMPONENTS.md) | Module-by-module API reference |
| [Codebase overview](docs/codebase-overview.md) | Every file, grouped by directory |
| [Development](docs/DEVELOPMENT.md) | Setup, commands, conventions, debugging |
| [Testing](docs/TESTING.md) | Suites, coverage targets, CI gates, live harness |
| [Installation](docs/INSTALLATION.md) | Install, update, uninstall, optional to-do host |
| [Security](docs/SECURITY.md) | Threat model, permissions audit, encryption design |
| [External calls](docs/external-calls.md) | The one out-of-browser call and its standards audit |
| [Integrations & assumptions](docs/integrations-and-assumptions.md) | Chrome APIs relied on, hardcoded assumptions |
| [Logging](docs/logging.md) · [Caching](docs/caching-and-optimization.md) | Diagnostics and performance notes |
| [Runbooks](docs/runbooks/) | Load/reload, release, to-do sync troubleshooting, encryption recovery |
| [Known issues](docs/known-issues.md) · [Requirements](docs/requirements.md) · [Onboarding](docs/onboarding.md) | |
| [Peer sync](peer/README.md) | Local-network sync between your laptops: install, merge rules, security model |
| [Privacy policy](PRIVACY.md) · [Store kit](store/README.md) | What the extension stores; Chrome Web Store submission assets and checklist |
| [llms.txt](llms.txt) | LLM context index (`llms-full.txt`, `llms-small.txt`, `llms-facts.txt`) |

## License

MIT — see [LICENSE](LICENSE).
