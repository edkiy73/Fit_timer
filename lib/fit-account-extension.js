/* FitTimer extension of the generic account/auth flow (api/auth.js).
   Owns the trainer public page (`t:<handle>`), trainer edit key, and trainer→client
   shared links (`p:<id>`). Generic auth calls these hooks and never reads those keys. */
const crypto = require('crypto');
const { store } = require('./store');
const { rndId, sameSecret } = require('./util');

const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

// Что видно клиенту в профиле тренера. Ключи и хеши наружу не уходят никогда.
const publicTrainer = t => ({
  name: t.name || '', photo: t.photo || '', about: t.about || '',
  years: t.years == null ? null : t.years, links: t.links || ''
});

// Что именно считается «сведениями о тренере». Список один на всё: расходясь с
// тем, что показывает страница, он оставил бы на ней то, что человек стёр.
const FACE = ['name', 'photo', 'about', 'years', 'links'];

/* forget: стереть публичное лицо тренера. Возвращает {wiped} или {error}. */
async function wipePublicIdentity({handle, okHandle, body, all}){
  if(!okHandle) return {wiped:false};
  const raw = await store.get(`t:${handle}`);
  if(!raw) return {wiped:false};
  let t;
  try{ t = JSON.parse(raw); }catch(e){ t = null; }
  if(!t) return {error:{status:500, code:'corrupt'}};
  if(!sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '')){
    return {error:{status:403, code:'not_yours'}};
  }
  FACE.forEach(k => { delete t[k]; });
  t.wiped = new Date().toISOString();
  /* При удалении аккаунта ник остаётся закреплённым, но управлять им больше
     нечем: ключ снимается, привязка к почте снимается. Освободить ник нельзя —
     его носят программы, уже лежащие в каталоге, и чужой человек, назвавшись
     так же, унаследовал бы их автора. */
  if(all){
    t.keyHash = '';
    delete t.mailHash;
    // Ник остаётся занятым ради уже опубликованного авторства, но хранить для
    // этого hash удалённой почты не нужно. Tombstone не позволяет захватить ник
    // заново и при этом не связывает его с удалённым email.
    await store.set(`h:${handle}`, 'deleted');
  }
  await store.set(`t:${handle}`, JSON.stringify(t));
  return {wiped:true};
}

/* forget scope=all: убрать из чужих данных следы удаляемого аккаунта. */
async function purgeAccountData(mh){
  // Shared link принадлежит тренеру, поэтому при удалении аккаунта подопечного
  // саму ссылку не трогаем. Убираем claim и только те отчёты, которые сервер
  // ранее пометил hash этого аккаунта. Старые/анонимные link-scoped отчёты
  // намеренно не угадываем по имени.
  for(const key of await store.scan('p:*', 100000)){
    const m = /^p:([0-9a-z]{4,16})$/.exec(String(key || ''));
    if(!m) continue;
    const raw = await store.get(key);
    if(!raw) continue;
    try{
      const link = JSON.parse(raw);
      if(link && link.clientMailHash === mh){
        delete link.clientMailHash;
        delete link.claimedAt;
        await store.set(key, JSON.stringify(link));
      }
    }catch(_){}
    const reportsKey = `p:${m[1]}:reports`;
    const reports = await store.list(reportsKey);
    for(const row of reports){
      try{
        const rec = JSON.parse(row);
        if(rec && rec._account === mh) await store.removeFromList(reportsKey, row);
      }catch(_){}
    }
  }
}

/* forget scope=all: удалить контент, опубликованный этим ником. Возвращает {links}. */
async function purgeOwnedContent({handle, okHandle, body}){
  let links = 0;
  /* Ссылки, отправленные подопечным, вместе с отчётами и счётчиками открытий.
     Список с телефона используем как быстрый путь, но он не может быть единственным:
     после переустановки или удаления на другом устройстве локальная картотека бывает
     неполной. Полное удаление — редкая операция, поэтому здесь допустим SCAN по p:*,
     чтобы найти все server links этого trainer handle. */
  const want = new Set((Array.isArray(body && body.links) ? body.links : [])
    .map(x => String(x || '')).filter(x => /^[0-9a-z]{4,16}$/.test(x)).slice(0, 300));
  if(okHandle){
    const keys = await store.scan('p:*', 100000);
    for(const key of keys){
      const m = /^p:([0-9a-z]{4,16})$/.exec(String(key || ''));
      if(!m) continue;
      const rec = await store.get(key);
      if(!rec) continue;
      try{
        const p = JSON.parse(rec);
        if(p && p.by === handle) want.add(m[1]);
      }catch(_){}
    }
  }
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
    const reportDays = await store.scan(`reportday:${id}:*`, 400);
    for(const key of reportDays) await store.del(key);
    links++;
  }
  return {links};
}

/* set_handle: ник свободен в индексе аккаунтов, но мог остаться у страницы тренера
   из времён до аккаунтов. Возвращает код ошибки или ''. */
async function claimHandle({handle, mh, body}){
  const traw = await store.get(`t:${handle}`);
  if(!traw) return '';
  let t = null;
  try{ t = JSON.parse(traw); }catch(e){}
  const legacyKeyOk = t && sameSecret(sha((body && body.trainerKey) || ''), t.keyHash || '');
  if(!t || (t.mailHash && t.mailHash !== mh) || (!t.mailHash && !legacyKeyOk)){
    return 'handle_taken';
  }
  t.mailHash = mh;
  await store.set(`t:${handle}`, JSON.stringify(t));
  return '';
}

/* verify: ник тренера тоже принадлежит аккаунту. Может установить acc.handle.
   Возвращает {fields} для ответа клиенту или {error}. */
async function onVerify({acc, mh, handle, okHandle, body, now}){
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
        if(t.mailHash && t.mailHash !== mh) return {error:{status:409, code:'handle_taken'}};
        t.mailHash = mh;
        t.seen = now;
        await store.set(`t:${handle}`, JSON.stringify(t));
        acc.handle = handle;
        trainer = publicTrainer(t);
      }
    }
  }

  return {fields:{
    trainerKey,           // null — значит прежний ключ остаётся рабочим
    trainer               // null — тренерской страницы у аккаунта нет
  }};
}

module.exports = {
  wipePublicIdentity,
  purgeAccountData,
  purgeOwnedContent,
  claimHandle,
  onVerify
};
