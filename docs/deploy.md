# Deploying CHATS

**English** · [فارسی](deploy.fa.md)

CHATS has three parts: the **chat app** (a PWA), the **admin console** and the **API**. They can live together in one web root, which is the usual setup, or on separate hosts.

| setup | assets | who types a server address |
|---|---|---|
| [Shared hosting](#shared-hosting), [nginx](#nginx), [Docker](#docker) | `chats-full` or the Docker image | nobody: both apps find the API next to them |
| [Split deployment](#split-deployments) | `chats-api-php` + `chats-client` (+ `chats-admin`) | users once, or nobody if you follow an invite link or use a [branded client](#branded-clients) |

All setups need **HTTPS**, except on `localhost`. Service workers, push notifications and installing the app all depend on it.

## Shared hosting

This works on any host with PHP 8.1+ and `pdo_sqlite` (or `pdo_mysql` / `pdo_pgsql`), `openssl` and `curl` or `allow_url_fopen`. It has been tested on a LiteSpeed cPanel host, installed in a subfolder.

1. **Upload** `chats-full-vX.zip` to your web root or a subfolder (for example `public_html/chat`) and extract it.
2. **PHP version.** If the domain runs PHP older than 8.1, switch only the CHATS folder by putting this at the top of its `.htaccess`. The rest of the site keeps its own version.
   ```apache
   <IfModule mime_module>
     AddHandler application/x-httpd-ea-php83 .php .php8 .phtml
   </IfModule>
   ```
   CloudLinux `alt-php` builds use `application/x-httpd-alt-php83___lsphp` instead.
3. **Data folder.** Keep it outside the web root. Create, for example, `/home/USER/chats-data`, then add `api/config.local.php`:
   ```php
   <?php
   define('CHATS_DATA', '/home/USER/chats-data');
   define('CHATS_SETUP_TOKEN', 'a-long-random-string'); // locks the setup wizard until you use it
   ```
   Without this file, data goes to `<web root>/data`, which is protected only by an Apache rule.
4. **Setup.** Open `/admin/` (for example `https://example.org/chat/admin/`) and enter the setup token. Opening `/admin/?setup=TOKEN` skips the token screen.

Uploads are limited by PHP (`api/.user.ini` asks for 64 MB). Raise `upload_max_filesize` and `post_max_size` if you raise the limit in the console.

Hosts often turn off `allow_url_fopen` or functions like `disk_free_space`. CHATS then uses cURL for push notifications and S3, and skips the disk numbers.

## nginx

```nginx
root /srv/chats;           # contents of chats-full
index index.html;

location = /sw.js         { add_header Cache-Control "no-cache"; }
location = /index.html    { add_header Cache-Control "no-cache"; }
location ~ ^/i/[A-Za-z0-9-]+/?$ { try_files /index.html =404; }
location = /share-target  { try_files /index.html =404; }
location ^~ /data/        { deny all; }
location ~ ^/api/(lib|routes|test)/ { deny all; }

location /api/ {
    try_files $uri /api/index.php?$query_string;
    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param CHATS_DATA /var/lib/chats;
        fastcgi_pass unix:/run/php/php8.3-fpm.sock;
        client_max_body_size 70m;
    }
}
```

## Docker

The image `ghcr.io/ultranomen/chats` runs Caddy and PHP-FPM with the full bundle. Caddy fetches and renews a certificate by itself once `CHATS_DOMAIN` points at the server.

```bash
docker run -d --name chats -p 80:80 -p 443:443 -v chats-data:/data \
  -e CHATS_DOMAIN=chat.example.org -e CHATS_SETUP_TOKEN="$(openssl rand -hex 16)" \
  ghcr.io/ultranomen/chats:latest
```

| variable | meaning |
|---|---|
| `CHATS_DOMAIN` | your domain, which gets automatic HTTPS. `:80` (the default) serves plain HTTP, for localhost or behind your own proxy |
| `CHATS_SETUP_TOKEN` | the setup wizard only opens with this token |
| `CHATS_DB_ENGINE`, `_HOST`, `_PORT`, `_NAME`, `_USER`, `_PASS`, `_PATH` | pre-fill the wizard's database step (`sqlite`, `mysql` or `postgres`) |
| `CHATS_S3_ENDPOINT`, `_REGION`, `_BUCKET`, `_KEY`, `_SECRET`, `_PATH_STYLE` | pre-fill the wizard's storage step |
| `CHATS_PUSH_HOSTS` | extra push service hostnames to allow (comma-separated) |

Preset passwords and secret keys never reach the browser: the wizard shows "set by the server environment", and the server fills them in when it tests or launches. Everything that has to persist (database file, keys, `config.json`, encrypted files, certificates) lives in `/data`.

### Compose

[`deploy/compose`](../deploy/compose) has ready-made stacks:

| file | what you get |
|---|---|
| `compose.yml` | CHATS with SQLite |
| `compose.postgres.yml` | CHATS + PostgreSQL 16 |
| `compose.mysql.yml` | CHATS + MySQL 8.4 |
| `compose.s3.yml` | overlay: encrypted files go to SeaweedFS (S3-compatible) instead of the volume |

```bash
cd deploy/compose
cp .env.example .env                    # set CHATS_SETUP_TOKEN, CHATS_DOMAIN, CHATS_DB_PASS (and CHATS_S3_SECRET)
docker compose -f compose.postgres.yml -f compose.s3.yml up -d
```

Then open `https://<domain>/admin/?setup=<token>`. The database and bucket are already filled in.

To run a build from your own checkout instead of the published image: `npm run build`, then `docker compose … up -d --build`.

## Split deployments

You can host the three parts separately, for example the API at `api.example.org`, the chat app at `app.example.org`, and the console wherever you like:

1. **API:** extract `chats-api-php-vX.zip` at the web root of `api.example.org`. It contains an `api/` folder, so the API answers at `https://api.example.org/api/`, and the server address users type is just `api.example.org`. Set up the data folder as for shared hosting.
2. **Chat app:** extract `chats-client-vX.zip` at `app.example.org`. The app asks for the server address the first time.
3. **Console:** use `chats-admin-vX.html` from anywhere: a static host, an intranet, or a file on your laptop (`file://`). It asks for the server address, shows the server's key fingerprint before you sign in, and warns if that key ever changes.
4. In the console, set **server settings → chat app address** to `https://app.example.org`. Invite links then look like `https://app.example.org/?invite=CODE&server=api.example.org`, so the app connects to the right server by itself.

The API accepts calls from any origin (bearer tokens, no cookies), so no CORS setup is needed.

## Branded clients

A branded client only ever talks to one server and skips the connect screen. Build it from source:

```bash
CHATS_SERVER=chat.example.org npm run build   # dist/client (and dist/full) are locked to that server
```

The full bundle doesn't need this, since it always finds its own server. Use branded clients when the app is hosted apart from the API, or when you publish it under its own name.

## Updating

- **Shared hosting:** extract `chats-update-vX.zip` over the old files. It is the full bundle without the root `.htaccess`, so local lines such as the PHP handler stay. `api/config.local.php` is never part of a release, so it is kept too.
- **Docker:** `docker pull ghcr.io/ultranomen/chats:latest && docker compose up -d` (or `docker run` again with the same volume).
- New database tables are created on the first request after an upgrade. Update the apps and the API together: both apps refuse servers that speak a newer protocol and say why.
