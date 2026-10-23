// Derived display values shared by the screens.
import { ini, listTime, seenLabel } from '#shared/core/format.js';
import { msgPreview, sysText } from './engine.js';

export const isOn = p => !!p && p.seen != null && Date.now() / 1000 - p.seen < 45;

export function person(a, id) {
  const p = a.eng.s.people[id];
  const c = a.eng.contacts()[id] || {};
  const me = a.eng.s.me;
  if (me && id === me.id) return { ...me, seen: Date.now() / 1000, isMe: true };
  if (!p) return { id, name: c.alias || '…', username: '…', seen: null, bio: '', phone: c.phone || null, contact: !!a.eng.contacts()[id] };
  return { ...p, name: c.alias || p.name, realName: p.name, phone: c.phone || p.phone || null, contact: !!a.eng.contacts()[id] };
}

export const status = p => isOn(p) ? 'online' : p.gone ? 'deleted account' : seenLabel(p.seen);

export function decorate(a, c) {
  const isGroup = c.type === 'group';
  const p = isGroup ? null : person(a, c.peer);
  const title = isGroup ? '#' + (c.name || 'group') : p.name;
  const last = c.last;
  let preview = 'no messages yet';
  if (last) {
    const who = last.kind === 'sys' ? '' : last.from === a.eng.s.me.id ? 'you: ' : isGroup ? a.eng.displayName(last.from) + ': ' : '';
    preview = last.kind === 'sys' ? sysText(last, a.eng) : who + msgPreview(last, a.eng);
  }
  return {
    ...c, title, isGroup, person: p, online: !isGroup && isOn(p), initials: isGroup ? '#' + ((c.name || '?')[0] || '?').toUpperCase() : ini(p.name),
    photo: !isGroup && p.avatar ? a.eng.avatarUrl(p.avatar) : '', preview, time: listTime(last ? last.at : c.lastAt),
    status: isGroup ? c.members.length + ' members' : status(p), hasUnread: c.unread > 0,
  };
}

export function chatList(a) {
  return Object.values(a.eng.s.chats).map(c => decorate(a, c)).sort((x, y) => ((y.last ? y.last.at : y.lastAt) || 0) - ((x.last ? x.last.at : x.lastAt) || 0));
}
