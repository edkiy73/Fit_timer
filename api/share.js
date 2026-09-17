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
const { send, fail, readBody, rateOk, rndId, cors } = require('./_util');

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
  // Ключ храним хешем: дамп базы не должен раздавать доступ к отчётам.
  const keyHash = require('crypto').createHash('sha256').update(key).digest('hex');

  await store.set(`p:${id}`, JSON.stringify({
    program: prog,
    by: body.by || '',
    byLink: body.byLink || '',
    to: body.to || '',          // подпись «для кого» — её пишет тренер у себя
    at: now,
    keyHash
  }));

  send(res, 200, {id, key, at: now});
};
