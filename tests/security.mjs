// Security regressions against an EMPTY disposable local server. Never use production.
import assert from 'node:assert/strict';
import { createHmac, createECDH, randomBytes } from 'node:crypto';
import { Api, apiBase } from '../shared/core/api.js';
import * as C from '../shared/core/crypto.js';
import { b64 } from '../shared/core/bytes.js';
const url = new URL(process.argv[2] || 'http://127.0.0.1:8791');
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'use a disposable loopback server');
const base = apiBase(url.href), anon = new Api(base), kdf = { m: 8192, t: 1, p: 1 };
const DB = JSON.parse(process.env.E2E_DB || '{"engine":"sqlite"}');
const rejects = async (promise, codes) => {
  try { await promise; assert.fail('security trigger unexpectedly succeeded'); }
  catch (e) { assert([].concat(codes).includes(e.code), `expected ${codes}, got ${e.code || e.message}`); }
};
function totp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/\s/g, '')].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2))), msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(msg).digest(), offset = h[19] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, '0');
}
async function account(name) {
  const keys = await C.createAccount(name + ' password', kdf), api = new Api(base);
  const r = await api.post('auth/signup', { ...keys.payload, username: name });
  api.token = r.token;
  return { ...keys, api, id: r.me.id };
}
assert.equal((await anon.get('info')).server.installed, false, 'server must have an empty data directory');
const owner = await C.createAccount('root password', kdf);
const launch = await anon.post('setup/launch', { server: { name: 'security.test', reg: 'open' }, db: DB, storage: { backend: 'local' }, owner: { ...owner.payload, username: 'root' } });
let secret = launch.secret;
await anon.post('auth/enroll', { ticket: launch.ticket, code: totp(secret) });
const rootLogin = admin => anon.post('auth/login', { id: 'root', auth: owner.payload.auth, admin });
const challenge = await rootLogin(true), admin = new Api(base);
admin.token = (await anon.post('auth/2fa', { ticket: challenge.ticket, admin: true, code: totp(secret) })).token;
await admin.post('admin/config', { server: { tfaUsers: 'off' } });
const appChallenge = await rootLogin(false);
assert.equal(appChallenge.need2fa, true, 'staff must verify MFA even when ordinary-user MFA is off');
assert(!appChallenge.methods.includes('email'));
await rejects(anon.post('auth/2fa', { ticket: challenge.ticket, admin: true, kind: 'email', code: '123456' }), 'bad_code');
const app = new Api(base);
app.token = (await anon.post('auth/2fa', { ticket: appChallenge.ticket, code: totp(secret) })).token;
await rejects(app.post('mfa/setup'), 'forbidden');
await rejects(app.post('mfa/enable', { code: totp(secret) }), ['bad_ticket', 'forbidden']);
await admin.post('admin/config', { server: { tfaAdmins: 'required' } });
await rejects(app.post('mfa/disable', { code: totp(secret) }), 'mfa_required');
await rejects(admin.post('admin/mfa', { action: 'disable', currentCode: totp(secret) }), 'mfa_required');
await rejects(app.post('mfa/backup'), 'bad_code');
await rejects(admin.post('admin/mfa', { action: 'enroll' }), 'bad_code');
const replacement = await admin.post('admin/mfa', { action: 'enroll', currentCode: totp(secret) });
await rejects(app.post('mfa/enable', { code: totp(replacement.secret) }), ['bad_ticket', 'forbidden']);
await anon.post('auth/enroll', { ticket: replacement.ticket, code: totp(replacement.secret) });
secret = replacement.secret;
await rejects(anon.post('auth/enroll', { ticket: replacement.ticket, code: totp(secret) }), 'bad_ticket');
const backups = (await app.post('mfa/backup', { currentCode: totp(secret) })).backupCodes;
assert.equal(backups.length, 8);
const backupChallenge = await rootLogin(true);
const backupRace = await Promise.allSettled([1, 2, 3].map(() => anon.post('auth/2fa', { ticket: backupChallenge.ticket, admin: true, kind: 'backup', code: backups[0] })));
assert.equal(backupRace.filter(r => r.status === 'fulfilled').length, 1, 'a backup code has exactly one concurrent consumer');
console.log('PASS MFA: staff policy, factor methods, replacement proof, enrollment flow binding and backup management');

// Optional admin 2FA: password-only console sign-in, self-service enrollment, and a policy switch that takes effect at once.
await admin.post('admin/config', { server: { tfaAdmins: 'optional' } });
const staffAccount = async (name, role) => {
  const acct = await account(name);
  await admin.post('admin/user', { id: acct.id, action: 'role', role });
  return { ...acct, username: name };
};
const dave = await staffAccount('dave', 'moderator'), erin = await staffAccount('erin', 'admin');
const consoleLogin = acct => anon.post('auth/login', { id: acct.username, auth: acct.payload.auth, admin: true });
const daveConsole = new Api(base);
const direct0 = await consoleLogin(dave);
assert(direct0.token && !direct0.need2fa && !direct0.needEnroll, 'optional policy: staff without an authenticator sign in with the password');
daveConsole.token = direct0.token;
assert.equal((await daveConsole.get('admin/me')).me.mfa, false);
await rejects(daveConsole.post('admin/mfa', { action: 'backup' }), 'bad_code');
const daveEnroll = await daveConsole.post('admin/mfa', { action: 'enroll' });
await anon.post('auth/enroll', { ticket: daveEnroll.ticket, code: totp(daveEnroll.secret) });
assert.equal((await consoleLogin(dave)).need2fa, true, 'an enrolled authenticator is always asked for');
await rejects(daveConsole.post('admin/mfa', { action: 'enroll' }), 'bad_code');
await rejects(daveConsole.post('admin/mfa', { action: 'disable', currentCode: '000000' }), 'bad_code');
await daveConsole.post('admin/mfa', { action: 'disable', currentCode: totp(daveEnroll.secret) });
assert((await consoleLogin(dave)).token, 'turned off → password-only again');
const erinConsole = new Api(base);
erinConsole.token = (await consoleLogin(erin)).token;
await rejects(erinConsole.post('admin/config', { server: { tfaAdmins: 'required' } }), 'enroll_first');
await admin.post('admin/config', { server: { tfaAdmins: 'required' } });
await rejects(daveConsole.get('admin/me'), 'session_revoked');
await rejects(dave.api.post('sync', { since: 0 }), 'mfa_enroll_required');
assert.equal((await consoleLogin(dave)).needEnroll, true, 'required policy enrolls staff at sign-in');
await admin.post('admin/config', { server: { tfaAdmins: 'optional', tfaUsers: 'optional' } });
console.log('PASS optional admin 2FA: password-only console, self enrollment and removal, and enforcing the required policy');

const alice = await account('alice'), bob = await account('bob'), carol = await account('carol');
const first = await alice.api.post('mfa/setup');
await rejects(bob.api.post('mfa/enable', { code: totp(first.secret) }), 'bad_ticket');
await alice.api.post('mfa/enable', { code: totp(first.secret) });
await rejects(alice.api.post('mfa/setup'), 'forbidden');
await alice.api.post('mfa/disable', { code: totp(first.secret) });
console.log('PASS ordinary user enrollment and verified disable remain available');

const key = C.newKey(), direct = await alice.api.post('chat/direct', { peer: bob.id, boxMine: await C.seal(alice.payload.pubKey, key), boxPeer: await C.seal(bob.payload.pubKey, key) });
const invitation = await C.inviteSecrets(key);
await rejects(alice.api.post('chat/update', { chat: direct.id, inviteHash: invitation.hash, inviteWrap: invitation.wrap }), 'forbidden');
await rejects(alice.api.post('chat/update', { chat: direct.id, inviteWrap: invitation.wrap }), 'forbidden');
await alice.api.post('chat/update', { chat: direct.id, muted: true, read: 0 });
const groupPayload = { meta: await C.encJson(key, { name: 'test group' }, 'meta'), inviteHash: invitation.hash, inviteWrap: invitation.wrap,
  members: [{ id: alice.id, box: await C.seal(alice.payload.pubKey, key) }, { id: bob.id, box: await C.seal(bob.payload.pubKey, key) }] };
await rejects(alice.api.post('chat/group', { ...groupPayload, inviteWrap: 'A'.repeat(4000) }), 'bad_request');
const group = await alice.api.post('chat/group', groupPayload);
await carol.api.post('chat/join', { chat: group.id, hash: invitation.hash, box: await C.seal(carol.payload.pubKey, key) });
assert.equal((await carol.api.post('sync', { since: 0 })).chats.find(c => c.id === group.id).members.length, 3);
console.log('PASS chat invariants: bounded create payloads, direct invite rejection and legitimate group join');

const rec = await anon.post('auth/recover', { u: 'alice', rcAuth: alice.payload.rcAuth });
const next = await C.rewrapPassword(alice.mk, 'new alice password', kdf);
const result = await anon.post('auth/reset', { ticket: rec.ticket, ...next });
await rejects(anon.post('auth/reset', { ticket: rec.ticket, ...next }), 'bad_ticket');
alice.api.token = result.token;
const outstanding = await anon.post('auth/recover', { u: 'alice', rcAuth: alice.payload.rcAuth });
const phrase = await C.rewrapPhrase(alice.mk, C.newPhrase());
await rejects(alice.api.post('phrase', phrase), 'bad_request');
await rejects(alice.api.post('phrase', { ...phrase, auth: alice.payload.auth }), 'bad_password');
await alice.api.post('phrase', { ...phrase, auth: next.auth });
await rejects(anon.post('auth/reset', { ticket: outstanding.ticket, ...next }), 'bad_ticket');
const raceTicket = await anon.post('auth/recover', { u: 'alice', rcAuth: phrase.rcAuth });
const resets = await Promise.allSettled([1, 2, 3].map(() => anon.post('auth/reset', { ticket: raceTicket.ticket, ...next })));
assert.equal(resets.filter(r => r.status === 'fulfilled').length, 1, 'one concurrent reset wins');
assert(resets.filter(r => r.status === 'rejected').every(r => r.reason.code === 'bad_ticket'));
alice.api.token = resets.find(r => r.status === 'fulfilled').value.token;
console.log('PASS recovery: replay, credential-rotation invalidation and concurrent single-use consumption');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
async function avatar() {
  const form = new FormData(); form.append('purpose', 'avatar'); form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  const r = await (await fetch(base + '?r=file/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + bob.api.token }, body: form })).json();
  assert.equal(r.ok, true, r.error); return r;
}
const before = (await admin.get('admin/storage')).count;
await Promise.all(Array.from({ length: 8 }, avatar));
assert.equal((await admin.get('admin/storage')).count - before, 1, 'parallel upload losers cleaned');
for (let i = 0; i < 4; i++) await Promise.all([avatar(), bob.api.post('avatar/remove')]);
const current = (await bob.api.post('sync', { since: 0 })).me.avatar;
assert.equal((await admin.get('admin/storage')).count - before, current ? 1 : 0, 'upload/remove interleaving stays bounded');
if (current) assert((await bob.api.download('file', { id: current })).length > 0);
await bob.api.post('avatar/remove');
assert.equal((await admin.get('admin/storage')).count, before);
console.log('PASS avatar lifecycle: parallel upload/upload and upload/remove retain only the live image');

for (const endpoint of ['https://127.0.0.1/push', 'https://[::1]/push', 'https://fcm.googleapis.com.evil.test/push',
  'https://user@fcm.googleapis.com/push', 'https://fcm.googleapis.com:8443/push']) {
  await rejects(bob.api.post('push/subscribe', { endpoint, p256dh: b64(C.newKey()), auth: b64(C.newKey()) }), 'bad_request');
}
const p256 = createECDH('prime256v1'), uaKey = new Uint8Array(p256.generateKeys()), uaAuth = new Uint8Array(randomBytes(16));
const fcm = 'https://fcm.googleapis.com/wp/security-test-not-sent';
for (const [k, a] of [[C.newKey(), uaAuth], [new Uint8Array(65).fill(4), uaAuth], [uaKey, C.newKey()]]) {
  await rejects(bob.api.post('push/subscribe', { endpoint: fcm, p256dh: b64(k), auth: b64(a) }), 'bad_request');
}
await bob.api.post('push/subscribe', { endpoint: fcm, p256dh: b64(uaKey), auth: b64(uaAuth) });
await bob.api.post('push/unsubscribe');
console.log('PASS push subscription policy: provider allow-list and usable subscription keys (no push requests sent)');

const status = await anon.get('setup/status');
assert.deepEqual(Object.keys(status).sort(), ['installed', 'ok'], 'installed servers reveal nothing through setup/status');
console.log('PASS setup/status reveals no host details after install');

// Vault saves: two writers on the same version, exactly one wins and the other is told to merge.
const vaultVer = (await carol.api.post('sync', { since: 0, vaultVer: -1 })).vault.ver;
const saves = await Promise.allSettled([1, 2].map(n => carol.api.post('vault', { data: 'v' + n, ver: vaultVer })));
assert.equal(saves.filter(r => r.status === 'fulfilled').length, 1);
assert(saves.filter(r => r.status === 'rejected').every(r => r.reason.code === 'vault_conflict' && r.reason.extra.ver === vaultVer + 1));
console.log('PASS vault: concurrent saves never lose an update silently');

// Typing: visible to members only, cleared by sending, suppressed by hidden online status.
const typingIn = async (acct, chat) => (await acct.api.post('sync', { since: 0 })).typing.filter(t => t.chat === chat);
await carol.api.post('chat/typing', { chat: group.id });
assert.deepEqual(await typingIn(alice, group.id), [{ chat: group.id, user: carol.id }]);
assert.deepEqual(await typingIn(carol, group.id), [], 'you never see yourself typing');
const eve = await account('eve');
await rejects(eve.api.post('chat/typing', { chat: group.id }), 'no_chat');
assert.equal((await eve.api.post('sync', { since: 0 })).typing.length, 0);
await carol.api.post('msg/send', { chat: group.id, cid: 'typing-clear', ct: await C.encJson(key, { t: 'text', text: 'hi' }, group.id) });
assert.deepEqual(await typingIn(alice, group.id), [], 'sending clears typing');
await carol.api.post('profile', { showOnline: false });
await carol.api.post('chat/typing', { chat: group.id });
assert.deepEqual(await typingIn(alice, group.id), [], 'hidden online status hides typing');
console.log('PASS typing: members only, cleared on send, follows the online-status privacy setting');

// Password reset keeps the second factor, and remembered devices are forgotten once credentials change.
const bobPw = await C.derivePassword('bob password', (await anon.post('auth/prelogin', { id: 'bob' })).salt);
const bobMfa = await bob.api.post('mfa/setup');
await bob.api.post('mfa/enable', { code: totp(bobMfa.secret) });
const appLogin = (auth, trust) => anon.post('auth/login', { id: 'bob', auth, trust });
const remembered = await anon.post('auth/2fa', { ticket: (await appLogin(b64(bobPw.auth))).ticket, code: totp(bobMfa.secret), remember: true });
assert(remembered.trust, 'remember this device issues a trust token');
assert((await appLogin(b64(bobPw.auth), remembered.trust)).token, 'a trusted device skips the code');
const bobRec = await anon.post('auth/recover', { u: 'bob', rcAuth: bob.payload.rcAuth });
const bobNext = await C.rewrapPassword(bob.mk, 'new bob password', kdf);
const afterReset = await anon.post('auth/reset', { ticket: bobRec.ticket, ...bobNext, trust: remembered.trust });
assert(afterReset.need2fa && !afterReset.token, 'the recovery phrase does not bypass the authenticator');
bob.api.token = (await anon.post('auth/2fa', { ticket: afterReset.ticket, code: totp(bobMfa.secret) })).token;
assert.equal((await appLogin(bobNext.auth, remembered.trust)).need2fa, true, 'trust tokens die with the old password');
console.log('PASS reset: second factor still required, trust tokens bound to the current credentials');
console.log('ALL SECURITY REGRESSIONS PASSED');
