// The Mac, Windows and Android apps (native/, built with Tauri) wrap this same chat app and add a few native
// functions. In a browser none of this exists and every helper is a no-op.
const T = typeof window !== 'undefined' ? window.__TAURI__ : null;

export const NATIVE = !!(T && T.core);
export const ANDROID = NATIVE && /Android/i.test(navigator.userAgent);
export const DESKTOP = NATIVE && !ANDROID;

const call = (cmd, args) => (NATIVE ? T.core.invoke(cmd, args) : Promise.resolve(null));

/** A system notification (desktop). The text is already decrypted here, on the device. */
export const nativeNotify = (title, body) => call('notify', { title, body }).catch(() => {});

/** Notification permission where the system asks for it; true when notifications can be shown. */
export const nativePermission = () => call('notify_permission').then(ok => ok !== false).catch(() => false);

/**
 * Android: while the app is in the background, a service asks this server how many new messages arrived and
 * shows a count (no contents). `text` holds the translated notification strings.
 */
export const watchStart = (base, token, text) => call('plugin:chats-watch|start', { payload: { base, token, ...text } }).catch(() => {});
export const watchForeground = on => call('plugin:chats-watch|foreground', { payload: { on } }).catch(() => {});
export const watchStop = () => call('plugin:chats-watch|stop').catch(() => {});
