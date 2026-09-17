/* POST /api/report — клиент отправляет тренеру, как у него дела.

   Отправляет по-прежнему САМ человек, кнопкой: сервер ничего не собирает сам и
   ничего не шлёт в фоне. Поменялось только то, что отчёт уезжает по сети, а не
   копипастом ссылки, — копипаст тренер и клиент делали по разу на каждый отчёт,
   и это ровно то место, где связь рвалась.

   Отчёт привязан к ССЫЛКЕ, а не к человеку: сервер не знает, кто такой клиент, и
   ему незачем. Имя в отчёте — то, что человек сам написал у себя в профиле. */

const { store } = require('./_store');
const { send, fail, readBody, rateOk, cors } = require('./_util');

const MAX_REPORTS = 200;

module.exports = async (req, res) => {
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');
  if(!(await rateOk(req, 'report', 60))) return fail(res, 429, 'rate_limited');

  let body;
  try{ body = await readBody(req); }
  catch(e){ return fail(res, 413, 'too_large'); }

  const id = (body && body.link) || '';
  if(!/^[0-9a-z]{4,16}$/.test(id)) return fail(res, 400, 'bad_id');
  if(!(await store.get(`p:${id}`))) return fail(res, 404, 'not_found');

  const r = body.report || {};
  if(typeof r.n !== 'number' || r.n < 0) return fail(res, 400, 'bad_report');

  const n = await store.list(`p:${id}:reports`);
  if(n.length >= MAX_REPORTS) return fail(res, 429, 'too_many');

  // Кладём только то, что показываем. Лишние поля из клиента на сервер не едут:
  // чего не сохранили, то не утечёт и то не надо объяснять в политике.
  await store.push(`p:${id}:reports`, JSON.stringify({
    at: new Date().toISOString(),
    who: String(r.who || '').slice(0, 40),
    name: String(r.name || '').slice(0, 80),
    n: Math.min(9999, Math.round(r.n)),
    sec: Math.min(9999999, Math.round(+r.sec || 0)),
    streak: Math.min(999, Math.round(+r.streak || 0)),
    first: String(r.first || '').slice(0, 10),
    last: String(r.last || '').slice(0, 10),
    ex: (Array.isArray(r.ex) ? r.ex : []).slice(0, 6).map(e => ({
      n: String(e.n || '').slice(0, 60),
      a: String(e.a || '').slice(0, 24),
      b: String(e.b || '').slice(0, 24)
    }))
  }));

  send(res, 200, {ok: true});
};
