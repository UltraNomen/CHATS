// Layout pieces repeated across the client screens. Styles are copied from the Chat v3 prototype.
import { Icon, IconButton } from './ds.jsx';
import { ini } from '../core/format.js';

export const S = {
  hdr: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' },
  title: { flex: 1, fontFamily: 'var(--font-pixel)', fontSize: '20px', letterSpacing: '.12em', color: 'var(--accent)', textShadow: 'var(--text-glow)' },
  input: { flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 0, color: 'var(--text-1)', font: 'inherit', fontSize: '14px' },
  col: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto' },
  sec: { fontSize: '11px', color: 'var(--text-3)', letterSpacing: '.06em' },
  ell: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  err: { fontSize: '12px', color: 'var(--err)' },
  ok: { fontSize: '12px', color: 'var(--accent)' },
  hint: { fontSize: '11px', color: 'var(--text-3)' },
  overlay: z => ({ position: 'absolute', inset: 0, background: 'var(--surface-overlay)', zIndex: z }),
  sheet: (z, extra) => ({ position: 'absolute', left: '8px', right: '8px', bottom: '8px', maxWidth: '420px', margin: '0 auto', zIndex: z, display: 'flex', flexDirection: 'column',
    background: 'var(--surface-panel)', border: '1px dashed var(--border-strong)', boxShadow: 'var(--glow-md)', ...extra }),
  sheetHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border-faint)' },
  pixHead: { fontFamily: 'var(--font-pixel)', fontSize: '12px', letterSpacing: '.12em', color: 'var(--accent)' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-faint)' },
};

/** User-generated text: never machine-translated. */
export const U = ({ children, style, class: cls }) => <span data-no-tr="1" style={style} class={cls}>{children}</span>;

export function Hdr({ back, onBack, title, children, backLabel = 'back' }) {
  return (
    <header style={S.hdr}>
      {back !== false && onBack && <IconButton variant="ghost" label={backLabel} onClick={onBack}><Icon name={back || 'arrow-left'} /></IconButton>}
      {title != null && <div style={S.title}>{title}</div>}
      {children}
    </header>
  );
}

/** "me@chats:~$ cmd" label above a dashed shell input. */
export function Field({ cmd, glyph = '>', h = 44, border = 'var(--border-2)', children, right, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...style }}>
      <span style={{ fontSize: '12px', color: 'var(--text-3)', display: right ? 'flex' : undefined, justifyContent: right ? 'space-between' : undefined }}>
        <span>me@chats:~$ <span style={{ color: 'var(--text-1)' }}>{cmd}</span></span>{right}
      </span>
      <Box glyph={glyph} h={h} border={border}>{children}</Box>
    </label>
  );
}

export function Box({ glyph = '>', h = 44, border = 'var(--border-2)', children, style, area }) {
  return (
    <div style={{ display: 'flex', alignItems: area ? 'flex-start' : 'center', gap: '8px', height: area ? undefined : h + 'px', padding: area ? '10px' : '0 10px',
      border: '1px dashed ' + border, background: 'var(--surface-input)', ...style }}>
      {glyph && <span style={{ color: 'var(--accent)' }}>{glyph}</span>}
      {children}
    </div>
  );
}

export const Inp = props => <input {...props} style={{ ...S.input, ...props.style }} />;

/** Toggle chips: active = inverted accent. */
export function Chips({ opts, value, onPick, h = 32, px = 12, wrap = true, style, noTr }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: wrap ? 'wrap' : 'nowrap', ...style }}>
      {opts.map(o => {
        const [v, label, font] = Array.isArray(o) ? o : [o, o];
        const on = value === v;
        return (
          <button type="button" key={String(v)} data-no-tr={noTr ? '1' : undefined} onClick={() => onPick(v)} class={on ? '' : 'hvc'}
            style={{ height: h + 'px', padding: '0 ' + px + 'px', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border-faint)'), background: on ? 'var(--accent)' : 'transparent',
              color: on ? 'var(--accent-ink)' : 'var(--text-2)', font: 'inherit', fontFamily: font, fontSize: '12px', cursor: 'pointer' }}>{label}</button>
        );
      })}
    </div>
  );
}

export function Steps({ steps, cur }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {steps.map((label, i) => (
        <div key={label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ height: '3px', background: i <= cur ? 'var(--accent)' : 'var(--border-faint)', boxShadow: i === cur ? 'var(--glow-sm)' : 'none' }} />
          <span style={{ fontSize: '10px', color: i === cur ? 'var(--accent)' : i < cur ? 'var(--text-2)' : 'var(--text-3)', ...S.ell }}>{i < cur ? '✓' : i === cur ? '›' : '·'} {label}</span>
        </div>
      ))}
    </div>
  );
}

/** Square avatar: initials, or a photo rendered in phosphor. */
export function Av({ name, photo, size = 44, fs = 13, online, border = 'var(--border-1)', glow, style, spacing }) {
  if (photo) {
    return (
      <div class="phos" style={{ flex: 'none', width: size + 'px', height: size + 'px', border: '1px solid var(--border-strong)', boxShadow: glow || 'none', ...style }}>
        <img src={photo} alt="" />
        {online && <span style={{ position: 'absolute', right: '-3px', bottom: '-3px', width: '8px', height: '8px', background: 'var(--accent)', boxShadow: 'var(--glow-sm)', border: '2px solid var(--surface-panel)', zIndex: 2 }} />}
      </div>
    );
  }
  return (
    <div data-no-tr="1" style={{ position: 'relative', flex: 'none', width: size + 'px', height: size + 'px', display: 'grid', placeItems: 'center', border: '1px solid ' + border, background: 'var(--surface-raised)',
      fontFamily: 'var(--font-pixel)', fontSize: fs + 'px', letterSpacing: spacing, color: 'var(--accent)', boxShadow: glow, ...style }}>
      {name && name.startsWith('#') ? name : ini(name)}
      {online && <span style={{ position: 'absolute', right: '-3px', bottom: '-3px', width: '8px', height: '8px', background: 'var(--accent)', boxShadow: 'var(--glow-sm)', border: '2px solid var(--surface-panel)' }} />}
    </div>
  );
}

export function Tabs({ tabs, cur, onGo }) {
  return (
    <nav style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', borderTop: '1px solid var(--border-faint)' }}>
      {tabs.map(([label, scr, icon, badge]) => {
        const on = cur === scr;
        return (
          <button key={scr} onClick={() => onGo(scr)} class={on ? '' : 'hvc'}
            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '52px',
              background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--text-2)', border: 0, font: 'inherit', fontSize: '11px', cursor: 'pointer' }}>
            <Icon name={icon} /><span>{label}</span>
            {!on && badge ? <span style={{ position: 'absolute', top: '6px', left: 'calc(50% + 6px)', minWidth: '16px', height: '14px', padding: '0 3px', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: '10px', fontWeight: 700 }}>{badge}</span> : null}
          </button>
        );
      })}
    </nav>
  );
}

export function Empty({ title, hint, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '32px 16px', ...style }}>
      <span style={{ fontFamily: 'var(--font-pixel)', fontSize: '14px', letterSpacing: '.1em', color: 'var(--accent)' }}>{title}</span>
      <span style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-3)', textWrap: 'pretty' }}>{hint}</span>
    </div>
  );
}

export function Log({ lines, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '12px', color: 'var(--text-3)', ...style }}>
      {lines.map(([tag, text, color], i) => <span key={i}><span style={{ color: color || 'var(--accent)' }}>{tag}</span> {text}</span>)}
    </div>
  );
}

export const Sec = ({ children, pad = '16px 16px 6px' }) => <div style={{ padding: pad, ...S.sec }}>{children}</div>;

export function ToggleRow({ label, hint, children, h = 48 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: h + 'px', padding: '0 16px', borderBottom: '1px solid var(--border-faint)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>{label}</span>
        {hint && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function NavRow({ label, hint, onClick, glyph, h = 52 }) {
  return (
    <div onClick={onClick} class="hv" style={{ display: 'flex', alignItems: 'center', gap: '12px', minHeight: h + 'px', padding: '0 16px', borderBottom: '1px solid var(--border-faint)', cursor: 'pointer' }}>
      {glyph && <span style={{ flex: 'none', width: '32px', height: '32px', display: 'grid', placeItems: 'center', border: '1px solid var(--border-1)', color: 'var(--accent)', fontSize: '15px' }}>{glyph}</span>}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>{label}</span>
        {hint && <span style={{ fontSize: '11px', color: 'var(--text-3)', ...S.ell }}>{hint}</span>}
      </div>
      <Icon name="chevron-right" style={{ color: 'var(--text-3)' }} />
    </div>
  );
}

export function Block({ label, children, hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 16px 14px', borderBottom: '1px solid var(--border-faint)' }}>
      <span style={{ fontSize: '14px', color: 'var(--text-1)' }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{hint}</span>}
    </div>
  );
}

/** 8 recovery words in a 2-column grid. */
export function WordGrid({ words }) {
  return (
    <div data-no-tr="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '4px' }}>
      {words.map((w, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '36px', padding: '0 10px', border: '1px solid var(--border-1)', background: 'var(--surface-raised)' }}>
          <span style={{ width: '16px', fontSize: '11px', color: 'var(--text-3)' }}>{i + 1}</span>
          <span style={{ fontSize: '14px', color: 'var(--text-highlight)' }}>{w}</span>
        </div>
      ))}
    </div>
  );
}

/** Real QR code drawn as accent pixels (TOTP enrollment). */
export function QrGrid({ cells, n, size = 200 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n},1fr)`, width: size + 'px', height: size + 'px' }}>
      {cells.map((on, i) => <span key={i} style={{ background: on ? 'var(--accent)' : 'transparent' }} />)}
    </div>
  );
}
