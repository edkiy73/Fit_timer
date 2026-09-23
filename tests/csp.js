/* Политика безопасности контента (CSP) из vercel.json не ломает приложение и админку.

   Заголовок запрещает встроенные скрипты и чужие источники. Если в разметку снова
   попадёт <script> без src, onclick="…" или запрос на чужой домен, браузер молча это
   заблокирует — кнопка просто перестанет работать. Тест ходит по разделам приложения
   и входит в админку, ловя каждое нарушение политики.

   Запуск:  ADMIN_KEY=testadminkey123456 node tests/dev-server.js 8124
            node tests/csp.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ADMIN_KEY = process.env.ADMIN_KEY || 'testadminkey123456';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

async function watched(b){
  const page = await (await b.newContext({viewport: {width: 412, height: 900}, locale: 'ru-RU'})).newPage();
  const violations = [];
  await page.exposeFunction('__cspViolation', v => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e =>
      window.__cspViolation(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + (e.lineNumber || '')));
  });
  page.on('console', m => { if(/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  return {page, violations, errs};
}

(async () => {
  const b = await chromium.launch({executablePath: CHROME});

  // ---- заголовки на месте ----
  const res = await fetch(BASE + '/index.html');
  const csp = res.headers.get('content-security-policy') || '';
  ok('CSP отдаётся', /script-src 'self'/.test(csp) && /frame-ancestors 'none'/.test(csp));
  ok('встроенные скрипты запрещены', !/script-src[^;]*unsafe-inline/.test(csp) && !/unsafe-eval/.test(csp));
  ok('nosniff отдаётся', res.headers.get('x-content-type-options') === 'nosniff');
  const adm = await fetch(BASE + '/admin.html');
  ok('CSP есть и у админки', (adm.headers.get('content-security-policy') || '') === csp);

  // ---- приложение ----
  const app = await watched(b);
  await app.page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await app.page.waitForTimeout(2000);
  if(await app.page.isVisible('#obStart')){ await app.page.click('#obStart'); await app.page.waitForTimeout(1500); }
  const dock = await app.page.$$('.dock-btn:not(.hidden)');
  for(const btn of dock){ await btn.click(); await app.page.waitForTimeout(500); }
  ok('обработчики работают: разделы переключаются', dock.length >= 3 && await app.page.evaluate(() => !!document.querySelector('.screen.on')), dock.length);
  ok('приложение без нарушений CSP', app.violations.length === 0, app.violations.slice(0, 3).join(' | '));
  ok('приложение без ошибок JS', app.errs.length === 0, app.errs.slice(0, 3).join(' | '));

  // ---- админка ----
  const admin = await watched(b);
  await admin.page.goto(BASE + '/admin.html', {waitUntil: 'load'});
  await admin.page.fill('#key', ADMIN_KEY);
  await admin.page.click('#enter');
  await admin.page.waitForTimeout(2000);
  const gateHidden = await admin.page.evaluate(() => {
    const g = document.getElementById('gate');
    return !g || g.classList.contains('hidden') || getComputedStyle(g).display === 'none';
  });
  ok('вход в админку работает', gateHidden);
  const stored = await admin.page.evaluate(() => ({ls: localStorage.getItem('adminKey'), ss: sessionStorage.getItem('adminKey')}));
  ok('ключ админа не лежит в localStorage', stored.ls === null && stored.ss === ADMIN_KEY);
  ok('админка без нарушений CSP', admin.violations.length === 0, admin.violations.slice(0, 3).join(' | '));
  ok('админка без ошибок JS', admin.errs.length === 0, admin.errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(bad ? `\nПлохо: ${bad}` : '\nВсё хорошо');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
