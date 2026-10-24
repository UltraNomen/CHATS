// Left column: chat list, new group, contacts, settings (+ sub-pages), devices, profile, and the drawer.
import { Button, IconButton, Icon, Switch } from '#shared/ui/ds.jsx';
import { Hdr, Box, Inp, Field, Chips, Av, Tabs, Empty, Sec, ToggleRow, NavRow, Block, S, U } from '#shared/ui/kit.jsx';
import { fmtSize, bar } from '#shared/core/format.js';
import { chatList, person, status, isOn } from './view.js';
import { FONTS, AFTER, REPO, afterLabel } from './App.jsx';
import { CUR_VER } from './engine.js';

const SKEL = [['▓▓▓▓▓▓▓▓░░░░', '░░░░░░░░░░░░░░░░░░░░░░', 1], ['▓▓▓▓▓▓░░░░░░', '░░░░░░░░░░░░░░░', 0.8], ['▓▓▓▓▓▓▓▓▓▓░░', '░░░░░░░░░░░░░░░░░░', 0.6], ['▓▓▓▓▓░░░░░░░', '░░░░░░░░░░░░', 0.4], ['▓▓▓▓▓▓▓░░░░░', '░░░░░░░░░░░░░░░░', 0.25]];

export function tabsFor(a) {
  const unread = Object.values(a.eng.s.chats).reduce((n, c) => n + (c.unread || 0), 0);
  return <Tabs tabs={[['chats', 'list', 'message', unread], ['contacts', 'contacts', 'user', 0], ['settings', 'settings', 'sliders', 0]]} cur={a.state.left} onGo={a.goLeft} />;
}

/** Why push notifications can't be turned on, shown only in Settings → Notifications. */
const PUSH_WHY = {
  unsupported: "this browser can't receive push notifications · on iPhone and iPad, add CHATS to the home screen first",
  blocked: 'notifications are blocked for this site · allow them in your browser settings, then turn this on again',
  unreachable: "notifications aren't available right now: this browser can't reach its push service, which happens when only the domestic internet works · new messages still arrive while CHATS is open",
  offline: "couldn't reach the server · CHATS tries again the next time it starts",
  server: "the server couldn't set up notifications for this browser · new messages still arrive while CHATS is open",
};

export function LeftPane({ a }) {
  const l = a.state.left;
  if (l === 'newGroup') return <NewGroup a={a} />;
  if (l === 'contacts') return <Contacts a={a} />;
  if (l === 'settings') return <Settings a={a} />;
  if (l === 'devices') return <Devices a={a} />;
  if (l === 'profile') return <Profile a={a} />;
  return <ChatList a={a} />;
}

function Banner({ a }) {
  const ann = a.eng.s.announcements[0];
  if (!ann) return null;
  const c = ann.level === 'warn' ? ['var(--warn)', 'var(--warn-bg)'] : ['var(--info)', 'var(--info-bg)'];
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderBottom: '1px solid ' + c[0], background: c[1], fontSize: '12px', color: 'var(--text-highlight)' }}>
      <span style={{ fontWeight: 700, color: c[0] }}>[{ann.level.toUpperCase()}]</span>
      <span data-no-tr="1" style={{ flex: 1, textWrap: 'pretty' }}>{ann.body}</span>
      <button onClick={() => a.eng.dismissAnnouncement(ann.id)} aria-label="dismiss" class="hvt" style={{ flex: 'none', padding: 0, background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', cursor: 'pointer' }}>✕</button>
    </div>
  );
}

function ChatList({ a }) {
  const s = a.state, e = a.eng, wide = a.wide(), caps = (e.s.config || {}).caps || {};
  const q = s.query.toLowerCase();
  const chats = chatList(a).filter(c => (s.filter === 'all' || (s.filter === 'direct' ? !c.isGroup : c.isGroup)) && c.title.toLowerCase().includes(q));
  const known = new Set(Object.values(e.s.chats).filter(c => c.type === 'direct').map(c => c.peer));
  const found = q.replace(/^@/, '').length >= 2 ? s.found.filter(p => !known.has(p.id)) : [];
  const onQuery = ev => {
    const v = ev.target.value;
    a.set({ query: v });
    clearTimeout(a.findT);
    if (v.replace(/^@/, '').trim().length < 2) return a.set({ found: [] });
    a.findT = setTimeout(async () => { try { const r = await e.search(v.trim()); if (a.state.query === v) a.set({ found: r.users }); } catch { /* offline */ } }, 250);
  };
  const loading = !e.s.synced;
  return (
    <div data-screen-label="Chat list" style={S.col}>
      <Hdr>
        <IconButton variant="ghost" label="menu" onClick={() => a.set({ drawerOpen: true })}><Icon name="menu" /></IconButton>
        <div style={S.title}>CHATS</div>
        <IconButton variant="ghost" label="search" onClick={() => a.set({ searchOpen: !s.searchOpen, query: '', found: [] })}><Icon name="search" /></IconButton>
        {caps.groups !== false && <IconButton variant="outline" label="new group" onClick={() => a.goLeft('newGroup')}><Icon name="plus" /></IconButton>}
      </Hdr>
      <Banner a={a} />
      {s.searchOpen && <Box h={40} style={{ margin: '10px 12px 0' }}><Inp autoFocus value={s.query} onInput={onQuery} placeholder="grep chats..." data-no-tr="1" autoCapitalize="off" /></Box>}
      <nav style={{ padding: '10px 12px' }}><Chips opts={['all', 'direct', 'groups']} value={s.filter} onPick={f => a.set({ filter: f })} wrap={false} /></nav>
      <div style={S.scroll}>
        {loading && !chats.length && SKEL.map(([x, y, o], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid var(--border-faint)', opacity: o }}>
            <div style={{ flex: 'none', width: '44px', height: '44px', display: 'grid', placeItems: 'center', border: '1px dashed var(--border-faint)', fontSize: '12px', color: 'var(--border-1)' }}>░░</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
              <span style={{ color: 'var(--border-1)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{x}</span>
              <span style={{ color: 'var(--border-faint)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{y}</span>
            </div>
          </div>
        ))}
        {chats.map(c => (
          <div key={c.id} onClick={() => a.openChat(c.id)} class="hv" style={{ ...S.row, background: wide && s.activeId === c.id && s.right ? 'var(--surface-selected)' : 'transparent' }}>
            <Av name={c.isGroup ? c.initials : c.title} photo={c.photo} online={c.online} spacing=".06em" />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <U style={{ flex: 1, minWidth: 0, ...S.ell, fontSize: '14px', fontWeight: 500, color: 'var(--text-1)' }}>{c.title}</U>
                <span style={{ flex: 'none', fontSize: '11px', color: 'var(--text-3)' }}>{c.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <U style={{ flex: 1, minWidth: 0, ...S.ell, fontSize: '12px', color: 'var(--text-3)' }}>{c.preview}</U>
                {c.muted && <span style={{ flex: 'none', fontSize: '11px', color: 'var(--text-3)' }}>–</span>}
                {c.hasUnread && <span style={{ flex: 'none', minWidth: '20px', height: '18px', padding: '0 5px', display: 'grid', placeItems: 'center', background: c.muted ? 'var(--border-1)' : 'var(--accent)', color: c.muted ? 'var(--text-1)' : 'var(--accent-ink)', fontSize: '11px', fontWeight: 700, boxShadow: c.muted ? 'none' : 'var(--glow-sm)' }}>{c.unread}</span>}
              </div>
            </div>
          </div>
        ))}
        {found.length > 0 && <Sec pad="14px 16px 6px">// PEOPLE ON THIS SERVER</Sec>}
        {found.map(p => (
          <div key={p.id} onClick={() => a.openPeer(p.id)} class="hv" style={S.row}>
            <Av name={p.name} photo={p.avatar ? e.avatarUrl(p.avatar) : ''} online={isOn(p)} spacing=".06em" />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <U style={{ ...S.ell, fontSize: '14px', fontWeight: 500, color: 'var(--text-1)' }}>{p.name}</U>
              <span style={{ ...S.ell, fontSize: '12px', color: 'var(--text-3)' }}><U>@{p.username}</U> · {status(p)}</span>
            </div>
            <IconButton variant="ghost" label="message" onClick={ev => { ev.stopPropagation(); a.messagePerson(p.id); }}><Icon name="message" /></IconButton>
          </div>
        ))}
        {!loading && !chats.length && !found.length && (
          <Empty title={s.query ? 'NO RESULTS' : 'NO CHATS_'} hint={s.query ? "// grep found nothing for '" + s.query + "'. try fewer letters." : s.filter === 'groups' ? '// no groups yet. press + to make one.' : '// start one from contacts, or search an @username.'} />
        )}
      </div>
      {tabsFor(a)}
    </div>
  );
}

function SelectRow({ p, on, onToggle, size = 36, fs = 11, pad = '10px 16px' }) {
  return (
    <div onClick={onToggle} class="hv" style={{ ...S.row, padding: pad }}>
      <span style={{ flex: 'none', fontSize: '14px', color: 'var(--accent)' }}>{on ? '[x]' : '[ ]'}</span>
      <Av name={p.name} size={size} fs={fs} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <U style={{ fontSize: '14px', color: 'var(--text-1)' }}>{p.name}</U>
        <U style={{ fontSize: '12px', color: 'var(--text-3)' }}>@{p.username}</U>
      </div>
    </div>
  );
}
export { SelectRow };

function NewGroup({ a }) {
  const s = a.state, e = a.eng;
  const gq = s.groupQuery.toLowerCase();
  const ids = Object.keys(e.contacts()).filter(id => { const p = person(a, id); return (p.name + p.username).toLowerCase().includes(gq); });
  const n = Object.values(s.groupSel).filter(Boolean).length;
  const create = async () => {
    const name = s.groupName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const members = Object.keys(s.groupSel).filter(k => s.groupSel[k]);
    if (!name) return a.set({ groupErr: 'group needs a name' });
    if (!members.length) return a.set({ groupErr: 'pick at least 1 member' });
    a.set({ groupErr: '', groupBusy: true });
    try {
      const id = await e.createGroup(name, members);
      a.set({ groupName: '', groupSel: {}, groupQuery: '', left: 'list', groupBusy: false });
      a.openChat(id);
    } catch (err) { a.set({ groupErr: err.message, groupBusy: false }); }
  };
  return (
    <div data-screen-label="New group" style={S.col}>
      <Hdr title="NEW GROUP" onBack={() => a.goLeft('list')} />
      <div style={S.scroll}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px', borderBottom: '1px solid var(--border-faint)' }}>
          <Field cmd="mkgroup --name" glyph="#"><Inp value={s.groupName} onInput={ev => a.set({ groupName: ev.target.value, groupErr: '' })} placeholder="group-name" maxLength={40} data-no-tr="1" /></Field>
          <Box h={40} border="var(--border-1)"><Inp value={s.groupQuery} onInput={ev => a.set({ groupQuery: ev.target.value })} placeholder="add people..." data-no-tr="1" /></Box>
        </div>
        <Sec pad="10px 16px 6px">// MEMBERS — {n} SELECTED</Sec>
        {ids.map(id => <SelectRow key={id} p={person(a, id)} on={!!s.groupSel[id]} onToggle={() => a.set({ groupErr: '', groupSel: { ...s.groupSel, [id]: !s.groupSel[id] } })} />)}
        {!Object.keys(e.contacts()).length && <Empty title="NO CONTACTS" hint="// add people first: search an @username on the chats tab." />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px', borderTop: '1px solid var(--border-faint)' }}>
        {s.groupErr && <span style={S.err}>! {s.groupErr}</span>}
        <Button variant="primary" block disabled={s.groupBusy} onClick={create}>{s.groupBusy ? 'creating...' : 'Create group'}</Button>
      </div>
    </div>
  );
}

function Contacts({ a }) {
  const s = a.state, e = a.eng, wide = a.wide();
  const cq = s.contactQuery.toLowerCase();
  const all = Object.keys(e.contacts()).map(id => person(a, id));
  const list = all.filter(p => (p.name + p.username).toLowerCase().includes(cq)).sort((x, y) => (y.seen || 0) - (x.seen || 0));
  return (
    <div data-screen-label="Contacts" style={S.col}>
      <Hdr title="CONTACTS" onBack={() => a.goLeft('list')}><span style={{ fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>{all.length} total</span></Hdr>
      <Box h={40} border="var(--border-1)" style={{ margin: '10px 12px' }}><Inp value={s.contactQuery} onInput={ev => a.set({ contactQuery: ev.target.value })} placeholder="find contact..." data-no-tr="1" /></Box>
      <div style={S.scroll}>
        <Sec pad="6px 16px">// SORTED BY LAST SEEN</Sec>
        {list.map(p => (
          <div key={p.id} onClick={() => a.openPeer(p.id)} class="hv" style={{ ...S.row, padding: '8px', paddingInlineStart: '16px', background: wide && s.right === 'info' && s.peerId === p.id ? 'var(--surface-selected)' : 'transparent' }}>
            <Av name={p.name} photo={p.avatar ? e.avatarUrl(p.avatar) : ''} size={40} fs={12} online={isOn(p)} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <U style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)' }}>{p.name}</U>
              <span style={{ fontSize: '12px', color: 'var(--text-3)', ...S.ell }}><U>@{p.username}</U> · {status(p)}</span>
            </div>
            <IconButton variant="ghost" label="message" onClick={ev => { ev.stopPropagation(); a.messagePerson(p.id); }}><Icon name="message" /></IconButton>
            <IconButton variant="ghost" label="contact options" onClick={ev => a.openMenu(ev, { type: 'contact', id: p.id })}>⋮</IconButton>
          </div>
        ))}
        {!list.length && <Empty title="NO CONTACTS" hint={s.contactQuery ? "// nobody matches '" + s.contactQuery + "'." : '// share your handle @' + (e.s.me ? e.s.me.username : '') + ' on ' + (e.s.server ? e.s.server.host : '') + ' to get started.'} />}
      </div>
      {tabsFor(a)}
    </div>
  );
}

function MeAvatar({ a, size, fs, glow = 'var(--glow-sm)', style }) {
  const me = a.eng.s.me || {};
  const url = me.avatar ? a.eng.avatarUrl(me.avatar) : '';
  return <Av name={me.name} photo={url} size={size} fs={fs} border="var(--border-strong)" glow={glow} style={style} />;
}
export { MeAvatar };

function Settings({ a }) {
  const s = a.state, e = a.eng, me = e.s.me || {}, sec = s.setSec, srv = e.s.server || {};
  const theme = s.theme || (e.s.config && e.s.config.theme) || 'green';
  const title = sec === 'privacy' ? 'PRIVACY' : sec ? sec.toUpperCase() : 'SETTINGS';
  const devCount = s.devices ? s.devices.length : '·';
  if (sec === 'privacy' && !s.devices) e.devices().then(r => a.set({ devices: r.devices })).catch(() => {});
  const startSet = digits => a.set({ pinMode: 'set', pinDigits: digits, pin: '', pinFirst: '', pinErr: '' });
  const priv = async (k, v) => { try { await e.updateProfile({ [k]: v }); } catch (err) { a.toast('!', err.message, ''); } };
  const items = [
    ['notifications', '♪', (s.prefs.notify ? 'notify on' : 'notify off') + ' · sound ' + (s.prefs.sound ? 'on' : 'off') + ' · receipts ' + (me.receipts ? 'on' : 'off')],
    ['privacy', '⚿', (me.findable ? 'findable by id' : 'hidden from search') + ' · phrase · ' + devCount + ' devices · lock ' + (s.lock.enabled ? 'on' : 'off')],
    ['appearance', '▦', (s.lang === 'fa' ? 'فارسی' : 'english') + ' · ' + theme + ' · ' + FONTS[s.font][0] + ' · farsi ' + s.faFont],
    ['storage', '▤', 'quota and usage'],
    ['about', 'i', 'version · updates · source code'],
  ];
  const used = me.used || 0, quota = me.quota || 1, pct = used / quota;
  const sColor = pct > 0.95 ? 'var(--err)' : pct > 0.8 ? 'var(--warn)' : 'var(--accent)';
  const upd = s.upd || { st: 'idle' };
  return (
    <div data-screen-label="Settings" style={S.col}>
      <Hdr title={title} onBack={() => sec ? a.set({ setSec: null }) : a.goLeft('list')} />
      <div style={{ ...S.scroll, paddingBottom: '24px' }}>
        {!sec && <>
          <div onClick={() => a.goLeft('profile')} class="hv" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: '1px solid var(--border-faint)', cursor: 'pointer' }}>
            <MeAvatar a={a} size={48} fs={14} />
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <U style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-1)' }}>{me.name}</U>
              <U style={{ fontSize: '12px', color: 'var(--text-3)' }}>@{me.username}{me.phone ? ' · ' + me.phone : ''}</U>
            </div>
            <Icon name="chevron-right" style={{ color: 'var(--text-3)' }} />
          </div>
          {items.map(([k, glyph, hint]) => <NavRow key={k} label={k === 'privacy' ? 'privacy & security' : k} glyph={glyph} hint={hint} h={56} onClick={() => a.set({ setSec: k })} />)}
        </>}
        {sec === 'notifications' && <>
          <ToggleRow label="notifications" hint="push for new messages">
            <Switch checked={s.prefs.notify} onChange={async v => {
              if (v) {
                const why = await e.subscribePush().catch(() => 'unreachable');
                // Blocked or unsupported won't fix itself; for the rest the switch stays on and the app retries on its next start.
                if (why === 'blocked' || why === 'unsupported') return;
              } else { e.unsubscribePush().catch(() => {}); e.set({ pushProblem: '' }); }
              a.savePrefs({ ...s.prefs, notify: v });
            }} />
          </ToggleRow>
          {e.s.pushProblem && <div data-screen-label="Push unavailable" style={{ margin: '0 16px 8px', padding: '10px 12px', border: '1px dashed var(--warn)', fontSize: '12px', lineHeight: 1.6, color: 'var(--text-2)' }}>
            <span style={{ color: 'var(--warn)' }}>! </span>{PUSH_WHY[e.s.pushProblem] || PUSH_WHY.server}
          </div>}
          <ToggleRow label="sounds" hint="beep on receive"><Switch checked={s.prefs.sound} onChange={v => a.savePrefs({ ...s.prefs, sound: v })} /></ToggleRow>
          <ToggleRow label="read receipts" hint="send ✓✓ when read"><Switch checked={!!me.receipts} onChange={v => priv('receipts', v)} /></ToggleRow>
        </>}
        {sec === 'privacy' && <>
          <Sec>// PRIVACY</Sec>
          <ToggleRow h={52} label="find me by id" hint={'others can start a chat by searching @' + me.username}><Switch checked={!!me.findable} onChange={v => priv('findable', v)} /></ToggleRow>
          <ToggleRow h={52} label="show online status" hint="when off, you also can't see others' status"><Switch checked={!!me.showOnline} onChange={v => priv('showOnline', v)} /></ToggleRow>
          <Block label="phone --visible-to"><Chips opts={['everyone', 'contacts', 'nobody']} value={me.phoneVis} onPick={v => priv('phoneVis', v)} wrap={false} /></Block>
          <Sec>// SECURITY</Sec>
          <NavRow label="recovery phrase" hint="8 words · view or generate new · needs password" onClick={() => a.set({ phv: 'pw', phvPwVal: '', phvErr: '', phvNew: false })} />
          <NavRow label="devices" hint={devCount + ' active sessions'} onClick={() => a.goLeft('devices')} />
          <NavRow label="two-factor" hint={me.mfa ? 'on · authenticator app' : 'off · add an authenticator app'} onClick={() => a.set({ mfa: { step: me.mfa ? 'manage' : 'intro' } })} />
          <ToggleRow h={52} label="app lock" hint={s.lock.enabled ? s.lock.digits + '-digit · locks ' + (s.lock.after === 0 ? 'every time you open it' : 'after ' + afterLabel(s.lock.after) + ' idle') : 'ask for a passcode when the app opens'}>
            <Switch checked={s.lock.enabled} onChange={v => { if (v) startSet(s.lock.digits || 4); else { a.saveLock({ ...s.lock, enabled: false, hash: '', salt: '' }); a.set({ toast: { glyph: '⚿', text: 'app lock off', sub: '' } }); } }} />
          </ToggleRow>
          {s.lock.enabled && <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>passcode --digits</span>
              <Chips opts={[[4, '4 digit'], [6, '6 digit']]} value={s.lock.digits} onPick={d => d !== s.lock.digits && startSet(d)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>auto-lock --after</span>
              <Chips opts={AFTER} value={s.lock.after} px={10} onPick={v => a.saveLock({ ...s.lock, after: v })} />
              <span style={S.hint}>// applies to the installed app and this browser tab</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', padding: '12px 16px', borderBottom: '1px solid var(--border-faint)' }}>
              <Button variant="outline" size="sm" onClick={() => startSet(s.lock.digits)}>change passcode</Button>
              <Button variant="ghost" size="sm" onClick={() => a.set({ pinMode: 'lock', pin: '', pinErr: '' })}>lock now</Button>
            </div>
          </>}
        </>}
        {sec === 'appearance' && <>
          <Block label="language --ui"><Chips noTr opts={[['en', 'english'], ['fa', 'فارسی']]} value={s.lang} onPick={v => a.saveLook({ lang: v })} /></Block>
          <Block label="phosphor --color"><Chips opts={['green', 'lime', 'cyan', 'amber', 'pink']} value={theme} onPick={v => a.saveLook({ theme: v })} /></Block>
          <Block label="font --latin" hint={null}>
            <Chips opts={Object.keys(FONTS).map(k => [k, FONTS[k][0], FONTS[k][1] + ',monospace'])} value={s.font} onPick={v => a.saveLook({ font: v })} />
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>the quick brown fox jumps · 0123456789</span>
          </Block>
          <Block label="font --farsi --arabic">
            <Chips opts={[['system', 'system', 'Tahoma,sans-serif'], ['vazir', 'vazir', '"Vazirmatn"'], ['pixia', 'q pixia', '"Q Pixia"']]} value={s.faFont} onPick={v => a.saveLook({ faFont: v })} />
            <span dir="rtl" data-no-tr="1" style={{ fontSize: '14px', color: 'var(--text-2)', textAlign: 'start' }}>سلام، پیام‌ها رمزگذاری شده‌اند · مرحبا ۱۲۳۴</span>
          </Block>
          <ToggleRow h={52} label="scanlines" hint="crt line overlay across the app"><Switch checked={s.scanlines} onChange={v => a.saveLook({ scanlines: v })} /></ToggleRow>
        </>}
        {sec === 'storage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 16px 14px', borderBottom: '1px solid var(--border-faint)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-1)' }}>used</span><span style={{ color: sColor }}>{fmtSize(used)} / {fmtSize(quota)}</span></div>
            <div style={{ fontSize: '12px', color: sColor, whiteSpace: 'nowrap', overflow: 'hidden' }}>{bar(pct, 20)}</div>
            <span style={S.hint}>// quota set by {srv.host} · max {(e.s.config || {}).upload || 25} MB per upload</span>
          </div>
        )}
        {sec === 'about' && <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '28px 16px 20px', borderBottom: '1px solid var(--border-faint)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
            <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '32px', letterSpacing: '.14em', color: 'var(--accent)', textShadow: 'var(--text-glow-strong)' }}>CHATS</span>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{CUR_VER} · open source · end-to-end encrypted</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border-faint)' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>updates</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
              <button onClick={a.checkUpdate} disabled={upd.st === 'busy'} class="hv" style={{ height: '32px', padding: '0 12px', background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{upd.st === 'busy' ? 'checking…' : 'check for updates'}</button>
              <a href={upd.url || REPO + '/releases'} target="_blank" rel="noopener" style={{ fontSize: '12px' }}>release notes ↗</a>
            </div>
            <span style={{ fontSize: '12px', color: upd.st === 'fail' ? 'var(--err)' : upd.st === 'ok' ? 'var(--ok)' : 'var(--text-3)' }}>{upd.st === 'idle' ? 'last checked: never' : upd.st === 'busy' ? '░░░ asking github…' : upd.msg}</span>
          </div>
          <a href={REPO} target="_blank" rel="noopener" class="hv" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: '56px', padding: '0 16px', borderBottom: '1px solid var(--border-faint)', textDecoration: 'none' }}>
            <span style={{ flex: 'none', width: '32px', height: '32px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', color: 'var(--accent)', fontSize: '14px' }}>&lt;/&gt;</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>source code</span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>github.com/UltraNomen/CHATS</span>
            </div>
            <span style={{ color: 'var(--text-3)' }}>↗</span>
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '14px 16px', fontSize: '12px', color: 'var(--text-3)' }}>
            <span>// credits</span>
            <span style={{ color: 'var(--text-2)' }}>CHATS by <a href="https://github.com/UltraNomen" target="_blank" rel="noopener">UltraNomen</a> and contributors.</span>
            <span>icons: pixelarticons (MIT) · type: JetBrains Mono, Silkscreen, VT323, Vazirmatn, Q Pixia</span>
          </div>
        </>}
        {!sec && <>
          <div style={{ padding: '24px 16px 0' }}><Button variant="danger" block onClick={() => a.doLogout()}>log out</Button></div>
          <a href={REPO} target="_blank" rel="noopener" style={{ display: 'block', padding: '12px 16px', fontSize: '11px', color: 'var(--text-3)', textAlign: 'center', textDecoration: 'none' }}>CHATS {CUR_VER} · {srv.host} · github.com/UltraNomen/CHATS</a>
        </>}
      </div>
      {tabsFor(a)}
    </div>
  );
}

function Devices({ a }) {
  const s = a.state, e = a.eng;
  const load = () => e.devices().then(r => a.set({ devices: r.devices })).catch(err => a.toast('!', err.message, ''));
  if (!s.devices && !a.devLoading) { a.devLoading = true; load().finally(() => { a.devLoading = false; }); }
  const list = s.devices || [];
  const cur = list.find(d => d.current) || {};
  const others = list.filter(d => !d.current);
  const glyph = d => d.mobile ? '▯' : '▭';
  const seen = d => { const m = Math.floor((Date.now() / 1000 - d.seen) / 60); return m < 2 ? 'now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago'; };
  return (
    <div data-screen-label="Devices" style={S.col}>
      <Hdr title="DEVICES" onBack={() => a.goLeft('settings')}><span style={{ fontSize: '11px', color: 'var(--text-3)', paddingInlineEnd: '4px' }}>{list.length} active</span></Hdr>
      <div style={S.scroll}>
        <Sec>// THIS DEVICE</Sec>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', borderBottom: '1px solid var(--border-faint)', background: 'var(--surface-selected)' }}>
          <div style={{ flex: 'none', width: '40px', height: '40px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-strong)', color: 'var(--accent)', fontSize: '16px', boxShadow: 'var(--glow-sm)' }}>{glyph(cur)}</div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>this browser</span>
            <span style={{ fontSize: '11px', color: 'var(--text-3)', ...S.ell }}>{cur.ua || '…'} · {cur.where || ''}</span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--accent)' }}>● now</span>
        </div>
        <Sec pad="20px 16px 6px">// OTHER SESSIONS</Sec>
        {others.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 8px 10px 16px', borderBottom: '1px solid var(--border-faint)' }}>
            <div style={{ flex: 'none', width: '40px', height: '40px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', color: 'var(--text-2)', fontSize: '16px' }}>{glyph(d)}</div>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>{d.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', ...S.ell }}>{d.ua} · {d.where} · {seen(d)}</span>
            </div>
            {s.devConfirm === d.id ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <Button variant="danger" size="sm" onClick={async () => { await e.revokeDevice(d.id).catch(() => {}); a.set({ devConfirm: null, devices: list.filter(z => z.id !== d.id), toast: { glyph: '×', text: d.name + ' signed out', sub: 'its keys are revoked' } }); }}>revoke</Button>
                <Button variant="ghost" size="sm" onClick={() => a.set({ devConfirm: null })}>n</Button>
              </div>
            ) : <Button variant="ghost" size="sm" onClick={() => a.set({ devConfirm: d.id })}>revoke</Button>}
          </div>
        ))}
        {!others.length && <Empty title="JUST THIS ONE" hint="// other sessions show up here when you log in on another phone or browser." style={{ padding: '24px 16px' }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '12px 16px', borderTop: '1px solid var(--border-faint)' }}>
        <Button variant="danger" block disabled={!others.length} onClick={async () => { await e.revokeOthers().catch(() => {}); a.set({ devices: list.filter(d => d.current), toast: { glyph: '×', text: others.length + ' sessions signed out', sub: 'only this device remains' } }); }}>
          {others.length ? 'sign out ' + others.length + ' other session' + (others.length > 1 ? 's' : '') : 'no other sessions'}
        </Button>
      </div>
    </div>
  );
}

function Profile({ a }) {
  const s = a.state, e = a.eng, me = e.s.me || {};
  const pf = s.pf || { name: me.name || '', bio: me.bio || '', phone: me.phone || '' };
  const fileRef = { current: null };
  const setPf = k => ev => a.set({ pf: { ...pf, [k]: ev.target.value }, saved: false, profErr: '' });
  const save = async () => {
    if (!pf.name.trim()) return a.set({ profErr: 'name required' });
    try { await e.updateProfile({ name: pf.name.trim(), bio: pf.bio, phone: pf.phone.trim() }); a.set({ saved: true, pf: null }); } catch (err) { a.set({ profErr: err.message }); }
  };
  return (
    <div data-screen-label="Profile" style={S.col}>
      <Hdr title="PROFILE" onBack={() => a.goLeft('list')} />
      <div style={S.scroll}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px 16px 20px', borderBottom: '1px solid var(--border-faint)', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
          <MeAvatar a={a} size={96} fs={28} glow="var(--glow-md)" style={{ letterSpacing: '.06em', textShadow: 'var(--text-glow)' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <Button variant="outline" size="sm" onClick={() => fileRef.current && fileRef.current.click()}>{me.avatar ? 'change photo' : 'upload photo'}</Button>
            {me.avatar && <Button variant="ghost" size="sm" onClick={() => e.removeAvatar().catch(err => a.toast('!', err.message, ''))}>remove</Button>}
          </div>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" ref={fileRef} style={{ display: 'none' }}
            onChange={ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) e.uploadAvatar(f).catch(err => a.toast('!', err.message, 'photo')); }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 16px 24px' }}>
          <Field cmd="whoami --name" h={40} border="var(--border-1)"><Inp value={pf.name} onInput={setPf('name')} maxLength={80} data-no-tr="1" /></Field>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>me@chats:~$ <span style={{ color: 'var(--text-1)' }}>set --username</span></span>
            <Box glyph="@" h={40} border="var(--border-1)"><Inp value={me.username} readOnly style={{ color: 'var(--text-2)' }} data-no-tr="1" /></Box>
            <span style={S.hint}>// others find you as {(e.s.server || {}).host}/{me.username} · usernames are permanent</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>me@chats:~$ <span style={{ color: 'var(--text-1)' }}>set --phone</span></span>
            <Box h={40} border="var(--border-1)"><Inp type="tel" value={pf.phone} onInput={setPf('phone')} data-no-tr="1" /></Box>
            <span style={S.hint}>// visible to: {me.phoneVis}</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-3)' }}><span>me@chats:~$ <span style={{ color: 'var(--text-1)' }}>set --bio</span></span><span>{70 - pf.bio.length} left</span></span>
            <Box area border="var(--border-1)">
              <textarea rows={3} maxLength={70} value={pf.bio} onInput={setPf('bio')} data-no-tr="1" style={{ flex: 1, minWidth: 0, resize: 'none', background: 'transparent', border: 0, outline: 0, color: 'var(--text-1)', font: 'inherit', fontSize: '14px', lineHeight: 1.5 }} />
            </Box>
          </label>
          {s.profErr && <span style={S.err}>! {s.profErr}</span>}
          <Button variant="primary" block onClick={save}>Save</Button>
          {s.saved && <span style={S.ok}>[ OK ] wrote ~/.profile</span>}
        </div>
      </div>
    </div>
  );
}

export function Drawer({ a }) {
  const s = a.state, e = a.eng, me = e.s.me || {};
  const unread = Object.values(e.s.chats).reduce((n, c) => n + (c.unread || 0), 0);
  const nav = [['chats', 'list', 'message', unread || ''], ['new group', 'newGroup', 'plus', ''], ['contacts', 'contacts', 'user', Object.keys(e.contacts()).length], ['settings', 'settings', 'sliders', ''], ['profile', 'profile', 'edit', '']]
    .filter(n => n[1] !== 'newGroup' || ((e.s.config || {}).caps || {}).groups !== false);
  return <>
    <div onClick={() => a.set({ drawerOpen: false })} style={S.overlay(30)} />
    <aside data-screen-label="Sidebar" class="anim" style={{ position: 'absolute', top: 0, bottom: 0, insetInlineStart: 0, width: '280px', maxWidth: '82%', zIndex: 31, display: 'flex', flexDirection: 'column', background: 'var(--surface-panel)', borderInlineEnd: '1px solid var(--border-2)', boxShadow: 'var(--glow-md)' }}>
      <div onClick={() => a.goLeft('profile')} style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px 16px 16px', borderBottom: '1px solid var(--border-faint)', cursor: 'pointer', backgroundImage: 'var(--pixel-grid)', backgroundSize: '6px 6px' }}>
        <MeAvatar a={a} size={56} fs={18} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <U style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-1)' }}>{me.name}</U>
          <U style={{ fontSize: '12px', color: 'var(--text-3)' }}>@{me.username}</U>
          {me.phone && <U style={{ fontSize: '12px', color: 'var(--text-3)' }}>{me.phone}</U>}
        </div>
      </div>
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 0' }}>
        {nav.map(([label, scr, icon, count]) => {
          const on = s.left === scr;
          return (
            <button key={scr} onClick={() => a.goLeft(scr)} class={on ? '' : 'hv'} style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '48px', padding: '0 16px', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-1)', border: 0, font: 'inherit', fontSize: '14px', textAlign: 'start', cursor: 'pointer' }}>
              <Icon name={icon} style={on ? undefined : { color: 'var(--text-2)' }} /><span style={{ flex: 1 }}>{label}</span><span style={{ fontSize: '11px', color: on ? undefined : 'var(--text-3)' }}>{count}</span>
            </button>
          );
        })}
      </nav>
      <button onClick={() => a.set({ drawerOpen: false, installOpen: true })} class="hv" style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '48px', padding: '0 16px', background: 'transparent', color: 'var(--text-1)', border: 0, borderTop: '1px solid var(--border-faint)', font: 'inherit', fontSize: '14px', textAlign: 'start', cursor: 'pointer' }}>
        <Icon name="download" style={{ color: 'var(--text-2)' }} /><span style={{ flex: 1 }}>install app</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{s.install === 'done' ? '✓ installed' : 'pwa'}</span>
      </button>
      <button onClick={() => a.doLogout()} class="hve" style={{ display: 'flex', alignItems: 'center', gap: '14px', height: '48px', padding: '0 16px', background: 'transparent', color: 'var(--err)', border: 0, borderTop: '1px solid var(--border-faint)', font: 'inherit', fontSize: '14px', textAlign: 'start', cursor: 'pointer' }}>
        <Icon name="logout" /><span>log out</span>
      </button>
    </aside>
  </>;
}
