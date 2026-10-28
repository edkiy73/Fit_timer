// FetUre «test world» (owner, 28.10.2026): production filled with ~28 people, couples, communities, events, posts,
// chats and requests in many different states, so the app can be looked at as if many people used it.
//   FE_ADMIN_KEY=… node e2e/seed-world.mjs [phase…]      phases: accounts photos profile social couples communities
//                                                        events events-more posts variety following video access moderation verify
//                                                        (default: all, in order); verify-following reads back «Подписки»
//                                                        only, verify-video the clip and photo + clip posts of the viewers
// Rules (apps/feture/AGENTS.md §4, §6, e2e/README.md):
// - every state is built only through app commands (/api/fe) exactly as a person would; staff steps (photo review,
//   age checks, community/event review) go through qa-staff@feture.test; nothing is written to the database directly;
// - accounts live in their own namespace world-<key>@feture.test (the list is docs/test-world.md) — there is no seed
//   marker in the schema, so that list is how they are found and removed later; the UI shows no «demo/test» badge;
// - profile photos are the fictional people of the V21 prototype (public/prototype-v21.html FT_IMG, one face per
//   account); every other photo is a people-free CC0 / public-domain picture from Wikimedia Commons
//   (e2e/world-media.json: source page + license), downloaded once into e2e/.world-cache and uploaded like the app does;
// - idempotent: each step reads the current state first and only adds what is missing, so a rerun after a failure
//   (or a 429) continues where it stopped. Some states are time-bound (a pending request, a «past» event); a rerun
//   tops them up where the app allows.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { PROD, api, boot, session, uuid7, sleep } from './lib.mjs';
import { STAFF, staff } from './personas.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const CACHE = DIR + '.world-cache/';
const mail = key => `world-${key}@feture.test`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const problems = [];
const must = (r, what) => { if (r.status && r.status >= 400) throw new Error(`${what}: ${r.status} ${JSON.stringify(r).slice(0, 300)}`); return r; };
/** A step that may fail without stopping the rest (its error is listed at the end). */
async function step(what, fn) {
  try { return await fn(); } catch (e) { problems.push(`${what}: ${e.message}`); log('  ✗', what, '—', e.message.slice(0, 200)); return null; }
}
const days = n => new Date(Date.now() + n * 864e5);

// ---------------------------------------------------------------- the cast
// face: FT_IMG key of the prototype (1,3,5,7,9 women; 2,4,6,8 men; p1, p2 two people) — given to one account each.
// tier: full = photo approved + age verified (selfie) + interests + private part; doc = age verified by a document,
// no photo; half = some fields; min = onboarding only; fresh = registered, onboarding not finished.
export const CAST = [
  { key: 'mira', handle: 'mira.vey', name: 'Мира', born: '1994-03-11', city: 'Берлин', face: '1', tier: 'full', genders: ['woman'], orients: ['bi'], roles: ['switch'], formats: ['open'], seeks: ['friends', 'events', 'dates'], status: 'single',
    bio: 'Живу в Берлине третий год. Люблю долгие разговоры, верёвку, винтажные платья и утренний кофе на балконе. Ценю честность и ясные договорённости.' },
  { key: 'lev', handle: 'lev_orlov', name: 'Лев', born: '1988-07-02', city: 'Москва', face: '2', tier: 'full', genders: ['man'], orients: ['hetero'], roles: ['rigger', 'dom'], formats: ['poly'], seeks: ['events', 'learn', 'friends'], status: 'partnered',
    bio: 'Связываю восьмой год, веду небольшое сообщество и вечера для начинающих. Безопасность и разговор до — обязательны.' },
  { key: 'kira', handle: 'kira.night', name: 'Кира', born: '1997-12-20', city: 'Санкт-Петербург', face: '3', tier: 'full', genders: ['woman'], orients: ['pan'], roles: ['sub', 'brat'], formats: ['exploring'], seeks: ['chat', 'learn'], status: 'single',
    bio: 'Пишу длинные тексты о близости и границах. Интроверт, кошатница, люблю белые ночи и тихие бары.' },
  { key: 'timur', handle: 'tim.sol', name: 'Тимур', born: '1991-05-30', city: 'Казань', face: '4', tier: 'full', genders: ['man'], orients: ['bi'], roles: ['top', 'service'], formats: ['enm'], seeks: ['events', 'friends'], status: 'dating',
    bio: 'Организую закрытый клуб в Казани. Днём — архитектор, вечером — ведущий практик. Отвечаю не сразу, но отвечаю.' },
  { key: 'vesta', handle: 'vesta.art', name: 'Веста', born: '1990-09-14', city: 'Тбилиси', face: '5', tier: 'full', genders: ['woman'], orients: ['queer'], roles: ['sensual'], formats: ['ra'], seeks: ['friends', 'exp'], status: 'complicated',
    bio: 'Фотографирую город, свет и фактуры. Татуировки рассказывают остальное. Открыта к коллаборациям.' },
  { key: 'daniel', handle: 'dan.kovach', name: 'Даниил', born: '1986-01-25', city: 'Белград', face: '6', tier: 'full', genders: ['man'], orients: ['hetero'], roles: ['dom'], formats: ['casual', 'play'], seeks: ['dates', 'play'], status: 'single',
    bio: 'Кожевник, делаю ремни и манжеты вручную. Переехал в Белград, ищу компанию на выставки и вечеринки.' },
  { key: 'yana', handle: 'yana.flow', name: 'Яна', born: '1999-04-08', city: 'Екатеринбург', face: '7', tier: 'photo', genders: ['woman'], orients: ['bi'], roles: ['exploring'], formats: [], seeks: ['chat'], status: null,
    bio: 'Только начинаю разбираться в себе. Танцы, йога и много вопросов.' },
  { key: 'artem', handle: 'artem_v', name: 'Артём', born: '1983-10-17', city: 'Новосибирск', face: '8', tier: 'pending', genders: ['man'], orients: ['hetero'], roles: [], formats: ['mono'], seeks: ['rel'], status: 'single',
    bio: 'Инженер, бегаю марафоны, ищу человека для серьёзных отношений.' },
  { key: 'alisa', handle: 'alisa.moon', name: 'Алиса', born: '1993-06-03', city: 'Амстердам', face: '9', tier: 'full', discover: 'off', genders: ['woman'], orients: ['lesbian'], roles: ['lead'], formats: ['poly'], seeks: ['events', 'friends'], status: 'partnered',
    bio: 'Собираю маленький закрытый круг в Амстердаме. В знакомствах не участвую — здесь ради сообщества.' },
  // couples: the partners keep their own profiles without a face; the couple profile has the two-person photo
  { key: 'sasha', handle: 'sasha.nord', name: 'Саша', born: '1989-02-19', city: 'Гамбург', tier: 'doc', genders: ['nb'], orients: ['queer'], roles: ['switch'], formats: ['open'], seeks: ['events'], status: 'couple',
    bio: 'Половина пары @nika.nord. Гамбург, велосипеды, электронная музыка.' },
  { key: 'nika', handle: 'nika.nord', name: 'Ника', born: '1992-11-05', city: 'Гамбург', tier: 'doc', genders: ['woman'], orients: ['bi'], roles: ['sub'], formats: ['open'], seeks: ['events', 'friends'], status: 'couple',
    bio: 'Вместе с Сашей шесть лет. Люблю вечеринки с дресс-кодом и долгие завтраки.' },
  { key: 'gleb', handle: 'gleb.tea', name: 'Глеб', born: '1985-08-12', city: 'Минск', tier: 'doc', genders: ['man'], orients: ['hetero'], roles: ['top'], formats: ['swing'], seeks: ['exp'], status: 'married',
    bio: 'Женат на @olya.tea. Чай, настолки и путешествия.' },
  { key: 'olya', handle: 'olya.tea', name: 'Оля', born: '1987-03-27', city: 'Минск', tier: 'doc', genders: ['woman'], orients: ['bi'], roles: ['bottom'], formats: ['swing'], seeks: ['exp', 'friends'], status: 'married',
    bio: 'Прежде чем что-то публиковать от пары, мы договариваемся вдвоём.' },
  { key: 'roman', handle: 'roman.p', name: 'Роман', born: '1980-12-01', city: 'Алматы', tier: 'half', genders: ['man'], orients: ['hetero'], roles: [], formats: [], seeks: [], status: 'partnered',
    bio: 'Алматы, горы, джаз.' },
  { key: 'eva', handle: 'eva.p', name: 'Ева', born: '1984-07-22', city: 'Алматы', tier: 'half', genders: ['woman'], orients: ['hetero'], roles: [], formats: [], seeks: [], status: 'partnered',
    bio: 'Пока на паузе.' },
  { key: 'ilya', handle: 'ilya_sh', name: 'Илья', born: '1995-01-14', city: 'Москва', tier: 'half', genders: ['man'], orients: ['hetero'], roles: ['switch'], formats: ['mono'], seeks: ['chat'], status: 'dating',
    bio: 'Позвал Марту в пару, жду ответа :)' },
  { key: 'marta', handle: 'marta.sh', name: 'Марта', born: '1996-10-30', city: 'Москва', tier: 'half', genders: ['woman'], orients: ['hetero'], roles: [], formats: ['mono'], seeks: ['chat'], status: 'dating',
    bio: 'Москва, книги, кино по средам.' },
  { key: 'den', handle: 'den.wolf', name: 'Денис', born: '1990-04-04', city: 'Краков', tier: 'half', genders: ['man'], orients: ['bi'], roles: ['dom'], formats: ['open'], seeks: ['events'], status: 'partnered',
    bio: 'Создал ссылку-приглашение для партнёра, который ещё не зарегистрирован.' },
  // solo states without a photo
  { key: 'sonya', handle: 'sonya_m', name: null, born: '2001-06-16', tier: 'fresh' },
  { key: 'max', handle: 'max.grey', name: null, born: '1979-09-09', tier: 'min', discover: 'off' },
  { key: 'zhenya', handle: 'zhenya.l', name: 'Женя', born: '1998-02-02', city: 'Нижний Новгород', tier: 'half', genders: ['nb'], orients: ['ace'], roles: [], formats: ['talk'], seeks: ['chat', 'friends'], status: null,
    bio: 'Здесь, чтобы читать и иногда писать.' },
  { key: 'vlad', handle: 'vlad_promo', name: 'Влад', born: '1992-05-05', city: 'Москва', tier: 'half', genders: ['man'], orients: [], roles: [], formats: [], seeks: [], status: null,
    bio: 'Лучшие предложения недели — пиши в личку!' },
  { key: 'nastya', handle: 'nastya.b', name: 'Настя', born: '1996-08-21', city: 'Санкт-Петербург', tier: 'doc', genders: ['woman'], orients: ['bi'], roles: ['sub'], formats: ['exploring'], seeks: ['chat', 'learn'], status: 'single',
    bio: 'Учусь на психолога, интересуюсь темой согласия.' },
  { key: 'egor', handle: 'egor.fox', name: 'Егор', born: '1989-12-12', city: 'Ереван', tier: 'doc', genders: ['man'], orients: ['bi'], roles: ['switch'], formats: ['poly'], seeks: ['friends', 'events'], status: 'partnered',
    bio: 'Ереван, вино, походы. Полиамор, есть партнёрка.' },
  { key: 'liza', handle: 'liza.k', name: 'Лиза', born: '2000-03-03', city: 'Москва', tier: 'doc', genders: ['woman'], orients: ['pan'], roles: ['brat'], formats: [], seeks: ['events', 'friends'], status: 'single',
    bio: 'Хожу на все вечера, где есть чай и верёвка.' },
  { key: 'oleg', handle: 'oleg.m', name: 'Олег', born: '1977-11-11', city: 'Амстердам', tier: 'doc', genders: ['man'], orients: ['hetero'], roles: ['service'], formats: ['casual'], seeks: ['events'], status: 'single',
    bio: 'Работаю в IT, по выходным езжу по Европе на тематические вечеринки.' },
  { key: 'katya', handle: 'katya.r', name: 'Катя', born: '1994-01-29', city: 'Берлин', tier: 'doc', genders: ['woman'], orients: ['bi'], roles: ['switch'], formats: ['open'], seeks: ['friends', 'chat'], status: 'single',
    bio: 'Берлин, техно, кошки. Подписываюсь на всех, кто пишет интересно.' },
  { key: 'stas', handle: 'stas.d', name: 'Стас', born: '1987-06-18', city: 'Казань', tier: 'half', genders: ['man'], orients: ['hetero'], roles: ['bottom'], formats: [], seeks: ['learn'], status: null,
    bio: 'Хочу научиться безопасным практикам.' },
];
const P = Object.fromEntries(CAST.map(c => [c.key, c]));
const email = key => mail(key);
const pid = async key => (await session(email(key))).personId;

// ---------------------------------------------------------------- media
let FACES;
function faces() {
  if (FACES) return FACES;
  const html = fs.readFileSync(DIR + '../public/prototype-v21.html', 'utf8');
  const start = html.indexOf('{', html.indexOf('FT_IMG='));
  let depth = 0, j = start;
  for (; j < html.length; j++) { if (html[j] === '{') depth++; else if (html[j] === '}' && --depth === 0) break; }
  FACES = Object.fromEntries(Object.entries(JSON.parse(html.slice(start, j + 1))).map(([k, v]) => {
    const m = /^data:(image\/\w+);base64,(.*)$/.exec(String(v));
    return [k, { mime: m[1], bytes: Buffer.from(m[2], 'base64') }];
  }));
  return FACES;
}
const STOCK = JSON.parse(fs.readFileSync(DIR + 'world-media.json', 'utf8'));
/** A plain light card (PNG) for the document age check — it is only seen by staff, never shown in the app. */
function paperPng(w = 640, h = 400) {
  const crc = buf => { let c, crcv = ~0; for (const b of buf) { c = (crcv ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcv = (crcv >>> 8) ^ c; } return ~crcv >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const line = y > 60 && y % 40 < 3 && x > 40 && x < w - 40; raw[o] = raw[o + 1] = line ? 190 : 238; raw[o + 2] = line ? 200 : 232; }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function stock(key) {
  if (key === 'paper') return { mime: 'image/png', bytes: paperPng() };
  const s = STOCK[key]; if (!s) throw new Error('no stock picture ' + key);
  const file = CACHE + key + '.jpg';
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true });
    for (let i = 0; i < 6; i++) {
      const r = await fetch(s.file, { headers: { 'user-agent': 'FetUre test world seeding (credits in docs/test-world.md)' } });
      if (r.ok && /image\//.test(r.headers.get('content-type') ?? '')) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); break; }
      await sleep(10000 * (i + 1));
    }
    if (!fs.existsSync(file)) throw new Error('download failed: ' + s.file);
  }
  return { mime: 'image/jpeg', bytes: fs.readFileSync(file) };
}

/** Upload as the app does (intent → PUT → commit) and have staff approve it (nothing is auto-approved yet). */
async function upload(key, purpose, pic, { profile, approve = true, viewRule, viewSeconds } = {}) {
  const i = await api(email(key), 'media.uploadIntent', { opId: uuid7(), purpose, kind: 'image', mime: pic.mime, bytes: pic.bytes.length, ...(viewRule ? { viewRule } : {}), ...(viewSeconds ? { viewSeconds } : {}) }, profile);
  if (!i.assetId) throw new Error('uploadIntent ' + JSON.stringify(i).slice(0, 200));
  const put = await fetch(i.upload.url, { method: i.upload.method, headers: i.upload.headers, body: pic.bytes });
  if (!put.ok) throw new Error('upload PUT ' + put.status);
  must(await api(email(key), 'media.commit', { assetId: i.assetId }, profile), 'commit');
  if (approve && purpose !== 'verification') await approveAsset(i.assetId);
  return i.assetId;
}
async function approveAsset(assetId) {
  for (let i = 0; i < 30; i++) { // the scan job runs first; then the asset waits in the staff queue
    const r = await api(STAFF, 'staff.mediaDecide', { opId: uuid7(), assetId, decision: 'approve', explicit: false });
    if (r.status === 200) return;
    if (r.status === 409 && /approved/.test(JSON.stringify(r))) return;
    await sleep(3000);
  }
  throw new Error('asset ' + assetId + ' not approved');
}

// ---------------------------------------------------------------- phase: accounts
let docs, places;
async function documents() {
  return docs ??= (await fetch(`${PROD}/api/catalog?resource=documents&locale=ru`).then(x => x.json())).documents
    .filter(d => d.requiresAccept).map(d => ({ id: d.id, contentHash: d.hash }));
}
async function cityId(name) {
  places ??= (await api(STAFF, 'catalog.get', {})).places ?? [];
  return places.find(p => p.ru === name)?.id ?? null;
}

async function account(c) {
  const e = email(c.key);
  let b = await boot(e);
  if (!b.profiles?.some(p => p.kind === 'person')) {
    must(await api(e, 'account.create', { opId: uuid7(), handle: c.handle, birthDate: c.born, locale: 'ru', documents: await documents(), newsOptIn: false }), 'account.create ' + c.key);
    b = await boot(e);
  }
  if (c.tier === 'fresh') return;
  if (!b.account?.onboarded) {
    must(await api(e, 'onboarding.complete', { opId: uuid7(), detailsVis: c.tier === 'min' ? 'only' : 'all',
      genders: c.genders ?? [], orients: c.orients ?? [], roles: c.roles ?? [], formats: c.formats ?? [], seeks: c.seeks ?? [], status: c.status ?? null,
      discover: c.discover === 'off' || c.tier === 'min' ? 'off' : 'visible' }), 'onboarding ' + c.key);
  }
  if (c.tier === 'min') return;
  const me = await pid(c.key);
  const prof = must(await api(e, 'profile.get', { profileId: me }), 'profile.get').profile;
  if (!prof.bio && c.bio) {
    must(await api(e, 'profile.update', { opId: uuid7(), rev: prof.rev, name: c.name, bio: c.bio, cityId: c.city ? await cityId(c.city) : null, showAge: c.key !== 'kira' }), 'profile.update ' + c.key);
  }
}

// ---------------------------------------------------------------- phase: photos and age
async function photo(c) {
  const e = email(c.key), me = await pid(c.key);
  if (c.face) {
    const prof = (await api(e, 'profile.get', { profileId: me })).profile;
    if (!prof?.photos?.length) {
      const asset = await upload(c.key, 'avatar', faces()[c.face], { approve: c.tier !== 'pending' });
      must(await api(e, 'profile.photosSet', { opId: uuid7(), assetIds: [asset] }), 'photosSet ' + c.key);
    }
  }
  if (c.tier === 'full' || c.tier === 'doc') await verifyAge(c);
}
async function verifyAge(c) {
  const e = email(c.key);
  const st = await api(e, 'verification.ageStatus');
  if (st.verified || st.state === 'approved' || st.ageVerified) return;
  const decide = async checkId => {
    let d;
    for (let i = 0; i < 20; i++) { d = await api(STAFF, 'staff.ageCheckDecide', { opId: uuid7(), checkId, approve: true }); if (!/_missing/.test(d.rule ?? '')) break; await sleep(6000); }
    must(d, 'ageCheckDecide ' + c.key);
  };
  if (st.check?.state === 'submitted') return decide(st.check.id);
  const method = c.face ? 'selfie' : 'document';
  if (method === 'selfie') { // the approved photo becomes the avatar through a background job (about a minute)
    const me = await pid(c.key);
    for (let i = 0; i < 18; i++) { const pr = (await api(e, 'profile.get', { profileId: me })).profile; if (pr?.avatar) break; await sleep(10000); }
  }
  const start = must(await api(e, 'verification.ageStart', { opId: uuid7(), method }), 'ageStart ' + c.key);
  const asset = await upload(c.key, 'verification', c.face ? faces()[c.face] : await stock('paper'));
  must(await api(e, 'verification.ageSubmit', { opId: uuid7(), checkId: start.id, assetId: asset }), 'ageSubmit ' + c.key);
  await decide(start.id);
}

// ---------------------------------------------------------------- phase: profile (interests, private part, settings)
const INTERESTS = {
  mira: [['shibari', 9, 'public'], ['aftercare', 10, 'public'], ['roleplay', 7, 'public'], ['latex', 6, 'granted'], ['exhibition', 4, 'granted'], ['ds', 8, 'public'], ['voyeur', 5, 'only'], ['filming', 'hard', 'public'], ['substances', 'hard', 'public'], ['petplay', 'discuss', 'public']],
  lev: [['shibari', 10, 'public'], ['suspension', 9, 'public'], ['bondage', 9, 'public'], ['safeword', 10, 'public'], ['checkins', 9, 'public'], ['protocol', 6, 'granted'], ['strongpain', 'hard', 'public']],
  kira: [['intimacy', 9, 'public'], ['talk', 10, 'public'], ['praise', 8, 'public'], ['brat', 7, 'granted'], ['sensory', 7, 'public'], ['degradation', 'hard', 'public'], ['publicplace', 'hard', 'granted'], ['tantra', 'discuss', 'public']],
  timur: [['protocol', 9, 'public'], ['service', 8, 'public'], ['rituals', 8, 'public'], ['control', 7, 'granted'], ['impact', 6, 'public'], ['overnight', 'hard', 'public']],
  vesta: [['exhibition', 8, 'public'], ['sensory', 7, 'public'], ['wax', 6, 'public'], ['marks', 5, 'granted'], ['filming', 'discuss', 'public'], ['permanent', 'hard', 'public']],
  daniel: [['leather', 10, 'public'], ['restraint', 8, 'public'], ['collars', 8, 'public'], ['impact', 7, 'granted'], ['ds', 8, 'public'], ['substances', 'hard', 'public']],
  alisa: [['rituals', 7, 'public'], ['caregiver', 8, 'public'], ['tpe', 'discuss', 'public'], ['thirdparty', 'hard', 'public']],
  yana: [['sensory', 5, 'public'], ['massage', 6, 'public']],
  zhenya: [['talk', 8, 'public'], ['intimacy', 3, 'only']],
  nastya: [['talk', 9, 'public'], ['safeword', 8, 'public'], ['aftercare', 9, 'public']],
  egor: [['bondage', 6, 'public'], ['group', 5, 'granted']],
  katya: [['latex', 7, 'public'], ['primal', 6, 'public']],
  liza: [['shibari', 7, 'public'], ['brat', 8, 'public']],
};
const PRIVATE = {
  mira: { text: 'Для тех, кому открыла доступ: мои договорённости и что для меня важно на первой встрече.\n\n- сначала кофе и разговор, потом всё остальное;\n- стоп-слово «красный», пауза — «жёлтый»;\n- после сессии мне нужен час тишины и плед.', pics: ['candles', 'wine', 'leather'] },
  kira: { text: 'Здесь чуть больше обо мне: о том, как я узнаю, что мне комфортно, и о моих стоп-словах.', pics: ['rain'] },
  timur: { text: 'Правила клуба для тех, кого я знаю лично, и контакты для связи перед встречей.', pics: [] },
  vesta: { text: 'Плёночные кадры, которые не выкладываю в общий доступ.', pics: ['flowers', 'loft'] },
  daniel: { text: 'Каталог моих работ из кожи и цены для своих.', pics: ['leather2'] },
};
async function profileExtras(c) {
  const e = email(c.key), me = await pid(c.key);
  const list = INTERESTS[c.key];
  if (list) {
    const have = (await api(e, 'interests.list', { profileId: me })).items ?? [];
    for (const [topicId, v, vis] of list) {
      if (have.some(i => i.topicId === topicId)) continue;
      const body = typeof v === 'number' ? { value: v, dir: ['give', 'get', 'watch'].slice(0, 1 + (v % 3)) } : { mark: v };
      await step(`interest ${c.key} ${topicId}`, async () => must(await api(e, 'interests.set', { opId: uuid7(), topicId, vis, ...body }), 'interests.set'));
    }
  }
  const pv = PRIVATE[c.key];
  if (pv) {
    const cur = await api(e, 'private.get', { profileId: me });
    if (!cur.text) must(await api(e, 'private.setText', { opId: uuid7(), text: pv.text }), 'private.setText ' + c.key);
    if (pv.pics.length && !(cur.media?.length || cur.photos?.length)) {
      const ids = [];
      for (const k of pv.pics) ids.push(await upload(c.key, 'private', await stock(k)));
      must(await api(e, 'private.setMedia', { opId: uuid7(), assetIds: ids }), 'private.setMedia ' + c.key);
    }
    const st = (await api(e, 'profile.settings', {})).settings ?? {};
    if (st.privateOn === false) must(await api(e, 'private.setOn', { opId: uuid7(), on: true }), 'private.setOn ' + c.key);
    if (st.requestsFrom !== 'all') await api(e, 'profile.setVisibility', { opId: uuid7(), setting: 'requestsFrom', value: 'all' });
  }
  // Visibility variants: Kira is «незаметно» (hidden) in Discover; Vlad does not take profile likes; Katya hides her likes.
  const settings = { kira: [['discoverMode', 'hidden'], ['mentionsFrom', 'follow']], vlad: [['acceptProfileLikes', false]], katya: [['showLikes', false], ['activityVis', 'followers']], alisa: [['linksFrom', 'follow']] }[c.key] ?? [];
  if (settings.length) {
    const st = (await api(e, 'profile.settings', {})).settings ?? {};
    for (const [setting, value] of settings) if (st[setting] !== value) must(await api(e, 'profile.setVisibility', { opId: uuid7(), setting, value }), `setVisibility ${c.key} ${setting}`);
  }
}

// ---------------------------------------------------------------- phase: social graph
const FOLLOWS = {
  mira: ['lev', 'kira', 'vesta', 'daniel', 'katya'], lev: ['mira', 'timur', 'kira'], kira: ['mira', 'vesta', 'alisa'], timur: ['lev', 'mira'],
  vesta: ['mira', 'kira', 'daniel'], daniel: ['mira', 'vesta', 'lev'], yana: ['mira', 'lev', 'kira'], artem: ['mira'], alisa: ['kira'],
  zhenya: ['kira', 'mira', 'lev', 'vesta'], nastya: ['mira', 'kira', 'lev'], egor: ['mira', 'timur'], liza: ['lev', 'mira', 'kira', 'timur', 'vesta'],
  oleg: ['alisa', 'mira'], katya: ['mira', 'lev', 'kira', 'timur', 'vesta', 'daniel', 'alisa', 'yana'], stas: ['timur', 'lev'], ilya: ['marta'], marta: ['ilya', 'kira'],
  sasha: ['mira'], nika: ['mira', 'katya'], den: ['lev'],
};
async function social() {
  for (const [a, list] of Object.entries(FOLLOWS)) for (const b of list) {
    await step(`follow ${a}→${b}`, async () => must(await api(email(a), 'follow.set', { opId: uuid7(), profileId: await pid(b), on: true }), 'follow'));
  }
  // Matches (mutual likes open a chat) and likes left unanswered.
  for (const [a, b] of [['mira', 'daniel'], ['mira', 'katya'], ['lev', 'vesta'], ['timur', 'alisa'], ['kira', 'daniel'], ['vesta', 'egor']]) await step(`match ${a}↔${b}`, () => match(a, b));
  for (const [a, b] of [['artem', 'mira'], ['yana', 'lev'], ['zhenya', 'kira'], ['liza', 'daniel'], ['oleg', 'mira'], ['nastya', 'timur']]) {
    await step(`like ${a}→${b}`, async () => { const r = await api(email(a), 'like.send', { opId: uuid7(), profileId: await pid(b), source: 'profile' }); if (r.status >= 400 && r.status !== 409) must(r, 'like'); });
  }
  // Chats with history; Timur ↔ Alisa stays an empty new match; Daniel sends Mira a photo that disappears (15 s).
  await step('chat mira↔daniel', () => talk('mira', 'daniel', [
    ['daniel', 'Привет! Увидел, что ты тоже любишь винтаж. Была на блошином рынке на Мауэрпарке?'],
    ['mira', 'Привет) Каждое воскресенье, если нет дождя. А ты в Белграде что нашёл интересного?'],
    ['daniel', 'Тут отличный рынок на Калемегдане, кожа дешевле, чем в Берлине. Сделал на днях новые манжеты.'],
    ['mira', 'Покажешь? Только без лиц, ладно)'],
    ['daniel', 'Конечно. Скину фото, оно исчезнет через 15 секунд.'],
  ], { photo: ['daniel', 'leather2', 't15'] }));
  await step('chat mira↔katya', () => talk('mira', 'katya', [
    ['katya', 'Мира, привет! Идёшь в субботу на вечер в Кройцберге?'],
    ['mira', 'Думаю да. Ты была там раньше?'],
    ['katya', 'Один раз, очень уютно. Встретимся у входа в 21?'],
    ['mira', 'Договорились 🙂'],
  ]));
  await step('chat lev↔vesta', () => talk('lev', 'vesta', [
    ['vesta', 'Лев, можно я сниму ваш вечер для отчёта? Только руки и верёвку, без лиц.'],
    ['lev', 'Да, если все участники согласятся заранее. Напишу в анонсе.'],
    ['vesta', 'Спасибо! Тогда принесу плёнку и вспышку.'],
  ]));
  await step('chat kira↔daniel', () => talk('kira', 'daniel', [['daniel', 'Привет, прочитал твою статью про согласие — очень точно.'], ['kira', 'Спасибо! Рада, что откликнулось.']]));
  await step('chat vesta↔egor', () => talk('vesta', 'egor', [['egor', 'Привет из Еревана! Когда в Тбилиси выставка?'], ['vesta', 'В конце ноября, пришлю приглашение.']]));
  // Blocks.
  for (const [a, b] of [['mira', 'vlad'], ['timur', 'vlad']]) await step(`block ${a}→${b}`, async () => must(await api(email(a), 'block.set', { opId: uuid7(), profileId: await pid(b), on: true }), 'block'));
  // «Связи»: confirmed, incoming (pending for Mira), sent (Daniel → Kira, waiting).
  await step('link mira↔vesta', () => link('mira', 'vesta', 'friend', undefined, true));
  await step('link lev↔timur', () => link('lev', 'timur', 'mentor', 'mentor', true));
  // (partners of one couple cannot propose a link to each other: rule own_partner)
  await step('link egor↔vesta', () => link('egor', 'vesta', 'friend', undefined, true));
  await step('link liza↔lev', () => link('liza', 'lev', 'mentor', 'mentee', true));
  await step('link kira→mira', () => link('kira', 'mira', 'play', undefined, false));
  await step('link daniel→kira', () => link('daniel', 'kira', 'friend', undefined, false));
  // Saved posts and events come in the posts / events phases.
}
async function match(a, b) {
  const pa = await pid(a), pb = await pid(b);
  const m = (await api(email(a), 'matches.list', {})).items ?? [];
  if (m.some(x => (x.profile?.id ?? x.profileId ?? x.id) === pb)) return;
  await api(email(a), 'like.send', { opId: uuid7(), profileId: pb, source: 'profile' });
  const r = await api(email(b), 'like.send', { opId: uuid7(), profileId: pa, source: 'profile' });
  if (r.status >= 400 && r.status !== 409) must(r, 'like back');
}
async function conversationOf(a, b) {
  const pb = await pid(b);
  for (const archived of [false, true]) {
    const c = (await api(email(a), 'chats.list', { filter: 'all', archived })).items?.find(x => x.other?.id === pb && x.state !== 'ended');
    if (c) return c.id;
  }
  return null;
}
async function talk(a, b, lines, { photo } = {}) {
  const conv = await conversationOf(a, b);
  if (!conv) throw new Error('no conversation');
  const have = (await api(email(a), 'chat.messages', { conversationId: conv, limit: 100 })).items ?? [];
  if (have.filter(m => m.body && !m.system).length < lines.length)
    for (const [who, body] of lines) { must(await api(email(who), 'chat.send', { opId: uuid7(), conversationId: conv, body }), 'chat.send'); await sleep(400); }
  if (photo && !have.some(m => m.media || m.asset || m.kind === 'media' || m.mode)) {
    const [who, pic, mode] = photo;
    const asset = await upload(who, 'chat', await stock(pic), { viewRule: 'timer', viewSeconds: 15 });
    must(await api(email(who), 'chat.sendMedia', { opId: uuid7(), conversationId: conv, assetId: asset, mode }), 'chat.sendMedia');
  }
}
async function link(a, b, kind, mySide, accept) {
  const pb = await pid(b);
  const mine = await api(email(a), 'links.mine', {});
  const all = [...(mine.confirmed ?? []).map(x => ({ ...x, state: 'confirmed' })), ...(mine.incoming ?? []), ...(mine.sent ?? [])];
  let l = all.find(x => [x.other?.id, x.profile?.id, x.profileId].includes(pb));
  if (!l) {
    const r = must(await api(email(a), 'link.propose', { opId: uuid7(), profileId: pb, kind, ...(mySide ? { mySide } : {}), vis: 'all' }), 'link.propose');
    l = { id: r.id ?? r.linkId, state: 'pending' };
  }
  if (accept && l.state !== 'confirmed' && l.state !== 'active') {
    const r = await api(email(b), 'link.answer', { opId: uuid7(), linkId: l.id, accept: true, vis: 'all' });
    if (r.status >= 400 && r.status !== 409) must(r, 'link.answer');
  }
}

// ---------------------------------------------------------------- phase: couples
async function coupleOf(key) { const b = await boot(email(key)); return b.profiles?.find(p => p.kind === 'couple') ?? null; }
async function formCouple(a, b) {
  let c = await coupleOf(a);
  if (c) return c;
  const inv = must(await api(email(a), 'couple.invite', { opId: uuid7(), handle: P[b].handle }), 'couple.invite');
  must(await api(email(b), 'couple.inviteAnswer', { opId: uuid7(), inviteId: inv.id, accept: true }), 'inviteAnswer');
  return coupleOf(a);
}
async function coupleProfile(key, coupleId, fields, face) {
  const e = email(key);
  const prof = must(await api(e, 'profile.get', { profileId: coupleId }, coupleId), 'couple profile.get').profile;
  if (!prof.bio) must(await api(e, 'profile.update', { opId: uuid7(), rev: prof.rev, ...fields, cityId: fields.cityId ? await cityId(fields.cityId) : undefined }, coupleId), 'couple profile.update');
  if (face && !prof.photos?.length) {
    const asset = await upload(key, 'avatar', faces()[face], { profile: coupleId });
    must(await api(e, 'profile.photosSet', { opId: uuid7(), assetIds: [asset] }, coupleId), 'couple photosSet');
  }
}
async function couples() {
  // A: Саша и Ника — active, both in «trust» mode, visible in Discover, photo, posts as the couple (posts phase).
  await step('couple nord', async () => {
    const c = await formCouple('sasha', 'nika');
    await coupleProfile('sasha', c.id, { name: 'Саша и Ника', bio: 'Пара из Гамбурга. Ищем друзей на вечеринки с дресс-кодом и долгие разговоры после. Пишем вдвоём.', cityId: 'Гамбург' }, 'p1');
    for (const k of ['sasha', 'nika']) must(await api(email(k), 'couple.setup', { opId: uuid7(), mode: 'trust', requestsFrom: 'all' }, c.id), 'setup ' + k);
    const st = (await api(email('sasha'), 'profile.settings', {}, c.id)).settings ?? {};
    if (st.discoverMode !== 'visible') await api(email('sasha'), 'profile.setVisibility', { opId: uuid7(), setting: 'discoverMode', value: 'visible' }, c.id);
  });
  // B: Глеб и Оля — Оля approves Глеб's changes: one change waits for her, one was returned with a comment.
  await step('couple tea', async () => {
    const c = await formCouple('gleb', 'olya');
    await coupleProfile('gleb', c.id, { name: 'Глеб и Оля', bio: 'Минск. Женаты девять лет, открываем для себя новое — бережно и вдвоём.', cityId: 'Минск' }, 'p2');
    must(await api(email('olya'), 'couple.setup', { opId: uuid7(), mode: 'approve', requestsFrom: 'matches' }, c.id), 'olya setup');
    must(await api(email('gleb'), 'couple.setup', { opId: uuid7(), mode: 'trust', requestsFrom: 'matches' }, c.id), 'gleb setup');
    const pend = (await api(email('olya'), 'decide.approvals', {}, c.id));
    const items = [...(pend.items ?? []), ...(pend.pending ?? []), ...(pend.returned ?? []), ...(pend.mine ?? [])];
    if (!items.some(x => x.kind === 'post.publish')) {
      const d = must(await api(email('gleb'), 'post.saveDraft', { opId: uuid7(), post: { type: 'post', body: 'Наконец-то съездили в Вильнюс на тематический фестиваль! Рассказываем, как это было и что взяли на заметку.', audience: 'all', topics: [] } }, c.id), 'couple draft');
      const p = must(await api(email('gleb'), 'post.publish', { opId: uuid7(), postId: d.id ?? d.postId }, c.id), 'couple publish');
      const approvalId = p.pending?.approvalId;
      if (approvalId) must(await api(email('olya'), 'decide.approval', { opId: uuid7(), approvalId, choice: 'return', comment: 'Давай сначала уберём название фестиваля и город — не хочу, чтобы нас узнали коллеги.' }, c.id), 'return');
    }
    if (!items.some(x => x.kind === 'profile.update' && x.state === 'pending')) {
      const prof = (await api(email('gleb'), 'profile.get', { profileId: c.id }, c.id)).profile;
      const r = await api(email('gleb'), 'profile.update', { opId: uuid7(), rev: prof.rev, bio: 'Минск. Женаты девять лет. Любим настолки, чай и честные разговоры; ищем пару для дружбы и совместных поездок.' }, c.id);
      if (r.status >= 400 && r.status !== 409) must(r, 'pending profile change');
    }
  });
  // C: Роман и Ева — Роман stopped the couple (paused), Ева asked to restore it and waits.
  await step('couple paused', async () => {
    let c = await coupleOf('roman');
    if (!c) {
      c = await formCouple('roman', 'eva');
      await coupleProfile('roman', c.id, { name: 'Роман и Ева', bio: 'Алматы. Пара, которая взяла паузу.', cityId: 'Алматы' });
    }
    const g = (await api(email('roman'), 'couple.get', {}, c.id)).couple;
    if (g?.state === 'active') must(await api(email('roman'), 'couple.stop', { opId: uuid7(), confirm: true }, c.id), 'couple.stop');
    const g2 = (await api(email('eva'), 'couple.get', {}, c.id)).couple;
    if (!g2?.members?.some(m => m.restoreAgreed)) await api(email('eva'), 'couple.restore', { opId: uuid7() }, c.id);
  });
  // A pending invitation (Илья → Марта) and a partner link nobody has used yet (Денис).
  await step('invite ilya→marta', async () => {
    const inv = await api(email('ilya'), 'couple.invites', {});
    if (!(inv.outgoing ?? []).some(i => i.state === 'pending')) must(await api(email('ilya'), 'couple.invite', { opId: uuid7(), handle: P.marta.handle }), 'invite marta');
  });
  await step('partner link den', async () => {
    const inv = await api(email('den'), 'couple.invites', {});
    if (!inv.link) must(await api(email('den'), 'couple.linkCreate', { opId: uuid7() }), 'linkCreate');
  });
}

// ---------------------------------------------------------------- phase: communities
const COMMUNITIES = [
  { key: 'rope', host: 'lev', name: 'Верёвка и чай', privacy: 'open', topics: ['shibari', 'bondage', 'safeword'], plate: 'amber', cover: 'rope',
    description: 'Московское сообщество для тех, кто связывает или хочет научиться. Разбираем узлы, говорим о безопасности, раз в месяц — открытый вечер с чаем.',
    rules: ['Сначала согласие, потом верёвка', 'Без фото участников без их разрешения', 'Новичкам — только с ведущим', 'Уважаем стоп-слово всегда'],
    members: ['timur', 'mira', 'liza', 'stas', 'zhenya', 'katya', 'nastya', 'yana', 'egor', 'vesta'], cohost: 'timur' },
  { key: 'club', host: 'timur', name: 'Клуб внимательных практик', privacy: 'closed', joinQuestion: 'Расскажи коротко о своём опыте и почему хочешь в клуб.', topics: ['protocol', 'rituals', 'service'], plate: 'coal', cover: 'candles',
    description: 'Закрытый клуб в Казани: встречи по протоколу, ритуалы и практика внимательности. Вступление — после короткого ответа на вопрос.',
    rules: ['Всё, что происходит в клубе, остаётся в клубе', 'Обращение на «ты» по умолчанию', 'Опоздание больше 15 минут — пропуск встречи'],
    members: ['lev', 'mira', 'egor'], pending: ['stas', 'oleg'], declined: ['marta'] },
  { key: 'circle', host: 'alisa', name: 'Тихий круг Амстердама', privacy: 'hidden', topics: ['caregiver', 'rituals'], plate: 'moss', cover: 'canal',
    description: 'Скрытое сообщество: найти его можно только по приглашению. Небольшие встречи русскоязычных в Амстердаме.',
    rules: ['Только по приглашению', 'Не пересылаем ссылку дальше'], members: ['oleg', 'kira'], viaInvite: true },
  { key: 'books', host: 'kira', name: 'Книжный клуб: о близости', privacy: 'open', topics: ['intimacy', 'talk'], plate: 'lilac', cover: 'books',
    description: 'Читаем книги о близости, привязанности и границах. Раз в месяц обсуждаем одну книгу. Пока только собираемся.',
    rules: ['Без спойлеров в заголовках', 'Уважаем чужой опыт'], members: ['nastya', 'zhenya'] },
  { key: 'photo', host: 'vesta', name: 'Фото и эстетика', privacy: 'open', topics: ['exhibition', 'sensory'], plate: 'rose', cover: 'neon',
    description: 'Делимся снимками без лиц: фактуры, свет, город, детали. Обсуждаем технику и согласие на съёмку.',
    rules: ['Никаких узнаваемых лиц без согласия', 'Указывай, если фото чужое', 'Ничего откровенного в общей ленте'],
    members: ['mira', 'daniel', 'katya', 'egor', 'yana'] },
  { key: 'morning', host: 'mira', name: 'Утренние разговоры', privacy: 'open', topics: ['talk'], plate: 'sea', review: true,
    description: 'Короткие утренние созвоны о том, как прошла неделя, и о том, что хочется попробовать. Новое сообщество, ждёт проверки.',
    rules: ['Говорим по очереди', 'Камера по желанию'], members: [] },
];
const DISCUSSIONS = {
  rope: [
    { by: 'lev', pin: true, title: 'Правила и FAQ сообщества', body: 'Добро пожаловать! Здесь собраны ответы на частые вопросы.\n\n**Где взять верёвку?** Джут 6 мм, 8 м — универсальный старт.\n\n**С чего начать?** С одноколонного узла и разговора о границах.\n\n> Если сомневаешься — спроси ведущего.', note: true },
    { by: 'mira', body: 'Кто-нибудь пробовал льняную верёвку вместо джута? Как по ощущениям и уходу?', replies: [['lev', 'Лён мягче, но тянется сильнее. Для подвесов я бы не брал.'], ['liza', 'Мне нравится для партера, пахнет приятнее :)'], ['mira', 'Спасибо! Возьму одну на пробу.', 1]] },
    { by: 'stas', body: 'Подскажите, как понять, что узел пережимает? Боюсь навредить партнёру.', replies: [['timur', 'Проверяй чувствительность пальцев каждые пару минут и спрашивай словами.'], ['nastya', 'И договоритесь о жесте, если говорить трудно.']] },
    { by: 'liza', body: 'Фото с прошлого открытого вечера — только руки и узлы, все согласились.', pic: 'rope2' },
    { by: 'zhenya', body: 'А можно прийти на вечер просто посмотреть, без практики?', replies: [['lev', 'Конечно, многие так начинают.']] },
  ],
  club: [
    { by: 'timur', pin: true, body: 'Расписание встреч на ноябрь: каждую вторую субботу, 19:00. Адрес — в личном сообщении после подтверждения.' },
    { by: 'egor', body: 'Предлагаю следующую встречу посвятить ритуалам начала и завершения сессии.', replies: [['timur', 'Хорошая идея, внесу в план.']] },
    { by: 'mira', body: 'Как вы ведёте дневник договорённостей? Бумага или приложение?' },
  ],
  circle: [{ by: 'alisa', pin: true, body: 'Следующая встреча — у меня дома в воскресенье. Принесите что-нибудь к чаю.' }, { by: 'oleg', body: 'Буду! Возьму штрудель.' }],
  books: [],
  photo: [
    { by: 'vesta', pin: true, body: 'Тема месяца — «Фактуры». Кожа, ткань, верёвка, дерево. Без лиц.', pic: 'leather' },
    { by: 'daniel', body: 'Моя мастерская вечером.', pic: 'workshop' },
    { by: 'katya', body: 'Берлинские неоновые вывески — моя слабость.', pic: 'neon2' },
  ],
};
async function communityByName(host, name) {
  const mine = (await api(email(host), 'community.mine', {})).hosting ?? [];
  return mine.find(x => x.name === name) ?? null;
}
async function approveCommunity(id) {
  for (let i = 0; i < 5; i++) {
    const c = (await api(STAFF, 'community.get', { communityId: id })).community;
    if (c?.state === 'published' && !c.pendingChange) return c;
    const d = await api(STAFF, 'staff.communityDecide', { opId: uuid7(), communityId: id, rev: c?.rev ?? 1, decision: 'approve' });
    if (d.status === 200) return;
    await sleep(2000);
  }
  throw new Error('community ' + id + ' not approved');
}
const communityIds = {};
async function communities() {
  for (const k of COMMUNITIES) await step('community ' + k.key, async () => {
    let c = await communityByName(k.host, k.name);
    if (!c) {
      const cover = k.cover ? await upload(k.host, 'community', await stock(k.cover)) : null;
      const r = must(await api(email(k.host), 'community.create', { opId: uuid7(), name: k.name, privacy: k.privacy, ...(k.joinQuestion ? { joinQuestion: k.joinQuestion } : {}),
        description: k.description, topics: k.topics, rules: k.rules, plate: k.plate, placeId: null, coverAssetId: cover }), 'community.create');
      c = { id: r.id };
    }
    communityIds[k.key] = c.id;
    if (k.review) return; // stays «на проверке»
    const full = (await api(email(k.host), 'community.get', { communityId: c.id })).community;
    if (full.state !== 'published' || full.pendingChange) await approveCommunity(c.id);
    let invite;
    if (k.viaInvite) { const r = must(await api(email(k.host), 'community.invite', { opId: uuid7(), communityId: c.id }), 'community.invite'); invite = r.token ?? r.invite ?? r.code ?? (r.url ? String(r.url).split('/').pop() : undefined); }
    for (const m of k.members) await step(`join ${m}→${k.key}`, async () => {
      const r = await api(email(m), 'community.join', { opId: uuid7(), communityId: c.id, rulesAccepted: true, answer: k.joinQuestion ? 'Практикую несколько лет, хочу встреч в спокойном формате.' : '', ...(invite ? { invite } : {}) });
      if (r.status === 409) return;
      must(r, 'join');
      if (r.state === 'requested') { // closed: the host approves
        const req = (await api(email(k.host), 'community.requests', { communityId: c.id })).items?.find(x => x.id === r.id);
        if (req) must(await api(email(k.host), 'community.requestDecide', { opId: uuid7(), requestId: req.id, rev: req.rev ?? 1, approve: true }), 'approve join');
      }
    });
    if (k.privacy === 'closed') await step('approve members ' + k.key, async () => {
      const want = new Set(k.members.map(m => P[m].handle));
      for (const req of (await api(email(k.host), 'community.requests', { communityId: c.id })).items ?? [])
        if (want.has(req.profile?.handle)) must(await api(email(k.host), 'community.requestDecide', { opId: uuid7(), requestId: req.id, rev: req.rev ?? 1, approve: true }), 'approve join');
    });
    for (const m of k.pending ?? []) await step(`request ${m}→${k.key}`, async () => {
      const r = await api(email(m), 'community.join', { opId: uuid7(), communityId: c.id, rulesAccepted: true, answer: m === 'stas' ? 'Учусь, хочу практиковаться в безопасной компании.' : 'Был в похожем клубе в Амстердаме, хочу познакомиться.' });
      if (r.status !== 409) must(r, 'join request');
    });
    for (const m of k.declined ?? []) await step(`declined ${m}→${k.key}`, async () => {
      const r = await api(email(m), 'community.join', { opId: uuid7(), communityId: c.id, rulesAccepted: true, answer: 'Просто интересно посмотреть.' });
      if (r.status === 409) return;
      must(r, 'join to decline');
      const reqs = (await api(email(k.host), 'community.requests', { communityId: c.id })).items ?? [];
      const req = reqs.find(x => (x.profile?.handle ?? x.handle) === P[m].handle);
      if (req) must(await api(email(k.host), 'community.requestDecide', { opId: uuid7(), requestId: req.id, rev: req.rev ?? 1, approve: false }), 'decline join');
    });
    if (k.cohost) await step('cohost ' + k.key, async () => { await api(email(k.host), 'community.member', { opId: uuid7(), communityId: c.id, profileId: await pid(k.cohost), change: 'host' }); });
    // discussions
    const existing = (await api(email(k.host), 'community.discussions', { communityId: c.id })).items ?? [];
    for (const d of DISCUSSIONS[k.key] ?? []) await step(`discussion ${k.key} ${d.by}`, async () => {
      let post = existing.find(x => (x.body ?? '').startsWith(d.body.slice(0, 30)));
      if (!post) post = { id: await publish(d.by, { type: d.note ? 'note' : 'post', title: d.title, body: d.body, communityId: c.id, topics: [], pic: d.pic }) };
      if (d.pin) await api(email(k.host), 'discussion.host', { opId: uuid7(), postId: post.id, change: 'pin' });
      if (d.replies) await thread(post.id, d.replies);
    });
  });
  // Stas's request in the closed club is answered? No — it stays pending, as does Oleg's.
}

// ---------------------------------------------------------------- posts helpers
const myPosts = new Map();
async function postsOf(key, profile) {
  const k = key + (profile ?? '');
  if (!myPosts.has(k)) myPosts.set(k, (await api(email(key), 'me.posts', {}, profile)).items ?? []);
  return myPosts.get(k);
}
/** Publishes a post once (found again by the start of its text). Returns its id. */
async function publish(key, { pic, pics, profile, ...post }) {
  const have = await postsOf(key, profile);
  const found = have.find(x => (x.body ?? '').slice(0, 40) === post.body.slice(0, 40) || (post.title && x.title === post.title));
  if (found) return found.id;
  const mediaIds = [];
  for (const k of pics ?? (pic ? [pic] : [])) mediaIds.push(await upload(key, 'post', await stock(k), { profile }));
  const d = must(await api(email(key), 'post.saveDraft', { opId: uuid7(), post: { type: 'post', audience: 'all', topics: [], ...post, ...(post.title ? {} : { title: undefined }), mediaIds } }, profile), 'saveDraft');
  const id = d.id ?? d.postId;
  must(await api(email(key), 'post.publish', { opId: uuid7(), postId: id }, profile), 'publish');
  have.push({ id, body: post.body, title: post.title });
  return id;
}
/** replies: [who, text, parentIndex?] — parentIndex points at an earlier reply of this list (a nested answer). */
async function thread(postId, replies) {
  const have = (await api(email(replies[0][0]), 'post.replies', { postId })).items ?? [];
  if (have.length >= replies.length) return;
  const ids = [];
  for (const [who, body, parent] of replies) {
    const r = must(await api(email(who), 'reply.create', { opId: uuid7(), postId, body, ...(parent !== undefined && ids[parent - 1] ? { parentId: ids[parent - 1] } : {}) }), 'reply');
    ids.push(r.id ?? r.replyId);
  }
}
async function like(who, postId, targetType = 'post') { await api(email(who), 'reaction.set', { opId: uuid7(), targetType, targetId: postId, on: true }); }

// ---------------------------------------------------------------- phase: events
const at = (d, h, m = 0) => { const x = days(d); x.setUTCHours(h, m, 0, 0); return x; };
const EVENTS = [
  { key: 'rope-night', host: 'lev', community: 'rope', title: 'Вечер шибари для начинающих', kind: 'workshop', format: 'offline', city: 'Москва', area: 'Китай-город', exactAddress: 'Лубянский проезд, 5, лофт на 3 этаже',
    start: at(12, 16), hours: 3, price: { kind: 'door', amount: 1500, currency: 'RUB' }, cover: 'rope', tz: 'Europe/Moscow',
    description: 'Открытый вечер для тех, кто только начинает. Покажем базовые узлы, поговорим о безопасности и согласии. Верёвки дадим, приходите в удобной одежде.',
    going: ['mira', 'liza', 'stas', 'zhenya', 'nastya', 'timur'], interested: ['yana', 'katya', 'egor'], announce: 'Напоминаем: вход со двора, звонок «Лофт». Возьмите сменную обувь!' },
  { key: 'consent-talk', host: 'kira', title: 'Онлайн-разговор: границы и согласие', kind: 'talk', format: 'online', joinUrl: 'https://meet.jit.si/feture-granitsy', start: at(5, 17), hours: 1.5, price: { kind: 'free' }, cover: 'coffee', tz: 'Europe/Moscow',
    description: 'Полтора часа разговора о том, как договариваться о границах и что делать, если что-то пошло не так. Можно с выключенной камерой.',
    going: ['nastya', 'zhenya', 'marta', 'mira'], interested: ['ilya', 'yana'] },
  { key: 'velvet', host: 'alisa', title: 'Вечеринка «Чёрный бархат»', kind: 'party', format: 'offline', city: 'Амстердам', area: 'Де Пейп', exactAddress: 'Ceintuurbaan 282, вход с переулка',
    start: at(20, 20), hours: 5, price: { kind: 'external', amount: 25, currency: 'EUR', ticketUrl: 'https://tickets.example.org/black-velvet' }, cover: 'concert', tz: 'Europe/Amsterdam',
    requiresApplication: true, questions: ['Был(а) ли ты на подобных вечеринках?', 'Какой дресс-код выберешь?'], requirements: 'Дресс-код: чёрный, кожа, латекс или бархат. Телефоны — в гардероб.',
    description: 'Камерная вечеринка с дресс-кодом для своих. Музыка, бар, тёмная комната. Вход по одобренным заявкам и билетам у организатора.',
    applications: { approved: ['liza', 'egor'], pending: ['oleg', 'katya'], declined: ['stas'] } },
  { key: 'leather', host: 'daniel', title: 'Мастер-класс по уходу за кожей', kind: 'workshop', format: 'offline', city: 'Белград', area: 'Дорћол', exactAddress: 'Cara Dušana 45, мастерская во дворе',
    start: at(9, 15), hours: 2, price: { kind: 'door', amount: 15, currency: 'EUR' }, cover: 'workshop', tz: 'Europe/Belgrade',
    description: 'Как чистить, питать и хранить кожаные вещи: ремни, манжеты, корсеты. Покажу на своих работах, можно приносить своё.', going: [], interested: [] },
  { key: 'aftercare', host: 'lev', community: 'rope', title: 'Онлайн-воркшоп: афтеркер после практик', kind: 'workshop', format: 'online', joinUrl: 'https://meet.jit.si/feture-aftercare', start: at(15, 16), hours: 2,
    price: { kind: 'external', amount: 10, currency: 'EUR', ticketUrl: 'https://tickets.example.org/aftercare' }, tz: 'Europe/Moscow',
    description: 'Что происходит с телом и эмоциями после сессии, как поддержать партнёра и себя. Билеты — на сайте организатора, отметь «купил(а) билет».',
    going: ['mira', 'nastya'], interested: ['kira', 'liza'], ticket: ['mira'] },
  { key: 'coffee', host: 'vesta', title: 'Кофе и знакомство в Сололаки', kind: 'meetup', format: 'offline', city: 'Тбилиси', area: 'Сололаки', exactAddress: 'ул. Леселидзе, 18, кофейня на углу',
    start: new Date(Date.now() + 8 * 60e3), minutes: 30, price: { kind: 'free' }, cover: 'tea', tz: 'Asia/Tbilisi', past: true,
    description: 'Короткая встреча за кофе для тех, кто в Тбилиси. Просто знакомимся и болтаем. (Встреча уже прошла.)', going: ['egor', 'mira', 'katya'] },
  { key: 'cancelled', host: 'timur', title: 'Пикник клуба на Кабане', kind: 'meetup', format: 'offline', city: 'Казань', area: 'Старо-Татарская слобода', exactAddress: 'набережная озера Кабан, у беседки',
    start: at(25, 9), hours: 4, price: { kind: 'free' }, tz: 'Europe/Moscow', cancel: 'Перенесли из-за погоды — новый день объявим в клубе.',
    description: 'Пикник для участников клуба: пледы, чай, настольные игры. Без практик, просто общение.', going: ['egor'] },
  { key: 'reading', host: 'kira', title: 'Чтения вслух: письма о близости', kind: 'talk', format: 'online', joinUrl: 'https://meet.jit.si/feture-chteniya', start: at(18, 18), hours: 1, price: { kind: 'free' }, tz: 'Europe/Moscow', review: true,
    description: 'Читаем вслух письма и короткие эссе о близости, потом обсуждаем. Новое событие, ждёт проверки.' },
];
async function events() {
  for (const ev of EVENTS) await step('event ' + ev.key, async () => {
    const e = email(ev.host);
    const mine = (await api(e, 'event.mine', {})).organizing ?? [];
    let got = mine.find(x => x.title === ev.title && x.state !== 'withdrawn');
    if (!got) {
      const cover = ev.cover ? await upload(ev.host, 'event', await stock(ev.cover)) : null;
      const end = new Date(+ev.start + (ev.minutes ? ev.minutes * 60e3 : ev.hours * 3600e3));
      const r = must(await api(e, 'event.submit', { opId: uuid7(), event: {
        title: ev.title, kind: ev.kind, description: ev.description, format: ev.format,
        placeId: ev.city ? await cityId(ev.city) : null, area: ev.area ?? null, exactAddress: ev.exactAddress ?? null, joinUrl: ev.joinUrl ?? null,
        tz: ev.tz, startsAt: ev.start.toISOString(), endsAt: end.toISOString(), price: ev.price,
        requiresApplication: !!ev.requiresApplication, questions: ev.questions ?? [], requirements: ev.requirements ?? null,
        coverAssetId: cover, plate: 'lilac', communityId: ev.community ? communityIds[ev.community] ?? (await communityByName(COMMUNITIES.find(c => c.key === ev.community).host, COMMUNITIES.find(c => c.key === ev.community).name))?.id ?? null : null } }), 'event.submit');
      got = { id: r.id };
    }
    if (ev.review) return;
    let full = (await api(e, 'event.get', { eventId: got.id })).event;
    if (full.state === 'in_review' || full.pendingChange) {
      must(await api(STAFF, 'staff.eventDecide', { opId: uuid7(), eventId: got.id, rev: full.rev, decision: 'approve' }), 'staff.eventDecide');
      full = (await api(e, 'event.get', { eventId: got.id })).event;
    }
    if (full.past) return;
    for (const m of ev.going ?? []) await step(`rsvp ${m} going ${ev.key}`, async () => must(await api(email(m), 'event.rsvp', { opId: uuid7(), eventId: got.id, status: 'going', showInList: m !== 'nastya', ...(ev.ticket?.includes(m) ? { ticketMarked: true } : {}) }), 'rsvp'));
    for (const m of ev.interested ?? []) await step(`rsvp ${m} interested ${ev.key}`, async () => must(await api(email(m), 'event.rsvp', { opId: uuid7(), eventId: got.id, status: 'interested' }), 'rsvp'));
    if (ev.applications) {
      const all = [...ev.applications.approved, ...ev.applications.pending, ...ev.applications.declined];
      for (const m of all) await step(`apply ${m} ${ev.key}`, async () => {
        const r = await api(email(m), 'event.apply', { opId: uuid7(), eventId: got.id, answers: ['Да, была пару раз в Берлине и Амстердаме.', 'Чёрный бархат и кожаные перчатки.'], note: 'Буду одна/один, если можно.', requirementsAccepted: true });
        if (r.status !== 409) must(r, 'apply');
      });
      const pend = (await api(e, 'event.applications', { eventId: got.id, state: 'pending' })).items ?? [];
      for (const a of pend) {
        const h = a.profile?.handle ?? a.handle;
        const who = CAST.find(c => c.handle === h)?.key;
        if (ev.applications.approved.includes(who) || ev.applications.declined.includes(who))
          await step(`decide ${who} ${ev.key}`, async () => must(await api(e, 'event.applicationDecide', { opId: uuid7(), applicationId: a.id, rev: a.rev ?? 1, approve: ev.applications.approved.includes(who) }), 'applicationDecide'));
      }
    }
    if (ev.announce) await step('announce ' + ev.key, async () => { await api(e, 'event.announce', { opId: uuid7(), eventId: got.id, body: ev.announce }); });
    if (ev.cancel && full.state === 'published') must(await api(e, 'event.cancel', { opId: uuid7(), eventId: got.id, reason: ev.cancel }), 'event.cancel');
    for (const m of ev.key === 'rope-night' ? ['liza', 'katya'] : ev.key === 'velvet' ? ['nika'] : []) await api(email(m), 'saved.set', { opId: uuid7(), kind: 'event', targetId: got.id, on: true });
  });
  // A draft that was never submitted.
  await step('event draft', async () => {
    const mine = await api(email('timur'), 'event.mine', {});
    if (!(mine.drafts ?? []).length) must(await api(email('timur'), 'event.draftSave', { opId: uuid7(), step: 2, form: { title: 'Новогодняя встреча клуба', kind: 'party', format: 'offline', description: 'Черновик: место и дату ещё выбираем.' } }), 'draftSave');
  });
}

// ---------------------------------------------------------------- phase: events-more (soon, later, past, cancelled)
// Owner, 28.10.2026: events ~20 and ~50 days ahead (free, by application, ticket at the organizer, at the door, online
// and offline in different cities, two by couples, covers from the stock pictures), several that already happened
// (yesterday, a week ago, a month ago) with people who went or were interested, and two cancelled ones with a reason
// that Mira, Lev and Kira had marked. Built through the app like the rest; only the past dates cannot be: the app takes
// a start in the future only, so a «past» event is created ~15 minutes ahead, people answer, and then its dates are
// moved back. That one step is a database update the script prints (`-- backdate` SQL, run it with the Supabase SQL
// editor / MCP on project anrhayozrhrmiwexmbhw); a rerun prints it again only for events not moved yet.
// `couple`: the host's couple profile (nord: Саша и Ника, both trust; tea: Глеб и Оля — Оля approves Глеб's event).
const EVENTS_MORE = [
  // ~20 days ahead
  { key: 'techno-brunch', host: 'katya', title: 'Техно-бранч в Кройцберге', kind: 'party', format: 'offline', city: 'Берлин', area: 'Кройцберг', exactAddress: 'Skalitzer Str. 114, двор, вторая дверь',
    start: at(20, 10), hours: 4, price: { kind: 'free' }, cover: 'concert', tz: 'Europe/Berlin', plate: 'rose',
    description: 'Днём, при свете, без дресс-кода: диджей, кофе и вафли. Хороший способ познакомиться с берлинской тусовкой, если вечеринки ночью — не ваше.',
    going: ['mira', 'liza', 'oleg'], interested: ['lev', 'kira', 'nastya'] },
  { key: 'wine-yerevan', host: 'egor', title: 'Винный вечер в Ереване', kind: 'meetup', format: 'offline', city: 'Ереван', area: 'Кентрон', exactAddress: 'ул. Сарьяна, 12, винный бар в подвале',
    start: at(21, 15), hours: 3, price: { kind: 'door', amount: 15, currency: 'USD' }, cover: 'wine', tz: 'Asia/Yerevan', plate: 'amber',
    description: 'Пробуем шесть армянских вин с сомелье и просто разговариваем. Для тех, кто живёт в Ереване или будет проездом.',
    going: ['vesta', 'oleg'], interested: ['mira', 'kira'] },
  { key: 'north-light', host: 'sasha', couple: true, title: 'Вечеринка пар «Северный свет»', kind: 'party', format: 'offline', city: 'Гамбург', area: 'Санкт-Паули', exactAddress: 'Hein-Hoyer-Str. 50, клуб на втором этаже',
    start: at(22, 19), hours: 5, price: { kind: 'external', amount: 30, currency: 'EUR', ticketUrl: 'https://tickets.example.org/nordlicht' }, cover: 'neon', tz: 'Europe/Berlin', plate: 'sea',
    requiresApplication: true, questions: ['Придёте парой или одни?'], requirements: 'Дресс-код: чёрное и неон. Фото внутри не снимаем.',
    description: 'Собираем пары и одиночек, которые давно хотели прийти на вечеринку с дресс-кодом, но не знали куда. Вход по заявкам, билеты — у нас на сайте.',
    interested: ['kira', 'mira'], applications: { approved: ['katya'], pending: ['lev'] } },
  { key: 'consent-cases', host: 'nastya', title: 'Психология согласия: разбор случаев', kind: 'talk', format: 'online', joinUrl: 'https://meet.jit.si/feture-soglasie-razbor',
    start: at(19, 16), hours: 1.5, price: { kind: 'free' }, cover: 'books', tz: 'Europe/Moscow', plate: 'moss',
    description: 'Разбираем три анонимные истории, присланные участниками: где было непонимание и как можно было договориться. Камеру можно не включать.',
    going: ['kira', 'zhenya', 'yana'], interested: ['lev'] },
  { key: 'coffee-ams', host: 'oleg', title: 'Утренний кофе для новичков', kind: 'meetup', format: 'offline', city: 'Амстердам', area: 'Йордан', exactAddress: 'Westerstraat 95, кафе у окна',
    start: at(23, 8), hours: 1.5, price: { kind: 'free' }, cover: 'coffee', tz: 'Europe/Amsterdam',
    description: 'Если вы только пришли в сообщество и хотите задать вопросы вживую — приходите. Без программы, просто кофе и знакомство.',
    going: ['alisa'], interested: ['mira'] },
  // ~50 days ahead
  { key: 'forest-rope', host: 'lev', title: 'Выезд на природу: верёвка в лесу', kind: 'workshop', format: 'offline', city: 'Москва', area: 'Лосиный Остров', exactAddress: 'поляна у Яузы, точку пришлём за день',
    start: at(50, 7), hours: 6, price: { kind: 'door', amount: 3000, currency: 'RUB' }, cover: 'forest', tz: 'Europe/Moscow', plate: 'moss',
    description: 'Целый день на свежем воздухе: подвесы на деревьях для опытных, партер для новичков, костёр и чай. Возьмите тёплую одежду и коврик.',
    going: ['kira', 'mira', 'liza'], interested: ['timur', 'stas'] },
  { key: 'photo-walk', host: 'vesta', title: 'Фотопрогулка по старому Тбилиси', kind: 'meetup', format: 'offline', city: 'Тбилиси', area: 'Абанотубани', exactAddress: 'у входа в серные бани, площадь Горгасали',
    start: at(48, 7), hours: 3, price: { kind: 'free' }, cover: 'autumn', tz: 'Asia/Tbilisi', plate: 'amber',
    description: 'Гуляем по старому городу и снимаем на что угодно — от плёнки до телефона. Покажу любимые дворы и места со светом.',
    going: ['mira'], interested: ['kira', 'lev', 'egor'] },
  { key: 'tea-couples', host: 'gleb', couple: true, title: 'Чайная церемония для пар', kind: 'workshop', format: 'offline', city: 'Минск', area: 'Верхний город', exactAddress: 'ул. Кирилла и Мефодия, 8, чайная на втором этаже',
    start: at(52, 13), hours: 2, price: { kind: 'door', amount: 20, currency: 'EUR' }, cover: 'tea', tz: 'Europe/Minsk', plate: 'lilac',
    description: 'Учимся заваривать улун вдвоём и разговаривать без спешки. Для пар и тех, кто придёт с другом. Чай и посуда — наши.',
    interested: ['lev', 'kira'] },
  { key: 'new-year', host: 'mira', title: 'Новогодний вечер в Берлине', kind: 'party', format: 'offline', city: 'Берлин', area: 'Фридрихсхайн', exactAddress: 'Revaler Str. 99, зал «Бархат»',
    start: at(55, 18), hours: 6, price: { kind: 'external', amount: 35, currency: 'EUR', ticketUrl: 'https://tickets.example.org/berlin-neujahr' }, cover: 'candles', tz: 'Europe/Berlin', plate: 'coal',
    requiresApplication: true, questions: ['С кем придёшь?', 'Был(а) ли ты на наших вечерах?'],
    description: 'Отмечаем Новый год заранее, своим кругом: ужин, музыка, свечи и тёмная комната для желающих. Вход по заявкам, билеты — у организатора.',
    interested: ['katya', 'kira', 'lev'] },
  { key: 'club-history', host: 'timur', title: 'Лекция: история клубной культуры', kind: 'talk', format: 'online', joinUrl: 'https://meet.jit.si/feture-club-history',
    start: at(47, 16), hours: 1.5, price: { kind: 'external', amount: 8, currency: 'EUR', ticketUrl: 'https://tickets.example.org/club-history' }, cover: 'neon2', tz: 'Europe/Moscow', plate: 'rose',
    description: 'От подпольных вечеринок девяностых до сегодняшних закрытых клубов: как менялись правила, дресс-коды и отношение к согласию.',
    going: ['lev'], interested: ['mira', 'kira', 'daniel'], ticket: ['lev'] },
  // already happened (dates moved back after the answers)
  { key: 'tea-after', host: 'liza', title: 'Чаепитие после воркшопа', kind: 'meetup', format: 'offline', city: 'Москва', area: 'Китай-город', exactAddress: 'Подкопаевский пер., 4, чайная «Лист»',
    backdate: 1, hours: 2, price: { kind: 'free' }, cover: 'tea', tz: 'Europe/Moscow', plate: 'moss',
    description: 'Собрались после субботнего воркшопа: чай, пирог и разговоры о том, что получилось и что нет. Встреча уже прошла.',
    going: ['mira', 'lev', 'kira', 'stas'], interested: ['nastya', 'zhenya'] },
  { key: 'cuffs', host: 'daniel', title: 'Открытая мастерская: делаем манжеты', kind: 'workshop', format: 'offline', city: 'Белград', area: 'Дорћол', exactAddress: 'Cara Dušana 45, мастерская во дворе',
    backdate: 7, hours: 3, price: { kind: 'door', amount: 20, currency: 'EUR' }, cover: 'leather', tz: 'Europe/Belgrade', plate: 'coal',
    description: 'Каждый сделал себе пару манжет: раскрой, пробивка, прошивка, фурнитура. Материалы были мои. Мастерская уже прошла.',
    going: ['kira', 'egor', 'vesta'], interested: ['mira', 'lev'] },
  { key: 'book-night', host: 'kira', title: 'Книжный вечер на Петроградке', kind: 'meetup', format: 'offline', city: 'Санкт-Петербург', area: 'Петроградская сторона', exactAddress: 'Большой пр. П.С., 34, книжное кафе',
    backdate: 30, hours: 2, price: { kind: 'free' }, cover: 'books', tz: 'Europe/Moscow', plate: 'lilac',
    description: 'Обсуждали «Этичную шлюху» и спорили о ревности. Было восемь человек и очень много чая. Вечер уже прошёл.',
    going: ['nastya', 'lev', 'mira'], interested: ['zhenya', 'yana'] },
  // cancelled after people had answered
  { key: 'screening', host: 'alisa', title: 'Закрытый кинопоказ в Амстердаме', kind: 'party', format: 'offline', city: 'Амстердам', area: 'Ауд-Вест', exactAddress: 'Overtoom 301, малый зал',
    start: at(26, 19), hours: 3, price: { kind: 'external', amount: 20, currency: 'EUR', ticketUrl: 'https://tickets.example.org/screening' }, cover: 'velvet', tz: 'Europe/Amsterdam', plate: 'coal',
    description: 'Смотрим авторское кино о близости и обсуждаем после. Только для своих, телефоны сдаём на входе.',
    going: ['lev'], interested: ['mira', 'kira'], cancel: 'Площадка закрылась на ремонт. Деньги за билеты вернём в течение недели.' },
  { key: 'hike', host: 'roman', title: 'Поход в горы над Алматы', kind: 'meetup', format: 'offline', city: 'Алматы', area: 'Медеу', exactAddress: 'парковка у катка Медеу',
    start: at(30, 3), hours: 6, price: { kind: 'free' }, cover: 'mountains', tz: 'Asia/Almaty', plate: 'sea',
    description: 'Лёгкий поход к Большому Алматинскому озеру для тех, кто любит горы и неспешные разговоры. Обувь — треккинговая.',
    going: ['mira', 'kira'], interested: ['lev'], cancel: 'Синоптики обещают снегопад и лавинную опасность — переносим на весну.' },
];

async function eventsMore() {
  const backdate = [];
  for (const ev of EVENTS_MORE) await step('event ' + ev.key, async () => {
    const e = email(ev.host);
    const profile = ev.couple ? (await coupleOf(ev.host))?.id : undefined;
    if (ev.couple && !profile) throw new Error('no couple for ' + ev.host);
    const mine = (await api(e, 'event.mine', {}, profile)).organizing ?? [];
    let got = mine.find(x => x.title === ev.title && x.state !== 'withdrawn');
    if (!got) {
      const cover = ev.cover ? await upload(ev.host, 'event', await stock(ev.cover), { profile }) : null;
      const start = ev.backdate ? new Date(Date.now() + 15 * 60e3) : ev.start;
      const end = new Date(+start + ev.hours * 3600e3);
      const r = must(await api(e, 'event.submit', { opId: uuid7(), event: {
        title: ev.title, kind: ev.kind, description: ev.description, format: ev.format,
        placeId: ev.city ? await cityId(ev.city) : null, area: ev.area ?? null, exactAddress: ev.exactAddress ?? null, joinUrl: ev.joinUrl ?? null,
        tz: ev.tz, startsAt: start.toISOString(), endsAt: end.toISOString(), price: ev.price,
        requiresApplication: !!ev.requiresApplication, questions: ev.questions ?? [], requirements: ev.requirements ?? null,
        coverAssetId: cover, plate: ev.plate ?? 'lilac', communityId: null } }, profile), 'event.submit');
      got = { id: r.id };
      // Оля approves Глеб's event for the couple (Саша и Ника trust each other: theirs goes straight to review).
      if (r.pending?.approvalId) must(await api(email('olya'), 'decide.approval', { opId: uuid7(), approvalId: r.pending.approvalId, choice: 'approve' }, profile), 'partner approves');
    }
    let full = (await api(e, 'event.get', { eventId: got.id }, profile)).event;
    if (full.state === 'pending_partner') {
      const pend = await api(email('olya'), 'decide.approvals', {}, profile);
      const a = [...(pend.items ?? []), ...(pend.pending ?? [])].find(x => x.targetId === got.id || x.kind === 'event.submit');
      if (a) must(await api(email('olya'), 'decide.approval', { opId: uuid7(), approvalId: a.id ?? a.approvalId, choice: 'approve' }, profile), 'partner approves');
      full = (await api(e, 'event.get', { eventId: got.id }, profile)).event;
    }
    if (full.state === 'in_review' || full.pendingChange) {
      must(await api(STAFF, 'staff.eventDecide', { opId: uuid7(), eventId: got.id, rev: full.rev, decision: 'approve' }), 'staff.eventDecide');
      full = (await api(e, 'event.get', { eventId: got.id }, profile)).event;
    }
    const moved = ev.backdate && Date.parse(full.startsAt) < Date.now() - 12 * 3600e3;
    if (!full.past && full.state === 'published') {
      for (const m of ev.going ?? []) await step(`rsvp ${m} going ${ev.key}`, async () => must(await api(email(m), 'event.rsvp', { opId: uuid7(), eventId: got.id, status: 'going', showInList: true, ...(ev.ticket?.includes(m) ? { ticketMarked: true } : {}) }), 'rsvp'));
      for (const m of ev.interested ?? []) await step(`rsvp ${m} interested ${ev.key}`, async () => must(await api(email(m), 'event.rsvp', { opId: uuid7(), eventId: got.id, status: 'interested' }), 'rsvp'));
      if (ev.applications) {
        for (const m of [...ev.applications.approved, ...ev.applications.pending]) await step(`apply ${m} ${ev.key}`, async () => {
          const r = await api(email(m), 'event.apply', { opId: uuid7(), eventId: got.id, answers: ev.questions.map((_, i) => ['Парой, вдвоём с партнёром.', 'Да, была на двух.'][i]), note: 'Очень хочу попасть!', requirementsAccepted: true });
          if (r.status !== 409) must(r, 'apply');
        });
        const pend = (await api(e, 'event.applications', { eventId: got.id, state: 'pending' }, profile)).items ?? [];
        for (const a of pend) {
          const who = CAST.find(c => c.handle === (a.profile?.handle ?? a.handle))?.key;
          if (ev.applications.approved.includes(who)) await step(`decide ${who} ${ev.key}`, async () => must(await api(e, 'event.applicationDecide', { opId: uuid7(), applicationId: a.id, rev: a.rev ?? 1, approve: true }, profile), 'applicationDecide'));
        }
      }
      if (ev.cancel) must(await api(e, 'event.cancel', { opId: uuid7(), eventId: got.id, reason: ev.cancel }, profile), 'event.cancel');
    }
    if (ev.backdate && !moved) backdate.push([got.id, ev.backdate, ev.title]);
  });
  if (backdate.length) {
    // Start + 15 min now → the same clock time N days ago; created / published / answers move with it.
    const sql = backdate.map(([id, n]) => `update feture.event set starts_at = starts_at - interval '${n} days', ends_at = ends_at - interval '${n} days', created_at = created_at - interval '${n + 5} days', published_at = published_at - interval '${n + 4} days', updated_at = updated_at - interval '${n} days' where id = '${id}';\n`
      + `update feture.event_rsvp set updated_at = updated_at - interval '${n + 2} days' where event_id = '${id}';`).join('\n');
    console.log(`\n-- backdate (${backdate.map(b => b[2]).join(', ')}): run in the Supabase SQL editor, project anrhayozrhrmiwexmbhw\n${sql}\n`);
  }
}

// ---------------------------------------------------------------- phase: posts
async function posts() {
  // Mira: photo posts, a poll, an article, a followers-only post, a mention, photo tags, a draft, a gallery album.
  const m1 = await step('mira photo', () => publish('mira', { body: 'Воскресное утро в Берлине: кофе, балкон и новая книга. Кто что читает этой осенью?', pic: 'coffee', topics: ['slow'] }));
  const m2 = await step('mira tags', () => publish('mira', { body: 'Вечер в мастерской у @dan.kovach и прогулка с @vesta.art — спасибо за этот день!', pics: ['workshop', 'citynight'], tags: [], topics: [] }));
  const m3 = await step('mira poll', () => publish('mira', { body: 'Вопрос к тем, кто ходит на вечера: как вы предпочитаете знакомиться?', poll: { question: 'Как удобнее знакомиться на событии?', options: ['Сначала переписка', 'Сразу вживую', 'Через общих друзей', 'Не знакомлюсь, прихожу смотреть'] } }));
  const m4 = await step('mira article', () => publish('mira', { type: 'note', title: 'Что я поняла за год практик', topics: ['aftercare', 'talk'],
    body: 'Год назад я впервые пришла на открытый вечер и почти ушла с порога. Вот что я узнала с тех пор.\n\n**1. Разговор до важнее всего.** Пять минут обсуждения экономят часы неловкости.\n\n**2. Афтеркер — не опция.** Даже после самой лёгкой сессии мне нужно время и плед.\n\n**3. Нормально передумать.** *Стоп* — это не провал, а часть договорённости.\n\n> Лучшая практика — та, после которой обоим хочется продолжать разговор.\n\nСпасибо всем, кто был рядом — особенно @lev_orlov и сообществу «Верёвка и чай».' }));
  const m5 = await step('mira followers', () => publish('mira', { body: 'Только для подписчиков: в субботу буду на вечере в Кройцберге, кто со мной?', audience: 'followers' }));
  await step('mira interests post', () => publish('mira', { body: 'Обновила карту интересов — добавила то, что открыла для себя за осень.', interests: ['shibari', 'aftercare', 'ds'] }));
  await step('mira draft', async () => {
    const have = await postsOf('mira');
    if (!have.some(x => x.state === 'draft')) must(await api(email('mira'), 'post.saveDraft', { opId: uuid7(), post: { type: 'post', body: 'Черновик: хочу написать про поездку в Лейпциг, но пока не нашла слов…', audience: 'all', topics: [] } }), 'draft');
  });
  // Lev: article with formatting, announcement, interests, a thread with many replies.
  const l1 = await step('lev article', () => publish('lev', { type: 'note', title: 'Безопасность в шибари: пять правил', topics: ['shibari', 'safeword'],
    body: 'Каждый новый участник нашего сообщества получает эту памятку.\n\n- **Ножницы всегда рядом.** Спасательные ножницы с тупым концом.\n- **Проверяй чувствительность.** Пальцы, запястья, онемение — спрашивай каждые пару минут.\n- **Никаких узлов на шее.** Никогда.\n- **Договорись о сигналах.** Слово и жест, если говорить трудно.\n- **Не оставляй одного.** Связанный человек никогда не остаётся без присмотра.\n\n> Верёвка — это про доверие. Без доверия это просто верёвка.\n\nПодробнее — на открытом вечере, [расписание здесь](https://feture-mvp.vercel.app).' }));
  const l2 = await step('lev photo', () => publish('lev', { body: 'Новая партия джута приехала. Обработал, промаслил — к вечеру будет готова.', pic: 'rope2', topics: ['shibari'] }));
  await step('lev interests post', () => publish('lev', { body: 'Мои главные темы — если хотите поговорить, пишите.', interests: ['shibari', 'suspension', 'safeword'] }));
  // Kira: two articles (one with saved, unpublished edits), a granted-only post, a text post.
  const k1 = await step('kira article', () => publish('kira', { type: 'note', title: 'Согласие — это процесс, а не галочка', topics: ['talk', 'intimacy'],
    body: 'Часто согласие понимают как одно «да» в начале. Но это скорее разговор, который продолжается всё время.\n\n*Что помогает мне:*\n\n- спрашивать словами, а не догадываться;\n- договариваться о паузах заранее;\n- проверять друг друга после.\n\n**Согласие можно отозвать в любой момент** — и это нормально.\n\n> «Да» сейчас не значит «да» навсегда.' }));
  const k2 = await step('kira article 2', () => publish('kira', { type: 'note', title: 'Белые ночи и тихие бары: мой Петербург', topics: ['slow'],
    body: 'Подборка мест, где можно спокойно поговорить: без громкой музыки и с хорошим чаем.\n\n**Бар у канала** — маленький, на восемь столиков.\n\n**Книжное кафе** на Петроградке — до полуночи.\n\nА где любите сидеть вы?' }));
  await step('kira saved edits', async () => {
    if (!k2) return;
    const p = (await api(email('kira'), 'post.get', { postId: k2 })).post;
    if (((await api(email('kira'), 'me.posts', {})).pendingEdits ?? []).some(x => x.postId === k2)) return;
    must(await api(email('kira'), 'post.saveEdits', { opId: uuid7(), postId: k2, rev: p.rev, post: { type: 'note', title: 'Белые ночи и тихие бары: мой Петербург (обновлено)', topics: ['slow'], audience: 'all',
      body: 'Подборка мест, где можно спокойно поговорить: без громкой музыки и с хорошим чаем.\n\n**Бар у канала** — маленький, на восемь столиков.\n\n**Книжное кафе** на Петроградке — до полуночи.\n\n**Новое:** чайная на Васильевском.\n\nА где любите сидеть вы?' } }), 'saveEdits');
  });
  await step('kira granted', () => publish('kira', { body: 'Для тех, кому я открыла приватное: спасибо за доверие. Здесь буду иногда писать личное.', audience: 'granted' }));
  // Vesta: gallery with two albums (for everyone / followers only) and a photo post with a tag.
  const v = [];
  for (const [pic, body, aud] of [['citynight', 'Тбилиси ночью — мой любимый свет.', 'all'], ['autumn', 'Осень в Ваке-парке.', 'all'], ['sea', 'Батуми, шторм, ноябрь.', 'all'], ['mountains', 'Казбеги на рассвете.', 'all'], ['loft', 'Любимая картина из музея в Барселоне — такую столовую хочу себе.', 'followers'], ['flowers', 'Пионы из соседнего двора.', 'followers']])
    v.push(await step('vesta photo ' + pic, () => publish('vesta', { body, pic, audience: aud })));
  await step('vesta albums', async () => {
    const me = await pid('vesta');
    let albums = (await api(email('vesta'), 'album.list', { profileId: me })).items ?? [];
    for (const [title] of [['Город и горы'], ['Для своих']]) if (!albums.some(a => a.title === title)) must(await api(email('vesta'), 'album.create', { opId: uuid7(), title }), 'album.create');
    albums = (await api(email('vesta'), 'album.list', { profileId: me })).items ?? [];
    const city = albums.find(a => a.title === 'Город и горы'), own = albums.find(a => a.title === 'Для своих');
    if (own && own.visibility !== 'followers') must(await api(email('vesta'), 'album.update', { opId: uuid7(), albumId: own.id, visibility: 'followers', confirm: true }), 'album followers');
    for (const [i, a] of [[0, city], [1, city], [2, city], [3, city], [4, own], [5, own]]) if (v[i] && a) await api(email('vesta'), 'post.setAlbum', { opId: uuid7(), postId: v[i], albumId: a.id, confirm: true });
  });
  // Mira's album.
  await step('mira album', async () => {
    const me = await pid('mira');
    let albums = (await api(email('mira'), 'album.list', { profileId: me })).items ?? [];
    if (!albums.some(a => a.title === 'Берлин')) must(await api(email('mira'), 'album.create', { opId: uuid7(), title: 'Берлин' }), 'album');
    albums = (await api(email('mira'), 'album.list', { profileId: me })).items ?? [];
    const a = albums.find(x => x.title === 'Берлин');
    for (const p of [m1, m2]) if (p && a) await api(email('mira'), 'post.setAlbum', { opId: uuid7(), postId: p, albumId: a.id });
  });
  // Photo tags: Vesta tags Mira (Mira approves), Daniel tags Kira (left waiting).
  await step('tag vesta→mira', async () => {
    const id = await publish('vesta', { body: 'Съёмка с @mira.vey в старом городе — руки, кружево и свет.', pic: 'lace', tags: [await pid('mira')] });
    await sleep(2000);
    await api(email('mira'), 'tag.answer', { opId: uuid7(), postId: id, answer: 'ok' });
  });
  await step('tag daniel→kira', async () => publish('daniel', { body: 'Готовые манжеты для @kira.night — забирай в субботу!', pic: 'leather2', tags: [await pid('kira')] }));
  // Others: text posts, a poll, a question with replies, spam from Vlad.
  const t1 = await step('timur post', () => publish('timur', { body: 'Набираю двух новых участников в клуб. Вопрос для вступления — в карточке сообщества.', topics: ['protocol'] }));
  const t2 = await step('daniel photo', () => publish('daniel', { body: 'Ремень из итальянской кожи, ручная прошивка. Делаю на заказ.', pic: 'belt', topics: ['leather'] }));
  const t3 = await step('katya poll', () => publish('katya', { body: 'Берлинцы, выбираем место для следующей встречи!', poll: { question: 'Где собираемся?', options: ['Кройцберг', 'Нойкёльн', 'Фридрихсхайн'] } }));
  const t4 = await step('zhenya post', () => publish('zhenya', { body: 'Первый пост. Долго читала молча, решила поздороваться. Привет всем!' }));
  const t5 = await step('nastya question', () => publish('nastya', { body: 'Как вы объясняете близким, чем занимаетесь в сообществе? Или не объясняете?', topics: ['talk'] }));
  const t6 = await step('egor post', () => publish('egor', { body: 'Ереван, осень, вино в Арени. Кто будет в Армении в ноябре — давайте встретимся.', pic: 'wine' }));
  const t7 = await step('yana post', () => publish('yana', { body: 'Сегодня впервые сходила на открытую лекцию. Страшно, но очень интересно!' }));
  const t8 = await step('vlad spam', () => publish('vlad', { body: 'СКИДКИ 70% на аксессуары!!! Пиши в личку, отправлю каталог, только сегодня!!!' }));
  const t9 = await step('liza post', () => publish('liza', { body: 'Сохранила себе все анонсы на ноябрь — будет насыщенно.' }));
  const t10 = await step('oleg photo', () => publish('oleg', { body: 'Вечер в Амстердаме: каналы, снег и тишина.', pic: 'canal' }));
  await step('couple nord post', async () => { const c = await coupleOf('sasha'); if (c) await publish('sasha', { profile: c.id, body: 'Мы вернулись из Лейпцига! Вечеринка была волшебной, дресс-код — бархат. Спасибо организаторам.', pic: 'velvet' }); });
  await step('couple nord poll', async () => { const c = await coupleOf('nika'); if (c) await publish('nika', { profile: c.id, body: 'Пары, как вы решаете, что публиковать от общего профиля?', poll: { question: 'Как договариваетесь?', options: ['Каждый пост вдвоём', 'Доверяем друг другу', 'Отдельные профили для личного'] } }); });
  // Replies with nested answers, mentions in replies.
  if (m4) await step('thread m4', () => thread(m4, [['kira', 'Очень откликается про «нормально передумать». Спасибо!'], ['mira', 'Спасибо, Кира! Твоя статья про согласие меня тогда очень поддержала.', 1], ['lev', 'Рад, что вечер тогда не стал последним :)'], ['nastya', 'Сохранила себе. @kira.night, а вы будете продолжать тему?'], ['kira', 'Да, на онлайн-разговоре через неделю!', 4]]));
  if (l1) await step('thread l1', () => thread(l1, [['stas', 'А какие ножницы посоветуете?'], ['lev', 'Любые медицинские с тупым концом, продаются в аптеках.', 1], ['liza', 'Ещё важно — держать их всегда в одном и том же месте.']]));
  if (t5) await step('thread t5', () => thread(t5, [['zhenya', 'Я не объясняю, это моё личное.'], ['egor', 'Партнёрке рассказал всё, остальным — нет.'], ['kira', 'Мне помогло сказать маме, что это «клуб по интересам» :)']]));
  if (m3) await step('thread m3', () => thread(m3, [['katya', 'Голосую за переписку — так спокойнее.']]));
  if (t4) await step('thread t4', () => thread(t4, [['kira', 'Привет, Женя! Рады тебе.'], ['mira', 'Добро пожаловать!']]));
  // Poll votes.
  const vote = async (who, post, option) => post && step(`vote ${who}`, async () => { await api(email(who), 'poll.vote', { opId: uuid7(), postId: post, option }); });
  for (const [w, o] of [['kira', 0], ['katya', 0], ['lev', 2], ['liza', 1], ['zhenya', 3], ['nastya', 0], ['daniel', 1], ['vesta', 2]]) await vote(w, m3, o);
  for (const [w, o] of [['mira', 0], ['daniel', 1], ['vesta', 0], ['nika', 2]]) await vote(w, t3, o);
  // Likes.
  const likes = [[m1, ['lev', 'kira', 'vesta', 'daniel', 'katya', 'liza', 'yana', 'egor', 'artem']], [m4, ['kira', 'lev', 'nastya', 'zhenya', 'liza', 'timur', 'vesta']], [l1, ['mira', 'stas', 'liza', 'timur', 'nastya']],
    [l2, ['mira', 'liza']], [k1, ['mira', 'nastya', 'zhenya', 'daniel', 'vesta', 'marta']], [t2, ['mira', 'vesta']], [t4, ['kira', 'mira', 'nastya']], [t6, ['vesta']], [t7, ['mira', 'lev']], [t10, ['alisa']], [v[0], ['mira', 'kira', 'daniel', 'katya']], [v[3], ['egor', 'lev']]];
  for (const [post, who] of likes) if (post) for (const w of who) await step(`like ${w}`, () => like(w, post));
  // Saved posts.
  for (const [who, post] of [['liza', l1], ['nastya', k1], ['mira', k1], ['zhenya', m4]]) if (post) await step('save', async () => { await api(email(who), 'saved.set', { opId: uuid7(), kind: 'post', targetId: post, on: true }); });
  void t1; void t8; void t9; void m5;
}

// ---------------------------------------------------------------- phase: variety (every list and counter in many sizes)
// Owner, 28.10.2026: «мало тестовых данных с разным кол-вом всего». Bursts the «Подписки» feed folds into one card
// (likes of 8–20 posts, a dozen follows, events and communities within hours), followers 0 / 1 / ~5 / 20+, posts with
// 0 / 1 / many replies and likes, a poll with 20+ votes, communities of 1 / 5 / 20+ members, an event with 20+ «иду»,
// a long article next to a two-word post, profiles with one photo and with several. Max (empty states), Sonya
// (unfinished sign-up) and Vlad (blocked spammer) stay out of it.
const ACTORS = CAST.filter(c => !['sonya', 'max', 'vlad'].includes(c.key)).map(c => c.key);
const MORE_FOLLOWS = {
  // Mira gets 20+ followers; Stas exactly one (Liza); Den and Max keep none.
  alisa: ['mira'], gleb: ['mira'], olya: ['mira'], roman: ['mira'], eva: ['mira'], ilya: ['mira'], marta: ['mira'], stas: ['mira'], den: ['mira'],
  liza: ['stas'],
  // Vesta follows eleven more people at once — a «теперь следит за 11 людьми» card for Mira, Kira and Daniel.
  vesta: ['lev', 'timur', 'alisa', 'katya', 'egor', 'liza', 'nastya', 'yana', 'oleg', 'zhenya', 'olya'],
  // Mira follows a few more, so her «Подписки» has more people in it.
  mira: ['timur', 'liza', 'egor', 'nastya'],
};
/** Who likes many posts in one sitting (the newest posts of others first): Mira sees Lev, Kira, Daniel, Liza, Egor; Lev and Timur see Mira. */
const MASS_LIKES = { lev: 15, kira: 12, daniel: 8, mira: 10, liza: 20, egor: 14 };
const LONG_NOTE = ['Этот текст я писала почти месяц. Он длинный, потому что короче не получилось: про то, как я училась говорить «нет» и почему это оказалось важнее, чем научиться говорить «да».',
  '**Откуда всё началось.** Первые полгода в сообществе я соглашалась почти на всё. Не потому что хотела, а потому что боялась показаться скучной, неопытной, «не своей». Мне казалось, что отказ — это конец разговора и, может быть, конец знакомства.',
  'Потом был вечер, после которого я неделю не могла объяснить себе, что пошло не так. Формально всё было по правилам: меня спросили, я кивнула. Но кивнула я не человеку, а своему страху.',
  '**Что изменилось.** Я начала с малого — с «давай не сегодня» в переписке. Оказалось, что почти никто не обижается. Те, кто обижался, сами быстро исчезали, и это тоже было ответом.',
  '- Я перестала объяснять каждый отказ. «Нет» — это законченное предложение.\n- Я завела заметку со своими «да», «может быть» и «нет» и перечитываю её перед встречами.\n- Я договариваюсь о паузе заранее: слово, жест, просто «стоп, мне нужна минута».\n- Я разрешила себе передумывать посреди процесса.',
  '> Согласие, которое нельзя забрать, — это не согласие, а обещание. А обещания под давлением ничего не стоят.',
  '**Что говорят другие.** Я спросила десяток знакомых, как они учились отказывать. Почти все вспомнили один и тот же момент: когда их «нет» впервые спокойно приняли. После этого становилось легче — и говорить, и слышать.',
  'Ещё одно наблюдение: умение отказывать сделало мои «да» честнее. Теперь, когда я соглашаюсь, я правда этого хочу, и партнёры это чувствуют. Встречи стали спокойнее, разговоры — длиннее, а афтеркер — теплее.',
  '**Если ты сейчас там, где была я.** Попробуй начать с одного отказа в неделю — в чём угодно, не обязательно в практике. Отказаться от второй чашки кофе, от звонка в неудобное время, от встречи, на которую не хочется идти. Это мышца, и её можно тренировать.',
  'И помни: человек, которому важно твоё согласие, будет рад твоему «нет» не меньше, чем «да». Потому что «нет» значит, что ты ему доверяешь достаточно, чтобы говорить правду.',
  'Спасибо всем, кто дочитал. Если хочется обсудить — пишите в ответах или приходите на онлайн-разговор у @kira.night.'].join('\n\n');
const KNOTS = [['lev', 'Одноколонный, конечно. С него начинают все мои ученики.'], ['liza', 'Двухколонный — до сих пор путаюсь в направлении.'], ['timur', 'Беседочный, ещё в походах.'],
  ['stas', 'Пока ни одного не выучил, только смотрю видео.'], ['nastya', 'Одноколонный, на курсе у Льва.'], ['zhenya', 'Шнурки считаются? :)'], ['egor', 'Восьмёрку — со скалолазания.'],
  ['katya', 'Кажется, тоже одноколонный.'], ['daniel', 'Я больше по ремням и пряжкам, но одноколонный знаю.'], ['vesta', 'Не вяжу, только фотографирую узлы.'],
  ['yana', 'Пока никакой, но очень хочу научиться!'], ['kira', 'Двойную петлю, по книжке.'], ['oleg', 'Морские узлы — в яхт-клубе.'], ['alisa', 'Одноколонный, давным-давно.'],
  ['gleb', 'Мы с Олей учились вместе, по видео.'], ['marta', 'Ещё не пробовала.'], ['mira', 'Спасибо всем! Как много разных историй.', 1], ['lev', '@stas.d, приходи на открытый вечер — покажу.', 4]];
async function eventByTitle(host, title) {
  return ((await api(email(host), 'event.mine', {})).organizing ?? []).find(x => x.title === title && x.state !== 'withdrawn') ?? null;
}
async function variety() {
  // Follows, including Vesta's burst.
  for (const [a, list] of Object.entries(MORE_FOLLOWS)) for (const b of list)
    await step(`follow ${a}→${b}`, async () => must(await api(email(a), 'follow.set', { opId: uuid7(), profileId: await pid(b), on: true }), 'follow'));

  // New posts: six photos, a two-word post, a long article, a post with exactly one reply and one like, many replies, a poll with many votes.
  const series = await step('vesta six photos', () => publish('vesta', { body: 'Серия «Фактуры»: шесть кадров за неделю — кожа, кружево, верёвка, бархат, мастерская, ремень.', pics: ['leather', 'lace', 'rope', 'velvet', 'workshop', 'belt'], topics: ['exhibition'] }));
  await step('stas short', () => publish('stas', { body: 'Иду учиться.' }));
  await step('nastya long article', () => publish('nastya', { type: 'note', title: 'Как я училась говорить «нет»', topics: ['talk'], body: LONG_NOTE }));
  const one = await step('marta one reply', () => publish('marta', { body: 'Посоветуйте фильм на среду — что-нибудь тёплое и без спешки.' }));
  if (one) { await step('marta reply', () => thread(one, [['ilya', '«Перед рассветом». Проверено :)']])); await step('marta like', () => like('ilya', one)); }
  const knots = await step('mira many replies', () => publish('mira', { body: 'Какой узел вы выучили первым? Расскажите в ответах — соберу всё в одну памятку для новичков.', topics: ['shibari'] }));
  if (knots) await step('thread knots', () => thread(knots, KNOTS));
  const poll = await step('lev big poll', () => publish('lev', { body: 'Планирую вечера на зиму. Какой формат вам ближе? Голосуйте, даже если редко приходите.',
    poll: { question: 'Какой формат вечера вам ближе?', options: ['Открытый вечер для всех', 'Практика в парах', 'Лекция и вопросы', 'Онлайн-разбор'] } }));
  if (poll) for (const [i, w] of ACTORS.filter(k => k !== 'lev').entries()) await step(`vote ${w} big poll`, async () => { await api(email(w), 'poll.vote', { opId: uuid7(), postId: poll, option: [0, 0, 1, 2, 0, 3, 1, 0, 2][i % 9] }); });
  // The six-photo series: liked by nearly everyone (20+), the knots question by about half.
  if (series) for (const w of ACTORS.filter(k => k !== 'vesta')) await step(`like ${w} series`, () => like(w, series));
  if (knots) for (const w of ACTORS.filter((k, i) => k !== 'mira' && i % 2 === 0)) await step(`like ${w} knots`, () => like(w, knots));

  // Mass likes: each liker likes the newest posts of others it may see, in one sitting.
  for (const [who, n] of Object.entries(MASS_LIKES)) await step(`mass likes ${who}`, async () => {
    const me = await pid(who);
    const feed = (await api(email(who), 'feed.list', { tab: 'forYou', limit: 50 })).items ?? [];
    for (const p of feed.filter(x => x.author?.id !== me).slice(0, n)) if (!p.liked) await like(who, p.id);
  });

  // Communities: «Верёвка и чай» grows past 20; the book club reaches 5; a new open community keeps only its host (1).
  const rope = await communityByName('lev', 'Верёвка и чай'), books = await communityByName('kira', 'Книжный клуб: о близости');
  const join = async (who, c, listed) => {
    const r = await api(email(who), 'community.join', { opId: uuid7(), communityId: c.id, rulesAccepted: true, answer: '' });
    if (r.status !== 409) must(r, 'join');
    if (listed) await api(email(who), 'community.self', { opId: uuid7(), communityId: c.id, listed: true });
  };
  if (rope) for (const w of ['gleb', 'olya', 'roman', 'eva', 'ilya', 'marta', 'den', 'oleg', 'alisa', 'artem', 'sasha', 'nika', 'daniel', 'kira'])
    await step(`join ${w}→rope`, () => join(w, rope, ['daniel', 'kira', 'oleg', 'alisa'].includes(w)));
  if (books) for (const w of ['daniel', 'katya']) await step(`join ${w}→books`, () => join(w, books, w === 'daniel'));
  await step('community of one', async () => {
    let c = await communityByName('daniel', 'Кожа и ремесло');
    if (!c) c = { id: must(await api(email('daniel'), 'community.create', { opId: uuid7(), name: 'Кожа и ремесло', privacy: 'open',
      description: 'Для тех, кто работает с кожей руками: инструменты, выкройки, уход. Только открылось — пока здесь один ведущий.',
      topics: ['leather'], rules: ['Показываем свои работы', 'Без рекламы'], plate: 'coal', placeId: null, coverAssetId: null }), 'community.create').id };
    const full = (await api(email('daniel'), 'community.get', { communityId: c.id })).community;
    if (full.state !== 'published' || full.pendingChange) await approveCommunity(c.id);
  });

  // Events: «Вечер шибари» gets 20+ «иду»; Daniel plans three events at once (an «в планах 3 события» card).
  const night = await eventByTitle('lev', 'Вечер шибари для начинающих');
  if (night) for (const w of ['gleb', 'olya', 'ilya', 'marta', 'den', 'oleg', 'alisa', 'artem', 'sasha', 'nika', 'roman', 'eva', 'kira', 'daniel', 'vesta', 'egor'])
    await step(`rsvp ${w} going rope-night`, async () => must(await api(email(w), 'event.rsvp', { opId: uuid7(), eventId: night.id, status: 'going', showInList: true }), 'rsvp'));
  for (const [host, title, status] of [['kira', 'Онлайн-разговор: границы и согласие', 'interested'], ['lev', 'Онлайн-воркшоп: афтеркер после практик', 'going']]) {
    const ev = await eventByTitle(host, title);
    if (ev) await step(`rsvp daniel ${title}`, async () => must(await api(email('daniel'), 'event.rsvp', { opId: uuid7(), eventId: ev.id, status, showInList: true }), 'rsvp'));
  }

  // Profile photos: Mira and Vesta show several (their face + photos of their public posts); everyone else one or none.
  for (const key of ['mira', 'vesta']) await step(`profile photos ${key}`, async () => {
    const me = await pid(key);
    const prof = (await api(email(key), 'profile.get', { profileId: me })).profile;
    const have = prof?.photos ?? [];
    if (have.length >= 4) return;
    const own = (await api(email(key), 'me.posts', {})).items ?? [];
    const extra = [];
    for (const p of own.filter(x => x.state === 'published' && (x.audience ?? 'all') === 'all')) {
      const full = (await api(email(key), 'post.get', { postId: p.id })).post;
      for (const m of full?.media ?? []) if (extra.length < 5 - have.length && m.kind !== 'video' && !have.some(h => h.id === m.id)) extra.push(m.id);
    }
    must(await api(email(key), 'profile.photosSet', { opId: uuid7(), assetIds: [...have.map(x => x.id), ...extra] }), 'photosSet ' + key);
  });
}

/** Counts behind the variety phase, read back through the app. */
async function varietyVerify() {
  const out = {};
  for (const k of ['mira', 'kira', 'timur', 'stas', 'den', 'max']) out[`followers ${k}`] = ((await api(email('lev'), 'profile.followers', { profileId: await pid(k) })).items ?? []).length;
  out['vesta follows'] = ((await api(email('lev'), 'profile.followers', { profileId: await pid('vesta'), following: true })).items ?? []).length;
  for (const k of ['mira', 'vesta', 'lev']) out[`profile photos ${k}`] = ((await api(email(k), 'profile.get', { profileId: await pid(k) })).profile?.photos ?? []).length;
  const posts = (await api(email('lev'), 'feed.list', { tab: 'forYou', limit: 50 })).items ?? [];
  const find = start => posts.find(p => (p.body ?? '').startsWith(start));
  for (const [label, start] of [['six photos', 'Серия «Фактуры»'], ['two words', 'Иду учиться'], ['one reply', 'Посоветуйте фильм'], ['many replies', 'Какой узел'], ['big poll', 'Планирую вечера']]) {
    const p = find(start);
    out[`post «${label}»`] = p ? `photos ${p.media?.length ?? 0}, likes ${p.likes}, replies ${p.replies}${p.poll ? `, votes ${(p.poll.results ?? []).reduce((a, b) => a + b, 0)}` : ''}` : 'missing';
  }
  const note = posts.find(p => p.title === 'Как я училась говорить «нет»');
  out['long article length'] = note ? note.body.length : 'missing';
  for (const [host, name] of [['lev', 'Верёвка и чай'], ['kira', 'Книжный клуб: о близости'], ['daniel', 'Кожа и ремесло'], ['vesta', 'Фото и эстетика']]) {
    const c = await communityByName(host, name);
    out[`members «${name}»`] = c ? ((await api(email(host), 'community.members', { communityId: c.id })).items ?? []).length : 'missing';
  }
  const night = await eventByTitle('lev', 'Вечер шибари для начинающих');
  if (night) out['«Вечер шибари» going'] = ((await api(email('lev'), 'event.attendees', { eventId: night.id, kind: 'going' })).items ?? []).length;
  for (const viewer of ['mira', 'timur', 'kira']) {
    const items = [];
    let cursor;
    for (let i = 0; i < 4; i++) {
      const r = await api(email(viewer), 'feed.list', { tab: 'following', activity: ['likes', 'events', 'communities', 'follows'], limit: 50, ...(cursor ? { cursor } : {}) });
      items.push(...(r.items ?? [])); cursor = r.next; if (!cursor) break;
    }
    out[`«Подписки» of ${viewer}`] = items.filter(x => x.kind === 'activity').map(x => `${x.actor?.handle} ${x.activity} ${x.count}/${x.items.length}`).join('; ');
  }
  return out;
}

// ---------------------------------------------------------------- phase: following («Подписки» from several viewers)
// Owner, 28.10.2026: «Подписки из v21 — нужны тестовые данные разные». Activity shows only from people the viewer
// follows, and one person's actions of one kind with no pause over 6 hours fold into one card — so every size comes
// from its own person: likes 1 (gleb, roman: the six-photo series only), 3 (timur), 8 (sasha: photo, video, poll,
// interests, text, article mixed), 20+ (liza); follows 1 (roman), 5 (gleb), 15 (vesta); events 1 (kira / vesta / timur),
// 3 (daniel); communities 1 (timur / vesta), 3 (daniel). Mira, Lev and Kira follow all of them, so each of their
// «Подписки» shows every kind and size between posts of the people they follow. Mira mutes Egor's activity («Не
// показывать активность»): his posts stay, his cards go. A rerun only adds what is missing; a size grows only if the
// same person acts again within 6 hours of the last run (the phase never likes or follows beyond its lists).
const SUBS_VIEWERS = ['mira', 'lev', 'kira'];
const SUBS_PRODUCERS = ['gleb', 'roman', 'timur', 'sasha', 'liza', 'vesta', 'daniel'];
/** Gleb follows four more (5 in all); Vesta one more (15 in all); Roman keeps his one (Mira). */
const SUBS_FOLLOWS = { gleb: ['lev', 'kira', 'vesta', 'timur'], vesta: ['sasha'] };
/** What Sasha likes besides the six-photo series (8 in all), found by the start of the text. */
const SASHA_LIKES = ['Короткое видео: свет на воде', 'Вопрос к тем, кто ходит на вечера', 'Обновила карту интересов', 'Иду учиться.',
  'Вечер в Амстердаме: каналы', 'Планирую вечера на зиму', '@title:Безопасность в шибари: пять правил'];

/** A six-second abstract clip (soft light moving over water, drawn on a canvas and recorded by Chromium's
 * MediaRecorder — made by this script, no people, no third-party footage) and its first frame as the poster. */
async function clip() {
  const vf = CACHE + 'clip.webm', pf = CACHE + 'clip-poster.jpg';
  if (!fs.existsSync(vf) || !fs.existsSync(pf)) {
    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const [v, p] = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 540; c.height = 720; const g = c.getContext('2d');
        const draw = f => {
          const sky = g.createLinearGradient(0, 0, 0, 720); sky.addColorStop(0, '#1b2a4a'); sky.addColorStop(1, '#0b3d4f'); g.fillStyle = sky; g.fillRect(0, 0, 540, 720);
          for (let i = 0; i < 9; i++) {
            const x = 270 + Math.sin(f / 30 + i) * 200, y = 120 + i * 70 + Math.cos(f / 22 + i * 2) * 18;
            const r = g.createRadialGradient(x, y, 4, x, y, 120); r.addColorStop(0, `hsla(${30 + i * 8},90%,70%,.55)`); r.addColorStop(1, 'hsla(200,80%,40%,0)');
            g.fillStyle = r; g.fillRect(0, 0, 540, 720);
          }
        };
        const b64 = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
        draw(0); const poster = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
        const rec = new MediaRecorder(c.captureStream(24), { mimeType: 'video/webm' }); const parts = [];
        rec.ondataavailable = e => parts.push(e.data);
        let f = 0; const iv = setInterval(() => draw(f++), 40);
        rec.start(250); await new Promise(r => setTimeout(r, 6100)); rec.stop(); clearInterval(iv); await new Promise(r => { rec.onstop = r; });
        return [await b64(new Blob(parts, { type: 'video/webm' })), await b64(poster)];
      });
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(vf, Buffer.from(v, 'base64')); fs.writeFileSync(pf, Buffer.from(p, 'base64'));
    } finally { await browser.close(); }
  }
  return { video: fs.readFileSync(vf), poster: fs.readFileSync(pf), durationMs: 6000 };
}
/** Uploads a clip as the composer does (intent with length and poster → two PUTs → commit); staff approves it. */
async function uploadVideo(key, c, { approve = true } = {}) {
  const i = await api(email(key), 'media.uploadIntent', { opId: uuid7(), purpose: 'post', kind: 'video', mime: c.mime ?? 'video/webm', bytes: c.video.length, durationMs: c.durationMs,
    poster: { mime: 'image/jpeg', bytes: c.poster.length } });
  if (!i.assetId || !i.posterUpload) throw new Error('uploadIntent video ' + JSON.stringify(i).slice(0, 200));
  for (const [u, b] of [[i.upload, c.video], [i.posterUpload, c.poster]]) {
    const put = await fetch(u.url, { method: u.method, headers: u.headers, body: b });
    if (!put.ok) throw new Error('upload PUT ' + put.status);
  }
  must(await api(email(key), 'media.commit', { assetId: i.assetId }), 'commit video');
  if (approve) await approveAsset(i.assetId);
  return i.assetId;
}
const follow = async (a, b) => must(await api(email(a), 'follow.set', { opId: uuid7(), profileId: await pid(b), on: true }), `follow ${a}→${b}`);

async function following() {
  // The viewers follow every producer (posts of these people then sit between the cards too).
  for (const v of SUBS_VIEWERS) for (const p of SUBS_PRODUCERS) if (p !== v) await step(`follow ${v}→${p}`, () => follow(v, p));
  // A video post from Vesta (followed by all three viewers): the video thumbnail in Sasha's likes.
  const video = await step('vesta video', async () => {
    const body = 'Короткое видео: свет на воде в Батуми, шесть секунд тишины.';
    const have = (await postsOf('vesta')).find(x => (x.body ?? '').startsWith(body.slice(0, 30)));
    if (have) return have.id;
    const assetId = await uploadVideo('vesta', await clip());
    const d = must(await api(email('vesta'), 'post.saveDraft', { opId: uuid7(), post: { type: 'post', audience: 'all', topics: [], body, mediaIds: [assetId] } }), 'saveDraft video');
    const id = d.id ?? d.postId;
    must(await api(email('vesta'), 'post.publish', { opId: uuid7(), postId: id }), 'publish video');
    (await postsOf('vesta')).push({ id, body });
    return id;
  });
  // Follows in three sizes.
  for (const [a, list] of Object.entries(SUBS_FOLLOWS)) for (const b of list) await step(`follow ${a}→${b}`, () => follow(a, b));
  // Sasha likes eight posts of different kinds in one sitting.
  await step('sasha likes', async () => {
    const feed = [];
    let cursor;
    for (let i = 0; i < 4; i++) { const r = await api(email('sasha'), 'feed.list', { tab: 'forYou', limit: 50, ...(cursor ? { cursor } : {}) }); feed.push(...(r.items ?? [])); cursor = r.next; if (!cursor) break; }
    for (const start of SASHA_LIKES) {
      const p = start.startsWith('@title:') ? feed.find(x => x.title === start.slice(7)) : feed.find(x => (x.body ?? '').startsWith(start));
      if (!p) { if (start.startsWith('Короткое видео') && video) await like('sasha', video); else problems.push('sasha like: no post «' + start + '»'); continue; }
      if (!p.liked) await like('sasha', p.id);
    }
  });
  // Mira mutes Egor's activity: his posts stay in her «Подписки», his cards do not.
  await step('mira mutes egor activity', async () => must(await api(email('mira'), 'activity.mute', { opId: uuid7(), profileId: await pid('egor'), on: true }), 'activity.mute'));
}

/** Every activity kind and size each viewer's «Подписки» shows, read back as the app reads it. */
async function followingVerify() {
  const out = {}; const want = { likes: [1, 3, 8, 20], follows: [1, 5, 15], events: [1, 3], communities: [1, 3] };
  for (const v of SUBS_VIEWERS) {
    const items = []; let cursor;
    for (let i = 0; i < 8; i++) {
      const r = await api(email(v), 'feed.list', { tab: 'following', activity: [], limit: 50, ...(cursor ? { cursor } : {}) });
      items.push(...(r.items ?? [])); cursor = r.next; if (!cursor) break;
    }
    const acts = items.filter(x => x.kind === 'activity');
    const sizes = {};
    for (const a of acts) (sizes[a.activity] ??= []).push(`${a.actor?.handle} ${a.count}`);
    const missing = Object.entries(want).flatMap(([k, ns]) => ns.filter(n => !acts.some(a => a.activity === k && (n === 20 ? a.count >= 20 : a.count === n))).map(n => `${k} ${n === 20 ? '20+' : n}`));
    const sasha = acts.find(a => a.activity === 'likes' && a.actor?.handle === P.sasha.handle);
    const kindsOf = x => x.video ? 'video' : x.photos ? 'photo' : x.poll ? 'poll' : x.interests ? 'interests' : x.title ? 'article' : 'text';
    out[`«Подписки» of ${v}`] = { posts: items.length - acts.length, cards: acts.length, ...sizes, missing: missing.length ? missing : 'none',
      ...(sasha ? { 'sasha liked': sasha.items.map(kindsOf).join(', ') } : {}),
      ...(v === 'mira' ? { 'egor (muted)': `cards ${acts.filter(a => a.actor?.handle === P.egor.handle).length}, posts ${items.filter(x => x.kind === 'post' && x.author?.handle === P.egor.handle).length}` } : {}) };
  }
  return out;
}

// ---------------------------------------------------------------- phase: video (clips and photo + video posts)
// Owner, 28.10.2026: «Видео не хватает в тестовых данных везде. В подписках тоже. Нужны посты которые и с фото и с
// видео». Sixteen people post short clips; nine posts mix photos and clips (2–5 files, a clip first in some, a photo
// first in others), one has two clips. Every clip is made here from the same stock pictures the posts use (e2e/world-media.json): a
// slow pan or zoom over one to three pictures, cuts or crossfades, a little hand shake and exposure drift as from a
// phone. They are drawn on a canvas and recorded by Chrome's MediaRecorder as H.264 MP4 (WebM when only Playwright's
// Chromium is there), with no sound; nothing is downloaded. Clips are cached in e2e/.world-cache/clips/. Vertical
// 9:16 mostly, a few 16:9. The posts are found again by the start of the text, so a rerun only adds what is missing.
// Likes come from people the three viewers follow (Liza, Daniel, Vesta, and Mira / Lev / Kira for each other), so
// their «Подписки» get like cards with clip thumbnails; Timur, Gleb, Roman and Sasha do not like (their card sizes
// stay as the following phase built them).
const V = [540, 960], H = [960, 540];
/** name → { size, shots: [pic, seconds, from [cx, cy, zoom], to [cx, cy, zoom]][], fade (s, 0 = cut) } */
export const CLIPS = {
  'mira-morning': { size: V, fade: 0.8, shots: [['coffee', 6, [0.35, 0.5, 1], [0.55, 0.5, 1.12]], ['flowers', 6, [0.5, 0.45, 1.15], [0.5, 0.5, 1]]] },
  'mira-rain': { size: V, shots: [['rain', 9, [0.3, 0.5, 1], [0.7, 0.5, 1]]] },
  'lev-jute': { size: V, shots: [['rope2', 7, [0.5, 0.5, 1], [0.45, 0.55, 1.35]], ['rope', 7, [0.4, 0.5, 1.25], [0.6, 0.5, 1.05]]] },
  'lev-prep': { size: V, shots: [['candles', 8, [0.5, 0.5, 1], [0.5, 0.4, 1.2]]] },
  'kira-walk': { size: V, fade: 0.7, shots: [['rain', 5, [0.6, 0.5, 1.1], [0.4, 0.5, 1]], ['citynight', 6, [0.3, 0.5, 1], [0.6, 0.5, 1.1]]] },
  'kira-evening': { size: V, shots: [['neon', 7, [0.4, 0.5, 1], [0.6, 0.5, 1.15]]] },
  'kira-candle': { size: V, shots: [['candles', 6, [0.5, 0.55, 1.3], [0.5, 0.5, 1.05]]] },
  'timur-hall': { size: H, fade: 1, shots: [['books', 8, [0.35, 0.5, 1.25], [0.65, 0.45, 1.25]], ['wine', 7, [0.5, 0.5, 1], [0.5, 0.5, 1.2]]] },
  'timur-neon': { size: V, shots: [['neon2', 8, [0.3, 0.5, 1], [0.7, 0.5, 1]]] },
  'daniel-belt': { size: V, fade: 0.5, shots: [['workshop', 5, [0.3, 0.5, 1], [0.6, 0.5, 1.1]], ['leather', 5, [0.5, 0.5, 1.3], [0.5, 0.5, 1]], ['belt', 6, [0.6, 0.5, 1], [0.4, 0.5, 1]]] },
  'daniel-shop': { size: V, shots: [['workshop', 9, [0.7, 0.5, 1], [0.4, 0.6, 1.3]]] },
  'liza-tea': { size: V, fade: 0.6, shots: [['tea', 5, [0.5, 0.4, 1], [0.5, 0.55, 1.2]], ['candles', 4, [0.5, 0.5, 1.1], [0.5, 0.5, 1]]] },
  'liza-tea2': { size: V, shots: [['tea', 7, [0.5, 0.6, 1.3], [0.5, 0.45, 1]]] },
  'sasha-club': { size: V, shots: [['concert', 6, [0.2, 0.5, 1], [0.8, 0.5, 1]], ['neon2', 5, [0.5, 0.5, 1.2], [0.5, 0.5, 1]]] },
  'sasha-club2': { size: V, shots: [['concert', 7, [0.6, 0.5, 1], [0.4, 0.5, 1.25]]] },
  'roman-lake': { size: H, shots: [['mountains', 16, [0.35, 0.5, 1.3], [0.65, 0.5, 1.3]]] },
  'gleb-oolong': { size: V, fade: 0.8, shots: [['tea', 5, [0.5, 0.5, 1], [0.5, 0.6, 1.25]], ['coffee', 5, [0.4, 0.5, 1], [0.6, 0.5, 1.05]]] },
  'egor-areni': { size: H, fade: 1, shots: [['wine', 6, [0.4, 0.5, 1], [0.6, 0.5, 1.2]], ['autumn', 6, [0.5, 0.5, 1.2], [0.5, 0.5, 1]]] },
  'egor-autumn': { size: V, shots: [['autumn', 9, [0.3, 0.5, 1], [0.7, 0.5, 1]]] },
  'katya-night': { size: V, shots: [['neon2', 4.5, [0.6, 0.5, 1], [0.3, 0.5, 1.1]], ['concert', 4.5, [0.4, 0.5, 1], [0.6, 0.5, 1]]] },
  'katya-club': { size: V, shots: [['concert', 6, [0.5, 0.5, 1.3], [0.5, 0.5, 1]]] },
  'katya-neon': { size: V, shots: [['neon', 6, [0.7, 0.5, 1], [0.4, 0.5, 1]]] },
  'nastya-study': { size: V, fade: 0.8, shots: [['books', 6, [0.3, 0.5, 1], [0.6, 0.5, 1.1]], ['coffee', 6, [0.6, 0.5, 1.15], [0.4, 0.5, 1]]] },
  'oleg-canal': { size: H, fade: 1, shots: [['canal', 8, [0.5, 0.55, 1.3], [0.5, 0.5, 1]], ['citynight', 7, [0.4, 0.5, 1], [0.6, 0.5, 1.1]]] },
  'yana-forest': { size: V, shots: [['forest', 10, [0.5, 0.6, 1], [0.5, 0.45, 1.2]]] },
  'alisa-velvet': { size: V, fade: 0.8, shots: [['candles', 6, [0.5, 0.5, 1], [0.5, 0.45, 1.2]], ['leather', 6, [0.4, 0.5, 1], [0.6, 0.5, 1.1]]] },
  'vesta-mountains': { size: H, fade: 1, shots: [['mountains', 9, [0.6, 0.5, 1.25], [0.4, 0.5, 1.05]], ['forest', 6, [0.5, 0.5, 1.2], [0.5, 0.5, 1]]] },
  'vesta-fog': { size: V, shots: [['forest', 7, [0.4, 0.5, 1], [0.6, 0.5, 1.1]]] },
};
/** media: a stock picture key, or { clip } — in the order the post shows them. */
const VIDEO_POSTS = [
  // one clip
  ['mira', 'Субботнее утро: кофе остывает, пионы пахнут на всю кухню. Никуда не тороплюсь.', [{ clip: 'mira-morning' }], ['slow']],
  ['lev', 'Промасливаю новый джут: по метру, руками, без спешки. Двадцать минут медитации.', [{ clip: 'lev-jute' }], ['shibari']],
  ['kira', 'После дождя: сначала вид из окна, потом прогулка по мокрым улицам до ночи.', [{ clip: 'kira-walk' }]],
  ['timur', 'Нашли зал для клуба: библиотека, камин, кресла. Первый вечер — в пятницу.', [{ clip: 'timur-hall' }]],
  ['daniel', 'Как рождается ремень: заготовка, кожа, прошивка. Снял на телефон между заказами.', [{ clip: 'daniel-belt' }], ['leather']],
  ['sasha', 'Гамбург, пятница, свет в клубе. Звук не передать, поверьте на слово.', [{ clip: 'sasha-club' }]],
  ['roman', 'Выбрались в горы на выходные. Озеро как стекло, телефон не ловит — идеально.', [{ clip: 'roman-lake' }]],
  ['gleb', 'Новый улун. Заваривал пять минут, снимал полчаса.', [{ clip: 'gleb-oolong' }]],
  ['egor', 'Арени: дегустация в старом подвале, потом прогулка по осеннему склону.', [{ clip: 'egor-areni' }]],
  ['nastya', 'Сессия: библиотека, конспекты и третья чашка кофе за день.', [{ clip: 'nastya-study' }]],
  ['oleg', 'Амстердам, вечер, снег на каналах. Будто городу выключили звук.', [{ clip: 'oleg-canal' }]],
  ['yana', 'Утро в лесу перед йогой. Туман, тишина, дышится легко.', [{ clip: 'yana-forest' }]],
  ['alisa', 'Готовим «Чёрный бархат»: свечи, кожа, приглушённый свет. Ждём вас в субботу.', [{ clip: 'alisa-velvet' }]],
  ['katya', 'Берлин, без пятнадцати полночь, по дороге в клуб.', [{ clip: 'katya-night' }]],
  ['liza', 'Свечи зажжены, чайник закипает — через час придут гости.', [{ clip: 'liza-tea' }]],
  // photos and clips together
  ['mira', 'Берлин в ноябре: дождь, огни и кофейня, где меня уже знают по имени.', ['citynight', { clip: 'mira-rain' }, 'coffee']],
  ['vesta', 'Неделя в горах: пара видео и кадры на память. Возвращаться не хотелось.', [{ clip: 'vesta-mountains' }, 'autumn', 'forest', { clip: 'vesta-fog' }]],
  ['daniel', 'Мастерская изнутри: верстак, обрезки кожи и готовый браслет.', [{ clip: 'daniel-shop' }, 'leather', 'leather2'], ['leather']],
  ['lev', 'Готовим зал к вечеру для начинающих: верёвки разложены, свечи горят.', ['rope', { clip: 'lev-prep' }, 'rope2'], ['shibari']],
  ['kira', 'Белые ночи закончились, начались тёмные вечера. Собрала любимое за неделю.', [{ clip: 'kira-evening' }, 'books', 'tea', { clip: 'kira-candle' }, 'flowers']],
  ['timur', 'Пятничный вечер: сначала концерт, потом прогулка по ночному городу.', ['concert', { clip: 'timur-neon' }]],
  ['liza', 'Утро после вечера: доедаем печенье и пьём остывший чай.', [{ clip: 'liza-tea2' }, 'coffee']],
  ['egor', 'Осень в Армении: горы, листья и вино из Арени.', ['mountains', { clip: 'egor-autumn' }, 'wine']],
  ['katya', 'Два видео из вчерашнего клуба — свет был нереальный.', [{ clip: 'katya-club' }, { clip: 'katya-neon' }]],
  ['sasha', 'Гамбург ночью: улицы после дождя и немного клуба.', ['citynight', { clip: 'sasha-club2' }, 'neon2']],
];
/** Who likes the clip posts: people the viewers follow first (their like cards), then others for the counts. */
const VIDEO_LIKERS = ['liza', 'kira', 'mira', 'vesta', 'daniel', 'lev', 'katya', 'nastya', 'egor', 'yana', 'zhenya', 'oleg', 'alisa', 'stas', 'olya'];
const VIDEO_REPLIES = {
  'Промасливаю новый джут': [['liza', 'Можно я приду посмотреть, как ты это делаешь?'], ['lev', 'Приходи в четверг, как раз будет новая партия.', 1]],
  'Как рождается ремень': [['mira', 'Залипла на прошивку. Сколько уходит на один ремень?'], ['daniel', 'Часа три, если без украшений.', 1], ['vesta', 'Хочу такой же, только коричневый.']],
  'Белые ночи закончились': [['mira', 'Свеча в конце — прямо моё настроение.'], ['nastya', 'А где этот бар с неоном?']],
  'Неделя в горах': [['kira', 'Туман во втором видео — магия.'], ['vesta', 'Это было в семь утра, все ещё спали :)', 1]],
  'После дождя': [['lev', 'Красиво. Ночью город совсем другой.']],
};

/** Records the missing clips in Chrome (H.264 MP4) — or Playwright's Chromium (WebM) — and caches them. */
export async function makeClips(names) {
  const dir = CACHE + 'clips/';
  fs.mkdirSync(dir, { recursive: true });
  const meta = n => dir + n + '.json';
  const todo = names.filter(n => !fs.existsSync(meta(n)));
  if (todo.length) {
    const { chromium } = await import('playwright-core');
    let browser, mime = 'video/mp4;codecs=avc1.640028';
    try { browser = await chromium.launch({ headless: true, channel: 'chrome' }); } catch { browser = await chromium.launch({ headless: true }); }
    try {
      const probe = await browser.newPage();
      if (!(await probe.evaluate(m => MediaRecorder.isTypeSupported(m), mime))) mime = 'video/webm';
      await probe.close();
      const queue = [...todo];
      const worker = async () => {
        for (let n; (n = queue.shift());) {
          const spec = CLIPS[n];
          const imgs = {};
          for (const [pic] of spec.shots) imgs[pic] ??= 'data:image/jpeg;base64,' + (await stock(pic)).bytes.toString('base64');
          const page = await browser.newPage();
          try {
            const [v, p, ms] = await page.evaluate(renderClip, { spec, imgs, mime, seed: n.length * 7 + n.charCodeAt(0) });
            const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
            fs.writeFileSync(dir + n + '.' + ext, Buffer.from(v, 'base64'));
            fs.writeFileSync(dir + n + '.jpg', Buffer.from(p, 'base64'));
            fs.writeFileSync(meta(n), JSON.stringify({ file: n + '.' + ext, mime: ext === 'mp4' ? 'video/mp4' : 'video/webm', durationMs: ms, size: spec.size }));
            log('  clip', n, ext, Math.round(ms / 100) / 10 + ' s', Math.round(fs.statSync(dir + n + '.' + ext).size / 1024) + ' KB');
          } finally { await page.close(); }
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    } finally { await browser.close(); }
  }
  return Object.fromEntries(names.map(n => {
    const m = JSON.parse(fs.readFileSync(meta(n), 'utf8'));
    return [n, { video: fs.readFileSync(dir + m.file), poster: fs.readFileSync(dir + n + '.jpg'), durationMs: m.durationMs, mime: m.mime }];
  }));
}
/** Runs in the page: draws the shots in real time on a canvas and records it; returns [clip, poster, ms] (base64). */
async function renderClip({ spec, imgs, mime, seed }) {
  const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
  const pics = {}; for (const [k, src] of Object.entries(imgs)) pics[k] = await load(src);
  const [w, h] = spec.size, fade = spec.fade ?? 0;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  let acc = 0; const starts = spec.shots.map(s => { const a = acc; acc += s[1] - fade; return a; });
  const total = acc + fade;
  const ease = x => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
  // hand shake: a few slow sines (a phone held in the hand), and exposure that breathes a little
  const shake = t => ({ x: 4.5 * Math.sin(t * 1.1 + seed) + 2.2 * Math.sin(t * 2.7 + seed * 2) + 0.7 * Math.sin(t * 9.3 + seed * 3),
    y: 3.5 * Math.sin(t * 0.9 + seed * 4) + 1.8 * Math.sin(t * 3.1 + seed) + 0.6 * Math.sin(t * 8.1),
    r: 0.003 * Math.sin(t * 0.7 + seed) + 0.0012 * Math.sin(t * 2.3) });
  const draw = t => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const sh = shake(t);
    const focus = t < 0.6 ? (1 - t / 0.6) * 3 : 0; // the phone finds focus at the start
    g.filter = `brightness(${1 + 0.03 * Math.sin(t * 0.8 + seed)}) contrast(1.03) saturate(1.05)${focus ? ` blur(${focus.toFixed(2)}px)` : ''}`;
    spec.shots.forEach(([pic, len, from, to], i) => {
      const s0 = starts[i];
      if (t < s0 || t > s0 + len) return;
      const img = pics[pic], k = ease((t - s0) / len), lerp = (a, b) => a + (b - a) * k;
      const cx = lerp(from[0], to[0]), cy = lerp(from[1], to[1]), z = lerp(from[2], to[2]) * 1.06;
      const sc = Math.max(w / img.width, h / img.height) * z, dw = img.width * sc, dh = img.height * sc;
      const x = Math.min(0, Math.max(w - dw, w / 2 - cx * dw)), y = Math.min(0, Math.max(h - dh, h / 2 - cy * dh));
      g.save(); g.globalAlpha = fade && i > 0 ? Math.min(1, (t - s0) / fade) : 1;
      g.translate(w / 2, h / 2); g.rotate(sh.r); g.translate(-w / 2 + sh.x, -h / 2 + sh.y);
      g.drawImage(img, x, y, dw, dh); g.restore();
    });
    g.filter = 'none';
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  };
  const b64 = async blob => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
  draw(Math.min(1, total / 2)); const poster = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  draw(0);
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2_800_000 }); const parts = [];
  rec.ondataavailable = e => parts.push(e.data);
  rec.start(1000);
  const t0 = performance.now();
  await new Promise(done => { const iv = setInterval(() => { const t = (performance.now() - t0) / 1000; if (t >= total) { clearInterval(iv); done(); } else draw(t); }, 1000 / 30); });
  rec.stop(); await new Promise(r => { rec.onstop = r; });
  return [await b64(new Blob(parts, { type: mime.split(';')[0] })), await b64(poster), Math.round(total * 1000)];
}

async function video() {
  await staff();
  const clips = await makeClips(Object.keys(CLIPS));
  // Three posts at a time; each post's files are uploaded first and then wait for the scan and staff together.
  const ids = [], queue = [...VIDEO_POSTS.entries()];
  const worker = async () => { for (let q; (q = queue.shift());) { const [n, [key, body, media, topics = []]] = q;
    ids[n] = await step(`video post ${key} «${body.slice(0, 24)}»`, async () => {
      const have = (await postsOf(key)).find(x => (x.body ?? '').slice(0, 40) === body.slice(0, 40));
      if (have) return have.id;
      const mediaIds = [];
      for (const m of media) mediaIds.push(typeof m === 'string' ? await upload(key, 'post', await stock(m), { approve: false }) : await uploadVideo(key, clips[m.clip], { approve: false }));
      await Promise.all(mediaIds.map(approveAsset));
      const d = must(await api(email(key), 'post.saveDraft', { opId: uuid7(), post: { type: 'post', audience: 'all', topics, body, mediaIds } }), 'saveDraft');
      const id = d.id ?? d.postId;
      must(await api(email(key), 'post.publish', { opId: uuid7(), postId: id }), 'publish');
      (await postsOf(key)).push({ id, body });
      log('  posted', key, media.map(m => (typeof m === 'string' ? 'photo' : 'video')).join('+'));
      return id;
    });
  } };
  await Promise.all([worker(), worker(), worker()]);
  // 3–9 likes per post, rotating through the likers (never the author).
  for (const [i, id] of ids.entries()) {
    if (!id) continue;
    const author = VIDEO_POSTS[i][0];
    const who = [...VIDEO_LIKERS.slice(i % 5), ...VIDEO_LIKERS.slice(0, i % 5)].filter(k => k !== author).slice(0, 3 + (i * 5) % 7);
    for (const w of who) await step(`like ${w} video ${i}`, () => like(w, id));
  }
  for (const [start, replies] of Object.entries(VIDEO_REPLIES)) {
    const i = VIDEO_POSTS.findIndex(p => p[1].startsWith(start));
    if (ids[i]) await step('video thread ' + start, () => thread(ids[i], replies));
  }
}

/** Clip posts and photo + clip posts each viewer sees in «Подписки», «Для тебя» and «Популярное». */
async function videoVerify() {
  const out = {};
  for (const v of SUBS_VIEWERS) {
    for (const tab of ['following', 'forYou', 'popular']) {
      const items = []; let cursor;
      for (let i = 0; i < 8; i++) {
        const r = await api(email(v), 'feed.list', { tab, ...(tab === 'following' ? { activity: [] } : {}), limit: 50, ...(cursor ? { cursor } : {}) });
        items.push(...(r.items ?? [])); cursor = r.next; if (!cursor) break;
      }
      const posts = items.filter(x => x.kind !== 'activity' && x.media);
      const vid = posts.filter(x => x.media.some(m => m?.kind === 'video'));
      const mixed = vid.filter(x => x.media.some(m => m?.kind === 'image'));
      const row = { 'video posts': vid.length, mixed: mixed.length, authors: [...new Set(vid.map(x => x.author?.handle))].length };
      if (tab === 'following') {
        const cards = items.filter(x => x.kind === 'activity' && (x.items ?? []).some(y => y.video || y.videos > 0));
        row['like cards with a clip'] = cards.map(a => a.actor?.handle).join(', ') || 'none';
        if (!vid.length || !mixed.length || !cards.length) problems.push(`video verify: ${v} «Подписки» has ${vid.length} video, ${mixed.length} mixed, ${cards.length} cards with a clip`);
      } else if (tab === 'forYou' && (!vid.length || !mixed.length)) problems.push(`video verify: ${v} «Для тебя» has ${vid.length} video, ${mixed.length} mixed`);
      out[`${v} ${tab}`] = row;
    }
  }
  return out;
}

// ---------------------------------------------------------------- phase: access requests
async function access() {
  const req = async (from, to, scopes) => {
    const out = (await api(email(from), 'access.lists', { tab: 'out' })).items ?? [];
    const toId = await pid(to);
    const have = out.find(x => (x.profile?.id ?? x.profileId ?? x.other?.id) === toId);
    if (have) return have;
    const r = must(await api(email(from), 'access.request', { opId: uuid7(), profileId: toId, scopes }), `access.request ${from}→${to}`);
    return { id: r.id ?? r.requestId, state: 'pending', fresh: true };
  };
  const incoming = async to => (await api(email(to), 'access.lists', { tab: 'incoming' })).items ?? [];
  const findIn = async (to, from) => { const id = await pid(from); return (await incoming(to)).find(x => (x.profile?.id ?? x.profileId ?? x.from?.id) === id); };
  // pending: Настя → Мира, Лев → Кира
  await step('access nastya→mira pending', () => req('nastya', 'mira', ['info', 'photos']));
  await step('access lev→kira pending', () => req('lev', 'kira', ['info']));
  // granted with parts: Егор → Мира (text + photos, 30 days), Настя → Тимур (text)
  for (const [from, to, scopes, grant, term] of [['egor', 'mira', ['info', 'photos'], ['info', 'photos'], '30d'], ['nastya', 'timur', ['info'], ['info'], 'none'], ['katya', 'mira', ['info', 'photos'], ['info', 'photos'], '7d'], ['daniel', 'mira', ['info', 'photos'], ['info'], 'none'], ['mira', 'vesta', ['info', 'photos'], ['info', 'photos'], 'none']])
    await step(`access ${from}→${to} grant`, async () => {
      const r = await req(from, to, scopes);
      if (!r.fresh && r.state !== 'pending') return;
      const inc = await findIn(to, from);
      if (inc) must(await api(email(to), 'access.grant', { opId: uuid7(), requestId: inc.id, scopes: grant, term }), 'grant');
    });
  // narrowed: Мира narrows Катя to the text only; revoked: Мира revokes Даниил.
  await step('access narrow katya', async () => { await api(email('mira'), 'access.narrow', { opId: uuid7(), profileId: await pid('katya'), scopes: ['info'] }); });
  await step('access revoke daniel', async () => { await api(email('mira'), 'access.revoke', { opId: uuid7(), profileId: await pid('daniel') }); });
  // declined: Егор → Кира
  await step('access egor→kira decline', async () => {
    const r = await req('egor', 'kira', ['info']);
    if (!r.fresh && r.state !== 'pending') return;
    const inc = await findIn('kira', 'egor');
    if (inc) must(await api(email('kira'), 'access.decline', { opId: uuid7(), requestId: inc.id }), 'decline');
  });
}

// ---------------------------------------------------------------- phase: moderation (reports in the staff queue)
async function moderation() {
  const vladPosts = (await api(email('vlad'), 'me.posts', {})).items ?? [];
  const spam = vladPosts.find(p => p.body?.startsWith('СКИДКИ'));
  const done = JSON.parse(fs.existsSync(DIR + '.world-state.json') ? fs.readFileSync(DIR + '.world-state.json', 'utf8') : '{}');
  if (!done.reports) {
    if (spam) await step('report post', async () => must(await api(email('kira'), 'report.create', { opId: uuid7(), targetType: 'post', targetId: spam.id, reason: 'spam', details: 'Реклама в общей ленте, уже третий раз.' }), 'report post'));
    await step('report profile', async () => must(await api(email('liza'), 'report.create', { opId: uuid7(), targetType: 'profile', targetId: await pid('vlad'), reason: 'spam', details: 'Пишет всем подряд с предложением купить.' }), 'report profile'));
    await step('report reply', async () => {
      if (!spam) return;
      const r = must(await api(email('vlad'), 'reply.create', { opId: uuid7(), postId: spam.id, body: 'Пишите в телеграм, там дешевле!' }), 'reply');
      must(await api(email('zhenya'), 'report.create', { opId: uuid7(), targetType: 'reply', targetId: r.id ?? r.replyId, reason: 'spam', details: 'Ссылка на сторонний магазин в ответе.' }), 'report reply');
    });
    done.reports = true;
    fs.writeFileSync(DIR + '.world-state.json', JSON.stringify(done));
  }
  await step('premium grant (needs lead)', async () => {
    const r = await api(STAFF, 'staff.premiumGrant', { opId: uuid7(), handle: P.mira.handle, days: 90, reason: 'тестовый мир: аккаунт с Premium' });
    if (r.status >= 400) throw new Error(`staff.premiumGrant ${r.status} ${r.error ?? ''} ${r.rule ?? ''} — qa-staff has no lead role`);
  });
}

// ---------------------------------------------------------------- phase: verify (read back counts)
async function verify() {
  const out = {};
  const inc = (k, n = 1) => { out[k] = (out[k] ?? 0) + n; };
  for (const c of CAST) {
    const b = await boot(email(c.key));
    const person = b.profiles?.find(p => p.kind === 'person');
    if (!person) { inc('accounts without profile'); continue; }
    inc('accounts');
    if (!b.account?.onboarded) inc('onboarding not finished');
    if (person.avatar) inc('with approved avatar');
    const st = await api(email(c.key), 'verification.ageStatus');
    if (st.verified || st.ageVerified || st.state === 'approved') inc('age verified');
    const couple = b.profiles?.find(p => p.kind === 'couple');
    if (couple) inc(`member of a ${couple.state} couple`);
  }
  for (const k of ['mira', 'lev', 'kira', 'vesta', 'daniel', 'timur', 'katya', 'nastya', 'zhenya', 'egor', 'yana', 'vlad', 'liza', 'oleg']) {
    const items = (await api(email(k), 'me.posts', {})).items ?? [];
    inc('posts (persons, any state)', items.length);
    for (const p of items) { inc('posts state ' + (p.state ?? '?')); if (p.type === 'note') inc('articles'); if (p.poll) inc('polls'); }
  }
  for (const k of COMMUNITIES) { const c = await communityByName(k.host, k.name); if (c) inc(`communities ${k.privacy}${k.review ? ' (in review)' : ''}`); }
  for (const h of ['lev', 'kira', 'alisa', 'daniel', 'vesta', 'timur', 'katya', 'egor', 'nastya', 'oleg', 'mira', 'liza', 'roman']) {
    const mine = await api(email(h), 'event.mine', {});
    inc('event drafts', (mine.drafts ?? []).length);
    for (const e of mine.organizing ?? []) {
      const full = (await api(email(h), 'event.get', { eventId: e.id })).event ?? e;
      inc('events ' + full.state + (full.past ? ' (past)' : ''));
      if (full.state !== 'published') continue;
      const going = (await api(email(h), 'event.attendees', { eventId: e.id, kind: 'going' })).items ?? [];
      const interested = (await api(email(h), 'event.attendees', { eventId: e.id, kind: 'interested' })).items ?? [];
      out[`  «${full.title}»`] = `going ${going.length}, interested ${interested.length}`;
      if (full.requiresApplication) for (const s of ['pending', 'approved', 'declined']) inc('applications ' + s, ((await api(email(h), 'event.applications', { eventId: e.id, state: s })).items ?? []).length);
    }
  }
  for (const k of COMMUNITIES) {
    const c = await communityByName(k.host, k.name); if (!c) continue;
    const members = (await api(email(k.host), 'community.members', { communityId: c.id })).items ?? [];
    const disc = (await api(email(k.host), 'community.discussions', { communityId: c.id })).items ?? [];
    out[`  «${k.name}»`] = `members ${members.length}, discussions ${disc.length}, pinned ${disc.filter(d => d.pinned).length}`;
  }
  for (const k of ['mira', 'lev', 'kira', 'vesta', 'daniel', 'timur', 'alisa', 'katya', 'egor']) inc('conversations (sum over sides)', ((await api(email(k), 'chats.list', { filter: 'all', archived: false })).items ?? []).length);
  for (const k of ['mira', 'kira', 'timur', 'vesta']) for (const r of (await api(email(k), 'access.lists', { tab: 'incoming' })).items ?? []) inc('incoming access requests ' + (r.state ?? 'pending'));
  for (const k of ['mira']) for (const r of (await api(email(k), 'access.lists', { tab: 'byme' })).items ?? []) inc('mira: opened by me');
  for (const k of ['mira', 'lev', 'kira', 'vesta', 'daniel']) inc('notifications (first page, sum)', ((await api(email(k), 'notifications.list', {})).items ?? []).length);
  inc('staff report queue', ((await api(STAFF, 'staff.reportQueue', {})).items ?? []).length);
  for (const k of ['mira', 'kira', 'lev', 'timur', 'daniel']) { const l = await api(email(k), 'links.mine', {}); inc('links confirmed (sum)', (l.confirmed ?? []).length); inc('links incoming', (l.incoming ?? []).length); inc('links sent', (l.sent ?? []).length); }
  return out;
}

// ---------------------------------------------------------------- run
const PHASES = { accounts: async () => { for (const c of CAST) await step('account ' + c.key, () => account(c)); },
  photos: async () => { await staff(); for (const c of CAST) if (c.face || c.tier === 'doc') await step('photo/age ' + c.key, () => photo(c)); },
  profile: async () => { for (const c of CAST) if (!['fresh', 'min'].includes(c.tier)) await step('profile ' + c.key, () => profileExtras(c)); },
  social, couples, communities, events, 'events-more': eventsMore, posts, variety, following, video, access, moderation,
  verify: async () => { const v = await verify(); console.log(JSON.stringify({ ...v, ...await varietyVerify(), ...await followingVerify(), ...await videoVerify() }, null, 1)); },
  'verify-following': async () => console.log(JSON.stringify(await followingVerify(), null, 1)),
  'verify-video': async () => console.log(JSON.stringify(await videoVerify(), null, 1)) };
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.FE_ADMIN_KEY) { console.error('FE_ADMIN_KEY is required'); process.exit(1); }
  const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PHASES);
  for (const ph of want) {
    if (!PHASES[ph]) { console.error('unknown phase ' + ph); process.exit(1); }
    log('== ' + ph); await PHASES[ph]();
  }
  if (problems.length) { console.log('\nNot done (' + problems.length + '):'); for (const p of problems) console.log(' - ' + p); process.exitCode = 1; }
}
