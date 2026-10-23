// End-to-end crypto. The server only ever sees ciphertext, wrapped keys and hashes.
//
//   password ─argon2id→ encKey (wraps the account key) + authKey (sha256 stored server-side)
//   8 words  ─argon2id→ same pair, a second way to unwrap the account key
//   account key (MK) encrypts the vault: identity secret key, contacts, recovery phrase
//   identity: x25519 · chat keys are sealed to each member: ephemeral x25519 + HKDF-SHA256 + AES-256-GCM
//   messages, group names, file metadata: AES-256-GCM under the chat key · files: AES-256-GCM, one key per file
import { argon2id } from 'hash-wasm';
import { x25519 } from '@noble/curves/ed25519';
import { wordlist } from '@scure/bip39/wordlists/english';
import { te, td, b64, unb64, concat, rand, hex } from './bytes.js';
import { idbGet, idbSet } from './idb.js';

export const WORDS = wordlist;
const subtle = crypto.subtle;
const RC_KDF = { m: 19456, t: 2, p: 1 };

async function aesKey(raw, usage = ['encrypt', 'decrypt']) {
  return raw instanceof CryptoKey ? raw : subtle.importKey('raw', raw, 'AES-GCM', false, usage);
}

/** nonce(12) || ciphertext+tag */
export async function aesEncrypt(key, data, aad) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, ...(aad ? { additionalData: te.encode(aad) } : {}) }, await aesKey(key), data);
  return concat(iv, new Uint8Array(ct));
}

export async function aesDecrypt(key, blob, aad) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: blob.subarray(0, 12), ...(aad ? { additionalData: te.encode(aad) } : {}) }, await aesKey(key), blob.subarray(12));
  return new Uint8Array(pt);
}

export const encJson = async (key, obj, aad) => b64(await aesEncrypt(key, te.encode(JSON.stringify(obj)), aad));
export const decJson = async (key, s, aad) => JSON.parse(td.decode(await aesDecrypt(key, unb64(s), aad)));

export async function hkdf(ikm, salt, info, len = 32) {
  const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: te.encode(info) }, k, len * 8));
}

export const sha256 = async data => new Uint8Array(await subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data));

async function kdf(secret, salt, p) {
  const out = await argon2id({ password: secret, salt, parallelism: p.p || 1, iterations: p.t || 3, memorySize: p.m || 65536, hashLength: 64, outputType: 'binary' });
  return { encKey: out.slice(0, 32), auth: out.slice(32, 64) };
}

/** Salts travel with their argon2id parameters ("a2id$m=65536,t=3,p=1$<salt>") so accounts survive a change of server defaults. */
export function makeSalt(p) {
  const salt = rand(16);
  return { salt, str: `a2id$m=${p.m || 65536},t=${p.t || 3},p=${p.p || 1}$${b64(salt)}` };
}

export function parseSalt(str) {
  const m = /^a2id\$m=(\d+),t=(\d+),p=(\d+)\$(.+)$/.exec(str || '');
  if (!m) throw new Error('unsupported key derivation');
  return { salt: unb64(m[4]), p: { m: +m[1], t: +m[2], p: +m[3] } };
}

export async function derivePassword(password, saltStr) { const x = parseSalt(saltStr); return kdf(password.normalize('NFKC'), x.salt, x.p); }
export async function derivePhrase(words, saltStr) { const x = parseSalt(saltStr); return kdf(normPhrase(words), x.salt, x.p); }

export const normPhrase = words => (Array.isArray(words) ? words : String(words).split(/\s+/)).map(w => w.trim().toLowerCase()).filter(Boolean).join(' ');

/** 8 words from the 2048-word BIP39 list = 88 bits. */
export function newPhrase() {
  const r = new Uint16Array(8);
  crypto.getRandomValues(r);
  return Array.from(r, v => WORDS[v & 2047]);
}

export function newIdentity() {
  const sk = x25519.utils.randomPrivateKey();
  return { sk, pk: x25519.getPublicKey(sk) };
}

export const publicKey = sk => x25519.getPublicKey(sk);

/** Seal bytes to an x25519 public key (anonymous sender). */
export async function seal(pkB64, data) {
  const pk = unb64(pkB64);
  const eph = x25519.utils.randomPrivateKey();
  const ephPk = x25519.getPublicKey(eph);
  const k = await hkdf(x25519.getSharedSecret(eph, pk), concat(ephPk, pk), 'chats/seal/v1');
  return b64(concat(ephPk, await aesEncrypt(k, data)));
}

export async function unseal(sk, box) {
  const raw = unb64(box);
  const ephPk = raw.subarray(0, 32);
  const k = await hkdf(x25519.getSharedSecret(sk, ephPk), concat(ephPk, x25519.getPublicKey(sk)), 'chats/seal/v1');
  return aesDecrypt(k, raw.subarray(32));
}

/** Everything a new account needs, generated on the device. */
export async function createAccount(password, kdfParams) {
  const mk = rand(32);
  const id = newIdentity();
  const phrase = newPhrase();
  const pwSalt = makeSalt(kdfParams || {}), rcSalt = makeSalt(RC_KDF);
  const pw = await kdf(password.normalize('NFKC'), pwSalt.salt, kdfParams || {});
  const rc = await kdf(normPhrase(phrase), rcSalt.salt, RC_KDF);
  const vault = { sk: b64(id.sk), phrase, contacts: {} };
  return {
    mk, sk: id.sk, phrase, vault,
    payload: {
      pubKey: b64(id.pk), pwSalt: pwSalt.str, pwWrap: b64(await aesEncrypt(pw.encKey, mk, 'mk')), auth: b64(pw.auth),
      rcSalt: rcSalt.str, rcWrap: b64(await aesEncrypt(rc.encKey, mk, 'mk')), rcAuth: b64(rc.auth), vault: await encJson(mk, vault, 'vault'),
    },
  };
}

export async function rewrapPassword(mk, password, kdfParams) {
  const salt = makeSalt(kdfParams || {});
  const pw = await kdf(password.normalize('NFKC'), salt.salt, kdfParams || {});
  return { pwSalt: salt.str, pwWrap: b64(await aesEncrypt(pw.encKey, mk, 'mk')), auth: b64(pw.auth) };
}

export async function rewrapPhrase(mk, phrase) {
  const salt = makeSalt(RC_KDF);
  const rc = await kdf(normPhrase(phrase), salt.salt, RC_KDF);
  return { rcSalt: salt.str, rcWrap: b64(await aesEncrypt(rc.encKey, mk, 'mk')), rcAuth: b64(rc.auth) };
}

export const unwrapMk = async (encKey, wrapB64) => aesDecrypt(encKey, unb64(wrapB64), 'mk');

// ---- chats

export const newKey = () => rand(32);

export async function inviteSecrets(chatKey) {
  const token = rand(18);
  const tok = b64(token).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token: tok, ...(await inviteMaterial(chatKey, tok)) };
}

export async function inviteMaterial(chatKey, tok) {
  const hash = hex(await sha256('chats-invite:' + tok));
  const k = await hkdf(te.encode(tok), te.encode('chats-invite'), 'chats/invite/v1');
  return { hash, wrap: chatKey ? b64(await aesEncrypt(k, chatKey, 'invite')) : null, key: k };
}

export async function openInvite(tok, wrap) {
  const { key } = await inviteMaterial(null, tok);
  return aesDecrypt(key, unb64(wrap), 'invite');
}

// ---- files

export async function encryptFile(bytes) {
  const key = rand(32);
  return { key: b64(key), data: await aesEncrypt(key, bytes, 'file') };
}

export const decryptFile = async (keyB64, data) => aesDecrypt(unb64(keyB64), data, 'file');

// ---- device-held secrets: a non-extractable key in IndexedDB wraps the account key between visits

async function deviceKey() {
  let k = await idbGet('devkey');
  if (!k) {
    k = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await idbSet('devkey', k);
  }
  return k;
}

export async function deviceSeal(obj) { return aesEncrypt(await deviceKey(), te.encode(JSON.stringify(obj)), 'device'); }
export async function deviceOpen(blob) { return JSON.parse(td.decode(await aesDecrypt(await deviceKey(), blob, 'device'))); }
