# AGENTS.md

Catalog of repo-local agents.

This repository defines **no repo-local agents** — there is no `.claude/agents/` or
`.github/agents/` directory. Global/user-level agents (code review, security review, doc
critique, repo-health-auditor) apply as usual; nothing here overrides them.

Guidance for any coding agent working in this repo lives in:

| Agent | File | Notes |
|---|---|---|
| Claude Code | `CLAUDE.md` | Canonical rule set: repository shape, commands, conventions, workflow log rule |
| GitHub Copilot | `.github/copilot-instructions.md` | Mirrors `CLAUDE.md`; starts with `## Default Execution Strategy` |
| Gemini CLI | `GEMINI.md` | Points at `CLAUDE.md`; lists Gemini-only mappings |

External dependencies an agent may need to know about:

- **Native-messaging host** `com.mitch.todo_bridge` — installed outside this repo by
  `python3 ~/.claude/skills/todo/scripts/todo.py install-native-host`. Optional; the
  extension works without it. See `docs/external-calls.md`.
- **MCP** — no MCP server is shipped here; the developer's `global_ai_hub` server indexes
  this repo for semantic search. See `docs/MCP.md`.

No agent in this repo requires environment variables or external auth.
