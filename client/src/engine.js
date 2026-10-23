// Client engine: account, sync loop, decryption and every server action. The UI subscribes to it.
import { Api, ApiError, apiBase, hostOf, protocolProblem } from '#shared/core/api.js';
import * as C from '#shared/core/crypto.js';
import { b64, unb64 } from '#shared/core/bytes.js';
import { idbGet, idbSet, idbDel } from '#shared/core/idb.js';
import { normalizeBody, normalizeCache, chatMeta, safeMime, sniffRaster, RASTER } from '#shared/core/messages.js';

export { VERSION as CUR_VER } from '#shared/core/build.js';

export const LS = {
  get(k, d) { try { const v = localStorage.getItem('chats.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('chats.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('chats.' + k); } catch { /* ignore */ } },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cid = () => b64(C.newKey().slice(0, 12)).replace(/[+/=]/g, '');

export class Engine {
  constructor() {
    this.s = {
      server: LS.get('server', null), recent: LS.get('recent', []), conn: 'connecting', latency: 0,
      me: null, chats: {}, msgs: {}, complete: {}, people: {}, presence: {}, config: null,
      announcements: [], status: null, files: {}, synced: false, mfaRequired: false, vault: null, typing: {},
    };
    this.uploads = {};
    this.typingSent = {};
    this.keys = null;
    this.vaultVer = 0;
    this.cursor = 0;
    this.chatKeys = {};
    this.boxes = {};
    this.api = this.s.server ? new Api(this.s.server.base) : null;
    this.subs = new Set();
    this.pending = null;
    this.loopT = null;
    this.visible = typeof document === 'undefined' || !document.hidden;
    this.avatars = {};
    this.lastAnn = LS.get('annSeen', 0);
    this.onNewMessage = null;
  }

  // ---------------------------------------------------------------- plumbing

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }

  emit() {
    if (this.emitQ) return;
    this.emitQ = true;
    queueMicrotask(() => { this.emitQ = false; this.subs.forEach(f => f(this.s)); });
  }

  set(patch) { Object.assign(this.s, patch); this.emit(); }

  wireApi(base, token = '') {
    this.api = new Api(base, token);
    this.api.onAuthError = e => this.authError(e);
  }

  authError(e) {
    const st = {
      maintenance: { kind: 'maintenance', msg: e.message, since: e.extra.since },
      account_disabled: { kind: 'disabled', since: e.extra.since, reason: e.extra.reason },
      session_revoked: { kind: 'signedOut', by: e.extra.by, at: e.extra.at },
      session_expired: { kind: 'signedOut', by: 'expired' },
      no_session: { kind: 'signedOut', by: 'gone' },
      account_pending: { kind: 'pending' },
      mfa_enroll_required: { kind: 'mfa' },
    }[e.code];
    if (!st || !this.s.me) return;
    if (st.kind === 'disabled' || st.kind === 'signedOut') this.wipeLocal();
    if (st.kind === 'mfa') { this.set({ mfaRequired: true }); return; }
    this.set({ status: st });
  }

  me() { return this.s.me; }

  // ---------------------------------------------------------------- servers

  async probe(input) {
    let base;
    try { base = apiBase(input); } catch { throw new ApiError(0, 'bad_address', 'not a valid address · try chat.example.org'); }
    const host = hostOf(base);
    if (!host.includes('.') && !/^localhost|^127\.|:\d+$/.test(host)) throw new ApiError(0, 'bad_address', 'not a valid address · try chat.example.org');
    const api = new Api(base);
    let r;
    try { r = await api.get('info'); } catch (e) {
      throw new ApiError(0, 'unreachable', e.code === 'offline' ? 'could not reach ' + host + ' · check the address' : host + " doesn't look like a CHATS server");
    }
    if (!r.server || !r.server.version) throw new ApiError(0, 'not_chats', host + " doesn't look like a CHATS server");
    const pp = protocolProblem(r.server);
    if (pp) throw new ApiError(0, 'protocol', pp);
    if (!r.server.installed) throw new ApiError(0, 'not_installed', host + ' is not set up yet · its admin has to finish setup at /admin');
    const pinned = LS.get('fp:' + host, null);
    return { base, host, info: r.server, latency: api.lastLatency, fpChanged: !!pinned && pinned !== r.server.fingerprint };
  }

  useServer(found) {
    const server = { base: found.base, host: found.host, info: found.info };
    LS.set('server', server);
    LS.set('fp:' + found.host, found.info.fingerprint);
    const recent = [found.host, ...this.s.recent.filter(h => h !== found.host)].slice(0, 4);
    LS.set('recent', recent);
    this.wireApi(found.base);
    this.set({ server, recent, conn: 'connected', latency: found.latency });
  }

  async refreshInfo() {
    if (!this.api) return;
    try {
      const r = await this.api.get('info');
      const server = { ...this.s.server, info: r.server };
      LS.set('server', server);
      this.set({ server, conn: 'connected', latency: this.api.lastLatency });
    } catch { this.set({ conn: 'offline' }); }
  }

  kdf() { return (this.s.server && this.s.server.info.kdf) || { m: 65536, t: 3, p: 1 }; }

  // ---------------------------------------------------------------- account lifecycle

  async boot() {
    const rec = await idbGet('account');
    if (rec) {
      try {
        const a = await C.deviceOpen(rec);
        if (this.s.server && a.base === this.s.server.base) {
          this.wireApi(a.base, a.token);
          this.keys = { mk: unb64(a.mk), sk: unb64(a.sk) };
          this.vaultVer = a.vaultVer || 0;
          this.pw = { salt: a.pwSalt, wrap: a.pwWrap };
          this.set({ me: a.me, vault: a.vault || null });
          await this.loadCache();
          this.startLoop();
          return 'app';
        }
      } catch { /* device key changed or record corrupt: sign in again */ }
      await idbDel('account');
    }
    return this.s.server ? 'welcome' : 'server';
  }

  async checkUsername(u) { return this.api.post('auth/check', { u }); }

  /** Creates the account on the device and registers it. Returns the 8 recovery words. */
  async signup({ username, password, name, email, phone, invite, avatar }) {
    const acct = await C.createAccount(password, this.kdf());
    const r = await this.api.post('auth/signup', { username, name, email, phone, invite, device: deviceName(), ...acct.payload });
    if (r.pending) {
      this.set({ status: { kind: 'pending', username } });
      return { phrase: acct.phrase, pending: true };
    }
    this.vaultVer = 1;
    await this.establish(r, acct.mk, acct.vault, acct.payload);
    if (avatar) { try { await this.uploadAvatar(avatar); } catch { /* optional */ } }
    return { phrase: acct.phrase };
  }

  async login(method, id, password) {
    const pre = await this.api.post('auth/prelogin', { method, id });
    const d = await C.derivePassword(password, pre.salt);
    const r = await this.api.post('auth/login', { method, id, auth: b64(d.auth), device: deviceName(), trust: LS.get('trust:' + (this.s.server || {}).host + ':' + id, '') });
    if (r.need2fa) { this.pending = { encKey: d.encKey, id }; return { need2fa: true, ticket: r.ticket, methods: r.methods, remember: r.remember }; }
    await this.establish(r, await C.unwrapMk(d.encKey, r.keys.pwWrap));
    return { ok: true };
  }

  async verify2fa(ticket, kind, code, remember) {
    const r = await this.api.post('auth/2fa', { ticket, kind, code, remember, device: deviceName() });
    if (r.trust && this.pending && this.pending.id) LS.set('trust:' + this.s.server.host + ':' + this.pending.id, r.trust);
    await this.establish(r, this.pending.mk || await C.unwrapMk(this.pending.encKey, r.keys.pwWrap));
    this.pending = null;
  }

  sendEmailCode(ticket) { return this.api.post('auth/2fa-email', { ticket }); }

  async establish(r, mk, vault, keys) {
    keys = keys || r.keys;
    vault = vault || await C.decJson(mk, r.keys.vault, 'vault');
    this.keys = { mk, sk: unb64(vault.sk) };
    this.vaultVer = (r.keys && r.keys.vaultVer) || this.vaultVer || 1;
    this.pw = { salt: keys.pwSalt, wrap: keys.pwWrap };
    this.api.token = r.token;
    this.cursor = 0;
    this.chatKeys = {};
    this.set({ me: r.me, vault, chats: {}, msgs: {}, complete: {}, people: {}, status: null, synced: false, mfaRequired: !!r.mfaRequired });
    await this.persistAccount();
    this.startLoop();
  }

  async persistAccount() {
    if (!this.keys || !this.api) return;
    await idbSet('account', await C.deviceSeal({ base: this.api.base, token: this.api.token, mk: b64(this.keys.mk), sk: b64(this.keys.sk), me: this.s.me,
      vault: this.s.vault, vaultVer: this.vaultVer, pwSalt: this.pw.salt, pwWrap: this.pw.wrap }));
  }

  async wipeLocal() {
    clearTimeout(this.loopT);
    this.loopT = null;
    this.keys = null;
    this.cursor = 0;
    await idbDel('account');
    await idbDel('cache');
    await idbDel('pushkeys');
    if ('setAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  }

  async logout() {
    try { await this.unsubscribePush(); } catch { /* best effort */ }
    try { await this.api.post('auth/logout'); } catch { /* offline is fine */ }
    await this.wipeLocal();
    if (this.api) this.api.token = '';
    this.set({ me: null, vault: null, chats: {}, msgs: {}, people: {}, status: null, synced: false, mfaRequired: false });
  }

  // ---- recovery

  async recoverVerify(username, words) {
    const s = await this.api.post('auth/recover-salt', { u: username });
    const d = await C.derivePhrase(words, s.salt);
    const r = await this.api.post('auth/recover', { u: username, rcAuth: b64(d.auth) });
    return { ticket: r.ticket, mk: await C.unwrapMk(d.encKey, r.rcWrap) };
  }

  async resetPassword(rec, password) {
    const w = await C.rewrapPassword(rec.mk, password, this.kdf());
    const r = await this.api.post('auth/reset', { ticket: rec.ticket, device: deviceName(), ...w });
    // An account with an authenticator still has to pass it after a reset.
    if (r.need2fa) { this.pending = { mk: rec.mk }; return { need2fa: true, ticket: r.ticket, methods: r.methods, remember: r.remember }; }
    await this.establish(r, rec.mk, null, { pwSalt: w.pwSalt, pwWrap: w.pwWrap });
    return { ok: true };
  }

  async verifyPassword(password) {
    try {
      const d = await C.derivePassword(password, this.pw.salt);
      await C.unwrapMk(d.encKey, this.pw.wrap);
      return true;
    } catch { return false; }
  }

  /** The server only accepts a new phrase together with proof of the current password. */
  async regenPhrase(password) {
    const words = C.newPhrase();
    const d = await C.derivePassword(password, this.pw.salt);
    await this.api.post('phrase', { ...(await C.rewrapPhrase(this.keys.mk, words)), auth: b64(d.auth) });
    await this.saveVault(v => ({ ...v, phrase: words }));
    return words;
  }

  // ---------------------------------------------------------------- vault (contacts, phrase)

  async saveVault(fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = fn(this.s.vault);
      try {
        const r = await this.api.post('vault', { data: await C.encJson(this.keys.mk, next, 'vault'), ver: this.vaultVer });
        this.vaultVer = r.ver;
        this.set({ vault: next });
        await this.persistAccount();
        return next;
      } catch (e) {
        if (e.code !== 'vault_conflict') throw e;
        this.vaultVer = e.extra.ver;
        this.set({ vault: await C.decJson(this.keys.mk, e.extra.data, 'vault') });
      }
    }
    throw new ApiError(409, 'vault_conflict', 'could not save · try again');
  }

  contacts() { return (this.s.vault && this.s.vault.contacts) || {}; }

  /** Pinned message ids per chat. Kept in the encrypted vault: personal, synced across your devices, never seen by the server. */
  pins(chatId) { const p = (this.s.vault && this.s.vault.pins) || {}; return Array.isArray(p[chatId]) ? p[chatId].filter(Number.isSafeInteger) : []; }

  isPinned(chatId, msgId) { return this.pins(chatId).includes(msgId); }

  async togglePin(chatId, msgId) {
    await this.saveVault(v => {
      const all = { ...((v && v.pins) || {}) };
      const cur = Array.isArray(all[chatId]) ? all[chatId] : [];
      const next = cur.includes(msgId) ? cur.filter(x => x !== msgId) : [...cur, msgId].slice(-50);
      if (next.length) all[chatId] = next; else delete all[chatId];
      return { ...v, pins: all };
    });
  }

  async addContact(uid) {
    if (this.contacts()[uid]) return;
    await this.saveVault(v => ({ ...v, contacts: { ...v.contacts, [uid]: { added: Math.floor(Date.now() / 1000) } } }));
    await this.refreshPhoneShares();
  }

  async editContact(uid, alias, phone) {
    await this.saveVault(v => ({ ...v, contacts: { ...v.contacts, [uid]: { ...(v.contacts[uid] || {}), alias, phone } } }));
  }

  async deleteContact(uid) {
    await this.saveVault(v => { const c = { ...v.contacts }; delete c[uid]; return { ...v, contacts: c }; });
    await this.refreshPhoneShares();
  }

  /** Phone visible to contacts: sealed to each contact's key, so the server can't tell who may read it. */
  async refreshPhoneShares() {
    const me = this.s.me;
    if (!me || me.phoneVis !== 'contacts' || !me.phone) return;
    const ids = Object.keys(this.contacts());
    await this.ensurePeople(ids);
    const shares = [];
    for (const id of ids) { const p = this.s.people[id]; if (p && p.pubKey) shares.push(await C.seal(p.pubKey, new TextEncoder().encode(me.phone))); }
    await this.api.post('profile', { phoneShares: shares });
  }

  // ---------------------------------------------------------------- sync

  startLoop() {
    clearTimeout(this.loopT);
    const tick = async () => {
      await this.pull();
      this.loopT = setTimeout(tick, this.s.conn === 'offline' ? 5000 : this.visible ? 2500 : 15000);
    };
    this.loopT = setTimeout(tick, 0);
  }

  setVisible(v) { this.visible = v; if (v && this.keys) { clearTimeout(this.loopT); this.startLoop(); } }

  reconnect() { this.set({ conn: 'connecting' }); if (this.keys) { clearTimeout(this.loopT); this.startLoop(); } else this.refreshInfo(); }

  goOffline() { clearTimeout(this.loopT); this.loopT = null; this.set({ conn: 'offline' }); }

  watchList() {
    const ids = new Set(Object.keys(this.contacts()));
    for (const c of Object.values(this.s.chats)) for (const m of c.members || []) ids.add(m.id);
    ids.delete(this.s.me && this.s.me.id);
    return [...ids].slice(0, 300);
  }

  async pull() {
    if (!this.keys || this.pulling) return;
    this.pulling = true;
    try {
      for (let i = 0; i < 20; i++) {
        const r = await this.api.post('sync', { since: this.cursor, watch: this.watchList(), vaultVer: this.vaultVer, ann: this.lastAnn });
        await this.apply(r);
        if (!r.more) break;
      }
      const wasDown = this.s.conn !== 'connected';
      this.set({ conn: 'connected', latency: this.api.lastLatency, synced: true, status: this.s.status && this.s.status.kind === 'maintenance' ? null : this.s.status });
      if (wasDown) this.flushOutbox();
    } catch (e) {
      if (e.code === 'offline') this.set({ conn: 'offline' });
      else if (!['maintenance', 'account_disabled', 'session_revoked', 'session_expired', 'no_session', 'account_pending', 'mfa_enroll_required'].includes(e.code)) this.set({ conn: 'connecting' });
    } finally {
      this.pulling = false;
    }
  }

  async apply(r) {
    const me = r.me || this.s.me;
    const people = { ...this.s.people };
    for (const [id, p] of Object.entries(r.people || {})) people[id] = await this.decoratePerson(p);
    const presence = { ...this.s.presence, ...(r.presence || {}) };
    for (const [id, seen] of Object.entries(r.presence || {})) if (people[id]) people[id] = { ...people[id], seen };
    const patch = { people, presence, config: r.config || this.s.config };
    if (r.me) patch.me = r.me;
    if (r.vault) { this.vaultVer = r.vault.ver; patch.vault = await C.decJson(this.keys.mk, r.vault.data, 'vault'); }
    const chats = { ...this.s.chats };
    const msgs = { ...this.s.msgs };
    const fresh = [];
    for (const c of r.chats || []) {
      if (c.status === 'left') { delete chats[c.id]; delete msgs[c.id]; continue; }
      const dc = await this.decryptChat(c, me);
      const prev = chats[c.id];
      if (dc.last && dc.last.from !== me.id && dc.last.kind === 'msg' && this.cursor && (!prev || !prev.last || dc.last.id > prev.last.id)) fresh.push(dc);
      chats[c.id] = dc;
    }
    for (const m of r.messages || []) {
      if (!chats[m.chat]) continue;
      const dm = await this.decryptMsg(m);
      if (msgs[m.chat]) msgs[m.chat] = mergeMsgs(msgs[m.chat], [dm]);
    }
    patch.chats = chats;
    patch.msgs = msgs;
    const typing = {};
    for (const t of r.typing || []) if (chats[t.chat] && t.user !== me.id) (typing[t.chat] = typing[t.chat] || []).push(t.user);
    patch.typing = typing;
    if (r.announcements && r.announcements.length) {
      const dismissed = LS.get('annDismissed', []);
      const anns = [...r.announcements, ...this.s.announcements].filter((a, i, all) => all.findIndex(b => b.id === a.id) === i && !dismissed.includes(a.id));
      patch.announcements = anns;
      for (const a of r.announcements) this.api.post('ann/ack', { id: a.id }).catch(() => {});
      this.lastAnn = Math.max(this.lastAnn, ...r.announcements.map(a => a.id));
      LS.set('annSeen', this.lastAnn);
    }
    this.cursor = r.cursor;
    this.set(patch);
    if (fresh.length && this.onNewMessage) fresh.forEach(c => this.onNewMessage(c));
    const missing = this.watchList().filter(id => !people[id]);
    if (missing.length) this.ensurePeople(missing);
    this.saveCacheSoon();
    if ('setAppBadge' in navigator) {
      const n = Object.values(chats).reduce((a, c) => a + (c.muted ? 0 : c.unread), 0);
      (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
    }
  }

  async decoratePerson(p) {
    const out = { ...p };
    if (!out.phone && out.phoneShares && out.phoneShares.length && this.keys) {
      for (const s of out.phoneShares) {
        try { out.phone = new TextDecoder().decode(await C.unseal(this.keys.sk, s)); break; } catch { /* not for us */ }
      }
    }
    delete out.phoneShares;
    return out;
  }

  async ensurePeople(ids) {
    const need = ids.filter(id => !this.s.people[id]);
    if (!need.length) return;
    try {
      const r = await this.api.post('users/lookup', { ids: need });
      const people = { ...this.s.people };
      for (const [id, p] of Object.entries(r.people)) people[id] = await this.decoratePerson(p);
      this.set({ people });
    } catch { /* retry next sync */ }
  }

  async chatKey(id, box) {
    if (this.chatKeys[id] && this.boxes[id] === box) return this.chatKeys[id];
    const k = await C.unseal(this.keys.sk, box);
    this.chatKeys[id] = k;
    this.boxes[id] = box;
    return k;
  }

  async decryptChat(c, me) {
    const out = { ...c, name: '', desc: '', inv: '', error: false };
    try {
      const key = await this.chatKey(c.id, c.box);
      if (c.type === 'group' && c.meta) Object.assign(out, chatMeta(await C.decJson(key, c.meta, 'meta')));
    } catch { out.error = true; }
    out.last = c.last ? await this.decryptMsg(c.last) : null;
    out.peer = c.type === 'direct' ? (c.members.find(m => m.id !== me.id) || {}).id || me.id : null;
    return out;
  }

  async decryptMsg(m) {
    const out = { ...m, state: 'sent', body: null };
    if (m.kind === 'msg' && m.ct) {
      try { out.body = normalizeBody(await C.decJson(this.chatKeys[m.chat], m.ct, m.chat)); } catch { out.body = { t: 'text', text: '', undecryptable: true }; }
    }
    return out;
  }

  async loadHistory(chatId) {
    const have = this.s.msgs[chatId] || [];
    const oldest = have.find(m => m.id > 0);
    const r = await this.api.get('history', { chat: chatId, before: oldest ? oldest.id : '', limit: 60 });
    const dec = [];
    for (const m of r.messages) dec.push(await this.decryptMsg(m));
    this.set({ msgs: { ...this.s.msgs, [chatId]: mergeMsgs(this.s.msgs[chatId] || [], dec) }, complete: { ...this.s.complete, [chatId]: r.complete } });
  }

  async markRead(chatId) {
    const c = this.s.chats[chatId];
    const list = this.s.msgs[chatId] || [];
    const last = list.filter(m => m.id > 0).pop();
    if (!c || !last || c.readSeq >= last.id) return;
    this.set({ chats: { ...this.s.chats, [chatId]: { ...c, unread: 0, readSeq: last.id } } });
    try { await this.api.post('chat/update', { chat: chatId, read: last.id }); } catch { /* next time */ }
  }

  // ---------------------------------------------------------------- cache (offline start) and push keys

  saveCacheSoon() {
    clearTimeout(this.cacheT);
    this.cacheT = setTimeout(() => this.saveCache(), 1500);
  }

  async saveCache() {
    if (!this.keys) return;
    const chats = {};
    for (const [id, c] of Object.entries(this.s.chats)) chats[id] = { ...c, key: undefined };
    const msgs = {};
    for (const [id, list] of Object.entries(this.s.msgs)) msgs[id] = list.filter(m => m.id > 0).slice(-100);
    try {
      await idbSet('cache', await C.deviceSeal({ schema: 1, cursor: this.cursor, chats, msgs, people: this.s.people, config: this.s.config, keys: Object.fromEntries(Object.entries(this.chatKeys).map(([k, v]) => [k, b64(v)])), boxes: this.boxes }));
      await idbSet('pushkeys', await C.deviceSeal({ base: this.api.base, token: this.api.token, me: this.s.me.id, lock: !!LS.get('lock', {}).enabled,
        chats: Object.fromEntries(Object.entries(this.s.chats).map(([id, c]) => [id, { k: this.chatKeys[id] ? b64(this.chatKeys[id]) : '', t: c.type, n: c.name }])),
        people: Object.fromEntries(Object.entries(this.s.people).map(([id, p]) => [id, (this.contacts()[id] || {}).alias || p.name])) }));
    } catch { /* storage full or unavailable */ }
  }

  async loadCache() {
    const rec = await idbGet('cache');
    if (!rec) return;
    try {
      const c = await C.deviceOpen(rec);
      const safe = normalizeCache(c);
      this.cursor = safe.dropped ? 0 : c.cursor || 0;
      this.chatKeys = Object.fromEntries(Object.entries(c.keys || {}).map(([k, v]) => [k, unb64(v)]));
      this.boxes = c.boxes || {};
      this.set({ chats: safe.chats, msgs: safe.msgs, people: c.people || {}, config: c.config, synced: true });
    } catch { /* ignore stale cache */ }
  }

  // ---------------------------------------------------------------- sending

  outbox() { return this.outboxQ || (this.outboxQ = []); }

  addLocal(chatId, m) {
    this.set({ msgs: { ...this.s.msgs, [chatId]: [...(this.s.msgs[chatId] || []), m] } });
  }

  replaceLocal(chatId, cidv, m) {
    const list = (this.s.msgs[chatId] || []).filter(x => x.cid !== cidv);
    const chats = { ...this.s.chats };
    if (chats[chatId] && m.kind === 'msg') chats[chatId] = { ...chats[chatId], last: m, lastAt: m.at, readSeq: Math.max(chats[chatId].readSeq, m.id) };
    this.set({ msgs: { ...this.s.msgs, [chatId]: mergeMsgs(list, [m]) }, chats });
  }

  setLocalState(chatId, cidv, state, extra = {}) {
    this.set({ msgs: { ...this.s.msgs, [chatId]: (this.s.msgs[chatId] || []).map(x => x.cid === cidv ? { ...x, state, ...extra } : x) } });
  }

  /** Encrypts and posts a message body; keeps a pending copy until the server confirms. */
  async send(chatId, body, opts = {}) {
    const key = this.chatKeys[chatId];
    const c = opts.cid || cid();
    if (opts.cid) this.setLocalState(chatId, c, 'pending', { body, up: undefined });
    else this.addLocal(chatId, { id: -Date.now(), cid: c, chat: chatId, from: this.s.me.id, kind: 'msg', at: Math.floor(Date.now() / 1000), edited: 0, deleted: false, hidden: false, body, state: 'pending', seq: 0 });
    this.typingSent[chatId] = 0;
    const job = { chatId, cid: c, ct: await C.encJson(key, body, chatId), blobs: opts.blobs || [], mentions: body.mn || [] };
    this.outbox().push(job);
    if (this.s.conn === 'offline') { this.setLocalState(chatId, c, 'failed'); return; }
    await this.deliver(job);
  }

  async deliver(job) {
    try {
      const r = await this.api.post('msg/send', { chat: job.chatId, cid: job.cid, ct: job.ct, blobs: job.blobs, mentions: job.mentions });
      this.outboxQ = this.outbox().filter(j => j !== job);
      this.replaceLocal(job.chatId, job.cid, { ...(await this.decryptMsg(r.message)), state: 'sent' });
    } catch (e) {
      if (e.code === 'rate_limited') {
        this.outboxQ = this.outbox().filter(j => j !== job);
        this.set({ msgs: { ...this.s.msgs, [job.chatId]: (this.s.msgs[job.chatId] || []).filter(x => x.cid !== job.cid) } });
        throw e;
      }
      this.setLocalState(job.chatId, job.cid, e.code === 'offline' ? 'failed' : 'failed', { error: e.message });
      if (e.code !== 'offline') { this.outboxQ = this.outbox().filter(j => j !== job); throw e; }
    }
  }

  async retry(chatId, cidv) {
    const job = this.outbox().find(j => j.cid === cidv);
    if (!job) return;
    this.setLocalState(chatId, cidv, 'pending');
    await this.deliver(job).catch(() => {});
  }

  flushOutbox() {
    for (const job of [...this.outbox()]) {
      const m = (this.s.msgs[job.chatId] || []).find(x => x.cid === job.cid);
      if (m && m.state === 'pending') this.deliver(job).catch(() => {});
    }
  }

  async sendText(chatId, text, extra = {}) {
    const body = { t: 'text', text, ...extra };
    return this.send(chatId, body);
  }

  /** Tells the other members you're typing, at most every 3 s. Off when you hide your online status. */
  sendTyping(chatId) {
    if (!this.s.me || !this.s.me.showOnline || this.s.conn !== 'connected') return;
    const now = Date.now();
    if (now - (this.typingSent[chatId] || 0) < 3000) return;
    this.typingSent[chatId] = now;
    this.api.post('chat/typing', { chat: chatId }).catch(() => {});
  }

  /** Images get their dimensions and a 16×12 tone grid (shown while the photo downloads). */
  /** Uploads show in the thread straight away with live progress (`up`, 0-100) and can be cancelled until the server has the file. */
  async sendFile(chatId, file, kind) {
    const maxMb = (this.s.config && this.s.config.upload) || 25;
    if (file.size > maxMb * 1048576) throw new ApiError(413, 'too_large', `${file.name} is ${fmtMB(file.size)} · ${(this.s.server || {}).host || 'this server'} allows ${maxMb} MB per upload.`);
    if (kind === 'image' && !RASTER.includes((file.type || '').toLowerCase())) kind = 'file';
    const c = cid();
    const pending = { t: kind, f: { id: '', k: '', n: file.name, s: file.size, m: file.type || '' } };
    this.addLocal(chatId, { id: -Date.now(), cid: c, chat: chatId, from: this.s.me.id, kind: 'msg', at: Math.floor(Date.now() / 1000), edited: 0, deleted: false, hidden: false, body: pending, state: 'uploading', up: 0, seq: 0 });
    const ctl = { abort: null, cancelled: false };
    this.uploads[c] = ctl;
    let up, f;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let meta = {};
      if (kind === 'image') { try { meta = await imageMeta(file); } catch { kind = 'file'; } }
      const enc = await C.encryptFile(bytes);
      if (ctl.cancelled) throw new ApiError(0, 'aborted', 'upload cancelled');
      up = await this.api.upload('file/upload', { file: new Blob([enc.data]), purpose: 'file' }, p => this.setLocalState(chatId, c, 'uploading', { up: Math.min(99, Math.round(p * 100)) }), ctl);
      f = { id: up.id, k: enc.key, n: file.name, s: bytes.length, m: file.type || '', ...meta };
    } catch (e) {
      this.dropLocal(chatId, c);
      if (e.code === 'aborted') return;
      if (e.code === 'offline') throw new ApiError(0, 'upload_failed', 'upload of ' + file.name + ' failed · connection lost');
      throw e;
    } finally { delete this.uploads[c]; }
    if (kind === 'image') this.setFile(up.id, { pct: 100, done: true, url: URL.createObjectURL(new Blob([file], { type: safeMime(file.type) })) });
    return this.send(chatId, { t: kind, f }, { blobs: [up.id], cid: c });
  }

  cancelUpload(chatId, c) {
    const u = this.uploads[c];
    if (!u) return;
    u.cancelled = true;
    if (u.abort) u.abort();
  }

  dropLocal(chatId, c) { this.set({ msgs: { ...this.s.msgs, [chatId]: (this.s.msgs[chatId] || []).filter(x => x.cid !== c) } }); }

  async sendContact(chatId, uid) { return this.send(chatId, { t: 'contact', u: uid }); }

  async forward(msg, toChat) {
    const body = { ...msg.body, r: undefined, fw: msg.body.fw || this.displayName(msg.from) };
    return this.send(toChat, body, { blobs: body.f ? [body.f.id] : [] });
  }

  async editMessage(msg, text) {
    const body = msg.body.t === 'text' ? { ...msg.body, text } : { ...msg.body, cap: text };
    await this.api.post('msg/edit', { id: msg.id, ct: await C.encJson(this.chatKeys[msg.chat], body, msg.chat) });
    this.replaceLocal(msg.chat, msg.cid, { ...msg, body, edited: Math.floor(Date.now() / 1000) });
  }

  async deleteMessage(msg) {
    await this.api.post('msg/delete', { id: msg.id });
    this.replaceLocal(msg.chat, msg.cid, { ...msg, deleted: true, body: null });
  }

  report(msg, reason, note) {
    return this.api.post('msg/report', { id: msg.id, reason, note, body: msgPreview(msg, this) });
  }

  // ---------------------------------------------------------------- chats

  displayName(uid) {
    if (this.s.me && uid === this.s.me.id) return this.s.me.name;
    const c = this.contacts()[uid];
    const p = this.s.people[uid];
    return (c && c.alias) || (p && p.name) || 'unknown';
  }

  async directChat(peerId) {
    const existing = Object.values(this.s.chats).find(c => c.type === 'direct' && c.peer === peerId);
    if (existing) return existing.id;
    await this.ensurePeople([peerId]);
    const p = this.s.people[peerId];
    const key = C.newKey();
    const r = await this.api.post('chat/direct', { peer: peerId, boxMine: await C.seal(this.s.me.pubKey, key), boxPeer: await C.seal(p.pubKey, key) });
    await this.addContact(peerId).catch(() => {});
    await this.pull();
    return r.id;
  }

  async createGroup(name, memberIds) {
    await this.ensurePeople(memberIds);
    const key = C.newKey();
    const inv = await C.inviteSecrets(key);
    const members = [{ id: this.s.me.id, box: await C.seal(this.s.me.pubKey, key) }];
    for (const id of memberIds) members.push({ id, box: await C.seal(this.s.people[id].pubKey, key) });
    const r = await this.api.post('chat/group', { meta: await C.encJson(key, { name, desc: '', inv: inv.token }, 'meta'), inviteHash: inv.hash, inviteWrap: inv.wrap, members });
    await this.pull();
    return r.id;
  }

  async addMembers(chatId, ids) {
    await this.ensurePeople(ids);
    const key = this.chatKeys[chatId];
    const members = [];
    for (const id of ids) members.push({ id, box: await C.seal(this.s.people[id].pubKey, key) });
    await this.api.post('chat/add', { chat: chatId, members });
    await this.pull();
  }

  inviteLink(chatId) {
    const c = this.s.chats[chatId];
    if (!c || !c.inv || !this.s.server) return '';
    return location.origin + location.pathname.replace(/[^/]*$/, '') + '#+' + c.inv + '@' + this.s.server.host;
  }

  async joinInvite(token) {
    const { hash } = await C.inviteMaterial(null, token);
    const info = await this.api.post('chat/join-info', { hash });
    const key = await C.openInvite(token, info.wrap);
    await this.api.post('chat/join', { chat: info.chat, hash, box: await C.seal(this.s.me.pubKey, key) });
    await this.pull();
    return info.chat;
  }

  async leaveChat(chatId) {
    await this.api.post('chat/leave', { chat: chatId });
    const chats = { ...this.s.chats };
    delete chats[chatId];
    this.set({ chats });
  }

  async muteChat(chatId, muted) {
    this.set({ chats: { ...this.s.chats, [chatId]: { ...this.s.chats[chatId], muted } } });
    await this.api.post('chat/update', { chat: chatId, muted });
  }

  async clearChat(chatId) {
    await this.api.post('chat/update', { chat: chatId, clear: true });
    const last = (this.s.msgs[chatId] || []).filter(m => m.id > 0).pop();
    this.set({ msgs: { ...this.s.msgs, [chatId]: [] }, complete: { ...this.s.complete, [chatId]: true },
      chats: { ...this.s.chats, [chatId]: { ...this.s.chats[chatId], last: null, clearedSeq: last ? last.id : 0, unread: 0 } } });
  }

  search(q) { return this.api.get('users/search', { q }); }

  // ---------------------------------------------------------------- profile, privacy, devices

  async updateProfile(patch) {
    const r = await this.api.post('profile', patch);
    this.set({ me: r.me });
    await this.persistAccount();
    if ('phone' in patch || 'phoneVis' in patch) await this.refreshPhoneShares();
    return r.me;
  }

  async uploadAvatar(file) {
    const r = await this.api.upload('file/upload', { file, purpose: 'avatar' });
    this.avatars[r.id] = URL.createObjectURL(file);
    this.set({ me: { ...this.s.me, avatar: r.id } });
    await this.persistAccount();
  }

  async removeAvatar() {
    await this.api.post('avatar/remove');
    this.set({ me: { ...this.s.me, avatar: null } });
    await this.persistAccount();
  }

  avatarUrl(id) {
    if (!id) return '';
    if (this.avatars[id]) return this.avatars[id];
    if (this.avatars[id] === undefined) {
      this.avatars[id] = '';
      this.api.download('file', { id }).then(b => { this.avatars[id] = URL.createObjectURL(new Blob([b], { type: sniffRaster(b) })); this.emit(); }).catch(() => {});
    }
    return '';
  }

  devices() { return this.api.get('devices'); }
  revokeDevice(id) { return this.api.post('devices/revoke', { id }); }
  revokeOthers() { return this.api.post('devices/revoke', { all: true }); }

  mfaSetup() { return this.api.post('mfa/setup'); }
  async mfaEnable(code) { const r = await this.api.post('mfa/enable', { code }); this.set({ mfaRequired: false, me: { ...this.s.me, mfa: true } }); this.startLoop(); return r; }
  async mfaDisable(code) { await this.api.post('mfa/disable', { code }); this.set({ me: { ...this.s.me, mfa: false } }); }
  mfaBackup(currentCode) { return this.api.post('mfa/backup', { currentCode }); }

  dismissAnnouncement(id) {
    LS.set('annDismissed', [...LS.get('annDismissed', []), id].slice(-100));
    this.set({ announcements: this.s.announcements.filter(a => a.id !== id) });
  }

  // ---------------------------------------------------------------- files

  setFile(id, patch) { this.set({ files: { ...this.s.files, [id]: { ...(this.s.files[id] || {}), ...patch } } }); }

  async fetchFile(f) {
    const cur = this.s.files[f.id];
    if (cur && (cur.done || cur.pct != null && !cur.error)) return cur;
    this.setFile(f.id, { pct: 0, error: null });
    try {
      const data = await this.api.download('file', { id: f.id }, p => this.setFile(f.id, { pct: Math.min(99, Math.floor(p * 100)) }));
      const plain = await C.decryptFile(f.k, data);
      const url = URL.createObjectURL(new Blob([plain], { type: safeMime(f.m) }));
      this.setFile(f.id, { pct: 100, done: true, url });
      return this.s.files[f.id];
    } catch (e) {
      this.setFile(f.id, { pct: null, error: e.code === 'no_file' ? 'file is gone from the server' : e.message });
      throw e;
    }
  }

  async saveFile(f) {
    const st = await this.fetchFile(f);
    const a = document.createElement('a');
    a.href = st.url;
    a.download = f.n || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    this.setFile(f.id, { saved: true });
  }

  // ---------------------------------------------------------------- push

  async subscribePush() {
    const vapid = this.s.server && this.s.server.info.vapid;
    if (!vapid || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const reg = await navigator.serviceWorker.ready;
    if ((await Notification.requestPermission()) !== 'granted') return false;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64(vapid) });
    const j = sub.toJSON();
    await this.api.post('push/subscribe', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    await this.saveCache();
    return true;
  }

  async unsubscribePush() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg && await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (this.api && this.api.token) await this.api.post('push/unsubscribe').catch(() => {});
  }
}

export function mergeMsgs(list, add) {
  const byKey = new Map();
  for (const m of list) byKey.set(m.id > 0 ? 'i' + m.id : 'c' + m.cid, m);
  for (const m of add) {
    if (m.id > 0 && m.cid) byKey.delete('c' + m.cid);
    byKey.set(m.id > 0 ? 'i' + m.id : 'c' + m.cid, m);
  }
  return [...byKey.values()].sort((a, b) => (a.id > 0 ? a.id : 1e15 - a.id) - (b.id > 0 ? b.id : 1e15 - b.id));
}

export function msgPreview(m, eng) {
  if (!m) return '';
  if (m.kind === 'sys') return sysText(m, eng);
  if (m.deleted) return 'message deleted';
  if (m.hidden) return 'message hidden pending review';
  const b = normalizeBody(m.body);
  if (b.undecryptable) return '[encrypted · key unavailable]';
  if (b.t === 'text') return b.text;
  if (b.t === 'contact') return '[contact] ' + eng.displayName(b.u);
  return '[' + (b.t === 'image' ? 'image' : 'file') + '] ' + ((b.f || {}).n || '') + (b.cap ? ' — ' + b.cap : '');
}

export function sysText(m, eng) {
  const me = eng.s.me && eng.s.me.id;
  const who = m.from === me ? 'you' : eng.displayName(m.from);
  const s = m.sys || {};
  const c = eng.s.chats[m.chat] || {};
  if (s.ev === 'created') return who + ' created #' + (c.name || 'group');
  if (s.ev === 'added') return '+ ' + (s.users || []).map(u => u === me ? 'you' : eng.displayName(u)).join(', ') + ' added' + (m.from === me ? ' by you' : ' by ' + who);
  if (s.ev === 'joined') return who + ' joined via invite link';
  if (s.ev === 'left') return who + ' left';
  return '';
}

const fmtMB = b => (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB';

export function deviceName() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'browser';
  const o = /iPhone/.test(ua) ? 'ios' : /iPad/.test(ua) ? 'ipados' : /Android/.test(ua) ? 'android' : /Mac OS X/.test(ua) ? 'macos' : /Windows/.test(ua) ? 'windows' : /Linux/.test(ua) ? 'linux' : '';
  const pwa = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return (pwa ? 'pwa · ' : '') + b + (o ? ' · ' + o : '');
}

async function imageMeta(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 12;
    const g = cv.getContext('2d');
    const r = Math.max(16 / img.naturalWidth, 12 / img.naturalHeight);
    g.drawImage(img, (16 - img.naturalWidth * r) / 2, (12 - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r);
    const d = g.getImageData(0, 0, 16, 12).data;
    const px = [];
    for (let i = 0; i < 192; i++) px.push(Math.round((d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11)));
    return { w: img.naturalWidth, h: img.naturalHeight, px: b64(new Uint8Array(px)) };
  } finally { URL.revokeObjectURL(url); }
}

export { sleep };
