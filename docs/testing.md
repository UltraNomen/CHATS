# Testing

| command | what it covers | needs |
|---|---|---|
| `npm run test:client` | malformed encrypted messages, previews, cached copies, file types | nothing |
| `php api/php/test/security.php` | push address policy, challenges, trust tokens, invite state (offline, no server) | PHP 8.1+ |
| `node tests/e2e.mjs http://127.0.0.1:8792` | the API conformance suite: setup, 2FA, sign-up and login, direct and group chats, delta sync, receipts, edits, encrypted files, invites, reports, recovery, maintenance, capabilities, audit, backups, health | an **empty**, disposable server |
| `node tests/security.mjs http://127.0.0.1:8791` | security regressions: staff 2FA, recovery replay and races, avatar races, push policy, vault conflicts, typing privacy, setup status | an **empty**, disposable server on loopback |

Both API suites install the server they're pointed at, so give each one a fresh data folder:

```bash
npm run build
for p in 8791 8792; do mkdir -p /tmp/chats-$p; CHATS_DATA=/tmp/chats-$p php -S 127.0.0.1:$p -t dist/full & done
node tests/security.mjs http://127.0.0.1:8791
node tests/e2e.mjs http://127.0.0.1:8792
```

## Other databases and storage

The suites take JSON settings from the environment:

| variable | effect |
|---|---|
| `E2E_DB` | database the server is installed with, e.g. `{"engine":"postgres","host":"127.0.0.1","port":"5432","name":"chats","user":"chats","pass":"…"}` (both suites) |
| `E2E_STORAGE` | blob storage it is installed with, e.g. `{"backend":"s3","endpoint":"http://127.0.0.1:8333","region":"us-east-1","bucket":"chats","key":"…","secret":"…","pathStyle":true}` (e2e) |
| `E2E_STORAGE_SWITCH` | array of storage configs to switch through afterwards; every earlier file must still download (e2e) |
| `E2E_MIGRATE` | array of database configs to migrate the live server through; sessions, messages, files and logins must survive (e2e) |

CI runs both suites against SQLite, MySQL 8.4 and PostgreSQL 16 on every push ([.github/workflows/ci.yml](../.github/workflows/ci.yml)). Also tested by hand: database migrations in both directions, storage switches between local folders and S3 (SeaweedFS, path-style), and every Docker Compose variant.

Not yet tested against a live service: virtual-hosted-style S3 URLs (`pathStyle` off, as on AWS).

## Helpers

- `node tests/seed.mjs http://127.0.0.1:8792` adds 10 users, a chat and an open report to an installed server with open sign-up.
- `tests/peer.mjs` signs in as a test user and replies to the newest group message. It's useful for watching delivery and receipts in a browser.
