/* Generic account/auth handler (AppBase Core), mounted by api/auth.js.

   POST /api/auth — аккаунт: код на почту, и по коду — вход.

   Аккаунт ОДИН на человека, и всё остальное висит на нём: подписка, ник, данные
   продукта. Пароля нет намеренно: код на почту доказывает ровно то же самое —
   человек имеет доступ к адресу.

   Действия:
     {action:'send',   email}
     {action:'verify', email, code, deviceId, handle, sub, ...product fields}
     {action:'set_handle', email, deviceId, syncToken, handle, ...product fields}
     {action:'set_locale', email, deviceId, syncToken, locale}
     {action:'status' | 'push_device' | 'notification_event' | 'analytics' | 'client_error', ...}
     {action:'forget', email, deviceId, syncToken, handle, scope, ...product fields}

   Удаление живёт здесь же: завести себя и стереть себя — про одну и ту же запись,
   а каждая функция Vercel на счету.

   Публичные страницы, ключи правки и опубликованный продуктом контент принадлежат
   расширению аккаунта продукта (хуки передаются в createAuthHandler). */

const { store } = require('./store');
const { send, fail, readBody, rateOk, rateOkScoped, rndId, sameSecret, cors } = require('./util');
const { sendMail } = require('./mail');
const { recordClientError } = require('./diagnostics');
const SyncShadow = require('./sync-shadow');
const { capabilities } = require('./capabilities-core');
const { productIdentity } = require('./product-core');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

const CODE_TTL = 15 * 60;    // код живёт 15 минут: дольше — это уже пароль
const TRIES = 5;             // попыток на один код
const PER_DAY = 5;           // писем на адрес в сутки

// Проверка адреса нарочно простая: настоящая проверка — само письмо.
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const HANDLE = /^@[\wа-яё.\-]{2,29}$/i;
const normMail = v => String(v || '').trim().toLowerCase().slice(0, 120);
const normHandle = v => {
  let h = String(v || '').trim().replace(/^@+/, '').replace(/[^\wа-яё.\-]/gi, '').slice(0, 29);
  return h ? '@' + h : '';
};

const digits = n => {
  const b = crypto.randomBytes(n);
  let out = '';
  for(let i = 0; i < n; i++) out += String(b[i] % 10);
  return out;
};

/* Product composition supplies account-extension hooks (the no-op NO_ACCOUNT_EXTENSION below
   documents the contract) and the analytics engine bound to its event taxonomy. */
const NO_ACCOUNT_EXTENSION = Object.freeze({
  async wipePublicIdentity(){ return {wiped:false}; },
  async purgeAccountData(){},
  async purgeOwnedContent(){ return {links:0}; },
  async claimHandle(){ return ''; },
  async onVerify(){ return {fields:{}}; }
});

function createAuthHandler({accountExtension = NO_ACCOUNT_EXTENSION, analytics} = {}){
  if(!analytics || typeof analytics.recordAnalytics !== 'function' || typeof analytics.removeAnalyticsDevice !== 'function'){
    throw new Error('analytics_required');
  }
  const { recordAnalytics, removeAnalyticsDevice } = analytics;

  async function forget(req, res, body){
    if(!(await rateOk(req, 'forget', 20))) return fail(res, 429, 'rate_limited');

    const all = (body && body.scope) === 'all';
    const email = String((body && body.email) || '').trim().toLowerCase().slice(0, 120);
    const mh = email ? sha(email).slice(0, 32) : '';

    let handle = String((body && body.handle) || '').slice(0, 40);
    if(handle && handle[0] !== '@') handle = '@' + handle;
    const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);

    let wiped = false;

    const identity = await accountExtension.wipePublicIdentity({handle, okHandle, body, all});
    if(identity.error) return fail(res, identity.error.status, identity.error.code);
    wiped = !!identity.wiped;

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
        const shadowPurge = await SyncShadow.purgeAccount(mh);
        if(shadowPurge.enabled && !shadowPurge.ok) return fail(res,503,'shadow_delete_failed');
        await store.del(`a:${mh}`);
        try{ await removeAnalyticsDevice(deviceId); }catch(_){}
        await store.del(`a:indexed:${mh}`);
        await store.removeFromList('a:all', mh);

        // Одноразовые auth-следы и AI usage/diagnostics тоже относятся к аккаунту.
        // У них есть TTL, но delete account должен чистить их сразу, а не ждать срока.
        await store.del(`mail:${mh}`);
        await store.del(`campaign:last:offers:${mh}`);
        for(const key of await store.scan(`mailday:${mh}:*`, 400)) await store.del(key);
        for(const key of await store.scan(`ai:use:*:${mh}:*`, 500)) await store.del(key);
        for(const key of await store.scan('ai:log:*', 120)){
          const rows = await store.list(key);
          for(const row of rows){
            try{
              const rec = JSON.parse(row);
              if(rec && rec.account === mh) await store.removeFromList(key, row);
            }catch(_){}
          }
        }

        await accountExtension.purgeAccountData(mh);

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
          Object.values((sm && sm.accountDocs) || {}).forEach(d => {
            if(d && d.storeKey) keys.push(d.storeKey);
          });
          for(const key of keys) await store.del(key);
          await store.del(`s:${mh}`);
        }
        account = true;
      }
    }

    const owned = await accountExtension.purgeOwnedContent({handle, okHandle, body});
    links = owned.links || 0;

    send(res, 200, {ok: true, wiped, account, links});
  }

  return async (req, res) => {
    if(cors(req, res)) return;
    if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
    if(!store.configured()) return fail(res, 503, 'no_store');
    if(!(await rateOk(req, 'auth', 240))) return fail(res, 429, 'rate_limited');

    let body;
    try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }

    const act = (body && body.action) || '';

    /* Удаление разбираем ДО проверки адреса: стирать себя может и тот, у кого
       аккаунта нет вовсе, — у него на сервере только страница тренера, и
       доказывает он ключом от неё, а не почтой. */
    if(act === 'forget') return forget(req, res, body);

    // Продуктовая аналитика не требует аккаунта: первые шаги воронки происходят
    // до регистрации. Сохраняем только агрегаты и короткоживущий hash deviceId.
    if(act === 'analytics'){
      if(!(await rateOkScoped(req,'analytics',240,'',3600,true))) return fail(res,429,'rate_limited');
      try{
        const out=await recordAnalytics(body||{});
        return send(res,200,out);
      }catch(e){
        return fail(res,e&&e.status||400,e&&e.message||'bad_analytics');
      }
    }

    if(act === 'client_error'){
      if(!(await rateOkScoped(req,'client-error',120,'',3600,true))) return fail(res,429,'rate_limited');
      try{
        return send(res,200,await recordClientError(body||{}));
      }catch(e){
        return fail(res,400,'bad_client_error');
      }
    }

    const email = normMail(body && body.email);
    if(!EMAIL.test(email)) return fail(res, 400, 'bad_email');
    const mh = sha(email).slice(0, 32);   // по хешу ищем, сам адрес лежит в записи

    /* Ник принадлежит основному аккаунту и задаётся один раз после подтверждения
       почты. Тренерского аккаунта не существует: режим тренера лишь использует
       этот же ник и при первом сохранении создаёт публичную страницу. */
    if(act === 'set_handle'){
      const deviceId = String((body && body.deviceId) || '').trim().slice(0, 80);
      const token = String((body && body.syncToken) || '');
      let acc = null;
      try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
      const device = acc && acc.syncDevices && acc.syncDevices[deviceId];
      if(!device || !sameSecret(sha(token), device.h || '')) return fail(res, 403, 'bad_sync_token');
      if(acc.handle) return send(res, 200, {ok:true, handle:acc.handle});

      const handle = normHandle(body && body.handle);
      if(!HANDLE.test(handle)) return fail(res, 400, 'bad_handle');
      const owner = await store.get(`h:${handle}`);
      if(owner && owner !== mh) return fail(res, 409, 'handle_taken');
      const claimError = await accountExtension.claimHandle({handle, mh, body});
      if(claimError) return fail(res, 409, claimError);
      acc.handle = handle;
      await store.set(`h:${handle}`, mh);
      await store.set(`a:${mh}`, JSON.stringify(acc));
      return send(res, 200, {ok:true, handle});
    }

    if(act === 'status'){
      const deviceId = String((body && body.deviceId) || '').trim().slice(0,80);
      const token = String((body && body.syncToken) || '');
      let acc = null;
      try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
      const device = acc && acc.syncDevices && acc.syncDevices[deviceId];
      if(!device || !sameSecret(sha(token), device.h || '')) return fail(res,403,'bad_sync_token');
      return send(res,200,{
        ok:true,
        sub:acc.sub || null,
        premium:!!(acc.sub && (Date.parse(acc.sub.until)||0) > Date.now())
      });
    }

    if(act === 'set_locale'){
      const deviceId = String((body && body.deviceId) || '').trim().slice(0, 80);
      const token = String((body && body.syncToken) || '');
      const locale = (body && body.locale) === 'en' ? 'en' : 'ru';
      let acc = null;
      try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(e){}
      const device = acc && acc.syncDevices && acc.syncDevices[deviceId];
      if(!device || !sameSecret(sha(token), device.h || '')) return fail(res, 403, 'bad_sync_token');
      acc.locale = locale;
      await store.set(`a:${mh}`, JSON.stringify(acc));
      return send(res, 200, {ok:true, locale});
    }

    if(act === 'push_device'){
      // Unregistering stays allowed so a product that turns push off can still clean up devices.
      if(!capabilities().enabled('notifications') && !(body && body.enabled === false)) return fail(res, 404, 'capability_disabled');
      const deviceId=String((body&&body.deviceId)||'').trim().slice(0,80), token=String((body&&body.syncToken)||'');
      let acc=null;try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(e){}
      const device=acc&&acc.syncDevices&&acc.syncDevices[deviceId];
      if(!device||!sameSecret(sha(token),device.h||''))return fail(res,403,'bad_sync_token');
      if(!acc.pushDevices||typeof acc.pushDevices!=='object')acc.pushDevices={};
      if(body&&body.enabled===false)delete acc.pushDevices[deviceId];
      else{
        const platform=body&&body.platform==='ios'?'ios':body&&body.platform==='android'?'android':'';
        const pushToken=String((body&&body.token)||'').trim().slice(0,4096);
        if(!platform||pushToken.length<16)return fail(res,400,'bad_push_token');
        acc.pushDevices[deviceId]={platform,token:pushToken,at:new Date().toISOString()};
        Object.keys(acc.pushDevices).forEach(id=>{if(!acc.syncDevices[id])delete acc.pushDevices[id];});
      }
      await store.set(`a:${mh}`,JSON.stringify(acc));
      if(!(await store.get(`a:indexed:${mh}`))){
        await store.set(`a:indexed:${mh}`, '1');
        await store.push('a:all', mh);
      }
      return send(res,200,{ok:true,enabled:!!acc.pushDevices[deviceId]});
    }

    if(act === 'notification_event'){
      const deviceId=String((body&&body.deviceId)||'').trim().slice(0,80), token=String((body&&body.syncToken)||'');
      let acc=null;try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(e){}
      const device=acc&&acc.syncDevices&&acc.syncDevices[deviceId];
      if(!device||!sameSecret(sha(token),device.h||''))return fail(res,403,'bad_sync_token');
      const event=String((body&&body.event)||'open').replace(/[^a-z_-]/gi,'').slice(0,30)||'open';
      const stage=String((body&&body.stage)||'unknown').replace(/[^a-z0-9_-]/gi,'').slice(0,50)||'unknown';
      const day=new Date().toISOString().slice(0,10);
      await Promise.all([
        store.incr(`notify:${event}:${stage}`,365*24*3600),
        store.incr(`notify:${event}:${stage}:${day}`,90*24*3600)
      ]);
      return send(res,200,{ok:true});
    }

    /* ---- прислать код ---- */
    if(act === 'send'){
      // Отправка письма — чувствительная операция: если защитный счётчик недоступен,
      // лучше честно ответить 503, чем превратить сбой Redis в бесплатный mail-bomb.
      if(!(await rateOkScoped(req, 'auth-send-ip', 30, '', 3600, true))
        || !(await rateOkScoped(req, 'auth-send-mail', 10, mh, 3600, true))){
        return fail(res, 429, 'rate_limited');
      }
      // Считаем ПО АДРЕСУ, а не по устройству: иначе чужой почтовый ящик заваливается
      // письмами с любого количества телефонов, и виноваты в этом мы.
      const day = new Date().toISOString().slice(0, 10);
      const n = await store.incr(`mailday:${mh}:${day}`, 2 * 24 * 3600);
      if(n > PER_DAY) return fail(res, 429, 'too_many_today');

      const code = digits(6);
      await store.set(`mail:${mh}`, JSON.stringify({h: sha(code), tries: 0, at: Date.now()}), CODE_TTL);

      const locale = (body && body.locale) === 'en' ? 'en' : 'ru';
      const appName = productIdentity().name;
      const text = locale === 'en'
        ? `Your ${appName} sign-in code: ${code}\n\nEnter it in the app under More → Account.\nThe code is valid for 15 minutes.\n\nIf you didn’t request this, you can ignore this email.`
        : `Код для входа: ${code}\n\nВведи его в приложении, в разделе «Другое» → «Аккаунт».\nКод действует 15 минут.\n\nЕсли ты этого не просил — просто удали письмо, ничего не произошло.`;
      const html = locale === 'en'
        ? `<div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630"><p>Your ${appName} sign-in code:</p><p style="font:600 30px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;margin:18px 0">${code}</p><p>Enter it in the app under More → Account. The code is valid for 15 minutes.</p><p style="color:#6C6785;font-size:14px">If you didn’t request this, you can ignore this email.</p></div>`
        : `<div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630"><p>Код для входа:</p><p style="font:600 30px/1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;margin:18px 0">${code}</p><p>Введи его в приложении, в разделе «Другое» → «Аккаунт». Код действует 15 минут.</p><p style="color:#6C6785;font-size:14px">Если ты этого не просил — просто удали письмо, ничего не произошло.</p></div>`;

      /* На локальном запуске письмо не отправляется, а код возвращается в ответе.
         Иначе ни один сценарий нельзя прогнать, не заведя настоящий почтовый ящик, —
         а проверять надо переход, а не то, умеет ли Resend доставлять письма.
         В боевом режиме этой ветки нет: там ALLOW_MEMORY_STORE не ставят. */
      const local = process.env.ALLOW_MEMORY_STORE === '1';
      try{
        await sendMail({to: email, subject: locale === 'en' ? `${appName} code: ${code}` : `Код ${code} — ${appName}`, text, html});
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
      if(!(await rateOkScoped(req, 'auth-verify-ip', 120, '', 15 * 60, true))
        || !(await rateOkScoped(req, 'auth-verify-mail', 20, mh, 15 * 60, true))){
        return fail(res, 429, 'rate_limited');
      }
      // Обычный email-код и одноразовый код из админки используют один и тот же
      // проверенный путь. Админский код не является мастер-паролем: он хранится
      // только в хеше, живёт 15 минут и удаляется после первого успешного входа.
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
      if(!acc) acc = {email, since: now, handle: '', sub: null, locale: (body && body.locale) === 'en' ? 'en' : 'ru'};
      if(acc.locale !== 'ru' && acc.locale !== 'en') acc.locale = (body && body.locale) === 'en' ? 'en' : 'ru';
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

      /* Подписку НИКОГДА не принимаем от обычного клиента в production.
         Иначе модифицированный APK может прислать себе until=2099 и получить
         серверные Premium-функции. Реальный Premium меняют только billing/webhook
         или админка. Исключение оставлено только локальному memory-store для тестов. */
      const sub = body && body.sub;
      if(process.env.ALLOW_MEMORY_STORE === '1' && sub && typeof sub === 'object' && !acc.sub){
        acc.sub = sub;
      }

      /* Ник тоже принадлежит аккаунту: отдельного «входа для тренеров»
         нет, и потерять себя человек должен иметь возможность ровно в одном месте. */
      let handle = String((body && body.handle) || '').slice(0, 40);
      if(handle && handle[0] !== '@') handle = '@' + handle;
      const okHandle = /^@[\wа-яё.\-]{1,39}$/i.test(handle);
      const extension = await accountExtension.onVerify({acc, mh, handle, okHandle, body, now});
      if(extension.error) return fail(res, extension.error.status, extension.error.code);

      if(acc.handle) await store.set(`h:${acc.handle}`, mh);
      await store.set(`a:${mh}`, JSON.stringify(acc));
      if(fresh && deviceId){
        try{
          await recordAnalytics({
            event:'account_created',
            deviceId,
            platform:(body&&body.platform)||'web',
            locale:acc.locale||'ru',
            premium:false
          });
        }catch(_){}
      }
      // Индекс нужен только для серверных рассылок. Сам адрес всё равно хранится
      // внутри защищённой записи аккаунта; наружу список не отдаётся.
      if(!(await store.get(`a:indexed:${mh}`))){
        await store.set(`a:indexed:${mh}`, '1');
        await store.push('a:all', mh);
      }

      return send(res, 200, {
        ok: true, email, fresh,
        sub: acc.sub || null,
        handle: acc.handle || '',
        needsHandle: !acc.handle,
        ...extension.fields,
        locale: acc.locale || 'ru',
        syncToken: deviceId ? syncToken : null
      });
    }

    fail(res, 400, 'unknown_action');
  };
}

module.exports = { createAuthHandler, NO_ACCOUNT_EXTENSION };
