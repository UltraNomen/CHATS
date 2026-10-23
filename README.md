# CHATS

End-to-end encrypted chat you host yourself: an installable web app (PWA), an admin console, and a small PHP API that runs anywhere from shared hosting to Docker.

The server only ever stores ciphertext, wrapped keys and hashes. Passwords, messages, contacts, group names, files and the 8-word recovery phrase never reach it in readable form.

- **Chat app.** Direct and group chats, files and photos, replies, edits, forwarding, pinned messages, mentions, typing indicators, push notifications, offline mode, a Farsi interface, and an app lock.
- **Admin console.** A first-run setup wizard, users and roles, reports, invite codes, announcements, storage, backups, an audit log, two-factor sign-in and an IP allow-list.
- **API.** PHP 8.1+ with no dependencies. Works with SQLite, MySQL/MariaDB or PostgreSQL, and stores files on local disk or any S3-compatible service. You can switch databases and storage while it's running.

## Download

Every [release](https://github.com/UltraNomen/CHATS/releases) has these assets:

| asset | what it is | use it when |
|---|---|---|
| `chats-full-vX.zip` | chat app at `/`, console at `/admin/`, API at `/api/` | **most people.** Upload it to one web root and nobody has to type a server address |
| `chats-update-vX.zip` | the same files without the root `.htaccess` | upgrading an install whose `.htaccess` has your own lines |
| `chats-client-vX.zip` | the chat app alone | the app lives on a different host than the API |
| `chats-admin-vX.html` | the console as **one HTML file** | managing a server from anywhere, even a file on your laptop |
| `chats-api-php-vX.zip` | the API alone, in an `api/` folder | API on its own host; the apps are hosted elsewhere |
| `ghcr.io/ultranomen/chats:X` | Docker image: Caddy (automatic HTTPS) + PHP + the full bundle | servers and VPSes |

`SHA256SUMS` lists checksums for every file.

## Quick start

**Shared hosting (cPanel, Plesk, any PHP 8.1+ host).** Upload `chats-full-vX.zip` to your web root or a subfolder and extract it, then open `/admin/`. [docs/deploy.md](docs/deploy.md#shared-hosting) covers PHP versions, keeping the data folder private and locking setup with a token.

**Docker, one container with SQLite:**

```bash
docker run -d --name chats -p 80:80 -p 443:443 -v chats-data:/data \
  -e CHATS_DOMAIN=chat.example.org -e CHATS_SETUP_TOKEN="$(openssl rand -hex 16)" \
  ghcr.io/ultranomen/chats:latest
```

Then open `https://chat.example.org/admin/?setup=<token>`.

**Docker Compose** with PostgreSQL, MySQL and/or S3 storage: see [deploy/compose](deploy/compose).

```bash
cd deploy/compose && cp .env.example .env    # set CHATS_SETUP_TOKEN, CHATS_DOMAIN, CHATS_DB_PASS
docker compose -f compose.postgres.yml up -d  # or compose.yml (SQLite), compose.mysql.yml; add -f compose.s3.yml for object storage
```

The setup wizard is pre-filled with the database and bucket from the environment. Their passwords stay on the server.

## Repository

```
client/        chat PWA (Preact): builds into one index.html + sw.js + manifest + icons
admin/         admin console (Preact): builds into one self-contained HTML file
shared/        code both apps use: crypto, API client, i18n, design system, fonts
api/php/       the API (PHP 8.1+, no dependencies)
tests/         API conformance + security suites (Node), client tests
scripts/       build, release packaging, versioning
deploy/        Dockerfile, Caddyfile, compose variants
docs/          deployment, operations, testing
```

## Development

Needs Node 20+ and PHP 8.1+ (or Docker).

```bash
npm ci
npm run build                                   # → dist/full, dist/client, dist/admin, dist/api-php
CHATS_DATA=/tmp/chats php -S localhost:8780 -t dist/full   # serve the full bundle
npm run dev                                     # chat app with hot reload, /api proxied to :8780
npm run dev:admin                               # same for the console
```

A **branded client** is locked to one server and skips the connect screen:

```bash
CHATS_SERVER=chat.example.org npm run build     # dist/client and dist/full use that server only
```

Tests are described in [docs/testing.md](docs/testing.md), and releases in [CONTRIBUTING.md](CONTRIBUTING.md#releases).

## Docs

- [Deployment](docs/deploy.md): shared hosting, nginx, Docker and compose, split deployments, branded clients, updating
- [Operations](docs/operations.md): backups, switching database or storage, push, two-factor, versions
- [Testing](docs/testing.md)
- [Security](SECURITY.md): reporting vulnerabilities, the encryption model, hardening
- [Changelog](CHANGELOG.md)

## License

[AGPL-3.0](LICENSE). You can use, change and host CHATS freely. If you run a modified version for other people, you must offer them its source code.
