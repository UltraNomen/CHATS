# Docker Compose stacks

**English** · [فارسی](README.fa.md)

| file | what you get |
|---|---|
| `compose.yml` | CHATS with SQLite: the smallest setup |
| `compose.postgres.yml` | CHATS + PostgreSQL 16 |
| `compose.mysql.yml` | CHATS + MySQL 8.4 |
| `compose.s3.yml` | overlay: encrypted files go to SeaweedFS (S3-compatible) instead of the CHATS volume |

```bash
cp .env.example .env     # set CHATS_SETUP_TOKEN, CHATS_DOMAIN, CHATS_DB_PASS (and CHATS_S3_SECRET for the overlay)
docker compose up -d                                          # SQLite
docker compose -f compose.postgres.yml up -d                  # PostgreSQL
docker compose -f compose.mysql.yml -f compose.s3.yml up -d   # MySQL + object storage
```

Then open `https://<CHATS_DOMAIN>/admin/?setup=<CHATS_SETUP_TOKEN>`. The wizard is pre-filled with the database and bucket; their passwords stay on the server.

With `CHATS_DOMAIN` set to a real domain that points at this machine, Caddy gets a certificate automatically (ports 80 and 443 must be reachable). With `:80` the stack serves plain HTTP, for localhost or behind your own reverse proxy.

Every stack runs the published `ghcr.io/ultranomen/chats` image. To run your own checkout instead: `npm run build` at the repo root, then add `--build`.

More in [docs/deploy.md](../../docs/deploy.md#docker).
