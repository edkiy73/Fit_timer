/* POST /api/report — клиент отправляет тренеру, как у него дела.

   Отправляет по-прежнему САМ человек, кнопкой: сервер ничего не собирает сам и
   ничего не шлёт в фоне. Поменялось только то, что отчёт уезжает по сети, а не
   копипастом ссылки, — копипаст тренер и клиент делали по разу на каждый отчёт,
   и это ровно то место, где связь рвалась.

   Отчёт привязан к ССЫЛКЕ, а не к человеку: сервер не знает, кто такой клиент, и
   ему незачем. Имя в отчёте — то, что человек сам написал у себя в профиле. */
require('../lib/product');

const { store } = require('../../../packages/core/server/store');
const { send, fail, readBody, rateOk, cors, sameSecret } = require('../../../packages/core/server/util');
const crypto = require('crypto');
const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');

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

  // Account auth здесь опционален: старые/гостевые клиенты продолжают отправлять
  // link-scoped отчёт. Если пользователь вошёл, сервер сам привязывает запись к
  // account hash, чтобы delete account мог удалить только его отчёты.
  let accountHash = '';
  const email = String((body && body.email) || '').trim().toLowerCase().slice(0,120);
  const deviceId = String((body && body.deviceId) || '').trim().slice(0,80);
  const token = String((body && body.token) || '');
  if(email && deviceId && token && /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/.test(email)){
    const mh = sha(email).slice(0,32);
    let acc = null;
    try{ acc = JSON.parse(await store.get(`a:${mh}`)); }catch(_){}
    const device = acc && acc.syncDevices && acc.syncDevices[deviceId];
    if(device && sameSecret(sha(token), device.h || '')) accountHash = mh;
  }

  // ID ссылки публичный, поэтому одним знанием адреса нельзя позволять забить
  // тренеру сотни фальшивых отчётов. Лимит общий на ссылку, а не только на IP.
  const day = new Date().toISOString().slice(0, 10);
  const daily = await store.incr(`reportday:${id}:${day}`, 2 * 24 * 3600);
  if(daily > 50) return fail(res, 429, 'too_many_today');

  const n = await store.list(`p:${id}:reports`);
  if(n.length >= MAX_REPORTS) return fail(res, 429, 'too_many');

  // Кладём только то, что показываем, и каждое поле подрезаем по длине. Лишнее из
  // клиента на сервер не едет: чего не сохранили, то не утечёт и то не надо
  // объяснять в политике.
  const str = (v, n) => String(v == null ? '' : v).slice(0, n);
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(+v || 0)));
  const arr = (v, n) => Array.isArray(v) ? v.slice(0, n) : [];

  await store.push(`p:${id}:reports`, JSON.stringify({
    at: new Date().toISOString(),
    v: 2,
    _account: accountHash || undefined,
    who: str(r.who, 40),
    name: str(r.name, 80),
    n: num(r.n, 9999),
    sec: num(r.sec, 9999999),
    streak: num(r.streak, 999),
    first: str(r.first, 10),
    last: str(r.last, 10),
    // журнал тренировок: дата, вариант, длительность
    log: arr(r.log, 30).map(x => ({d: str(x.d, 10), p: num(x.p, 20), sec: num(x.sec, 99999)})),
    // варианты программы и сколько раз каждый сделан
    plans: arr(r.plans, 10).map(x => ({i: num(x.i, 20), days: str(x.days, 40),
                                       n: num(x.n, 9999), sec: num(x.sec, 99999)})),
    // рост нагрузки по всем вариантам, разминка помечена
    ex: arr(r.ex, 40).map(e => ({
      p: num(e.p, 20), w: e.w ? 1 : 0,
      n: str(e.n, 60), a: str(e.a, 32), b: str(e.b, 32)
    })),
    // что клиент поменял в присланном
    diff: {
      add: arr(r.diff && r.diff.add, 12).map(x => str(x, 60)),
      del: arr(r.diff && r.diff.del, 12).map(x => str(x, 60)),
      mod: arr(r.diff && r.diff.mod, 12).map(x => ({
        n: str(x.n, 60), a: str(x.a, 40), b: str(x.b, 40)
      }))
    }
  }));

  send(res, 200, {ok: true});
};
