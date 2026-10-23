// Byte helpers shared by the app, the admin console and the service worker.
export const te = new TextEncoder();
export const td = new TextDecoder();

export function b64(bytes) {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(s) {
  const bin = atob(String(s || '').replace(/-/g, '+').replace(/_/g, '/'));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const rand = n => crypto.getRandomValues(new Uint8Array(n));

export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
