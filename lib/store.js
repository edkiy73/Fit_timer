/* Хранилище для серверной части.

   Всё общение с базой идёт ЧЕРЕЗ ЭТОТ ФАЙЛ и только через него. Причина не в
   красоте: где физически лежат данные — это решение про рынок и 152-ФЗ, а не про
   архитектуру, и его придётся принимать отдельно. Пока оно не принято, менять
   хостинг должно стоить одну правку здесь, а не переписывание эндпоинтов.

   Сейчас поддержаны:
   • Upstash Redis по REST — то, что подключает интеграция Vercel (переменные
     KV_REST_API_URL и KV_REST_API_TOKEN появляются сами);
   • память процесса — для локального запуска и тестов. На serverless она живёт
     ровно до конца холодного старта, поэтому в бою это НЕ хранилище. */

/* Имена переменных зависят от того, ЧЕМ подключили базу, и это ровно та грабля, на
   которой всё встаёт молча: интеграция Upstash кладёт UPSTASH_REDIS_REST_*, прежнее
   Vercel KV клало KV_REST_API_*. Человек всё подключил правильно, а сервер отвечает
   «базы нет». Поэтому принимаем оба набора и не заставляем никого угадывать. */
const PAIRS = [
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
  ['REDIS_REST_URL', 'REDIS_REST_TOKEN']
];
const found = PAIRS.find(([u, t]) => process.env[u] && process.env[t]) || [];
const URL_ = found[0] ? process.env[found[0]] : '';
const TOKEN = found[1] ? process.env[found[1]] : '';
const mem = new Map();                 // локальный запуск: ключ -> {v, exp}
const YEAR = 365 * 24 * 3600;

const live = () => !!(URL_ && TOKEN);
// Память процесса на serverless живёт до конца холодного старта, то есть молча
// теряет данные. Поэтому она включается только явным флагом — его ставит локальный
// сервер и тесты. В бою без настроенной базы эндпоинт честно отвечает 503, а не
// делает вид, что сохранил.
const memOk = () => process.env.ALLOW_MEMORY_STORE === '1';

async function post(path, body){
  const res = await fetch(URL_ + path, {
    method: 'POST',
    headers: {Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error('store ' + res.status);
  return res.json();
}
async function call(cmd){
  return (await post('', cmd)).result;
}
/* Несколько команд ОДНИМ запросом.

   Дело не в красоте: функция и база стоят в разных местах, и каждое обращение —
   это полный путь туда и обратно. Пять команд подряд превращались в пять таких
   путей, то есть в секунды ожидания на ровном месте. Здесь они едут вместе. */
async function pipe(cmds){
  if(!cmds.length) return [];
  if(!live()){
    const out = [];
    for(const c of cmds) out.push(await memCmd(c));
    return out;
  }
  const data = await post('/pipeline', cmds);
  return (Array.isArray(data) ? data : []).map(x => x && x.result);
}
// то же самое в памяти — чтобы локальный запуск вёл себя так же, а не «почти так же»
async function memCmd(c){
  const [op, key, ...rest] = c;
  if(op === 'GET') return memGet(key);
  if(op === 'SET'){
    if(rest.includes('NX') && memGet(key) != null) return null;   // уже было — не трогаем
    mem.set(key, {v: rest[0], exp: Date.now() + (+rest[2] || YEAR) * 1000});
    return 'OK';
  }
  if(op === 'INCR'){ const n = (+memGet(key) || 0) + 1; mem.set(key, {v: String(n), exp: Date.now() + YEAR * 1000}); return n; }
  if(op === 'RPUSH'){ const a = JSON.parse(memGet(key) || '[]'); a.push(rest[0]); mem.set(key, {v: JSON.stringify(a), exp: Date.now() + YEAR * 1000}); return a.length; }
  if(op === 'LRANGE') return JSON.parse(memGet(key) || '[]');
  if(op === 'DEL'){ const had = mem.has(key); mem.delete(key); return had ? 1 : 0; }
  if(op === 'EXPIRE') return 1;
  if(op === 'MGET') return [key].concat(rest).map(k => memGet(k));
  return null;
}

function memGet(key){
  const rec = mem.get(key);
  if(!rec) return null;
  if(rec.exp && rec.exp < Date.now()){ mem.delete(key); return null; }
  return rec.v;
}

const store = {
  // хранилище не настроено — это не ошибка запроса, а состояние «сервер без базы»
  configured: () => live() || memOk(),

  // Что видно снаружи: какими переменными подключено и подключено ли вообще.
  // Значения не отдаём НИКОГДА — только имена, иначе токен уедет в ответ.
  info(){
    // Какие переменные про хранилище функция вообще видит. Это главное, что нужно
    // знать при разборе: «имена не те» и «переменных нет вовсе» — разные беды с
    // разным лечением, а без списка их не различить.
    const seen = Object.keys(process.env)
      .filter(k => /^(KV_|REDIS_|UPSTASH_)/.test(k))
      .sort();
    return {
      connected: live(),
      vars: found.length ? found : null,
      seen,
      memory: !live() && memOk(),
      // Адрес для HTTP есть, а пара не сложилась — значит, не хватает токена
      // (частый случай: подставился только READ_ONLY, писать им нельзя).
      restUrl: PAIRS.some(([u]) => process.env[u]),
      // Совсем другой случай: базу подключили строкой для обычного клиента, а
      // функции ходят по HTTP и таким адресом пользоваться не могут. Проверять
      // его можно только ПОСЛЕ restUrl, иначе совет уводит не туда.
      redisUrlOnly: !live() && !PAIRS.some(([u]) => process.env[u])
        && !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL),
      // Что именно сейчас запущено. Без этого нельзя отличить «не настроено» от
      // «настроено, но работает старая сборка, в которую переменные не попали», —
      // а это самый частый случай: переменные подставляются в момент сборки.
      build: {
        env: process.env.VERCEL_ENV || null,
        commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
        region: process.env.VERCEL_REGION || null,
        onVercel: !!process.env.VERCEL
      }
    };
  },

  /* Настоящая проверка — прогнать ВСЕ операции, которыми пользуется приложение, и
     назвать ту, что сломалась.

     Наличие переменных не доказывает ничего: токен бывает просроченным, база
     выключенной, а у некоторых хранилищ нет списков — и тогда программа отдаётся
     (это GET), а отчёты молча не сохраняются (это RPUSH). Ровно так и выглядела
     беда, которую иначе пришлось бы искать гаданием. */
  async selfTest(){
    const k = 'healthcheck:' + Date.now() + ':' + Math.random().toString(36).slice(2);
    const val = 'ok-' + Math.random().toString(36).slice(2);
    const steps = [];
    const step = async (name, fn) => {
      try{ await fn(); steps.push({name, ok: true}); }
      catch(e){ steps.push({name, ok: false, err: (e && e.message) || String(e)}); }
    };

    await step('запись (SET)',        async ()=> { await store.set(k, val, 60); });
    await step('чтение (GET)',        async ()=> {
      const back = await store.get(k);
      if(back !== val) throw new Error(`записали ${JSON.stringify(val)}, прочитали ${JSON.stringify(back)}`);
    });
    await step('счётчик (INCR)',      async ()=> {
      const n = await store.incr(k + ':n', 60);
      if(n !== 1) throw new Error('первый счёт вернул ' + n + ', а должен 1');
    });
    await step('список (RPUSH)',      async ()=> { await store.push(k + ':l', 'раз', 60); });
    await step('чтение списка (LRANGE)', async ()=> {
      const arr = await store.list(k + ':l');
      if(!Array.isArray(arr) || arr[0] !== 'раз'){
        throw new Error('вернулось ' + JSON.stringify(arr));
      }
    });

    const bad = steps.find(x => !x.ok);
    if(bad) throw Object.assign(new Error(`${bad.name}: ${bad.err}`), {steps});
    return steps;
  },

  async get(key){
    if(!live()) return memGet(key);
    const raw = await call(['GET', key]);
    return raw == null ? null : raw;
  },

  async set(key, value, ttl = YEAR){
    if(!live()){ mem.set(key, {v: value, exp: Date.now() + ttl * 1000}); return; }
    await call(['SET', key, value, 'EX', String(ttl)]);
  },

  // счётчик с временем жизни: на нём стоят и открытия ссылки, и ограничение частоты
  async incr(key, ttl = YEAR){
    if(!live()){
      const n = (+memGet(key) || 0) + 1;
      mem.set(key, {v: String(n), exp: Date.now() + ttl * 1000});
      return n;
    }
    const n = await call(['INCR', key]);
    if(n === 1) await call(['EXPIRE', key, String(ttl)]);
    return n;
  },

  // список отчётов по ссылке: добавляем в конец, читаем целиком — их единицы
  async push(key, value, ttl = YEAR){
    if(!live()){
      const arr = JSON.parse(memGet(key) || '[]');
      arr.push(value);
      mem.set(key, {v: JSON.stringify(arr), exp: Date.now() + ttl * 1000});
      return arr.length;
    }
    const n = await call(['RPUSH', key, value]);
    await call(['EXPIRE', key, String(ttl)]);
    return n;
  },

  /* Стереть насовсем. Нужно ровно там, где человек попросил себя забыть: пометка
     «удалено» на записи с именем и фотографией — это не удаление, а обещание не
     показывать. 152-ФЗ требует первого, а не второго. */
  async del(key){
    if(!live()){ const had = mem.has(key); mem.delete(key); return had ? 1 : 0; }
    return await call(['DEL', key]);
  },

  async list(key){
    if(!live()) return JSON.parse(memGet(key) || '[]');
    return (await call(['LRANGE', key, '0', '-1'])) || [];
  },

  // SCAN нужен только для редких служебных миграций/починки индексов.
  // KEYS не используем: на большой базе он блокирует Redis целиком.
  async scan(pattern, limit = 100000){
    pattern = String(pattern || '*');
    limit = Math.max(1, Math.min(100000, Math.round(+limit || 100000)));
    if(!live()){
      const escaped = pattern.replace(/[.+^$(){}|\\]/g, '\\$&')
        .replace(/\*/g, '.*').replace(/\?/g, '.');
      const re = new RegExp('^' + escaped + '$');
      return [...mem.keys()].filter(k => memGet(k) != null && re.test(k)).slice(0, limit);
    }
    let cursor = '0';
    const out = [];
    do{
      const page = await call(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '500']);
      cursor = String(page && page[0] != null ? page[0] : '0');
      const keys = Array.isArray(page && page[1]) ? page[1] : [];
      out.push(...keys);
    }while(cursor !== '0' && out.length < limit);
    return out.slice(0, limit);
  },

  // Несколько команд одним обращением. Список пар [команда, ключ, …].
  pipe,

  // Прочитать много ключей разом. Список из ста программ — это один запрос,
  // а не сто: обход в цикле и был причиной, по которой каталог открывался секундами.
  async many(keys){
    if(!keys.length) return [];
    if(!live()) return keys.map(k => memGet(k));
    return (await call(['MGET'].concat(keys))) || [];
  }
};

module.exports = { store };
