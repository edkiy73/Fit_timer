const fs = require('fs');

const data = fs.readFileSync('src/app/10-data-sync.js','utf8');
const media = fs.readFileSync('src/app/30-progress-media.js','utf8');
const account = fs.readFileSync('src/app/20-account.js','utf8');
const events = fs.readFileSync('src/app/90-events.js','utf8');
const ru = fs.readFileSync('src/i18n/ru.js','utf8');
const en = fs.readFileSync('src/i18n/en.js','utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(data.includes("new Set(['Мой профиль', 'My profile'])"),
  'both legacy default names must be recognized');
need(data.includes("if(isDefaultProfileName(raw)) return t('profile.defaultMine')"),
  'default profile name must be translated at render time');
need(data.includes("row.querySelector('b').textContent = shownName"),
  'profile list must use translated display name');
need(account.includes("profileDisplayName(uDraft)"),
  'profile editor must show translated system name');
need(media.includes("isDefaultProfileName(u && u.name)"),
  'new profile numbering must recognize both localized system names');
need(events.includes("name:t('profile.defaultMine')"),
  'first migrated profile must use the localized system-default name');
need(ru.includes("'profile.defaultMine': \"Мой профиль\""),
  'RU default profile copy missing');
need(en.includes("'profile.defaultMine': \"My profile\""),
  'EN default profile copy missing');

console.log('default profile localization contract: ok');
