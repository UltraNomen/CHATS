# CHATS all-in-one image: Caddy (automatic HTTPS) + PHP-FPM serving the full bundle (chat app, console, API).
# Build from the repo root after `npm run build`:   docker build -f deploy/docker/Dockerfile -t chats .
FROM php:8.3-fpm-alpine

RUN apk add --no-cache caddy libpq \
 && apk add --no-cache --virtual .build-deps postgresql-dev \
 && docker-php-ext-install pdo_mysql pdo_pgsql \
 && apk del .build-deps

COPY deploy/docker/php.ini /usr/local/etc/php/conf.d/chats.ini
COPY deploy/docker/www.conf /usr/local/etc/php-fpm.d/zz-chats.conf
COPY deploy/docker/Caddyfile /etc/caddy/Caddyfile
COPY deploy/docker/entrypoint.sh /usr/local/bin/chats-entrypoint
COPY dist/full /srv/chats

RUN chmod +x /usr/local/bin/chats-entrypoint \
 && rm -f /srv/chats/.htaccess /srv/chats/api/.htaccess /srv/chats/api/.user.ini \
 && mkdir -p /data /data/caddy \
 && chown -R www-data:www-data /data

# CHATS_DATA: database, keys, config and encrypted files. XDG_*: where Caddy keeps its certificates.
ENV CHATS_DATA=/data \
    CHATS_DOMAIN=:80 \
    XDG_DATA_HOME=/data/caddy \
    XDG_CONFIG_HOME=/data/caddy

VOLUME /data
EXPOSE 80 443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1/api/?r=info || exit 1
ENTRYPOINT ["chats-entrypoint"]
