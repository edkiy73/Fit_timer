/* Баннер обновления Android (direct APK) с имитацией нативного моста.
   Проценты показываются один раз, загрузку можно отменить, ошибка предлагает
   «Повторить», а пересборка баннера (после сворачивания приложения) подхватывает
   уже идущую загрузку вместо того, чтобы начать всё сначала.

   Запуск:  node tests/dev-server.js 8124
            node tests/update-banner.js */

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
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(1000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(800); }

  // имитация нативной стороны: звонки записываются, результат загрузки отдаём вручную
  await page.evaluate(async () => {
    window.Capacitor = {getPlatform: () => 'android'};
    window.__calls = [];
    window.__native = {running: false, status: 'idle', progress: -1};
    window.FitNative = {
      isNative: true,
      getAppInfo: async () => ({build: 100, distribution: 'direct'}),
      installUpdate: (url, code) => { __calls.push('install:' + code); __native.running = true;
        return new Promise(r => { window.__finish = r; }); },
      cancelUpdate: async () => { __calls.push('cancel'); return true; },
      getUpdateState: async () => Object.assign({}, __native),
      resumeUpdateInstall: async () => ({status: 'missing'})
    };
    window.__emit = d => window.dispatchEvent(new CustomEvent('fitUpdateProgress', {detail: d}));
    window.__cfg = {direct: {latestCode: 200, latestName: '1.0.200', url: 'https://example.com/a.apk'}};
    goTab('scrMenu');
    await applyAndroidUpdateConfig(__cfg);
  });
  const view = () => page.evaluate(() => ({
    shown: !$('appUpdateBanner').classList.contains('hidden'),
    text: $('appUpdateText').textContent,
    action: $('appUpdateBanner').querySelector('.ub-action').textContent,
    calls: __calls.join(',')
  }));

  let v = await view();
  ok('баннер показан с «Обновить»', v.shown && v.action === 'Обновить', v.action);

  await page.click('#appUpdateBanner');
  await page.evaluate(() => __emit({status: 'downloading', progress: 40}));
  v = await view();
  ok('загрузка стартовала', v.calls === 'install:200', v.calls);
  ok('процент показан один раз, на кнопке — «Отменить»',
     /40%/.test(v.text) && v.action === 'Отменить' && !/%/.test(v.action), `${v.text} | ${v.action}`);

  // баннер пересобрался посреди загрузки (например, после сворачивания)
  await page.evaluate(async () => {
    __native = {running: true, status: 'downloading', progress: 55};
    await applyAndroidUpdateConfig(__cfg);
  });
  v = await view();
  ok('после пересборки загрузка подхвачена, а не сброшена', /55%/.test(v.text) && v.action === 'Отменить', `${v.text} | ${v.action}`);

  await page.click('#appUpdateBanner');
  v = await view();
  ok('нажатие во время загрузки отменяет её, а не запускает новую',
     v.calls === 'install:200,cancel', v.calls);
  await page.evaluate(() => { __emit({status: 'cancelled'}); __native = {running: false, status: 'cancelled'}; __finish({status: 'cancelled'}); });
  await page.waitForTimeout(100);
  v = await view();
  ok('после отмены — снова «Обновить»', v.action === 'Обновить' && !/%/.test(v.text), `${v.text} | ${v.action}`);

  await page.click('#appUpdateBanner');
  await page.evaluate(() => { __emit({status: 'error', error: 'update_http_500'}); __native = {running: false, status: 'error'}; __finish({status: 'error'}); });
  await page.waitForTimeout(100);
  v = await view();
  ok('ошибка объяснена и предлагает «Повторить»', v.action === 'Повторить' && /Повторить/.test(v.text), `${v.text} | ${v.action}`);

  await page.evaluate(async () => { await applyAndroidUpdateConfig(__cfg); });
  v = await view();
  ok('ошибка не теряется при пересборке баннера', v.action === 'Повторить', v.action);

  await page.click('#appUpdateBanner');
  v = await view();
  ok('«Повторить» запускает загрузку заново', v.calls === 'install:200,cancel,install:200,install:200', v.calls);

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
