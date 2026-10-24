# پیکربندی‌های Docker Compose

[English](README.md) · **فارسی**

| فایل | چه چیزی راه می‌اندازد |
|---|---|
| `compose.yml` | CHATS با SQLite؛ ساده‌ترین حالت |
| `compose.postgres.yml` | CHATS + PostgreSQL 16 |
| `compose.mysql.yml` | CHATS + MySQL 8.4 |
| `compose.s3.yml` | افزونه: فایل‌های رمزنگاری‌شده به‌جای حجم داده‌ی CHATS در SeaweedFS (سازگار با S3) ذخیره می‌شوند |

```bash
cp .env.example .env     # CHATS_SETUP_TOKEN، CHATS_DOMAIN، CHATS_DB_PASS (و برای افزونه‌ی S3، CHATS_S3_SECRET) را تنظیم کنید
docker compose up -d                                          # SQLite
docker compose -f compose.postgres.yml up -d                  # PostgreSQL
docker compose -f compose.mysql.yml -f compose.s3.yml up -d   # MySQL + فضای ذخیره‌سازی S3
```

سپس `https://<CHATS_DOMAIN>/admin/?setup=<CHATS_SETUP_TOKEN>` را باز کنید. راه‌انداز با پایگاه داده و فضای ذخیره‌سازی از پیش پر شده است و رمزهای آن‌ها روی سرور می‌ماند.

اگر `CHATS_DOMAIN` یک دامنه‌ی واقعی باشد که به همین سرور اشاره می‌کند، Caddy گواهی HTTPS را خودکار می‌گیرد (پورت‌های ۸۰ و ۴۴۳ باید در دسترس باشند). با `:80` همه‌چیز با HTTP ساده اجرا می‌شود؛ برای localhost یا پشت پراکسی خودتان.

همه‌ی این پیکربندی‌ها ایمیج منتشرشده‌ی `ghcr.io/ultranomen/chats` را اجرا می‌کنند. برای اجرای نسخه‌ای که خودتان از کد ساخته‌اید: در ریشه‌ی مخزن `npm run build` را بزنید و بعد `--build` را اضافه کنید.

جزئیات بیشتر در [راهنمای نصب](../../docs/deploy.fa.md#docker).
