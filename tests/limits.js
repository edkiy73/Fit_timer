/* Пределы полей: что нельзя напечатать, вставить и прислать снаружи.

   Длина поля решается дважды — когда человек печатает и когда то же самое
   приезжает снаружи. Снаружи приезжает много: программа по ссылке, из каталога,
   файлом, кодом FIT1, резервной копией. Там `maxlength` не действует, и ровно там
   встречается и миллион символов, и кавычка посреди адреса картинки.

   Запуск:  node tests/dev-server.js 8124
            node tests/limits.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };

(async () => {
  const b = await chromium.launch({executablePath: CHROME});
  const errs = [];
  const page = await (await b.newContext({viewport: {width: 412, height: 900}})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', {waitUntil: 'load'});
  await page.waitForTimeout(2000);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(1500); }

  /* ---- ссылка на себя: адрес, а не слово ---- */
  const links = await page.evaluate(() => {
    const cases = ['хуй', 'просто текст', 't.me/lena', 'https://vk.com/lena', 'javascript:alert(1)',
                   'data:text/html,x', 'instagram.com/lena.doma', '@lena', 'лена.рф/зал'];
    const out = {};
    cases.forEach(c => { out[c] = cleanLink(c); });
    return out;
  });
  ok('«хуй» ссылкой не становится', links['хуй'] === null, String(links['хуй']));
  ok('и просто текст тоже', links['просто текст'] === null, String(links['просто текст']));
  ok('@ник без домена — не адрес', links['@lena'] === null, String(links['@lena']));
  ok('t.me/lena принимается и получает схему', links['t.me/lena'] === 'https://t.me/lena', links['t.me/lena']);
  ok('полный адрес остаётся как есть', links['https://vk.com/lena'] === 'https://vk.com/lena');
  ok('instagram.com/lena.doma принимается', links['instagram.com/lena.doma'] === 'https://instagram.com/lena.doma');
  ok('кириллический домен принимается', links['лена.рф/зал'] === 'https://лена.рф/зал', links['лена.рф/зал']);
  ok('javascript: отбивается', links['javascript:alert(1)'] === null, String(links['javascript:alert(1)']));
  ok('data: отбивается', links['data:text/html,x'] === null);

  /* ---- поле в интерфейсе: непохожее не сохраняется, и человеку сказано почему ---- */
  await page.evaluate(async () => {
    trainer = {on: true, handle: '@lena.doma', name: 'Лена'};
    await saveTrainer();
    goTab('scrAccount');
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => switchMoreTab('coach'));
  await page.waitForTimeout(300);
  await page.fill('#coachLinks', 'хуй');
  await page.evaluate(() => $('coachLinks').blur());
  await page.waitForTimeout(300);
  ok('в поле сказано, что это не адрес',
     /не похоже на адрес/.test(await page.textContent('#coachLinksErr')),
     (await page.textContent('#coachLinksErr')).slice(0, 40));
  ok('и на страницу тренера это не уехало',
     await page.evaluate(() => !trainer.links), await page.evaluate(() => String(trainer.links)));

  await page.fill('#coachLinks', 't.me/lena.doma');
  await page.evaluate(() => $('coachLinks').blur());
  await page.waitForTimeout(300);
  ok('нормальный адрес сохраняется',
     await page.evaluate(() => trainer.links === 'https://t.me/lena.doma'),
     await page.evaluate(() => trainer.links));
  ok('а в поле схему не показываем', (await page.inputValue('#coachLinks')) === 't.me/lena.doma',
     await page.inputValue('#coachLinks'));

  /* ---- миллион символов из чужой программы ---- */
  const huge = await page.evaluate(() => {
    const p = {
      name: 'Ы'.repeat(1000000),
      desc: 'О'.repeat(1000000),
      plans: [{days: ['Пн'], rounds: 3, roundRest: 60, exercises: [{
        name: 'П'.repeat(1000000), desc: 'Т'.repeat(1000000),
        mistakes: 'М'.repeat(1000000), type: 'reps', value: 10, sets: 3, rest: 99999
      }]}]
    };
    sanitizeProgram(p);
    normalizeExercise(p.plans[0].exercises[0]);
    const ex = p.plans[0].exercises[0];
    return {name: p.name.length, desc: p.desc.length,
            exName: ex.name.length, exDesc: ex.desc.length, exMist: ex.mistakes.length,
            rest: ex.rest};
  });
  ok('название программы обрезано', huge.name === 60, huge.name);
  ok('описание программы обрезано', huge.desc === 1000, huge.desc);
  ok('название упражнения обрезано', huge.exName === 60, huge.exName);
  ok('описание упражнения обрезано', huge.exDesc === 600, huge.exDesc);
  ok('«частые ошибки» обрезаны', huge.exMist === 300, huge.exMist);
  ok('отдых не бывает сутками', huge.rest === 600, huge.rest);

  /* ---- картинка обязана быть картинкой ---- */
  const pics = await page.evaluate(() => ({
    good: cleanPic('data:image/png;base64,iVBORw0KGgo='),
    attr: cleanPic('x" onerror="alert(1)'),
    svg:  cleanPic('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    html: cleanPic('data:text/html;base64,PHNjcmlwdD4='),
    http: cleanPic('https://example.com/a.png'),
    big:  cleanPic('data:image/png;base64,' + 'A'.repeat(2000000))
  }));
  ok('настоящая картинка проходит', !!pics.good);
  ok('вылезание из атрибута отбивается', pics.attr === null, String(pics.attr));
  ok('svg не картинка', pics.svg === null);           // svg умеет скрипты
  ok('html под видом картинки отбивается', pics.html === null);
  ok('внешний адрес не подставляем', pics.http === null);
  ok('слишком большая отбивается', pics.big === null);

  /* ---- и то же самое, но целой программой: в разметку ничего не вылезает ---- */
  const attack = await page.evaluate(() => {
    const p = {
      name: 'Обычная', plans: [{days: ['Пн'], rounds: 1, roundRest: 30, exercises: [{
        name: 'Приседания', type: 'reps', value: 10, sets: 1, rest: 30,
        media: {kind: 'img', data: 'x" onerror="window.__hit=true" data-x="'}
      }]}]
    };
    sanitizeProgram(p);
    return {media: p.plans[0].exercises[0].media};
  });
  ok('чужая «картинка» из программы выброшена', attack.media === null, JSON.stringify(attack.media));

  const painted = await page.evaluate(async () => {
    window.__hit = false;
    // Рисуем строку с заведомо злой картинкой в обход очистки — проверяем ВТОРОЙ
    // рубеж: экранирование в момент вывода.
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.innerHTML = '<img src="' + esc('x" onerror="window.__hit=true" data-x="') + '" alt="">';
    await new Promise(r => setTimeout(r, 200));
    const img = box.querySelector('img');
    const res = {hit: window.__hit, attrs: img ? img.getAttributeNames().join(',') : ''};
    box.remove();
    return res;
  });
  ok('и в разметке атрибут не раскрывается', painted.hit === false && painted.attrs === 'src,alt',
     painted.attrs);

  /* ---- невидимые символы ---- */
  const ctrl = await page.evaluate(() => ({
    line: clampLine('Прис еда​ния тут', 60),
    text: clampText('строка\nвторая', 100)
  }));
  ok('управляющие символы вычищены', ctrl.line === 'Приседания тут', JSON.stringify(ctrl.line));
  ok('а перенос строки в описании остаётся', ctrl.text === 'строка\nвторая', JSON.stringify(ctrl.text));

  /* ---- разбор текста тоже обрезает ---- */
  const parsed = await page.evaluate(() => {
    const txt = 'ПРОГРАММА: ' + 'Я'.repeat(500) + '\nДНИ: Пн\nКРУГИ: 1\nОТДЫХ МЕЖДУ КРУГАМИ: 10\n\n'
      + 'УПРАЖНЕНИЕ: ' + 'Э'.repeat(500) + '\nФОРМАТ: повторения\nЗНАЧЕНИЕ: 10\nПОДХОДЫ: 1\nОТДЫХ: 5';
    const {program} = parseProgramText(txt);
    return {n: program.name.length, e: program.plans[0].exercises[0].name.length};
  });
  ok('разбор текста режет название программы', parsed.n === 60, parsed.n);
  ok('и название упражнения', parsed.e === 60, parsed.e);

  /* ---- все поля формы ограничены в разметке ---- */
  const loose = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('textarea, input[type=text], input[type=email], input[type=url], input[type=search], input[type=password]')
      .forEach(el => { if(!el.hasAttribute('maxlength') && !el.readOnly) out.push(el.id || el.className); });
    return out;
  });
  ok('полей без ограничения длины не осталось', loose.length === 0, loose.join(', ') || '—');

  console.log('\npageerror: ' + (errs.length ? errs.join(' | ') : 'нет'));
  if(errs.length) bad += errs.length;
  await b.close();
  console.log(bad ? 'ПРОВАЛЕНО: ' + bad : 'всё сошлось');
  process.exit(bad ? 1 : 0);
})();
