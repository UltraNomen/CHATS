// Everything drawn above the panes: menus, sheets, status screens, app lock, boot.
import { Button, IconButton, Icon } from '#shared/ui/ds.jsx';
import { Box, Inp, Field, Chips, WordGrid, QrGrid, S, U, Log } from '#shared/ui/kit.jsx';
import { fmtSize, fmtUptime, hm, ini } from '#shared/core/format.js';
import { qrMatrix } from '#shared/core/qr.js';
import { msgPreview } from './engine.js';
import { decorate, person, chatList } from './view.js';
import { downloadPhrase, copyText } from './Auth.jsx';
import { CUR_VER } from './engine.js';
import { LOCKED_SERVER } from '#shared/core/build.js';

const fixedSheet = (z, extra) => ({ position: 'absolute', left: '8px', right: '8px', bottom: '36px', maxWidth: '400px', margin: '0 auto', zIndex: z, display: 'flex', flexDirection: 'column',
  background: 'var(--surface-panel)', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-md)', ...extra });
const Head = ({ title, meta, color }) => <div style={S.sheetHead}><span style={{ ...S.pixHead, color: color || 'var(--accent)' }}>{title}</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{meta}</span></div>;

export function Overlays({ a }) {
  const s = a.state, es = a.eng.s;
  return <>
    {s.menu && <Menu a={a} />}
    {s.keysOpen && <Keys a={a} />}
    {s.preview && <Preview a={a} />}
    {s.installOpen && <Install a={a} />}
    {s.editContact && <EditContact a={a} />}
    {s.share && es.me && <Share a={a} />}
    {s.report && <Report a={a} />}
    {s.phv && <PhraseView a={a} />}
    {s.serverCard && es.me && <ServerInfo a={a} />}
    {(s.mfa || es.mfaRequired) && es.me && <Mfa a={a} />}
    {s.toast && !s.booting && <Toast a={a} />}
    {es.status && <Status a={a} />}
    {s.pinMode && !s.booting && <Lock a={a} />}
    {s.booting && <Boot a={a} />}
  </>;
}

// ---------------------------------------------------------------- keyboard shortcuts

export const KEY_ROWS = [['j / ↓', 'next chat'], ['k / ↑', 'previous chat'], ['i / enter', 'focus composer'], ['esc', 'leave input · close menus'],
  ['p', 'cycle pinned messages'], ['g', 'go to chat list'], ['n', 'new group'], ['?', 'toggle this sheet']];

function Keys({ a }) {
  const close = () => a.set({ keysOpen: false });
  return (
    <div onClick={close} style={{ position: 'absolute', inset: 0, zIndex: 60, display: 'grid', placeItems: 'center', padding: '16px', background: 'rgba(2,4,2,.8)' }}>
      <div data-screen-label="Keyboard shortcuts" onClick={ev => ev.stopPropagation()} class="anim" style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', background: 'var(--surface-panel)', border: '1px solid var(--border-strong)', boxShadow: 'var(--glow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}>
          <span style={{ flex: 1, fontFamily: 'var(--font-pixel)', fontSize: '16px', letterSpacing: '.12em', color: 'var(--accent)', textShadow: 'var(--text-glow)' }}>KEYS</span>
          <button onClick={close} aria-label="close" class="hva" style={{ width: '28px', height: '28px', padding: 0, background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '14px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 14px', padding: '12px', fontSize: '13px' }}>
          {KEY_ROWS.map(([k, d]) => [
            <span key={k} data-no-tr="1" style={{ justifySelf: 'start', padding: '1px 6px', border: '1px solid var(--border-1)', background: 'var(--surface-raised)', color: 'var(--accent)', fontSize: '12px' }}>{k}</span>,
            <span key={k + 'd'} style={{ color: 'var(--text-1)' }}>{d}</span>,
          ])}
        </div>
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-faint)', fontSize: '11px', color: 'var(--text-3)' }}>// shortcuts are off while typing. esc to leave the input.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- options menu

function Menu({ a }) {
  const s = a.state, e = a.eng, mn = s.menu, caps = (e.s.config || {}).caps || {}, me = e.s.me;
  const close = () => a.set({ menu: null });
  const confirm = k => a.set({ menu: { ...mn, confirm: k || true } });
  const it = (glyph, label, onClick, danger) => ({ glyph, label, onClick, danger });
  const act = (fn, after) => async () => { close(); try { await fn(); after && after(); } catch (err) { a.toast('!', err.message, ''); } };
  let title = '', items = [];
  if (mn.type === 'msg') {
    const msg = (e.s.msgs[mn.chat] || []).find(x => x.id === mn.id);
    if (!msg) return null;
    const b = msg.body || {};
    const win = caps.editWindow;
    const editable = mn.mine && caps.edit !== false && (b.t === 'text' || b.t === 'image' || b.t === 'file') && (win === 'always' || !win || Date.now() / 1000 - msg.at < +win * 60) && !msg.hidden;
    title = mn.confirm ? 'delete message? [ y / n ]' : '// message';
    if (mn.confirm) items = [it('y', 'delete', act(() => e.deleteMessage(msg)), true), it('n', 'cancel', close)];
    else {
      items = [it('↩', 'reply', () => a.set({ menu: null, replyId: msg.id, editId: null }))];
      items.push(it('⚲', e.isPinned(msg.chat, msg.id) ? 'unpin' : 'pin', act(() => e.togglePin(msg.chat, msg.id))));
      if (caps.forward !== false && !msg.hidden && !b.undecryptable) items.push(it('↪', 'forward', () => a.set({ menu: null, fwd: msg })));
      if ((b.t === 'image' || b.t === 'file') && b.f) { const st = e.s.files[b.f.id] || {}; items.push(it('↓', st.pct != null && !st.done ? 'downloading ' + st.pct + '%' : st.saved ? 'saved ✓' : 'download', act(() => e.saveFile(b.f)))); }
      if (b.t === 'text' && !msg.hidden) items.push(it('⧉', 'copy text', () => { copyText(b.text); close(); }));
      if (caps.report !== false && !mn.mine) items.push(it('⚑', 'report', () => a.set({ menu: null, report: { msg, reason: null, note: '', done: false } }), true));
      if (editable) items.push(it('✎', 'edit', () => a.set({ menu: null, replyId: null, editId: msg.id, draft: b.t === 'text' ? b.text : (b.cap || ''), attachOpen: false })));
      if (mn.mine && caps.delete !== false) items.push(it('×', 'delete', () => confirm(), true));
    }
  } else if (mn.type === 'chat') {
    const c = e.s.chats[mn.id];
    if (!c) return null;
    const grp = c.type === 'group', d = decorate(a, c);
    if (mn.confirm === 'clear') { title = 'clear history? [ y / n ]'; items = [it('y', 'clear', act(() => e.clearChat(c.id)), true), it('n', 'cancel', close)]; }
    else if (mn.confirm === 'delete') { title = (grp ? 'leave group' : 'delete chat') + '? [ y / n ]'; items = [it('y', grp ? 'leave' : 'delete', act(() => e.leaveChat(c.id), () => a.set({ right: null, activeId: null })), true), it('n', 'cancel', close)]; }
    else {
      title = '// ' + d.title;
      items = [
        it('i', grp ? 'group info' : 'view profile', () => { close(); a.openPeer(grp ? c.id : c.peer); }),
        it('/', 'search', () => a.set({ menu: null, chatSearchOpen: true, chatQuery: '' })),
        it(c.muted ? '♪' : '–', c.muted ? 'unmute' : 'mute', act(() => e.muteChat(c.id, !c.muted))),
      ];
      if (grp) items.push(it('+', 'add people', () => a.set({ menu: null, inviteOpen: true, inviteSel: {}, copied: false, inviteGroup: c.id })));
      items.push(it('░', 'clear history', () => confirm('clear'), true), it('×', grp ? 'leave group' : 'delete chat', () => confirm('delete'), true));
    }
  } else {
    const p = person(a, mn.id);
    title = mn.confirm ? 'delete ' + p.name + '? [ y / n ]' : '// @' + p.username;
    items = mn.confirm ? [it('y', 'delete contact', act(() => e.deleteContact(mn.id), () => a.set(x => ({ right: x.right === 'info' && x.peerId === mn.id ? null : x.right }))), true), it('n', 'cancel', close)]
      : [it('✎', 'edit contact', () => a.set({ menu: null, editContact: { id: mn.id, name: p.name, phone: (e.contacts()[mn.id] || {}).phone || p.phone || '' } })), it('×', 'delete contact', () => confirm(), true)];
  }
  const h = 30 + items.length * 40, fw = mn.fw || 400;
  return <>
    <div onClick={close} style={{ position: 'absolute', inset: 0, zIndex: 44 }} />
    <div data-screen-label="Options menu" class="anim" style={{ position: 'absolute', left: Math.max(8, Math.min(mn.x, fw - 188)) + 'px', top: (mn.up ? Math.max(8, mn.btnTop - h - 4) : mn.y) + 'px', zIndex: 45, width: '180px', background: 'var(--surface-panel)', border: '1px solid var(--border-strong)', boxShadow: 'var(--glow-md)' }}>
      <div data-no-tr={mn.type !== 'msg' ? '1' : undefined} style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--text-3)', borderBottom: '1px solid var(--border-faint)', ...S.ell }}>{title}</div>
      {items.map(o => (
        <button key={o.label} onClick={o.onClick} class={o.danger ? 'hve' : 'hva'} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', height: '40px', padding: '0 10px', background: 'transparent', border: 0, color: o.danger ? 'var(--err)' : 'var(--text-1)', font: 'inherit', fontSize: '13px', textAlign: 'start', cursor: 'pointer' }}>
          <span style={{ width: '16px', textAlign: 'center' }}>{o.glyph}</span><span>{o.label}</span>
        </button>
      ))}
    </div>
  </>;
}

// ---------------------------------------------------------------- photo preview

function Preview({ a }) {
  const s = a.state, e = a.eng, caps = (e.s.config || {}).caps || {};
  const list = (e.s.msgs[s.preview.chat] || []).filter(m => m.body && m.body.t === 'image' && !m.deleted && !m.hidden);
  const pos = list.findIndex(m => m.id === s.preview.id);
  const m = list[pos];
  if (!m) return null;
  const f = m.body.f, st = e.s.files[f.id] || {};
  if (!st.done && st.pct == null) e.fetchFile(f).catch(() => {});
  const busy = st.pct != null && !st.done;
  const go = d => { const n = list[pos + d]; if (n) a.set({ preview: { ...s.preview, id: n.id } }); };
  return (
    <div data-screen-label="Photo preview" style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', background: 'var(--surface-page)' }}>
      <header style={S.hdr}>
        <IconButton variant="ghost" label="close preview" onClick={() => a.set({ preview: null })}><Icon name="close" /></IconButton>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <U style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)', ...S.ell }}>{f.n}</U>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}><U>{m.from === e.s.me.id ? 'you' : e.displayName(m.from)}</U> · {hm(m.at)}</span>
        </div>
        <span style={{ flex: 'none', fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>{pos + 1} / {list.length}</span>
      </header>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '16px 8px', backgroundImage: 'var(--vignette)' }}>
        <IconButton variant="ghost" label="previous photo" disabled={pos <= 0} onClick={() => go(-1)}><Icon name="arrow-left" /></IconButton>
        <div style={{ position: 'relative', flex: 1, minWidth: 0, height: '100%', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, margin: 'auto', width: 'min(100%, 720px, calc((100dvh - 200px) * 4 / 3))', maxHeight: '100%', aspectRatio: '4/3', border: '1px solid var(--border-strong)', boxShadow: 'var(--glow-md)', backgroundColor: 'var(--bg-1)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px', display: 'grid', placeItems: 'center' }}>
            {st.url ? <img src={st.url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} /> : <span style={{ fontSize: '12px', color: st.error ? 'var(--err)' : 'var(--text-3)' }}>{st.error ? '! ' + st.error : '░░░ decrypting ' + (st.pct || 0) + '%'}</span>}
          </div>
        </div>
        <IconButton variant="ghost" label="next photo" disabled={pos >= list.length - 1} onClick={() => go(1)}><Icon name="arrow-right" /></IconButton>
      </div>
      {busy && <div style={{ height: '2px', background: 'var(--border-faint)' }}><div style={{ height: '2px', width: st.pct + '%', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} /></div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '53px', boxSizing: 'border-box', padding: '0 12px', borderTop: '1px solid var(--border-faint)' }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-3)', ...S.ell }}>{fmtSize(f.s)}{f.w ? ' · ' + f.w + '×' + f.h : ''}{busy ? ' · ' + st.pct + '%' : st.saved ? ' · saved' : ''}</span>
        {caps.forward !== false && <Button variant="ghost" size="sm" onClick={() => a.set({ preview: null, fwd: m })}>↪ forward</Button>}
        <Button variant="primary" size="sm" onClick={() => e.saveFile(f).catch(() => {})}>{busy ? st.pct + '%' : st.saved ? '✓ saved' : 'Download'}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- install guide

function Install({ a }) {
  const s = a.state, srv = a.eng.s.server || {};
  const steps = {
    android: [['open in chrome, then tap install below', '↓'], ['or use ⋮ menu › install app', '⋮'], ['CHATS lands in your app drawer', '⊞']],
    ios: [["open this page in safari · other browsers can't install", '◎'], ['tap share in the toolbar', '⎋'], ['scroll down › add to home screen', '⊞'], ['tap add · open CHATS from your home screen', '✓']],
    desktop: [['click install below, or ⊕ in the address bar', '⊕'], ['CHATS opens in its own window', '▭'], ['pin it to your dock or taskbar', '↓']],
  }[s.installTab];
  const doInstall = async () => {
    if (!a.bip) return a.set({ install: 'nobip' });
    a.set({ install: 'busy' });
    a.bip.prompt();
    const r = await a.bip.userChoice.catch(() => ({}));
    a.bip = null;
    a.set({ install: r.outcome === 'accepted' ? 'done' : 'idle' });
  };
  const close = () => a.set({ installOpen: false, install: s.install === 'nobip' ? 'idle' : s.install });
  const disabled = s.install === 'busy' || s.install === 'done' || s.installTab === 'ios';
  return <>
    <div onClick={close} style={S.overlay(46)} />
    <div data-screen-label="Install app" class="anim" style={fixedSheet(47)}>
      <Head title="INSTALL APP" meta="pwa · ~2 MB" />
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderBottom: '1px solid var(--border-faint)' }}>
        <img src="icons/icon-192.png" alt="CHATS app icon" width="52" height="52" style={{ flex: 'none', display: 'block', border: '1px solid var(--border-1)' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>CHATS</span>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}><U>{srv.host}</U> · offline-ready · push · own window</span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderBottom: '1px solid var(--border-faint)' }}>
        {[['android', 'android'], ['ios', 'iphone / ipad'], ['desktop', 'desktop']].map(([k, label]) => {
          const on = s.installTab === k;
          return <button key={k} onClick={() => a.set({ installTab: k })} class={on ? '' : 'hvc'} style={{ height: '36px', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-2)', border: 0, font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{label}</button>;
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 12px' }}>
        {steps.map(([text, glyph], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', lineHeight: 1.5 }}>
            <span style={{ flex: 'none', width: '22px', height: '22px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-strong)', fontSize: '11px', color: 'var(--accent)' }}>{i + 1}</span>
            <span style={{ flex: 1, color: 'var(--text-1)', textWrap: 'pretty' }}>{text}</span>
            <span style={{ flex: 'none', minWidth: '28px', height: '22px', padding: '0 4px', display: 'grid', placeItems: 'center', border: '1px dashed var(--border-1)', fontSize: '13px', color: 'var(--accent)' }}>{glyph}</span>
          </div>
        ))}
        {s.install === 'done' && <span style={S.ok}>[ OK ] added to home screen</span>}
        {s.install === 'nobip' && <span style={{ fontSize: '12px', color: 'var(--warn)' }}>[WARN] this browser didn't offer an install prompt · use its menu, or it's already installed</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 12px 14px' }}>
        <Button variant="ghost" block onClick={close}>{s.install === 'done' ? 'close' : 'cancel'}</Button>
        <Button variant="primary" block disabled={disabled} onClick={doInstall}>{s.install === 'busy' ? 'installing...' : s.install === 'done' ? '✓ installed' : s.installTab === 'ios' ? 'use safari menu' : 'Install'}</Button>
      </div>
    </div>
  </>;
}

// ---------------------------------------------------------------- edit contact

function EditContact({ a }) {
  const s = a.state, ec = s.editContact, p = person(a, ec.id);
  const save = async ev => {
    ev.preventDefault();
    if (!ec.name.trim()) return;
    a.set({ editContact: null });
    try { await a.eng.editContact(ec.id, ec.name.trim() === p.realName ? '' : ec.name.trim(), ec.phone.trim()); } catch (err) { a.toast('!', err.message, ''); }
  };
  return <>
    <div onClick={() => a.set({ editContact: null })} style={S.overlay(46)} />
    <form data-screen-label="Edit contact" onSubmit={save} class="anim" style={fixedSheet(47, { gap: '14px', padding: '0 0 14px' })}>
      <Head title="EDIT CONTACT" meta={<U>@{p.username}</U>} />
      <Field cmd="alias --name" h={40} style={{ padding: '0 12px' }}><Inp value={ec.name} onInput={ev => a.set({ editContact: { ...ec, name: ev.target.value } })} data-no-tr="1" /></Field>
      <Field cmd="set --phone" h={40} style={{ padding: '0 12px' }}><Inp type="tel" value={ec.phone} onInput={ev => a.set({ editContact: { ...ec, phone: ev.target.value } })} placeholder="unknown" data-no-tr="1" /></Field>
      <span style={{ ...S.hint, padding: '0 12px', marginTop: '-6px' }}>// stored encrypted in your contacts · only you see it</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '0 12px' }}>
        <Button variant="ghost" block onClick={() => a.set({ editContact: null })}>cancel</Button>
        <Button variant="primary" type="submit" block>Save</Button>
      </div>
    </form>
  </>;
}

// ---------------------------------------------------------------- share target

function Share({ a }) {
  const s = a.state, e = a.eng, sh = s.share;
  const setSh = patch => a.set({ share: { ...sh, ...patch } });
  const targets = chatList(a).filter(c => c.title.toLowerCase().includes((sh.q || '').toLowerCase()));
  const sel = Object.keys(sh.sel).filter(k => sh.sel[k]);
  const total = sh.files.reduce((n, f) => n + f.size, 0);
  const send = async () => {
    if (!sel.length) return;
    const files = sh.files.map(f => new File([f.data], f.name, { type: f.type }));
    a.set({ share: null });
    for (const id of sel) {
      for (const f of files) { try { await e.sendFile(id, f, /^image\//.test(f.type) ? 'image' : 'file'); } catch (err) { a.handleSendError(err); } }
      if ((sh.caption || '').trim()) await e.sendText(id, sh.caption.trim()).catch(() => {});
    }
    a.set({ toast: { glyph: '↪', text: 'shared ' + (files.length ? files.length + ' file' + (files.length > 1 ? 's' : '') : 'text'), sub: 'to ' + sel.length + ' chat' + (sel.length > 1 ? 's' : '') } });
    a.openChat(sel[0]);
  };
  return (
    <div data-screen-label="Share target" style={{ position: 'absolute', inset: '0 0 28px 0', zIndex: 42, display: 'flex', justifyContent: 'center', background: 'var(--surface-page)' }}>
      <div style={{ width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--surface-panel)', borderInlineStart: '1px solid var(--border-faint)', borderInlineEnd: '1px solid var(--border-faint)' }}>
        <header style={S.hdr}>
          <IconButton variant="ghost" label="cancel share" onClick={() => a.set({ share: null })}><Icon name="close" /></IconButton>
          <div style={S.title}>SHARE TO</div>
          <span style={{ fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>{sel.length} selected</span>
        </header>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', borderBottom: '1px solid var(--border-faint)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
          <span style={S.sec}>// INCOMING · {sh.files.length} files · {fmtSize(total)}</span>
          {sh.files.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
              {sh.files.map((f, i) => (
                <div key={i} style={{ flex: 'none', width: '112px', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
                  {/^image\//.test(f.type) && f.url
                    ? <div class="phos" style={{ height: '76px', borderBottom: '1px solid var(--border-faint)' }}><img src={f.url} alt="" /></div>
                    : <div style={{ height: '76px', display: 'grid', placeItems: 'center', borderBottom: '1px solid var(--border-faint)', color: 'var(--accent)' }}><Icon name="file" size={24} /></div>}
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '4px 6px' }}>
                    <U style={{ fontSize: '11px', color: 'var(--text-1)', ...S.ell }}>{f.name}</U>
                    <span style={{ fontSize: '10px', color: 'var(--text-3)' }}>{fmtSize(f.size)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Box h={36} border="var(--border-1)"><Inp value={sh.caption} onInput={ev => setSh({ caption: ev.target.value })} placeholder="add a caption_" data-no-tr="1" /></Box>
        </div>
        <Box glyph="/" h={36} border="var(--border-1)" style={{ margin: '10px 12px' }}><Inp value={sh.q} onInput={ev => setSh({ q: ev.target.value })} placeholder="find chat..." data-no-tr="1" /></Box>
        <div style={S.scroll}>
          {targets.map(c => (
            <div key={c.id} onClick={() => setSh({ sel: { ...sh.sel, [c.id]: !sh.sel[c.id] } })} class="hv" style={{ ...S.row, padding: '10px 12px', background: sh.sel[c.id] ? 'var(--surface-selected)' : 'transparent' }}>
              <span style={{ flex: 'none', fontSize: '14px', color: 'var(--accent)' }}>{sh.sel[c.id] ? '[x]' : '[ ]'}</span>
              <div data-no-tr="1" style={{ flex: 'none', width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', background: 'var(--surface-raised)', fontFamily: 'var(--font-pixel)', fontSize: '11px', color: 'var(--accent)' }}>{c.initials}</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <U style={{ fontSize: '14px', color: 'var(--text-1)', ...S.ell }}>{c.title}</U>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{c.status}</span>
              </div>
            </div>
          ))}
          {!targets.length && <div style={{ padding: '24px 16px', fontSize: '12px', color: 'var(--text-3)' }}>! no chat matches '<U>{sh.q}</U>'</div>}
        </div>
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-faint)' }}>
          <Button variant="primary" block disabled={!sel.length} onClick={send}>{sel.length ? 'send to ' + sel.length + ' chat' + (sel.length > 1 ? 's' : '') : 'pick a chat'}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- report

function Report({ a }) {
  const s = a.state, e = a.eng, rep = s.report, m = rep.msg;
  const setR = patch => a.set({ report: { ...rep, ...patch } });
  const submit = async () => {
    setR({ busy: true });
    try { const r = await e.report(m, rep.reason, rep.note); setR({ done: true, id: r.id, busy: false }); } catch (err) { setR({ busy: false, err: err.message }); }
  };
  const from = e.displayName(m.from);
  return <>
    <div onClick={() => a.set({ report: null })} style={S.overlay(46)} />
    <div data-screen-label="Report sheet" class="anim" style={fixedSheet(47, { maxWidth: '420px', border: '1px dashed var(--err)' })}>
      <Head title="REPORT MESSAGE" meta={rep.done ? 'filed' : '1 msg · 1 reason'} color="var(--err)" />
      {!rep.done ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 0 6px 10px', paddingInlineStart: '10px', borderInlineStart: '2px solid var(--err)', background: 'var(--surface-hover)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--err)' }}><U>{from}</U> · {hm(m.at)}</span>
            <U style={{ fontSize: '13px', color: 'var(--text-1)', ...S.ell }}>{msgPreview(m, e)}</U>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>// reason</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {['spam', 'harassment', 'illegal content', 'impersonation', 'other'].map(r => {
                const on = rep.reason === r;
                return <button key={r} onClick={() => setR({ reason: r })} class={on ? '' : 'hvc'} style={{ height: '32px', padding: '0 12px', border: '1px solid ' + (on ? 'var(--err)' : 'var(--border-faint)'), background: on ? 'var(--err)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{r}</button>;
              })}
            </div>
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-3)' }}><span>// note · optional</span><span>{200 - rep.note.length} left</span></span>
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', border: '1px dashed var(--border-1)', background: 'var(--surface-input)' }}>
              <span style={{ color: 'var(--accent)' }}>&gt;</span>
              <textarea rows={2} maxLength={200} value={rep.note} onInput={ev => setR({ note: ev.target.value })} placeholder="anything the admin should know" data-no-tr="1" style={{ flex: 1, minWidth: 0, resize: 'none', background: 'transparent', border: 0, outline: 0, color: 'var(--text-1)', font: 'inherit', fontSize: '13px', lineHeight: 1.5 }} />
            </div>
          </label>
          <span style={{ fontSize: '11px', lineHeight: 1.5, color: 'var(--text-3)', textWrap: 'pretty' }}>// admins see this one message, the sender and your note. nothing else from the chat is decrypted.</span>
          {rep.err && <span style={S.err}>! {rep.err}</span>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button variant="ghost" block onClick={() => a.set({ report: null })}>cancel</Button>
            <Button variant="danger" block disabled={!rep.reason || rep.busy} onClick={submit}>report</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px 12px' }}>
          <Log lines={[['[ OK ]', 'message sealed for review'], ['[ OK ]', 'report ' + rep.id + ' filed · reason: ' + rep.reason]]} />
          <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-1)', textWrap: 'pretty' }}>thanks. an admin of <U>{(e.s.server || {}).host}</U> will review it. <U>{from}</U> isn't told who reported.</span>
          <Button variant="primary" block onClick={() => a.set({ report: null })}>done</Button>
        </div>
      )}
    </div>
  </>;
}

// ---------------------------------------------------------------- recovery phrase (settings)

function PhraseView({ a }) {
  const s = a.state, e = a.eng, me = e.s.me;
  const words = s.phvWords || (e.s.vault && e.s.vault.phrase) || [];
  const close = () => { a.phvPassword = null; a.set({ phv: null, phvNew: false, phvWords: null }); };
  const reveal = async ev => {
    ev.preventDefault();
    if (!s.phvPwVal) return a.set({ phvErr: 'enter your password' });
    a.set({ phvBusy: true });
    const ok = await e.verifyPassword(s.phvPwVal);
    // Kept outside state for this sheet only: a new phrase must be signed off with the current password.
    a.phvPassword = ok ? s.phvPwVal : null;
    a.set({ phvBusy: false, ...(ok ? { phv: 'show', phvPwVal: '' } : { phvErr: 'wrong password', phvPwVal: '' }) });
  };
  const regen = async () => {
    a.set({ phvBusy: true });
    if (!a.phvPassword) return a.set({ phv: 'pw', phvErr: 'enter your password again' });
    try { const w = await e.regenPhrase(a.phvPassword); a.set({ phv: 'show', phvNew: true, phvWords: w, phraseDl: false, phraseCopied: false, phvBusy: false }); } catch (err) { a.set({ phvBusy: false }); a.toast('!', err.message, ''); }
  };
  return <>
    <div onClick={close} style={S.overlay(46)} />
    <div data-screen-label="Phrase view" class="anim" style={fixedSheet(47)}>
      <Head title="RECOVERY PHRASE" meta={<U>@{me.username}</U>} />
      {s.phv === 'pw' && (
        <form onSubmit={reveal} style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', margin: 0 }}>
          <span style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-2)' }}>enter your password to reveal the phrase.</span>
          <Box><Inp type="password" autoFocus value={s.phvPwVal} onInput={ev => a.set({ phvPwVal: ev.target.value, phvErr: '' })} placeholder="••••••••" autoComplete="current-password" /></Box>
          {s.phvErr && <span style={S.err}>! {s.phvErr}</span>}
          {s.phvBusy && <span style={S.ok}>[ .. ] checking...</span>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button variant="ghost" block onClick={close}>cancel</Button>
            <Button variant="primary" type="submit" block disabled={s.phvBusy}>reveal</Button>
          </div>
        </form>
      )}
      {s.phv === 'show' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
          {s.phvNew && <span style={S.ok}>[ OK ] new phrase generated · the old one no longer works. save this now.</span>}
          <WordGrid words={words} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button variant="outline" block onClick={() => { copyText(words.join(' ')); a.set({ phraseCopied: true }); setTimeout(() => a.set({ phraseCopied: false }), 1400); }}>{s.phraseCopied ? '[ OK ] copied' : 'copy'}</Button>
            <Button variant="outline" block onClick={() => { downloadPhrase(words, e.s.server.host, me.username); a.set({ phraseDl: true }); }}>{s.phraseDl ? '✓ saved .txt' : '↓ download .txt'}</Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-faint)' }}>
            <Button variant="ghost" block onClick={() => a.set({ phv: 'regen' })}>generate new</Button>
            <Button variant="primary" block onClick={close}>done</Button>
          </div>
        </div>
      )}
      {s.phv === 'regen' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', border: '1px solid var(--warn)', background: 'var(--warn-bg)', fontSize: '12px', lineHeight: 1.5 }}>
            <span style={{ flex: 'none', fontWeight: 700, color: 'var(--warn)' }}>[WARN]</span>
            <span style={{ color: 'var(--text-highlight)', textWrap: 'pretty' }}>your current 8 words stop working immediately. any saved copy becomes useless. devices stay signed in.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <Button variant="ghost" block onClick={() => a.set({ phv: 'show' })}>cancel</Button>
            <Button variant="danger" block disabled={s.phvBusy} onClick={regen}>generate</Button>
          </div>
        </div>
      )}
    </div>
  </>;
}

// ---------------------------------------------------------------- server info card

function ServerInfo({ a }) {
  const e = a.eng, srv = e.s.server, i = srv.info, conn = e.s.conn;
  const color = conn === 'connected' ? 'var(--accent)' : conn === 'offline' ? 'var(--err)' : 'var(--warn)';
  const switchServer = async () => { a.set({ serverCard: false }); await a.doLogout(); a.set({ auth: 'server', serverFound: null, serverUrl: '' }); };
  return <>
    <div onClick={() => a.set({ serverCard: false })} style={{ position: 'absolute', inset: 0, zIndex: 44 }} />
    <div data-screen-label="Server info" class="anim" style={{ position: 'absolute', insetInlineStart: '8px', bottom: '34px', width: '320px', maxWidth: 'calc(100% - 16px)', zIndex: 45, display: 'flex', flexDirection: 'column', background: 'var(--surface-panel)', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-md)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', borderBottom: '1px solid var(--border-faint)' }}>
        <div style={{ flex: 'none', width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-pixel)', fontSize: '14px', color: 'var(--accent)' }}>{(i.name[0] || '?').toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <U style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{i.name.split('.')[0]}</U>
          <U style={{ fontSize: '11px', color: 'var(--text-3)', ...S.ell }}>{srv.host}{/:\d+/.test(srv.host) ? '' : ':443'}</U>
        </div>
        <span style={{ fontSize: '11px', color }}>● {conn}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', padding: '12px', fontSize: '12px' }}>
        <span style={{ color: 'var(--text-3)' }}>version</span><span style={{ color: 'var(--text-1)' }}>{i.version}</span>
        <span style={{ color: 'var(--text-3)' }}>client</span><span style={{ color: 'var(--text-1)' }}>CHATS {CUR_VER}</span>
        <span style={{ color: 'var(--text-3)' }}>uptime</span><span style={{ color: 'var(--text-1)' }}>{fmtUptime(i.uptime + (Date.now() / 1000 - i.time))}</span>
        <span style={{ color: 'var(--text-3)' }}>latency</span><span style={{ color: 'var(--text-1)' }}>{conn === 'connected' ? e.s.latency + ' ms' : '—'}</span>
        <span style={{ color: 'var(--text-3)' }}>signup</span><span style={{ color: 'var(--text-1)' }}>{i.signup === 'invite' ? 'invite only' : i.signup}</span>
        <span style={{ color: 'var(--text-3)' }}>crypto</span><span style={{ color: 'var(--text-1)' }}>e2e · x25519 / aes-256-gcm</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', borderTop: '1px solid var(--border-faint)', background: 'var(--surface-raised)' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// FINGERPRINT · SHA-256</span>
        <span style={{ fontSize: '12px', letterSpacing: '.04em', color: 'var(--accent)', wordBreak: 'break-all' }}>{i.fingerprint}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', padding: '10px 12px', borderTop: '1px solid var(--border-faint)' }}>
        <Button variant="outline" size="sm" block onClick={() => conn === 'offline' ? e.reconnect() : e.goOffline()}>{conn === 'offline' ? 'reconnect' : 'go offline'}</Button>
        {!LOCKED_SERVER && <Button variant="ghost" size="sm" block onClick={switchServer}>switch server</Button>}
      </div>
    </div>
  </>;
}

// ---------------------------------------------------------------- two-factor (user)

function Mfa({ a }) {
  const s = a.state, e = a.eng, me = e.s.me, required = e.s.mfaRequired;
  const m = s.mfa || { step: 'intro' };
  const setM = patch => a.set({ mfa: { ...m, ...patch } });
  const close = () => !required && a.set({ mfa: null });
  const start = async () => { try { const r = await e.mfaSetup(); setM({ step: 'scan', secret: r.secret, uri: r.uri, code: '', err: '' }); } catch (err) { setM({ err: err.message }); } };
  if (required && m.step === 'intro' && !m.started) { setTimeout(() => { a.set({ mfa: { step: 'intro', started: true } }); start(); }, 0); }
  const enable = async () => {
    try { const r = await e.mfaEnable(m.code); setM({ step: 'codes', codes: r.backupCodes, err: '' }); } catch (err) { setM({ err: err.message, code: '' }); }
  };
  const qr = m.uri ? qrMatrix(m.uri) : null;
  const codeInput = (
    <input value={m.code || ''} onInput={ev => setM({ code: ev.target.value.replace(/\D/g, '').slice(0, 6), err: '' })} inputMode="numeric" autoComplete="one-time-code" placeholder="000000"
      style={{ height: '48px', padding: '0 12px', background: 'var(--surface-input)', border: '1px dashed var(--border-strong)', color: 'var(--text-highlight)', fontSize: '22px', letterSpacing: '.45em', textAlign: 'center', outline: 'none' }} />
  );
  return <>
    <div onClick={close} style={S.overlay(required ? 57 : 46)} />
    <div data-screen-label="Two-factor setup" class="anim" style={fixedSheet(required ? 58 : 47, { maxWidth: '420px', maxHeight: 'calc(100% - 48px)', overflowY: 'auto' })}>
      <Head title="TWO-FACTOR" meta={required ? 'required by ' + e.s.server.host : me.mfa ? 'on' : 'off'} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
        {m.step === 'intro' && !required && <>
          <span style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--text-2)' }}>add a 6-digit code from an authenticator app (aegis, 2fas, google authenticator, 1password…) to every new sign-in.</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}><Button variant="ghost" block onClick={close}>cancel</Button><Button variant="primary" block onClick={start}>set up</Button></div>
        </>}
        {m.step === 'scan' && <>
          {required && <span style={{ fontSize: '12px', color: 'var(--warn)' }}>[WARN] this server requires two-factor before you can chat.</span>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
            <div style={{ flex: 'none', padding: '8px', border: '1px solid var(--border-1)', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }}>
              <div style={{ '--accent': 'var(--bg-0)' }}>{qr && <QrGrid cells={qr.cells} n={qr.n} size={160} />}</div>
            </div>
            <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: 'var(--text-2)' }}>
              <span><span style={{ color: 'var(--accent)' }}>01</span> scan with any TOTP app</span>
              <span><span style={{ color: 'var(--accent)' }}>02</span> or enter the secret manually</span>
              <span><span style={{ color: 'var(--accent)' }}>03</span> type the code it shows</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px dashed var(--border-1)' }}>
            <span data-no-tr="1" style={{ flex: 1, minWidth: 0, fontSize: '13px', letterSpacing: '.12em', color: 'var(--text-highlight)', wordBreak: 'break-all' }}>{m.secret}</span>
            <Button variant="ghost" size="sm" onClick={() => { copyText(m.secret.replace(/\s/g, '')); setM({ copied: true }); }}>{m.copied ? '✓ copied' : 'copy'}</Button>
          </div>
          {codeInput}
          {m.err && <span style={S.err}>! {m.err}</span>}
          <div style={{ display: 'grid', gridTemplateColumns: required ? '1fr' : '1fr 1fr', gap: '8px' }}>
            {!required && <Button variant="ghost" block onClick={close}>cancel</Button>}
            <Button variant="primary" block disabled={(m.code || '').length !== 6} onClick={enable}>enable 2fa</Button>
          </div>
          {required && <button onClick={() => a.doLogout()} class="hvt" style={{ background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>log out instead</button>}
        </>}
        {m.step === 'codes' && <>
          <span style={S.ok}>[ OK ] two-factor is on for @{me.username}</span>
          {m.codes && m.codes.length > 0 && <>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>backup codes · each works once if you lose your phone:</span>
            <div data-no-tr="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', padding: '10px', border: '1px dashed var(--border-strong)', background: 'var(--bg-0)' }}>
              {m.codes.map((c, i) => <span key={c} style={{ fontSize: '13px', letterSpacing: '.08em', color: 'var(--text-highlight)' }}><span style={{ color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</span> {c}</span>)}
            </div>
            <Button variant="outline" block onClick={() => { copyText(m.codes.join('\n')); setM({ copiedCodes: true }); }}>{m.copiedCodes ? '✓ copied' : 'copy codes'}</Button>
          </>}
          <Button variant="primary" block onClick={() => a.set({ mfa: null })}>done</Button>
        </>}
        {m.step === 'manage' && <>
          <span style={{ fontSize: '12px' }}><span style={{ fontWeight: 700, color: 'var(--ok)' }}>[ENABLED]</span> <span style={{ color: 'var(--text-3)' }}>authenticator app · asked on new sign-ins</span></span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>enter a current authenticator code to manage your backup codes</span>
          {codeInput}
          <Button variant="outline" block disabled={(m.code || '').length !== 6} onClick={async () => { try { const r = await e.mfaBackup(m.code); setM({ step: 'codes', codes: r.backupCodes }); } catch (err) { setM({ err: err.message }); } }}>regenerate backup codes</Button>
          {e.s.config && e.s.config.tfaUsers !== 'required' && !(['owner', 'admin', 'moderator'].includes(me.role) && e.s.config.tfaAdmins === 'required') && <>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>// to turn it off, enter a current code</span>
            <Button variant="danger" block disabled={(m.code || '').length !== 6} onClick={async () => { try { await e.mfaDisable(m.code); a.set({ mfa: null, toast: { glyph: '⚷', text: 'two-factor off', sub: '' } }); } catch (err) { setM({ err: err.message, code: '' }); } }}>turn off</Button>
          </>}
          {m.err && <span style={S.err}>! {m.err}</span>}
          <Button variant="ghost" block onClick={close}>close</Button>
        </>}
      </div>
    </div>
  </>;
}

// ---------------------------------------------------------------- toast, status screens, lock, boot

function Toast({ a }) {
  const t = a.state.toast;
  return (
    <div data-screen-label="Toast" class="anim" style={{ position: 'absolute', left: '50%', bottom: '96px', transform: 'translateX(-50%)', zIndex: 48, width: 'min(360px, calc(100% - 16px))', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', border: '1px solid var(--border-strong)', background: 'var(--surface-raised)', boxShadow: 'var(--glow-md)' }}>
      <span style={{ flex: 'none', fontSize: '16px', color: 'var(--accent)' }}>{t.glyph}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-1)' }}>{t.text}</span>
        {t.sub && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{t.sub}</span>}
      </div>
      {t.kind === 'update' && <Button variant="primary" size="sm" onClick={() => { a.set({ toast: null }); navigator.serviceWorker.getRegistration().then(r => { if (r && r.waiting) r.waiting.postMessage('skipWaiting'); setTimeout(() => location.reload(), 300); }); }}>reload</Button>}
      <button onClick={() => a.set({ toast: null })} aria-label="dismiss" class="hvt" style={{ flex: 'none', width: '24px', height: '24px', padding: 0, background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '14px', cursor: 'pointer' }}>×</button>
    </div>
  );
}

function Status({ a }) {
  const e = a.eng, st = e.s.status, srv = e.s.server || { host: '' }, me = e.s.me || a.state.prof || {};
  const nowS = Math.floor(a.state.now / 1000);
  const since = t => t ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' utc' : '—';
  const cd = 30 - (nowS % 30);
  const map = {
    maintenance: { color: 'var(--warn)', title: 'MAINTENANCE', body: srv.host + " is being upgraded. your messages are safe and will sync when it's back.",
      log: [['[ OK ]', 'local cache intact · ' + Object.keys(e.s.chats).length + ' chats', 'var(--accent)'], ['[WAIT]', 'server returned 503 · maintenance', 'var(--warn)'], ['[ .. ]', 'auto-retry in ' + cd + 's', 'var(--text-3)']],
      rows: [['started', since(st.since)], ['notice', st.msg || '—']], primary: ['retry now', () => e.reconnect()] },
    disabled: { color: 'var(--err)', title: 'ACCOUNT DISABLED', body: '@' + (me.username || '') + ' was disabled by an admin of ' + srv.host + ". you can't send or read messages until it's restored.",
      log: [['[ERR]', '403 · account_disabled', 'var(--err)'], ['[ OK ]', 'local keys wiped from this device', 'var(--accent)']],
      rows: [['since', since(st.since)], ['reason', st.reason || '—'], ['contact', 'admin@' + srv.host.replace(/:\d+$/, '')]],
      primary: ['email admin', () => { try { window.open('mailto:admin@' + srv.host.replace(/:\d+$/, '') + '?subject=account%20disabled%20%40' + me.username); } catch { /* no mail client */ } }],
      secondary: ['log out', async () => { e.set({ status: null }); await a.doLogout(); }] },
    signedOut: { color: 'var(--warn)', title: 'SIGNED OUT', body: st.by === 'admin' ? 'an admin of ' + srv.host + ' ended this session. this can happen after a security check or a password reset.' : 'this session ended. this happens after a password reset or when you sign it out from another device.',
      log: [['[WARN]', '401 · session_revoked' + (st.by === 'admin' ? '_by_admin' : ''), 'var(--warn)'], ['[ OK ]', 'session keys cleared', 'var(--accent)']],
      rows: [['at', st.at ? 'today ' + hm(st.at) : 'now'], ['device', 'this browser']],
      primary: ['log in again', async () => { e.set({ status: null }); await a.doLogout(); a.set({ auth: 'login' }); }] },
    pending: { color: 'var(--warn)', title: 'WAITING FOR APPROVAL', body: 'your account on ' + srv.host + ' was created with an invite that needs an admin to approve it. you can log in once it is.',
      log: [['[ OK ]', 'account @' + (st.username || me.username || '') + ' created', 'var(--accent)'], ['[WAIT]', 'pending admin approval', 'var(--warn)']],
      rows: [['server', srv.host], ['next', 'try logging in later']],
      primary: ['back to log in', async () => { e.set({ status: null }); await a.doLogout(); a.set({ auth: 'login' }); }] },
  }[st.kind];
  if (!map) return null;
  return (
    <div data-screen-label="Status screen" style={{ position: 'absolute', inset: '0 0 28px 0', zIndex: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto', background: 'var(--surface-page)', backgroundImage: 'var(--vignette)' }}>
      <div style={{ width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '20px', padding: '28px 20px 24px', border: '1px dashed ' + map.color, background: 'var(--surface-panel)' }}>
        <Log lines={map.log} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontFamily: 'var(--font-pixel)', fontSize: '28px', lineHeight: 1.15, letterSpacing: '.08em', color: map.color }}>{map.title}</div>
          <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-2)', textWrap: 'pretty' }}>{map.body}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: '12px' }}>
          {map.rows.map(([k, v]) => [<span key={k} style={{ color: 'var(--text-3)' }}>{k}</span>, <span key={k + 'v'} data-no-tr="1" style={{ color: 'var(--text-1)', wordBreak: 'break-word' }}>{v}</span>])}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Button variant="primary" block onClick={map.primary[1]}>{map.primary[0]}</Button>
          {map.secondary && <Button variant="outline" block onClick={map.secondary[1]}>{map.secondary[0]}</Button>}
        </div>
      </div>
    </div>
  );
}

function Lock({ a }) {
  const s = a.state, me = a.eng.s.me || {}, srv = a.eng.s.server || {};
  const len = s.pinMode === 'lock' ? s.lock.digits : s.pinDigits;
  const title = s.pinMode === 'lock' ? 'locked · enter passcode' : s.pinMode === 'confirm' ? 'confirm passcode' : 'set a ' + s.pinDigits + '-digit passcode';
  const sub = s.pinErr || (s.pinMode === 'lock' ? '@' + me.username + ' · ' + srv.host : s.pinMode === 'confirm' ? 'type it once more' : "you'll need it every time the app locks");
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => [d, true, () => a.pinPress(d)])
    .concat([[s.pinMode === 'lock' ? 'log out' : 'cancel', false, () => s.pinMode === 'lock' ? a.doLogout() : a.set({ pinMode: null, pin: '', pinFirst: '', pinErr: '' })], ['0', true, () => a.pinPress('0')], ['⌫', false, a.pinBack]]);
  return (
    <div data-screen-label="App lock" style={{ position: 'absolute', inset: 0, zIndex: 58, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', padding: '24px', background: 'var(--surface-page)', backgroundImage: 'var(--vignette)' }}>
      <div style={{ fontFamily: 'var(--font-pixel)', fontSize: '32px', letterSpacing: '.1em', color: 'var(--accent)', textShadow: 'var(--text-glow-strong)' }}>CHATS</div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', textAlign: 'center' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>{title}</span>
        <span data-no-tr={s.pinMode === 'lock' && !s.pinErr ? '1' : undefined} style={{ fontSize: '11px', minHeight: '16px', color: s.pinErr ? 'var(--err)' : 'var(--text-3)' }}>{sub}</span>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        {Array.from({ length: len }, (_, i) => <span key={i} style={{ width: '14px', height: '14px', border: '1px solid var(--border-strong)', background: i < s.pin.length ? 'var(--accent)' : 'transparent', boxShadow: i < s.pin.length ? 'var(--glow-sm)' : 'none' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,72px)', gap: '8px' }}>
        {keys.map(([label, digit, fn]) => digit
          ? <button key={label} onClick={fn} class="pin" style={{ height: '56px', border: '1px solid var(--border-1)', background: 'var(--surface-raised)', color: 'var(--text-1)', font: 'inherit', fontSize: '20px', cursor: 'pointer' }}>{label}</button>
          : <button key={label} onClick={fn} class="hvt" style={{ height: '56px', border: 0, background: 'transparent', color: 'var(--text-3)', font: 'inherit', fontSize: '11px', cursor: 'pointer' }}>{label}</button>)}
      </div>
    </div>
  );
}

function Boot({ a }) {
  const s = a.state, srv = a.eng.s.server;
  const lines = ['phosphor warm-up', 'mounting ~/.keys', 'handshake ' + (srv ? srv.host : 'no server'), 'syncing ' + Object.keys(a.eng.s.chats).length + ' chats', 'ready'].slice(0, s.bootN);
  return (
    <div data-screen-label="Boot" style={{ position: 'absolute', inset: 0, zIndex: 59, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', background: 'var(--surface-page)', backgroundImage: 'var(--vignette)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-pixel)', fontSize: '44px', letterSpacing: '.1em', color: 'var(--accent)', textShadow: 'var(--text-glow-strong)' }}>
        CHATS<span style={{ display: 'inline-block', width: '.55em', height: '.8em', background: 'var(--accent)', boxShadow: 'var(--glow-md)', animation: 'gsblink 1s steps(1) infinite' }} />
      </div>
      <div style={{ width: '260px', display: 'flex', flexDirection: 'column', gap: '3px', minHeight: '90px', fontSize: '11px', color: 'var(--text-3)' }}>
        {lines.map(l => <span key={l}><span style={{ color: 'var(--accent)' }}>[ OK ]</span> <span data-no-tr="1">{l}</span></span>)}
      </div>
      <div style={{ width: '260px', height: '2px', background: 'var(--border-faint)' }}><div style={{ height: '2px', width: Math.min(100, s.bootN / 5 * 100) + '%', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} /></div>
    </div>
  );
}
