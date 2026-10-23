# Contributing

Bug reports and pull requests are welcome. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Setup

```bash
npm ci
npm run build
CHATS_DATA=/tmp/chats php -S localhost:8780 -t dist/full   # API + apps on :8780
npm run dev          # chat app with hot reload (proxies /api to :8780)
npm run dev:admin    # console with hot reload
```

- `shared/` is used by both apps. Import it as `#shared/core/…` or `#shared/ui/…`; Vite and Node resolve that through `package.json` `imports`.
- The API is plain PHP 8.1+ with no dependencies. Keep it that way, so it runs on shared hosting.
- Match the style of the surrounding code: inline styles taken from the design, short comments that explain why.

## Before you open a pull request

Run the checks CI runs (see [docs/testing.md](docs/testing.md)):

```bash
npm run build && npm run test:client
php api/php/test/security.php
node tests/security.mjs http://127.0.0.1:8791    # against an empty server
node tests/e2e.mjs http://127.0.0.1:8792         # against another empty server
```

API changes need to keep `tests/e2e.mjs` passing. If a change breaks older clients, bump `CHATS_PROTOCOL` in `api/php/lib/config.php` and `PROTOCOL` in `shared/core/api.js` together.

## Releases

1. `npm run version:set 2.7.0`. This sets the version in `package.json` and the API.
2. Add a `## [2.7.0] - date` section to `CHANGELOG.md`; it becomes the release notes.
3. Commit, then `git tag v2.7.0 && git push origin main v2.7.0`.

The [release workflow](.github/workflows/release.yml) builds every bundle, publishes the GitHub release with `SHA256SUMS`, and pushes `ghcr.io/ultranomen/chats:2.7.0` and `:latest`. `npm run release` builds the same assets locally in `dist/release/`.

By contributing you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
