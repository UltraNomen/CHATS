// HTTP client for the CHATS server API (bearer tokens, JSON, progress for uploads and downloads).
export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** "chat.example.org" or "https://host/path" → API base URL. Plain http is only accepted when typed or for localhost. */
/** The scheme a bare address gets: plain http only for loopback hosts. */
/** Wire protocol this build speaks. Bump only for breaking API changes; servers report theirs in /info as `protocol`. */
export const PROTOCOL = 1;

/** Why this app can't talk to a server, or '' when it can. Servers from before protocol numbers count as 1. */
export function protocolProblem(info) {
  const p = Number((info && info.protocol) || 1);
  if (p > PROTOCOL) return 'this server needs a newer CHATS app · update the app';
  if (p < PROTOCOL) return 'this server runs an older CHATS version · ask its admin to update it';
  return '';
}

export const schemeFor = s => /^https?:\/\//i.test(s) ? '' : /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|[^/]+\.localhost)(:\d+)?(\/|$)/i.test(s) ? 'http://' : 'https://';

export function apiBase(input) {
  let s = String(input || '').trim();
  if (!s) return '';
  s = schemeFor(s) + s;
  const u = new URL(s);
  let path = u.pathname.replace(/\/+$/, '');
  if (!/\/api$/.test(path)) path += '/api';
  return u.origin + path + '/';
}

export const hostOf = base => { try { const u = new URL(base); return (u.host + u.pathname.replace(/\/api\/?$/, '')).replace(/\/$/, ''); } catch { return ''; } };

export class Api {
  constructor(base, token = '') {
    this.base = base;
    this.token = token;
    this.onAuthError = null;
    this.lastLatency = 0;
  }

  url(route, query) {
    const q = new URLSearchParams({ r: route, ...(query || {}) });
    return this.base + '?' + q.toString();
  }

  headers(json = true) {
    const h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (this.token) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  async handle(res) {
    let j = null;
    try { j = await res.json(); } catch { /* not json */ }
    if (!res.ok || !j || j.ok === false) {
      const err = new ApiError(res.status, (j && j.code) || 'http_' + res.status, (j && j.error) || 'server error ' + res.status, j || {});
      if (this.onAuthError && ['session_revoked', 'session_expired', 'no_session', 'account_disabled', 'maintenance', 'mfa_enroll_required', 'account_pending'].includes(err.code)) this.onAuthError(err);
      throw err;
    }
    return j;
  }

  async request(method, route, body, query) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(this.url(route, query), { method, headers: this.headers(method !== 'GET'), body: method === 'GET' ? undefined : JSON.stringify(body || {}), cache: 'no-store' });
    } catch (e) {
      throw new ApiError(0, 'offline', 'could not reach the server');
    }
    this.lastLatency = Math.round(performance.now() - t0);
    return this.handle(res);
  }

  get(route, query) { return this.request('GET', route, null, query); }
  post(route, body) { return this.request('POST', route, body); }

  /** Multipart upload with progress (0..1). `ctl.abort()` cancels it (rejects with code 'aborted'). */
  upload(route, fields, onProgress, ctl) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.url(route));
      if (this.token) xhr.setRequestHeader('Authorization', 'Bearer ' + this.token);
      xhr.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      xhr.onerror = () => reject(new ApiError(0, 'offline', 'could not reach the server'));
      xhr.onabort = () => reject(new ApiError(0, 'aborted', 'upload cancelled'));
      if (ctl) ctl.abort = () => xhr.abort();
      xhr.onload = () => {
        let j = null;
        try { j = JSON.parse(xhr.responseText); } catch { /* not json */ }
        if (xhr.status >= 200 && xhr.status < 300 && j && j.ok) resolve(j);
        else reject(new ApiError(xhr.status, (j && j.code) || 'http_' + xhr.status, (j && j.error) || 'upload failed', j || {}));
      };
      xhr.send(fd);
    });
  }

  /** Binary download with progress (0..1). */
  async download(route, query, onProgress) {
    let res;
    try { res = await fetch(this.url(route, query), { headers: this.headers(false) }); } catch { throw new ApiError(0, 'offline', 'could not reach the server'); }
    if (!res.ok) return this.handle(res);
    const total = +res.headers.get('Content-Length') || 0;
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress && onProgress(Math.min(1, got / total));
    }
    const out = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}
