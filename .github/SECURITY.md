# Security Policy

## Reporting vulnerabilities

Open a **private security advisory** on this repository
(GitHub → Security → Advisories → Report a vulnerability) or email the maintainer listed in
`.github/CODEOWNERS`. Please do not file public issues for security bugs.

## Response time

- Acknowledgement within **3 business days**.
- Assessment and a fix or mitigation plan within **14 days** for confirmed issues.
- Fixes ship as a patch version; the release note credits the reporter unless asked otherwise.

## Scope

StickySites stores notes locally and has no hosted telemetry service. Optional integrations
use a native-messaging host, loopback HTTP, paired LAN peers, or a user-selected shared/cloud folder.
The interesting surfaces are the AES-256-GCM vault (`src/content/crypto-content.js`), the
content scripts injected into every page, and the optional native-messaging to-do sync.

## Threat model

See [docs/SECURITY.md](../docs/SECURITY.md) for the full threat model, permissions audit,
encryption design, key lifecycle, and data handling.
