# Running a CHATS server

## Backups

The server makes one backup a day after 03:00 UTC, triggered by normal traffic, so no cron job is needed. You can also run one from **health → backups** and download it there. Backups are gzipped JSONL snapshots of the database in `<data>/backups/`.

Attachments are already encrypted in blob storage and aren't part of the snapshot. Back up `<data>/blobs` (or your bucket) separately. Also keep `<data>/config.json`: it holds the server keys.

## Switching database

Choose another engine under **database** and save. The server copies every row into the new, empty database, then switches over. Sessions, messages and files survive. It refuses a target that already has data. Run a backup first.

Tested both ways: SQLite → MySQL → PostgreSQL and PostgreSQL → MySQL → SQLite.

## Switching storage

Choose another backend under **storage** and save. Every file records which storage location it was written to, so files already stored keep working from their old folder or bucket, and new uploads go to the new one. The *test storage* button checks write, read and delete access before you switch. CHATS doesn't create buckets.

## Push notifications

VAPID keys are generated at install, so you don't need Apple or Google developer accounts. Notification previews are end-to-end encrypted and decrypted by the service worker on the device. The server only sends to the browsers' own push services (Google, Mozilla, Apple, Microsoft), on port 443, to public addresses. To allow another push service, set `CHATS_PUSH_HOSTS`.

## Two-factor authentication

- **Users:** *two-factor → users* is `off`, `optional` or `required`. Backup codes, emailed codes (needs SMTP) and "trust this device for 7/30 days" are separate switches.
- **Admins:** `optional` (the default) or `required`. When optional, staff without an authenticator sign in to the console with their password, and the audit log records it as "admin login (password only)". You can only switch to `required` once you have an authenticator yourself. It then ends console sessions of staff without one and holds their app sessions until they enroll.
- **Lost admin authenticator:** use a backup code. If those are gone too, run `UPDATE users SET totp_on = 0 WHERE username = 'root'` (with your owner's username) on the database. The next console sign-in then asks you to enroll a new authenticator if admin 2FA is required, or signs you in with your password if it's optional.

## Server key

Every server has a key fingerprint, shown under **health → server key**. The chat app and the console remember it for each server and warn if it changes. That happens legitimately only when you reinstall. Anything else means someone may be impersonating your server.

## Versions

A release has one version for everything (`v2.6.0`). `/api/?r=info` reports it as `version`, together with a **protocol** number that changes only when the API changes incompatibly. The apps refuse a server whose protocol is newer than theirs and ask users to update, instead of failing in confusing ways. Update the API and the apps together.

**health → updates** checks GitHub for a newer release.

## Maintenance mode

**server settings → maintenance mode** shows a maintenance screen in the chat app with your message. Owners and admins can still use everything.
