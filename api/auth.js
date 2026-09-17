/* POST /api/auth — почта тренера: код на адрес, и по коду — вход.

   Зачем вообще. Страница тренера держится на паре «ник + ключ», а ключ лежит
   ровно в одном месте — в телефоне. Переставил приложение, сменил телефон, почистил
   данные — и страница со всеми программами в каталоге осталась ничьей: править её
   уже нельзя, а ник занят навсегда. Почта — единственный способ вернуться к себе,
   и заводится она ради этого, а не ради рассылок.

   Пароля нет намеренно. Пароль надо придумать, запомнить и где-то восстанавливать —
   то есть завести вторую такую же задачу поверх первой. Код на почту доказывает
   ровно то же самое: человек имеет доступ к адресу.

   Два действия:
     {action:'send',  email}                       — прислать код
     {action:'verify', email, code, handle, trainerKey} — подтвердить

   При подтверждении возможны два исхода:
   • у телефона есть свой рабочий ключ → почта просто привязывается к нику;
   • ключа нет, а за адресом уже закреплён ник → ник возвращается, и выдаётся
     НОВЫЙ ключ. Прежний перестаёт работать: вернуть себе страницу и означает
     забрать её у того устройства, где её больше нет. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors } = require('./_util');
const { sendMail, testDomain } = require('./_mail');
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

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'auth', 40))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

  const email = normMail(body && body.email);
  if(!EMAIL.test(email)) return fail(res, 400, 'bad_email');
  const mh = sha(email).slice(0, 32);   // по хешу ищем, сам адрес лежит у тренера
  const act = (body && body.action) || '';

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
      + `Введи его в приложении, в разделе «Ещё» → «Тренер».\n`
      + `Код действует 15 минут.\n\n`
      + `Если ты этого не просил — просто удали письмо, ничего не произошло.`;
    const html = `<div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630">`
      + `<p>Код для входа:</p>`
      + `<p style="font:600 30px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;margin:18px 0">${code}</p>`
      + `<p>Введи его в приложении, в разделе «Ещё» → «Тренер». Код действует 15 минут.</p>`
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

    let handle = String((body && body.handle) || '').slice(0, 40);
    if(handle && handle[0] !== '@') handle = '@' + handle;
    const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);
    const bound = await store.get(`e:${mh}`);

    /* Свой рабочий ключ на руках — значит, это просто привязка адреса к своему же
       нику. Ключ не меняем: менять его здесь означало бы выкинуть человека из
       собственной страницы в ответ на «запомни мою почту». */
    if(okHandle){
      const traw = await store.get(`t:${handle}`);
      if(traw){
        let t;
        try{ t = JSON.parse(traw); }catch(e){ t = null; }
        if(t && !t.deleted && sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
          /* Адрес уже привязан к ДРУГОМУ нику — переносим, а не отказываем. Чаще
             всего это один и тот же человек, сменивший ник: смена заводит новую
             запись, старая остаётся закреплённой, и без переноса собственная почта
             отказывалась привязываться к собственному новому нику. Ключом от нового
             ника и кодом с почты доказано и то, и другое — а больше тут доказывать
             нечего: адрес один, и указывать он может только на что-то одно. */
          if(bound && bound !== handle){
            const oraw = await store.get(`t:${bound}`);
            if(oraw){
              try{
                const o = JSON.parse(oraw);
                delete o.email; delete o.mailHash;
                await store.set(`t:${bound}`, JSON.stringify(o));
              }catch(e){}
            }
          }
          t.email = email;
          t.mailHash = mh;
          t.seen = new Date().toISOString();
          await store.set(`t:${handle}`, JSON.stringify(t));
          await store.set(`e:${mh}`, handle);
          return send(res, 200, {ok: true, handle, linked: true});
        }
      }
    }

    /* Ключа нет. Тогда почта — это и есть доказательство: возвращаем ник, за
       которым она закреплена, и выдаём новый ключ взамен потерянного. */
    if(bound){
      const traw = await store.get(`t:${bound}`);
      if(!traw) return fail(res, 404, 'not_found');
      let t;
      try{ t = JSON.parse(traw); }catch(e){ return fail(res, 500, 'corrupt'); }
      if(t.deleted) return fail(res, 404, 'not_found');
      const key = rndId(24);
      t.keyHash = sha(key);
      t.seen = new Date().toISOString();
      await store.set(`t:${bound}`, JSON.stringify(t));
      return send(res, 200, {
        ok: true, handle: bound, trainerKey: key, restored: true,
        trainer: {name: t.name || '', photo: t.photo || '', about: t.about || '',
                  years: t.years == null ? null : t.years, links: t.links || ''}
      });
    }

    /* Адрес ничей, и своего ника у телефона тоже нет. Закреплять за почтой пустоту
       нечего: сначала ник, потом почта к нему. */
    return fail(res, 404, 'no_handle');
  }

  fail(res, 400, 'unknown_action');
};
