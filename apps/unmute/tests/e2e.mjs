/* End-to-end check of the production build: node tests/e2e.mjs (after npm run build).
   Serves dist/ with the real api/* handlers on the memory store and drives Chromium:
   anonymous learning, first sign-in merge and progress sync between two devices. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

process.env.ALLOW_MEMORY_STORE = '1';
process.env.ADMIN_KEY ||= 'starter-e2e';
const require = createRequire(import.meta.url);
const APP = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(APP, 'dist');
const API = Object.fromEntries(['auth', 'sync', 'health', 'admin', 'billing', 'content', 'lexicon'].map(name => [name, require(join(APP, 'api', name + '.js'))]));
const TYPES = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json'};

const PORT = 4175;
const URL_ = `http://127.0.0.1:${PORT}/`;
const CHROME = process.env.FIT_CHROME || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const Content = require(join(APP, 'lib', 'content-store.js'));
const Lexicon = require(join(APP, 'lib', 'lexicon-store.js'));
const Release = require(join(APP, 'lib', 'content-release.js'));
await Content.putDraft({
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Основной курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{
    id:'main',
    title:{ru:'Путь'},
    nodes:[
      {
        id:'day-1',
        kind:'lesson',
        title:{ru:'День 1'},
        dayIndex:1,
        order:0,
        prerequisites:[],
        activityIds:['day-1.theory'],
        optional:false
      },
      {
        id:'day-2',
        kind:'lesson',
        title:{ru:'День 2'},
        dayIndex:2,
        order:1,
        prerequisites:[],
        activityIds:['day-2.theory'],
        optional:false
      }
    ]
  }],
  activities:[
    {
      id:'day-1.theory',
      revision:1,
      type:'theory',
      tags:[],
      revisionProgress:'preserve',
      lexiconRefs:[],
      body:{ru:'Hello.'},
      format:'text'
    },
    {
      id:'day-2.theory',
      revision:1,
      type:'theory',
      tags:[],
      revisionProgress:'preserve',
      lexiconRefs:[],
      body:{ru:'Goodbye.'},
      format:'text'
    },
    {
      id:'ex.abc.001',
      revision:1,
      type:'text-input',
      tags:['legacy-import'],
      revisionProgress:'preserve',
      lexiconRefs:[],
      prompt:{ru:'Legacy card'},
      answer:{accepted:['legacy'],nearMiss:true,caseSensitive:false}
    }
  ],
  resources:[]
});
await Lexicon.putDraft({schemaVersion:1,revision:1,entries:[]});
await Release.publishDraftRelease(['general-foundation']);

// Copy of the default locale (src/i18n) and of the shared sign-in form.
const COPY = {
  ru: {
    tabs:'Разделы',
    me:'Профиль',
    route:'Маршрут',
    signIn:'Войти или создать аккаунт',
    today:'Сегодня',
    onboarding:'Говори по-английски в реальной жизни',
    start:'Начать день 1',
    continue:'Продолжить',
    complete:'Курс пройден',
    send:'Прислать код',
    verify:'Войти',
    handle:'Ник',
    create:'Создать аккаунт'
  }
}['ru'];

const server = createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', URL_);
  const path = decodeURIComponent(parsedUrl.pathname);
  req.query = Object.fromEntries(parsedUrl.searchParams.entries());
  const api = /^\/api\/([a-z]+)$/.exec(path);
  if(api){
    const handler = API[api[1]];
    if(!handler){ res.statusCode = 404; res.end(); return; }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    await handler(req, res);
    return;
  }
  const file = normalize(join(DIST, path === '/' ? 'index.html' : path));
  if(!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()){ res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));

let bad = 0;
const ok = (name, value) => { if(!value) bad++; console.log((value ? '  ok  ' : ' FAIL ') + name); };
const appears = (locator, timeout = 5000) => locator.waitFor({timeout}).then(() => true, () => false);
async function openDevice(browser, errors){
  const context=await browser.newContext({viewport:{width:390,height:800},locale:'ru-RU'});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(URL_);
  return {context,page};
}

async function finishOnboarding(page){
  await page.getByRole('heading',{name:COPY.onboarding}).waitFor();
  await page.getByRole('button',{name:COPY.start}).click();
  return page.waitForURL(/#\/learn\/day-1/,{timeout:5000}).then(()=>true,()=>false);
}

async function completeTheory(page){
  // A theory-only day: the theory page closes the day straight away.
  await page.getByRole('button',{name:'Завершить',exact:true}).click();
  // The finished lesson ends on a short summary before returning to «Сегодня».
  const summary=await page.getByText('День пройден').waitFor({timeout:5000}).then(()=>true,()=>false);
  if(!summary)return false;
  await page.getByRole('button',{name:'Готово',exact:true}).click();
  return page.waitForURL(/#\/$/,{timeout:5000}).then(()=>true,()=>false);
}

async function signIn(page,email,{slowSend=false}={}){
  await page.getByRole('navigation',{name:COPY.tabs}).getByRole('link',{name:COPY.me,exact:true}).click();
  // «Я» shows one sign-in button; the code form opens in a sheet.
  await page.getByRole('button',{name:COPY.signIn}).click();
  await page.getByRole('textbox',{name:'Email'}).fill(email);
  if(slowSend){
    // A slow server: the pressed button shows a spinner instead of looking frozen.
    await page.route('**/api/auth',async route=>{await new Promise(r=>setTimeout(r,700));await route.continue();});
    await page.getByRole('button',{name:COPY.send}).click();
    ok('a button waiting for the server shows a spinner',await appears(page.locator('.ab-auth-primary[aria-busy="true"]'),1000));
    await page.getByText(/^DEV: \d+$/).waitFor();
    ok('the spinner goes away when the answer comes',await page.locator('[aria-busy="true"]').count()===0);
    await page.unroute('**/api/auth');
  }else{
    await page.getByRole('button',{name:COPY.send}).click();
  }
  await page.getByText(/^DEV: \d+$/).waitFor();
  await page.getByRole('button',{name:COPY.verify,exact:true}).click();
  if(await appears(page.getByRole('textbox',{name:COPY.handle}),1200)){
    await page.getByRole('textbox',{name:COPY.handle}).fill('@person');
    await page.getByRole('button',{name:COPY.create}).click();
  }
  await page.waitForURL(/#\/$/,{timeout:5000}).catch(()=>{});
  await page.getByRole('navigation',{name:COPY.tabs}).getByRole('link',{name:COPY.me,exact:true}).click();
  return appears(page.getByText(email,{exact:true}),5000);
}

const browser = await chromium.launch(CHROME ? {executablePath:CHROME} : {});
try{
  const errors=[];

  const phone=await openDevice(browser,errors);
  ok('first anonymous visit opens minimal onboarding',await appears(phone.page.getByRole('heading',{name:COPY.onboarding})));
  ok('onboarding starts day 1',await finishOnboarding(phone.page));
  ok('day 1 is completed locally before sign-in',await completeTheory(phone.page));
  ok('completed day stays visible before the next day starts',await appears(phone.page.getByRole('heading',{name:'День 1 завершён'})));
  await phone.page.getByRole('button',{name:'Начать День 2'}).click();
  ok('anonymous phone advances to day 2',await phone.page.waitForURL(/#\/learn\/day-2/,{timeout:5000}).then(()=>true,()=>false));

  // Route map: the solid rail reaches the current day, and the day sheet's button spans the sheet.
  await phone.page.goto(URL_+'#/course');
  await phone.page.locator('.station.is-complete .station-body').first().click();
  await phone.page.locator('.sheet').waitFor({timeout:5000}).catch(()=>{});
  const sheetButtonsFit=await phone.page.evaluate(()=>{
    const sheet=document.querySelector('.sheet');
    if(!sheet)return false;
    const style=getComputedStyle(sheet);
    const inner=sheet.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const buttons=[...sheet.querySelectorAll('.primary-button,.secondary-button')];
    return buttons.length>0&&buttons.every(button=>Math.abs(button.getBoundingClientRect().width-inner)<=1);
  });
  ok('day sheet buttons span the whole sheet',sheetButtonsFit);
  ok('route sheet exposes its station status for visual treatment',await phone.page.locator('.station-sheet[data-status]').count()===1);
  ok('the current stage has one premium emphasis',await phone.page.locator('.stage.is-current-stage').count()===1);
  ok('the solid rail reaches the current day',await phone.page.locator('.station.is-current.rail-arriving').count()===1);
  ok('the rail starts at the first day, not above it',await phone.page.evaluate(()=>{
    const first=document.querySelector('.station.is-first');
    const marker=first?.querySelector('.station-marker');
    if(!first||!marker)return false;
    const railTop=first.getBoundingClientRect().top+parseFloat(getComputedStyle(first,'::before').top);
    const box=marker.getBoundingClientRect();
    return railTop>=box.top&&railTop<=box.bottom;
  }));
  await phone.page.keyboard.press('Escape');
  await phone.page.goto(URL_+'#/');
  ok('theme tokens are applied',(await phone.page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()))!=='');
  await phone.page.goto(URL_+'#/legal/terms');
  ok('the terms of use open inside the app',await appears(phone.page.getByRole('heading',{name:'Условия использования UnMute'})));
  if(process.env.E2E_SHOTS)await phone.page.screenshot({path:process.env.E2E_SHOTS+'/terms.png'});
  await phone.page.goto(URL_+'#/no-such-screen');
  ok('a broken link shows «Такой страницы нет», not a developer error',await appears(phone.page.getByText('Такой страницы нет')));
  await phone.page.getByRole('button',{name:'На главную'}).click();
  ok('«На главную» returns to Today',await phone.page.waitForURL(u=>/#\/$/.test(String(u)),{timeout:5000}).then(()=>true,()=>false));

  const phoneSignedIn=await signIn(phone.page,'person@example.com',{slowSend:true});
  await phone.page.goto(URL_+'#/');
  ok(
    'first sign-in keeps the phone local progress',
    phoneSignedIn&&await appears(phone.page.getByRole('heading',{name:'День 2'}))
  );
  await phone.page.goto(URL_+'#/account');
  ok('the profile shows «Мои покупки» to a signed-in learner',await appears(phone.page.getByRole('heading',{name:'Мои покупки'})));
  if(process.env.E2E_SHOTS)await phone.page.locator('.my-purchases').screenshot({path:process.env.E2E_SHOTS+'/purchases.png'});
  await phone.page.goto(URL_+'#/');

  const laptop=await openDevice(browser,errors);
  ok('second device starts with its own anonymous state',await finishOnboarding(laptop.page));
  await laptop.page.goto(URL_+'#/learn/day-2');
  ok('second device can make a different local course change',await appears(laptop.page.getByText('Goodbye.')));
  ok('day 2 is completed locally before second-device sign-in',await completeTheory(laptop.page));
  ok('second device still needs day 1 before account merge',await appears(laptop.page.getByRole('heading',{name:'День 1'})));

  const laptopSignedIn=await signIn(laptop.page,'person@example.com');
  await laptop.page.goto(URL_+'#/');
  ok('second device signs into the same account',laptopSignedIn);
  ok(
    'second device merges phone day 1 with its own day 2',
    await appears(laptop.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  await phone.page.reload();
  ok(
    'first device pulls the merged progress from the second device',
    await appears(phone.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  await phone.page.reload();
  ok(
    'merged progress survives a production-build reload',
    await appears(phone.page.getByRole('heading',{name:COPY.complete}),8000)
  );

  const tabs=phone.page.getByRole('navigation',{name:COPY.tabs});
  await tabs.getByRole('link',{name:COPY.route}).click();
  ok('bottom bar opens the course route',await phone.page.waitForURL(/#\/course$/,{timeout:5000}).then(()=>true,()=>false));
  ok('bottom bar marks the open tab',await appears(tabs.locator('a[aria-current="page"]',{hasText:COPY.route})));
  await phone.page.getByRole('button',{name:/^День 1/}).click();
  ok('route station opens its sheet',await appears(phone.page.getByRole('dialog')));
  await phone.page.goBack();
  ok('Back closes the sheet and stays on the route',
    await phone.page.getByRole('dialog').waitFor({state:'detached',timeout:3000}).then(()=>true,()=>false)&&/#\/course$/.test(phone.page.url()));
  ok('Manrope is the app font',(await phone.page.evaluate(()=>getComputedStyle(document.body).fontFamily)).startsWith('Manrope'));
  await phone.page.goto(URL_+'#/learn/day-1');
  await phone.page.getByText('Hello.').first().waitFor({timeout:5000}).catch(()=>{});
  ok('lessons run without the bottom bar',await tabs.count()===0);

  // «Выйти» on a shared phone: progress stays in the account, the phone starts clean (decision 20).
  await phone.page.goto(URL_+'#/settings');
  await phone.page.getByRole('button',{name:'Выйти',exact:true}).click();
  // Either the phone restarts on onboarding, or — if progress could not be confirmed as sent —
  // the app asks first; whichever shows up.
  const onboardingHeading=phone.page.getByRole('heading',{name:COPY.onboarding});
  const signOutAnyway=phone.page.getByRole('button',{name:'Всё равно выйти'});
  await onboardingHeading.or(signOutAnyway).first().waitFor({timeout:10000}).catch(()=>{});
  if(await signOutAnyway.isVisible().catch(()=>false))await signOutAnyway.click();
  const cleanStart=await appears(phone.page.getByRole('heading',{name:COPY.onboarding}),10000);
  if(!cleanStart)console.log('DEBUG sign-out:',phone.page.url(),(await phone.page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,500));
  ok('after sign-out the phone starts clean: onboarding again',cleanStart);
  ok('no personal lesson state stays on the phone',await phone.page.evaluate(()=>
    Object.keys(localStorage).filter(key=>key.startsWith('unmute.lesson-run:')||key==='unmute.onboarding.v1').length===0));
  await phone.page.goto(URL_+'#/account');
  const signedBack=await signIn(phone.page,'person@example.com');
  await phone.page.goto(URL_+'#/');
  // The fixture course has two days, both passed before: the account brings that back.
  const back=await appears(phone.page.getByText('2 из 2 дней'),8000);
  ok('signing in again brings the progress back',signedBack&&back);

  const adminContext=await browser.newContext({locale:'ru-RU'});
  const admin=await adminContext.newPage();
  admin.on('pageerror',error=>errors.push(String(error)));
  await admin.goto(URL_+'#/admin');
  ok('shared Admin opens and asks for the key',await appears(admin.getByLabel('Ключ администратора')));

  // Admin reads as plain Russian on a phone: overview numbers, errors with dates, word search.
  await fetch(URL_+'api/auth',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'client_error',kind:'error',name:'TypeError',message:'e2e sample failure',stack:'at e2e (app.js:1:1)',platform:'android',locale:'ru'})});
  await admin.setViewportSize({width:360,height:740});
  await admin.getByLabel('Ключ администратора').fill(process.env.ADMIN_KEY);
  await admin.getByRole('button',{name:'Войти',exact:true}).click();
  const adminTab=async name=>{
    await admin.locator('.ab-admin-menu').click();
    await admin.locator('.ab-admin-nav').getByRole('button',{name,exact:true}).click();
  };
  await adminTab('Обзор');
  ok('Admin overview names events in Russian',await appears(admin.getByText('Открыли приложение впервые').first()));
  ok('Admin overview shows the funnel and D1/D7/D30 retention',
    await appears(admin.getByRole('heading',{name:'Воронка'}))
    &&await appears(admin.getByRole('heading',{name:'Возвращаются'}))
    &&await appears(admin.getByText('Прошли день 1').first()));
  ok('Admin overview shows no raw JSON',await admin.locator('.ab-admin-json').count()===0);
  await adminTab('Ошибки');
  ok('Admin errors say how often and when',await appears(admin.getByText(/^1 раз · \d/)));
  await adminTab('Курсы');
  ok('Admin «Курсы»: release flow is visible',await appears(admin.locator('.ab-course-release .ab-release-flow')));
  await admin.getByRole('button',{name:/Hello|День 1/}).first().click();
  ok('Admin «Курсы»: a day opens with its tasks',await appears(admin.locator('.ab-course-task').first()));
  await admin.locator('.ab-course-task-main').first().click();
  ok('Admin «Курсы»: a task opens on its own editor level',await appears(admin.locator('.ab-course-activity-level .ab-course-editor')));
  await admin.getByRole('button',{name:'← К заданиям'}).click();
  ok('Admin «Курсы»: task editor returns to the task list',await appears(admin.locator('.ab-course-tasks')));
  await admin.getByRole('button',{name:'← Все дни'}).click();
  ok('Admin «Курсы»: back to all days on a phone',await appears(admin.locator('.ab-course-days-pane')));
  await adminTab('Словарь');
  ok('Admin «Словарь»: release flow is visible',await appears(admin.locator('.ab-dictionary-release .ab-release-flow')));
  await admin.getByRole('searchbox',{name:'Слово или перевод'}).fill('hello');
  await admin.getByRole('button',{name:'Найти',exact:true}).click();
  ok('Admin word search answers',await appears(admin.getByText(/Ничего не нашлось|Изменить/).first()));

  const adminOverflow=async()=>{
    return admin.evaluate(()=>{
      const root=document.documentElement;
      const width=root.clientWidth;
      const failures=[];
      if(root.scrollWidth>width+1)failures.push('document '+root.scrollWidth+'>'+width);
      const main=document.querySelector('.ab-admin');
      if(!main)return ['missing .ab-admin'];
      for(const element of main.querySelectorAll('*')){
        const box=element.getBoundingClientRect();
        if(!box.width||!box.height||box.right<=width+1||box.left>=width)continue;
        if(element.closest('.ab-course-tabs'))continue; // intentional horizontal course picker
        const style=getComputedStyle(element);
        if(style.visibility==='hidden'||style.display==='none'||style.position==='fixed')continue;
        failures.push((element.className&&typeof element.className==='string'?'.'+element.className.trim().split(/\s+/)[0]:element.tagName)+' → '+Math.round(box.right)+'px');
        if(failures.length>=5)break;
      }
      return failures;
    });
  };

  const ADMIN_TABS=[
    'Состояние','Обзор','Пользователи','Платежи','Ошибки',
    'ИИ','Способы оплаты','Владелец и контакты','Рассылки','Хранилище',
    'Курсы','Словарь','Обновление приложения'
  ];
  const adminWide=[];
  for(const name of ADMIN_TABS){
    await adminTab(name);
    await admin.waitForTimeout(80);
    const failures=await adminOverflow();
    if(failures.length)adminWide.push(name+': '+failures.join(', '));
  }
  ok('every Admin section fits a 360 px phone',adminWide.length===0);
  if(adminWide.length)console.log(adminWide.join('\n'));

  // Also exercise the two deepest product-admin states that previously caused sideways scroll.
  await adminTab('Курсы');
  await admin.getByRole('button',{name:/Hello|День 1/}).first().click();
  await admin.locator('.ab-course-task-main').first().click();
  const editorWide=await adminOverflow();
  ok('Admin course activity editor fits a 360 px phone',editorWide.length===0);
  if(editorWide.length)console.log('activity editor: '+editorWide.join(', '));

  await adminTab('Словарь');
  const bulkHeading=admin.getByRole('heading',{name:'Дополнить словарь через ИИ'});
  await bulkHeading.scrollIntoViewIfNeeded();
  const bulkWide=await adminOverflow();
  ok('Admin bulk dictionary fits a 360 px phone',bulkWide.length===0);
  if(bulkWide.length)console.log('bulk dictionary: '+bulkWide.join(', '));

  // Screen walk: every main screen on a small phone, light and dark — nothing sticks out
  // sideways and no screen throws. Catches layout breaks before anyone opens the app.
  const ROUTES=['#/','#/course','#/review','#/account','#/settings','#/access?from=talk','#/legal/privacy','#/learn/day-1'];
  for(const colorScheme of ['light','dark']){
    const walkContext=await browser.newContext({viewport:{width:360,height:740},locale:'ru-RU',colorScheme});
    await walkContext.addInitScript(()=>{ try{ localStorage.setItem('unmute.onboarding.v1','1'); }catch{} });
    const walk=await walkContext.newPage();
    walk.on('pageerror',error=>errors.push(colorScheme+': '+String(error)));
    const broken=[];
    for(const route of ROUTES){
      await walk.goto(URL_+route);
      await walk.locator('.app-screen, .learn-shell').first().waitFor({timeout:8000}).catch(()=>{});
      await walk.locator('.screen-loader').first().waitFor({state:'detached',timeout:8000}).catch(()=>{});
      const wide=await walk.evaluate(()=>{
        const width=document.documentElement.clientWidth;
        if(document.documentElement.scrollWidth>width+1)return ['page scrolls sideways'];
        const out=[];
        for(const element of document.querySelectorAll('body *')){
          const box=element.getBoundingClientRect();
          if(!box.width||!box.height||box.right<=width+1)continue;
          const style=getComputedStyle(element);
          if(style.visibility==='hidden'||style.position==='fixed')continue;
          let parent=element.parentElement,scrolls=false;
          while(parent){ const overflow=getComputedStyle(parent).overflowX; if((overflow==='auto'||overflow==='scroll'||overflow==='hidden')&&parent!==document.body){scrolls=true;break;} parent=parent.parentElement; }
          if(!scrolls)out.push((element.className&&typeof element.className==='string'?'.'+element.className.split(' ')[0]:element.tagName)+' → '+Math.round(box.right)+'px');
        }
        return out.slice(0,5);
      });
      if(wide.length)broken.push(route+': '+wide.join(', '));
    }
    ok(colorScheme+' theme: main screens fit a 360 px phone',broken.length===0);
    if(broken.length)console.log(broken.join('\n'));
    await walkContext.close();
  }

  // Motion/layout smoke at the edges of the supported phone range.
  // Reduced motion must remove decorative animation without changing geometry.
  for(const width of [320,412]){
    const motionContext=await browser.newContext({
      viewport:{width,height:760},
      locale:'ru-RU',
      reducedMotion:'reduce'
    });
    await motionContext.addInitScript(()=>{ try{ localStorage.setItem('unmute.onboarding.v1','1'); }catch{} });
    const motionPage=await motionContext.newPage();
    motionPage.on('pageerror',error=>errors.push('motion '+width+': '+String(error)));
    await motionPage.goto(URL_+'#/');
    await motionPage.locator('.today .tile').first().waitFor({timeout:8000}).catch(()=>{});
    const todayMotion=await motionPage.evaluate(()=>{
      const root=getComputedStyle(document.documentElement);
      const tile=document.querySelector('.today .tile');
      const screen=document.querySelector('.app-screen');
      return {
        reduce:matchMedia('(prefers-reduced-motion: reduce)').matches,
        token:root.getPropertyValue('--motion-base').trim(),
        animation:tile?getComputedStyle(tile).animationName:'',
        screenAnimation:screen?getComputedStyle(screen).animationName:'',
        fits:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1
      };
    });
    ok(width+' px: motion tokens are present',todayMotion.token.length>0);
    ok(width+' px: reduced motion is respected',todayMotion.reduce&&todayMotion.animation==='none'&&todayMotion.screenAnimation==='none');
    ok(width+' px: Today fits without horizontal jump',todayMotion.fits);

    await motionPage.goto(URL_+'#/course');
    await motionPage.locator('.course-map-shell').first().waitFor({timeout:8000}).catch(()=>{});
    ok(width+' px: Route fits without horizontal jump',await motionPage.evaluate(
      ()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1
    ));
    await motionContext.close();
  }

  ok('no runtime errors',errors.length===0);
  if(errors.length)console.log(errors.join('\n'));

  await adminContext.close();
  await laptop.context.close();
  await phone.context.close();
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.close();
}

console.log(bad ? '\nUnMute e2e failures: '+bad : '\nUnMute e2e passed');
if(bad)process.exit(1);

// Run the focused 43-unit regression in a fresh Node process so its memory-backed
// content/release store cannot inherit this suite's tiny two-day fixture.
const focused=spawnSync(
  process.execPath,
  [join(APP,'tests','day-progress-e2e.mjs')],
  {stdio:'inherit',env:process.env}
);
process.exit(focused.status??1);
