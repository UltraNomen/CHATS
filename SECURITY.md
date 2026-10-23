# Security

## Reporting a vulnerability

Please **don't open a public issue**. Use GitHub's private reporting instead: [Security → Report a vulnerability](https://github.com/UltraNomen/CHATS/security/advisories/new). Include the version (`/api/?r=info` shows it), what an attacker needs, and the steps to reproduce. You'll get a reply within a week. Fixes ship as a patch release with a note in the [changelog](CHANGELOG.md).

Only the latest release gets security fixes.

## What the server can and can't see

Everything below is encrypted on the device before it leaves:

| data | protection |
|---|---|
| password | never sent. Argon2id on the device derives a key that unwraps the account key, plus an auth value; the server stores only `sha256(auth)` |
| recovery phrase (8 words, 88 bits) | never sent. Same scheme with its own salt, as a second way to unwrap the account key |
| account key, identity key, contacts, pins, phrase | stored as a vault encrypted with AES-256-GCM under the account key |
| chat keys | random per chat, sealed to each member's X25519 key (ephemeral X25519 + HKDF-SHA256 + AES-256-GCM) |
| messages, group names, file names and metadata | AES-256-GCM under the chat key, with the chat id as associated data |
| files | AES-256-GCM, one key per file, carried inside the encrypted message |
| push previews | encrypted for the device; the service worker decrypts them |

The server **does** see metadata: usernames, who is in which chat, when messages are sent and how big they are, IP addresses and device names of sessions, and avatars (stored unencrypted so others can show them). Admins can read reported messages only because the reporter decrypts them and sends them along.

## Hardening built in

- **Sign-in:**
  - Logins, codes and recovery are throttled per account and per IP address.
  - Password resets are single-use, tied to the current credentials, and consumed atomically; a reset never skips two-factor.
  - "Remember this device" tokens stop working when the password or authenticator changes.
  - Changing the recovery phrase needs the current password.
- **Staff:**
  - Replacing or removing an authenticator, or making new backup codes, needs a current code.
  - The console has a 30-minute idle timeout and an optional IP allow-list, and all actions are logged in the audit log.
  - Requiring admin 2FA is refused until you have it yourself.
- **Files:**
  - Decrypted files keep their type only if it's a raster image, so a file from someone else can never open as a page on the app's origin.
  - Downloads are served with `nosniff` and a sandboxing CSP.
- **Pages:**
  - Both apps ship a Content-Security-Policy that allows only their own hashed inline bundle (plus `wasm-unsafe-eval` for Argon2).
  - Decrypted messages and cached copies are validated as untrusted input.
- **Push:** only browser push services (Google, Mozilla, Apple, Microsoft), on port 443, to public addresses. The DNS answer is pinned for the connection, with no redirects and no proxy.
- **Server identity:** both apps remember each server's key fingerprint and warn before signing in if it changes. The console then always asks for the password again.
- **Setup:**
  - `CHATS_SETUP_TOKEN` locks the first-run wizard.
  - After install, `setup/status` reveals nothing about the host.
  - Database passwords and S3 secrets given by the environment never reach the browser.
- **Errors:** the API never prints PHP errors into responses; they go to the server log.

## Running it safely

- Serve over HTTPS.
- Keep the data folder (`CHATS_DATA`) outside the web root. It holds the database, the server keys and `config.json`.
- Set `CHATS_SETUP_TOKEN` before you upload or start a fresh install, so nobody else can claim it.
- Consider making admin two-factor `required` and adding your IP addresses to the console's allow-list.
- Keep the API and the apps on the same release.
