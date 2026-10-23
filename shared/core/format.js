// Display formatting: times, sizes, initials, bars. Server timestamps are unix seconds.
export const pad = n => String(n).padStart(2, '0');
const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MO = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function dayDiff(t) {
  const a = new Date(t * 1000), b = new Date();
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 864e5);
}

export const hm = t => { const d = new Date(t * 1000); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };

export function listTime(t) {
  if (!t) return '';
  const n = dayDiff(t), d = new Date(t * 1000);
  return n === 0 ? hm(t) : n === 1 ? 'yday' : n < 7 ? WD[d.getDay()] : pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
}

export function dayLabel(t) {
  const n = dayDiff(t), d = new Date(t * 1000);
  return n === 0 ? 'today' : n === 1 ? 'yesterday' : WD[d.getDay()] + ' ' + d.getDate() + ' ' + MO[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}

export const isOnline = (seen, now) => seen != null && (now || Date.now() / 1000) - seen < 45;

/** "online" · "seen 12m ago" · "seen 2h ago" · "seen yesterday" · "seen last week" (prototype wording). */
export function seenLabel(seen, now) {
  if (seen == null) return 'last seen recently';
  const s = (now || Date.now() / 1000) - seen;
  if (s < 45) return 'online';
  if (s < 3600) return 'seen ' + Math.max(1, Math.floor(s / 60)) + 'm ago';
  if (s < 86400 && dayDiff(seen) === 0) return 'seen ' + Math.floor(s / 3600) + 'h ago';
  const n = dayDiff(seen);
  return n <= 1 ? 'seen yesterday' : n < 7 ? 'seen ' + n + 'd ago' : n < 14 ? 'seen last week' : 'seen ' + listTime(seen);
}

/** Admin-style relative time: "now" · "12m ago" · "3h ago" · "2d ago". */
export function ago(t, now) {
  if (!t) return 'never';
  const s = Math.max(0, (now || Date.now() / 1000) - t);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function fmtSize(b) {
  b = +b || 0;
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB';
  return (b / 1073741824).toFixed(1).replace(/\.0$/, '') + ' GB';
}

export const fmtMB = b => fmtSize(b);

export function fmtUptime(sec) {
  sec = Math.max(0, sec | 0);
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  return d + 'd ' + pad(h) + 'h ' + pad(m) + 'm';
}

export function ini(n) {
  n = n || '?';
  const r = n.split(/[\s._-]+/).filter(Boolean).map(w => [...w][0]).join('').slice(0, 2);
  return (r.length < 2 ? n.replace(/[\s._-]/g, '').slice(0, 2) : r).toUpperCase();
}

export const bar = (p, n) => { const k = Math.max(0, Math.min(n, Math.round(p * n))); return '█'.repeat(k) + '░'.repeat(n - k); };

const SPK = '▁▂▃▄▅▆▇█';
export const spark = arr => { const mx = Math.max(...arr), mn = Math.min(...arr); return arr.map(v => SPK[Math.round((v - mn) / (mx - mn || 1) * 7)]).join(''); };

export const utcDate = t => new Date(t * 1000).toISOString().slice(0, 10);
export const utcTime = t => new Date(t * 1000).toISOString().slice(11, 16);
export const shortStamp = t => { const d = new Date(t * 1000); return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
export const longStamp = t => { const d = new Date(t * 1000); return MO[d.getMonth()] + ' ' + pad(d.getDate()) + ' · ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
