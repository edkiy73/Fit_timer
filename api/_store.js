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

const URL_ = process.env.KV_REST_API_URL || '';
const TOKEN = process.env.KV_REST_API_TOKEN || '';
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
