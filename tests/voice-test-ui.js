/* Проверка распознавания в настройках: строки «что услышал телефон → что
   сделает приложение» и освобождение микрофона при любом закрытии окна.
   Нативный мост подменяется — сам Vosk здесь не запускается.

   Запуск:  node tests/dev-server.js 8124
            node tests/voice-test-ui.js */

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

  await page.evaluate(async () => {
    window.__vt = {started: 0, stopped: 0};
    window.FitNative = Object.assign({}, window.FitNative, {
      offlineVoice: true,
      getVoiceModelStatus: async () => ({installed: true, language: 'ru'}),
      startVoiceRecognition: async () => { window.__vt.started++; return true; },
      stopVoiceRecognition: async () => { window.__vt.stopped++; }
    });
    await refreshVoicePackUI();
  });
  ok('кнопка проверки видна, когда голосовой пакет скачан', await page.evaluate(() => !$('btnVoiceTest').classList.contains('hidden')));

  await page.evaluate(() => openVoiceTest());
  await page.waitForTimeout(100);
  ok('окно открылось и микрофон включён', await page.isVisible('#voiceTestModal') && await page.evaluate(() => window.__vt.started === 1));

  await page.evaluate(() => {
    const heard = d => window.dispatchEvent(new CustomEvent('fitVoiceHeard', {detail: d}));
    heard({text: '[unk]', kind: '', accepted: false});
    heard({text: 'готово', kind: 'next', accepted: true, confidence: .9});
    heard({text: 'пауза', kind: 'pause', accepted: false, confidence: .2});
  });
  const rows = await page.$$eval('#voiceTestList .vt-row', xs => xs.map(x => x.textContent + (x.classList.contains('ok') ? ' [ok]' : '')));
  ok('свежая строка сверху, неуверенное помечено', /пауза.*не расслышал уверенно/.test(rows[0] || ''), rows[0]);
  ok('принятая команда названа и выделена', /готово.*Дальше.*\[ok\]/.test(rows[1] || ''), rows[1]);
  ok('посторонний звук — не команда', /посторонний звук.*не команда/.test(rows[2] || ''), rows[2]);

  await page.click('#voiceTestModal .modal-btn');
  await page.waitForTimeout(150);
  ok('закрытие окна отпускает микрофон', await page.evaluate(() => window.__vt.stopped === 1));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('fitVoiceHeard', {detail: {text: 'готово', kind: 'next', accepted: true}})));
  ok('после закрытия строки не добавляются', await page.evaluate(() => $('voiceTestList').children.length === 3));

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  console.log(bad ? `ПРОВАЛЕНО: ${bad}` : 'всё сошлось');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
