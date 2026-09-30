'use strict';

/* Service keys (AI providers, payments) the owner pastes in the admin instead of the
   hosting settings. Write-only: the admin API can set or clear a key and see whether it is
   set (source + last 4 characters), never read it back. A hosting environment variable
   with the same name wins, so moving a key to Vercel needs no code change.
   Server code calls `await loadSecrets()` (cached for a minute) and then `secret(name)`. */

const { store } = require('./store');

const STORE_KEY = 'secrets:v1';
const CACHE_MS = 60 * 1000;

// Only these names can be stored: a typo or a random name is refused.
const NAMES = Object.freeze([
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'YOOKASSA_SHOP_ID',
  'YOOKASSA_SECRET_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'APPSTORE_ISSUER_ID',
  'APPSTORE_KEY_ID',
  'APPSTORE_PRIVATE_KEY'
]);

let cache = {};
let loadedAt = 0;

async function loadSecrets(force = false){
  if(!force && Date.now() - loadedAt < CACHE_MS) return cache;
  try{
    const raw = await store.get(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === 'object' ? parsed : {};
  }catch(_){
    // Storage hiccup: keep the last known keys rather than dropping every provider.
  }
  loadedAt = Date.now();
  return cache;
}

function secret(name){
  const fromEnv = String(process.env[name] || '').trim();
  if(fromEnv) return fromEnv;
  return String(cache[name] || '').trim();
}

function secretsStatus(){
  const out = {};
  for(const name of NAMES){
    const fromEnv = String(process.env[name] || '').trim();
    const stored = String(cache[name] || '').trim();
    const value = fromEnv || stored;
    out[name] = {
      set: !!value,
      source: fromEnv ? 'env' : stored ? 'admin' : null,
      last4: value.length >= 8 ? value.slice(-4) : ''
    };
  }
  return out;
}

async function setSecret(name, value){
  if(!NAMES.includes(name)) throw Object.assign(new Error('unknown_secret'), {status:400});
  const clean = String(value == null ? '' : value).trim();
  if(clean.length > 20000) throw Object.assign(new Error('secret_too_long'), {status:400});
  const current = await loadSecrets(true);
  const next = {...current};
  if(clean) next[name] = clean;
  else delete next[name];
  await store.set(STORE_KEY, JSON.stringify(next));
  cache = next;
  loadedAt = Date.now();
}

module.exports = { NAMES, loadSecrets, secret, secretsStatus, setSecret };
