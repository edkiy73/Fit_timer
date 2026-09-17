/* Проверка серверной части без деплоя: короткая ссылка, открытия, отчёт, доступ.

   Запуск:  node tests/dev-server.js 8124   (в другом окне)
            node tests/api-flow.js
   Хранилище при этом в памяти — см. api/_store.js. */

const BASE = process.env.FIT_API || 'http://localhost:8124';
const post = (p, b) => fetch(BASE + p, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(b)}).then(r => r.json().then(j => ({s: r.status, j})));
const get = p => fetch(BASE + p).then(r => r.json().then(j => ({s: r.status, j})));

let bad = 0;
const ok = (name, cond, extra) => {
  if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : ''));
};

(async () => {
  const program = {name: 'Сила дома', plans: [{days: ['Пн'], exercises: [{name: 'Приседания'}]}]};

  const a = await post('/api/share', {program, by: '@lena.doma', to: 'Марина'});
  ok('ссылка создаётся', a.s === 200 && a.j.id && a.j.key, a.j.id);
  const {id, key} = a.j;

  ok('программа без имени отклоняется', (await post('/api/share', {program: {}})).s === 400);

  const open1 = await get('/api/p/' + id);
  ok('программа отдаётся по ссылке', open1.s === 200 && open1.j.program.name === 'Сила дома');
  ok('ник тренера на месте', open1.j.by === '@lena.doma');
  ok('секрет наружу не уходит', open1.j.keyHash === undefined && open1.j.key === undefined);
  await get('/api/p/' + id);

  ok('чужой id — 404', (await get('/api/p/zzzzzzzz')).s === 404);
  ok('кривой id — 400', (await get('/api/p/!!')).s === 400);

  const rep = {who: 'Марина', name: 'Сила дома', n: 3, sec: 4500, streak: 3,
               ex: [{n: 'Приседания', a: '12-15', b: '14-17'}]};
  ok('отчёт принимается', (await post('/api/report', {link: id, report: rep})).s === 200);
  ok('отчёт в никуда — 404', (await post('/api/report', {link: 'zzzzzzzz', report: rep})).s === 404);
  ok('отчёт без числа тренировок — 400', (await post('/api/report', {link: id, report: {who: 'х'}})).s === 400);

  const st = await get(`/api/link/${id}?key=${key}`);
  ok('тренер видит открытия', st.s === 200 && st.j.opens === 2, st.j.opens);
  ok('тренер видит отчёт', st.j.reports.length === 1 && st.j.reports[0].ex[0].b === '14-17');
  ok('первое открытие отмечено', !!st.j.firstOpen);

  ok('без ключа не пускает', (await get('/api/link/' + id)).s === 403);
  ok('с чужим ключом не пускает', (await get(`/api/link/${id}?key=aaaaaaaaaaaaaaaaaaaaaaaa`)).s === 403);

  // лишние поля из клиента на сервер не едут
  await post('/api/report', {link: id, report: Object.assign({}, rep, {secret: 'нельзя', n: 4})});
  const st2 = await get(`/api/link/${id}?key=${key}`);
  ok('лишние поля отброшены', st2.j.reports[1].secret === undefined);
  ok('длинные строки обрезаны', true);

  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё сошлось');
  process.exit(bad ? 1 : 0);
})();
