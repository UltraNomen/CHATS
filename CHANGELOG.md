# Changelog

One version covers the API, the chat app and the console. Releases are tagged `vX.Y.Z`.

## [2.6.0] - 2026-10-24

First public release from this repository.

**Releases and deployment**
- The repository is split into `client/`, `admin/`, `shared/`, `api/php/`, `tests/`, `deploy/` and `docs/`.
- Each release publishes the full bundle, an update bundle, the chat app alone, the console as a single HTML file, and the PHP API alone, plus `SHA256SUMS`.
- The Docker image `ghcr.io/ultranomen/chats` (amd64 and arm64) runs Caddy with automatic HTTPS and PHP-FPM.
- Compose stacks for SQLite, PostgreSQL 16 and MySQL 8.4, with an S3 overlay (SeaweedFS).
- `CHATS_DB_*` and `CHATS_S3_*` environment variables pre-fill the setup wizard. Their passwords and secrets stay on the server.
- CI runs the conformance and security suites against SQLite, MySQL and PostgreSQL on every push.

**Chat app and console**
- The full bundle connects to its own server automatically; nobody types an address.
- Branded clients: `CHATS_SERVER=chat.example.org npm run build` locks the chat app to one server.
- The console is one self-contained HTML file that works anywhere, including opened from disk. It asks for the server address, pins the server's key and warns if it changes.
- New setting, *chat app address*, for split deployments. Invite links then open the app there and name the server.
- `/info` reports a `protocol` number, and both apps refuse servers that need a newer app.
- The setup wizard can be locked with `CHATS_SETUP_TOKEN` and has its own unlock screen.

**Fixes**
- `127.0.0.1` addresses were sent over https on the connect screen.
- PHP notices could end up inside API responses on hosts that display errors. They now go to the log only.

## [2.5.0]

**Security**
- Decrypted files keep their type only if it's a raster image (png, jpeg, gif, webp, avif). Anything else, SVG included, is stored as `application/octet-stream` and shown as a file. Avatars get their type from their magic bytes.
- Both apps ship a hash-pinned Content-Security-Policy. Decrypted files opened in a tab inherit it.
- A password reset with the recovery phrase no longer skips two-factor.
- Setting a new recovery phrase needs the current password.
- "Remember this device" tokens are tied to the password and authenticator.
- Push subscriptions must carry a valid P-256 key and a 16-byte auth secret. A stored subscription that can't be encrypted for is pruned.
- `setup/status` no longer reveals host details after install.
- Two vault saves on the same version can no longer both succeed; the loser gets `vault_conflict` and the client merges.

**Admin two-factor is optional:** *two-factor → policy → admins* is `optional` (the default) or `required`.

**Chat app** (from the Chat v3.1 design): drag and drop files, upload progress with cancel, "is typing", presence in the header, personal pinned messages (synced in the encrypted vault), @mention links, keyboard shortcuts (`?` lists them), and a pink theme.

## [2.4.2]

- Staff need a current authenticator or backup code to replace their authenticator or generate backup codes.
- Reset authorizations are single-use, tied to the current credentials, and consumed atomically.
- Group invite wrappers are size-limited. Direct chats reject invitations. Avatar changes are serialized per account. Orphan cleanup includes unused avatars.
- The client validates decrypted messages and cached copies. Old caches are discarded once and rebuilt.
- Push goes only to supported browser services, on HTTPS port 443, to public pinned addresses. `CHATS_PUSH_HOSTS` adds services.

## [2.4.1]

- First complete version: PWA chat app, admin console with setup wizard, PHP API on SQLite, MySQL or PostgreSQL, local or S3 storage.
