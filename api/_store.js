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

async function call(cmd){
  const res = await fetch(URL_, {
    method: 'POST',
    headers: {Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify(cmd)
  });
  if(!res.ok) throw new Error('store ' + res.status);
  const data = await res.json();
  return data.result;
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

  async list(key){
    if(!live()) return JSON.parse(memGet(key) || '[]');
    return (await call(['LRANGE', key, '0', '-1'])) || [];
  }
};

module.exports = { store };
