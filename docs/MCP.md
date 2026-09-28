# MCP

## Servers shipped by this repo

**None.** StickySites is a Chrome extension with no server process, so it exposes no
Model Context Protocol tools and has no MCP-facing operations registry. The
`server/src/lib/operations-registry.js` + `tam_ops_*` tool contract from the mdb-tam
standard does not apply here; the single out-of-browser call (native-messaging to-do
sync) is inventoried in [external-calls.md](external-calls.md) instead.

## Servers used while developing this repo

| Server | Config | Purpose | Auth |
|---|---|---|---|
| `global_ai_hub` | `.mcp.json` (Claude Code), `.vscode/mcp.json` (VS Code) | Local semantic index over `~/dev/*` — `hub_search_codebase`, `hub_search_symbols`, `hub_ask`, `hub_pm_get` (project registry) | None; stdio, runs from `~/.global-ai-hub/.venv` |

The hub server is the developer's machine-wide tool, not part of the extension. Both config
files start it with the same command; neither carries environment values (the hub's Ollama
endpoints are set in `~/.global-ai-hub/.mcp.json`, outside this public repo).

### Usage

- "Where is X / what does Y do" → `hub_search_codebase` with `--prefix /Users/mitch/dev/stickysites`
  before grepping.
- Project record (purpose, files, outstanding items) → `hub_pm_get stickysites`.
- Register / refresh the record: `python3 ~/.global-ai-hub/scripts/project_manager.py upsert stickysites --path <abs path>`.

If the server is unreachable, fall back to `grep`/`Read`; nothing in the build or tests
depends on it.

## Health check

```bash
"$HOME/.global-ai-hub/.venv/bin/python" "$HOME/.global-ai-hub/mcp-server/hub_mcp_server.py" --help
```

A non-zero exit means the hub venv is missing on this machine; the extension is unaffected.
