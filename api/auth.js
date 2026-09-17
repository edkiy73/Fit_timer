/* POST /api/auth — аккаунт: код на почту, и по коду — вход.

   Аккаунт ОДИН на человека, и всё остальное висит на нём: подписка, ник тренера,
   право править свою страницу. Отдельного «входа для тренеров» нет намеренно —
   получалось два входа, две почты и два места, где можно потерять себя.

   Завести аккаунт может кто угодно и бесплатно: подписка — это про синхронизацию и
   каталог, а не про право иметь себя. Без подписки аккаунт просто помнит, кто ты, и
   возвращает ник тренера на новом телефоне.

   Пароля нет намеренно. Пароль надо придумать, запомнить и где-то восстанавливать —
   то есть завести вторую такую же задачу поверх первой. Код на почту доказывает
   ровно то же самое: человек имеет доступ к адресу.

   Три действия:
     {action:'send',   email}
     {action:'verify', email, code, deviceId, handle, trainerKey, sub}
     {action:'forget', email, deviceId, syncToken, handle, trainerKey, scope, links}

   Удаление живёт здесь же, а не отдельным файлом: завести себя и стереть себя —
   про одну и ту же запись, и Vercel на бесплатном плане считает каждый файл
   отдельной функцией, которых там всего двенадцать.

   При подтверждении:
   • аккаунта нет — заводится; это и есть регистрация, отдельной формы для неё нет;
   • у телефона есть ник с рабочим ключом, а у аккаунта ника нет — ник привязывается
     к аккаунту;
   • у аккаунта ник уже есть — он возвращается вместе с НОВЫМ ключом правки. Прежний
     перестаёт работать: вернуть себе страницу и означает забрать её у устройства,
     где её больше нет. */

const { store } = require('../lib/store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors } = require('../lib/util');
const { sendMail } = require('../lib/mail');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

const CODE_TTL = 15 * 60;    // код живёт 15 минут: дольше — это уже пароль
const TRIES = 5;             // попыток на один код
const PER_DAY = 5;           // писем на адрес в сутки

// Проверка адреса нарочно простая: настоящая проверка — само письмо.
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const normMail = v => String(v || '').trim().toLowerCase().slice(0, 120);

const digits = n => {
  const b = crypto.randomBytes(n);
  let out = '';
  for(let i = 0; i < n; i++) out += String(b[i] % 10);
  return out;
};

// Что видно клиенту в профиле тренера. Ключи и хеши наружу не уходят никогда.
const publicTrainer = t => ({
  name: t.name || '', photo: t.photo || '', about: t.about || '',
  years: t.years == null ? null : t.years, links: t.links || ''
});

// Что именно считается «сведениями о тренере». Список один на всё: расходясь с
// тем, что показывает страница, он оставил бы на ней то, что человек стёр.
const FACE = ['name', 'photo', 'about', 'years', 'links'];

async function forget(req, res, body){
  if(!(await rateOk(req, 'forget', 20))) return fail(res, 429, 'rate_limited');

  const all = (body && body.scope) === 'all';
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 120);
  const mh = email ? sha(email).slice(0, 32) : '';

  let handle = String((body && body.handle) || '').slice(0, 40);
  if(handle && handle[0] !== '@') handle = '@' + handle;
  const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);

  let wiped = false;

  /* ---- лицо тренера ---- */
  if(okHandle){
    const raw = await store.get(`t:${handle}`);
    if(raw){
      let t;
      try{ t = JSON.parse(raw); }catch(e){ t = null; }
      if(!t) return fail(res, 500, 'corrupt');
      if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
        return fail(res, 403, 'not_yours');
      }
      FACE.forEach(k => { delete t[k]; });
      t.wiped = new Date().toISOString();
      /* При удалении аккаунта ник остаётся закреплённым, но управлять им больше
         нечем: ключ снимается, привязка к почте снимается. Освободить ник нельзя —
         его носят программы, уже лежащие в каталоге, и чужой человек, назвавшись
         так же, унаследовал бы их автора. */
      if(all){ t.keyHash = ''; delete t.mailHash; }
      await store.set(`t:${handle}`, JSON.stringify(t));
      wiped = true;
    }
  }

  if(!all) return send(res, 200, {ok: true, wiped});

  /* ---- аккаунт ---- */
  // Ключа у аккаунта отдельного нет: им и служит ключ тренера, а если тренера не
  // было, то удалять на сервере нечего, кроме самой записи, — и её сноса просит
  // тот, кто может подтвердить, что это его почта. Для этого хватает и того, что
  // запрос пришёл от телефона, на котором эта почта уже подтверждена кодом:
  // ключ аккаунта лежит там же.
  let links = 0, account = false;
  if(mh){
    const araw = await store.get(`a:${mh}`);
    if(araw){
      let acc = null;
      try{ acc = JSON.parse(araw); }catch(e){}
      // Аккаунт с ником стирается только вместе с доказанным владением ником —
      // иначе чужую почту можно было бы «удалить», просто зная её.
      if(acc && acc.handle && !wiped) return fail(res, 403, 'not_yours');
      const deviceId = String((body && body.deviceId) || '').slice(0, 80);
      const dev = acc && acc.syncDevices && acc.syncDevices[deviceId];
      const tokenOk = dev && sameSecret(sha((body && body.syncToken) || ''), dev.h || '');
      if(!wiped && !tokenOk) return fail(res, 403, 'not_yours');
      await store.del(`a:${mh}`);
      // Манифест знает все отдельные документы синхронизации. Сначала читаем его,
      // затем удаляем сами документы и только после этого манифест: иначе список
      // ключей потеряется, а данные останутся в базе без способа их найти.
      const sraw = await store.get(`s:${mh}`);
      if(sraw){
        let sm = null;
        try{ sm = JSON.parse(sraw); }catch(e){}
        const keys = [];
        Object.values((sm && sm.profiles) || {}).forEach(p => {
          Object.values((p && p.docs) || {}).forEach(d => { if(d && d.storeKey) keys.push(d.storeKey); });
        });
        for(const key of keys) await store.del(key);
        await store.del(`s:${mh}`);
      }
      account = true;
    }
  }

  /* Ссылки, отправленные подопечным, вместе с отчётами и счётчиками открытий.
     Их список знает только телефон тренера — на сервере он нигде не собран,
     и собирать его ради одного удаления значило бы завести ещё одно место,
     где хранится «кто кому что отправил». */
  const want = (Array.isArray(body && body.links) ? body.links : [])
    .map(x => String(x || '')).filter(x => /^[0-9a-z]{4,16}$/.test(x)).slice(0, 300);
  for(const id of want){
    const rec = await store.get(`p:${id}`);
    if(!rec) continue;
    let p;
    try{ p = JSON.parse(rec); }catch(e){ continue; }
    if(okHandle && p.by !== handle) continue;   // чужую ссылку своим ключом не удалить
    await store.del(`p:${id}`);
    await store.del(`p:${id}:reports`);
    await store.del(`p:${id}:opens`);
    await store.del(`p:${id}:first`);
    await store.del(`p:${id}:last`);
    links++;
  }

  send(res, 200, {ok: true, wiped, account, links});
}

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'auth', 40))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  const act = (body && body.action) || '';

  /* Удаление разбираем ДО проверки адреса: стирать себя может и тот, у кого
     аккаунта нет вовсе, — у него на сервере только страница тренера, и
     доказывает он ключом от неё, а не почтой. */
  if(act === 'forget') return forget(req, res, body);

  const email = normMail(body && body.email);
  if(!EMAIL.test(email)) return fail(res, 400, 'bad_email');
  const mh = sha(email).slice(0, 32);   // по хешу ищем, сам адрес лежит в записи

  /* ---- прислать код ---- */
  if(act === 'send'){
    // Считаем ПО АДРЕСУ, а не по устройству: иначе чужой почтовый ящик заваливается
    // письмами с любого количества телефонов, и виноваты в этом мы.
    const day = new Date().toISOString().slice(0, 10);
    const n = await store.incr(`mailday:${mh}:${day}`, 2 * 24 * 3600);
    if(n > PER_DAY) return fail(res, 429, 'too_many_today');

    const code = digits(6);
    await store.set(`mail:${mh}`, JSON.stringify({h: sha(code), tries: 0, at: Date.now()}), CODE_TTL);

    const text = `Код для входа: ${code}\n\n`
      + `Введи его в приложении, в разделе «Другое» → «Аккаунт».\n`
      + `Код действует 15 минут.\n\n`
      + `Если ты этого не просил — просто удали письмо, ничего не произошло.`;
    const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630">`
      + `<p>Код для входа:</p>`
      + `<p style="font:600 30px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;margin:18px 0">${code}</p>`
      + `<p>Введи его в приложении, в разделе «Другое» → «Аккаунт». Код действует 15 минут.</p>`
      + `<p style="color:#6C6785;font-size:14px">Если ты этого не просил — просто удали письмо, ничего не произошло.</p>`
      + `</div>`;

    /* На локальном запуске письмо не отправляется, а код возвращается в ответе.
       Иначе ни один сценарий нельзя прогнать, не заведя настоящий почтовый ящик, —
       а проверять надо переход, а не то, умеет ли Resend доставлять письма.
       В боевом режиме этой ветки нет: там ALLOW_MEMORY_STORE не ставят. */
    const local = process.env.ALLOW_MEMORY_STORE === '1';
    try{
      await sendMail({to: email, subject: `Код ${code} — Fit Timer`, text, html});
    }catch(e){
      if(e.code === 'no_mail_key'){
        if(!local) return fail(res, 503, 'no_mail');
      } else {
        return fail(res, 502, 'mail_failed', {detail: e.detail || '', testDomain: !!e.testDomain});
      }
    }
    return send(res, 200, Object.assign({ok: true, sent: true}, local ? {devCode: code} : {}));
  }

  /* ---- подтвердить код ---- */
  if(act === 'verify'){
    const raw = await store.get(`mail:${mh}`);
    if(!raw) return fail(res, 410, 'code_expired');
    let rec;
    try{ rec = JSON.parse(raw); }catch(e){ return fail(res, 410, 'code_expired'); }

    // Считаем попытки ДО сравнения: иначе шестизначный код перебирается за час.
    rec.tries = (rec.tries || 0) + 1;
    if(rec.tries > TRIES){
      await store.del(`mail:${mh}`);
      return fail(res, 429, 'too_many_tries');
    }
    await store.set(`mail:${mh}`, JSON.stringify(rec), CODE_TTL);

    const code = String((body && body.code) || '').replace(/\D/g, '');
    if(!sameSecret(sha(code), rec.h)) return fail(res, 403, 'bad_code', {left: TRIES - rec.tries});
    await store.del(`mail:${mh}`);   // код одноразовый

    const now = new Date().toISOString();
    let acc = null;
    const araw = await store.get(`a:${mh}`);
    if(araw){ try{ acc = JSON.parse(araw); }catch(e){ acc = null; } }
    const fresh = !acc;
    if(!acc) acc = {email, since: now, handle: '', sub: null};
    acc.seen = now;

    // Код на почту выдаёт устройству отдельный ключ синхронизации. Почта сама по
    // себе не секрет, поэтому использовать её как право читать данные нельзя.
    // У каждого устройства свой ключ: новый вход не выкидывает остальные телефоны.
    const deviceId = String((body && body.deviceId) || '').trim().slice(0, 80);
    const syncToken = rndId(32);
    if(!acc.syncDevices || typeof acc.syncDevices !== 'object') acc.syncDevices = {};
    if(deviceId){
      acc.syncDevices[deviceId] = {h: sha(syncToken), at: now};
      const old = Object.entries(acc.syncDevices)
        .sort((a, b) => String(b[1].at || '').localeCompare(String(a[1].at || '')))
        .slice(8);
      old.forEach(([id]) => { delete acc.syncDevices[id]; });
    }

    /* Подписка. Пока покупка — заглушка на самом телефоне, поэтому сервер просто
       ХРАНИТ то, что ему прислали, и отдаёт обратно на новом телефоне. Когда
       появится настоящая оплата, писать сюда будет она, а не клиент, — и вот
       тогда присланному верить будет нельзя. */
    const sub = body && body.sub;
    if(sub && typeof sub === 'object' && !acc.sub) acc.sub = sub;

    /* Ник тренера. Он тоже принадлежит аккаунту: отдельного «входа для тренеров»
       нет, и потерять себя человек должен иметь возможность ровно в одном месте. */
    let handle = String((body && body.handle) || '').slice(0, 40);
    if(handle && handle[0] !== '@') handle = '@' + handle;
    const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);
    let trainerKey = null, trainer = null;

    if(acc.handle){
      // Ник у аккаунта уже есть — возвращаем его и выдаём новый ключ правки.
      const traw = await store.get(`t:${acc.handle}`);
      if(traw){
        let t;
        try{ t = JSON.parse(traw); }catch(e){ t = null; }
        if(t){
          // Ключ НЕ перевыпускаем тому, у кого он и так рабочий: человек вошёл
          // на своём же телефоне, а не переехал, и выкидывать его из собственной
          // страницы в ответ на «запомни меня» незачем.
          const same = okHandle && handle === acc.handle
            && sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '');
          if(!same){
            trainerKey = rndId(24);
            t.keyHash = sha(trainerKey);
          }
          t.seen = now;
          t.mailHash = mh;
          await store.set(`t:${acc.handle}`, JSON.stringify(t));
          trainer = publicTrainer(t);
        }
      }
    } else if(okHandle){
      /* Ника у аккаунта нет, а у телефона есть. Привязываем — но только если он
         правда его: ник закрепляется за первым, кто им воспользовался, и войти
         под чужим, просто назвавшись им, нельзя. */
      const traw = await store.get(`t:${handle}`);
      if(traw){
        let t;
        try{ t = JSON.parse(traw); }catch(e){ t = null; }
        if(t && sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
          if(t.mailHash && t.mailHash !== mh) return fail(res, 409, 'handle_taken');
          t.mailHash = mh;
          t.seen = now;
          await store.set(`t:${handle}`, JSON.stringify(t));
          acc.handle = handle;
          trainer = publicTrainer(t);
        }
      }
    }

    await store.set(`a:${mh}`, JSON.stringify(acc));

    return send(res, 200, {
      ok: true, email, fresh,
      sub: acc.sub || null,
      handle: acc.handle || '',
      trainerKey,           // null — значит прежний ключ остаётся рабочим
      trainer,              // null — тренерской страницы у аккаунта нет
      syncToken: deviceId ? syncToken : null
    });
  }

  fail(res, 400, 'unknown_action');
};
