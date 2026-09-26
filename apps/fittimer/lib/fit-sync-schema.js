'use strict';

const { createSyncRegistry } = require('../../../packages/core/server/sync-registry');

const ACCOUNT_PROFILE = '__account__';

const cleanAge = v => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 5 && n <= 100 ? n : null;
};
// Старые клиенты могли прислать точную дату. Сервер преобразует её в полные годы
// и сохраняет только возраст, чтобы после первого обмена точная дата исчезла.
const legacyAge = v => {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return null;
  const d = new Date(v), now = new Date();
  if(isNaN(d)) return null;
  let n = now.getUTCFullYear() - d.getUTCFullYear();
  if(now.getUTCMonth() < d.getUTCMonth()
    || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) n--;
  return cleanAge(n);
};
const cleanProfileInt = (value, def, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : def;
};
// FitTimer profile fields on top of the generic profile (id/name/theme/locale).
// Key order matches the historical flat record so stored JSON stays byte-compatible.
const sanitizeProfile = (u, base) => ({
  id: base.id,
  name: base.name,
  gender: (u && (u.gender === 'f' || u.gender === 'm')) ? u.gender : '',
  age: cleanAge(u && u.age) || legacyAge(u && u.birth),
  theme: base.theme,
  locale: base.locale,
  prepSec: cleanProfileInt(u && u.prepSec, 5, 0, 30),
  readySec: cleanProfileInt(u && u.readySec, 5, 0, 30),
  sideSec: cleanProfileInt(u && u.sideSec, 10, 3, 60),
  voiceVol: cleanProfileInt(u && u.voiceVol, 100, 0, 100),
  fxVol: cleanProfileInt(u && u.fxVol, 100, 0, 100)
});


const rules = [
  {scope:'profile', key:'stats'},
  {scope:'profile', key:'index'},
  {scope:'profile', prefix:'program:', allowDeleted:true},
  // Compatibility for clients that still know the old hidden weight-correction doc.
  {scope:'profile', key:'progWeights', legacy:true},
  {scope:'account', key:'trainer'},
  {scope:'account', key:'clients'},
  // Marketing notification opt-out must work even without Premium.
  {scope:'account', key:'notificationPrefs', free:true}
];

module.exports = {
  ACCOUNT_PROFILE,
  sanitizeProfile,
  PROFILE_DOC_KEYS: ['stats'],
  ACCOUNT_DOC_KEYS: ['trainer', 'clients', 'notificationPrefs'],
  registry: createSyncRegistry(rules)
};
