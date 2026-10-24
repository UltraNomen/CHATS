// CHATS client: app shell, UI state and actions. Screens live in the sibling files and read `a` (this component).
import { Component } from 'preact';
import { Engine, LS, CUR_VER, msgPreview } from './engine.js';
import { sha256 } from '#shared/core/crypto.js';
import { hex, b64 } from '#shared/core/bytes.js';
import { idbGet, idbDel } from '#shared/core/idb.js';
import GSFA from '#shared/core/i18n.js';
import { Icon } from '#shared/ui/ds.jsx';
import { AuthView } from './Auth.jsx';
import { LeftPane, Drawer } from './Left.jsx';
import { RightPane } from './Right.jsx';
import { Overlays } from './Overlays.jsx';
import { isOn, chatList } from './view.js';
import { RASTER } from '#shared/core/messages.js';
import { LOCKED_SERVER } from '#shared/core/build.js';
import { loadVazir } from '#shared/ui/fonts.js';
import { apiBase, hostOf } from '#shared/core/api.js';

export const FONTS = { jetbrains: ['jetbrains mono', '"JetBrains Mono"'], system: ['system', 'ui-monospace,"SFMono-Regular",Menlo,Consolas'], vt323: ['vt323', '"VT323"'], pixia: ['q pixia', '"Q Pixia"'], vazir: ['vazir', '"Vazirmatn"'] };
export const AFTER = [[0, 'on open'], [60, '1 min'], [300, '5 min'], [900, '15 min'], [3600, '1 h']];
export const REPO = 'https://github.com/UltraNomen/CHATS';

const LOCK0 = { enabled: false, digits: 4, after: 300, hash: '', salt: '' };

/** The CHATS server this page was loaded from, e.g. "example.org/chat" for an install in a subfolder. */
const ownServer = () => /^https?:$/.test(location.protocol) ? location.host + location.pathname.replace(/\/i\/[^/]+\/?$/, '/').replace(/[^/]*$/, '').replace(/\/$/, '') : '';

export class App extends Component {
  constructor() {
    super();
    this.eng = new Engine();
    const look = LS.get('look', {});
    this.state = {
      vw: window.innerWidth, booting: true, bootN: 0, auth: null,
      // auth
      serverUrl: LOCKED_SERVER || ownServer(), serverBusy: false, serverErr: '', serverFound: null,
      authMethod: 'username', authId: '', authPw: '', authErr: '', authBusy: false, authNotice: '', showPw: false, invite: '',
      prof: { name: '', username: '', avatar: null, avatarUrl: '', email: '', phone: '' }, signupPw: '',
      phrase: null, phraseSaved: false, phraseCopied: false, phraseDl: false,
      forgotStep: 'words', forgotUser: '', slots: ['', '', '', '', '', '', '', ''], slotFocus: 0, newPw: '', newPw2: '', recovery: null,
      tfa: null,
      // app
      left: 'list', right: null, activeId: null, peerId: null, peerBack: null, drawerOpen: false, filter: 'all', query: '', searchOpen: false, found: [],
      chatSearchOpen: false, chatQuery: '', draft: '', editId: null, replyId: null, menu: null, editContact: null, fwd: null, attachOpen: false,
      inviteOpen: false, inviteGroup: null, inviteSel: {}, copied: false, preview: null, installOpen: false, install: 'idle', installTab: 'android',
      phv: null, phvPwVal: '', phvErr: '', phvNew: false, phvWords: null, report: null, uploadErr: null, rateUntil: 0, toast: null, share: null,
      groupName: '', groupSel: {}, groupQuery: '', groupErr: '', contactQuery: '', saved: false, profErr: '', setSec: null, devices: null, devConfirm: null,
      lock: LS.get('lock', LOCK0), pinMode: null, pin: '', pinFirst: '', pinErr: '', pinDigits: 4, pinTries: 0,
      prefs: LS.get('prefs', { notify: false, sound: false }), serverCard: false, upd: null, mfa: null, now: Date.now(),
      theme: look.theme || null, font: look.font || 'jetbrains', faFont: look.faFont || 'vazir', lang: look.lang || 'en', scanlines: look.scanlines ?? true,
      pf: null, hidePreviews: false, dragOver: false, keysOpen: false, pinIdx: null,
    };
    this.lastAct = Date.now();
    this.scrollRef = { current: null };
    this.frameRef = { current: null };
  }

  set = (patch, cb) => this.setState(patch, cb);

  async componentDidMount() {
    this.unsub = this.eng.on(() => this.forceUpdate());
    this.eng.onNewMessage = c => this.notifyIncoming(c);
    this.bootT = setInterval(() => this.setState(x => x.bootN >= 5 ? (clearInterval(this.bootT), { booting: false, pinMode: x.lock.enabled && !x.auth ? 'lock' : x.pinMode }) : { bootN: x.bootN + 1 }), 300);
    const ua = navigator.userAgent;
    this.setState({ installTab: /iphone|ipad|ipod/i.test(ua) ? 'ios' : /android/i.test(ua) ? 'android' : 'desktop' });
    // Declares the bundled Farsi font; nothing is downloaded until Farsi text is on screen.
    loadVazir('fonts/vazirmatn.ttf');
    this.readLinks();
    let where = await this.eng.boot();
    // A branded build only ever uses its own server, even if this origin once stored another one.
    if (LOCKED_SERVER && this.eng.s.server && this.eng.s.server.host !== hostOf(apiBase(LOCKED_SERVER))) where = 'server';
    if (where === 'server') where = await this.autoConnect();
    const srv = this.eng.s.server;
    this.setState({ auth: where === 'app' ? null : where, serverUrl: srv ? srv.host : this.state.serverUrl });
    if (where !== 'app' && srv) this.eng.refreshInfo();
    if (where === 'app' && this.state.prefs.notify) this.eng.subscribePush().catch(() => {});
    this.consumeShare();
    this.onResize = () => this.setState({ vw: window.innerWidth });
    window.addEventListener('resize', this.onResize);
    this.onAct = () => { this.lastAct = Date.now(); };
    this.onKeyG = e => {
      if (this.state.pinMode) { if (/^\d$/.test(e.key)) this.pinPress(e.key); else if (e.key === 'Escape') return; else if (e.key === 'Backspace') this.pinBack(); return; }
      if (e.key === 'Escape') return this.escape(e);
      this.shortcut(e);
    };
    window.addEventListener('pointerdown', this.onAct);
    window.addEventListener('keydown', this.onAct);
    window.addEventListener('keydown', this.onKeyG);
    this.onVis = () => {
      this.eng.setVisible(!document.hidden);
      const s = this.state;
      if (document.hidden) { this.hiddenAt = Date.now(); return; }
      if (s.lock.enabled && !s.auth && !s.pinMode && (s.lock.after === 0 || Date.now() - (this.hiddenAt || 0) > s.lock.after * 1000)) this.setState({ pinMode: 'lock', pin: '' });
      if (this.state.right === 'chat' && this.state.activeId) this.eng.markRead(this.state.activeId);
    };
    document.addEventListener('visibilitychange', this.onVis);
    this.tickT = setInterval(() => {
      const s = this.state, n = Date.now();
      if ((s.rateUntil && s.rateUntil > n - 1500) || (this.eng.s.status && this.eng.s.status.kind === 'maintenance')) this.setState({ now: n });
      if (s.lock.enabled && s.lock.after > 0 && !s.auth && !s.pinMode && !s.booting && n - this.lastAct > s.lock.after * 1000) this.setState({ pinMode: 'lock', pin: '' });
      if (this.eng.s.status && this.eng.s.status.kind === 'maintenance' && n % 30000 < 1000) this.eng.reconnect();
    }, 1000);
    this.onBip = e => { e.preventDefault(); this.bip = e; };
    window.addEventListener('beforeinstallprompt', this.onBip);
    window.addEventListener('appinstalled', () => this.setState({ install: 'done' }));
    if (matchMedia('(display-mode: standalone)').matches) this.setState({ install: 'done' });
    this.registerSW();
    window.addEventListener('hashchange', () => this.readLinks());
  }

  componentWillUnmount() {
    this.unsub && this.unsub();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.onAct);
    window.removeEventListener('keydown', this.onAct);
    window.removeEventListener('keydown', this.onKeyG);
    document.removeEventListener('visibilitychange', this.onVis);
    clearInterval(this.tickT);
    clearInterval(this.bootT);
  }

  componentDidUpdate() {
    const root = document.getElementById('root');
    if (root) GSFA.set(root, this.state.lang);
    const s = this.state, list = this.eng.s.msgs[s.activeId] || [];
    const key = s.activeId + ':' + list.length + ':' + (list.length ? list[list.length - 1].cid : '') + ':' + s.right;
    if (key !== this._k) {
      this._k = key;
      const el = this.scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      if (s.right === 'chat' && s.activeId && !document.hidden) this.eng.markRead(s.activeId);
    }
  }

  // ---------------------------------------------------------------- links, service worker, share target

  /**
   * Picks the server without asking when it's clear which one: the locked server of a branded build, the server named
   * in an invite link, or the API next to this page (the full bundle). Anything doubtful, like a changed key, still
   * goes to the connect screen.
   */
  async autoConnect() {
    const target = LOCKED_SERVER || this.linkServer || ownServer();
    if (!target) return 'server';
    try {
      const found = await this.eng.probe(target);
      if (found.fpChanged) { this.setState({ serverUrl: found.host, serverFound: found }); return 'server'; }
      this.eng.useServer(found);
      return 'welcome';
    } catch (e) {
      if (LOCKED_SERVER || this.linkServer) this.setState({ serverUrl: target, serverErr: e.message });
      return 'server';
    }
  }

  readLinks() {
    const h = location.hash;
    const m = /^#\+([A-Za-z0-9_-]{10,})@(.+)$/.exec(h);
    if (m) { this.pendingJoin = { token: m[1], host: decodeURIComponent(m[2]) }; history.replaceState(null, '', location.pathname + location.search); this.tryJoin(); }
    const p = /\/i\/([A-Z0-9-]{6,32})\/?$/i.exec(location.pathname);
    if (p) {
      this.setState({ invite: p[1].toUpperCase(), serverUrl: LOCKED_SERVER || ownServer() });
      history.replaceState(null, '', location.pathname.replace(/i\/[^/]+\/?$/, ''));
    }
    // Invite links from a server whose chat app is hosted elsewhere: ?invite=CODE&server=chat.example.org
    const q = new URLSearchParams(location.search);
    if (/^[A-Z0-9-]{6,32}$/i.test(q.get('invite') || '')) {
      const srv = (q.get('server') || '').trim();
      if (srv && !LOCKED_SERVER && /^[a-z0-9.:[\]-]+(\/[\w.~/-]*)?$/i.test(srv)) this.linkServer = srv;
      this.setState({ invite: q.get('invite').toUpperCase(), serverUrl: LOCKED_SERVER || this.linkServer || this.state.serverUrl });
      q.delete('invite'); q.delete('server');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
    }
  }

  async tryJoin() {
    const j = this.pendingJoin;
    if (!j || !this.eng.s.me) return;
    if (this.eng.s.server.host !== j.host) { this.toast('↪', 'invite is for ' + j.host, "you're signed in to " + this.eng.s.server.host); this.pendingJoin = null; return; }
    this.pendingJoin = null;
    try { const id = await this.eng.joinInvite(j.token); this.openChat(id); this.toast('+', 'joined group', ''); } catch (e) { this.toast('!', e.message, 'invite link'); }
  }

  registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) this.setState({ toast: { kind: 'update', glyph: '↻', text: 'update ready', sub: 'reload to apply · takes 2s' } });
        });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'open-chat' && e.data.chat) this.openChat(e.data.chat);
    });
    const q = new URLSearchParams(location.search);
    if (q.get('chat')) this.pendingOpen = q.get('chat');
  }

  async consumeShare() {
    const q = new URLSearchParams(location.search);
    if (q.get('go') === 'newGroup') this.goLeft('newGroup');
    if (q.get('go') === 'search') this.setState({ searchOpen: true });
    if (!q.has('share')) { if (q.has('go') || q.has('chat')) history.replaceState(null, '', location.pathname); return; }
    history.replaceState(null, '', location.pathname);
    const sh = await idbGet('share');
    await idbDel('share');
    if (sh && (sh.files.length || sh.text || sh.url)) {
      const files = sh.files.map(f => ({ ...f, url: RASTER.includes(f.type) ? URL.createObjectURL(new Blob([f.data], { type: f.type })) : '' }));
      this.setState({ share: { files, caption: [sh.title, sh.text, sh.url].filter(Boolean).join(' '), q: '', sel: {} } });
    }
  }

  // ---------------------------------------------------------------- shared actions

  wide() { return this.state.vw >= 860; }

  toast(glyph, text, sub, kind) {
    clearTimeout(this.toastT);
    this.setState({ toast: { glyph, text, sub, kind } });
    if (kind !== 'update') this.toastT = setTimeout(() => this.setState({ toast: null }), 3800);
  }

  saveLook(patch) {
    this.setState(patch, () => { const s = this.state; LS.set('look', { theme: s.theme, font: s.font, faFont: s.faFont, lang: s.lang, scanlines: s.scanlines }); });
  }

  savePrefs(prefs) { LS.set('prefs', prefs); this.setState({ prefs }); }

  saveLock(lock) { LS.set('lock', lock); this.setState({ lock }); this.eng.saveCacheSoon(); }

  escape(ev) {
    const s = this.state;
    if (s.keysOpen) return this.setState({ keysOpen: false });
    if (s.menu) return this.setState({ menu: null });
    if (s.preview) return this.setState({ preview: null });
    if (s.attachOpen || s.fwd || s.inviteOpen || s.report || s.editContact || s.phv || s.installOpen || s.mfa || s.serverCard) {
      return this.setState({ attachOpen: false, fwd: null, inviteOpen: false, report: null, editContact: null, phv: null, installOpen: false, mfa: null, serverCard: false });
    }
    if (s.drawerOpen) return this.setState({ drawerOpen: false });
    if (s.chatSearchOpen) return this.setState({ chatSearchOpen: false, chatQuery: '' });
    if (ev && typingIn(ev.target)) ev.target.blur();
  }

  /** Single-key shortcuts (the KEYS sheet, `?`). Never while typing, with a modifier, or behind a sheet. */
  shortcut(ev) {
    const s = this.state, es = this.eng.s;
    if (s.auth || s.booting || !es.me || es.status || ev.metaKey || ev.ctrlKey || ev.altKey || typingIn(ev.target)) return;
    if (ev.key === '?') return this.setState(x => ({ keysOpen: !x.keysOpen }));
    if (s.keysOpen || s.menu || s.preview || s.share || s.phv || s.mfa || s.report || s.fwd || s.inviteOpen || s.editContact || s.attachOpen || s.drawerOpen) return;
    if (ev.key === 'Enter' && ev.target && /^(BUTTON|A)$/.test(ev.target.tagName)) return;
    const k = ev.key;
    if (k === 'j' || k === 'ArrowDown' || k === 'k' || k === 'ArrowUp') {
      const ids = chatList(this).map(c => c.id);
      if (!ids.length) return;
      ev.preventDefault();
      const cur = s.right === 'chat' ? ids.indexOf(s.activeId) : -1, d = k === 'j' || k === 'ArrowDown' ? 1 : -1;
      return this.openChat(ids[cur < 0 ? (d > 0 ? 0 : ids.length - 1) : (cur + d + ids.length) % ids.length]);
    }
    if ((k === 'i' || k === 'Enter') && s.right === 'chat') {
      const el = document.querySelector('[data-composer="1"]');
      if (el) { ev.preventDefault(); el.focus(); }
      return;
    }
    if (k === 'p' && s.right === 'chat' && s.activeId) return this.jumpPin(s.activeId);
    if (k === 'n' && ((es.config || {}).caps || {}).groups !== false) return this.goLeft('newGroup');
    if (k === 'g') { this.goLeft('list'); if (!this.wide()) this.setState({ right: null }); }
  }

  /** Index of the pinned message the bar shows; newest first until the user cycles. */
  pinShown(chatId) {
    const ids = this.eng.pins(chatId);
    if (!ids.length) return -1;
    const i = this.state.pinIdx;
    return i == null ? ids.length - 1 : ((i % ids.length) + ids.length) % ids.length;
  }

  /** Scrolls to the pinned message in the bar, then moves the bar on to the next one. */
  jumpPin = chatId => {
    const ids = this.eng.pins(chatId), i = this.pinShown(chatId);
    if (i < 0) return;
    const id = ids[i], el = document.getElementById('m' + id);
    if (el) { el.scrollIntoView({ block: 'center' }); this.setState({ hl: id }); setTimeout(() => this.setState({ hl: null }), 1200); }
    else this.toast('⚲', 'pinned message is further up', 'scroll up to load older messages');
    this.setState({ pinIdx: (i + 1) % ids.length });
  };

  goLeft = left => this.setState(s => ({ left, drawerOpen: false, saved: false, groupErr: '', setSec: left === 'settings' && s.left === 'devices' ? s.setSec : null, pf: left === 'profile' ? null : s.pf }));

  openChat = id => {
    this.setState(s => ({ right: 'chat', activeId: id, drawerOpen: false, editId: null, replyId: null, menu: null, draft: s.activeId === id ? s.draft : '', attachOpen: false, inviteOpen: false,
      chatSearchOpen: false, chatQuery: '', left: s.left === 'newGroup' ? 'list' : s.left, uploadErr: null, pinIdx: s.activeId === id ? s.pinIdx : null, dragOver: false }));
    if (!this.eng.s.msgs[id]) this.eng.loadHistory(id).catch(() => {});
  };

  openPeer = id => this.setState(s => ({ right: 'info', peerId: id, peerBack: s.right === 'info' ? s.peerBack : s.right, drawerOpen: false, attachOpen: false, menu: null }));

  async messagePerson(uid) {
    try { const id = await this.eng.directChat(uid); this.openChat(id); } catch (e) { this.toast('!', e.message, ''); }
  }

  openMenu = (e, menu) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const f = this.frameRef.current, b = e && e.currentTarget;
    let x = 12, y = 60;
    if (f && b) { const fr = f.getBoundingClientRect(), br = b.getBoundingClientRect(); x = br.left - fr.left; y = br.bottom - fr.top + 4; menu.up = br.top - fr.top > fr.height * 0.6; menu.btnTop = br.top - fr.top; menu.fw = fr.width; }
    this.setState({ menu: { ...menu, x, y, confirm: false } });
  };

  async doLogout(notice) {
    const lock = { ...LOCK0 };
    this.saveLock(lock);
    await this.eng.logout();
    this.setState({ auth: 'welcome', authPw: '', drawerOpen: false, right: null, left: 'list', activeId: null, pinMode: null, pin: '', pinTries: 0, phv: null, serverCard: false,
      authErr: typeof notice === 'string' ? notice : '', authNotice: '' });
  }

  notifyIncoming(c) {
    const s = this.state;
    if (s.right === 'chat' && s.activeId === c.id && !document.hidden) return;
    if (c.muted) return;
    if (s.prefs.sound) beep();
  }

  // ---- composer

  rateOk() {
    if (Date.now() < this.state.rateUntil) return false;
    return true;
  }

  async send() {
    const s = this.state, t = s.draft.trim(), e = this.eng, id = s.activeId;
    const all = e.s.msgs[id] || [];
    if (s.editId !== null) {
      const m = all.find(x => x.id === s.editId);
      if (!m || (m.body.t === 'text' && !t)) return;
      this.setState({ draft: '', editId: null });
      try { await e.editMessage(m, t); } catch (err) { this.setState({ uploadErr: { tag: '[ERR]', text: err.message } }); }
      return;
    }
    if (!t || !this.rateOk()) return;
    const extra = {};
    if (s.replyId !== null) {
      const r = all.find(x => x.id === s.replyId);
      if (r) extra.r = { id: r.id, from: r.from, x: msgPreview(r, e).slice(0, 120) };
    }
    const mentions = [...t.matchAll(/(^|\s)@([a-z][a-z0-9_]{2,31})\b/g)].map(m => Object.values(e.s.people).find(p => p.username === m[2])).filter(Boolean).map(p => p.id);
    if (mentions.length) extra.mn = mentions;
    this.setState({ draft: '', replyId: null });
    try { await e.sendText(id, t, extra); } catch (err) { this.handleSendError(err); }
  }

  handleSendError(err) {
    if (err.code === 'rate_limited') {
      const retry = (err.extra.retry || 10) * 1000;
      this.setState({ rateUntil: Date.now() + retry, now: Date.now() });
    } else if (err.code === 'storage_full') {
      const used = err.extra.used || 0, quota = err.extra.quota || 0;
      this.setState({ uploadErr: { tag: '[ERR]', text: `storage full · ${Math.round(used / 1048576)} / ${Math.round(quota / 1048576)} MB used. delete old files or ask an admin for more space.`, actionLabel: 'manage' } });
    } else if (err.code === 'too_large') {
      this.setState({ uploadErr: { tag: '[ERR]', text: err.message } });
    } else if (err.code !== 'offline') {
      this.setState({ uploadErr: { tag: '[ERR]', text: err.message } });
    }
  }

  async sendFiles(files, kind, chatId) {
    const id = chatId || this.state.activeId;
    this.setState({ attachOpen: false, uploadErr: null });
    for (const f of files) {
      const k = kind === 'file' ? 'file' : RASTER.includes((f.type || '').toLowerCase()) ? 'image' : 'file';
      try { await this.eng.sendFile(id, f, k); } catch (err) { this.handleSendError(err); break; }
    }
  }

  // ---- lock

  async pinHash(pin, salt) { return hex(await sha256(salt + ':' + pin)); }

  pinPress = d => {
    const s = this.state, len = s.pinMode === 'lock' ? s.lock.digits : s.pinDigits;
    if (!s.pinMode || s.pin.length >= len) return;
    const pin = s.pin + d;
    this.setState({ pin, pinErr: '' });
    if (pin.length === len) setTimeout(() => this.pinDone(pin), 140);
  };

  pinBack = () => this.setState(x => ({ pin: x.pin.slice(0, -1), pinErr: '' }));

  async pinDone(pin) {
    const s = this.state;
    if (s.pinMode === 'lock') {
      if (await this.pinHash(pin, s.lock.salt) === s.lock.hash) { this.lastAct = Date.now(); return this.setState({ pinMode: null, pin: '', pinTries: 0 }); }
      if (s.pinTries >= 4) return this.doLogout('too many wrong passcodes · signed out');
      return this.setState({ pin: '', pinTries: s.pinTries + 1, pinErr: 'wrong passcode · ' + (4 - s.pinTries) + ' tries before sign-out' });
    }
    if (s.pinMode === 'set') return this.setState({ pinMode: 'confirm', pinFirst: pin, pin: '' });
    if (s.pinMode === 'confirm') {
      if (pin !== s.pinFirst) return this.setState({ pinMode: 'set', pin: '', pinFirst: '', pinErr: 'codes did not match · start over' });
      const salt = b64(crypto.getRandomValues(new Uint8Array(12)));
      const lock = { ...s.lock, enabled: true, digits: s.pinDigits, salt, hash: await this.pinHash(pin, salt) };
      this.saveLock(lock);
      this.lastAct = Date.now();
      this.setState({ pinMode: null, pin: '', pinFirst: '', toast: { glyph: '⚿', text: 'app lock on', sub: s.pinDigits + '-digit passcode · auto-lock ' + afterLabel(lock.after) } });
    }
  }

  // ---- updates

  checkUpdate = () => {
    this.setState({ upd: { st: 'busy' } });
    fetch('https://api.github.com/repos/UltraNomen/CHATS/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => r.status === 404 ? { none: true } : r.ok ? r.json() : Promise.reject(r.status))
      .then(j => this.setState({ upd: j.none ? { st: 'ok', msg: '[ OK ] no published releases yet · you are on the latest build' } : { st: 'ok', tag: j.tag_name, url: j.html_url,
        msg: (j.tag_name && j.tag_name.replace(/^v/, '') !== CUR_VER.replace(/^v/, '') ? '[ NEW ] ' + j.tag_name + ' available' : '[ OK ] up to date · ' + (j.tag_name || CUR_VER)) } }))
      .catch(() => this.setState({ upd: { st: 'fail', msg: "[FAIL] couldn't reach github.com · check your connection" } }));
  };

  // ---------------------------------------------------------------- render

  render() {
    const s = this.state, e = this.eng, es = e.s, wide = this.wide();
    const theme = s.theme || (es.config && es.config.theme) || (es.server && es.server.info.theme) || 'green';
    const fa = s.faFont === 'pixia' ? '"Q Pixia Arabic",' : s.faFont === 'vazir' ? '"Vazirmatn Arabic",' : '';
    const fontMono = FONTS[s.font][1] + ',' + fa + 'ui-monospace,Menlo,Consolas,"Noto Sans Arabic",Tahoma,monospace';
    const fontPixel = '"Silkscreen",' + fa + '"VT323",' + fontMono;
    const dir = s.lang === 'fa' ? 'rtl' : 'ltr';
    const srv = es.server;
    const conn = es.conn;
    const connColor = !srv ? 'var(--text-3)' : conn === 'connected' ? 'var(--accent)' : conn === 'offline' ? 'var(--err)' : 'var(--warn)';
    const connLabel = !srv ? 'not connected' : conn === 'connected' ? 'connected · ' + srv.host : conn === 'offline' ? 'offline · ' + srv.host : 'connecting · ' + srv.host;
    const connMeta = !srv ? '' : conn === 'connected' ? '· e2e · ' + (es.latency || 0) + 'ms' : conn === 'offline' ? '· messages queue as failed' : '· handshake';
    const isAuth = !!s.auth || (!es.me && !s.booting);
    const right = s.right;
    return (
      <div id="root" data-theme={theme} dir={dir} lang={s.lang} style={{ '--font-mono': fontMono, '--font-pixel': fontPixel, minHeight: '100dvh', background: 'var(--surface-page)', display: 'flex', justifyContent: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-1)' }}>
        <div ref={this.frameRef} style={{ position: 'relative', width: '100%', maxWidth: wide ? '1280px' : '420px', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--surface-panel)', borderInlineStart: '1px solid var(--border-faint)', borderInlineEnd: '1px solid var(--border-faint)', overflow: 'hidden' }}>
          {s.scanlines && <div style={{ position: 'absolute', inset: 0, background: 'var(--scanlines)', pointerEvents: 'none', zIndex: 60, opacity: 0.5 }} />}
          {isAuth ? <AuthView a={this} /> : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <div style={{ position: 'relative', flex: wide ? 'none' : '1', width: wide ? '360px' : '100%', minWidth: 0, display: wide || !right ? 'flex' : 'none', flexDirection: 'column', borderInlineEnd: '1px solid var(--border-faint)', overflow: 'hidden' }}>
                <LeftPane a={this} />
                {s.drawerOpen && <Drawer a={this} />}
              </div>
              <div style={{ position: 'relative', flex: 1, minWidth: 0, display: wide || right ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
                <RightPane a={this} />
              </div>
            </div>
          )}
          <Overlays a={this} />
          <footer style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', height: '28px', padding: '0 12px', borderTop: '1px solid var(--border-faint)', background: 'var(--surface-page)', fontSize: '11px', color: 'var(--text-3)' }}>
            <button onClick={() => { if (!isAuth) this.setState(x => ({ serverCard: !x.serverCard })); }} title="server info" class="hvu" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, background: 'transparent', border: 0, font: 'inherit', fontSize: '11px', color: connColor, cursor: 'pointer' }}>
              <Icon name="cloud" /><span data-no-tr="1">{connLabel}</span>
            </button>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{connMeta}</span>
            <span style={{ flex: 'none', color: 'var(--text-2)' }}>{this.statusRight(isAuth)}</span>
          </footer>
        </div>
      </div>
    );
  }

  statusRight(isAuth) {
    const s = this.state, es = this.eng.s;
    if (isAuth) return s.auth === 'server' ? 'no server' : 'not signed in';
    const c = es.chats[s.activeId];
    const all = es.msgs[s.activeId] || [];
    const cq = s.chatQuery.trim().toLowerCase();
    if (s.right === 'chat' && c) {
      const shown = cq ? all.filter(m => msgPreview(m, this.eng).toLowerCase().includes(cq)).length : 0;
      return (cq ? shown + ' matches · ' : '') + (c.type === 'group' ? c.members.length + ' members · ' : '') + all.filter(m => m.id > 0 || m.state).length + ' msgs';
    }
    if (s.right === 'info') {
      const g = es.chats[s.peerId];
      if (g && g.type === 'group') return g.members.length + ' members';
      const p = es.people[s.peerId];
      return p ? '@' + p.username : '';
    }
    const contacts = Object.keys(this.eng.contacts());
    const on = contacts.filter(id => isOn(es.people[id])).length;
    return ({ list: Object.keys(es.chats).length + ' chats · ' + on + ' online', contacts: contacts.length + ' contacts · ' + on + ' online', settings: CUR_VER.slice(0, 4),
      devices: (s.devices || []).length + ' sessions', profile: 'bio ' + ((s.pf && s.pf.bio) || (es.me && es.me.bio) || '').length + '/70',
      newGroup: Object.values(s.groupSel).filter(Boolean).length + ' selected' })[s.left] || '';
  }
}

const typingIn = t => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

export const afterLabel = v => { const f = AFTER.find(a => a[0] === v); return f ? f[1] : v + 's'; };

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'square';
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.08);
  } catch { /* audio blocked */ }
}
