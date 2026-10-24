// Right column: conversation, person / group info, and the sheets that act on a chat (attach, forward, invite, send contact).
import { Button, IconButton, Icon } from '#shared/ui/ds.jsx';
import { Hdr, Box, Inp, Av, Empty, S, U } from '#shared/ui/kit.jsx';
import { hm, dayLabel, fmtSize, ini } from '#shared/core/format.js';
import { unb64 } from '#shared/core/bytes.js';
import { msgPreview, sysText } from './engine.js';
import { decorate, person, status, isOn, chatList } from './view.js';
import { SelectRow } from './Left.jsx';
import { copyText } from './Auth.jsx';

export function RightPane({ a }) {
  const s = a.state, e = a.eng, wide = a.wide();
  const chat = e.s.chats[s.activeId];
  let body = null;
  if (s.right === 'chat' && chat) body = <Conversation a={a} chat={chat} />;
  else if (s.right === 'info') body = <Info a={a} />;
  else if (wide) body = (
    <div data-screen-label="Empty" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
      <div style={{ fontFamily: 'var(--font-pixel)', fontSize: '28px', letterSpacing: '.12em', color: 'var(--accent)', textShadow: 'var(--text-glow)' }}>NO CHAT_</div>
      <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>// pick a conversation, or press + for a new group</span>
    </div>
  );
  return <>
    {body}
    {s.fwd && <ForwardSheet a={a} />}
    {s.inviteOpen && <InviteSheet a={a} />}
    {s.contactPick && <ContactPick a={a} />}
  </>;
}

// ---------------------------------------------------------------- conversation

function pixOrder(id) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Array.from({ length: 192 }, () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296);
}

function ImageMsg({ a, m, mine }) {
  const f = m.body.f, st = a.eng.s.files[f.id] || {};
  const busy = st.pct != null && !st.done, done = !!st.done;
  const tones = f.px ? unb64(f.px) : null;
  const order = pixOrder(f.id);
  const r = done ? 1 : (st.pct || 0) / 100;
  const dl = ev => { if (ev) ev.stopPropagation(); a.eng.fetchFile(f).catch(() => {}); };
  const meta = busy ? ' · ' + st.pct + '%' : st.saved ? ' · saved' : '';
  return (
    <div onClick={() => { a.set({ preview: { chat: m.chat, id: m.id } }); if (!done) dl(); }} title="view photo" class="hvgs"
      style={{ position: 'relative', width: '220px', maxWidth: '100%', aspectRatio: f.w && f.h ? Math.max(0.75, Math.min(1.78, f.w / f.h)) : '4/3', border: '1px solid ' + (mine ? 'var(--border-2)' : 'var(--border-1)'),
        backgroundColor: 'var(--bg-1)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '4px 4px', display: 'flex', alignItems: 'flex-end', cursor: 'zoom-in', overflow: 'hidden' }}>
      {done && st.url ? <div class="phos" style={{ position: 'absolute', inset: 0 }}><img src={st.url} alt="" /></div> : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(16,1fr)', gridTemplateRows: 'repeat(12,1fr)', pointerEvents: 'none' }}>
          {order.map((o, i) => <span key={i} style={{ background: o < r && tones ? 'rgba(var(--glow-rgb),' + Math.min(0.9, 0.12 + tones[i] / 255 * 0.78).toFixed(2) + ')' : 'transparent' }} />)}
        </div>
      )}
      {!busy && !done && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <button onClick={dl} title="download" class="hvdl" style={{ pointerEvents: 'auto', width: '44px', height: '44px', display: 'grid', placeItems: 'center', padding: 0, background: 'var(--bg-0)', border: '1px solid var(--accent)', color: 'var(--accent)', boxShadow: 'var(--glow-sm)', cursor: 'pointer' }}><Icon name="download" size={24} /></button>
        </div>
      )}
      {busy && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><span style={{ minWidth: '44px', height: '44px', display: 'grid', placeItems: 'center', padding: '0 6px', background: 'var(--bg-0)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: '12px', fontWeight: 700 }}>{st.pct}%</span></div>}
      <span data-no-tr="1" style={{ position: 'relative', zIndex: 2, padding: '4px 6px', fontSize: '11px', color: 'var(--text-2)', background: 'var(--bg-1)', maxWidth: '100%', ...S.ell }}>{f.n} · {fmtSize(f.s)}{meta}</span>
      {st.error && <span style={{ position: 'absolute', top: 4, insetInlineStart: 4, zIndex: 2, fontSize: '11px', color: 'var(--err)', background: 'var(--bg-0)', padding: '2px 4px' }}>! {st.error}</span>}
    </div>
  );
}

function FileMsg({ a, m, mine }) {
  const b = m.body;
  if (b.t === 'contact') {
    const p = person(a, b.u);
    return (
      <div onClick={() => a.openPeer(b.u)} style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '200px', cursor: 'pointer' }}>
        <div class="hv" style={{ flex: 'none', width: '36px', height: '36px', display: 'grid', placeItems: 'center', border: '1px solid ' + (mine ? 'var(--border-strong)' : 'var(--border-1)'), color: 'var(--accent)' }}><Icon name="user" /></div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <U style={{ fontSize: '13px', color: mine ? 'var(--text-highlight)' : 'var(--text-1)', ...S.ell }}>{p.name}</U>
          <span style={{ fontSize: '11px', color: mine ? 'var(--text-2)' : 'var(--text-3)' }}>contact · @{p.username}</span>
        </div>
      </div>
    );
  }
  const f = b.f, st = a.eng.s.files[f.id] || {};
  const busy = st.pct != null && !st.done, done = !!st.saved;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '200px' }}>
      <button onClick={() => a.eng.saveFile(f).catch(() => {})} title={busy ? 'downloading ' + st.pct + '%' : done ? 'saved to downloads' : 'download'} class={mine ? 'hv' : 'hvb'}
        style={{ position: 'relative', flex: 'none', width: '36px', height: '36px', display: 'grid', placeItems: 'center', padding: 0, background: 'transparent', border: '1px solid ' + (mine ? 'var(--border-strong)' : 'var(--border-1)'), color: 'var(--accent)', font: 'inherit', cursor: 'pointer', overflow: 'hidden' }}>
        {busy ? <><span style={{ fontSize: '10px', fontWeight: 700 }}>{st.pct}%</span><span style={{ position: 'absolute', insetInlineStart: 0, bottom: 0, height: '2px', width: st.pct + '%', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} /></>
          : done ? <span style={{ fontSize: '14px' }}>✓</span> : <Icon name={mine ? 'file' : 'download'} />}
      </button>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <U style={{ fontSize: '13px', color: mine ? 'var(--text-highlight)' : 'var(--text-1)', ...S.ell }}>{f.n}</U>
        <span style={{ fontSize: '11px', color: st.error ? 'var(--err)' : mine ? 'var(--text-2)' : 'var(--text-3)' }}>{st.error ? '! ' + st.error : fmtSize(f.s) + (busy ? ' · ' + st.pct + '%' : done ? ' · saved' : '')}</span>
      </div>
    </div>
  );
}

/** @handles that belong to someone in this chat (or a known person) become links to their profile; anything else stays text. */
function mentionText(text, a, chat) {
  const e = a.eng, me = e.s.me;
  const byName = u => {
    if (me && u === me.username) return me.id;
    const inChat = (chat.members || []).map(x => e.s.people[x.id]).find(p => p && p.username === u);
    return (inChat || Object.values(e.s.people).find(p => p && p.username === u) || {}).id || null;
  };
  return String(text).split(/(@[a-z][a-z0-9_]{2,31})/g).map((p, i) => {
    const id = i % 2 ? byName(p.slice(1)) : null;
    if (!id) return p;
    const open = ev => { ev.stopPropagation(); id === me.id ? a.goLeft('profile') : a.openPeer(id); };
    return <span key={i} role="link" tabIndex={0} onClick={open} onKeyDown={ev => ev.key === 'Enter' && open(ev)} class="hvu" style={{ color: 'var(--info)', fontWeight: 700, cursor: 'pointer' }}>{p}</span>;
  });
}

function UploadMsg({ a, m }) {
  const f = m.body.f, pct = m.up || 0;
  return (
    <div data-screen-label="Upload progress" style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--accent)' }}>
        <span style={{ fontWeight: 700 }}>↑ uploading {pct}%</span>
        <span data-no-tr="1" style={{ color: 'var(--text-2)' }}>{fmtSize(Math.round(f.s * pct / 100))} / {fmtSize(f.s)}</span>
        <button onClick={() => a.eng.cancelUpload(m.chat, m.cid)} title="cancel upload" class="hvacc" style={{ marginInlineStart: 'auto', padding: '0 4px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', font: 'inherit', fontSize: '10px', cursor: 'pointer' }}>cancel</button>
      </div>
      <div style={{ position: 'relative', height: '6px', border: '1px solid var(--accent)', background: 'var(--surface-input)' }}>
        <span style={{ position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: pct + '%', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} />
      </div>
      <U style={{ fontSize: '12px', color: 'var(--text-1)', ...S.ell }}>{f.n}</U>
    </div>
  );
}

function Bubble({ a, m, chat, showSender }) {
  const e = a.eng, me = e.s.me, mine = m.from === me.id, b = m.body || {};
  const receipts = !!me.receipts;
  const read = mine && m.id > 0 && chat.members.some(x => x.id !== me.id && x.read != null && x.read >= m.id);
  const st = m.state === 'pending' || m.state === 'uploading' ? 'pending' : m.state === 'failed' ? 'failed' : read && receipts ? 'read' : 'sent';
  const ticks = st === 'pending' ? '◷' : st === 'failed' ? '! retry' : st === 'sent' || !receipts ? '✓' : '✓✓';
  const tickColor = st === 'failed' ? 'var(--err)' : st === 'pending' ? 'var(--text-3)' : st === 'read' ? 'var(--accent)' : 'var(--text-2)';
  const txt = { fontSize: '14px', lineHeight: 1.5, color: mine ? 'var(--text-highlight)' : 'var(--text-1)', textWrap: 'pretty', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
  const ac = mine ? 'var(--accent)' : 'var(--info)';
  let content;
  if (m.hidden) content = <div style={{ ...txt, color: 'var(--text-3)', fontStyle: 'italic' }}>message hidden pending review</div>;
  else if (b.undecryptable) content = <div style={{ ...txt, color: 'var(--text-3)' }}>[encrypted · key unavailable on this device]</div>;
  else if (m.state === 'uploading') content = <UploadMsg a={a} m={m} />;
  else if (b.t === 'text') content = <div data-no-tr="1" style={txt}>{mentionText(b.text, a, chat)}</div>;
  else if (b.t === 'image') content = <ImageMsg a={a} m={m} mine={mine} />;
  else content = <FileMsg a={a} m={m} mine={mine} />;
  return (
    <div id={'m' + m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px',
      background: mine ? 'var(--surface-selected)' : 'var(--surface-raised)', border: '1px solid ' + (mine ? 'var(--border-2)' : 'var(--border-faint)'), boxShadow: a.state.hl === m.id ? 'var(--glow-md)' : undefined }}>
      {b.fw && <div style={{ fontSize: '11px', color: mine ? 'var(--text-2)' : 'var(--info)', borderInlineStart: '1px solid ' + (mine ? 'var(--text-2)' : 'var(--info)'), paddingInlineStart: '6px' }}>↪ forwarded from <U>{b.fw}</U></div>}
      {b.r && (
        <div onClick={() => { const el = document.getElementById('m' + b.r.id); if (el) { el.scrollIntoView({ block: 'center' }); a.set({ hl: b.r.id }); setTimeout(() => a.set({ hl: null }), 1200); } }}
          style={{ display: 'flex', flexDirection: 'column', padding: '2px 0 2px 8px', paddingInlineStart: '8px', paddingInlineEnd: 0, borderInlineStart: '2px solid ' + ac, background: 'var(--surface-hover)', cursor: 'pointer', minWidth: 0 }}>
          <U style={{ fontSize: '11px', fontWeight: 700, color: ac }}>{b.r.from === me.id ? 'you' : e.displayName(b.r.from)}</U>
          <U style={{ fontSize: '12px', color: 'var(--text-2)', ...S.ell }}>{b.r.x}</U>
        </div>
      )}
      {showSender && <button onClick={() => a.openPeer(m.from)} class="hvu" style={{ alignSelf: 'flex-start', padding: 0, background: 'transparent', border: 0, font: 'inherit', fontSize: '11px', fontWeight: 700, color: 'var(--info)', cursor: 'pointer' }}><U>{e.displayName(m.from)}</U></button>}
      {content}
      {b.cap && <div data-no-tr="1" style={txt}>{mentionText(b.cap, a, chat)}</div>}
      <div style={mine ? { display: 'flex', alignItems: 'center', gap: '2px', margin: '-4px 0 -4px -6px', marginInlineStart: '-6px', marginInlineEnd: 0 } : { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '-4px', marginInlineStart: '-6px' }}>
        <button onClick={ev => m.id > 0 && a.openMenu(ev, { type: 'msg', id: m.id, chat: m.chat, mine })} aria-label="message options" title="options" class="hva"
          style={{ width: '24px', height: '24px', display: 'grid', placeItems: 'center', background: 'transparent', border: 0, font: 'inherit', fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: 'pointer', color: 'var(--text-2)' }}>⋮</button>
        <span style={{ marginInlineStart: 'auto', paddingInlineStart: mine ? '12px' : 0, fontSize: '10px', color: mine ? 'var(--text-2)' : 'var(--text-3)' }}>{m.edited ? 'edited · ' : ''}{hm(m.at)}</span>
        {mine && <button onClick={() => st === 'failed' && e.retry(m.chat, m.cid)} title={st === 'failed' ? 'not sent · tap to retry' : st} style={{ padding: '0 0 0 4px', background: 'transparent', border: 0, font: 'inherit', fontSize: '10px', fontWeight: 700, color: tickColor, cursor: st === 'failed' ? 'pointer' : 'default' }}>{ticks}</button>}
      </div>
    </div>
  );
}

function Conversation({ a, chat }) {
  const s = a.state, e = a.eng, wide = a.wide(), me = e.s.me, caps = (e.s.config || {}).caps || {};
  const d = decorate(a, chat);
  const all = (e.s.msgs[chat.id] || []).filter(m => !m.deleted);
  const cqm = s.chatQuery.trim().toLowerCase();
  const shown = cqm ? all.filter(m => m.kind === 'msg' && msgPreview(m, e).toLowerCase().includes(cqm)) : all;
  const loaded = !!e.s.msgs[chat.id];
  const complete = e.s.complete[chat.id];
  const mm = /(^|\s)@([\w.]*)$/.exec(s.draft);
  const mList = mm ? chat.members.map(x => x.id).filter(id => id !== me.id).map(id => person(a, id)).filter(p => p.username.toLowerCase().startsWith(mm[2].toLowerCase()) || p.name.toLowerCase().startsWith(mm[2].toLowerCase())).slice(0, 5) : [];
  const editMsg = s.editId !== null ? all.find(m => m.id === s.editId) : null;
  const replyMsg = s.replyId !== null ? all.find(m => m.id === s.replyId) : null;
  const pickMention = u => a.set({ draft: s.draft.replace(/@[\w.]*$/, '@' + u + ' ') });
  const now = s.now;
  let cb = null;
  if (s.rateUntil > now) cb = { color: 'var(--warn)', bg: 'var(--warn-bg)', tag: '[WARN]', text: 'slow down · max ' + ((e.s.config || {}).rate || 30) + ' messages per minute. try again in ' + Math.ceil((s.rateUntil - now) / 1000) + 's' };
  else if (s.uploadErr) cb = { color: 'var(--err)', bg: 'var(--err-bg)', ...s.uploadErr, close: true };
  const imgRef = { current: null }, fileRef = { current: null }, vidRef = { current: null };
  let lastDay = '';
  const items = [];
  shown.forEach((m, i) => {
    const day = dayLabel(m.at);
    if (day !== lastDay) { lastDay = day; items.push(<div key={'d' + day + i} style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-3)', padding: '4px 0 8px' }}>── {day} ──</div>); }
    if (m.kind === 'sys') { items.push(<div key={m.id} style={{ alignSelf: 'center', padding: '4px 10px', fontSize: '11px', color: 'var(--text-2)', border: '1px dashed var(--border-faint)', background: 'var(--surface-panel)' }}>{sysText(m, e)}</div>); return; }
    const prev = shown[i - 1];
    items.push(<Bubble key={m.id > 0 ? m.id : m.cid} a={a} m={m} chat={chat} showSender={d.isGroup && m.from !== me.id && (!prev || prev.from !== m.from || prev.kind === 'sys')} />);
  });
  const typers = (e.s.typing[chat.id] || []).filter(id => id !== me.id).map(id => e.displayName(id));
  const typingWho = typers.length > 2 ? typers.length + ' people' : typers.join(', ');
  const typingLabel = typingWho ? typingWho + (typers.length > 1 ? ' are' : ' is') + ' typing' : '';
  const pins = e.pins(chat.id), pinI = a.pinShown(chat.id), pinId = pinI >= 0 ? pins[pinI] : null;
  const pinMsg = pinId != null ? all.find(m => m.id === pinId) : null;
  const pinText = pinId == null ? '' : pinMsg ? (pinMsg.from === me.id ? 'you' : e.displayName(pinMsg.from)) + ': ' + msgPreview(pinMsg, e) : 'older message · press to find it';
  const canDrop = caps.attach !== false;
  const hasFiles = ev => !!ev.dataTransfer && [...(ev.dataTransfer.types || [])].includes('Files');
  const onDragOver = ev => { if (!canDrop || !hasFiles(ev)) return; ev.preventDefault(); if (!s.dragOver) a.set({ dragOver: true }); };
  const onDragLeave = ev => { if (ev.currentTarget.contains(ev.relatedTarget)) return; a.set({ dragOver: false }); };
  const onDrop = ev => {
    if (!canDrop || !hasFiles(ev)) return;
    ev.preventDefault();
    a.set({ dragOver: false });
    const files = [...ev.dataTransfer.files].slice(0, 10);
    if (files.length) a.sendFiles(files, 'auto', chat.id);
  };
  const onScroll = ev => { if (ev.target.scrollTop < 40 && loaded && !complete && !a.histBusy) { a.histBusy = true; const h = ev.target.scrollHeight; e.loadHistory(chat.id).then(() => { requestAnimationFrame(() => { ev.target.scrollTop = ev.target.scrollHeight - h; }); }).finally(() => { a.histBusy = false; }); } };
  return (
    <div data-screen-label="Conversation" onDragEnter={onDragOver} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{ ...S.col, position: 'relative' }}>
      {s.dragOver && (
        <div data-screen-label="Drop zone" style={{ position: 'absolute', inset: '8px', zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', border: '2px dashed var(--accent)', background: 'var(--surface-panel)', boxShadow: 'var(--glow-sm)', pointerEvents: 'none' }}>
          <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '28px', letterSpacing: '.12em', color: 'var(--accent)', textShadow: 'var(--text-glow)' }}>DROP_</span>
          <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>release to upload to <U>{d.title}</U> · photos &amp; files · max {(e.s.config || {}).upload || 25} MB</span>
        </div>
      )}
      <header style={S.hdr}>
        {!wide && <IconButton variant="ghost" label="back" onClick={() => a.set({ right: null, attachOpen: false })}><Icon name="arrow-left" /></IconButton>}
        <div onClick={() => a.openPeer(d.isGroup ? chat.id : chat.peer)} class="hv" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '0 4px', height: '32px' }}>
          <Av name={d.isGroup ? d.initials : d.title} photo={d.photo} size={32} fs={12} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <U style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)', ...S.ell }}>{d.title}</U>
            {typingLabel ? <span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--accent)', ...S.ell }}>{typingLabel}<span style={{ animation: 'gsblink 1s steps(1) infinite' }}>_</span></span> : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
                {d.online && <span style={{ flex: 'none', width: '6px', height: '6px', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} />}
                <span>{d.isGroup ? d.status : String(d.status).replace(/^seen /, 'last seen ')}{chat.muted ? ' · muted' : ''}</span>
              </span>
            )}
          </div>
        </div>
        <IconButton variant="ghost" label="search in chat" onClick={() => a.set({ chatSearchOpen: !s.chatSearchOpen, chatQuery: '' })}><Icon name="search" /></IconButton>
        {d.isGroup && <IconButton variant="ghost" label="invite people" onClick={() => a.set({ inviteOpen: true, inviteSel: {}, copied: false, inviteGroup: chat.id })}><Icon name="user" /></IconButton>}
        <IconButton variant="ghost" label="chat options" onClick={ev => a.openMenu(ev, { type: 'chat', id: chat.id })}>⋮</IconButton>
      </header>
      {s.chatSearchOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid var(--border-faint)' }}>
          <Box glyph="/" h={36} style={{ flex: 1, minWidth: 0 }}><Inp autoFocus value={s.chatQuery} onInput={ev => a.set({ chatQuery: ev.target.value })} placeholder="search messages..." data-no-tr="1" /></Box>
          <span style={{ flex: 'none', fontSize: '11px', color: 'var(--text-3)' }}>{cqm ? shown.length + ' match' + (shown.length === 1 ? '' : 'es') : 'esc to close'}</span>
        </div>
      )}
      {pinId != null && (
        <div data-screen-label="Pinned" onClick={() => a.jumpPin(chat.id)} title="jump to pinned message" class="hv" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 12px', borderBottom: '1px solid var(--border-faint)', background: 'var(--surface-raised)', cursor: 'pointer' }}>
          <span style={{ flex: 'none', width: '2px', alignSelf: 'stretch', background: 'var(--accent)', boxShadow: 'var(--glow-sm)' }} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>⚲ {pins.length > 1 ? (pinI + 1) + '/' + pins.length : 'pinned'}</span>
            <U style={{ fontSize: '12px', color: 'var(--text-1)', ...S.ell }}>{pinText}</U>
          </div>
          <button onClick={ev => { ev.stopPropagation(); e.togglePin(chat.id, pinId).catch(err => a.toast('!', err.message, '')); }} title="unpin" aria-label="unpin" class="hva"
            style={{ flex: 'none', width: '28px', height: '28px', display: 'grid', placeItems: 'center', padding: 0, background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '14px', cursor: 'pointer' }}>×</button>
        </div>
      )}
      <div ref={a.scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
        {loaded && !complete && all.length > 0 && <div style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-3)' }}>░░░ scroll up for older</div>}
        {!loaded && <div style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-3)', padding: '24px' }}>░░░ decrypting…</div>}
        {items}
        {typingLabel && !cqm && (
          <div data-screen-label="Typing" style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', border: '1px dashed var(--border-1)', background: 'var(--surface-panel)', fontSize: '12px', color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--accent)' }}>&gt;</span><U>{typingLabel}</U><span style={{ color: 'var(--accent)', animation: 'gsblink 1s steps(1) infinite' }}>█</span>
          </div>
        )}
        {cqm && !shown.length && <div style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-3)' }}>! no messages match '<U>{s.chatQuery}</U>'</div>}
        {loaded && !all.length && (
          <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '24px' }}>
            <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '14px', letterSpacing: '.1em', color: 'var(--accent)' }}>EMPTY BUFFER</span>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>// say hi. messages are end-to-end encrypted.</span>
          </div>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-faint)', background: 'var(--surface-panel)' }}>
        {mList.length > 0 && (
          <div data-screen-label="Mention box" style={{ position: 'absolute', left: '8px', right: '8px', bottom: '100%', marginBottom: '6px', zIndex: 15, background: 'var(--surface-panel)', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '11px', color: 'var(--text-3)', borderBottom: '1px solid var(--border-faint)' }}><span>// MENTION</span><span>enter to pick</span></div>
            {mList.map((p, i) => (
              <button key={p.id} onClick={() => pickMention(p.username)} class="hva" style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', height: '44px', padding: '0 10px', background: i === 0 ? 'var(--surface-hover)' : 'transparent', border: 0, color: 'var(--text-1)', font: 'inherit', fontSize: '13px', textAlign: 'start', cursor: 'pointer' }}>
                <span data-no-tr="1" style={{ flex: 'none', width: '28px', height: '28px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', fontFamily: 'var(--font-pixel)', fontSize: '10px' }}>{ini(p.name)}</span>
                <U style={{ flex: 1, minWidth: 0 }}>{p.name}</U>
                <U style={{ fontSize: '12px', opacity: 0.7 }}>@{p.username}</U>
              </button>
            ))}
          </div>
        )}
        {cb && (
          <div data-screen-label="Limit banner" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', margin: '8px 10px 0', padding: '8px 10px', border: '1px solid ' + cb.color, background: cb.bg, fontSize: '12px', lineHeight: 1.5 }}>
            <span style={{ flex: 'none', fontWeight: 700, color: cb.color }}>{cb.tag}</span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--text-highlight)', textWrap: 'pretty' }}>{cb.text}</span>
            {cb.actionLabel && <button onClick={() => a.set({ uploadErr: null, right: wide ? s.right : null, left: 'settings', setSec: 'storage' })} style={{ flex: 'none', padding: 0, background: 'transparent', border: 0, color: cb.color, font: 'inherit', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer' }}>{cb.actionLabel}</button>}
            {cb.close && <button onClick={() => a.set({ uploadErr: null })} aria-label="dismiss" style={{ flex: 'none', padding: 0, background: 'transparent', border: 0, color: cb.color, font: 'inherit', fontSize: '14px', lineHeight: 1, cursor: 'pointer' }}>×</button>}
          </div>
        )}
        {replyMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px 0 14px' }}>
            <span style={{ flex: 'none', fontSize: '16px', color: 'var(--accent)' }}>↩</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderInlineStart: '1px solid var(--accent)', paddingInlineStart: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>reply to <U>{replyMsg.from === me.id ? 'yourself' : e.displayName(replyMsg.from)}</U></span>
              <U style={{ fontSize: '12px', color: 'var(--text-3)', ...S.ell }}>{msgPreview(replyMsg, e)}</U>
            </div>
            <IconButton variant="ghost" size="sm" label="cancel reply" onClick={() => a.set({ replyId: null })}><Icon name="close" /></IconButton>
          </div>
        )}
        {editMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px 0 14px' }}>
            <Icon name="edit" style={{ color: 'var(--accent)' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderInlineStart: '1px solid var(--accent)', paddingInlineStart: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>editing {editMsg.body.t === 'text' ? 'message' : 'caption'}</span>
              <U style={{ fontSize: '12px', color: 'var(--text-3)', ...S.ell }}>{editMsg.body.t === 'text' ? editMsg.body.text : (editMsg.body.f || {}).n}</U>
            </div>
            <IconButton variant="ghost" size="sm" label="cancel edit" onClick={() => a.set({ editId: null, draft: '' })}><Icon name="close" /></IconButton>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '52px', boxSizing: 'border-box', padding: '0 10px' }}>
          {caps.attach !== false && <IconButton variant="ghost" label="attach" onClick={() => a.set({ attachOpen: !s.attachOpen })}><Icon name="plus" /></IconButton>}
          <Box h={36} border="var(--border-1)" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }}>
            <Inp value={s.draft} onInput={ev => { a.set({ draft: ev.target.value }); if (ev.target.value.trim() && s.editId === null) e.sendTyping(chat.id); }} data-composer="1"
              onKeyDown={ev => {
                if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); if (mList.length) return pickMention(mList[0].username); a.send(); }
                if (ev.key === 'Escape' && (s.editId !== null || s.replyId !== null)) { ev.stopPropagation(); a.set({ editId: null, replyId: null, draft: s.editId !== null ? '' : s.draft }); }
              }}
              placeholder={editMsg ? (editMsg.body.t === 'text' ? 'edit message_' : 'add a caption_') : d.isGroup ? 'message — @ to mention_' : 'message_'} />
          </Box>
          <IconButton variant="primary" label="send" onClick={() => a.send()}><Icon name="arrow-right" /></IconButton>
        </div>
      </div>
      {s.attachOpen && <>
        <div onClick={() => a.set({ attachOpen: false })} style={S.overlay(20)} />
        <div data-screen-label="Attach sheet" class="anim" style={S.sheet(21)}>
          <div style={S.sheetHead}><span style={S.pixHead}>ATTACH</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// pick source</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
            {[['photo', 'card-stack', () => imgRef.current.click()], ['file', 'file', () => fileRef.current.click()], ['video', 'folder', () => vidRef.current.click()], ['contact', 'user', () => a.set({ attachOpen: false, contactPick: true })]].map(([label, icon, fn]) => (
              <button key={label} onClick={fn} class="hva" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '18px 8px', background: 'transparent', border: 0, borderInlineEnd: '1px solid var(--border-faint)', color: 'var(--text-1)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>
                <Icon name={icon} size={24} /><span>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => a.set({ attachOpen: false })} class="hvc" style={{ width: '100%', height: '44px', background: 'transparent', border: 0, borderTop: '1px solid var(--border-faint)', color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>cancel</button>
        </div>
      </>}
      <input type="file" accept="image/*" multiple ref={imgRef} style={{ display: 'none' }} onChange={ev => { const f = [...ev.target.files]; ev.target.value = ''; a.sendFiles(f, 'image'); }} />
      <input type="file" multiple ref={fileRef} style={{ display: 'none' }} onChange={ev => { const f = [...ev.target.files]; ev.target.value = ''; a.sendFiles(f, 'file'); }} />
      <input type="file" accept="video/*" ref={vidRef} style={{ display: 'none' }} onChange={ev => { const f = [...ev.target.files]; ev.target.value = ''; a.sendFiles(f, 'file'); }} />
    </div>
  );
}

// ---------------------------------------------------------------- info

function Info({ a }) {
  const s = a.state, e = a.eng, me = e.s.me;
  const group = e.s.chats[s.peerId] && e.s.chats[s.peerId].type === 'group' ? e.s.chats[s.peerId] : null;
  const back = () => a.set(x => ({ right: x.peerBack === 'chat' && x.activeId && e.s.chats[x.activeId] ? 'chat' : null }));
  const hero = (av, title, st, actions) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '28px 16px 20px', borderBottom: '1px solid var(--border-faint)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
      {av}
      <U style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-1)' }}>{title}</U>
      <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{st}</span>
      <div style={{ display: 'flex', gap: '6px', paddingTop: '8px' }}>{actions}</div>
    </div>
  );
  const row = (k, v, noTr) => (
    <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
      <span style={S.sec}>// {k}</span>
      <span data-no-tr={noTr ? '1' : undefined} style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-1)', textWrap: 'pretty', wordBreak: 'break-word' }}>{v}</span>
    </div>
  );
  const bigAv = (name, photo) => <Av name={name} photo={photo} size={96} fs={28} border="var(--border-strong)" glow="var(--glow-md)" spacing=".06em" style={{ textShadow: 'var(--text-glow)' }} />;
  if (group) {
    const d = decorate(a, group);
    const online = group.members.filter(x => x.id === me.id || isOn(person(a, x.id))).length;
    const link = e.inviteLink(group.id);
    return (
      <div data-screen-label="Info" style={S.col}>
        <Hdr title="GROUP INFO" onBack={back} />
        <div style={S.scroll}>
          {hero(bigAv(d.initials), d.title, group.members.length + ' members · ' + online + ' online', <>
            <Button variant="primary" size="sm" onClick={() => a.openChat(group.id)}>open chat</Button>
            <Button variant="outline" size="sm" onClick={() => a.set({ inviteOpen: true, inviteSel: {}, copied: false, inviteGroup: group.id })}>add people</Button>
          </>)}
          {group.desc && row('ABOUT', group.desc, true)}
          {link && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={S.sec}>// INVITE LINK</span>
                <span data-no-tr="1" style={{ fontSize: '14px', color: 'var(--accent)', ...S.ell }}>{link.replace(/^https?:\/\//, '')}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { copyText(link); a.set({ copied: true }); setTimeout(() => a.set({ copied: false }), 1400); }}>{s.copied ? '[ OK ]' : 'copy'}</Button>
            </div>
          )}
          <div style={{ padding: '16px 16px 6px', ...S.sec }}>// {group.members.length} MEMBERS</div>
          {group.members.map(x => {
            const p = person(a, x.id), isMe = x.id === me.id;
            return (
              <div key={x.id} onClick={() => isMe ? a.goLeft('profile') : a.openPeer(x.id)} class="hv" style={{ ...S.row, padding: '8px 16px' }}>
                <Av name={p.name} photo={p.avatar ? e.avatarUrl(p.avatar) : ''} size={36} fs={11} online={isMe || isOn(p)} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <U style={{ fontSize: '14px', color: 'var(--text-1)' }}>{p.name}{isMe ? ' (you)' : ''}</U>
                  <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{isMe ? 'online' : status(p)}</span>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{x.role === 'owner' ? 'owner' : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  const p = person(a, s.peerId);
  if (!e.s.people[s.peerId]) e.ensurePeople([s.peerId]);
  const isContact = !!e.contacts()[s.peerId];
  return (
    <div data-screen-label="Info" style={S.col}>
      <Hdr title="PROFILE" onBack={back}>{isContact && <IconButton variant="ghost" label="contact options" onClick={ev => a.openMenu(ev, { type: 'contact', id: s.peerId })}>⋮</IconButton>}</Hdr>
      <div style={S.scroll}>
        {hero(bigAv(p.name, p.avatar ? e.avatarUrl(p.avatar) : ''), p.name, isOn(p) ? '● online' : status(p), <>
          <Button variant="primary" size="sm" onClick={() => a.messagePerson(s.peerId)}>message</Button>
          {!isContact && !p.gone && <Button variant="outline" size="sm" onClick={() => e.addContact(s.peerId).then(() => a.toast('+', p.name + ' added', 'to your contacts')).catch(err => a.toast('!', err.message, ''))}>add contact</Button>}
        </>)}
        {row('USERNAME', '@' + p.username, true)}
        {row('PHONE', p.phone || 'hidden by privacy settings', !!p.phone)}
        {row('BIO', p.bio || '—', true)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sheets

function SheetShell({ label, title, meta, onClose, children, foot }) {
  return <>
    <div onClick={onClose} style={S.overlay(40)} />
    <div data-screen-label={label} class="anim" style={S.sheet(41, { maxHeight: '80%' })}>
      <div style={S.sheetHead}><span style={S.pixHead}>{title}</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{meta}</span></div>
      {children}
      {foot || <button onClick={onClose} class="hvc" style={{ width: '100%', height: '44px', background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>cancel</button>}
    </div>
  </>;
}

const pickRow = (key, initials, title, sub, onClick) => (
  <button key={key} onClick={onClick} class="hva" style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '10px 12px', background: 'transparent', border: 0, borderBottom: '1px solid var(--border-faint)', color: 'var(--text-1)', font: 'inherit', fontSize: '14px', textAlign: 'start', cursor: 'pointer' }}>
    <span data-no-tr="1" style={{ flex: 'none', width: '32px', height: '32px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', fontFamily: 'var(--font-pixel)', fontSize: '10px' }}>{initials}</span>
    <U style={{ flex: 1, minWidth: 0, ...S.ell }}>{title}</U>
    <span style={{ fontSize: '11px', opacity: 0.7 }}>{sub}</span>
  </button>
);

function ForwardSheet({ a }) {
  const s = a.state, e = a.eng, m = s.fwd;
  const go = async to => {
    a.set({ fwd: null });
    try { await e.forward(m, to); a.openChat(to); } catch (err) { a.handleSendError(err); }
  };
  return (
    <SheetShell label="Forward sheet" title="FORWARD TO" meta="// pick a chat" onClose={() => a.set({ fwd: null })}>
      <div data-no-tr="1" style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--text-3)', borderBottom: '1px solid var(--border-faint)', ...S.ell }}>↪ {msgPreview(m, e)}</div>
      <div style={S.scroll}>{chatList(a).map(c => pickRow(c.id, c.initials, c.title, c.status, () => go(c.id)))}</div>
    </SheetShell>
  );
}

function ContactPick({ a }) {
  const e = a.eng, ids = Object.keys(e.contacts());
  const close = () => a.set({ contactPick: false });
  return (
    <SheetShell label="Contact sheet" title="SEND CONTACT" meta="// pick one" onClose={close}>
      <div style={S.scroll}>
        {ids.map(id => { const p = person(a, id); return pickRow(id, ini(p.name), p.name, '@' + p.username, () => { close(); e.sendContact(a.state.activeId, id).catch(err => a.handleSendError(err)); }); })}
        {!ids.length && <Empty title="NO CONTACTS" hint="// add someone to your contacts first." />}
      </div>
    </SheetShell>
  );
}

function InviteSheet({ a }) {
  const s = a.state, e = a.eng, g = e.s.chats[s.inviteGroup];
  if (!g) return null;
  const inGroup = new Set(g.members.map(x => x.id));
  const ids = Object.keys(e.contacts()).filter(id => !inGroup.has(id));
  const n = Object.values(s.inviteSel).filter(Boolean).length;
  const link = e.inviteLink(g.id);
  const close = () => a.set({ inviteOpen: false });
  const add = async () => {
    const sel = Object.keys(s.inviteSel).filter(k => s.inviteSel[k]);
    if (!sel.length) return;
    a.set({ inviteBusy: true });
    try { await e.addMembers(g.id, sel); a.set({ inviteOpen: false, inviteSel: {}, inviteBusy: false }); } catch (err) { a.set({ inviteBusy: false }); a.toast('!', err.message, ''); }
  };
  return (
    <SheetShell label="Invite sheet" title={'INVITE TO #' + (g.name || '').toUpperCase()} meta={n + ' selected'} onClose={close}
      foot={<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '10px 12px', borderTop: '1px solid var(--border-faint)' }}>
        <Button variant="ghost" block onClick={close}>cancel</Button>
        <Button variant="primary" block disabled={!n || s.inviteBusy} onClick={add}>Add</Button>
      </div>}>
      {link && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' }}>
          <Icon name="link" style={{ color: 'var(--accent)' }} />
          <span data-no-tr="1" style={{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text-2)', ...S.ell }}>{link.replace(/^https?:\/\//, '')}</span>
          <Button variant="ghost" size="sm" onClick={() => { copyText(link); a.set({ copied: true }); setTimeout(() => a.set({ copied: false }), 1400); }}>{s.copied ? '[ OK ]' : 'copy'}</Button>
        </div>
      )}
      <div style={S.scroll}>
        {ids.map(id => <SelectRow key={id} p={person(a, id)} on={!!s.inviteSel[id]} size={32} fs={10} pad="10px 12px" onToggle={() => a.set({ inviteSel: { ...s.inviteSel, [id]: !s.inviteSel[id] } })} />)}
        {!ids.length && <div style={{ padding: '16px 12px', fontSize: '12px', color: 'var(--text-3)' }}>// all contacts are already members. share the link instead.</div>}
      </div>
    </SheetShell>
  );
}
