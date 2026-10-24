# راهنمای نصب CHATS

[English](deploy.md) · **فارسی**

CHATS سه بخش دارد: **برنامه‌ی گفتگو** (یک PWA)، **کنسول مدیریت** و **API**. این سه می‌توانند کنار هم در یک پوشه‌ی وب باشند، که حالت معمول است، یا روی میزبان‌های جدا.

| روش نصب | فایل‌ها | چه کسی نشانی سرور را وارد می‌کند |
|---|---|---|
| [هاست اشتراکی](#هاست-اشتراکی)، [nginx](#nginx)، [Docker](#docker) | `chats-full` یا ایمیج Docker | هیچ‌کس؛ هر دو برنامه API کنار خودشان را پیدا می‌کنند |
| [نصب جداگانه](#نصب-جداگانه) | `chats-api-php` + `chats-client` (+ `chats-admin`) | کاربران یک بار، یا هیچ‌کس اگر از لینک دعوت یا [نسخه اختصاصی برنامه](#نسخه-اختصاصی-برنامه) استفاده شود |

همه‌ی روش‌ها به **HTTPS** نیاز دارند، به‌جز روی `localhost`. سرویس‌ورکر، اعلان فوری و نصب برنامه همه به آن وابسته‌اند.

## هاست اشتراکی

روی هر هاستی با PHP 8.1 به بالا و `pdo_sqlite` (یا `pdo_mysql` / `pdo_pgsql`)، `openssl` و یکی از `curl` یا `allow_url_fopen` کار می‌کند. روی یک هاست cPanel با LiteSpeed، داخل یک زیرپوشه، آزمایش شده است.

1. **بارگذاری.** فایل `chats-full-vX.zip` را در پوشه‌ی اصلی سایت یا یک زیرپوشه (مثلاً `public_html/chat`) بارگذاری و از حالت فشرده خارج کنید.
2. **نسخه‌ی PHP.** اگر دامنه نسخه‌ای قدیمی‌تر از 8.1 دارد، فقط پوشه‌ی CHATS را عوض کنید: این خطوط را بالای `.htaccess` همان پوشه بگذارید. بقیه‌ی سایت نسخه‌ی خودش را نگه می‌دارد.
   ```apache
   <IfModule mime_module>
     AddHandler application/x-httpd-ea-php83 .php .php8 .phtml
   </IfModule>
   ```
   در CloudLinux با PHPهای `alt-php` به‌جای آن از `application/x-httpd-alt-php83___lsphp` استفاده کنید.
3. **پوشه‌ی داده.** آن را بیرون از پوشه‌ی وب نگه دارید. مثلاً `/home/USER/chats-data` را بسازید و فایل `api/config.local.php` را اضافه کنید:
   ```php
   <?php
   define('CHATS_DATA', '/home/USER/chats-data');
   define('CHATS_SETUP_TOKEN', 'a-long-random-string'); // تا وقتی از آن استفاده نکنید، راه‌انداز قفل می‌ماند
   ```
   بدون این فایل، داده‌ها در `<پوشه‌ی وب>/data` ذخیره می‌شوند که فقط با یک قانون Apache محافظت می‌شود.
4. **راه‌اندازی.** `/admin/` را باز کنید (مثلاً `https://example.org/chat/admin/`) و توکن راه‌اندازی را وارد کنید. باز کردن `/admin/?setup=TOKEN` صفحه‌ی توکن را رد می‌کند.

حجم بارگذاری را PHP محدود می‌کند (`api/.user.ini` حدود ۶۴ مگابایت درخواست می‌کند). اگر در کنسول محدودیت بارگذاری را بالا بردید، `upload_max_filesize` و `post_max_size` را هم بالا ببرید.

بسیاری از هاست‌ها `allow_url_fopen` یا توابعی مثل `disk_free_space` را خاموش می‌کنند. در این حالت CHATS برای اعلان فوری و S3 از cURL استفاده می‌کند و آمار دیسک را نشان نمی‌دهد.

## nginx

```nginx
root /srv/chats;           # محتوای chats-full
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

ایمیج `ghcr.io/ultranomen/chats` شامل Caddy و PHP-FPM با بسته‌ی کامل است. وقتی `CHATS_DOMAIN` به سرور اشاره کند، Caddy خودش گواهی HTTPS را می‌گیرد و تمدید می‌کند.

```bash
docker run -d --name chats -p 80:80 -p 443:443 -v chats-data:/data \
  -e CHATS_DOMAIN=chat.example.org -e CHATS_SETUP_TOKEN="$(openssl rand -hex 16)" \
  ghcr.io/ultranomen/chats:latest
```

| متغیر | کاربرد |
|---|---|
| `CHATS_DOMAIN` | دامنه‌ی شما، با HTTPS خودکار. مقدار پیش‌فرض `:80` یعنی HTTP ساده، برای localhost یا پشت پراکسی خودتان |
| `CHATS_SETUP_TOKEN` | راه‌انداز فقط با این توکن باز می‌شود |
| `CHATS_DB_ENGINE`، `_HOST`، `_PORT`، `_NAME`، `_USER`، `_PASS`، `_PATH` | مرحله‌ی پایگاه داده‌ی راه‌انداز را از پیش پر می‌کنند (`sqlite`، `mysql` یا `postgres`) |
| `CHATS_S3_ENDPOINT`، `_REGION`، `_BUCKET`، `_KEY`، `_SECRET`، `_PATH_STYLE` | مرحله‌ی فضای ذخیره‌سازی را از پیش پر می‌کنند |
| `CHATS_PUSH_HOSTS` | نام سرویس‌های اعلان فوری اضافه (با ویرگول جدا شوند) |

رمز پایگاه داده و کلید محرمانه‌ی S3 هرگز به مرورگر نمی‌رسند: راه‌انداز «تنظیم‌شده توسط محیط سرور» نشان می‌دهد و سرور هنگام آزمون یا راه‌اندازی خودش آن‌ها را قرار می‌دهد. هر چیزی که باید بماند (فایل پایگاه داده، کلیدها، `config.json`، فایل‌های رمزنگاری‌شده و گواهی‌ها) در `/data` است.

### Compose

پیکربندی‌های آماده در [`deploy/compose`](../deploy/compose/README.fa.md):

| فایل | چه چیزی راه می‌اندازد |
|---|---|
| `compose.yml` | CHATS با SQLite |
| `compose.postgres.yml` | CHATS + PostgreSQL 16 |
| `compose.mysql.yml` | CHATS + MySQL 8.4 |
| `compose.s3.yml` | افزونه: فایل‌های رمزنگاری‌شده به‌جای حجم داده در SeaweedFS (سازگار با S3) ذخیره می‌شوند |

```bash
cd deploy/compose
cp .env.example .env                    # CHATS_SETUP_TOKEN، CHATS_DOMAIN، CHATS_DB_PASS (و CHATS_S3_SECRET)
docker compose -f compose.postgres.yml -f compose.s3.yml up -d
```

سپس `https://<دامنه>/admin/?setup=<توکن>` را باز کنید؛ پایگاه داده و فضای ذخیره‌سازی از قبل پر شده‌اند.

## نصب جداگانه

می‌توانید سه بخش را جدا میزبانی کنید، مثلاً API در `api.example.org`، برنامه‌ی گفتگو در `app.example.org` و کنسول هرجا که خواستید:

1. **API:** فایل `chats-api-php-vX.zip` را در ریشه‌ی `api.example.org` باز کنید. داخل آن پوشه‌ی `api/` است، پس API در `https://api.example.org/api/` پاسخ می‌دهد و نشانی‌ای که کاربران وارد می‌کنند فقط `api.example.org` است. پوشه‌ی داده را مثل هاست اشتراکی تنظیم کنید.
2. **برنامه‌ی گفتگو:** فایل `chats-client-vX.zip` را در `app.example.org` باز کنید. برنامه بار اول نشانی سرور را می‌پرسد.
3. **کنسول:** فایل `chats-admin-vX.html` را از هرجا باز کنید: یک میزبان ساده، شبکه‌ی داخلی، یا یک فایل روی لپ‌تاپ (`file://`). نشانی سرور را می‌پرسد، پیش از ورود اثر انگشت کلید سرور را نشان می‌دهد و اگر روزی عوض شود هشدار می‌دهد.
4. در کنسول، **تنظیمات سرور ← نشانی برنامه‌ی گفتگو** را روی `https://app.example.org` بگذارید. لینک‌های دعوت به این شکل می‌شوند: `https://app.example.org/?invite=CODE&server=api.example.org`، و برنامه خودش به سرور درست وصل می‌شود.

API درخواست از هر مبدأ را می‌پذیرد (توکن، بدون کوکی)، پس تنظیم CORS لازم نیست.

## نسخه اختصاصی برنامه

نسخه‌ی اختصاصی فقط با یک سرور کار می‌کند و صفحه‌ی اتصال را نشان نمی‌دهد. آن را از کد منبع بسازید:

```bash
CHATS_SERVER=chat.example.org npm run build   # dist/client (و dist/full) فقط به همین سرور وصل می‌شوند
```

بسته‌ی کامل به این نیازی ندارد، چون همیشه سرور خودش را پیدا می‌کند. نسخه‌ی اختصاصی برای وقتی است که برنامه جدا از API میزبانی می‌شود، یا می‌خواهید آن را با نام خودتان منتشر کنید.

## به‌روزرسانی

- **هاست اشتراکی:** فایل `chats-update-vX.zip` را روی فایل‌های قبلی باز کنید. این همان بسته‌ی کامل بدون `.htaccess` ریشه است، پس خطوطی مثل تنظیم نسخه‌ی PHP سر جایشان می‌مانند. `api/config.local.php` هیچ‌وقت جزو نسخه‌ها نیست، پس آن هم حفظ می‌شود.
- **Docker:** `docker pull ghcr.io/ultranomen/chats:latest && docker compose up -d` (یا دوباره `docker run` با همان حجم داده).
- جدول‌های جدید پایگاه داده با اولین درخواست بعد از به‌روزرسانی ساخته می‌شوند. برنامه‌ها و API را با هم به‌روز کنید: هر دو برنامه سروری را که پروتکل جدیدتری دارد نمی‌پذیرند و دلیلش را می‌گویند.
