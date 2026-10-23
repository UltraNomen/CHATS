// Onboarding: connect → welcome → log in / sign up → profile → recovery phrase · forgot password · two-factor step.
import { Button, IconButton, Icon } from '#shared/ui/ds.jsx';
import { Field, Box, Inp, Steps, Log, WordGrid, S, Chips } from '#shared/ui/kit.jsx';
import { WORDS } from '#shared/core/crypto.js';
import { LS } from './engine.js';
import { schemeFor } from '#shared/core/api.js';
import { LOCKED_SERVER } from '#shared/core/build.js';

const STEPS = ['server', 'account', 'profile', 'phrase'];
const pxTitle = { flex: 1, fontFamily: 'var(--font-pixel)', fontSize: '18px', letterSpacing: '.12em', color: 'var(--accent)', textShadow: 'var(--text-glow)' };
const form = (pad = '16px 20px 24px', gap = '18px') => ({ display: 'flex', flexDirection: 'column', gap, padding: pad, margin: 0 });
const big = { fontFamily: 'var(--font-pixel)', lineHeight: 1.1, letterSpacing: '.08em', color: 'var(--accent)', textShadow: 'var(--text-glow-strong)' };

function Head({ title, label, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginInlineStart: onBack ? '-8px' : 0, minHeight: onBack ? undefined : '40px' }}>
      {onBack && <IconButton variant="ghost" label="back" onClick={onBack}><Icon name="arrow-left" /></IconButton>}
      <span style={pxTitle}>{title}</span>
      <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{label}</span>
    </div>
  );
}

const Err = ({ msg }) => msg ? <span style={S.err}>! {msg}</span> : null;

export function AuthView({ a }) {
  const s = a.state;
  const view = s.auth === 'server' ? <ServerStep a={a} /> : s.auth === 'welcome' ? <Welcome a={a} /> : s.auth === 'login' || s.auth === 'signup' ? <Creds a={a} />
    : s.auth === 'profile' ? <Profile a={a} /> : s.auth === 'phrase' ? <Phrase a={a} /> : s.auth === 'forgot' ? <Forgot a={a} /> : s.auth === '2fa' ? <TwoFactor a={a} /> : null;
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', backgroundImage: 'var(--vignette)' }}>
      <div style={{ width: '100%', maxWidth: '380px', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-md)', background: 'var(--surface-panel)' }}>{view}</div>
    </div>
  );
}

function ServerStep({ a }) {
  const s = a.state, e = a.eng;
  const sf = s.serverFound;
  const host = (s.serverUrl || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
  const submit = async ev => {
    ev.preventDefault();
    if (sf) {
      e.useServer(sf);
      return a.set({ auth: 'welcome', serverFound: null, authErr: '' });
    }
    if (!host) return a.set({ serverErr: 'not a valid address · try chat.example.org' });
    a.set({ serverBusy: true, serverErr: '' });
    try { a.set({ serverBusy: false, serverFound: await e.probe(s.serverUrl) }); } catch (err) { a.set({ serverBusy: false, serverErr: err.message }); }
  };
  return (
    <form data-screen-label="Server" onSubmit={submit} style={form('24px 20px')}>
      <Log lines={[['[ OK ]', 'booting CHATS v2.1...'], ['[ -- ]', 'no server configured', 'var(--warn)']]} />
      <Steps steps={STEPS} cur={0} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ ...big, fontSize: '32px' }}>CONNECT /</div>
        <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-2)', textWrap: 'pretty' }}>enter the address of your chat server. ask whoever invited you.</div>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>me@chats:~$ <span style={{ color: 'var(--text-1)' }}>connect --server</span></span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '44px', padding: '0 10px', border: '1px dashed var(--border-2)', background: 'var(--surface-input)' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-3)' }}>{schemeFor(s.serverUrl.trim())}</span>
          <Inp value={s.serverUrl} readOnly={!!LOCKED_SERVER} onInput={ev => a.set({ serverUrl: ev.target.value, serverFound: null, serverErr: '' })} placeholder="chat.example.org" autoCapitalize="off" autoCorrect="off" spellCheck={false} data-no-tr="1" />
        </div>
      </label>
      {s.serverBusy || LOCKED_SERVER || !e.s.recent.length ? null : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>recent ›</span>
          {e.s.recent.map(h => <button type="button" key={h} data-no-tr="1" onClick={() => a.set({ serverUrl: h, serverFound: null, serverErr: '' })} class="hvb" style={{ height: '28px', padding: '0 10px', border: '1px solid var(--border-faint)', background: 'transparent', color: 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{h}</button>)}
        </div>
      )}
      <Err msg={s.serverErr} />
      {s.serverBusy && <Log lines={[['[ .. ]', 'resolving ' + host], ['[ .. ]', 'tls handshake']]} />}
      {sf && <ServerCard sf={sf} />}
      <Button variant="primary" type="submit" block>{sf ? 'Continue to ' + sf.info.name.split('.')[0] : s.serverBusy ? 'connecting...' : 'Connect'}</Button>
    </form>
  );
}

function ServerCard({ sf }) {
  const i = sf.info;
  return (
    <div data-screen-label="Server card" style={{ display: 'flex', flexDirection: 'column', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderBottom: '1px solid var(--border-faint)' }}>
        <div style={{ flex: 'none', width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-pixel)', fontSize: '14px', color: 'var(--accent)' }}>{(i.name[0] || '?').toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span data-no-tr="1" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{i.name.split('.')[0]}</span>
          <span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--text-3)', ...S.ell }}>{sf.host}{/:\d+/.test(sf.host) ? '' : ':443'}</span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--accent)' }}>● online</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', padding: '12px', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-3)' }}>version</span><span style={{ color: 'var(--text-1)' }}>{i.version}</span>
        <span style={{ color: 'var(--text-3)' }}>signup</span><span style={{ color: 'var(--text-1)' }}>{i.signup === 'invite' ? 'invite only' : i.signup}</span>
        <span style={{ color: 'var(--text-3)' }}>welcome</span><span data-no-tr="1" style={{ color: 'var(--text-1)', textWrap: 'pretty' }}>{i.welcome}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', borderTop: '1px solid var(--border-faint)', background: 'var(--surface-raised)' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// FINGERPRINT · SHA-256 · compare with your admin</span>
        <span style={{ fontSize: '12px', letterSpacing: '.04em', color: sf.fpChanged ? 'var(--warn)' : 'var(--accent)', wordBreak: 'break-all' }}>{i.fingerprint}</span>
        {sf.fpChanged && <span style={{ fontSize: '11px', color: 'var(--warn)' }}>[WARN] fingerprint changed since your last visit · ask your admin before continuing</span>}
      </div>
    </div>
  );
}

function Welcome({ a }) {
  const s = a.state, srv = a.eng.s.server;
  const closed = srv && srv.info.signup === 'closed';
  return (
    <div data-screen-label="Welcome" style={{ display: 'flex', flexDirection: 'column', gap: '24px', padding: '28px 20px 24px' }}>
      <Log lines={[['[ OK ]', 'booting CHATS v2.1...'], ['[ OK ]', 'connected to ' + (srv ? srv.host : '')], ['[ OK ]', 'waiting for session_']]} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ ...big, fontSize: '40px' }}>HELLO /</div>
        <div data-no-tr="1" style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-2)', textWrap: 'pretty' }}>{srv ? srv.info.welcome : ''}</div>
      </div>
      {!LOCKED_SERVER && <button type="button" onClick={() => a.set({ auth: 'server', serverFound: null, serverUrl: srv ? srv.host : '' })} class="hvb" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', height: '28px', padding: '0 10px', border: '1px solid var(--border-faint)', background: 'transparent', color: 'var(--text-2)', font: 'inherit', fontSize: '11px', cursor: 'pointer' }}>
        <span style={{ color: 'var(--accent)' }}>●</span> <span data-no-tr="1">{srv ? srv.host : ''}</span> · change
      </button>}
      {s.authErr && <Err msg={s.authErr} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Button variant="primary" block onClick={() => a.set({ auth: 'login', authErr: '', forgotStep: 'words' })}>Log in</Button>
        <Button variant="outline" block disabled={closed} onClick={() => a.set({ auth: 'signup', authErr: '', authNotice: '' })}>{closed ? 'sign-up closed on this server' : 'create account'}</Button>
      </div>
    </div>
  );
}

function Creds({ a }) {
  const s = a.state, e = a.eng, info = e.s.server ? e.s.server.info : {};
  const su = s.auth === 'signup';
  const fields = info.fields || {};
  const methods = [['username', 'text', 'neo']].concat(fields.email !== 'off' ? [['email', 'email', 'neo@mail.net']] : []).concat(fields.phone !== 'off' ? [['phone', 'tel', '+1 555 0142']] : []);
  const m = su ? methods[0] : methods.find(x => x[0] === s.authMethod) || methods[0];
  const needInvite = su && info.signup === 'invite';
  const submit = async ev => {
    ev.preventDefault();
    const id = s.authId.trim();
    if (!id || !s.authPw) return a.set({ authErr: 'missing ' + (!id ? m[0] : 'password') });
    if (s.authPw.length < 6) return a.set({ authErr: 'password needs 6+ chars' });
    if (su) {
      const u = id.toLowerCase().replace(/^@/, '');
      if (needInvite && !s.invite.trim()) return a.set({ authErr: 'this server needs an invite code' });
      a.set({ authBusy: true, authErr: '' });
      try {
        const r = await e.checkUsername(u);
        if (!r.valid) throw new Error('username: 3-32 chars, a-z 0-9 _, starts with a letter');
        if (!r.free) throw new Error('username taken');
        return a.set({ authBusy: false, auth: 'profile', signupPw: s.authPw, prof: { ...s.prof, username: u } });
      } catch (err) { return a.set({ authBusy: false, authErr: err.message }); }
    }
    a.set({ authBusy: true, authErr: '', authNotice: '' });
    try {
      const r = await e.login(m[0], id, s.authPw);
      if (r.need2fa) return a.set({ authBusy: false, auth: '2fa', tfa: { ticket: r.ticket, methods: r.methods, kind: 'totp', code: '', remember: false, rememberDays: r.remember, err: '' } });
      a.set({ auth: null, authBusy: false, authPw: '', left: 'list', right: null });
      afterSignIn(a);
    } catch (err) { a.set({ authBusy: false, authErr: err.message }); }
  };
  return (
    <form data-screen-label="Login" onSubmit={submit} style={form()}>
      <Head title={su ? 'SIGN UP' : 'LOG IN'} label={su ? 'step 2/4' : ''} onBack={() => a.set({ auth: 'welcome', authErr: '', authNotice: '' })} />
      {su && <Steps steps={STEPS} cur={1} />}
      {s.authNotice && <span style={S.ok}>[ OK ] {s.authNotice}</span>}
      {!su && methods.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>// sign in with</span>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${methods.length},minmax(0,1fr))`, gap: '4px' }}>
            {methods.map(([k]) => {
              const on = m[0] === k;
              return <button type="button" key={k} onClick={() => a.set({ authMethod: k, authId: '', authErr: '' })} class={on ? '' : 'hvc'} style={{ height: '36px', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-faint)'), background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{k}</button>;
            })}
          </div>
        </div>
      )}
      <Field cmd={su ? 'useradd --username' : 'login --' + m[0]}>
        <Inp type={m[1]} value={s.authId} onInput={ev => a.set({ authId: ev.target.value, authErr: '' })} placeholder={m[2]} autoCapitalize="off" autoComplete={su ? 'username' : 'username'} spellCheck={false} data-no-tr="1" />
      </Field>
      <Field cmd="passwd">
        <Inp type={s.showPw ? 'text' : 'password'} value={s.authPw} onInput={ev => a.set({ authPw: ev.target.value, authErr: '' })} placeholder="••••••••" autoComplete={su ? 'new-password' : 'current-password'} />
        <button type="button" onClick={() => a.set({ showPw: !s.showPw })} class="hvt" style={{ background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '11px', cursor: 'pointer', padding: '4px 0' }}>[{s.showPw ? 'hide' : 'show'}]</button>
      </Field>
      {su && (needInvite || s.invite) && (
        <Field cmd="join --invite" glyph="#">
          <Inp value={s.invite} onInput={ev => a.set({ invite: ev.target.value.toUpperCase(), authErr: '' })} placeholder="GRN-XXXX-XXXX" autoCapitalize="characters" spellCheck={false} data-no-tr="1" />
        </Field>
      )}
      {su && <span style={S.hint}>// your password unlocks your keys on this device. the server never sees it.</span>}
      <Err msg={s.authErr} />
      {s.authBusy && <span style={S.ok}>{su ? '[ .. ] checking username...' : '[ OK ] authenticating...'}</span>}
      <Button variant="primary" type="submit" block disabled={s.authBusy}>{su ? 'Continue' : 'Log in'}</Button>
      {!su && <button type="button" onClick={() => a.set({ auth: 'forgot', forgotStep: 'words', forgotUser: s.authMethod === 'username' ? s.authId : '', authErr: '', authNotice: '', slots: ['', '', '', '', '', '', '', ''], slotFocus: 0 })} class="hvt" style={{ marginTop: '-8px', background: 'transparent', border: 0, color: 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px' }}>forgot password? use recovery phrase</button>}
      <button type="button" onClick={() => a.set({ auth: su ? 'login' : 'signup', authErr: '', authNotice: '' })} class="hvt" style={{ background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{su ? 'have an account? log in' : 'no account? create one'}</button>
    </form>
  );
}

export function afterSignIn(a) {
  if (a.state.prefs.notify) a.eng.subscribePush().catch(() => {});
  if (a.pendingJoin) a.tryJoin();
  if (a.pendingOpen) { a.openChat(a.pendingOpen); a.pendingOpen = null; }
}

function Profile({ a }) {
  const s = a.state, e = a.eng, info = e.s.server.info, p = s.prof;
  const fileRef = { current: null };
  const setP = k => ev => a.set({ prof: { ...p, [k]: ev.target.value }, authErr: '' });
  const submit = async ev => {
    ev.preventDefault();
    if (!p.name.trim() || !p.username.trim()) return a.set({ authErr: 'name and username required' });
    const f = info.fields || {};
    if (f.email === 'required' && !p.email.trim()) return a.set({ authErr: 'email is required on this server' });
    if (f.phone === 'required' && !p.phone.trim()) return a.set({ authErr: 'phone is required on this server' });
    a.set({ authBusy: true, authErr: '' });
    try {
      const r = await e.signup({ username: p.username.trim().toLowerCase(), password: s.signupPw, name: p.name.trim(), email: p.email.trim(), phone: p.phone.trim(), invite: s.invite.trim(), avatar: p.avatar });
      a.set({ authBusy: false, auth: r.pending ? 'welcome' : 'phrase', phrase: r.phrase, phraseSaved: false, phraseDl: false, phraseCopied: false, signupPw: '', authPw: '' });
    } catch (err) {
      const back = ['username_taken', 'bad_username', 'bad_invite', 'signup_closed'].includes(err.code);
      a.set({ authBusy: false, authErr: err.message, ...(back ? { auth: 'signup' } : {}) });
    }
  };
  return (
    <form data-screen-label="Onboarding profile" onSubmit={submit} style={form()}>
      <Head title="WHOAMI" label="step 3/4" onBack={() => a.set({ auth: 'signup', authErr: '' })} />
      <Steps steps={STEPS} cur={2} />
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {p.avatarUrl
          ? <div class="phos" style={{ flex: 'none', width: '72px', height: '72px', border: '1px solid var(--border-strong)', boxShadow: 'var(--glow-sm)' }}><img src={p.avatarUrl} alt="" /></div>
          : <div data-no-tr="1" style={{ flex: 'none', width: '72px', height: '72px', display: 'grid', placeItems: 'center', border: '1px dashed var(--border-2)', background: 'var(--surface-raised)', fontFamily: 'var(--font-pixel)', fontSize: '22px', color: 'var(--accent)' }}>{initialsOf(p.name || p.username)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Button variant="outline" size="sm" onClick={() => fileRef.current && fileRef.current.click()}>upload photo</Button>
          <span style={S.hint}>// optional. rendered in phosphor.</span>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={fileRef} style={{ display: 'none' }}
          onChange={ev => { const f = ev.target.files[0]; if (f) a.set({ prof: { ...p, avatar: f, avatarUrl: URL.createObjectURL(f) } }); ev.target.value = ''; }} />
      </div>
      <Field cmd="whoami --name"><Inp value={p.name} onInput={setP('name')} placeholder="your name" maxLength={80} data-no-tr="1" /></Field>
      <Field cmd="set --username" glyph="@"><Inp value={p.username} onInput={setP('username')} placeholder="handle" autoCapitalize="off" spellCheck={false} data-no-tr="1" /></Field>
      {info.fields && info.fields.email !== 'off' && <Field cmd={'set --email' + (info.fields.email === 'optional' ? ' (optional)' : '')}><Inp type="email" value={p.email} onInput={setP('email')} placeholder="you@example.com" data-no-tr="1" /></Field>}
      {info.fields && info.fields.phone !== 'off' && <Field cmd={'set --phone' + (info.fields.phone === 'optional' ? ' (optional)' : '')}><Inp type="tel" value={p.phone} onInput={setP('phone')} placeholder="+1 555 0142" data-no-tr="1" /></Field>}
      <Err msg={s.authErr} />
      {s.authBusy && <span style={S.ok}>[ .. ] generating keys · this takes a few seconds...</span>}
      <Button variant="primary" type="submit" block disabled={s.authBusy}>Continue</Button>
    </form>
  );
}

export const initialsOf = n => { n = n || '?'; const r = n.split(/[\s._-]+/).filter(Boolean).map(w => [...w][0]).join('').slice(0, 2); return (r.length < 2 ? n.replace(/[\s._-]/g, '').slice(0, 2) : r).toUpperCase(); };

export function downloadPhrase(words, host, username) {
  const txt = 'CHATS · recovery phrase\nserver:  ' + host + '\naccount: @' + username + '\ncreated: ' + new Date().toISOString().slice(0, 10) + '\n\n' + words.map((w, i) => String(i + 1).padStart(2, ' ') + '. ' + w).join('\n') + '\n\nkeep this offline. anyone with these words can reset your password.\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'chats-recovery-' + username + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function copyText(t) { try { navigator.clipboard.writeText(t); } catch { /* insecure context */ } }

function Phrase({ a }) {
  const s = a.state, e = a.eng;
  const words = s.phrase || [];
  return (
    <div data-screen-label="Recovery phrase" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px 20px 24px' }}>
      <Head title="RECOVERY" label="step 4/4" />
      <Steps steps={STEPS} cur={3} />
      <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-2)', textWrap: 'pretty' }}>these 8 words are the only way back in if you forget your password. the server can't reset it for you. write them down or save the file offline.</span>
      <WordGrid words={words} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Button variant="outline" block onClick={() => { copyText(words.join(' ')); a.set({ phraseCopied: true }); setTimeout(() => a.set({ phraseCopied: false }), 1400); }}>{s.phraseCopied ? '[ OK ] copied' : 'copy'}</Button>
        <Button variant="outline" block onClick={() => { downloadPhrase(words, e.s.server.host, e.s.me ? e.s.me.username : s.prof.username); a.set({ phraseDl: true }); }}>{s.phraseDl ? '✓ saved .txt' : '↓ download .txt'}</Button>
      </div>
      <button type="button" onClick={() => a.set({ phraseSaved: !s.phraseSaved })} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: '1px dashed ' + (s.phraseSaved ? 'var(--accent)' : 'var(--border-1)'), background: 'transparent', color: 'var(--text-1)', font: 'inherit', fontSize: '13px', lineHeight: 1.5, textAlign: 'start', cursor: 'pointer' }}>
        <span style={{ flex: 'none', color: 'var(--accent)' }}>{s.phraseSaved ? '[x]' : '[ ]'}</span>
        <span>i saved these words somewhere safe. i understand they can't be shown again without my password.</span>
      </button>
      <Button variant="primary" block disabled={!s.phraseSaved} onClick={() => { a.set({ auth: null, left: 'list', right: null, phrase: null }); afterSignIn(a); }}>Enter</Button>
    </div>
  );
}

function Forgot({ a }) {
  const s = a.state, e = a.eng;
  const sq = (s.slots[s.slotFocus] || '').toLowerCase();
  const sugg = sq ? WORDS.filter(w => w.startsWith(sq) && w !== sq).slice(0, 4) : [];
  const setSlot = (i, v) => { const arr = s.slots.slice(); arr[i] = v; a.set({ slots: arr, authErr: '' }); };
  const onSlot = i => ev => {
    const raw = ev.target.value.toLowerCase();
    const parts = raw.trim().split(/\s+/);
    if (parts.length > 1) { const arr = s.slots.slice(); parts.slice(0, 8 - i).forEach((p, j) => { arr[i + j] = p.replace(/[^a-z]/g, ''); }); return a.set({ slots: arr, authErr: '' }); }
    setSlot(i, raw.replace(/[^a-z]/g, ''));
  };
  const words = s.forgotStep === 'words';
  const submit = async ev => {
    ev.preventDefault();
    if (words) {
      if (!s.forgotUser.trim()) return a.set({ authErr: 'enter your username' });
      const bad = s.slots.findIndex(w => !WORDS.includes(w));
      if (bad >= 0) return a.set({ authErr: s.slots[bad] ? 'word ' + (bad + 1) + " isn't in the wordlist" : 'enter all 8 words · word ' + (bad + 1) + ' is empty' });
      a.set({ authBusy: true, authErr: '' });
      try { a.set({ authBusy: false, forgotStep: 'pw', recovery: await e.recoverVerify(s.forgotUser.trim().toLowerCase().replace(/^@/, ''), s.slots) }); } catch (err) { a.set({ authBusy: false, authErr: err.message }); }
      return;
    }
    if (s.newPw.length < 6) return a.set({ authErr: 'password needs 6+ chars' });
    if (s.newPw !== s.newPw2) return a.set({ authErr: 'passwords differ' });
    a.set({ authBusy: true, authErr: '' });
    try {
      const r = await e.resetPassword(s.recovery, s.newPw);
      const cleared = { newPw: '', newPw2: '', forgotStep: 'words', slots: ['', '', '', '', '', '', '', ''], recovery: null };
      if (r.need2fa) return a.set({ ...cleared, authBusy: false, auth: '2fa', authNotice: 'password changed · other devices were signed out',
        tfa: { ticket: r.ticket, methods: r.methods, kind: 'totp', code: '', remember: false, rememberDays: r.remember, err: '' } });
      a.set({ auth: null, authBusy: false, ...cleared, left: 'list', right: null,
        toast: { glyph: '⚿', text: 'password reset', sub: 'other devices were signed out' } });
      afterSignIn(a);
    } catch (err) { a.set({ authBusy: false, authErr: err.message }); }
  };
  return (
    <form data-screen-label="Forgot password" onSubmit={submit} style={form('16px 20px 24px', '16px')}>
      <Head title="RECOVER" label={words ? '1/2 phrase' : '2/2 password'} onBack={() => a.set({ auth: 'login', authErr: '' })} />
      {words ? <>
        <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-2)', textWrap: 'pretty' }}>enter your username and the 8 words you saved at signup, in order.</span>
        <Field cmd="recover --user" glyph="@"><Inp value={s.forgotUser} onInput={ev => a.set({ forgotUser: ev.target.value, authErr: '' })} placeholder="handle" autoCapitalize="off" data-no-tr="1" /></Field>
        <div data-no-tr="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '4px' }}>
          {s.slots.map((value, i) => {
            const ok = WORDS.includes(value), bad = !!value && !ok && !WORDS.some(w => w.startsWith(value)), foc = s.slotFocus === i;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 10px', border: '1px ' + (foc ? 'solid' : 'dashed') + ' ' + (bad ? 'var(--err)' : foc ? 'var(--accent)' : ok ? 'var(--border-1)' : 'var(--border-faint)'), background: 'var(--surface-input)' }}>
                <span style={{ width: '16px', fontSize: '11px', color: 'var(--text-3)' }}>{i + 1}</span>
                <Inp value={value} onInput={onSlot(i)} onFocus={() => a.set({ slotFocus: i })} placeholder="····" autoCapitalize="off" autoComplete="off" spellCheck={false}
                  onKeyDown={ev => { if ((ev.key === 'Tab' || ev.key === 'Enter') && sugg.length && s.slotFocus === i && !ok) { ev.preventDefault(); setSlot(i, sugg[0]); } }} />
                <span style={{ fontSize: '11px', color: ok ? 'var(--accent)' : 'var(--err)' }}>{ok ? '✓' : bad ? '!' : ''}</span>
              </div>
            );
          })}
        </div>
        {sugg.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>tab ›</span>
            {sugg.map((w, i) => <button type="button" key={w} data-no-tr="1" onClick={() => setSlot(s.slotFocus, w)} class="hva" style={{ height: '28px', padding: '0 10px', border: '1px solid ' + (i === 0 ? 'var(--accent)' : 'var(--border-faint)'), background: i === 0 ? 'var(--surface-hover)' : 'transparent', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{w}</button>)}
          </div>
        )}
      </> : <>
        <span style={S.ok}>[ OK ] phrase verified for @{s.forgotUser}</span>
        <Field cmd="passwd --new"><Inp type="password" value={s.newPw} onInput={ev => a.set({ newPw: ev.target.value, authErr: '' })} placeholder="6+ chars" autoComplete="new-password" /></Field>
        <Field cmd="passwd --confirm"><Inp type="password" value={s.newPw2} onInput={ev => a.set({ newPw2: ev.target.value, authErr: '' })} placeholder="again" autoComplete="new-password" /></Field>
        <span style={S.hint}>// other devices will be signed out. your phrase stays the same.</span>
      </>}
      <Err msg={s.authErr} />
      {s.authBusy && <span style={S.ok}>[ .. ] verifying...</span>}
      <Button variant="primary" type="submit" block disabled={s.authBusy}>{words ? 'Verify phrase' : 'Set new password'}</Button>
    </form>
  );
}

function TwoFactor({ a }) {
  const s = a.state, t = s.tfa || {}, e = a.eng;
  const setT = patch => a.set({ tfa: { ...t, ...patch } });
  const labels = { totp: 'authenticator', backup: 'backup code', email: 'email code' };
  const submit = async ev => {
    ev.preventDefault();
    const code = t.code.trim();
    if (t.kind !== 'backup' && !/^\d{6}$/.test(code)) return setT({ err: 'enter all 6 digits' });
    a.set({ authBusy: true });
    try {
      await e.verify2fa(t.ticket, t.kind, code, t.remember);
      a.set({ auth: null, authBusy: false, tfa: null, authPw: '', left: 'list', right: null });
      afterSignIn(a);
    } catch (err) { a.set({ authBusy: false, tfa: { ...t, err: err.code === 'bad_ticket' ? 'took too long · log in again' : err.message, code: '' } }); }
  };
  const sendMail = async () => { try { const r = await e.sendEmailCode(t.ticket); setT({ sent: r.sent, err: '' }); } catch (err) { setT({ err: err.message }); } };
  return (
    <form data-screen-label="Two-factor" onSubmit={submit} style={form()}>
      <Head title="VERIFY" label="step 2 of 2" onBack={() => a.set({ auth: 'login', tfa: null })} />
      <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-2)' }}>{t.kind === 'backup' ? 'enter one of your 8 backup codes. each works once.' : t.kind === 'email' ? 'we sent a 6-digit code to your email.' : 'enter the 6-digit code from your authenticator app.'}</span>
      {(t.methods || []).length > 1 && <Chips opts={t.methods.map(k => [k, labels[k]])} value={t.kind} onPick={k => { setT({ kind: k, code: '', err: '' }); if (k === 'email' && !t.sent) sendMail(); }} />}
      <input value={t.code} onInput={ev => setT({ code: t.kind === 'backup' ? ev.target.value.toLowerCase().slice(0, 9) : ev.target.value.replace(/\D/g, '').slice(0, 6), err: '' })}
        inputMode={t.kind === 'backup' ? 'text' : 'numeric'} autoComplete="one-time-code" placeholder={t.kind === 'backup' ? 'xxxx-xxxx' : '000000'} autoFocus data-no-tr="1"
        style={{ height: '56px', padding: '0 12px', background: 'var(--surface-input)', border: '1px dashed var(--border-strong)', color: 'var(--text-highlight)', fontSize: '28px', letterSpacing: t.kind === 'backup' ? '.2em' : '.5em', textAlign: 'center', outline: 'none' }} />
      {t.kind === 'email' && t.sent && <span style={S.hint}>// sent to {t.sent} · <button type="button" onClick={sendMail} style={{ padding: 0, background: 'none', border: 0, color: 'var(--accent)', font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>send again</button></span>}
      {t.rememberDays > 0 && (
        <button type="button" onClick={() => setT({ remember: !t.remember })} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: 0, border: 0, background: 'transparent', color: 'var(--text-2)', font: 'inherit', fontSize: '12px', textAlign: 'start', cursor: 'pointer' }}>
          <span style={{ color: 'var(--accent)' }}>{t.remember ? '[x]' : '[ ]'}</span> trust this device for {t.rememberDays} days
        </button>
      )}
      <Err msg={t.err} />
      {s.authBusy && <span style={S.ok}>[ .. ] verifying...</span>}
      <Button variant="primary" type="submit" block disabled={s.authBusy}>Verify</Button>
    </form>
  );
}

export { LS };
