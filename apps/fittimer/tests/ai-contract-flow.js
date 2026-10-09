/* AI Contract V2 в приложении: «за меня» уходит структурированный input (без prompt),
   ответ JSON собирается в модель V2; ручной режим — тот же prompt со схемой и разбор
   вставленного JSON; правка программы — изменённая копия по ссылкам; замена с тренировки.

   Запуск:  ADMIN_KEY=testadminkey123456 GEMINI_API_KEY=test AI_TEST_MODE=1 node tests/dev-server.js 8124
            node tests/ai-contract-flow.js */

let chromium;
try{ chromium = require('playwright-core').chromium; }
catch(e){ console.error('Нужен playwright-core: npm i playwright-core'); process.exit(1); }

const BASE = process.env.FIT_URL || 'http://localhost:8124';
const CHROME = process.env.FIT_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MAIL = 'contract-' + Math.random().toString(36).slice(2, 8) + '@example.com';
const DEVICE = 'contract-device';

let bad = 0;
const ok = (name, cond, extra) => { if(!cond) bad++;
  console.log((cond ? '  ok  ' : ' ПЛОХО') + '  ' + name + (extra != null ? '  → ' + extra : '')); };
const post = async (path, body) => {
  const r = await fetch(BASE + path, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)});
  return r.json();
};

(async () => {
  const sent = await post('/api/auth', {action:'send', email:MAIL});
  const login = await post('/api/auth', {action:'verify', email:MAIL, code:sent.devCode, deviceId:DEVICE,
    sub:{plan:'year', since:'2026-09-19', until:'2099-09-19', currency:'RUB', price:2990}});

  const b = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
  const errs = [];
  const page = await (await b.newContext({viewport:{width:390, height:860}, locale:'ru-RU'})).newPage();
  page.on('pageerror', e => errs.push(String(e)));
  const bodies = [];
  page.on('request', req => { if(/\/api\/ai$/.test(req.url())) bodies.push(JSON.parse(req.postData() || '{}')); });
  await page.goto(BASE + '/index.html', {waitUntil:'load'});
  await page.waitForTimeout(800);
  if(await page.isVisible('#obStart')){ await page.click('#obStart'); await page.waitForTimeout(500); }
  await page.evaluate(async ({mail, token, device}) => {
    const u = curUser(); u.gender = 'f'; u.age = 30; await saveUsers();
    await kvSet('account', JSON.stringify(Object.assign({}, account, {email:mail, syncToken:token,
      sub:{plan:'year', until:'2099-09-19'}})));
    await loadAccount();
    await kvSet('deviceId', device); await loadIdentity();
  }, {mail:MAIL, token:login.syncToken, device:DEVICE});
  const closeModals = () => page.evaluate(() => document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open')));

  // ---- создание программы «за меня» ----
  await page.evaluate(() => { initAIForm(); openAI('text'); });
  await page.fill('#qNote', 'Программа на два дня с гантелью');
  await page.click('#aiSelf');
  await page.waitForFunction(() => !document.querySelector('#aiRunModal.open') && draft && draft.plans && draft.plans.length, null, {timeout:15000});
  const req = bodies[bodies.length - 1];
  ok('встроенный ИИ получает input, а не prompt', req && req.contractVersion === 2 && !req.prompt && req.input && /два дня/.test(req.input.task),
    JSON.stringify(req && Object.keys(req)));
  const created = await page.evaluate(() => {
    const ex = draft.plans[0].exercises;
    return {pid:draft.id, name:draft.name, n:ex.length, warm:ex[0].warmup, chain:ex[2].stages.length,
      db:FitExerciseV2.prescriptionOf(ex[3]).load, ids:ex.every(e => e.id && e.currentStageId)};
  });
  ok('программа собрана в конструкторе из JSON', created.name === 'Тестовая программа' && created.n === 4 && created.warm, JSON.stringify(created));
  ok('цепочка этапов и снаряд пришли в модель V2', created.chain === 2 && created.db.equipment === 'dumbbell' && created.db.count === 1 && created.db.weight === 8,
    JSON.stringify(created.db));
  ok('ID выдало приложение', created.ids && created.pid, JSON.stringify(created.pid));
  await page.click('#btnSaveProgram').catch(() => {});
  await page.evaluate(async () => { if(!customPrograms.some(p => p.id === draft.id)) await saveProgram(); });
  await closeModals();
  const pid = await page.evaluate(() => customPrograms[customPrograms.length - 1].id);

  // ---- длинная программа: четыре разных дня, один месячный AI-расход ----
  await page.evaluate(() => { initAIForm(); openAI('text'); });
  await page.evaluate(() => {
    $('qNote').value = 'Четыре разных тренировочных дня по 45+ минут с разминкой';
    $('qNote').dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.evaluate(() => {
    // Each selection re-renders the day chips: resolve fresh nodes every time.
    for(const i of [0,1,3,5]) document.querySelectorAll('#qDays button')[i].click();
    document.querySelector('#qSplit').click();
    const longDuration = Array.from(document.querySelectorAll('#qDur button'))
      .find(b => (b.dataset.value || '').includes('45+'));
    if(!longDuration) throw new Error('45+ duration not found');
    longDuration.click();
  });
  const beforeParts = bodies.length;
  const quotaReplies = [];
  const readAIResponse = async response => {
    if(!/\/api\/ai$/.test(response.url())) return;
    try{ const json=await response.json(); if(json.usage) quotaReplies.push(json.usage.used); }
    catch(_){}
  };
  page.on('response', readAIResponse);
  await page.evaluate(() => $('aiSelf').click());
  try{
    await page.waitForFunction(() => !document.querySelector('#aiRunModal.open')
      && draft && draft.plans && draft.plans.length === 4, null, {timeout:15000});
  }catch(e){
    const debug = await page.evaluate(() => ({
      screen:document.querySelector('#scrAI')?.className,
      aiRun:document.querySelector('#aiRunModal')?.className,
      aiMessage:document.querySelector('#aiRunText')?.textContent,
      dialog:document.querySelector('#dlgMsg')?.textContent,
      planCount:typeof draft !== 'undefined' && draft?.plans?.length
    }));
    console.log('four-day AI flow debug', JSON.stringify({debug,
      requests:bodies.slice(beforeParts).map(x=>({kind:x.kind,segment:x.segment,input:x.input?.scheduleDays}))}));
    throw e;
  }
  page.off('response', readAIResponse);
  const segmentedRequests = bodies.slice(beforeParts).filter(x => x.kind === 'program.create' && x.segment);
  ok('four selected days produce four sequential server requests',
    segmentedRequests.length === 4
    && segmentedRequests.every((r,i) => r.segment.index === i
      && r.segment.id === segmentedRequests[0].segment.id
      && r.input.scheduleDays.length === 4 && r.input.splitByDays === true));
  const splitDraft = await page.evaluate(() => ({
    days:draft.plans.map(p=>p.days.join(',')),
    names:draft.plans.map(p=>p.exercises[1].stages[0].prescription.name)
  }));
  ok('four distinct days assembled with individual exercises',
    splitDraft.days.length === 4 && new Set(splitDraft.days).size === 4
    && new Set(splitDraft.names).size === 4, JSON.stringify(splitDraft));
  ok('multi-part generation is one Premium heavy use', quotaReplies.length === 4
    && quotaReplies.every(n => n === quotaReplies[0]), JSON.stringify(quotaReplies));
  await closeModals();

  // ---- ручной режим: prompt со схемой, вставленный ответ разбирается тем же контрактом ----
  await page.evaluate(() => { initAIForm(); openAI('text'); });
  const manual = await page.evaluate(() => { $('qNote').value = 'что угодно'; return fullAIPrompt(); });
  ok('ручной prompt содержит схему ответа', /JSON Schema/.test(manual) && /"contractVersion"/.test(manual));
  await page.evaluate(() => { $('aiResult').value = 'Вот программа: всё отлично'; importFromText(); });
  await page.waitForTimeout(150);
  ok('не-JSON ответ отклоняется понятно', /не похож на JSON/.test(await page.textContent('#dlgMsg')));
  await closeModals();

  // ---- правка программы: копия по ссылкам, прогресс сохранён ----
  await page.evaluate(async (pid) => {
    const p = customPrograms.find(x => x.id === pid);
    p.plans[0].exercises[1].progressState = {count:1, current:{reps:'12', weight:null, time:null, level:null}};
    await savePrograms();
    openEditAI(p);
  }, pid);
  await page.evaluate(v => { $('eaWish').value = v; }, 'добавь планку');
  const nBefore = await page.evaluate(() => customPrograms.length);
  await page.evaluate(() => $('aiSelf').click());
  await page.waitForFunction(n => customPrograms.length > n, nBefore, {timeout:15000});
  // createEditedProgram persists the new copy before showing its summary dialog.
  // Do not sample the dialog immediately after the in-memory push: on a slower CI
  // runner savePrograms() is still in flight at that point.
  await page.waitForFunction(() => /Добавлено: 1/.test(document.querySelector('#dlgMsg')?.textContent || ''), null, {timeout:30000});
  const editMsg = await page.textContent('#dlgMsg');
  const edited = await page.evaluate(pid => {
    const src = customPrograms.find(x => x.id === pid);
    const copy = customPrograms[customPrograms.length - 1];
    const ex = copy.plans[0].exercises;
    return {src:src.plans[0].exercises.length, n:ex.length, last:FitExerciseV2.prescriptionOf(ex[ex.length - 1]).name,
      kept:ex[1].progressState.current.reps, newId:copy.id !== pid, name:copy.name};
  }, pid);
  ok('изменённая копия рядом с исходником', edited.newId && edited.src === 4 && edited.n === 5 && edited.last === 'Планка', JSON.stringify(edited));
  ok('неизменённое упражнение сохранило прогресс', edited.kept === '12', edited.kept);
  ok('итог правки показан человеку', /Добавлено: 1/.test(editMsg), editMsg);
  await closeModals();

  // ---- новое упражнение и правка упражнения через ИИ ----
  await page.evaluate(pid => openBuilder(pid), pid);
  await page.evaluate(() => openExAI());
  await page.evaluate(v => { $('exaWish').value = v; }, 'выпады');
  await page.evaluate(() => $('aiSelf').click());
  await page.waitForFunction(() => curPlan().exercises.some(e => FitExerciseV2.prescriptionOf(e).name === 'Выпады'), null, {timeout:15000});
  ok('упражнение через ИИ добавлено', true);
  await closeModals();
  await page.evaluate(() => openExEdAI(1));
  await page.evaluate(v => { $('exeWish').value = v; }, 'больше повторов');
  const before = await page.evaluate(() => ({id:curPlan().exercises[1].id, stage:curPlan().exercises[1].currentStageId}));
  await page.evaluate(() => $('aiSelf').click());
  await page.waitForFunction(() => FitExerciseV2.prescriptionOf(curPlan().exercises[1]).value === '15', null, {timeout:15000});
  const after = await page.evaluate(() => ({id:curPlan().exercises[1].id, stage:curPlan().exercises[1].currentStageId}));
  ok('правка упражнения сохраняет слот и этап', after.id === before.id && after.stage === before.stage, JSON.stringify({before, after}));
  await closeModals();

  ok('без ошибок в консоли', !errs.length, errs.join(' | '));
  await b.close();
  console.log(bad ? '\nПровалено: ' + bad : '\nВсё ок');
  process.exit(bad ? 1 : 0);
})();
