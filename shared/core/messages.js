// Authenticated peer plaintext is still untrusted structured input, including old device caches.
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = (x, max) => typeof x === 'string' && x.length <= max;
const uid = x => typeof x === 'string' && /^u_[a-f0-9]{16}$/.test(x);
const invalid = () => ({ t: 'text', text: '[invalid message]', invalid: true });

/** Raster images the app shows inline. Never SVG or HTML: a blob URL runs with this page's origin if opened in a tab. */
export const RASTER = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'];

/** The type a decrypted file's blob gets. The sender picks `m`, so anything outside RASTER is served as opaque bytes. */
export const safeMime = m => RASTER.includes(String(m || '').toLowerCase()) ? String(m).toLowerCase() : 'application/octet-stream';

/** Type for image bytes from the server (avatars), from their magic numbers; never left empty, which browsers would sniff. */
export function sniffRaster(u8) {
  const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8 || []);
  const at = (o, ...v) => v.every((x, i) => b[o + i] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return 'application/octet-stream';
}

export function normalizeBody(b) {
  if (!record(b)) return invalid();
  const out = { t: b.t };
  if (b.t === 'text') {
    if (!text(b.text, 64000)) return invalid();
    out.text = b.text;
    if (b.undecryptable === true) out.undecryptable = true;
  } else if (b.t === 'contact') {
    if (!uid(b.u)) return invalid();
    out.u = b.u;
  } else if (b.t === 'file' || b.t === 'image') {
    const f = b.f;
    if (!record(f) || typeof f.id !== 'string' || !/^b_[a-f0-9]{24}$/.test(f.id)
      || typeof f.k !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(f.k)
      || !text(f.n, 1024) || !Number.isSafeInteger(f.s) || f.s < 0
      || (f.m !== undefined && !text(f.m, 255))) return invalid();
    out.f = { id: f.id, k: f.k, n: f.n, s: f.s, m: f.m || '' };
    // Only raster images render as photos; an "image" of any other type is just a file to download.
    if (b.t === 'image' && !RASTER.includes(out.f.m.toLowerCase())) out.t = 'file';
    for (const k of ['w', 'h']) {
      if (f[k] !== undefined) {
        if (!Number.isSafeInteger(f[k]) || f[k] < 1 || f[k] > 100000) return invalid();
        out.f[k] = f[k];
      }
    }
    if (f.px !== undefined) {
      if (typeof f.px !== 'string' || !/^[A-Za-z0-9+/]{256}$/.test(f.px)) return invalid();
      out.f.px = f.px;
    }
  } else return invalid();
  for (const k of ['cap', 'fw']) {
    if (b[k] !== undefined) {
      if (!text(b[k], 64000)) return invalid();
      out[k] = b[k];
    }
  }
  if (b.r !== undefined && b.r !== null) {
    if (!record(b.r) || !Number.isSafeInteger(b.r.id) || !text(b.r.x, 4000)
      || (b.r.from !== undefined && !uid(b.r.from))) return invalid();
    out.r = { id: b.r.id, x: b.r.x, ...(b.r.from === undefined ? {} : { from: b.r.from }) };
  }
  if (b.mn !== undefined) {
    if (!Array.isArray(b.mn) || b.mn.length > 1000 || !b.mn.every(uid)) return invalid();
    out.mn = [...b.mn];
  }
  return out;
}

export function normalizeMessage(m) {
  return m && m.kind === 'msg' ? { ...m, body: normalizeBody(m.body) } : m;
}

export function chatMeta(meta) {
  if (!record(meta)) throw new Error('invalid chat metadata');
  const out = {};
  for (const k of ['name', 'desc', 'inv']) {
    if (meta[k] !== undefined && !text(meta[k], k === 'inv' ? 128 : 4000)) throw new Error('invalid chat metadata');
    out[k] = meta[k] || '';
  }
  return out;
}

export function normalizeCache(c) {
  // Pre-fix caches may contain structural fields overwritten by decrypted group metadata.
  if (!record(c) || c.schema !== 1) return { chats: {}, msgs: {}, dropped: true };
  const chats = {}, msgs = {};
  let dropped = false;
  for (const [id, chat] of Object.entries(c.chats || {})) {
    if (!record(chat) || !['direct', 'group'].includes(chat.type) || !Array.isArray(chat.members)
      || !chat.members.every(m => record(m) && uid(m.id))) { dropped = true; continue; }
    chats[id] = { ...chat, ...chatMeta(chat), last: normalizeMessage(chat.last) };
  }
  for (const [id, list] of Object.entries(c.msgs || {})) {
    if (Array.isArray(list)) msgs[id] = list.filter(record).map(normalizeMessage);
  }
  return { chats, msgs, dropped };
}
