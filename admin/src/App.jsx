// CHATS admin console: sign-in (password + TOTP), first-run setup wizard, and the console shell. Pages live in pages.jsx.
import { Component } from 'preact';
import { Api, apiBase, hostOf, schemeFor, protocolProblem } from '#shared/core/api.js';
import { VERSION } from '#shared/core/build.js';
import * as C from '#shared/core/crypto.js';
import { b64 } from '#shared/core/bytes.js';
import { qrMatrix } from '#shared/core/qr.js';
import { utcTime, fmtUptime } from '#shared/core/format.js';
import GSFA from '#shared/core/i18n.js';
import { loadVazir } from '#shared/ui/fonts.js';
// Embedded as data: so the console stays one self-contained file.
import vazirFont from '../../client/public/fonts/vazirmatn.ttf';
import { QrGrid } from '#shared/ui/kit.jsx';
import { Pages, CONFIG_PAGES } from './pages.jsx';
import { B } from './ui.jsx';

export const REPO = 'https://github.com/UltraNomen/CHATS';
/** This console's own build. The server's version comes from /info. */
export const CONSOLE_VER = VERSION;
const WZSTEPS = [['settings', 'server'], ['database', 'database'], ['storage', 'storage'], ['smtp', 'email'], ['twofa', '2fa'], ['owner', 'owner'], ['done', 'launch']];
const NAV = [
  { title: 'MONITOR', items: [['overview', 'overview', '◇'], ['health', 'health', '♥'], ['audit', 'audit log', '≡']] },
  { title: 'MANAGE', items: [['users', 'users', '@'], ['reports', 'reports', '!'], ['invites', 'invites', '+'], ['chats', 'chats', '#'], ['storage', 'storage', '▤']] },
  { title: 'CONFIGURE', items: [['settings', 'server settings', '⚙'], ['database', 'database', '◫'], ['smtp', 'email / smtp', '✉'], ['twofa', 'two-factor', '⚷'], ['announce', 'announcements', '»'], ['admins', 'admins & security', '⚿']] },
];
const TITLES = { overview: 'OVERVIEW', users: 'USERS', user: 'USER', reports: 'REPORTS', invites: 'INVITES', chats: 'CHATS', storage: 'STORAGE', settings: 'SERVER SETTINGS', announce: 'ANNOUNCEMENTS',
  audit: 'AUDIT LOG', admins: 'ADMINS & SECURITY', health: 'HEALTH', database: 'DATABASE', smtp: 'EMAIL / SMTP', twofa: 'TWO-FACTOR', owner: 'OWNER ACCOUNT', done: 'READY TO LAUNCH' };
const SS = { get: k => { try { return sessionStorage.getItem('chats.admin.' + k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem('chats.admin.' + k) : sessionStorage.setItem('chats.admin.' + k, v); } catch { /* private */ } } };
/** Remembered across visits: recent servers and the key fingerprint each one had. */
const LS = { get: (k, d) => { try { const v = localStorage.getItem('chats.admin.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('chats.admin.' + k, JSON.stringify(v)); } catch { /* private */ } } };

/** Looks up a CHATS server from what the admin typed (or the API next to this page). */
export async function probeServer(input) {
  let base;
  try { base = apiBase(input); } catch { base = ''; }
  const host = base ? hostOf(base) : '';
  if (!host || (!host.includes('.') && !/^localhost|^127\.|^\[|:\d+/.test(host))) throw new Error('not a valid address · try chat.example.org');
  let r;
  try { r = await new Api(base).get('info'); } catch (e) { throw new Error(e.code === 'offline' ? 'could not reach ' + host + ' · check the address' : host + " doesn't look like a CHATS server"); }
  if (!r.server || !r.server.version) throw new Error(host + " doesn't look like a CHATS server");
  const pp = protocolProblem(r.server);
  if (pp) throw new Error(pp);
  // A server's key only exists once it's set up, so only installed servers are pinned.
  const pinned = r.server.installed ? LS.get('fp:' + host, null) : null;
  return { base, host, info: r.server, fpChanged: !!pinned && pinned !== r.server.fingerprint };
}

/** Public invite link for a code: the chat app lives next to the server's /api. */
export const inviteUrl = (api, code, info) => {
  // Split deployments set where the chat app lives; the link then names this server so the app connects to it.
  const app = info && info.clientUrl;
  if (app) return app + '/?invite=' + encodeURIComponent(code) + '&server=' + encodeURIComponent(hostOf(api.base));
  return new URL('../i/' + encodeURIComponent(code), api.base).href;
};

/** Wizard defaults merged with what the server environment set (Docker / compose). Secrets never come back, only flags. */
const applyPreset = (cfg, p) => {
  const c = clone(cfg);
  if (p && p.db) { const { passSet, ...db } = p.db; c.db = { ...c.db, ...db }; }
  if (p && p.storage) { const { secretSet, ...st } = p.storage; c.storage = { ...c.storage, ...st }; }
  return c;
};

export const freshCfg = host => ({
  server: { name: (host || '').replace(/\/.*$/, '').replace(/:\d+$/, h => /^localhost|^127\./.test(host) ? h : ''), welcome: 'welcome to CHATS. be kind, keep it encrypted.', reg: 'invite', upload: '25', group: '200', rate: '30', quota: '500', theme: 'green', maint: false,
    maintMsg: 'upgrading — back in about 15 minutes.', emailField: 'off', phoneField: 'off', reporting: true, reportHide: '3', capEdit: true, editWindow: '60', capDelete: true, capForward: true, capAttach: true, capGroups: true,
    tfaUsers: 'optional', tfaAdmins: 'optional', tfaBackup: true, tfaEmail: false, tfaRemember: '30' },
  db: { engine: 'sqlite', path: '', wal: true, host: 'localhost', port: '5432', name: 'chats', user: 'chats', pass: '', ssl: 'disable', pool: '10' },
  storage: { backend: 'local', path: '', s3Provider: 'minio', endpoint: '', region: 'us-east-1', bucket: '', key: '', secret: '', pathStyle: true },
  smtp: { on: false, host: '', port: '587', sec: 'starttls', user: '', pass: '', fromName: 'CHATS', from: '' },
});

export class AdminApp extends Component {
  constructor() {
    super();
    this.api = new Api(SS.get('server') || '', SS.get('token') || '');
    this.api.onAuthError = e => { if (['session_revoked', 'session_expired', 'no_session'].includes(e.code)) this.signedOut(e.code === 'session_expired' ? 'session expired · sign in again' : ''); };
    this.state = {
      w: window.innerWidth, auth: 'boot', lu: '', lp: '', credsErr: '', code: '', codeErr: '', ticket: '', enroll: null, setupCode: '', setupErr: '', secretCopied: false, codes: null, codesCopied: false, busy: false,
      page: SS.get('page') || 'overview', userId: null, lang: SS.get('lang') || 'en', now: Date.now(), info: null, me: null, expires: 0,
      d: {}, cfg: null, cfgSaved: null, tests: {}, testTo: '', showPw: false, confirm: null, confirmText: '', toast: null, invNew: null,
      q: '', filt: 'all', sort: { k: 'created', d: -1 }, sel: {}, pg: 0, repFilt: 'open', auQ: '', auType: 'all', ipNew: '', ipErr: '', ann: { body: '', level: 'info', when: 'now', at: '' },
      srvIn: '', srvFound: null, srvErr: '', srvBusy: false,
      wz: 0, wzMax: 0, wzErr: '', owner: { user: '', email: '', pass: '', pass2: '' }, setupToken: new URLSearchParams(location.search).get('setup') || '', orphan: null,
    };
  }

  set = (patch, cb) => this.setState(patch, cb);

  async componentDidMount() {
    if (new URLSearchParams(location.search).has('setup')) history.replaceState(null, '', location.pathname); // keep the token out of history
    this.onResize = () => this.setState({ w: window.innerWidth });
    window.addEventListener('resize', this.onResize);
    this.iv = setInterval(() => this.setState({ now: Date.now() }), 1000);
    // Reloads keep the server this tab was using; a console installed at /admin/ finds its own API; otherwise ask.
    const saved = SS.get('server');
    const own = /^https?:$/.test(location.protocol) ? new URL('../api/', location.href).href : '';
    for (const cand of [saved, saved ? '' : own]) {
      if (!cand) continue;
      try {
        const found = await probeServer(cand);
        if (!found.fpChanged) return this.useServer(found);
        return this.setState({ auth: 'server', srvIn: found.host, srvFound: found });
      } catch (e) { if (cand === saved) return this.setState({ auth: 'server', srvIn: hostOf(saved), srvErr: e.message }); }
    }
    this.setState({ auth: 'server', srvIn: (LS.get('servers', [])[0]) || '' });
  }

  /** Connects the console to a server the admin confirmed, then shows setup or sign-in for it. */
  async useServer(found) {
    // A new server, or a key that changed: never reuse an old session token with it.
    if (SS.get('server') !== found.base || found.fpChanged) { this.api.token = ''; SS.set('token', null); }
    this.api.base = found.base;
    SS.set('server', found.base);
    if (found.info.installed) LS.set('fp:' + found.host, found.info.fingerprint);
    LS.set('servers', [found.host, ...LS.get('servers', []).filter(h => h !== found.host)].slice(0, 5));
    this.setState({ host: found.host, info: found.info, srvFound: null, srvErr: '', auth: 'boot' });
    try {
      if (!found.info.installed) {
        const st = await this.api.get('setup/status');
        let preset = st.preset || {};
        if (st.needsToken && this.state.setupToken) {
          try { preset = (await this.api.post('setup/unlock', { setupToken: this.state.setupToken })).preset || {}; } catch { this.setState({ setupToken: '' }); }
        }
        const cfg = applyPreset(freshCfg(found.host), preset);
        this.setState({ setupInfo: st, preset, cfg, cfgSaved: clone(cfg) });
        return this.setState({ auth: st.needsToken && !this.state.setupToken ? 'token' : 'wizard' });
      }
    } catch { return this.setState({ auth: 'server', srvIn: found.host, srvErr: '✕ cannot reach the server api' }); }
    if (this.api.token) {
      try { await this.loadMe(); this.setState({ auth: null }); this.go(this.state.page); return; } catch { /* stale */ }
    }
    this.setState({ auth: 'login' });
  }

  /** Back to the server step; ends this tab's session on the current server first. */
  async changeServer() {
    if (this.api.token) { try { await this.api.post('auth/logout'); } catch { /* ignore */ } }
    this.api.token = '';
    SS.set('token', null);
    SS.set('server', null);
    clearInterval(this.pollT);
    this.setState({ auth: 'server', srvIn: this.state.host || '', srvFound: null, srvErr: '', me: null, d: {}, lp: '', code: '', credsErr: '', info: null });
  }

  componentWillUnmount() { window.removeEventListener('resize', this.onResize); clearInterval(this.iv); clearInterval(this.pollT); }

  componentDidUpdate() {
    const r = document.getElementById('admin-root');
    if (r) GSFA.set(r, this.state.lang);
    if (this.state.lang === 'fa') loadVazir(vazirFont);
  }

  async loadMe() {
    const r = await this.api.get('admin/me');
    this.setState({ me: r.me, info: r.server, expires: Date.now() + 1800 * 1000 });
  }

  call = async (method, route, body, query) => {
    const r = method === 'GET' ? await this.api.get(route, query) : await this.api.post(route, body);
    this.setState({ expires: Date.now() + 1800 * 1000 });
    return r;
  };

  signedOut(msg) {
    this.api.token = '';
    SS.set('token', null);
    clearInterval(this.pollT);
    this.setState({ auth: 'login', credsErr: msg || '', me: null, d: {}, lp: '', code: '' });
  }

  async signOut() { try { await this.api.post('auth/logout'); } catch { /* ignore */ } this.signedOut(''); }

  toast(msg, undo) {
    clearTimeout(this.tT);
    this.setState({ toast: { msg, undo } });
    this.tT = setTimeout(() => this.setState({ toast: null }), 3800);
  }

  fail = err => this.toast('✕ ' + (err && err.message ? err.message : String(err)));

  ask(confirm) { this.setState({ confirm, confirmText: '' }); }

  // ---------------------------------------------------------------- navigation + data

  go = (page, extra = {}) => {
    SS.set('page', page === 'user' ? 'users' : page);
    this.setState({ page, sel: {}, pg: 0, ...extra });
    clearInterval(this.pollT);
    this.load(page, extra);
    if (page === 'overview' || page === 'health') this.pollT = setInterval(() => this.load(page), 15000);
  };

  async load(page, extra = {}) {
    const s = { ...this.state, ...extra };
    const put = (k, v) => this.setState(x => ({ d: { ...x.d, [k]: v } }));
    try {
      if (page === 'overview') put('ov', await this.call('GET', 'admin/overview'));
      if (page === 'users') put('users', await this.call('GET', 'admin/users', null, { q: s.q, filt: s.filt, sort: s.sort.k, dir: s.sort.d, page: s.pg }));
      if (page === 'user') put('user', await this.call('GET', 'admin/user', null, { id: s.userId }));
      if (page === 'reports') put('reports', await this.call('GET', 'admin/reports'));
      if (page === 'invites') put('invites', (await this.call('GET', 'admin/invites')).invites);
      if (page === 'chats') put('chats', (await this.call('GET', 'admin/chats')).chats);
      if (page === 'storage') { put('storage', await this.call('GET', 'admin/storage')); if (!this.state.cfg) await this.loadConfig(); }
      if (page === 'audit') put('audit', (await this.call('GET', 'admin/audit', null, { q: s.auQ, type: s.auType })).rows);
      if (page === 'admins') put('admins', await this.call('GET', 'admin/admins'));
      if (page === 'health') put('health', await this.call('GET', 'admin/health'));
      if (page === 'announce') put('anns', (await this.call('GET', 'admin/announcements')).rows);
      if (page === 'twofa') { put('admins', await this.call('GET', 'admin/admins')); await this.loadMe(); }
      if (CONFIG_PAGES.includes(page)) await this.loadConfig();
      if (page !== 'overview' && (!this.state.d.ov || page === 'reports')) put('ov', await this.call('GET', 'admin/overview'));
    } catch (e) { if (!['session_revoked', 'session_expired', 'no_session'].includes(e.code)) this.fail(e); }
  }

  async loadConfig(force) {
    if (this.state.cfg && !force && this.cfgDirty()) return;
    const r = await this.call('GET', 'admin/config');
    const cfg = { server: r.server, db: r.db, storage: r.storage, smtp: r.smtp };
    this.setState({ cfg: clone(cfg), cfgSaved: clone(cfg), d: { ...this.state.d, cfgMeta: r } });
  }

  cfgDirty() { return JSON.stringify(this.state.cfg) !== JSON.stringify(this.state.cfgSaved); }

  setCfg = (sec, k, v) => this.setState(x => ({ cfg: { ...x.cfg, [sec]: { ...x.cfg[sec], [k]: v } } }));

  async saveCfg() {
    const s = this.state, body = {};
    for (const sec of ['server', 'db', 'storage', 'smtp']) if (JSON.stringify(s.cfg[sec]) !== JSON.stringify(s.cfgSaved[sec])) body[sec] = s.cfg[sec];
    try {
      const r = await this.call('POST', 'admin/config', body);
      this.setState({ cfgSaved: clone(s.cfg) });
      const n = r.changed.length;
      this.toast('saved · ' + n + ' setting' + (n === 1 ? '' : 's') + ' changed' + (r.migrated ? ' · ' + Object.values(r.migrated).reduce((x, y) => x + y, 0) + ' rows migrated' : ''));
      this.loadConfig(true);
    } catch (e) { this.fail(e); }
  }

  async runTest(name, body) {
    this.setState(x => ({ tests: { ...x.tests, [name]: { st: 'busy' } } }));
    try {
      const r = this.state.auth === 'wizard' ? await this.api.post('setup/test', { ...body, setupToken: this.state.setupToken }) : await this.call('POST', 'admin/test', body);
      this.setState(x => ({ tests: { ...x.tests, [name]: { st: r.pass ? 'ok' : 'fail', msg: r.msg } } }));
    } catch (e) { this.setState(x => ({ tests: { ...x.tests, [name]: { st: 'fail', msg: '[FAIL] ' + e.message } } })); }
  }

  // ---------------------------------------------------------------- sign-in

  async submitCreds() {
    const s = this.state;
    if (!s.lu || !s.lp) return this.setState({ credsErr: '✕ invalid username or password' });
    this.setState({ busy: true, credsErr: '' });
    try {
      const pre = await this.api.post('auth/prelogin', { id: s.lu });
      const d = await C.derivePassword(s.lp, pre.salt);
      const r = await this.api.post('auth/login', { id: s.lu, auth: b64(d.auth), admin: true });
      if (r.needEnroll) return this.setState({ busy: false, auth: 'enroll', enroll: { secret: r.secret, uri: r.uri, ticket: r.ticket, then: 'login', required: true }, setupCode: '', setupErr: '' });
      if (r.token) return this.signedIn(r);
      this.setState({ busy: false, auth: 'code', ticket: r.ticket, code: '', codeErr: '' });
    } catch (e) { this.setState({ busy: false, credsErr: e.code === 'bad_credentials' ? '✕ invalid username or password' : '✕ ' + e.message }); }
  }

  async submitCode() {
    const s = this.state;
    if (s.code.length !== 6 && !/^[a-z0-9]{4}-[a-z0-9]{4}$/.test(s.code)) return this.setState({ codeErr: '✕ enter all 6 digits' });
    this.setState({ busy: true });
    try {
      const r = await this.api.post('auth/2fa', { ticket: s.ticket, code: s.code, kind: s.code.includes('-') ? 'backup' : 'totp', admin: true, device: 'console' });
      await this.signedIn(r);
    } catch (e) { this.setState({ busy: false, code: '', codeErr: e.code === 'bad_ticket' ? '✕ took too long · start again' : '✕ code rejected — check your device clock' }); }
  }

  async signedIn(r) {
    this.api.token = r.token;
    SS.set('token', r.token);
    this.setState({ busy: false, auth: null, lp: '', code: '', me: { ...r.me } });
    await this.loadMe();
    this.go('overview');
  }

  async submitEnroll() {
    const s = this.state;
    if (s.setupCode.length !== 6) return this.setState({ setupErr: '✕ enter the 6-digit code from your app' });
    try {
      const r = await this.api.post('auth/enroll', { ticket: s.enroll.ticket, code: s.setupCode });
      this.setState({ auth: 'codes', codes: r.backupCodes, setupCode: '' });
    } catch (e) { this.setState({ setupErr: '✕ ' + e.message }); }
  }

  // ---------------------------------------------------------------- wizard

  wzValidate(k) {
    const c = this.state.cfg, o = this.state.owner;
    if (k === 'settings' && !c.server.name.trim()) return 'server name required';
    if (k === 'database' && c.db.engine !== 'sqlite' && (!c.db.host || !c.db.user)) return 'database host and user required';
    if (k === 'storage' && c.storage.backend === 's3' && (!c.storage.bucket || !c.storage.key || !c.storage.secret)) return 'bucket, access key and secret required';
    if (k === 'owner') return !o.user ? 'username required' : !/^[a-z][a-z0-9_]{2,31}$/.test(o.user) ? 'username: 3-32 chars, a-z 0-9 _, starts with a letter' : o.pass.length < 8 ? 'password must be at least 8 characters' : o.pass !== o.pass2 ? 'passwords do not match' : '';
    return '';
  }

  async wzNext() {
    const s = this.state, k = WZSTEPS[s.wz][0], err = this.wzValidate(k);
    if (err) return this.setState({ wzErr: '! ' + err });
    if (k !== 'done') return this.setState(x => ({ wz: x.wz + 1, wzMax: Math.max(x.wzMax, x.wz + 1), wzErr: '' }));
    this.setState({ busy: true, wzErr: '' });
    try {
      const acct = await C.createAccount(s.owner.pass, (s.info && s.info.kdf) || {});
      const r = await this.api.post('setup/launch', { ...s.cfg, setupToken: s.setupToken, owner: { username: s.owner.user, name: s.owner.user, email: s.owner.email, ...acct.payload } });
      this.ownerPhrase = acct.phrase;
      const required = (s.cfg.server.tfaAdmins || 'optional') === 'required';
      this.setState({ busy: false, auth: 'enroll', enroll: { secret: r.secret, uri: r.uri, ticket: r.ticket, then: 'login', phrase: acct.phrase, required }, lu: s.owner.user, info: { ...s.info, installed: true } });
      this.toast('server configured · ' + (required ? 'enroll 2FA for @' : 'set up 2FA (optional) for @') + s.owner.user);
    } catch (e) { this.setState({ busy: false, wzErr: '! ' + e.message }); }
  }

  // ---------------------------------------------------------------- render

  render() {
    const s = this.state;
    const dir = s.lang === 'fa' ? 'rtl' : 'ltr';
    const wide = s.w >= 900;
    const inWizard = s.auth === 'wizard', inShell = !s.auth;
    const pageKey = inWizard ? WZSTEPS[s.wz][0] : s.page;
    const openReports = ((s.d.ov || {}).openReports || []).length;
    const cur = s.page === 'user' ? 'users' : s.page;
    const grp = NAV.find(g => g.items.some(i => i[0] === cur));
    const roleOk = k => !s.me || s.me.role !== 'moderator' || ['overview', 'health', 'audit', 'users', 'reports', 'invites', 'chats', 'storage'].includes(k);
    const navGroups = NAV.map(g => ({ ...g, items: g.items.filter(i => roleOk(i[0])) })).filter(g => g.items.length);
    const left = Math.max(0, Math.floor((s.expires - s.now) / 1000));
    const sessionLeft = String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');
    const info = s.info || {};
    const srvVer = info.version ? 'v' + info.version.replace(/^chats-server /, '') : '';
    const ov = s.d.ov || {};
    return (
      <div id="admin-root" data-theme="amber" dir={dir} lang={s.lang} style={{ '--font-mono': "'JetBrains Mono','Vazirmatn Arabic',ui-monospace,Menlo,monospace", '--font-pixel': "'Silkscreen','Vazirmatn Arabic','VT323',monospace", position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: 'var(--surface-page)', color: 'var(--text-1)', fontFamily: 'var(--font-mono)', fontSize: '13px', lineHeight: 1.45, overflow: 'hidden' }}>
        {s.auth === 'boot' && <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: '12px' }}>░░░ connecting to the server api…</div>}
        {s.auth === 'server' && <ServerStep a={this} />}
        {(s.auth === 'login' || s.auth === 'code') && <Login a={this} />}
        {s.auth === 'token' && <SetupLock a={this} />}
        {(s.auth === 'enroll' || s.auth === 'codes') && <Enroll a={this} />}
        {(inShell || inWizard) && s.cfg !== undefined && <>
          <header style={{ flex: 'none', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', borderBottom: '1px solid var(--border-1)' }}>
            <div style={{ height: '3px', background: 'repeating-linear-gradient(-45deg,var(--accent) 0 6px,transparent 6px 12px)' }} />
            <div style={{ height: '50px', display: 'flex', alignItems: 'center', gap: '12px', padding: '0 14px' }}>
              <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '16px', letterSpacing: '.14em', color: 'var(--accent)', textShadow: 'var(--glow-sm)' }}>CHATS//ADMIN</span>
              <span style={{ padding: '1px 6px', border: '1px solid var(--accent)', fontSize: '10px', letterSpacing: '.14em', color: 'var(--accent)' }}>{inWizard ? 'SETUP' : (s.me && s.me.role === 'moderator' ? 'MOD' : 'ROOT')}</span>
              <span style={{ flex: 1 }} />
              {wide && <span data-no-tr={inShell ? '1' : undefined} style={{ fontSize: '12px', color: 'var(--text-3)' }}>{inWizard ? 'first-run setup · step ' + (s.wz + 1) + ' of ' + WZSTEPS.length : (s.me ? s.me.username : '') + '@' + (info.name || '') + ' · session ' + sessionLeft}</span>}
              <button onClick={() => { const l = s.lang === 'fa' ? 'en' : 'fa'; SS.set('lang', l); this.setState({ lang: l }); }} data-no-tr="1" title="language" class="hv" style={{ height: '30px', padding: '0 10px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{s.lang === 'fa' ? 'EN' : 'فا'}</button>
              <button onClick={() => inWizard ? null : this.signOut()} class="hv" style={{ height: '30px', padding: '0 10px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', whiteSpace: 'nowrap', cursor: inWizard ? 'default' : 'pointer', visibility: inWizard ? 'hidden' : 'visible' }}>sign out</button>
            </div>
          </header>
          {!wide && inShell && (
            <nav style={{ flex: 'none', display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border-faint)', background: 'var(--bg-1)' }}>
              {navGroups.flatMap(g => g.items).map(([k, label]) => (
                <button key={k} onClick={() => this.go(k)} style={{ flex: 'none', height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 0, borderBottom: '2px solid ' + (cur === k ? 'var(--accent)' : 'transparent'), color: cur === k ? 'var(--text-highlight)' : 'var(--text-2)', font: 'inherit', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  {label}{k === 'reports' && openReports ? <span style={{ padding: '0 4px', background: 'var(--err)', color: 'var(--bg-0)', fontSize: '10px', fontWeight: 700 }}>{openReports}</span> : null}
                </button>
              ))}
            </nav>
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {wide && inShell && (
              <aside style={{ flex: 'none', width: '220px', display: 'flex', flexDirection: 'column', gap: '14px', padding: '14px 0', overflow: 'auto', borderInlineEnd: '1px solid var(--border-1)', background: 'var(--bg-1)' }}>
                {navGroups.map(g => (
                  <div key={g.title} style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ padding: '0 14px 6px', fontSize: '10px', letterSpacing: '.16em', color: 'var(--text-3)' }}>{g.title}</span>
                    {g.items.map(([k, label, glyph]) => (
                      <button key={k} onClick={() => this.go(k)} class="hv" style={{ height: '34px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px', background: cur === k ? 'var(--surface-selected)' : 'transparent', border: 0, borderInlineStart: '2px solid ' + (cur === k ? 'var(--accent)' : 'transparent'), color: cur === k ? 'var(--text-highlight)' : 'var(--text-2)', font: 'inherit', fontSize: '13px', textAlign: 'start', cursor: 'pointer' }}>
                        <span style={{ width: '12px', color: 'var(--text-3)' }}>{glyph}</span><span style={{ flex: 1 }}>{label}</span>
                        {k === 'reports' && openReports ? <span style={{ padding: '0 5px', background: 'var(--err)', color: 'var(--bg-0)', fontSize: '10px', fontWeight: 700 }}>{openReports}</span> : null}
                      </button>
                    ))}
                  </div>
                ))}
                <span style={{ flex: 1 }} />
                <a href={REPO} target="_blank" rel="noopener" class="hvacc" style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 14px 0', borderTop: '1px solid var(--border-faint)', fontSize: '11px', color: 'var(--text-3)', textDecoration: 'none' }}>
                  <span>CHATS server {srvVer}</span><span>github.com/UltraNomen/CHATS ↗</span>
                </a>
              </aside>
            )}
            <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
              <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '18px 18px 40px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {inWizard && (
                  <div data-screen-label="Setup stepper" style={{ display: 'flex', overflowX: 'auto', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
                    {WZSTEPS.map(([k, label], i) => (
                      <button key={k} onClick={() => i <= s.wzMax && this.setState({ wz: i, wzErr: '' })} disabled={i > s.wzMax} style={{ flex: 1, minWidth: '92px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '0 10px', background: i === s.wz ? 'var(--accent)' : 'transparent', border: 0, borderInlineEnd: '1px solid var(--border-faint)', color: i === s.wz ? 'var(--accent-ink)' : i <= s.wzMax ? 'var(--text-1)' : 'var(--text-3)', font: 'inherit', fontSize: '12px', whiteSpace: 'nowrap', cursor: i <= s.wzMax ? 'pointer' : 'not-allowed' }}>
                        <span style={{ fontWeight: 700 }}>{i < s.wz ? '✓' : String(i + 1).padStart(2, '0')}</span><span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{inWizard ? 'setup / ' + WZSTEPS[s.wz][1] : 'admin / ' + (grp ? grp.title.toLowerCase() : '') + (s.page === 'user' ? ' / users' : '')}</span>
                    <span data-no-tr={s.page === 'user' && inShell ? '1' : undefined} style={{ fontFamily: 'var(--font-pixel)', fontSize: '20px', letterSpacing: '.1em', color: 'var(--text-highlight)' }}>{s.page === 'user' && inShell && s.d.user ? '@' + s.d.user.user.name : TITLES[pageKey]}</span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{inWizard ? 'step ' + (s.wz + 1) + ' of ' + WZSTEPS.length : pageSub(this, pageKey)}</span>
                </div>
                {inShell && ov.maint && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid var(--warn)', background: 'var(--warn-bg)', color: 'var(--text-highlight)', fontSize: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--warn)' }}>[WARN]</span><span style={{ flex: 1 }}>maintenance mode is ON — clients see the maintenance screen.</span>
                    <button onClick={() => this.go('settings')} style={{ height: '26px', padding: '0 10px', background: 'transparent', border: '1px solid var(--warn)', color: 'var(--warn)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>settings</button>
                  </div>
                )}
                {(s.cfg || !CONFIG_PAGES.includes(pageKey)) && <Pages a={this} pageKey={pageKey} inWizard={inWizard} />}
                {inShell && CONFIG_PAGES.includes(pageKey) && s.cfg && pageKey !== 'announce' && (
                  <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid var(--border-strong)', background: 'var(--bg-1)' }}>
                    <span style={{ flex: 1, fontSize: '12px', color: this.cfgDirty() ? 'var(--warn)' : 'var(--text-3)' }}>{this.cfgDirty() ? '● unsaved changes' : '✓ all changes saved'}</span>
                    <B kind="plain" h={32} disabled={!this.cfgDirty()} onClick={() => this.setState(x => ({ cfg: clone(x.cfgSaved) }))}>revert</B>
                    <B kind="solid" h={32} disabled={!this.cfgDirty()} onClick={() => this.saveCfg()} style={{ padding: '0 14px' }}>save changes</B>
                  </div>
                )}
                {inWizard && (
                  <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', border: '1px solid var(--border-strong)', background: 'var(--bg-1)' }}>
                    <B kind="plain" h={36} disabled={s.wz === 0} onClick={() => this.setState(x => ({ wz: Math.max(0, x.wz - 1), wzErr: '' }))}>← back</B>
                    <span style={{ flex: 1, fontSize: '12px', color: 'var(--err)', textAlign: 'end' }}>{s.wzErr}</span>
                    <B kind="solid" h={36} disabled={s.busy} onClick={() => this.wzNext()} style={{ padding: '0 16px', letterSpacing: '.06em' }}>{s.busy ? 'LAUNCHING…' : s.wz === WZSTEPS.length - 1 ? 'LAUNCH SERVER →' : s.wz === WZSTEPS.length - 2 ? 'REVIEW →' : 'CONTINUE →'}</B>
                  </div>
                )}
              </div>
            </main>
          </div>
          <footer style={{ flex: 'none', height: '24px', display: 'flex', alignItems: 'center', gap: '14px', padding: '0 12px', borderTop: '1px solid var(--border-1)', background: 'var(--bg-1)', fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <span style={{ color: 'var(--ok)' }}>● connected</span>
            <span data-no-tr="1">srv {info.name || ''}</span>
            <span>{srvVer}</span>
            {inShell && <span>{openReports} open reports</span>}
            {inShell && info.uptime != null && <span>uptime {fmtUptime(info.uptime + (s.now / 1000 - (info.time || s.now / 1000))).replace(/ \d+m$/, '')}</span>}
            <span style={{ flex: 1 }} />
            <span>{utcTime(s.now / 1000)} UTC</span>
          </footer>
        </>}
        {s.invNew && <CreateInvite a={this} />}
        {s.confirm && <Confirm a={this} />}
        {s.toast && (
          <div style={{ position: 'absolute', insetInlineEnd: '16px', bottom: '36px', maxWidth: 'calc(100% - 32px)', zIndex: 50, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid var(--border-strong)', background: 'var(--bg-2)', boxShadow: 'var(--glow-md)', fontSize: '12px' }} class="anim">
            <span style={{ color: 'var(--accent)' }}>›</span>
            <span style={{ color: 'var(--text-highlight)' }}>{s.toast.msg}</span>
            {s.toast.undo && <button onClick={() => { const u = s.toast.undo; this.setState({ toast: null }); u(); }} style={{ height: '24px', padding: '0 8px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', font: 'inherit', fontSize: '11px', cursor: 'pointer' }}>undo</button>}
          </div>
        )}
      </div>
    );
  }
}

function pageSub(a, k) {
  const s = a.state, d = s.d;
  return {
    overview: 'live · refreshed ' + utcTime(s.now / 1000), users: d.users ? d.users.counts.all + ' accounts' : '', reports: ((d.ov || {}).openReports || []).length + ' open',
    chats: d.chats ? d.chats.length + ' chats · ids only' : '', audit: 'append-only · 90 day retention', database: 'engine · connection',
  }[k] || '';
}

export const clone = o => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------- login, TOTP enrollment

const card = (max = 380) => ({ width: '100%', maxWidth: max + 'px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-strong)', background: 'var(--surface-panel)', boxShadow: 'var(--glow-md)' });
const stripe = <div style={{ height: '6px', background: 'repeating-linear-gradient(-45deg,var(--accent) 0 8px,transparent 8px 16px)' }} />;
const bigBtn = { height: '42px', background: 'var(--accent)', color: 'var(--accent-ink)', border: '1px solid var(--accent)', font: 'inherit', fontWeight: 700, letterSpacing: '.08em', cursor: 'pointer' };
const loginInput = { height: '40px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', fontSize: '14px', letterSpacing: 0, outline: 'none' };

/** Which server this console talks to, with a way back to the server step. */
function ServerLine({ a }) {
  const s = a.state;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 20px 0', padding: '6px 10px', border: '1px dashed var(--border-1)', fontSize: '12px' }}>
      <span style={{ color: 'var(--ok)' }}>●</span>
      <span data-no-tr="1" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-highlight)' }}>{s.host}</span>
      <button type="button" onClick={() => a.changeServer()} class="hvacc" style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>change</button>
    </div>
  );
}

/** First screen when the console isn't installed next to an API: pick the server and check its key fingerprint. */
function ServerStep({ a }) {
  const s = a.state, f = s.srvFound;
  const recent = LS.get('servers', []);
  const lang = () => { const l = s.lang === 'fa' ? 'en' : 'fa'; SS.set('lang', l); a.setState({ lang: l }); };
  const submit = async e => {
    e.preventDefault();
    if (f) return a.useServer(f);
    const v = s.srvIn.trim();
    if (!v) return a.setState({ srvErr: '✕ enter the address of your CHATS server' });
    a.setState({ srvBusy: true, srvErr: '' });
    try { a.setState({ srvBusy: false, srvFound: await probeServer(v) }); } catch (err) { a.setState({ srvBusy: false, srvErr: '✕ ' + err.message }); }
  };
  const row = (k, v, c) => <div style={{ display: 'flex', gap: '10px', fontSize: '12px' }}><span style={{ width: '84px', flex: 'none', color: 'var(--text-3)' }}>{k}</span><span data-no-tr="1" style={{ flex: 1, minWidth: 0, color: c || 'var(--text-highlight)', wordBreak: 'break-all' }}>{v}</span></div>;
  return (
    <div data-screen-label="Admin server" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: '24px 16px', backgroundImage: 'var(--vignette)' }}>
      <div style={card(420)}>
        {stripe}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '20px 20px 0' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '22px', letterSpacing: '.14em', color: 'var(--accent)', textShadow: 'var(--glow-sm)' }}>CHATS//ADMIN</span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>restricted console · connect to a server</span>
        </div>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', margin: 0 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', letterSpacing: '.1em', color: 'var(--text-2)' }}>SERVER ADDRESS
            <div dir="ltr" style={{ display: 'flex', alignItems: 'center', ...loginInput, padding: 0 }}>
              <span data-no-tr="1" style={{ paddingInlineStart: '10px', fontSize: '13px', color: 'var(--text-3)' }}>{schemeFor(s.srvIn.trim())}</span>
              <input value={s.srvIn} onInput={e => a.setState({ srvIn: e.target.value, srvFound: null, srvErr: '' })} placeholder="chat.example.org" autoComplete="url" autoCapitalize="off" spellcheck={false} autoFocus data-no-tr="1"
                style={{ flex: 1, minWidth: 0, height: '100%', padding: '0 10px 0 2px', background: 'transparent', border: 0, color: 'var(--text-highlight)', font: 'inherit', fontSize: '14px', outline: 'none' }} />
            </div>
          </label>
          {!f && recent.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {recent.map(h => <button type="button" key={h} data-no-tr="1" onClick={() => a.setState({ srvIn: h, srvFound: null, srvErr: '' })} class="hv" style={{ height: '26px', padding: '0 8px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{h}</button>)}
            </div>
          )}
          {f && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px', border: '1px solid ' + (f.fpChanged ? 'var(--err)' : 'var(--border-strong)'), background: 'var(--bg-0)' }}>
              {row('server', f.info.name)}
              {row('address', f.host)}
              {row('version', f.info.version)}
              {row('status', f.info.installed ? 'ready' : 'not set up yet · continue to the setup wizard', f.info.installed ? 'var(--ok)' : 'var(--warn)')}
              {f.info.installed && row('key', f.info.fingerprint, f.fpChanged ? 'var(--err)' : 'var(--text-2)')}
              <span style={{ fontSize: '11px', color: f.fpChanged ? 'var(--err)' : 'var(--text-3)' }}>
                {f.fpChanged ? "✕ this server's key changed since you last connected. if the server wasn't reinstalled, someone may be impersonating it — don't sign in."
                  : f.info.installed ? '// compare the key with the one your server shows under health, or in the chat app\'s server info' : '// only continue if you are setting up this server'}
              </span>
            </div>
          )}
          <span style={{ fontSize: '12px', color: 'var(--err)', minHeight: '17px' }}>{s.srvBusy ? <span style={{ color: 'var(--text-3)' }}>░░░ connecting…</span> : s.srvErr}</span>
          <button type="submit" class="hvg" disabled={s.srvBusy} style={{ ...bigBtn, ...(f && f.fpChanged ? { background: 'var(--err)', borderColor: 'var(--err)', color: 'var(--bg-0)' } : {}) }}>
            {!f ? 'CONNECT →' : f.fpChanged ? 'TRUST NEW KEY & CONTINUE' : 'CONTINUE TO ' + (f.info.name || f.host).toUpperCase() + ' →'}
          </button>
          <button type="button" onClick={lang} data-no-tr="1" class="hvacc" style={{ alignSelf: 'center', padding: 0, background: 'none', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{s.lang === 'fa' ? 'English' : 'فارسی'}</button>
        </form>
      </div>
    </div>
  );
}

/** Shown on a fresh install that is locked with CHATS_SETUP_TOKEN (opening /admin/?setup=TOKEN skips it). */
function SetupLock({ a }) {
  const s = a.state;
  const unlock = async () => {
    const t = (s.tokenIn || '').trim();
    if (!t) return a.setState({ credsErr: '✕ paste the setup token' });
    a.setState({ busy: true, credsErr: '' });
    try {
      const r = await a.api.post('setup/unlock', { setupToken: t });
      const cfg = applyPreset(a.state.cfg, r.preset);
      a.setState({ busy: false, setupToken: t, auth: 'wizard', tokenIn: '', preset: r.preset || {}, cfg, cfgSaved: clone(cfg) });
    } catch (e) { a.setState({ busy: false, credsErr: e.code === 'setup_token' ? '✕ wrong setup token' : '✕ ' + e.message }); }
  };
  return (
    <div data-screen-label="Setup locked" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: '24px 16px', backgroundImage: 'var(--vignette)' }}>
      <div style={card()}>
        {stripe}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '20px 20px 0' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '22px', letterSpacing: '.14em', color: 'var(--accent)', textShadow: 'var(--glow-sm)' }}>CHATS//SETUP</span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>first-run setup · <span data-no-tr="1">{(s.info || {}).name || s.host}</span> · locked</span>
        </div>
        <ServerLine a={a} />
        <form onSubmit={e => { e.preventDefault(); unlock(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', margin: 0 }}>
          <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>this server is waiting to be set up. enter the setup token from <span data-no-tr="1" style={{ color: 'var(--text-highlight)' }}>CHATS_SETUP_TOKEN</span> (in api/config.local.php or the server environment).</span>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', letterSpacing: '.1em', color: 'var(--text-2)' }}>SETUP TOKEN
            <input value={s.tokenIn || ''} onInput={e => a.setState({ tokenIn: e.target.value, credsErr: '' })} autoComplete="off" autoCapitalize="off" spellcheck={false} autoFocus data-no-tr="1" style={loginInput} />
          </label>
          <span style={{ fontSize: '12px', color: 'var(--err)', minHeight: '17px' }}>{s.busy ? <span style={{ color: 'var(--text-3)' }}>░░░ checking…</span> : s.credsErr}</span>
          <button type="submit" class="hvg" disabled={s.busy} style={bigBtn}>UNLOCK SETUP →</button>
        </form>
      </div>
    </div>
  );
}

function Login({ a }) {
  const s = a.state;
  const tick = 30 - (Math.floor(s.now / 1000) % 30);
  const bar = n => '█'.repeat(Math.round(n / 30 * 15)) + '░'.repeat(15 - Math.round(n / 30 * 15));
  const lang = () => { const l = s.lang === 'fa' ? 'en' : 'fa'; SS.set('lang', l); a.setState({ lang: l }); };
  return (
    <div data-screen-label="Admin login" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: '24px 16px', backgroundImage: 'var(--vignette)' }}>
      <div style={card()}>
        {stripe}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '20px 20px 0' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '22px', letterSpacing: '.14em', color: 'var(--accent)', textShadow: 'var(--glow-sm)' }}>CHATS//ADMIN</span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>restricted console · <span data-no-tr="1">{(s.info || {}).name || s.host}</span> · all actions are logged</span>
        </div>
        <ServerLine a={a} />
        {s.auth === 'login' ? (
          <form onSubmit={e => { e.preventDefault(); a.submitCreds(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', margin: 0 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', letterSpacing: '.1em', color: 'var(--text-2)' }}>USERNAME
              <input value={s.lu} onInput={e => a.setState({ lu: e.target.value.replace(/\s/g, '').toLowerCase(), credsErr: '' })} autoComplete="username" autoCapitalize="off" data-no-tr="1" style={loginInput} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px', letterSpacing: '.1em', color: 'var(--text-2)' }}>PASSWORD
              <input type="password" value={s.lp} onInput={e => a.setState({ lp: e.target.value, credsErr: '' })} placeholder="••••••••" autoComplete="current-password" style={loginInput} />
            </label>
            <span style={{ fontSize: '12px', color: 'var(--err)', minHeight: '17px' }}>{s.busy ? <span style={{ color: 'var(--text-3)' }}>░░░ deriving keys…</span> : s.credsErr}</span>
            <button type="submit" class="hvg" disabled={s.busy} style={bigBtn}>CONTINUE →</button>
            <button type="button" onClick={lang} data-no-tr="1" class="hvacc" style={{ alignSelf: 'center', padding: 0, background: 'none', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{s.lang === 'fa' ? 'English' : 'فارسی'}</button>
          </form>
        ) : (
          <form onSubmit={e => { e.preventDefault(); a.submitCode(); }} style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px', margin: 0 }}>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>step 2 of 2 · enter the 6-digit code from your authenticator for <span data-no-tr="1" style={{ color: 'var(--text-highlight)' }}>{s.lu}</span></span>
            <input value={s.code} onInput={e => a.setState({ code: /[a-z-]/i.test(e.target.value) ? e.target.value.toLowerCase().slice(0, 9) : e.target.value.replace(/\D/g, '').slice(0, 6), codeErr: '' })} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus data-no-tr="1"
              style={{ height: '56px', padding: '0 12px', background: 'var(--surface-input)', border: '1px solid var(--border-strong)', color: 'var(--text-highlight)', fontSize: '28px', letterSpacing: '.5em', textAlign: 'center', outline: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-3)' }}><span style={{ letterSpacing: '-1px', color: 'var(--accent)' }}>{bar(tick)}</span><span>rotates in {tick}s</span></div>
            <span style={{ fontSize: '12px', color: 'var(--err)', minHeight: '17px' }}>{s.codeErr}</span>
            <button type="submit" class="hvg" disabled={s.busy} style={bigBtn}>VERIFY</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}>
              <button type="button" onClick={() => a.setState({ auth: 'login', code: '', codeErr: '' })} style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-3)', font: 'inherit', cursor: 'pointer' }}>← back</button>
              <span style={{ color: 'var(--text-3)' }}>lost your device? use a backup code</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Enroll({ a }) {
  const s = a.state, en = s.enroll || {};
  const qr = en.uri ? qrMatrix(en.uri) : null;
  if (s.auth === 'codes') {
    return (
      <div data-screen-label="Backup codes" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: '24px 16px', backgroundImage: 'var(--vignette)' }}>
        <div style={card(480)}>
          {stripe}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '18px 20px' }}>
            <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '16px', letterSpacing: '.12em', color: 'var(--accent)' }}>{(s.codes || []).length ? '2FA ENABLED' : 'SERVER READY'}</span>
            {(s.codes || []).length ? <>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>save these 8 backup codes. each one signs you in once if you lose your authenticator.</span>
              <div data-no-tr="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', padding: '10px', border: '1px dashed var(--border-strong)', background: 'var(--bg-0)' }}>
                {(s.codes || []).map((c, i) => <span key={c} style={{ fontSize: '13px', letterSpacing: '.08em', color: 'var(--text-highlight)' }}><span style={{ color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</span> {c}</span>)}
              </div>
            </> : <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>two-factor is off for @{s.lu}. you can turn it on any time under two-factor.</span>}
            {en.phrase && <>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>your chat account's recovery phrase (also in the app under privacy & security):</span>
              <div data-no-tr="1" style={{ padding: '10px', border: '1px dashed var(--border-1)', background: 'var(--bg-0)', fontSize: '13px', color: 'var(--text-highlight)', lineHeight: 1.6 }}>{en.phrase.map((w, i) => (i + 1) + '.' + w).join('  ')}</div>
            </>}
            <div style={{ display: 'flex', gap: '8px' }}>
              {(s.codes || []).length > 0 && <B kind="accent" h={36} onClick={() => { navigator.clipboard.writeText((s.codes || []).join('\n')).catch(() => {}); a.setState({ codesCopied: true }); }}>{s.codesCopied ? '✓ copied' : 'copy codes'}</B>}
              <button onClick={() => en.then === 'shell' ? a.setState({ auth: null, enroll: null }) : a.setState({ auth: 'login', enroll: null, lp: '', credsErr: '', codes: null })} class="hvg" style={{ ...bigBtn, flex: 1, height: '36px' }}>{en.then === 'shell' ? 'BACK TO CONSOLE' : 'SIGN IN →'}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div data-screen-label="TOTP setup" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', placeItems: 'center', padding: '24px 16px', backgroundImage: 'var(--vignette)' }}>
      <div style={card(560)}>
        {stripe}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '18px 20px', borderBottom: '1px solid var(--border-faint)' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '16px', letterSpacing: '.12em', color: 'var(--accent)' }}>SET UP TWO-FACTOR</span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{en.required ? 'required for every admin account' : en.then === 'shell' ? 'protects your console sign-in' : 'optional · recommended for admin accounts'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px' }}>
          <div style={{ flex: 'none', padding: '12px', border: '1px solid var(--border-1)', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }}>
            <div style={{ '--accent': 'var(--bg-0)' }}>{qr && <QrGrid cells={qr.cells} n={qr.n} size={200} />}</div>
          </div>
          <div style={{ flex: 1, minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-2)' }}>
              <span><span style={{ color: 'var(--accent)' }}>01</span> scan with any TOTP app</span>
              <span><span style={{ color: 'var(--accent)' }}>02</span> or enter the secret manually</span>
              <span><span style={{ color: 'var(--accent)' }}>03</span> type the code it shows</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px dashed var(--border-1)' }}>
              <span data-no-tr="1" style={{ flex: 1, minWidth: 0, fontSize: '14px', letterSpacing: '.12em', color: 'var(--text-highlight)', wordBreak: 'break-all' }}>{en.secret}</span>
              <button onClick={() => { navigator.clipboard.writeText((en.secret || '').replace(/\s/g, '')).catch(() => {}); a.setState({ secretCopied: true }); setTimeout(() => a.setState({ secretCopied: false }), 1500); }} class="hv" style={{ height: '28px', padding: '0 10px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{s.secretCopied ? '✓ copied' : 'copy'}</button>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>otpauth · SHA1 · 6 digits · 30s period</span>
            <input value={s.setupCode} onInput={e => a.setState({ setupCode: e.target.value.replace(/\D/g, '').slice(0, 6), setupErr: '' })} inputMode="numeric" placeholder="000000" autoComplete="one-time-code" data-no-tr="1"
              onKeyDown={e => { if (e.key === 'Enter') a.submitEnroll(); }}
              style={{ height: '48px', padding: '0 12px', background: 'var(--surface-input)', border: '1px solid var(--border-strong)', color: 'var(--text-highlight)', fontSize: '22px', letterSpacing: '.45em', textAlign: 'center', outline: 'none' }} />
            <span style={{ fontSize: '12px', color: 'var(--err)', minHeight: '17px' }}>{s.setupErr}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => en.then === 'shell' ? a.setState({ auth: null, enroll: null }) : en.phrase && !en.required ? a.setState({ auth: 'codes', codes: [], setupCode: '' }) : a.setState({ auth: 'login', enroll: null })} class="hv" style={{ flex: 1, height: '40px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', cursor: 'pointer' }}>{en.phrase && !en.required ? 'skip for now' : 'cancel'}</button>
              <button onClick={() => a.submitEnroll()} style={{ ...bigBtn, flex: 2, height: '40px' }}>ENABLE 2FA</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- modals

function CreateInvite({ a }) {
  const s = a.state, inv = s.invNew;
  const setInv = (k, v) => a.setState(x => ({ invNew: { ...x.invNew, [k]: v } }));
  const close = () => a.setState({ invNew: null });
  const link = inv.code ? inviteUrl(a.api, inv.code, s.info) : '';
  const chips = (k, opts) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {opts.map(([v, l]) => { const on = inv[k] === v; return <button key={v} onClick={() => setInv(k, v)} style={{ height: '30px', padding: '0 10px', background: on ? 'var(--accent)' : 'transparent', border: '1px solid var(--border-1)', color: on ? 'var(--accent-ink)' : 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{l}</button>; })}
    </div>
  );
  const generate = async () => {
    try {
      const r = await a.call('POST', 'admin/invite', { label: inv.label, uses: inv.uses, exp: inv.exp, quota: inv.quota, approve: inv.approve, preview: inv.preview });
      setInv('code', r.code);
      a.load('invites');
    } catch (e) { a.fail(e); }
  };
  const meta = (inv.uses === '0' ? 'unlimited uses' : inv.uses + ' use' + (inv.uses === '1' ? '' : 's')) + ' · ' + (inv.exp === 'never' ? 'never expires' : 'expires in ' + inv.exp) + (inv.approve ? ' · needs approval' : '');
  const flagRow = (label, hint, k) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border-faint)' }}>
      <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-highlight)' }}>{label}</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{hint}</span></div>
      <div style={{ display: 'flex' }}>{[[true, 'on'], [false, 'off']].map(([v, l]) => { const on = inv[k] === v; return <button key={l} onClick={() => setInv(k, v)} style={{ height: '28px', padding: '0 10px', marginInlineStart: '-1px', background: on ? 'var(--accent)' : 'transparent', border: '1px solid var(--border-1)', color: on ? 'var(--accent-ink)' : 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{l}</button>; })}</div>
    </div>
  );
  const copy = (t, k) => { navigator.clipboard.writeText(t).catch(() => {}); setInv('copied', k); };
  return <>
    <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'var(--surface-overlay)', zIndex: 40 }} />
    <div data-screen-label="Create invite" class="anim" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'calc(100% - 32px)', maxWidth: '460px', maxHeight: 'calc(100% - 32px)', overflow: 'auto', zIndex: 41, display: 'flex', flexDirection: 'column', border: '1px dashed var(--border-strong)', background: 'var(--surface-panel)', boxShadow: 'var(--glow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '14px', letterSpacing: '.12em', color: 'var(--accent)' }}>{inv.code ? 'INVITE READY' : 'NEW INVITE'}</span>
        <button onClick={close} style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '16px', cursor: 'pointer' }}>×</button>
      </div>
      {!inv.code ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>LABEL (ADMIN ONLY)
            <input value={inv.label} onInput={e => setInv('label', e.target.value)} placeholder="e.g. design team, conference" data-no-tr="1" style={{ height: '36px', padding: '0 10px', background: 'var(--surface-input)', border: '1px dashed var(--border-1)', color: 'var(--text-highlight)', fontSize: '13px', letterSpacing: 0, outline: 'none' }} />
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>MAX USES</span>{chips('uses', [['1', '1'], ['5', '5'], ['10', '10'], ['50', '50'], ['0', '∞']])}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>EXPIRES</span>{chips('exp', [['24h', '24h'], ['7d', '7 days'], ['30d', '30 days'], ['never', 'never']])}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>STORAGE QUOTA FOR NEW ACCOUNTS</span>{chips('quota', [['default', 'server default'], ['512', '512 MB'], ['1024', '1 GB'], ['4096', '4 GB']])}</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {flagRow('admin approval', 'new accounts wait for approval before they can chat', 'approve')}
            {flagRow('show in invite link preview', 'link preview shows server name and welcome message', 'preview')}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={close} class="hv" style={{ flex: 1, height: '38px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', cursor: 'pointer' }}>cancel</button>
            <button onClick={generate} style={{ flex: 2, height: '38px', background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>generate code</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>[ OK ] invite created · {meta}</span>
          <span data-no-tr="1" style={{ padding: '14px', border: '1px solid var(--border-strong)', background: 'var(--bg-0)', fontSize: '22px', letterSpacing: '.14em', textAlign: 'center', color: 'var(--text-highlight)', textShadow: 'var(--text-glow)' }}>{inv.code}</span>
          <span data-no-tr="1" style={{ fontSize: '12px', color: 'var(--text-2)', wordBreak: 'break-all' }}>{link}</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => copy(inv.code, 'code')} style={{ flex: 1, height: '36px', background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{inv.copied === 'code' ? '✓ code copied' : 'copy code'}</button>
            <button onClick={() => copy(link, 'link')} style={{ flex: 1, height: '36px', background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', font: 'inherit', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>{inv.copied === 'link' ? '✓ link copied' : 'copy link'}</button>
          </div>
          <button onClick={close} style={{ height: '32px', background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>done</button>
        </div>
      )}
    </div>
  </>;
}

function Confirm({ a }) {
  const s = a.state, cf = s.confirm;
  const ok = s.confirmText.trim() === cf.word;
  const run = () => { if (!ok) return; a.setState({ confirm: null }); cf.run(); };
  return <>
    <div onClick={() => a.setState({ confirm: null })} style={{ position: 'absolute', inset: 0, background: 'var(--surface-overlay)', zIndex: 40 }} />
    <div data-screen-label="Typed confirm" class="anim" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'calc(100% - 32px)', maxWidth: '420px', zIndex: 41, display: 'flex', flexDirection: 'column', border: '1px solid var(--err)', background: 'var(--surface-panel)', boxShadow: '0 0 24px rgba(255,80,80,.25)' }}>
      <div style={{ height: '4px', background: 'repeating-linear-gradient(-45deg,var(--err) 0 6px,transparent 6px 12px)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '16px' }}>
        <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '14px', letterSpacing: '.1em', color: 'var(--err)' }}>{cf.title}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-1)' }}>{cf.body}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>type <span data-no-tr="1" style={{ padding: '0 4px', background: 'var(--bg-0)', color: 'var(--text-highlight)' }}>{cf.word}</span> to confirm</span>
        <input value={s.confirmText} onInput={e => a.setState({ confirmText: e.target.value })} onKeyDown={e => e.key === 'Enter' && run()} autoFocus data-no-tr="1" style={{ height: '38px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--err)', color: 'var(--text-highlight)', outline: 'none' }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => a.setState({ confirm: null })} class="hv" style={{ flex: 1, height: '36px', background: 'transparent', border: '1px solid var(--border-1)', color: 'var(--text-1)', font: 'inherit', cursor: 'pointer' }}>cancel</button>
          <button onClick={run} disabled={!ok} style={{ flex: 1, height: '36px', background: ok ? 'var(--err)' : 'transparent', border: '1px solid var(--err)', color: ok ? 'var(--bg-0)' : 'var(--err)', font: 'inherit', fontWeight: 700, cursor: ok ? 'pointer' : 'not-allowed' }}>{cf.label}</button>
        </div>
      </div>
    </div>
  </>;
}
