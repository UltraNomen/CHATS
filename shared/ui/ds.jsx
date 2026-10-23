// Greenscreen design-system primitives, re-implemented from the handoff bundle (Button, IconButton, Icon, Switch).
import { ICONS } from './icons.js';

const cx = (...a) => a.filter(Boolean).join(' ');

export function Icon({ name, size = 16, style, class: cls }) {
  const d = ICONS[name];
  const flip = /^(arrow-|chevron-)/.test(name);
  return (
    <svg class={cx(flip && 'flip', cls)} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
      style={{ display: 'block', flex: 'none', shapeRendering: 'crispEdges', ...style }}>
      {d && <path d={d} />}
    </svg>
  );
}

export function Button({ variant = 'secondary', size = 'md', block, type = 'button', disabled, onClick, children, style }) {
  const v = variant === 'outline' ? 'secondary' : variant;
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={style}
      class={cx('gs-btn', v !== 'secondary' && 'gs-btn--' + v, size !== 'md' && 'gs-btn--' + size, block && 'gs-btn--block')}>
      {children}
    </button>
  );
}

export function IconButton({ variant = 'secondary', size = 'md', label, onClick, disabled, children, icon, style }) {
  const v = variant === 'outline' ? 'secondary' : variant;
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} style={style}
      class={cx('gs-iconbtn', v !== 'secondary' && 'gs-iconbtn--' + v, size === 'sm' && 'gs-iconbtn--sm')}>
      {icon ? <Icon name={icon} /> : children}
    </button>
  );
}

export function Switch({ checked, onChange, disabled, onText = 'ON', offText = 'OFF' }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} disabled={disabled} class="gs-switch" onClick={() => onChange && onChange(!checked)}>
      <span class="gs-switch__track">
        <span class={cx('gs-switch__seg', checked && 'is-on')}>{onText}</span>
        <span class={cx('gs-switch__seg', !checked && 'is-on')} style={!checked ? { background: 'var(--border-1)', color: 'var(--text-1)', boxShadow: 'none' } : undefined}>{offText}</span>
      </span>
    </button>
  );
}
