/* POST /api/share — положить программу на сервер и получить короткую ссылку.

   Зачем это вместо прежней ссылки, в которую программа упакована целиком:
   • ссылка становится короткой и не разваливается в мессенджерах;
   • видно, открыл ли клиент её вообще, — без этого тренеру нечего смотреть;
   • обратный отчёт клиента приезжает сам, а не копипастом.

   Аккаунтов здесь нет намеренно. Пара id + key заменяет их: id лежит в ссылке и
   открыт всем, кому её переслали, key остаётся у тренера в телефоне и нужен,
   чтобы ЧИТАТЬ статистику и отчёты. Этого хватает, пока продавать нечего, и это
   не мешает завести настоящие аккаунты потом. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, rndId, sameSecret, cors } = require('./_util');

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

  const id = rndId(8);
  const key = rndId(24);
  const now = new Date().toISOString();
  const by = String(body.by || '').slice(0, 40);

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
      await store.set(`t:${by}`, JSON.stringify({
        handle: by, since: now, seen: now,
        keyHash: require('crypto').createHash('sha256').update(trainerKey).digest('hex'),
        name: String((prof && prof.name) || '').slice(0, 40),
        photo: String((prof && prof.photo) || '').slice(0, 120000),
        about: String((prof && prof.about) || '').slice(0, 400),
        years: (prof && typeof prof.years === 'number') ? Math.max(0, Math.min(60, Math.round(prof.years))) : null,
        links: String((prof && prof.links) || body.byLink || '').slice(0, 120)
      }));
    } else if(prof && body.trainerKey){
      let cur = null;
      try{ cur = JSON.parse(raw); }catch(e){}
      const given = require('crypto').createHash('sha256').update(String(body.trainerKey)).digest('hex');
      if(cur && sameSecret(given, cur.keyHash)){
        cur.seen = now;
        cur.name  = String(prof.name || '').slice(0, 40);
        cur.photo = String(prof.photo || '').slice(0, 120000);
        cur.about = String(prof.about || '').slice(0, 400);
        cur.years = typeof prof.years === 'number' ? Math.max(0, Math.min(60, Math.round(prof.years))) : null;
        cur.links = String(prof.links || '').slice(0, 120);
        await store.set(`t:${by}`, JSON.stringify(cur));
      }
    }
    await store.incr(`t:${by}:programs`);
  }
  // Ключ храним хешем: дамп базы не должен раздавать доступ к отчётам.
  const keyHash = require('crypto').createHash('sha256').update(key).digest('hex');

  await store.set(`p:${id}`, JSON.stringify({
    program: prog,
    by,
    byLink: body.byLink || '',
    to: body.to || '',          // подпись «для кого» — её пишет тренер у себя
    at: now,
    keyHash
  }));

  send(res, 200, Object.assign({id, key, at: now}, trainerKey ? {trainerKey} : {}));
};
