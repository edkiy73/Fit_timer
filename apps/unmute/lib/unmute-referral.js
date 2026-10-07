'use strict';

/* «Пригласи друга» (launch plan, decision 17). Every account has a short code. A new account that
   signs in with a friend's code becomes that friend's invitee; when the invitee has passed
   DAYS_TO_REWARD course days, both get UnMute Plus for `bonusDays` (Admin, default 7) — once per
   invitee. The day count comes from the invitee's app, like the rest of the learning progress. */

const crypto = require('crypto');
const { store } = require('../../../packages/core/server/store');
const { send } = require('../../../packages/core/server/util');

const SETTINGS_KEY = 'unmute:referral:settings';
const TOTALS_INVITED = 'unmute:referral:total:invited';
const TOTALS_REWARDED = 'unmute:referral:total:rewarded';
const DEFAULT_BONUS_DAYS = 7;
const DAYS_TO_REWARD = 3;
// Only a fresh account can join by a code: old accounts cannot farm Plus by trading codes.
const NEW_ACCOUNT_DAYS = 14;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const YEARS = 5 * 365 * 24 * 3600;

const codeKey = code => `unmute:referral:code:${code}`;
const ownKey = accountHash => `unmute:referral:own:${accountHash}`;
const byKey = accountHash => `unmute:referral:by:${accountHash}`;
const rewardKey = accountHash => `unmute:referral:rewarded:${accountHash}`;
const statsKey = accountHash => `unmute:referral:stats:${accountHash}`;

function cleanCode(value){
  const code = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === CODE_LENGTH && [...code].every(ch => CODE_ALPHABET.includes(ch)) ? code : '';
}

function clampDays(value){
  const days = Math.round(Number(value));
  return Number.isFinite(days) ? Math.max(1, Math.min(90, days)) : DEFAULT_BONUS_DAYS;
}

function json(raw, fallback){
  try{ const value = JSON.parse(raw); return value && typeof value === 'object' ? value : fallback; }catch(_){ return fallback; }
}

async function getReferralSettings(){
  const saved = json(await store.get(SETTINGS_KEY), {});
  return {bonusDays: saved.bonusDays === undefined ? DEFAULT_BONUS_DAYS : clampDays(saved.bonusDays)};
}

async function saveReferralSettings(input){
  const settings = {bonusDays: clampDays(input && input.bonusDays)};
  await store.set(SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

async function referralTotals(){
  const [invited, rewarded] = await store.many([TOTALS_INVITED, TOTALS_REWARDED]);
  return {invited: +invited || 0, rewarded: +rewarded || 0};
}

function randomCode(){
  const bytes = crypto.randomBytes(CODE_LENGTH);
  return [...bytes].map(byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

/** The account's own code, created on first use. */
async function ensureCode(accountHash){
  const existing = cleanCode(await store.get(ownKey(accountHash)));
  if(existing) return existing;
  for(let attempt = 0; attempt < 8; attempt++){
    const code = randomCode();
    const [created] = await store.pipe([['SET', codeKey(code), accountHash, 'NX', 'EX', String(YEARS)]]);
    if(created !== 'OK') continue;
    await store.set(ownKey(accountHash), code, YEARS);
    return code;
  }
  throw Object.assign(new Error('code_unavailable'), {status: 503});
}

async function readAccount(accountHash){
  return json(await store.get(`a:${accountHash}`), null);
}

/** Plus for `days` more: an active Plus is extended (its renewal stays as it is), otherwise a new one. */
async function grantPlusDays(accountHash, days, now = new Date()){
  const acc = await readAccount(accountHash);
  if(!acc) return false;
  const activeUntil = acc.sub ? (Date.parse(acc.sub.until) || 0) : 0;
  const start = Math.max(now.getTime(), activeUntil);
  const until = new Date(start + days * 86400000).toISOString().slice(0, 10);
  acc.sub = activeUntil > now.getTime()
    ? {...acc.sub, until}
    : {plan: 'referral', since: now.toISOString().slice(0, 10), until, currency: 'REFERRAL', price: 0, autoRenew: false, provider: 'referral', source: 'referral', grantedAt: now.toISOString()};
  await store.set(`a:${accountHash}`, JSON.stringify(acc));
  return true;
}

async function referralInfo(accountHash, acc){
  const [code, settings] = await Promise.all([ensureCode(accountHash), getReferralSettings()]);
  const stats = json(await store.get(statsKey(accountHash)), {});
  const by = json(await store.get(byKey(accountHash)), null);
  const since = Date.parse(acc && acc.since || '') || 0;
  return {
    code,
    bonusDays: settings.bonusDays,
    daysNeeded: DAYS_TO_REWARD,
    invited: +stats.invited || 0,
    rewarded: +stats.rewarded || 0,
    referred: by ? {rewarded: !!(await store.get(rewardKey(accountHash)))} : null,
    canJoin: !by && Date.now() - since <= NEW_ACCOUNT_DAYS * 86400000
  };
}

async function claimReferral(accountHash, acc, rawCode){
  const code = cleanCode(rawCode);
  if(!code) throw Object.assign(new Error('bad_code'), {status: 400});
  const inviter = String(await store.get(codeKey(code)) || '');
  if(!inviter) throw Object.assign(new Error('code_not_found'), {status: 404});
  if(inviter === accountHash) throw Object.assign(new Error('own_code'), {status: 409});
  const since = Date.parse(acc && acc.since || '') || 0;
  if(Date.now() - since > NEW_ACCOUNT_DAYS * 86400000) throw Object.assign(new Error('account_not_new'), {status: 409});
  // Two people cannot invite each other.
  const inviterBy = json(await store.get(byKey(inviter)), null);
  if(inviterBy && inviterBy.inviter === accountHash) throw Object.assign(new Error('mutual_invite'), {status: 409});
  const [created] = await store.pipe([['SET', byKey(accountHash), JSON.stringify({inviter, code, at: new Date().toISOString()}), 'NX', 'EX', String(YEARS)]]);
  if(created !== 'OK') throw Object.assign(new Error('already_invited'), {status: 409});
  const stats = json(await store.get(statsKey(inviter)), {});
  stats.invited = (+stats.invited || 0) + 1;
  await store.set(statsKey(inviter), JSON.stringify(stats), YEARS);
  await store.incr(TOTALS_INVITED);
  return {ok: true};
}

/** The invitee reports passed course days; at DAYS_TO_REWARD both get Plus, once. */
async function referralProgress(accountHash, completedDays){
  if(!(Math.round(Number(completedDays)) >= DAYS_TO_REWARD)) return {rewarded: false};
  const by = json(await store.get(byKey(accountHash)), null);
  if(!by || !by.inviter) return {rewarded: false};
  const [created] = await store.pipe([['SET', rewardKey(accountHash), new Date().toISOString(), 'NX', 'EX', String(YEARS)]]);
  if(created !== 'OK') return {rewarded: false, already: true};
  const {bonusDays} = await getReferralSettings();
  await grantPlusDays(accountHash, bonusDays);
  await grantPlusDays(by.inviter, bonusDays);
  const stats = json(await store.get(statsKey(by.inviter)), {});
  stats.rewarded = (+stats.rewarded || 0) + 1;
  await store.set(statsKey(by.inviter), JSON.stringify(stats), YEARS);
  await store.incr(TOTALS_REWARDED);
  return {rewarded: true, bonusDays};
}

/** Account deletion: the code, the invite link and the counters go with the account. */
async function purgeReferral(accountHash){
  const code = cleanCode(await store.get(ownKey(accountHash)));
  if(code) await store.del(codeKey(code));
  for(const key of [ownKey(accountHash), byKey(accountHash), rewardKey(accountHash), statsKey(accountHash)]) await store.del(key);
}

/** Admin → «Приглашения»: the bonus length and the totals. */
async function handleReferralAdmin(action, body, res){
  if(action === 'referral_settings'){
    send(res, 200, {ok: true, settings: await getReferralSettings(), totals: await referralTotals(), daysNeeded: DAYS_TO_REWARD});
    return true;
  }
  if(action === 'referral_settings_save'){
    send(res, 200, {ok: true, settings: await saveReferralSettings(body), totals: await referralTotals(), daysNeeded: DAYS_TO_REWARD});
    return true;
  }
  return false;
}

module.exports = {
  handleReferralAdmin,
  DAYS_TO_REWARD,
  DEFAULT_BONUS_DAYS,
  cleanCode,
  getReferralSettings,
  saveReferralSettings,
  referralTotals,
  referralInfo,
  claimReferral,
  referralProgress,
  purgeReferral,
  grantPlusDays
};
