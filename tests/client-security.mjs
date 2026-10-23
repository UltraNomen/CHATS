import assert from 'node:assert/strict';
import { normalizeBody, normalizeCache, chatMeta, safeMime, sniffRaster } from '../shared/core/messages.js';
import { Engine, msgPreview } from '../client/src/engine.js';
import { decorate } from '../client/src/view.js';
import * as C from '../shared/core/crypto.js';

const uid = 'u_0123456789abcdef';
const peer = 'u_fedcba9876543210';
const bad = [null, [], 'text', { t: 'text', text: { toString: null, valueOf: null } },
  { t: 'file' }, { t: 'image', f: null }, { t: 'contact', u: {} },
  { t: 'text', text: 'ok', cap: {} }, { t: 'text', text: 'ok', r: { id: {}, x: 'reply' } },
  { t: 'text', text: 'ok', mn: [{}] }, { t: 'unknown' }];
const good = [{ t: 'text', text: 'hello', r: { id: 3, x: 'old-format reply' } },
  { t: 'contact', u: peer }, { t: 'file', f: { id: 'b_' + 'a'.repeat(24), k: btoa('k'.repeat(32)), n: 'a.txt', s: 12 } },
  { t: 'image', f: { id: 'b_' + 'b'.repeat(24), k: btoa('k'.repeat(32)), n: 'a.png', s: 120, m: 'image/png', w: 2, h: 3, px: btoa('x'.repeat(192)) }, cap: 'image', fw: 'someone', mn: [peer] }];
const eng = new Engine();
eng.s.me = { id: uid };
eng.s.people[peer] = { id: peer, name: 'peer' };
eng.chatKeys.test = C.newKey();
for (const body of bad) {
  const m = await eng.decryptMsg({ id: 1, chat: 'test', from: peer, kind: 'msg', ct: await C.encJson(eng.chatKeys.test, body, 'test') });
  assert.equal(m.body.text, '[invalid message]');
  assert.doesNotThrow(() => decorate({ eng }, { id: 'test', type: 'direct', peer, members: [{ id: uid }, { id: peer }], last: m }));
  assert.equal(typeof msgPreview(m, eng), 'string');
  const cache = normalizeCache({ schema: 1, chats: { test: { type: 'direct', members: [{ id: uid }], last: { ...m, body } } }, msgs: { test: [{ ...m, body }] } });
  assert.equal(cache.chats.test.last.body.text, '[invalid message]');
  assert.equal(cache.msgs.test[0].body.text, '[invalid message]');
}
for (const body of good) {
  const safe = normalizeBody(body);
  assert.notEqual(safe.invalid, true);
  assert.deepEqual(normalizeBody(safe), safe, 'normalization survives repeated cache/preview reads');
}
assert.deepEqual(chatMeta({ name: 'group', type: 'direct', members: null, last: {} }), { name: 'group', desc: '', inv: '' });
assert.throws(() => chatMeta({ name: {} }));
assert.equal(normalizeCache({ chats: { bad: { type: 'group', members: null } } }).dropped, true);
const legacy = normalizeCache({ cursor: 99, chats: { poisoned: { type: 'group', members: [{ id: uid }], unread: { toString: null, valueOf: null } } } });
assert.equal(legacy.dropped, true);
assert.deepEqual(legacy.chats, {});
console.log('PASS client: malformed encrypted messages, previews, cache copies, normal messages and metadata');

// A peer chooses the file type; only raster images may keep theirs, so no decrypted blob can be a same-origin document.
const fileOf = (t, m) => normalizeBody({ t, f: { id: 'b_' + 'c'.repeat(24), k: btoa('k'.repeat(32)), n: 'x', s: 1, m } });
assert.equal(fileOf('image', 'image/png').t, 'image');
for (const m of ['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/xml', '', undefined]) {
  assert.equal(fileOf('image', m).t, 'file', 'non-raster "image" downgraded: ' + m);
  assert.equal(safeMime(m), 'application/octet-stream', 'blob type neutralised: ' + m);
}
assert.equal(safeMime('IMAGE/JPEG'), 'image/jpeg');
assert.equal(sniffRaster(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10])), 'image/png');
assert.equal(sniffRaster(new TextEncoder().encode('GIF89a<html><script>')), 'image/gif');
assert.equal(sniffRaster(new TextEncoder().encode('<svg onload=alert(1)>')), 'application/octet-stream');
console.log('PASS client: file and avatar blob types are limited to raster images');
