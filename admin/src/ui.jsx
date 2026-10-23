// Admin console building blocks (styles from the Admin prototype). The console always runs in the amber theme.
export const PX = { fontFamily: 'var(--font-pixel)', fontSize: '12px', letterSpacing: '.12em', color: 'var(--accent)' };
export const panelStyle = { display: 'flex', flexDirection: 'column', gap: '12px', padding: '14px', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' };
export const listStyle = { display: 'flex', flexDirection: 'column', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' };
export const grid = min => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${min}px),1fr))`, gap: '10px' });
export const chipC = on => ({ bg: on ? 'var(--accent)' : 'transparent', fg: on ? 'var(--accent-ink)' : 'var(--text-1)' });

export function Panel({ title, right, children, style, border }) {
  return (
    <div style={{ ...panelStyle, ...(border ? { border: '1px solid ' + border } : {}), ...style }}>
      {(title || right) && <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}><span style={PX}>{title}</span>{right}</div>}
      {children}
    </div>
  );
}

export function ListPanel({ title, right, children, style }) {
  return (
    <div style={{ ...listStyle, ...style }}>
      {(title || right) && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-faint)' }}><span style={PX}>{title}</span>{right}</div>}
      {children}
    </div>
  );
}

/** Small action button. kind: '' | 'accent' | 'danger' | 'warn' | 'solid' | 'solidDanger' */
export function B({ kind = '', onClick, disabled, children, h = 30, style, title, noTr }) {
  const k = {
    '': ['transparent', 'var(--border-2)', 'var(--text-1)', 'hv'],
    plain: ['transparent', 'var(--border-1)', 'var(--text-1)', 'hv'],
    accent: ['transparent', 'var(--accent)', 'var(--accent)', 'hv'],
    danger: ['transparent', 'var(--err)', 'var(--err)', 'hve'],
    warn: ['transparent', 'var(--warn)', 'var(--warn)', ''],
    solid: ['var(--accent)', 'var(--accent)', 'var(--accent-ink)', 'hvg'],
    solidDanger: ['var(--err)', 'var(--err)', 'var(--bg-0)', ''],
  }[kind];
  return (
    <button onClick={onClick} disabled={disabled} title={title} data-no-tr={noTr ? '1' : undefined} class={disabled ? '' : k[3]}
      style={{ height: h + 'px', padding: '0 10px', background: k[0], border: '1px solid ' + k[1], color: k[2], font: 'inherit', fontSize: '12px', fontWeight: kind.startsWith('solid') ? 700 : undefined, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap', ...style }}>
      {children}
    </button>
  );
}

export function ChipRow({ opts, value, onPick, h = 30, flex, disabled = () => false, style }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', ...style }}>
      {opts.map(o => {
        const [v, label] = Array.isArray(o) ? o : [o, o];
        const c = chipC(value === v);
        const dis = disabled(v);
        return <button key={String(v)} onClick={() => !dis && onPick(v)} disabled={dis} style={{ flex: flex ? 1 : undefined, height: h + 'px', padding: '0 10px', background: c.bg, border: '1px solid var(--border-1)', color: c.fg, font: 'inherit', fontSize: '12px', cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>{label}</button>;
      })}
    </div>
  );
}

export const Label = ({ children }) => <span style={{ fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>{children}</span>;

/** Settings row: label + hint on the left, locked tag or a segmented control on the right. */
export function Row({ label, hint, lock, opts, value, onPick, disabled = () => false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '1px solid var(--border-faint)' }}>
      <div style={{ flex: 1, minWidth: '180px', display: 'flex', flexDirection: 'column' }}><span style={{ color: 'var(--text-highlight)' }}>{label}</span>{hint && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{hint}</span>}</div>
      {lock ? <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-2)' }}>[{lock}]</span> : (
        <div style={{ display: 'flex' }}>
          {opts.map(([v, l]) => {
            const c = chipC(value === v), dis = disabled(v);
            return <button key={String(v)} onClick={() => !dis && onPick(v)} disabled={dis} style={{ height: '28px', padding: '0 10px', marginInlineStart: '-1px', background: c.bg, border: '1px solid var(--border-1)', color: c.fg, font: 'inherit', fontSize: '12px', cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>{l}</button>;
          })}
        </div>
      )}
    </div>
  );
}

export const ONOFF = [[true, 'on'], [false, 'off']];
export const OFF3 = [['off', 'off'], ['optional', 'optional'], ['required', 'required']];

/** Labelled form field (UPPERCASE label, dashed input). */
export function F({ label, value, onInput, type = 'text', ph = '', hint, num, noTr = true }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '10px', letterSpacing: '.14em', color: 'var(--text-3)' }}>{label}
      <input type={type} value={value ?? ''} placeholder={ph} data-no-tr={noTr ? '1' : undefined} class="focusacc"
        onInput={e => onInput(num ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value)}
        style={{ height: '36px', padding: '0 10px', background: 'var(--surface-input)', border: '1px dashed var(--border-1)', color: 'var(--text-highlight)', fontSize: '13px', letterSpacing: 0, outline: 'none' }} />
      {hint && <span style={{ fontSize: '11px', letterSpacing: 0, color: 'var(--text-3)' }}>{hint}</span>}
    </label>
  );
}

export const Fields = ({ children }) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,220px),1fr))', gap: '12px' }}>{children}</div>;

export function Banner({ level = 'warn', tag, children, action }) {
  const c = level === 'info' ? ['var(--info)', 'var(--info-bg)'] : level === 'err' ? ['var(--err)', 'var(--err-bg)'] : ['var(--warn)', 'var(--warn-bg)'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', border: '1px solid ' + c[0], background: c[1], fontSize: '12px', color: 'var(--text-highlight)' }}>
      <span style={{ fontWeight: 700, color: c[0] }}>{tag || (level === 'info' ? '[INFO]' : '[WARN]')}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}

export function Table({ cols, minWidth, head, children, empty }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border-1)', background: 'var(--surface-panel)' }}>
      <div style={{ minWidth: minWidth + 'px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: '36px', borderBottom: '1px solid var(--border-1)', fontSize: '11px', letterSpacing: '.1em', color: 'var(--text-3)' }}>{head}</div>
        {children}
        {empty}
      </div>
    </div>
  );
}

export const Tr = ({ cols, children, bg, h = 40 }) => <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', minHeight: h + 'px', borderBottom: '1px solid var(--border-faint)', background: bg, fontSize: '12px' }}>{children}</div>;
export const Td = ({ children, c = 'var(--text-2)', pad = '0 8px', style, noTr }) => <span data-no-tr={noTr ? '1' : undefined} style={{ padding: pad, color: c, overflow: 'hidden', textOverflow: 'ellipsis', ...style }}>{children}</span>;

export const Tag = ({ t, c }) => <span style={{ fontSize: '11px', fontWeight: 700, color: c }}>[{t}]</span>;

export const EmptyRow = ({ children, pad = '32px 16px' }) => <div style={{ padding: pad, textAlign: 'center', fontSize: '12px', color: 'var(--text-3)' }}>{children}</div>;

export function TestLine({ t, idle, onRun }) {
  const st = t || { st: 'idle' };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
      <B kind="accent" h={32} disabled={st.st === 'busy'} onClick={onRun} style={{ padding: '0 12px' }}>{st.st === 'busy' ? 'testing…' : idle}</B>
      <span data-no-tr={st.msg ? '1' : undefined} style={{ fontSize: '12px', color: st.st === 'ok' ? 'var(--ok)' : st.st === 'fail' ? 'var(--err)' : 'var(--text-3)' }}>{st.st === 'idle' ? 'not tested yet' : st.st === 'busy' ? '░░░ connecting…' : st.msg}</span>
    </div>
  );
}
