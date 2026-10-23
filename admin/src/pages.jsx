// Admin console pages. Data comes from the admin API; config pages edit `a.state.cfg` and the shell's save bar writes it.
import { Panel, ListPanel, B, ChipRow, Row, F, Fields, Banner, Table, Tr, Td, Tag, EmptyRow, TestLine, PX, grid, chipC, ONOFF, OFF3, Label } from './ui.jsx';
import { fmtSize, ago, bar, spark, utcDate, shortStamp, longStamp, fmtUptime } from '#shared/core/format.js';
import { REPO, CONSOLE_VER, inviteUrl } from './App.jsx';

export const CONFIG_PAGES = ['settings', 'database', 'storage', 'smtp', 'twofa'];

export function Pages({ a, pageKey, inWizard }) {
  const P = { overview: Overview, users: Users, user: User, reports: Reports, invites: Invites, chats: Chats, storage: Storage, settings: Settings, database: Database,
    smtp: Smtp, twofa: TwoFactor, announce: Announce, audit: Audit, admins: Admins, health: Health, owner: Owner, done: Review }[pageKey];
  return P ? <P a={a} inWizard={inWizard} /> : null;
}

const loading = <div style={{ padding: '32px 0', fontSize: '12px', color: 'var(--text-3)' }}>░░░ loading…</div>;

// ---------------------------------------------------------------- overview

function Overview({ a }) {
  const ov = a.state.d.ov;
  if (!ov) return loading;
  const delta = ov.msgsYday ? Math.round((ov.msgsToday - ov.msgsYday) / ov.msgsYday * 100) : null;
  const tiles = [
    ['USERS', ov.users.toLocaleString(), '+' + ov.usersWeek + ' this week', 'users'],
    ['ONLINE NOW', String(ov.online), spark(ov.syncsHour.slice(-7)), 'users'],
    ['MESSAGES TODAY', ov.msgsToday.toLocaleString(), delta == null ? 'no data for yesterday' : (delta >= 0 ? '+' : '') + delta + '% vs yesterday', 'audit'],
    ['ERRORS · 24H', String(ov.errors + ov.warns), ov.warns + ' warn · ' + ov.errors + ' err', 'health', ov.errors ? 'var(--err)' : null],
    ['UPTIME', fmtUptime(ov.uptime).replace(/ \d+m$/, ''), 'since last restart', 'health'],
    ['VERSION', ov.version, 'check for updates in health', 'health'],
    ['REGISTRATION', ov.reg.toUpperCase(), ov.liveInvites + ' live invite codes', 'settings'],
    ['OPEN REPORTS', String(ov.openReports.length), ov.openReports.length ? 'oldest ' + ago(ov.openReports[ov.openReports.length - 1].at) : 'queue clear', 'reports', ov.openReports.length ? 'var(--warn)' : null],
  ];
  const meter = (label, v, max, txt) => { const p = max ? v / max : 0; return { label, val: txt, bar: bar(p, 40), color: p > 0.85 ? 'var(--err)' : p > 0.7 ? 'var(--warn)' : 'var(--accent)' }; };
  const meters = [
    meter('attachments', ov.attachBytes, ov.diskTotal, fmtSize(ov.attachBytes) + ' / ' + fmtSize(ov.diskTotal)),
    meter('disk ' + ((a.state.d.cfgMeta || {}).dataDir || 'data'), ov.diskUsed, ov.diskTotal, Math.round(ov.diskUsed / (ov.diskTotal || 1) * 100) + '%'),
    ov.memPct == null ? { label: 'memory', val: 'n/a', bar: bar(0, 40), color: 'var(--text-3)' } : meter('memory', ov.memPct, 100, ov.memPct + '%'),
  ];
  const sparks = [['messages / hour · 24h', 'peak ' + Math.max(...ov.msgsHour), ov.msgsHour], ['signups / day · 14d', ov.signupsDay.reduce((x, y) => x + y, 0) + ' total', ov.signupsDay], ['sync requests / hour · 24h', 'now ' + ov.syncsHour[23], ov.syncsHour]];
  return (
    <div data-screen-label="Overview" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '10px' }}>
        {tiles.map(([label, value, sub, pg, color]) => (
          <button key={label} onClick={() => a.go(pg)} class="hvgs" style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '12px', background: 'var(--surface-panel)', border: '1px solid var(--border-1)', color: 'inherit', font: 'inherit', textAlign: 'start', cursor: 'pointer' }}>
            <span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>{label}</span>
            <span style={{ fontSize: '24px', fontWeight: 700, color: color || 'var(--text-highlight)' }}>{value}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{sub}</span>
          </button>
        ))}
      </div>
      <div style={grid(340)}>
        <Panel title="CAPACITY">
          {meters.map(m => (
            <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-2)' }}>{m.label}</span><span style={{ color: 'var(--text-highlight)' }}>{m.val}</span></div>
              <span style={{ fontSize: '13px', letterSpacing: '-1px', color: m.color, whiteSpace: 'nowrap', overflow: 'hidden' }}>{m.bar}</span>
            </div>
          ))}
        </Panel>
        <Panel title="TRAFFIC">
          {sparks.map(([label, val, arr]) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-2)' }}>{label}</span><span style={{ color: 'var(--text-highlight)' }}>{val}</span></div>
              <span style={{ fontSize: '18px', lineHeight: 1, letterSpacing: '1px', color: 'var(--accent)', textShadow: 'var(--glow-sm)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{spark(arr)}</span>
            </div>
          ))}
        </Panel>
      </div>
      <div style={grid(340)}>
        <ListPanel title="OPEN REPORTS" right={<button onClick={() => a.go('reports')} style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>view all →</button>}>
          {ov.openReports.slice(0, 3).map(r => (
            <div key={r.id} style={{ display: 'flex', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
              <span style={{ color: 'var(--err)' }}>[{r.reason.toUpperCase()}]</span>
              <span data-no-tr="1" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>@{r.author}: {r.msg}</span>
              <span style={{ color: 'var(--text-3)' }}>{ago(r.at)}</span>
            </div>
          ))}
          {!ov.openReports.length && <span style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-3)' }}>∅ queue empty</span>}
        </ListPanel>
        <ListPanel title="RECENT ACTIVITY" right={<button onClick={() => a.go('audit')} style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-2)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>audit log →</button>}>
          {ov.audit.map((x, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
              <span style={{ color: 'var(--text-3)' }}>{shortStamp(x.time)}</span><span data-no-tr="1" style={{ color: 'var(--text-highlight)' }}>{x.actor}</span>
              <span data-no-tr="1" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{x.action} {x.target}</span>
            </div>
          ))}
          {!ov.audit.length && <span style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-3)' }}>∅ nothing yet</span>}
        </ListPanel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- users

const tagsOf = u => [u.status === 'active' ? ['ACTIVE', 'var(--ok)'] : u.status === 'pending' ? ['PENDING', 'var(--warn)'] : ['DISABLED', 'var(--err)']]
  .concat(u.role !== 'user' ? [[u.role === 'owner' ? 'OWNER' : u.role === 'moderator' ? 'MOD' : 'ADMIN', 'var(--accent)']] : []);

async function userAction(a, id, action, extra = {}, msg, undo) {
  try {
    await a.call('POST', 'admin/user', { id, action, ...extra });
    a.toast(msg, undo);
    a.load(a.state.page);
    a.load('overview');
  } catch (e) { a.fail(e); }
}

function Users({ a }) {
  const s = a.state, d = s.d.users;
  const COLS = '36px minmax(140px,1.4fr) 1.4fr 1fr 1fr 0.8fr 0.6fr';
  const reload = patch => { a.setState(patch); a.load('users', patch); };
  const sortBy = k => reload({ sort: { k, d: s.sort.k === k ? -s.sort.d : 1 }, pg: 0 });
  const ind = k => s.sort.k === k ? (s.sort.d > 0 ? '▲' : '▼') : '';
  const rows = d ? d.rows : [];
  const selIds = Object.keys(s.sel).filter(k => s.sel[k]);
  const allSel = rows.length > 0 && rows.every(u => s.sel[u.id]);
  const pages = d ? Math.max(1, Math.ceil(d.total / 8)) : 1;
  const bulk = async (action, label) => {
    const ids = selIds;
    try {
      const r = await a.call('POST', 'admin/users/bulk', { ids, action });
      const inverse = { enable: 'disable', disable: 'enable' }[action];
      a.setState({ sel: {} });
      a.toast(label + ' · ' + r.count + ' users', inverse ? async () => { await a.call('POST', 'admin/users/bulk', { ids, action: inverse }); a.load('users'); } : null);
      a.load('users');
    } catch (e) { a.fail(e); }
  };
  const head = <>
    <button onClick={() => a.setState(x => { const n = { ...x.sel }; rows.forEach(u => { n[u.id] = !allSel; }); return { sel: n }; })} style={{ height: '100%', background: 'none', border: 0, color: 'var(--accent)', font: 'inherit', cursor: 'pointer' }}>{allSel ? '[x]' : selIds.length ? '[-]' : '[ ]'}</button>
    <button onClick={() => sortBy('name')} style={hbtn}>USER {ind('name')}</button><span style={{ padding: '0 8px' }}>STATUS</span>
    <button onClick={() => sortBy('created')} style={hbtn}>CREATED {ind('created')}</button><button onClick={() => sortBy('seen')} style={hbtn}>LAST SEEN {ind('seen')}</button>
    <button onClick={() => sortBy('mb')} style={hbtn}>STORAGE {ind('mb')}</button><button onClick={() => sortBy('chats')} style={hbtn}>CHATS {ind('chats')}</button>
  </>;
  return (
    <div data-screen-label="Users" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <input value={s.q} onInput={e => { a.setState({ q: e.target.value, pg: 0 }); clearTimeout(a.qT); const q = e.target.value; a.qT = setTimeout(() => a.load('users', { q, pg: 0 }), 250); }} placeholder="/ search username" data-no-tr="1" style={{ flex: 1, minWidth: '180px', maxWidth: '320px', height: '34px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', outline: 'none' }} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {[['all', 'all'], ['active', 'active'], ['disabled', 'disabled'], ['pending', 'pending'], ['admin', 'admin']].map(([k, label]) => { const c = chipC(s.filt === k); return <button key={k} onClick={() => reload({ filt: k, pg: 0 })} style={{ height: '30px', padding: '0 10px', background: c.bg, border: '1px solid var(--border-1)', color: c.fg, font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{label} ({d ? d.counts[k] : '·'})</button>; })}
        </div>
      </div>
      {selIds.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--accent)', background: 'var(--surface-selected)' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-highlight)' }}>{selIds.length} selected</span><span style={{ flex: 1 }} />
          <B h={28} onClick={() => bulk('enable', 'enabled')}>enable</B>
          <B h={28} onClick={() => bulk('disable', 'disabled')}>disable</B>
          <B h={28} onClick={() => bulk('logout', 'forced logout')}>force logout</B>
          <B h={28} kind="danger" onClick={() => a.ask({ title: 'DELETE ' + selIds.length + ' USERS', body: 'accounts, sessions and stored files are destroyed. this cannot be undone.', word: 'DELETE', label: 'delete forever', run: () => bulk('delete', 'deleted') })}>delete</B>
          <button onClick={() => a.setState({ sel: {} })} style={{ height: '28px', padding: '0 8px', background: 'transparent', border: 0, color: 'var(--text-3)', font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      <Table cols={COLS} minWidth={760} head={head}
        empty={d && !rows.length ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '36px 16px', color: 'var(--text-3)', fontSize: '12px' }}><span style={{ fontSize: '18px', color: 'var(--text-2)' }}>∅</span><span>no users match "<span data-no-tr="1">{s.q}</span>"</span><B kind="plain" h={28} onClick={() => reload({ q: '', filt: 'all' })}>clear filters</B></div> : !d ? loading : null}>
        {rows.map(u => (
          <Tr key={u.id} cols={COLS} bg={s.sel[u.id] ? 'var(--surface-selected)' : 'transparent'}>
            <button onClick={() => a.setState(x => ({ sel: { ...x.sel, [u.id]: !x.sel[u.id] } }))} style={{ height: '100%', background: 'none', border: 0, color: 'var(--accent)', font: 'inherit', cursor: 'pointer' }}>{s.sel[u.id] ? '[x]' : '[ ]'}</button>
            <button onClick={() => a.go('user', { userId: u.id })} class="hvu" data-no-tr="1" style={{ padding: '0 8px', background: 'none', border: 0, color: 'var(--text-highlight)', font: 'inherit', fontSize: '13px', textAlign: 'start', cursor: 'pointer' }}>@{u.name}</button>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '0 8px' }}>{tagsOf(u).map(([t, c]) => <Tag key={t} t={t} c={c} />)}{u.mfa && <Tag t="2FA" c="var(--text-3)" />}</div>
            <Td>{utcDate(u.created)}</Td><Td>{ago(u.seen)}</Td><Td>{fmtSize(u.bytes)}</Td><Td>{u.chats}</Td>
          </Tr>
        ))}
      </Table>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--text-3)' }}>
        <span>{d && d.total ? (s.pg * 8 + 1) + '–' + Math.min(d.total, s.pg * 8 + 8) + ' of ' + d.total : '0 results'}</span>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <B kind="plain" h={28} disabled={s.pg === 0} onClick={() => reload({ pg: s.pg - 1 })}>← prev</B>
          {Array.from({ length: Math.min(pages, 9) }, (_, i) => { const c = chipC(i === s.pg); return <button key={i} onClick={() => reload({ pg: i })} style={{ width: '28px', height: '28px', background: c.bg, border: '1px solid var(--border-1)', color: c.fg, font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{i + 1}</button>; })}
          <B kind="plain" h={28} disabled={s.pg >= pages - 1} onClick={() => reload({ pg: s.pg + 1 })}>next →</B>
        </div>
      </div>
    </div>
  );
}
const hbtn = { padding: '0 8px', background: 'none', border: 0, color: 'inherit', font: 'inherit', textAlign: 'start', cursor: 'pointer' };

function User({ a }) {
  const d = a.state.d.user;
  if (!d || d.user.id !== a.state.userId) return loading;
  const u = d.user, p = u.quota ? u.bytes / u.quota : 0;
  const dis = u.status === 'active';
  const meta = [['CREATED', utcDate(u.created)], ['LAST SEEN', ago(u.seen)], ['STORAGE', fmtSize(u.bytes)], ['CHATS', u.chats], ['DEVICES', d.devices.length]];
  return (
    <div data-screen-label="User detail" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
        <div style={{ width: '48px', height: '48px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-strong)', fontFamily: 'var(--font-pixel)', fontSize: '20px', color: 'var(--accent)' }}>{u.name[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span data-no-tr="1" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-highlight)' }}>@{u.name}</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{tagsOf(u).map(([t, c]) => <Tag key={t} t={t} c={c} />)}<span style={{ fontSize: '11px', color: 'var(--text-3)' }}>id <span data-no-tr="1">{u.id}</span></span></div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {u.status === 'pending' && <B kind="accent" onClick={() => userAction(a, u.id, 'approve', {}, '@' + u.name + ' approved')}>approve</B>}
          {u.status !== 'pending' && <B onClick={() => userAction(a, u.id, dis ? 'disable' : 'enable', {}, '@' + u.name + (dis ? ' disabled — signed out everywhere' : ' enabled'), () => userAction(a, u.id, dis ? 'enable' : 'disable', {}, 'undone'))}>{dis ? 'disable' : 'enable'}</B>}
          <B onClick={() => userAction(a, u.id, 'logout', {}, '@' + u.name + ' signed out on all devices')}>force logout</B>
          {u.role !== 'owner' && <B onClick={() => { const r = u.role === 'user' ? 'admin' : 'user'; userAction(a, u.id, 'role', { role: r }, '@' + u.name + ' is now ' + r, () => userAction(a, u.id, 'role', { role: u.role }, 'undone')); }}>{u.role === 'user' ? 'make admin' : 'make user'}</B>}
          {u.role !== 'owner' && <B kind="danger" onClick={() => a.ask({ title: 'DELETE @' + u.name.toUpperCase(), body: 'the account, its ' + d.devices.length + ' sessions and ' + fmtSize(u.bytes) + ' of stored files are destroyed. chats remain for other members.', word: u.name, label: 'delete account', run: async () => { try { await a.call('POST', 'admin/user', { id: u.id, action: 'delete' }); a.toast('@' + u.name + ' deleted'); a.go('users'); } catch (e) { a.fail(e); } } })}>delete</B>}
        </div>
      </div>
      <Banner level="info">metadata only — messages, contacts and chat names are end-to-end encrypted.</Banner>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: '10px' }}>
        {meta.map(([k, v]) => <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 12px', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}><span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>{k}</span><span style={{ fontSize: '15px', color: 'var(--text-highlight)' }}>{v}</span></div>)}
      </div>
      <div style={grid(340)}>
        <ListPanel title="DEVICES">
          {d.devices.map(dv => (
            <div key={dv.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--border-faint)' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-highlight)' }}>{dv.name}</span><span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--text-3)' }}>{dv.where} · {ago(dv.last)}</span></div>
              <B kind="danger" h={28} onClick={() => userAction(a, u.id, 'revoke', { session: dv.id }, 'session revoked')}>revoke</B>
            </div>
          ))}
          {!d.devices.length && <span style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-3)' }}>∅ no active sessions</span>}
        </ListPanel>
        <Panel title="QUOTA">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-2)' }}>{fmtSize(u.bytes)} of {fmtSize(u.quota)}</span><span style={{ color: 'var(--text-highlight)' }}>{Math.round(p * 100)}%</span></div>
          <span style={{ letterSpacing: '-1px', color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{bar(p, 40)}</span>
          <ChipRow h={28} opts={[[0, 'server default'], [512, '512 MB'], [1024, '1 GB'], [2048, '2 GB'], [4096, '4 GB'], [10240, '10 GB']]} value={u.customQuota} onPick={v => userAction(a, u.id, 'quota', { mb: v }, 'quota set to ' + (v ? fmtSize(v * 1048576) : 'server default'))} />
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reports

function Reports({ a }) {
  const s = a.state, d = s.d.reports;
  if (!d) return loading;
  const list = d.reports.filter(r => s.repFilt === 'open' ? r.status === 'open' : r.status !== 'open');
  const resolve = async (r, action, label) => {
    try {
      await a.call('POST', 'admin/report', { id: r.id, action });
      a.toast(r.id + ' · ' + label, async () => { await a.call('POST', 'admin/report', { id: r.id, action: 'undo' }); a.load('reports'); a.load('overview'); });
      a.load('reports');
      a.load('overview');
    } catch (e) { a.fail(e); }
  };
  return (
    <div data-screen-label="Reports" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {!d.reporting && <Banner>user reports are turned off — clients hide the report option. turn on in server settings.</Banner>}
      <div style={{ display: 'flex', gap: '4px' }}>
        {[['open', 'open'], ['resolved', 'resolved']].map(([k, label]) => { const c = chipC(s.repFilt === k); return <button key={k} onClick={() => a.setState({ repFilt: k })} style={{ height: '30px', padding: '0 10px', background: c.bg, border: '1px solid var(--border-1)', color: c.fg, font: 'inherit', fontSize: '12px', cursor: 'pointer' }}>{label} ({d.reports.filter(r => k === 'open' ? r.status === 'open' : r.status !== 'open').length})</button>; })}
      </div>
      {list.map(r => (
        <div key={r.id} style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
            <span style={{ fontWeight: 700, color: 'var(--err)' }}>[{r.reason.toUpperCase()}]</span>
            <span style={{ color: 'var(--text-2)' }}>reported by <span data-no-tr="1" style={{ color: 'var(--text-highlight)' }}>@{r.reporter}</span></span>
            <span style={{ flex: 1 }} /><span style={{ color: 'var(--text-3)' }}>#{r.id} · {ago(r.at)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', border: '1px dashed var(--border-2)', background: 'var(--bg-0)' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}><span data-no-tr="1">@{r.author} · in {r.chat.slice(0, 8)}…</span> · decrypted by reporter</span>
              <span data-no-tr="1" style={{ color: 'var(--text-highlight)', whiteSpace: 'pre-wrap' }}>{r.msg}</span>
            </div>
            {r.note && <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>note: "<span data-no-tr="1">{r.note}</span>"</span>}
            {r.status !== 'open' && <span style={{ fontSize: '12px', color: 'var(--ok)' }}>✓ <span data-no-tr="1">{r.outcome}</span></span>}
          </div>
          {r.status === 'open' && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 14px 12px' }}>
              <B onClick={() => resolve(r, 'dismiss', 'dismissed')}>dismiss</B>
              <B kind="warn" onClick={() => resolve(r, 'warn', 'warned @' + r.author)}>warn @<span data-no-tr="1">{r.author}</span></B>
              <B kind="danger" onClick={() => resolve(r, 'delete', 'message deleted')}>delete message</B>
              <B kind="solidDanger" onClick={() => resolve(r, 'disable', 'disabled @' + r.author)}>disable user</B>
            </div>
          )}
        </div>
      ))}
      {!list.length && <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '40px 16px', border: '1px dashed var(--border-1)', color: 'var(--text-3)', fontSize: '12px' }}><span style={{ fontSize: '18px', color: 'var(--text-2)' }}>∅</span><span>nothing here — the queue is clear</span></div>}
    </div>
  );
}

// ---------------------------------------------------------------- invites & chats

function Invites({ a }) {
  const s = a.state, list = s.d.invites;
  if (!list) return loading;
  const COLS = '1.4fr 0.8fr 1fr 0.8fr 0.8fr 150px';
  const status = i => i.revoked ? 'REVOKED' : i.exp && i.exp < Date.now() / 1000 ? 'EXPIRED' : i.max && i.used >= i.max ? 'USED UP' : 'LIVE';
  const live = list.filter(i => status(i) === 'LIVE').length;
  const linkOf = code => inviteUrl(a.api, code, s.info);
  return (
    <div data-screen-label="Invites" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        <span style={{ flex: 1, fontSize: '12px', color: 'var(--text-2)' }}>{live} live · {list.length} total · registration {(s.cfgSaved || {}).server ? s.cfgSaved.server.reg : ((s.d.ov || {}).reg || '')}</span>
        <button onClick={() => a.setState({ invNew: { label: '', uses: '5', exp: '7d', quota: 'default', approve: false, preview: false, code: null } })} class="hvg" style={{ height: '34px', padding: '0 14px', background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>+ create code</button>
      </div>
      <Table cols={COLS} minWidth={680} head={<><span style={{ padding: '0 12px' }}>CODE</span><span style={{ padding: '0 8px' }}>USES</span><span style={{ padding: '0 8px' }}>EXPIRES</span><span style={{ padding: '0 8px' }}>BY</span><span style={{ padding: '0 8px' }}>STATUS</span><span /></>}
        empty={!list.length ? <EmptyRow>∅ no invite codes yet — create one above</EmptyRow> : null}>
        {list.map(i => {
          const st = status(i);
          return (
            <Tr key={i.code} cols={COLS}>
              <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column' }}><span data-no-tr="1" style={{ color: 'var(--text-highlight)', letterSpacing: '.06em' }}>{i.code}</span><span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--text-3)' }}>{i.label || 'by @' + i.by}{i.approve ? ' · approval' : ''}</span></div>
              <Td>{i.used} / {i.max || '∞'}</Td><Td>{!i.exp ? 'never' : i.exp < Date.now() / 1000 ? 'expired' : 'in ' + ago(Date.now() / 1000 - (i.exp - Date.now() / 1000)).replace(' ago', '')}</Td>
              <Td noTr>{i.by}</Td><span style={{ padding: '0 8px', fontWeight: 700, fontSize: '11px', color: st === 'LIVE' ? 'var(--ok)' : 'var(--text-3)' }}>[{st}]</span>
              <div style={{ display: 'flex', gap: '4px', paddingInlineEnd: '8px', justifyContent: 'flex-end' }}>
                <B kind="plain" h={26} style={{ fontSize: '11px', padding: '0 8px' }} onClick={() => { navigator.clipboard.writeText(linkOf(i.code)).catch(() => {}); a.setState({ copiedCode: i.code }); setTimeout(() => a.setState({ copiedCode: null }), 1500); }}>{s.copiedCode === i.code ? '✓ copied' : 'copy link'}</B>
                {st === 'LIVE' && <B kind="danger" h={26} style={{ fontSize: '11px', padding: '0 8px' }} onClick={async () => { try { await a.call('POST', 'admin/invite/revoke', { code: i.code }); a.toast(i.code + ' revoked'); a.load('invites'); } catch (e) { a.fail(e); } }}>revoke</B>}
              </div>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

function Chats({ a }) {
  const list = a.state.d.chats;
  if (!list) return loading;
  const COLS = '1.4fr 0.8fr 0.8fr 0.8fr 1fr 90px';
  return (
    <div data-screen-label="Chats" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Banner level="info">chat names, members and content are encrypted. only opaque ids and sizes are shown.</Banner>
      <Table cols={COLS} minWidth={620} head={<><span style={{ padding: '0 12px' }}>CHAT ID</span><span style={{ padding: '0 8px' }}>TYPE</span><span style={{ padding: '0 8px' }}>MEMBERS</span><span style={{ padding: '0 8px' }}>SIZE</span><span style={{ padding: '0 8px' }}>LAST ACTIVITY</span><span /></>}
        empty={!list.length ? <EmptyRow>∅ no chats on this server</EmptyRow> : null}>
        {list.map(c => {
          const short = c.id.slice(0, 6) + '…' + c.id.slice(-2);
          return (
            <Tr key={c.id} cols={COLS}>
              <Td c="var(--text-highlight)" pad="0 12px" noTr>{short}</Td><Td>{c.type}</Td><Td>{c.members}</Td><Td>{fmtSize(c.size)}</Td><Td>{ago(c.last)}</Td>
              <div style={{ paddingInlineEnd: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                <B kind="danger" h={26} style={{ fontSize: '11px', padding: '0 8px' }} onClick={() => a.ask({ title: 'DELETE CHAT', body: 'all ' + c.members + ' members lose this chat and its ' + fmtSize(c.size) + ' of attachments.', word: c.id.slice(0, 6), label: 'delete chat',
                  run: async () => { try { await a.call('POST', 'admin/chat/delete', { id: c.id }); a.toast('chat ' + short + ' deleted'); a.load('chats'); } catch (e) { a.fail(e); } } })}>delete</B>
              </div>
            </Tr>
          );
        })}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------- storage

const S3P = { aws: ['aws s3', 'https://s3.amazonaws.com'], minio: ['minio', 'https://minio.internal:9000'], r2: ['cloudflare r2', 'https://<account>.r2.cloudflarestorage.com'], b2: ['backblaze b2', 'https://s3.us-west-004.backblazeb2.com'], other: ['other', ''] };

function Storage({ a, inWizard }) {
  const envSt = inWizard && a.state.preset && a.state.preset.storage;
  const s = a.state, c = s.cfg.storage, d = s.d.storage, set = (k, v) => a.setCfg('storage', k, v);
  const pw = s.showPw ? 'text' : 'password';
  const changed = !inWizard && s.cfgSaved && c.backend !== s.cfgSaved.storage.backend;
  const orph = s.orphan;
  const runOrphan = async () => {
    try {
      if (!orph || orph.st === 'done') { a.setState({ orphan: { st: 'scan' } }); const r = await a.call('POST', 'admin/orphans', {}); a.setState({ orphan: { st: 'found', ...r } }); }
      else if (orph.st === 'found') { const r = await a.call('POST', 'admin/orphans', { delete: true }); a.setState({ orphan: { st: 'done', ...r } }); a.toast(fmtSize(r.bytes) + ' freed'); a.load('storage'); }
    } catch (e) { a.setState({ orphan: null }); a.fail(e); }
  };
  const lastO = d && d.lastOrphan;
  const orphanText = !orph ? 'blobs no longer referenced by any chat' + (lastO ? ' · last run ' + ago(lastO.at) + ', freed ' + fmtSize(lastO.freed) : '') : orph.st === 'scan' ? 'scanning…' : orph.st === 'found' ? orph.count + ' orphaned blobs found · ' + fmtSize(orph.bytes) + ' reclaimable' : '✓ ' + orph.count + ' blobs removed · ' + fmtSize(orph.bytes) + ' freed';
  return (
    <div data-screen-label="Storage" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Panel title="BACKEND">
        {envSt && <Banner level="info">pre-filled from the server environment (CHATS_S3_*){envSt.secretSet ? ' · the secret key stays on the server' : ''}</Banner>}
        <ChipRow opts={[['local', 'local filesystem'], ['s3', 's3-compatible']]} value={c.backend} onPick={v => set('backend', v)} />
        {c.backend === 'local' && <Fields><F label="DIRECTORY" value={c.path} ph={((s.d.cfgMeta || {}).dataDir || (s.info || {}).dataDir || '/var/lib/chats') + '/blobs'} onInput={v => set('path', v)} hint={'writable by the web server user' + (d && d.free != null ? ' · ' + fmtSize(d.free) + ' free on this volume' : '')} /></Fields>}
        {c.backend === 's3' && <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>PROVIDER</Label>
            <ChipRow opts={Object.keys(S3P).map(k => [k, S3P[k][0]])} value={c.s3Provider} onPick={k => a.setState(x => ({ cfg: { ...x.cfg, storage: { ...x.cfg.storage, s3Provider: k, endpoint: S3P[k][1] || x.cfg.storage.endpoint, pathStyle: k === 'minio' || k === 'other' } } }))} />
          </div>
          <Fields>
            <F label="ENDPOINT" value={c.endpoint} ph={S3P[c.s3Provider][1]} onInput={v => set('endpoint', v)} /><F label="REGION" value={c.region} onInput={v => set('region', v)} /><F label="BUCKET" value={c.bucket} onInput={v => set('bucket', v)} />
            <F label="ACCESS KEY ID" value={c.key} onInput={v => set('key', v)} /><F label="SECRET ACCESS KEY" type={pw} ph={envSt && envSt.secretSet ? 'set by the server environment' : '••••••••'} value={c.secret} onInput={v => set('secret', v)} />
          </Fields>
          <B kind="plain" h={26} style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '0 8px', color: 'var(--text-2)' }} onClick={() => a.setState({ showPw: !s.showPw })}>{s.showPw ? 'hide secrets' : 'show secrets'}</B>
          <div><Row label="path-style urls" hint="needed for minio and most self-hosted s3" opts={ONOFF} value={c.pathStyle} onPick={v => set('pathStyle', v)} /></div>
        </>}
        {changed && <Banner>existing blobs stay on the old backend and keep working · new uploads go to the new one.</Banner>}
        <TestLine t={s.tests.storage} idle="test storage" onRun={() => a.runTest('storage', { what: 'storage', storage: c })} />
      </Panel>
      {!inWizard && d && <>
        <Panel>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-2)' }}>attachments volume · {d.count} objects</span><span style={{ color: 'var(--text-highlight)' }}>{fmtSize(d.total)}{d.free != null ? ' / ' + fmtSize(d.total + d.free) : ''}</span></div>
          <span style={{ letterSpacing: '-1px', color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', fontSize: '14px' }}>{bar(d.free != null ? d.total / (d.total + d.free) : 0, 60)}</span>
        </Panel>
        <div style={grid(360)}>
          <ListPanel title="USAGE PER USER">
            {d.users.map(u => { const p = u.quota ? u.bytes / u.quota : 0; return (
              <button key={u.id} onClick={() => a.go('user', { userId: u.id })} class="hv" style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px', alignItems: 'center', gap: '8px', padding: '7px 14px', background: 'transparent', border: 0, borderBottom: '1px solid var(--border-faint)', color: 'inherit', font: 'inherit', fontSize: '12px', textAlign: 'start', cursor: 'pointer' }}>
                <span data-no-tr="1" style={{ color: 'var(--text-highlight)', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{u.name}</span>
                <span style={{ letterSpacing: '-1px', color: p > 0.85 ? 'var(--err)' : p > 0.7 ? 'var(--warn)' : 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{bar(p, 24)}</span>
                <span style={{ color: 'var(--text-3)', textAlign: 'end' }}>{fmtSize(u.bytes)} / {fmtSize(u.quota)}</span>
              </button>
            ); })}
          </ListPanel>
          <ListPanel title="LARGEST FILES">
            {d.files.map(f => (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', alignItems: 'center', gap: '8px', padding: '7px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
                <span data-no-tr="1" style={{ color: 'var(--text-highlight)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.id.slice(0, 7)}…{f.id.slice(-2)}</span><span style={{ color: 'var(--text-2)' }}>{fmtSize(f.size)}</span><span style={{ color: 'var(--text-3)' }}>{ago(f.at).replace(' ago', '')}</span>
                <B kind="danger" h={24} style={{ fontSize: '11px', padding: '0 6px' }} onClick={() => a.ask({ title: 'DELETE BLOB', body: 'the encrypted file is removed from storage. messages that point to it will show it as missing.', word: f.id.slice(0, 6), label: 'delete blob', run: async () => { try { await a.call('POST', 'admin/blob/delete', { id: f.id }); a.toast('blob deleted · ' + fmtSize(f.size) + ' freed'); a.load('storage'); } catch (e) { a.fail(e); } } })}>delete</B>
              </div>
            ))}
            {!d.files.length && <span style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-3)' }}>∅ no stored files</span>}
            <span style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--text-3)' }}>encrypted blobs · size only, no names or types</span>
          </ListPanel>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '14px', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={PX}>ORPHAN CLEANUP</span><span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{orphanText}</span></div>
          <B kind="accent" h={34} disabled={orph && orph.st === 'scan'} onClick={runOrphan} style={{ padding: '0 14px' }}>{!orph || orph.st === 'done' ? 'scan' : orph.st === 'scan' ? 'scanning…' : 'delete ' + orph.count + ' blobs'}</B>
        </div>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- server settings

const THEMES = { green: 'var(--green-300)', lime: 'var(--lime-300)', cyan: 'var(--cyan-300)', amber: 'var(--amber-300)', pink: '#ff7ad9' };

function Settings({ a, inWizard }) {
  const s = a.state, c = s.cfg.server, set = (k, v) => a.setCfg('server', k, v), smtpOn = s.cfg.smtp.on;
  const inputS = { height: '36px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', fontSize: '13px', letterSpacing: 0, outline: 'none' };
  const lbl = { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' };
  const limits = [['upload', 'max upload size', 'MB'], ['quota', 'storage per user', 'MB'], ['group', 'max group size', 'members'], ['rate', 'rate limit', 'msg/min']];
  const vapid = (s.d.cfgMeta || {}).vapid;
  return (
    <div data-screen-label="Server settings" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={grid(380)}>
        <Panel title="IDENTITY">
          <label style={lbl}>SERVER NAME<input value={c.name} onInput={e => set('name', e.target.value)} data-no-tr="1" style={inputS} /></label>
          <label style={lbl}>WELCOME MESSAGE<textarea value={c.welcome} onInput={e => set('welcome', e.target.value)} rows={3} data-no-tr="1" style={{ ...inputS, height: 'auto', padding: '8px 10px', resize: 'vertical' }} /></label>
          <label style={lbl}>CHAT APP ADDRESS (OPTIONAL)<input value={c.clientUrl || ''} onInput={e => set('clientUrl', e.target.value.trim())} placeholder="https://app.example.org" data-no-tr="1" style={inputS} />
            <span style={{ fontSize: '11px', letterSpacing: 0, color: 'var(--text-3)' }}>only if the chat app is hosted somewhere other than this server · invite links open it there</span></label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>REGISTRATION</Label><ChipRow flex h={32} opts={['open', 'invite', 'closed']} value={c.reg} onPick={v => set('reg', v)} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>DEFAULT CLIENT THEME</Label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {Object.keys(THEMES).map(k => <button key={k} onClick={() => set('theme', k)} title={k} style={{ width: '40px', height: '32px', background: THEMES[k], border: '2px solid ' + (c.theme === k ? 'var(--text-highlight)' : 'transparent'), outline: '1px solid var(--bg-0)', outlineOffset: '-4px', cursor: 'pointer' }} />)}
              <span style={{ alignSelf: 'center', fontSize: '12px', color: 'var(--text-2)' }}>{c.theme}</span>
            </div>
          </div>
        </Panel>
        <Panel title="LIMITS">
          {limits.map(([k, label, unit]) => (
            <label key={k} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 60px', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-2)' }}>{label}
              <input value={c[k]} onInput={e => set(k, e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" style={{ height: '32px', padding: '0 8px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', textAlign: 'end', outline: 'none' }} />
              <span style={{ color: 'var(--text-3)' }}>{unit}</span>
            </label>
          ))}
          <span style={{ ...PX, paddingTop: '6px' }}>PUSH</span>
          {[['web push (VAPID)', vapid || inWizard ? 'CONFIGURED' : 'NOT SET', vapid || inWizard ? 'var(--ok)' : 'var(--text-3)'], ['APNs relay', 'NOT NEEDED', 'var(--text-3)'], ['FCM', 'NOT NEEDED', 'var(--text-3)']].map(([k, v, col]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}><span style={{ color: 'var(--text-2)' }}>{k}</span><span style={{ fontWeight: 700, color: col }}>[{v}]</span></div>
          ))}
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// installed PWAs get push through each browser's own push service · no apple or google keys needed</span>
        </Panel>
      </div>
      <div style={grid(380)}>
        <Panel title="SIGN-UP FIELDS">
          <div>
            <Row label="username" hint="unique handle · how contacts find you" lock="ALWAYS ON" />
            <Row label="password" hint="min 6 chars · stretched with argon2id on the device" lock="ALWAYS ON" />
            <Row label="email" hint={smtpOn ? 'used for verification and password reset' : 'stored only · not verified until smtp is set up'} opts={OFF3} value={c.emailField} onPick={v => set('emailField', v)} />
            <Row label="phone number" hint="shown as a contact handle · no sms verification" opts={OFF3} value={c.phoneField} onPick={v => set('phoneField', v)} />
          </div>
        </Panel>
        <Panel title="REPORTS">
          <div>
            <Row label="user reports" hint="users can flag messages to the reports queue" opts={ONOFF} value={c.reporting} onPick={v => set('reporting', v)} />
            <Row label="auto-hide message" hint={c.reporting ? 'hide a message pending review after this many reports' : 'turn on reports first'} opts={[['off', 'off'], ['3', '3'], ['5', '5'], ['10', '10']]} value={c.reportHide} onPick={v => set('reportHide', v)} disabled={() => !c.reporting} />
            <Row label="reporter identity" hint="admins see who reported" lock="VISIBLE" />
          </div>
        </Panel>
        <Panel title="USER CAPABILITIES" right={<span style={{ fontSize: '11px', color: 'var(--text-3)' }}>off = hidden in the chat app</span>}>
          <div>
            <Row label="edit sent messages" hint="senders can change a message after sending" opts={ONOFF} value={c.capEdit} onPick={v => set('capEdit', v)} />
            <Row label="edit window" hint={c.capEdit ? 'how long after sending a message stays editable' : 'turn on editing first'} opts={[['15', '15 min'], ['60', '1 hour'], ['1440', '24 h'], ['always', 'always']]} value={c.editWindow} onPick={v => set('editWindow', v)} disabled={() => !c.capEdit} />
            <Row label="delete own messages" hint="removes the message for everyone in the chat" opts={ONOFF} value={c.capDelete} onPick={v => set('capDelete', v)} />
            <Row label="forward messages" hint='forward to other chats · keeps "forwarded from"' opts={ONOFF} value={c.capForward} onPick={v => set('capForward', v)} />
            <Row label="send attachments" hint="photos, files and voice · upload limit applies" opts={ONOFF} value={c.capAttach} onPick={v => set('capAttach', v)} />
            <Row label="create groups" hint="when off, only admins can create groups" opts={ONOFF} value={c.capGroups} onPick={v => set('capGroups', v)} />
          </div>
        </Panel>
      </div>
      {!inWizard && (
        <Panel border={c.maint ? 'var(--warn)' : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={PX}>MAINTENANCE MODE</span><span style={{ fontSize: '12px', color: 'var(--text-2)' }}>clients are shown a maintenance screen; admins stay signed in</span></div>
            <button onClick={() => set('maint', !c.maint)} aria-label="maintenance mode" style={{ width: '52px', height: '26px', padding: '2px', display: 'flex', justifyContent: c.maint ? 'flex-end' : 'flex-start', background: c.maint ? 'var(--warn)' : 'var(--bg-0)', border: '1px solid var(--border-2)', cursor: 'pointer' }}><span style={{ width: '20px', height: '20px', background: 'var(--text-highlight)' }} /></button>
          </div>
          <input value={c.maintMsg} onInput={e => set('maintMsg', e.target.value)} placeholder="message shown to users" data-no-tr="1" style={{ height: '34px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', outline: 'none' }} />
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- database

const DBN = { json: 'local json', sqlite: 'sqlite', postgres: 'postgresql', mysql: 'mysql / mariadb' };

function Database({ a, inWizard }) {
  const s = a.state, c = s.cfg.db, set = (k, v) => a.setCfg('db', k, v);
  const meta = s.d.cfgMeta || {};
  const drivers = meta.drivers || (s.setupInfo && s.setupInfo.drivers) || {};
  const env = inWizard && s.preset && s.preset.db;
  const net = c.engine === 'postgres' || c.engine === 'mysql';
  const saved = s.cfgSaved && s.cfgSaved.db;
  const moving = !inWizard && saved && (c.engine !== saved.engine || (net ? c.host !== saved.host || c.port !== saved.port || c.name !== saved.name : c.path !== saved.path));
  const desc = { json: 'one file, loaded into memory. for testing and very small servers.', sqlite: 'one file, zero setup. good for up to a few hundred active users.', postgres: 'recommended for production and for running more than one app instance.', mysql: 'supported for existing mysql or mariadb setups.' }[c.engine];
  return (
    <div data-screen-label="Database" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Panel title="ENGINE">
        <ChipRow opts={Object.entries(DBN)} value={c.engine} disabled={v => v === 'json' || (drivers[v] === false)}
          onPick={v => a.setState(x => ({ cfg: { ...x.cfg, db: { ...x.cfg.db, engine: v, ...(v === 'mysql' ? { port: '3306' } : v === 'postgres' ? { port: '5432' } : {}) } } }))} />
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{desc}{!inWizard && meta.dbVersion ? ' · running ' + meta.dbVersion + ' · ' + fmtSize(meta.dbSize || 0) : ''}</span>
        {Object.entries(drivers).some(([, ok]) => !ok) && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// greyed out: php is missing {Object.entries(drivers).filter(([, ok]) => !ok).map(([k]) => 'pdo_' + (k === 'postgres' ? 'pgsql' : k)).join(', ')} · json is not part of this build</span>}
      </Panel>
      <Panel title="CONNECTION">
        {env && <Banner level="info">pre-filled from the server environment (CHATS_DB_*){env.passSet ? ' · the password stays on the server' : ''}</Banner>}
        {c.engine === 'sqlite' && <>
          <Fields><F label="FILE PATH" value={c.path} ph={(meta.dataDir || (s.info && s.info.dataDir) || '/var/lib/chats') + '/chats.db'} onInput={v => set('path', v)} hint="created if missing · keep on local disk, not nfs" /></Fields>
          <div><Row label="write-ahead log (WAL)" hint="faster reads while writing" opts={ONOFF} value={c.wal} onPick={v => set('wal', v)} /></div>
        </>}
        {net && <>
          <Fields>
            <F label="HOST" value={c.host} ph="localhost" onInput={v => set('host', v)} /><F label="PORT" value={c.port} num onInput={v => set('port', v)} /><F label="DATABASE" value={c.name} onInput={v => set('name', v)} />
            <F label="USER" value={c.user} onInput={v => set('user', v)} /><F label="PASSWORD" type={s.showPw ? 'text' : 'password'} ph={env && env.passSet ? 'set by the server environment' : '••••••••'} value={c.pass} onInput={v => set('pass', v)} />
            <F label="POOL SIZE" value={c.pool} num onInput={v => set('pool', v)} hint="connections per app instance (php opens one per request)" />
          </Fields>
          <B kind="plain" h={26} style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '0 8px', color: 'var(--text-2)' }} onClick={() => a.setState({ showPw: !s.showPw })}>{s.showPw ? 'hide secrets' : 'show secrets'}</B>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>TLS / SSL MODE</Label><ChipRow opts={['disable', 'require', 'verify-full']} value={c.ssl} onPick={v => set('ssl', v)} /></div>
        </>}
        {moving && <Banner>saving copies every row from {DBN[saved.engine]} into {DBN[c.engine]}{meta.dbSize ? ' (≈' + fmtSize(meta.dbSize) + ')' : ''} and switches over. the target must be empty. run a backup first.</Banner>}
        <TestLine t={s.tests.db} idle="test connection" onRun={() => a.runTest('db', { what: 'db', db: c })} />
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- smtp

function Smtp({ a }) {
  const s = a.state, c = s.cfg.smtp, set = (k, v) => a.setCfg('smtp', k, v);
  return (
    <div data-screen-label="SMTP" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Panel title="OUTGOING EMAIL">
        <div><Row label="outgoing email" hint="2fa codes, admin alerts and test messages" opts={ONOFF} value={c.on} onPick={v => set('on', v)} /></div>
        {!c.on && <Banner level="info">without email, users recover accounts with their recovery phrase only. email fields are stored but never verified.</Banner>}
      </Panel>
      {c.on && <>
        <Panel title="SERVER">
          <Fields>
            <F label="HOST" value={c.host} ph="smtp.example.com" onInput={v => set('host', v)} /><F label="PORT" value={c.port} num onInput={v => set('port', v)} />
            <F label="USERNAME" value={c.user} onInput={v => set('user', v)} /><F label="PASSWORD" type={s.showPw ? 'text' : 'password'} ph="••••••••" value={c.pass} onInput={v => set('pass', v)} />
            <F label="FROM NAME" value={c.fromName} onInput={v => set('fromName', v)} /><F label="FROM ADDRESS" value={c.from} ph={'no-reply@' + new URL(a.api.base).hostname} onInput={v => set('from', v)} />
          </Fields>
          <B kind="plain" h={26} style={{ alignSelf: 'flex-start', fontSize: '11px', padding: '0 8px', color: 'var(--text-2)' }} onClick={() => a.setState({ showPw: !s.showPw })}>{s.showPw ? 'hide secrets' : 'show secrets'}</B>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>SECURITY</Label>
            <ChipRow opts={[['none', 'none'], ['starttls', 'starttls'], ['tls', 'tls / ssl']]} value={c.sec} onPick={v => a.setState(x => ({ cfg: { ...x.cfg, smtp: { ...x.cfg.smtp, sec: v, port: v === 'tls' ? '465' : v === 'starttls' ? '587' : '25' } } }))} />
          </div>
        </Panel>
        <Panel title="TEST">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}><input value={s.testTo} onInput={e => a.setState({ testTo: e.target.value })} placeholder="you@example.com" data-no-tr="1" style={{ flex: 1, minWidth: '200px', maxWidth: '320px', height: '34px', padding: '0 10px', background: 'var(--surface-input)', border: '1px dashed var(--border-1)', color: 'var(--text-highlight)', outline: 'none' }} /></div>
          <TestLine t={s.tests.smtp} idle="send test email" onRun={() => a.runTest('smtp', { what: 'smtp', smtp: c, to: s.testTo })} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', color: 'var(--text-3)' }}>{['email 2fa codes', 'admin alerts', 'test messages'].map(u => <span key={u}>[x] {u}</span>)}</div>
        </Panel>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- two-factor

function TwoFactor({ a, inWizard }) {
  const s = a.state, c = s.cfg.server, set = (k, v) => a.setCfg('server', k, v), smtpOn = s.cfg.smtp.on;
  const adm = s.d.admins;
  const me = s.me || {};
  const missing = adm ? adm.admins.filter(x => !x.totp).map(x => '@' + x.name).join(', ') : '';
  return (
    <div data-screen-label="Two-factor" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Panel title="POLICY">
        <div>
          <Row label="admins" hint="console & app sign-in for staff" opts={[['optional', 'optional'], ['required', 'required']]} value={c.tfaAdmins || 'optional'} onPick={v => set('tfaAdmins', v)} />
          <Row label="users" hint="chat app sign-in" opts={OFF3} value={c.tfaUsers} onPick={v => set('tfaUsers', v)} />
          <Row label="backup codes" hint="8 one-time codes for lost devices" opts={ONOFF} value={c.tfaBackup} onPick={v => set('tfaBackup', v)} />
          <Row label="email codes" hint={smtpOn ? 'send a code by email as a fallback' : 'needs smtp — set up email first'} opts={ONOFF} value={c.tfaEmail} onPick={v => set('tfaEmail', v)} disabled={() => !smtpOn} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>TRUST A DEVICE FOR</Label><ChipRow opts={[['0', 'ask every time'], ['7', '7 days'], ['30', '30 days']]} value={c.tfaRemember} onPick={v => set('tfaRemember', v)} /></div>
      </Panel>
      {!inWizard && (
        <div style={grid(340)}>
          <Panel title="YOUR AUTHENTICATOR">
            {me.mfa ? <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}><Tag t="ENABLED" c="var(--ok)" /><span style={{ color: 'var(--text-3)' }}>totp · {me.backupLeft ?? '·'} backup codes left</span></div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>current authenticator or backup code
                <input value={s.mfaCurrentCode || ''} autoComplete="one-time-code" onInput={e => a.setState({ mfaCurrentCode: e.target.value.slice(0, 20) })} style={{ background: 'var(--surface-input)', color: 'var(--text-highlight)', border: '1px solid var(--border-1)', padding: '8px', font: 'inherit' }} />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <B onClick={async () => { try { const r = await a.call('POST', 'admin/mfa', { action: 'enroll', currentCode: s.mfaCurrentCode || '' }); a.setState({ mfaCurrentCode: '', auth: 'enroll', enroll: { ...r, then: 'shell' }, setupCode: '', setupErr: '' }); } catch (e) { a.fail(e); } }}>re-enroll authenticator</B>
                <B onClick={async () => { try { const r = await a.call('POST', 'admin/mfa', { action: 'backup', currentCode: s.mfaCurrentCode || '' }); a.setState({ mfaCurrentCode: '', newCodes: r.backupCodes, codesCopied: false }); a.loadMe(); } catch (e) { a.fail(e); } }}>{s.newCodes ? 'regenerate backup codes' : 'generate backup codes'}</B>
                {!me.mfaRequired && <B onClick={async () => { try { await a.call('POST', 'admin/mfa', { action: 'disable', currentCode: s.mfaCurrentCode || '' }); a.setState({ mfaCurrentCode: '', newCodes: null }); a.toast('two-factor off for @' + me.username); a.loadMe(); } catch (e) { a.fail(e); } }}>turn off 2FA</B>}
              </div>
            </> : <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px' }}><Tag t="OFF" c="var(--warn)" /><span style={{ color: 'var(--text-3)' }}>signing in with your password only</span></div>
              <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>an authenticator app keeps the console safe if your password leaks.</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                <B kind="accent" onClick={async () => { try { const r = await a.call('POST', 'admin/mfa', { action: 'enroll' }); a.setState({ auth: 'enroll', enroll: { ...r, then: 'shell' }, setupCode: '', setupErr: '' }); } catch (e) { a.fail(e); } }}>set up authenticator</B>
              </div>
            </>}
            {s.newCodes && <>
              <div data-no-tr="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '4px', padding: '10px', border: '1px dashed var(--border-strong)', background: 'var(--bg-0)' }}>
                {s.newCodes.map((code, i) => <span key={code} style={{ fontSize: '13px', letterSpacing: '.08em', color: 'var(--text-highlight)' }}><span style={{ color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</span> {code}</span>)}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}><B kind="accent" h={28} onClick={() => { navigator.clipboard.writeText(s.newCodes.join('\n')).catch(() => {}); a.setState({ codesCopied: true }); }}>{s.codesCopied ? '✓ copied' : 'copy codes'}</B><span style={{ alignSelf: 'center', fontSize: '11px', color: 'var(--text-3)' }}>old codes stopped working</span></div>
            </>}
          </Panel>
          <Panel title="ADOPTION">
            <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-highlight)' }}>{adm ? adm.admins.filter(x => x.totp).length + ' / ' + adm.admins.length + ' admins' : '·'}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{adm ? adm.usersMfa + ' of ' + adm.users + ' users have 2FA · policy: ' + s.cfgSaved.server.tfaUsers : ''}</span>
            {missing && <Banner>without 2FA: <span data-no-tr="1">{missing}</span> — {(s.cfgSaved.server.tfaAdmins || 'optional') === 'required' ? 'they are asked to enroll on next sign-in.' : 'optional on this server.'}</Banner>}
          </Panel>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- announcements

function Announce({ a }) {
  const s = a.state, ann = s.ann, rows = s.d.anns || [];
  const LV = { info: ['var(--info)', 'var(--info-bg)'], warn: ['var(--warn)', 'var(--warn-bg)'] };
  const L = LV[ann.level];
  const setA = (k, v) => a.setState(x => ({ ann: { ...x.ann, [k]: v } }));
  const publish = async () => {
    if (!ann.body.trim()) return;
    try {
      await a.call('POST', 'admin/announce', { body: ann.body.trim(), level: ann.level, at: ann.when === 'later' && ann.at ? ann.at.replace('T', ' ') : '' });
      a.toast(ann.when === 'now' ? 'announcement published' : 'announcement scheduled');
      a.setState({ ann: { body: '', level: 'info', when: 'now', at: '' } });
      a.load('announce');
    } catch (e) { a.fail(e); }
  };
  return (
    <div data-screen-label="Announcements" style={{ ...grid(380), alignItems: 'start' }}>
      <Panel title="COMPOSE">
        <textarea value={ann.body} onInput={e => setA('body', e.target.value)} rows={4} maxLength={240} placeholder="e.g. scheduled upgrade tonight at 23:00 UTC — expect a 5 minute reconnect." data-no-tr="1" style={{ padding: '8px 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', outline: 'none', resize: 'vertical' }} />
        <span style={{ alignSelf: 'flex-end', fontSize: '11px', color: 'var(--text-3)' }}>{ann.body.length}/240</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>LEVEL</Label><ChipRow flex opts={['info', 'warn']} value={ann.level} onPick={v => setA('level', v)} /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><Label>SEND</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            <ChipRow opts={[['now', 'now'], ['later', 'schedule']]} value={ann.when} onPick={v => setA('when', v)} />
            {ann.when === 'later' && <input type="datetime-local" value={ann.at} onInput={e => setA('at', e.target.value)} style={{ height: '30px', padding: '0 8px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', colorScheme: 'dark', outline: 'none' }} />}
          </div>
          {ann.when === 'later' && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// time is utc</span>}
        </div>
        <button onClick={publish} disabled={!ann.body.trim()} style={{ height: '36px', background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-ink)', font: 'inherit', fontWeight: 700, cursor: ann.body.trim() ? 'pointer' : 'not-allowed', opacity: ann.body.trim() ? 1 : 0.45 }}>{ann.when === 'now' ? 'publish to all users' : 'schedule' + (ann.at ? ' · ' + ann.at.replace('T', ' ') : '')}</button>
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <ListPanel title="CLIENT PREVIEW">
          <div data-theme={(s.cfgSaved && s.cfgSaved.server.theme) || 'green'} style={{ margin: '14px', maxWidth: '340px', alignSelf: 'center', width: 'calc(100% - 28px)', display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', background: 'var(--bg-0)' }}>
            <div style={{ height: '44px', display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-faint)', fontFamily: 'var(--font-pixel)', letterSpacing: '.14em', color: 'var(--accent)' }}>CHATS</div>
            <div style={{ display: 'flex', gap: '8px', padding: '8px 10px', borderBottom: '1px solid ' + L[0], background: L[1], fontSize: '12px', color: 'var(--text-highlight)' }}><span style={{ fontWeight: 700, color: L[0] }}>[{ann.level.toUpperCase()}]</span><span data-no-tr="1" style={{ flex: 1 }}>{ann.body.trim() || 'your announcement appears here, pinned above the chat list.'}</span><span style={{ color: 'var(--text-3)' }}>✕</span></div>
            {[['BO', 'bob'], ['DE', 'design crew'], ['CA', 'carol']].map(([i, n]) => <div key={n} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-faint)' }}><span style={{ width: '30px', height: '30px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', color: 'var(--accent)', fontSize: '12px' }}>{i}</span><div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><span data-no-tr="1" style={{ fontSize: '12px', color: 'var(--text-1)' }}>{n}</span><span style={{ fontSize: '11px', color: 'var(--text-3)' }}>░░░░░░░░░░░░</span></div></div>)}
          </div>
        </ListPanel>
        <ListPanel title="HISTORY">
          {rows.map(x => (
            <div key={x.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}><span style={{ fontWeight: 700, color: LV[x.level][0] }}>[{x.level.toUpperCase()}]</span><span data-no-tr="1" style={{ flex: 1, color: 'var(--text-highlight)' }}>{x.body}</span></div>
              <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{x.pending ? 'scheduled · ' : ''}{longStamp(x.at)} · <span data-no-tr="1">{x.by}</span> · {x.pending ? 'pending' : x.reach + ' delivered'}</span>
            </div>
          ))}
          {!rows.length && <span style={{ padding: '16px 14px', fontSize: '12px', color: 'var(--text-3)' }}>∅ nothing published yet</span>}
        </ListPanel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- audit

function Audit({ a }) {
  const s = a.state, rows = s.d.audit;
  const COLS = '130px 100px 90px 1.6fr 1fr 120px';
  const reload = patch => { a.setState(patch); clearTimeout(a.auT); a.auT = setTimeout(() => a.load('audit', patch), 200); };
  const exportCsv = () => {
    const csv = ['time,actor,type,action,target,ip'].concat((rows || []).map(x => [new Date(x.time * 1000).toISOString(), x.actor, x.type, x.action, x.target, x.ip].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), el = document.createElement('a');
    el.href = url;
    el.download = 'audit-' + new Date().toISOString().slice(0, 10) + '.csv';
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    a.toast((rows || []).length + ' rows exported');
  };
  return (
    <div data-screen-label="Audit log" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        <input value={s.auQ} onInput={e => reload({ auQ: e.target.value })} placeholder="/ filter actor, target, ip" data-no-tr="1" style={{ flex: 1, minWidth: '180px', maxWidth: '320px', height: '34px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', outline: 'none' }} />
        <ChipRow opts={['all', 'auth', 'users', 'reports', 'invites', 'chats', 'storage', 'config']} value={s.auType} onPick={v => reload({ auType: v })} />
        <span style={{ flex: 1 }} />
        <B kind="accent" h={32} onClick={exportCsv} style={{ padding: '0 12px' }}>↓ export csv</B>
      </div>
      <Table cols={COLS} minWidth={700} head={<><span style={{ padding: '0 12px' }}>TIME</span><span style={{ padding: '0 8px' }}>ACTOR</span><span style={{ padding: '0 8px' }}>TYPE</span><span style={{ padding: '0 8px' }}>ACTION</span><span style={{ padding: '0 8px' }}>TARGET</span><span style={{ padding: '0 8px' }}>IP</span></>}
        empty={rows && !rows.length ? <EmptyRow>∅ no entries match these filters</EmptyRow> : !rows ? loading : null}>
        {(rows || []).map((x, i) => (
          <Tr key={i} cols={COLS} h={34}>
            <Td c="var(--text-3)" pad="0 12px">{shortStamp(x.time)}</Td><Td c="var(--text-highlight)" noTr>{x.actor}</Td><Td>{x.type}</Td><Td c="var(--text-1)" noTr>{x.action}</Td><Td noTr>{x.target}</Td><Td c="var(--text-3)" noTr>{x.ip}</Td>
          </Tr>
        ))}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------- admins & security

function Admins({ a }) {
  const s = a.state, d = s.d.admins;
  if (!d) return loading;
  const saveIps = async (ips, msg) => { try { await a.call('POST', 'admin/ips', { ips }); a.toast(msg); a.load('admins'); } catch (e) { a.setState({ ipErr: e.message }); } };
  const addIp = () => {
    const v = s.ipNew.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(v)) return a.setState({ ipErr: 'expected IPv4 or CIDR, e.g. 203.0.113.0/24' });
    a.setState({ ipNew: '', ipErr: '' });
    saveIps([...d.ips, { cidr: v.includes('/') ? v : v + '/32', note: 'added ' + new Date().toISOString().slice(0, 10) }], 'allow-listed ' + v);
  };
  const ROLES = ['admin', 'moderator'];
  return (
    <div data-screen-label="Admins and security" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <ListPanel title="ADMIN ACCOUNTS" right={<B kind="accent" h={28} onClick={() => { a.go('users'); a.toast('open a user and choose "make admin"'); }}>+ promote user</B>}>
        {d.admins.map(x => (
          <div key={x.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
            <span data-no-tr="1" style={{ minWidth: '90px', fontSize: '13px', color: 'var(--text-highlight)' }}>@{x.name}</span>
            <Tag t={x.role.toUpperCase()} c="var(--accent)" /><Tag t={x.totp ? '2FA' : 'NO 2FA'} c={x.totp ? 'var(--ok)' : 'var(--err)'} />
            <span style={{ flex: 1, color: 'var(--text-3)' }}>last login {x.last ? ago(x.last) : 'never'}</span>
            {x.role !== 'owner' && (s.me || {}).role !== 'moderator' && <>
              <B kind="plain" h={26} style={{ fontSize: '11px', padding: '0 8px' }} onClick={() => userAction(a, x.id, 'role', { role: ROLES[(ROLES.indexOf(x.role) + 1) % 2] }, '@' + x.name + ' is now ' + ROLES[(ROLES.indexOf(x.role) + 1) % 2])}>role: {x.role} ↻</B>
              <B kind="danger" h={26} style={{ fontSize: '11px', padding: '0 8px' }} onClick={() => a.ask({ title: 'REMOVE ADMIN @' + x.name.toUpperCase(), body: 'they lose console access and their admin sessions end. their user account stays.', word: x.name, label: 'remove admin', run: () => userAction(a, x.id, 'role', { role: 'user' }, '@' + x.name + ' removed from admins') })}>remove</B>
            </>}
          </div>
        ))}
      </ListPanel>
      <div style={grid(360)}>
        <ListPanel title="IP ALLOW-LIST">
          {d.ips.map(ip => (
            <div key={ip.cidr} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
              <span data-no-tr="1" style={{ flex: 1, color: 'var(--text-highlight)' }}>{ip.cidr}</span><span data-no-tr="1" style={{ color: 'var(--text-3)' }}>{ip.note}</span>
              <B kind="danger" h={24} style={{ fontSize: '11px', padding: '0 8px' }} onClick={() => saveIps(d.ips.filter(z => z.cidr !== ip.cidr), 'removed ' + ip.cidr)}>remove</B>
            </div>
          ))}
          {!d.ips.length && <div style={{ margin: '10px 14px 0' }}><Banner>empty list — console reachable from any IP</Banner></div>}
          <div style={{ display: 'flex', gap: '6px', padding: '10px 14px' }}>
            <input value={s.ipNew} onInput={e => a.setState({ ipNew: e.target.value, ipErr: '' })} onKeyDown={e => e.key === 'Enter' && addIp()} placeholder={d.myIp ? d.myIp + '/32' : '203.0.113.0/24'} data-no-tr="1" style={{ flex: 1, minWidth: 0, height: '32px', padding: '0 10px', background: 'var(--surface-input)', border: '1px solid var(--border-1)', color: 'var(--text-highlight)', outline: 'none' }} />
            <B kind="accent" h={32} onClick={addIp} style={{ padding: '0 12px' }}>add</B>
          </div>
          <span style={{ padding: '0 14px 10px', fontSize: '11px', color: s.ipErr ? 'var(--err)' : 'var(--text-3)' }}>{s.ipErr || 'your address: ' + d.myIp}</span>
        </ListPanel>
        <ListPanel title="ADMIN SESSIONS">
          {d.sessions.map(x => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-highlight)' }}><span data-no-tr="1">@{x.who}</span> · {x.client}</span><span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--text-3)' }}>{x.ip} · {x.current ? 'active now' : ago(x.last)}</span></div>
              {x.current ? <Tag t="THIS" c="var(--ok)" /> : <B kind="danger" h={24} style={{ fontSize: '11px', padding: '0 8px' }} onClick={async () => { try { await a.call('POST', 'admin/session/revoke', { id: x.id }); a.toast('admin session revoked'); a.load('admins'); } catch (e) { a.fail(e); } }}>revoke</B>}
            </div>
          ))}
        </ListPanel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- health

function Health({ a }) {
  const s = a.state, d = s.d.health;
  if (!d) return loading;
  const upd = s.upd || { st: 'idle' };
  const check = () => {
    a.setState({ upd: { st: 'busy' } });
    fetch('https://api.github.com/repos/UltraNomen/CHATS/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => r.status === 404 ? { none: true } : r.ok ? r.json() : Promise.reject(r.status))
      .then(j => a.setState({ upd: j.none ? { st: 'ok', msg: '[ OK ] no published releases yet · you are on the latest build' } : { st: 'ok', url: j.html_url, msg: j.tag_name && j.tag_name.replace(/^v/, '') !== d.version.replace(/^v/, '') ? '[ NEW ] ' + j.tag_name + ' available' : '[ OK ] up to date · ' + (j.tag_name || d.version) } }))
      .catch(() => a.setState({ upd: { st: 'fail', msg: "[FAIL] couldn't reach github.com · check your connection" } }));
  };
  const runBackup = async () => {
    a.setState({ bkBusy: true });
    try { const r = await a.call('POST', 'admin/backup', {}); a.toast(r.backup.st === 'OK' ? 'backup completed · ' + fmtSize(r.backup.size) : 'backup failed · ' + r.backup.note); a.load('health'); } catch (e) { a.fail(e); }
    a.setState({ bkBusy: false });
  };
  const download = async b => {
    try {
      const data = await a.api.download('admin/backup', { name: b.name });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/gzip' })), el = document.createElement('a');
      el.href = url; el.download = b.name; el.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { a.fail(e); }
  };
  const last = d.backups.find(b => b.st === 'OK');
  const col = st => st === 'UP' ? 'var(--ok)' : st === 'DEGRADED' ? 'var(--warn)' : st === 'OFF' ? 'var(--border-1)' : 'var(--err)';
  const lc = lv => lv === 'ERR' ? 'var(--err)' : lv === 'WARN' ? 'var(--warn)' : 'var(--text-3)';
  return (
    <div data-screen-label="Health" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '10px' }}>
        {d.services.map(sv => (
          <div key={sv.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px 12px', border: '1px solid ' + col(sv.st), background: 'var(--surface-panel)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-highlight)' }}>{sv.name}</span><Tag t={sv.st} c={col(sv.st)} /></div>
            <span data-no-tr="1" style={{ fontSize: '11px', color: 'var(--text-3)' }}>{sv.meta}</span>
          </div>
        ))}
      </div>
      <Panel title="SERVER KEY">
        <span data-no-tr="1" style={{ fontSize: '13px', letterSpacing: '.04em', color: 'var(--text-highlight)', wordBreak: 'break-all' }}>{(s.info || {}).fingerprint || '—'}</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// the console and the chat app show this when they connect · if it ever differs there, don't sign in</span>
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', background: 'var(--bg-0)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border-faint)', fontSize: '11px', color: 'var(--text-3)' }}><span>$ tail -f chats/error.log</span><span>{d.errCount} errors / 24h</span></div>
        <div data-no-tr="1" style={{ display: 'flex', flexDirection: 'column', padding: '10px 12px', fontSize: '12px', maxHeight: '240px', overflow: 'auto' }}>
          {d.log.slice().reverse().map((l, i) => <span key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}><span style={{ color: 'var(--text-3)' }}>{new Date(l.at * 1000).toISOString().slice(11, 19)}</span> <span style={{ fontWeight: 700, color: lc(l.lv) }}>{l.lv.padEnd(4)}</span> <span style={{ color: 'var(--text-1)' }}>{l.msg}</span></span>)}
          {!d.log.length && <span style={{ color: 'var(--text-3)' }}>no log entries yet</span>}
          <span style={{ color: 'var(--accent)', animation: 'blink 1s steps(1) infinite' }}>█</span>
        </div>
      </div>
      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={PX}>UPDATES</span><span style={{ fontSize: '12px', color: 'var(--text-2)' }}>running CHATS server {d.version} · console {CONSOLE_VER} · releases from <a href={REPO} target="_blank" rel="noopener">github.com/UltraNomen/CHATS</a></span></div>
          <a href={upd.url || REPO + '/releases'} target="_blank" rel="noopener" style={{ fontSize: '12px' }}>release notes ↗</a>
          <B kind="accent" h={32} disabled={upd.st === 'busy'} onClick={check} style={{ padding: '0 12px' }}>{upd.st === 'busy' ? 'checking…' : 'check for updates'}</B>
        </div>
        <span style={{ fontSize: '12px', color: upd.st === 'fail' ? 'var(--err)' : upd.st === 'ok' ? 'var(--ok)' : 'var(--text-3)' }}>{upd.st === 'idle' ? 'last checked: never' : upd.st === 'busy' ? '░░░ asking github…' : upd.msg}</span>
      </Panel>
      <Panel>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={PX}>BACKUPS</span><span style={{ fontSize: '12px', color: 'var(--text-2)' }}>{last ? 'last run ' + longStamp(last.at) + ' · ' + fmtSize(last.size) : 'no backup yet'} · database snapshot · daily after 03:00 UTC</span></div>
          <B h={32} disabled={!last} onClick={() => download(last)} style={{ padding: '0 12px' }}>↓ download latest</B>
          <B kind="solid" h={32} disabled={s.bkBusy} onClick={runBackup} style={{ padding: '0 12px' }}>{s.bkBusy ? 'running…' : 'run now'}</B>
        </div>
        {s.bkBusy && <span style={{ letterSpacing: '-1px', color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', animation: 'blink 1s steps(1) infinite' }}>{bar(0.5, 60)}</span>}
        {d.backups.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', fontSize: '12px' }}><Tag t={b.st} c={b.st === 'OK' ? 'var(--ok)' : 'var(--err)'} /><span style={{ color: 'var(--text-2)' }}>{longStamp(b.at)}</span><span style={{ color: 'var(--text-3)' }}>{b.st === 'OK' ? fmtSize(b.size) + ' · ' : ''}{b.note}</span></div>
        ))}
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>// attachments are already encrypted in blob storage and aren't part of the snapshot · back that up separately</span>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------- wizard: owner + review

function Owner({ a }) {
  const s = a.state, o = s.owner;
  const set = k => v => a.setState(x => ({ owner: { ...x.owner, [k]: k === 'user' ? v.replace(/[^a-z0-9_]/gi, '').toLowerCase() : v }, wzErr: '' }));
  return (
    <div data-screen-label="Owner account" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Panel title="FIRST ADMIN">
        <span style={{ fontSize: '12px', color: 'var(--text-2)' }}>this account owns the server and is also a normal chat account. it can't be demoted or deleted by other admins.</span>
        <Fields>
          <F label="USERNAME" value={o.user} ph="root" onInput={set('user')} /><F label="EMAIL (OPTIONAL)" value={o.email} ph="you@example.com" onInput={set('email')} />
          <F label="PASSWORD" type="password" value={o.pass} ph="min 8 characters" onInput={set('pass')} /><F label="CONFIRM PASSWORD" type="password" value={o.pass2} ph="repeat password" onInput={set('pass2')} />
        </Fields>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>next: you'll scan a 2FA code before the console opens. keys are generated in this browser.</span>
      </Panel>
    </div>
  );
}

function Review({ a }) {
  const s = a.state, c = s.cfg, o = s.owner;
  const net = c.db.engine !== 'sqlite';
  const rows = [['server', c.server.name || '—', 0], ['registration', c.server.reg + ' · email ' + c.server.emailField + ' · phone ' + c.server.phoneField, 0], ['reports', c.server.reporting ? 'on · auto-hide ' + c.server.reportHide : 'off', 0],
    ['database', DBN[c.db.engine] + (net ? ' · ' + c.db.user + '@' + c.db.host + ':' + c.db.port + '/' + c.db.name : ' · ' + (c.db.path || 'data/chats.db')), 1],
    ['storage', c.storage.backend === 'local' ? 'local · ' + (c.storage.path || 'data/blobs') : S3P[c.storage.s3Provider][0] + ' · ' + c.storage.bucket, 2],
    ['email', c.smtp.on ? c.smtp.host + ':' + c.smtp.port + ' · ' + c.smtp.sec : 'off', 3], ['2fa', 'admins ' + (c.server.tfaAdmins || 'optional') + ' · users ' + c.server.tfaUsers, 4], ['owner', '@' + o.user + (o.email ? ' · ' + o.email : ''), 5]];
  const lines = ['write config.json', 'migrate schema → ' + DBN[c.db.engine], 'mount storage → ' + (c.storage.backend === 'local' ? (c.storage.path || 'data/blobs') : c.storage.bucket), 'generate keys in this browser · create owner @' + o.user];
  return (
    <div data-screen-label="Setup review" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border-strong)', background: 'var(--surface-panel)', boxShadow: 'var(--glow-sm)' }}>
        <span style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-faint)', ...PX }}>REVIEW</span>
        {rows.map(([k, v, i]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,200px) 1fr auto', alignItems: 'center', gap: '10px', padding: '8px 14px', borderBottom: '1px solid var(--border-faint)', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-3)' }}>// {k}</span><span data-no-tr="1" style={{ color: 'var(--text-highlight)' }}>{v}</span>
            <button onClick={() => a.setState({ wz: i, wzErr: '' })} style={{ padding: 0, background: 'none', border: 0, color: 'var(--text-2)', font: 'inherit', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>edit</button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px 14px', border: '1px dashed var(--border-1)', background: 'var(--bg-0)', fontSize: '12px' }}>
        {lines.map(l => <span key={l}><span style={{ color: 'var(--accent)' }}>[ .. ]</span> <span data-no-tr="1" style={{ color: 'var(--text-2)' }}>{l}</span></span>)}
      </div>
    </div>
  );
}
