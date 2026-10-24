# Architecture

How CHATS is put together: the parts, how they talk, where the encryption happens, and how the code turns into releases. The diagrams are [Mermaid](https://mermaid.js.org), which GitHub draws in place.

- [System overview](#system-overview)
- [Repository and build](#repository-and-build)
- [Encryption and keys](#encryption-and-keys)
- [Signing in](#signing-in)
- [Sending and syncing a message](#sending-and-syncing-a-message)
- [Data model](#data-model)
- [Deployment layouts](#deployment-layouts)
- [Design decisions](#design-decisions)

## System overview

```mermaid
flowchart TB
  subgraph devices["People's devices"]
    direction LR
    APP["Chat app (PWA)<br/>index.html"]
    SW["Service worker<br/>sw.js"]
    CON["Admin console<br/>one HTML file"]
  end
  API["PHP API<br/>api/index.php"]
  subgraph store["Stored on your server"]
    direction LR
    DB[("Database<br/>SQLite · MySQL · PostgreSQL")]
    BLOB[("Encrypted files<br/>local disk · S3")]
    DATA[("Data folder<br/>config.json · server keys · backups")]
  end
  PUSH["Browser push services<br/>Google · Apple · Mozilla · Microsoft"]

  APP -- "HTTPS + JSON, bearer token, ciphertext only" --> API
  CON -- "HTTPS + JSON, admin session" --> API
  API --> DB
  API --> BLOB
  API --> DATA
  API -- "encrypted push (VAPID)" --> PUSH
  PUSH -. "wakes" .-> SW
```

- **Chat app:** a Preact PWA that builds into one `index.html`, plus `sw.js`, the manifest, icons and the Farsi font. All encryption and decryption happens here.
- **Service worker:** caches the app for offline start-up, handles the share target, and decrypts push previews on the device.
- **Admin console:** a Preact app built into a single self-contained HTML file. It talks to the same API through `admin/*` routes, with separate, short-lived admin sessions.
- **PHP API:** one front controller (`api/index.php?r=route`) with plain PHP 8.1+ libraries and no framework. It stores what the apps send without being able to read it.
- **Push services:** only used to wake a device. The payload is encrypted for the device (RFC 8291), so those services can't read it either.

## Repository and build

```mermaid
flowchart LR
  subgraph src["Repository"]
    SH["shared/<br/>crypto · API client · i18n · design system"]
    CL["client/"]
    AD["admin/"]
    PHP["api/php/"]
  end
  SH --> CL
  SH --> AD
  CL -- "vite --mode client" --> BC["build/client"]
  CL -- "vite --mode sw" --> BS["build/sw"]
  AD -- "vite --mode admin" --> BA["build/admin"]
  BC & BS & BA & PHP --> BUILD["scripts/build.mjs<br/>CSP hashes · inline icons · bundles"]
  BUILD --> F["dist/full"]
  BUILD --> C["dist/client"]
  BUILD --> A["dist/admin"]
  BUILD --> P["dist/api-php"]
  F & C & A & P --> REL["scripts/release.mjs<br/>zips + SHA256SUMS"]
  F --> IMG["Docker image<br/>Caddy + PHP-FPM"]
  REL --> GH["GitHub release"]
  IMG --> GHCR["ghcr.io/ultranomen/chats"]
```

- `shared/` is imported as `#shared/...` (the `imports` field in `package.json`), which works the same in Vite and in Node tests.
- `vite-plugin-singlefile` inlines all code, styles and most fonts. `scripts/build.mjs` then pins a Content-Security-Policy to the hash of each page's inline script.
- Pushing a `vX.Y.Z` tag runs [`release.yml`](../.github/workflows/release.yml): it builds every bundle, publishes the GitHub release and pushes the multi-architecture image. [`ci.yml`](../.github/workflows/ci.yml) runs the conformance and security suites against SQLite, MySQL and PostgreSQL on every push.

## Encryption and keys

```mermaid
flowchart TD
  PW["Password"] -- "Argon2id + salt" --> PWK["encKey + authKey"]
  RP["8-word recovery phrase"] -- "Argon2id + salt" --> RCK["encKey + authKey"]
  PWK -- "authKey → SHA-256" --> AH["auth_hash<br/>(server)"]
  PWK -- "encKey unwraps" --> MK["Account key (MK)"]
  RCK -- "encKey unwraps" --> MK
  MK -- "AES-256-GCM" --> VAULT["Vault (server, encrypted)<br/>identity key · contacts · pins · phrase"]
  VAULT --> SK["Identity key pair<br/>X25519"]
  SK -- "opens its sealed box" --> CK["Chat key<br/>random per chat"]
  CK -- "AES-256-GCM, AAD = chat id" --> MSG["Messages · group name"]
  MSG -- "carries" --> FK["File key<br/>random per file"]
  FK -- "AES-256-GCM" --> FILE["Encrypted file<br/>(blob storage)"]
  DEV["Device key<br/>non-extractable, IndexedDB"] -. "keeps MK between visits" .-> MK
```

- **Passwords never leave the device.** Argon2id produces two keys. `encKey` unwraps the account key, and the server keeps only a SHA-256 of `authKey` to check sign-ins. The Argon2 parameters are stored inside each salt, so accounts survive a change of defaults.
- **Recovery phrase:** a second, independent way to unwrap the same account key, with its own salt.
- **Chat keys** are random. Each member gets a copy sealed to their X25519 public key (ephemeral X25519 + HKDF-SHA256 + AES-256-GCM), stored as `members.key_box`.
- **Messages** are AES-256-GCM with the chat id as associated data, so ciphertext can't be moved between chats. After decrypting, the app validates every message as untrusted input (`shared/core/messages.js`).
- **Files** each get their own key, which travels inside the encrypted message. Only raster images keep their type after decryption; everything else becomes an opaque download.
- **Invite links** carry a token in the URL fragment, which never reaches the server; HKDF of the token unwraps the chat key.

## Signing in

```mermaid
sequenceDiagram
  autonumber
  participant U as Chat app
  participant S as PHP API
  U->>S: auth/prelogin {username}
  S-->>U: salt (with Argon2 parameters)
  U->>U: Argon2id(password, salt) → encKey + authKey
  U->>S: auth/login {username, authKey}
  S->>S: compare SHA-256(authKey) with auth_hash
  alt two-factor needed
    S-->>U: need2fa + short-lived signed ticket
    U->>S: auth/2fa {ticket, code}
  end
  S-->>U: session token + wrapped account key + encrypted vault
  U->>U: unwrap account key, decrypt vault (identity key, contacts)
  U->>U: seal the session on this device (IndexedDB)
```

Unknown usernames get a deterministic fake salt, so the response doesn't reveal which accounts exist. Admin sign-ins create separate `admin` sessions with a 30-minute idle timeout.

## Sending and syncing a message

```mermaid
sequenceDiagram
  participant A as Sender's app
  participant S as PHP API
  participant D as Database
  participant P as Push service
  participant B as Recipient's app
  A->>A: encrypt body with chat key
  A->>S: msg/send {chat, client id, ciphertext}
  S->>D: insert message with the next global seq
  S-->>A: message id + seq
  S-)P: after the response: encrypted push per device
  P-)B: service worker shows a notification
  loop every 2.5 s while visible (15 s in the background)
    B->>S: sync {since: cursor}
    S->>D: everything with seq > cursor
    S-->>B: messages · chats · people · new cursor
  end
  B->>B: decrypt, validate, show
```

- **One global counter:** every change (a message, an edit, a membership change, a profile update) gets the next `seq`, so a client asks for "everything since my cursor" and never misses or double-counts anything. Sync is plain HTTPS polling, which works on any PHP host, including shared hosting that can't hold connections open.
- **Duplicate sends are dropped:** the client id makes retries safe, so a message sent twice on a flaky connection is stored once.
- **Push is optional:** it runs after the response has been sent. When no push service is reachable (for example on domestic-only internet), the server pauses push for 10 minutes so sending stays fast.

## Data model

```mermaid
erDiagram
  users ||--o{ sessions : "signs in with"
  users ||--o{ members : "is"
  chats ||--o{ members : "has"
  chats ||--o{ messages : "contains"
  users ||--o{ messages : "sends"
  messages ||--o{ blob_refs : "attaches"
  blobs ||--o{ blob_refs : "is used by"
  users ||--o{ blobs : "owns"
  users ||--o{ push_subs : "gets push on"
  messages ||--o{ reports : "is reported in"

  users {
    string id PK
    string username
    string pub_key "X25519 public key"
    string pw_wrap "account key, wrapped"
    string auth_hash "SHA-256 of authKey"
    string vault "encrypted"
    string role "owner, admin, moderator, user"
  }
  chats {
    string id PK
    string type "direct or group"
    string meta "encrypted name and description"
  }
  members {
    string chat_id FK
    string user_id FK
    string key_box "chat key sealed to this member"
    int read_seq
  }
  messages {
    int id PK
    string chat_id FK
    string sender_id FK
    string ct "ciphertext"
    int seq "global change counter"
  }
  blobs {
    string id PK
    string owner_id FK
    int size
    string backend "which storage location"
  }
```

The schema is defined once in `api/php/lib/db.php` and created the same way on SQLite, MySQL and PostgreSQL. That's also what lets the console copy a running server from one database to another. Smaller tables include `invites`, `announcements`, `audit`, `typing`, `stats`, `logs`, `attempts` (rate limits) and `kv`.

## Deployment layouts

```mermaid
flowchart TB
  subgraph docker["Docker Compose"]
    direction LR
    D1["chats image<br/>Caddy + PHP-FPM"] --> D2[("PostgreSQL / MySQL")]
    D1 --> D3[("SeaweedFS (S3)")]
  end
  subgraph split["Split: separate hosts"]
    direction LR
    S1["app.example.org<br/>chat app"] -- "server address,<br/>or ?invite=…&server=…" --> S3["api.example.org<br/>PHP API"]
    S2["console anywhere<br/>even a local file"] -- "server address + key check" --> S3
  end
  subgraph full["Full bundle: one host"]
    direction LR
    F1["/ chat app"] --- F2["/admin/ console"] --- F3["/api/ PHP"]
  end
```

- **Full bundle:** both apps find the API next to them, so nobody types a server address.
- **Split:** the chat app asks for the server once. The server's *chat app address* setting makes invite links open the app and name the server. Branded builds (`CHATS_SERVER=…`) skip the question entirely.
- **Docker:** Caddy gets HTTPS certificates automatically, and `CHATS_DB_*` / `CHATS_S3_*` variables pre-fill the setup wizard without sending secrets to the browser.

## Design decisions

| decision | why |
|---|---|
| Plain PHP 8.1+, no framework or Composer | runs on cheap shared hosting and is small enough to audit |
| Polling with a global `seq` cursor | works everywhere PHP runs; no long-lived connections needed |
| All crypto in the browser (WebCrypto, Argon2 in WebAssembly) | the server stays a store of ciphertext it can't read |
| Each app builds into one HTML file | easy to host anywhere, to verify, and to keep offline |
| A protocol number in `/info` | apps refuse servers that need a newer app, instead of failing in strange ways |
| One version for API and apps | a release is one tag, one changelog entry, one set of assets |
| Fonts and assets bundled, nothing from third-party CDNs | works on domestic-only internet and keeps the CSP strict |

More: [deployment](deploy.md) · [operations](operations.md) · [security model](../SECURITY.md) · [testing](testing.md)
