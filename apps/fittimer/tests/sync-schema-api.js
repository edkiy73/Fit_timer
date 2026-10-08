/* Сервер синхронизации не принимает программы и статистику старой схемы данных:
   приложение до модели упражнений V2 не перезапишет и не удалит документы новой формы.
   Запуск сервера: ADMIN_KEY=testadminkey123456 GEMINI_API_KEY=test AI_TEST_MODE=1 node tests/dev-server.js 8124 */
const BASE = process.env.FIT_URL || 'http://localhost:8124';
const MAIL = 'schema-' + Math.random().toString(36).slice(2, 8) + '@example.com';
const post = async (path, body) => {
  const r = await fetch(BASE + path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  return {status:r.status, body:await r.json()};
};
let bad = 0;
const ok = (name, value, extra) => { if(!value) bad++; console.log((value ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra ? '  → ' + extra : '')); };

(async () => {
  const sent = await post('/api/auth', {action:'send', email:MAIL});
  const login = await post('/api/auth', {action:'verify', email:MAIL, code:sent.body.devCode, deviceId:'schema-dev',
    sub:{plan:'year', since:'2026-09-19', until:'2099-09-19', currency:'RUB', price:2990}});
  const auth = {action:'push', email:MAIL, token:login.body.syncToken, deviceId:'schema-dev'};
  const doc = (schema, value) => ({profileId:'u1', key:'program:p1', rev:1, at:new Date().toISOString(), schema, value});
  const fresh = await post('/api/sync', Object.assign({}, auth, {profiles:[{user:{id:'u1', name:'A'}, at:new Date().toISOString()}],
    docs:[doc(2, JSON.stringify({id:'p1', name:'V2'}))]}));
  ok('документ схемы 2 принимается', fresh.status === 200 && !fresh.body.outdated, JSON.stringify(fresh.body));
  const old = await post('/api/sync', Object.assign({}, auth, {docs:[Object.assign(doc(1, JSON.stringify({id:'p1', name:'old'})), {rev:2, base:1})]}));
  ok('старая схема отклоняется и просит обновиться', old.status === 200 && old.body.upgradeRequired === true
    && old.body.outdated.some(x => x.key === 'program:p1'), JSON.stringify(old.body));
  const pulled = await post('/api/sync', Object.assign({}, auth, {action:'pull'}));
  const docs = JSON.stringify(pulled.body);
  ok('на сервере осталась программа V2', /V2/.test(docs) && !/"old"/.test(docs));
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
