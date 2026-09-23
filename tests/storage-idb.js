/* Хранилище на IndexedDB.
   1) Данные старой версии из localStorage переезжают сами и не теряются.
   2) Программы с картинками больше лимита localStorage (~5–10 МБ) сохраняются.
   3) Если записать некуда, человек видит сообщение, а синхронизация не ставит в очередь
      то, чего локально нет.

   Запуск:  node tests/dev-server.js 8124
            node tests/storage-idb.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));

  // 1) «старая версия»: данные только в localStorage
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.evaluate(() => {
    localStorage.clear();
    const u = {id: 'u1', name: 'Лена', gender: 'f', age: 30, theme: 'system', locale: 'system'};
    localStorage.setItem('users', JSON.stringify([u]));
    localStorage.setItem('currentUser', 'u1');
    localStorage.setItem('customPrograms_u1', JSON.stringify([{id: 'old', name: 'Старая программа',
      plans: [{days: ['Пн'], rounds: 1, roundRest: 0, exercises: [{name: 'Планка', type: 'time', value: 30, rest: 10}]}]}]));
    localStorage.setItem('account', JSON.stringify({email: '', biometry: null}));
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(1500);
  const mig = await page.evaluate(async () => ({
    prog: customPrograms.some(p => p.id === 'old'),
    lsProg: localStorage.getItem('customPrograms_u1'),
    idb: await kvReq('readonly', st => st.get('customPrograms_u1')),
    lsAccount: localStorage.getItem('account')
  }));
  ok('данные старой версии на месте', mig.prog);
  ok('и переехали в IndexedDB', !!mig.idb && /Старая программа/.test(mig.idb));
  ok('копия в localStorage освобождена', mig.lsProg === null, String(mig.lsProg).slice(0, 20));
  ok('аккаунт остаётся и в localStorage (читается синхронно на старте)', !!mig.lsAccount);

  // 2) программы больше лимита localStorage
  const size = await page.evaluate(async () => {
    const pic = 'data:image/jpeg;base64,' + 'A'.repeat(100 * 1024);
    for(let n = 0; n < 12; n++){
      customPrograms.push({id: 'big' + n, name: 'Большая ' + n, cover: pic,
        plans: [{days: ['Вт'], rounds: 1, roundRest: 0, exercises: Array.from({length: 10}, (_, i) =>
          ({name: 'У' + i, type: 'reps', value: 10, rest: 10, media: {kind: 'img', data: pic}}))}]});
    }
    await savePrograms();
    return JSON.stringify(customPrograms).length;
  });
  await page.reload({waitUntil: 'load'});
  await page.waitForTimeout(1500);
  const big = await page.evaluate(() => customPrograms.filter(p => /^big/.test(p.id)).length);
  ok('программы на ' + Math.round(size / 1048576) + ' МБ сохраняются и переживают перезапуск', big === 12, big + ' из 12');

  // 3) записать некуда: ни IndexedDB, ни localStorage
  const fail = await page.evaluate(async () => {
    kvDbPromise = Promise.resolve(null);
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function(){ throw new DOMException('full', 'QuotaExceededError'); };
    const before = outbox.length;
    customPrograms[0].name = 'Правка, которую некуда записать';
    await savePrograms();
    Storage.prototype.setItem = orig;
    return {msg: (document.getElementById('dlgMsg') || {}).textContent || '', queued: outbox.length - before};
  });
  ok('человеку сказано, что место кончилось', /места/.test(fail.msg), fail.msg.slice(0, 60));
  ok('несохранённое не ушло в очередь синхронизации', fail.queued === 0, fail.queued);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
