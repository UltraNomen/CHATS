#!/bin/sh
# Starts PHP-FPM in the background and Caddy in the foreground (Caddy is the container's main process).
set -e
# `docker run chats <command>` runs that command instead (php -m, sh, …).
if [ "$#" -gt 0 ]; then exec "$@"; fi
mkdir -p /data/caddy
chown www-data:www-data /data
php-fpm -D
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
