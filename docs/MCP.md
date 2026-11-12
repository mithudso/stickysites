# MCP

## Shipped runtime

StickySites ships no Model Context Protocol server or MCP operation registry. Its runtime is
an extension plus an optional Python peer daemon/CLI. The optional native host is installed
outside this repository. Native, loopback, paired LAN, and shared-folder boundaries are
inventoried in [external-calls.md](external-calls.md).

## Developer tooling

`global_ai_hub` is a machine-wide developer tool configured by `.mcp.json` and
`.vscode/mcp.json`. It supplies semantic search (`hub_search_codebase`,
`hub_search_symbols`, `hub_ask`) and project lookup (`hub_pm_get`). It is not shipped with
the extension, and the build/tests do not depend on it. There is no repo-local indexer.
Use the tool's actual schema for search filters; do not invent a `--prefix` argument.
If the hub is unavailable, use `rg` and read the source.

## Project record maintenance

Use the installed `project_manager.py` CLI, after inspecting its help. Read the existing
record before an update:

```bash
python3 "$HOME/.global-ai-hub/scripts/project_manager.py" get stickysites
python3 "$HOME/.global-ai-hub/scripts/project_manager.py" upsert stickysites --path "$PWD" --status <existing-status>
```

Replace `<existing-status>` with the status just read. The CLI defaults to `active`; omitting
`--status` can overwrite a preserved status. Do not initialize, delete, or recreate the hub
registry to refresh this repository's path. Hub authentication/endpoints remain machine
configuration outside the public repository.
