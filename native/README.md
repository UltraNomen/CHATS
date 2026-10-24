# CHATS for Mac, Windows and Android

The regular CHATS chat app in a native window, built with [Tauri](https://tauri.app). It's the same app as the web version (`client/`), so it connects to any CHATS server, keeps all encryption on the device, and looks and behaves the same, in English and Farsi.

What the native apps add:

| | Mac and Windows | Android |
|---|---|---|
| install | `.dmg`, or `.exe` / `.msi` | `.apk` (no Google Play needed) |
| new messages while closed | CHATS keeps running in the menu bar or system tray and shows **native notifications with the decrypted preview** | a background check asks **your own server** how many messages arrived and shows "N new messages" |
| works without Google or Apple push servers | yes | yes, so notifications keep working on domestic-only internet |
| start at login | tray menu → *Start at login* (starts hidden in the tray) | resumes after a reboot if you were signed in |

On Android the background check needs a small permanent notification ("checking for new messages"); Android requires one for anything that runs in the background. It asks the server every minute through `GET api/?r=notify/poll`, which returns only a count and the latest message id. It never sees message contents or keys, and it doesn't make you look online. The server address and the session token are kept in the app's private storage. For reliable checks, set CHATS's battery usage to **Unrestricted** in Android's app settings.

## Download

Every [release](https://github.com/UltraNomen/CHATS/releases) has:

- `chats-desktop-vX-mac.dmg`: Apple Silicon and Intel Macs, macOS 10.15+
- `chats-desktop-vX-windows-setup.exe` or `chats-desktop-vX-windows.msi`: Windows 10 and 11
- `chats-android-vX.apk`: Android 7.0+

The apps aren't signed by Apple or Microsoft, so the first launch shows a warning:

- **Mac:** open the app, then go to **System Settings → Privacy & Security** and click **Open Anyway**. Or run `xattr -dr com.apple.quarantine /Applications/CHATS.app` once.
- **Windows:** SmartScreen says "Windows protected your PC". Click **More info → Run anyway**.
- **Android:** allow installing apps from your browser or file manager when asked. Updates install over the old version as long as they're signed with the same key.

## Build it yourself

You need everything from the main [README](../README.md#development) plus [Rust](https://rustup.rs). For Android you also need JDK 17, the Android SDK and NDK; see [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/).

```bash
npm ci
npm run native:build            # the app for this computer → native/src-tauri/target/release/bundle/
npm run native:android          # Android APK (first run: cd native && npx tauri android init)
npm run dev & npm run native:dev   # development: hot reload inside the native window
```

Branded apps work the same way as the web client: `CHATS_SERVER=chat.example.org npm run native:build` builds an app that only ever connects to that server.

## Layout

```
native/src-tauri/
  src/lib.rs           window, tray menu, start at login, native notifications
  tauri.conf.json      app name, id (io.github.ultranomen.chats), window, bundles; version from ../../package.json
  capabilities/        what the chat app may call
  plugins/watch/       Android background check: Rust commands + Kotlin service (android/src/main/java/…)
  icons/               generated from client/public/icons/icon-512.png (npx tauri icon …)
```

The chat app talks to the native side through `client/src/native.js`, which does nothing in a browser.

## Signing the Android app

Android only installs signed APKs, and updates must be signed with the **same key** as the first install. Create the key once and keep a backup somewhere safe. If you lose it, users have to uninstall and reinstall to update.

```bash
keytool -genkeypair -v -keystore chats-release.keystore -alias chats -keyalg RSA -keysize 4096 -validity 10000
base64 -i chats-release.keystore | gh secret set ANDROID_KEYSTORE
gh secret set ANDROID_KEYSTORE_PASSWORD   # the keystore password
gh secret set ANDROID_KEY_ALIAS --body chats
```

With those three repository secrets set, the [native workflow](../.github/workflows/native.yml) signs the APK and attaches it to each release. Without them it still builds an unsigned APK as a workflow artifact, so you can see that the build works.
