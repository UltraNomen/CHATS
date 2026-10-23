// Seeds an installed server with a few test users, a direct chat, messages and one open report.
//   node test/seed.mjs http://localhost:8781   (registration must be open)
import { Api, apiBase } from '../shared/core/api.js';
import * as C from '../shared/core/crypto.js';

const BASE = apiBase(process.argv[2] || 'http://localhost:8780');
const kdf = { m: 8192, t: 1, p: 1 };

async function signup(username, password) {
  const api = new Api(BASE);
  const acct = await C.createAccount(password, kdf);
  const r = await api.post('auth/signup', { username, name: username, ...acct.payload });
  api.token = r.token;
  return { api, id: r.me.id, pk: acct.payload.pubKey };
}

const users = [];
for (const n of ['ada', 'kiejo', 'mallory', 'grace', 'linus', 'barbara', 'dennis', 'ken', 'margaret', 'alan']) users.push(await signup(n, n + 'password'));
const [ada, kie, mal] = users;
const k = C.newKey();
const dc = await ada.api.post('chat/direct', { peer: mal.id, boxMine: await C.seal(ada.pk, k), boxPeer: await C.seal(mal.pk, k) });
await ada.api.post('msg/send', { chat: dc.id, cid: 's1', ct: await C.encJson(k, { t: 'text', text: 'hi' }, dc.id) });
const spam = await mal.api.post('msg/send', { chat: dc.id, cid: 's2', ct: await C.encJson(k, { t: 'text', text: 'FREE crypto airdrop' }, dc.id) });
const r = await ada.api.post('msg/report', { id: spam.message.id, reason: 'spam', note: 'sent to 4 groups', body: 'FREE crypto airdrop' });
const k2 = C.newKey();
await kie.api.post('chat/direct', { peer: ada.id, boxMine: await C.seal(kie.pk, k2), boxPeer: await C.seal(ada.pk, k2) });
console.log('seeded', users.length, 'users · report', r.id);
