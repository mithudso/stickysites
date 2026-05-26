# Contributing

Thanks for your interest in StickySites.

## Getting started

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup instructions, commands,
and coding conventions.

## Pull requests

1. Fork the repo and create a feature branch
2. Make your changes, following the conventions in DEVELOPMENT.md
3. Run `npm test` and ensure all tests pass
4. Submit a PR using the [PR template](.github/PULL_REQUEST_TEMPLATE.md)

## Code style

- Vanilla JS only — no frameworks, transpilers, or bundlers
- Content scripts use `window.StickySites` namespace (no ES modules)
- All DOM elements use `stickysites-` prefix
- Storage keys are versioned with `_v1` suffix
- 2-space indentation, LF line endings (enforced by .editorconfig)
