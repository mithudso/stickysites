# docs/archive

Rotated-out sections of the append-forever workflow logs (`memory.md`, `prompts.md`).
`npm run logs:rotate` moves the oldest `## ` sections here once a log crosses ~200 KB
(`scripts/rotate-workflow-logs.mjs`; refuses to run while an editor swap file is live).
Nothing else belongs in this directory.
