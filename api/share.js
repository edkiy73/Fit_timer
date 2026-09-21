/* POST /api/share — положить программу на сервер и получить короткую ссылку.

   Зачем это вместо прежней ссылки, в которую программа упакована целиком:
   • ссылка становится короткой и не разваливается в мессенджерах;
   • видно, открыл ли клиент её вообще, — без этого тренеру нечего смотреть;
   • обратный отчёт клиента приезжает сам, а не копипастом.

   Аккаунтов здесь нет намеренно. Пара id + key заменяет их: id лежит в ссылке и
   открыт всем, кому её переслали, key остаётся у тренера в телефоне и нужен,
   чтобы ЧИТАТЬ статистику и отчёты. Этого хватает, пока продавать нечего, и это
   не мешает завести настоящие аккаунты потом. */

const { store } = require('../lib/store');
const { sendPushToAccountHash } = require('../lib/push');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic, cleanLink } = require('../lib/util');

// Профиль тренера — то, что увидят чужие люди. Пределы одни на все двери, через
// которые он сюда попадает: и через /api/trainer, и вместе со ссылкой отсюда.
const faceOf = prof => ({
  name:  clampLine(prof && prof.name, 40),
  photo: cleanPic(prof && prof.photo, 120000),
  about: clampText(prof && prof.about, 400),
  years: (prof && typeof prof.years === 'number') ? Math.max(0, Math.min(60, Math.round(prof.years))) : null,
  links: cleanLink(prof && prof.links, 120)
});

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'share', 60))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }
  catch(e){ return fail(res, 413, 'too_large'); }

  const prog = body && body.program;
  if(!prog || !prog.name || !Array.isArray(prog.plans) || !prog.plans.length){
    return fail(res, 400, 'bad_program');
  }

  let id = rndId(8);
  let key = rndId(24);
  const now = new Date().toISOString();
  const by = String(body.by || '').slice(0, 40);
  let previous = null;
  const existing = body && body.existing;
  if(existing && /^[0-9a-z]{4,16}$/.test(String(existing.id||'')) && existing.key){
    const oldRaw = await store.get(`p:${existing.id}`);
    if(oldRaw){
      try{
        const old=JSON.parse(oldRaw);
        const given=require('crypto').createHash('sha256').update(String(existing.key)).digest('hex');
        if(sameSecret(given,old.keyHash||'') && (!old.by || !by || old.by===by)){
          previous=old; id=String(existing.id); key=String(existing.key);
        }
      }catch(_){}
    }
  }

  /* Профиль тренера и его счётчики.

     Ник закрепляется за ПЕРВЫМ, кто им воспользовался, и дальше правки профиля
     требуют ключа. Аккаунтов пока нет, и это единственная защита, которая без них
     возможна: иначе кто угодно переписал бы чужую страницу, назвавшись тем же ником.
     Ссылку при этом мы создаём в любом случае — чужой ник не повод ломать человеку
     отправку программы, просто его профиль на страницу не попадёт. */
  let trainerKey = null;
  if(by){
    const raw = await store.get(`t:${by}`);
    const prof = body.trainer && typeof body.trainer === 'object' ? body.trainer : null;
    if(!raw){
      trainerKey = rndId(24);
      await store.push('t:all', by);
      const face = faceOf(prof);
      if(!face.links) face.links = cleanLink(body.byLink, 120);
      await store.set(`t:${by}`, JSON.stringify(Object.assign({
        handle: by, since: now, seen: now,
        keyHash: require('crypto').createHash('sha256').update(trainerKey).digest('hex')
      }, face)));
    } else if(prof && body.trainerKey){
      let cur = null;
      try{ cur = JSON.parse(raw); }catch(e){}
      const given = require('crypto').createHash('sha256').update(String(body.trainerKey)).digest('hex');
      if(cur && sameSecret(given, cur.keyHash)){
        cur.seen = now;
        await store.set(`t:${by}`, JSON.stringify(Object.assign(cur, faceOf(prof))));
      }
    }
    await store.incr(`t:${by}:programs`);
  }
  // Ключ храним хешем: дамп базы не должен раздавать доступ к отчётам.
  const keyHash = require('crypto').createHash('sha256').update(key).digest('hex');

  const linkRec = Object.assign({}, previous || {}, {
    program: prog,
    by,
    byLink: cleanLink(body.byLink, 120),
    to: clampLine(body.to, 40),
    at: now,
    keyHash
  });
  await store.set(`p:${id}`, JSON.stringify(linkRec));

  // Если подопечный ранее сохранил эту ссылку в подтверждённом аккаунте, изменение
  // той же программы уже имеет точного адресата.
  if(previous && linkRec.clientMailHash){
    try{
      const araw=await store.get(`a:${linkRec.clientMailHash}`),acc=araw?JSON.parse(araw):{},en=acc&&acc.locale==='en';
      await sendPushToAccountHash(linkRec.clientMailHash,{
        category:'trainer',
        title:en?'Trainer updated your program':'Тренер обновил программу',
        body:en?`“${prog.name}” has a new version. Open it to review the changes.`:`У «${prog.name}» появилась новая версия. Открой её и проверь изменения.`,
        data:{stage:'trainer-program',linkId:id,category:'trainer'}
      });
    }catch(_){}
  }

  send(res, 200, Object.assign({id, key, at: now, updated:!!previous}, trainerKey ? {trainerKey} : {}));
};
