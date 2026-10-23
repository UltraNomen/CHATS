// End-to-end API test using the real client crypto. Run against an empty server:
//   node test/e2e.mjs http://localhost:8780
import { createHmac } from 'node:crypto';
import { Api, apiBase } from '../shared/core/api.js';
import * as C from '../shared/core/crypto.js';
import { b64, unb64, te } from '../shared/core/bytes.js';

const BASE = apiBase(process.argv[2] || 'http://localhost:8780');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const expectErr = async (p, code, m) => { try { await p; ok(false, m + ' (no error)'); } catch (e) { ok(e.code === code, m + ' → ' + e.code); } };

function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/\s/g, '')) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[19] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

// E2E_DB / E2E_STORAGE (JSON) pick the engines the server is installed with; default sqlite + local disk.
const DB = JSON.parse(process.env.E2E_DB || '{"engine":"sqlite"}');
const ST = JSON.parse(process.env.E2E_STORAGE || '{"backend":"local"}');
const kdf = { m: 8192, t: 1, p: 1 }; // light params keep the test fast; the real client uses the server's kdf settings

async function signup(api, username, password, extra = {}) {
  const acct = await C.createAccount(password, kdf);
  const r = await api.post('auth/signup', { username, name: username + ' test', ...acct.payload, ...extra });
  api.token = r.token;
  return { ...acct, id: r.me.id, me: r.me, api, pk: acct.payload.pubKey, r };
}

async function login(username, password) {
  const api = new Api(BASE);
  const pre = await api.post('auth/prelogin', { method: 'username', id: username });
  const d = await C.derivePassword(password, pre.salt);
  const r = await api.post('auth/login', { method: 'username', id: username, auth: b64(d.auth) });
  api.token = r.token;
  const mk = await C.unwrapMk(d.encKey, r.keys.pwWrap);
  const vault = await C.decJson(mk, r.keys.vault, 'vault');
  return { api, r, mk, vault, sk: unb64(vault.sk) };
}

async function chatKey(sync, chatId, sk) {
  const c = sync.chats.find(x => x.id === chatId);
  return C.unseal(sk, c.box);
}

const anon = new Api(BASE);
const info = await anon.get('info');
ok(info.server.installed === false, 'fresh server reports not installed');

// ---- setup wizard: owner account + TOTP enrollment
const owner = await C.createAccount('rootpassword', kdf);
await expectErr(anon.post('setup/launch', { server: { name: '' }, db: DB, storage: ST, owner: { username: 'root', ...owner.payload } }), 'bad_request', 'launch rejects empty server name');
const t1 = await anon.post('setup/test', { what: 'db', db: DB });
ok(t1.pass, 'setup db test: ' + t1.msg);
const t2 = await anon.post('setup/test', { what: 'storage', storage: ST });
ok(t2.pass, 'setup storage test: ' + t2.msg);
const launch = await anon.post('setup/launch', { server: { name: 'nightshift.test', reg: 'open', tfaUsers: 'optional' }, db: DB, storage: ST,
  smtp: { on: false }, owner: { username: 'root', name: 'root', ...owner.payload } });
ok(launch.ticket && launch.secret, 'launch returns TOTP enrollment');
await expectErr(anon.post('auth/enroll', { ticket: launch.ticket, code: '000000' }), 'bad_code', 'enroll rejects wrong code');
const en = await anon.post('auth/enroll', { ticket: launch.ticket, code: totp(launch.secret) });
ok(en.backupCodes.length === 8, 'owner enrolled, 8 backup codes');
await expectErr(anon.post('setup/launch', {}), 'installed', 'setup is closed after install');

// ---- admin login (password + TOTP)
const pre = await anon.post('auth/prelogin', { id: 'root' });
const dRoot = await C.derivePassword('rootpassword', pre.salt);
const al = await anon.post('auth/login', { id: 'root', auth: b64(dRoot.auth), admin: true });
ok(al.need2fa && al.ticket, 'admin login asks for TOTP');
const admin = new Api(BASE);
const as = await admin.post('auth/2fa', { ticket: al.ticket, code: totp(launch.secret, Math.floor(Date.now() / 30000) + 1), admin: true });
admin.token = as.token;
ok(as.token && as.me.role === 'owner', 'admin session created');
const ov = await admin.get('admin/overview');
ok(ov.users === 1, 'overview counts the owner');

// ---- users
const ada = await signup(new Api(BASE), 'ada', 'adapassword');
const kie = await signup(new Api(BASE), 'kiejo', 'kiejopassword');
ok(ada.r.token && kie.r.token, 'two users signed up');
await expectErr(new Api(BASE).post('auth/signup', { username: 'ada', ...(await C.createAccount('x1234567', kdf)).payload }), 'username_taken', 'duplicate username');
const wrong = new Api(BASE);
const preA = await wrong.post('auth/prelogin', { id: 'ada' });
await expectErr(wrong.post('auth/login', { id: 'ada', auth: b64((await C.derivePassword('nope', preA.salt)).auth) }), 'bad_credentials', 'wrong password rejected');
const adaL = await login('ada', 'adapassword');
ok(adaL.vault.phrase.length === 8 && adaL.vault.phrase.join(' ') === ada.phrase.join(' '), 'login unwraps account key, vault holds the phrase');

const found = await ada.api.get('users/search', { q: 'kie' });
ok(found.users.length === 1 && found.users[0].id === kie.id, 'search finds @kiejo');

// ---- direct chat + encrypted message
const k = C.newKey();
const dc = await ada.api.post('chat/direct', { peer: kie.id, boxMine: await C.seal(ada.pk, k), boxPeer: await C.seal(kie.pk, k) });
ok(dc.created && dc.id.startsWith('d_'), 'direct chat created');
const dc2 = await kie.api.post('chat/direct', { peer: ada.id, boxMine: await C.seal(kie.pk, C.newKey()), boxPeer: await C.seal(ada.pk, C.newKey()) });
ok(dc2.id === dc.id && !dc2.created, 'second caller gets the same chat');
const body = { t: 'text', text: 'pushed the waitlist build' };
const sent = await ada.api.post('msg/send', { chat: dc.id, cid: 'c1', ct: await C.encJson(k, body, dc.id) });
ok(sent.message.id > 0, 'message sent');
const again = await ada.api.post('msg/send', { chat: dc.id, cid: 'c1', ct: await C.encJson(k, body, dc.id) });
ok(again.message.id === sent.message.id, 'resend with same client id is deduplicated');
let ks = await kie.api.post('sync', { since: 0 });
const kChat = ks.chats.find(c => c.id === dc.id);
ok(kChat && kChat.unread === 1, 'kiejo sees 1 unread');
const kk = await chatKey(ks, dc.id, kie.sk);
const dec = await C.decJson(kk, kChat.last.ct, dc.id);
ok(dec.text === body.text, 'kiejo decrypts the message: ' + dec.text);
const cursor = ks.cursor;
await kie.api.post('chat/update', { chat: dc.id, read: sent.message.id });
await kie.api.post('msg/send', { chat: dc.id, cid: 'c2', ct: await C.encJson(kk, { t: 'text', text: 'pulling now', r: { id: sent.message.id, x: 'pushed…' } }, dc.id) });
const as2 = await ada.api.post('sync', { since: cursor - 1 });
ok(as2.messages.some(m => m.cid === 'c2'), 'delta sync delivers the reply');
const adaChat = as2.chats.find(c => c.id === dc.id);
ok(adaChat.members.find(m => m.id === kie.id).read >= sent.message.id, 'read receipt visible');
await expectErr(kie.api.post('msg/edit', { id: sent.message.id, ct: await C.encJson(kk, { t: 'text', text: 'x' }, dc.id) }), 'forbidden', "can't edit someone else's message");
await ada.api.post('msg/edit', { id: sent.message.id, ct: await C.encJson(k, { t: 'text', text: 'pushed the waitlist build v2' }, dc.id) });
const hist = await kie.api.get('history', { chat: dc.id });
ok(hist.messages.length === 2 && hist.messages[0].edited > 0 && hist.messages[0].id === sent.message.id, 'history shows the edit');

// ---- encrypted file
const file = te.encode('#!/bin/sh\necho cleanup\n'.repeat(200));
const ef = await C.encryptFile(file);
const fd = new FormData();
fd.append('file', new Blob([ef.data]), 'blob');
fd.append('purpose', 'file');
const up = await (await fetch(BASE + '?r=file/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + ada.api.token }, body: fd })).json();
ok(up.ok && up.id, 'encrypted file uploaded');
await ada.api.post('msg/send', { chat: dc.id, cid: 'c3', ct: await C.encJson(k, { t: 'file', f: { id: up.id, k: ef.key, n: 'cleanup.sh', s: file.length } }, dc.id), blobs: [up.id] });
const got = await kie.api.download('file', { id: up.id });
ok((await C.decryptFile(ef.key, got)).length === file.length, 'kiejo downloads and decrypts the file');
const outsider = await signup(new Api(BASE), 'mallory', 'mallorypass');
await expectErr(outsider.api.download('file', { id: up.id }), 'no_file', 'non-member cannot fetch the file');

// ---- group with invite link
const gk = C.newKey();
const inv = await C.inviteSecrets(gk);
const meta = await C.encJson(gk, { name: 'ops-night', desc: 'night shift', inv: inv.token }, 'meta');
const g = await ada.api.post('chat/group', { meta, inviteHash: inv.hash, inviteWrap: inv.wrap,
  members: [{ id: ada.id, box: await C.seal(ada.pk, gk) }, { id: kie.id, box: await C.seal(kie.pk, gk) }] });
ok(g.id, 'group created');
const ji = await outsider.api.post('chat/join-info', { hash: inv.hash });
const joinedKey = await C.openInvite(inv.token, ji.wrap);
ok(b64(joinedKey) === b64(gk), 'invite link unwraps the group key');
await outsider.api.post('chat/join', { chat: g.id, hash: inv.hash, box: await C.seal(outsider.pk, joinedKey) });
const os = await outsider.api.post('sync', { since: 0 });
const og = os.chats.find(c => c.id === g.id);
ok(og && og.members.length === 3, 'joined via link · 3 members');
ok((await C.decJson(await C.unseal(outsider.sk, og.box), og.meta, 'meta')).name === 'ops-night', 'new member decrypts the group name');

// ---- report → admin
const spam = await outsider.api.post('msg/send', { chat: g.id, cid: 's1', ct: await C.encJson(gk, { t: 'text', text: 'FREE crypto airdrop' }, g.id) });
const rep = await ada.api.post('msg/report', { id: spam.message.id, reason: 'spam', note: 'sent to 4 groups', body: 'FREE crypto airdrop' });
ok(/^#R-/.test(rep.id), 'report filed ' + rep.id);
const reps = await admin.get('admin/reports');
ok(reps.reports[0].msg === 'FREE crypto airdrop' && reps.reports[0].author === 'mallory', 'admin sees the reported message');
await admin.post('admin/report', { id: reps.reports[0].id, action: 'disable' });
await expectErr(outsider.api.post('sync', { since: 0 }), 'account_disabled', 'disabled user is locked out');
await admin.post('admin/report', { id: reps.reports[0].id, action: 'undo' });
const relog = await login('mallory', 'mallorypass');
ok(!!relog.r.token, 'undo re-enables the user');

// ---- recovery phrase → new password
const rs = await anon.post('auth/recover-salt', { u: 'ada' });
const rd = await C.derivePhrase(ada.phrase, rs.salt);
const rec = await anon.post('auth/recover', { u: 'ada', rcAuth: b64(rd.auth) });
const mk = await C.unwrapMk(rd.encKey, rec.rcWrap);
ok(b64(mk) === b64(ada.mk), 'phrase unwraps the account key');
await expectErr(anon.post('auth/recover', { u: 'ada', rcAuth: b64(C.newKey()) }), 'bad_phrase', 'wrong phrase rejected');
const nw = await C.rewrapPassword(mk, 'newpassword1', kdf);
const reset = await anon.post('auth/reset', { ticket: rec.ticket, ...nw });
ok(!!reset.token, 'password reset signs in');
await expectErr(ada.api.post('sync', { since: 0 }), 'session_revoked', 'old sessions are signed out');
ok(!!(await login('ada', 'newpassword1')).r.token, 'login with the new password');

// ---- admin config: maintenance + capability switches
await admin.post('admin/config', { server: { maint: true, capEdit: false } });
await expectErr(kie.api.post('sync', { since: 0 }), 'maintenance', 'maintenance mode blocks users');
await admin.post('admin/config', { server: { maint: false } });
const ks2 = await kie.api.post('sync', { since: 0 });
ok(ks2.config.caps.edit === false, 'capabilities reach the client');
const audit = await admin.get('admin/audit');
ok(audit.rows.length >= 5, 'audit log has ' + audit.rows.length + ' entries');
const bk = await admin.post('admin/backup');
ok(bk.backup.st === 'OK' && bk.backup.size > 0, 'backup snapshot written');
const health = await admin.get('admin/health');
ok(health.services.length === 6, 'health lists services');

// ---- optional: switch blob storage through each config in E2E_STORAGE_SWITCH (JSON array); every earlier file must stay readable
const stored = [{ id: up.id, size: ef.data.length }];
for (const target of JSON.parse(process.env.E2E_STORAGE_SWITCH || '[]')) {
  const where = target.backend === 's3' ? 's3 ' + target.bucket : 'local ' + (target.path || 'default dir');
  if (target.backend === 's3') await expectErr(admin.post('admin/config', { storage: { ...target, secret: 'wrong-secret' } }), 'storage_failed', 'bad s3 secret is refused before switching');
  const r = await admin.post('admin/config', { storage: target });
  ok(r.changed.includes('storage'), 'storage → ' + where);
  for (const f of stored) ok((await kie.api.download('file', { id: f.id })).length === f.size, `  file ${f.id.slice(0, 8)} from an earlier location still downloads`);
  const data = (await C.encryptFile(te.encode('payload for ' + where))).data;
  const form = new FormData();
  form.append('file', new Blob([data]), 'blob');
  form.append('purpose', 'file');
  const u2 = await (await fetch(BASE + '?r=file/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + kie.api.token }, body: form })).json();
  await kie.api.post('msg/send', { chat: dc.id, cid: 'st' + stored.length, ct: await C.encJson(kk, { t: 'file', f: { id: u2.id, n: 'x', s: data.length } }, dc.id), blobs: [u2.id] });
  ok((await kie.api.download('file', { id: u2.id })).length === data.length, '  new upload lands and downloads');
  stored.push({ id: u2.id, size: data.length });
}

// ---- optional: migrate the live server through each database in E2E_MIGRATE (JSON array of db configs)
let hop = 0, prev = DB;
for (const target of JSON.parse(process.env.E2E_MIGRATE || '[]')) {
  hop++;
  const before = await kie.api.get('history', { chat: dc.id });
  const r = await admin.post('admin/config', { db: target });
  const total = Object.values(r.migrated || {}).reduce((a, b) => a + b, 0);
  ok(r.changed.includes('database') && total > 0, `migrate → ${target.engine}: ${total} rows copied`);
  const cfg = await admin.get('admin/config');
  ok(cfg.db.engine === target.engine && cfg.dbVersion.toLowerCase().includes(target.engine === 'postgres' ? 'postgres' : target.engine), 'now running ' + cfg.dbVersion);
  const sync = await kie.api.post('sync', { since: 0 });
  const after = await kie.api.get('history', { chat: dc.id });
  ok(after.messages.length === before.messages.length && after.messages.length > 0, `sessions survive and see the same ${after.messages.length} messages`);
  const key = await chatKey(sync, dc.id, kie.sk);
  const last = after.messages.filter(m => m.ct).pop();
  ok(!!(await C.decJson(key, last.ct, dc.id)), 'messages still decrypt after migration');
  const sent2 = await kie.api.post('msg/send', { chat: dc.id, cid: 'mig' + hop, ct: await C.encJson(key, { t: 'text', text: 'after hop ' + hop }, dc.id) });
  const next = await kie.api.post('sync', { since: sync.cursor });
  ok(sent2.message.id > Math.max(...before.messages.map(m => m.id)) && next.cursor > sync.cursor, 'new message gets a fresh id and the sync cursor moves on');
  const dl = await kie.api.download('file', { id: up.id });
  ok(dl.length > 0, 'stored files still download');
  ok(!!(await login('kiejo', 'kiejopassword')).r.token, 'login works on ' + target.engine);
  await expectErr(admin.post('admin/config', { db: prev }), 'db_not_empty', 'refuses to migrate back into the old database, which still has data');
  prev = target;
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
