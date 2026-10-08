/* Focused production-build regression for the canonical day counter.
   It drives a real lesson with 19 regular tasks + 8 phrases in each of
   drill/listening/speaking = 43 required units, then verifies that Today
   and Route keep the same denominator across lesson exit and reload. */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

process.env.ALLOW_MEMORY_STORE='1';
const require=createRequire(import.meta.url);
const APP=fileURLToPath(new URL('..',import.meta.url));
const DIST=join(APP,'dist');
const API=Object.fromEntries(
  ['auth','sync','health','admin','billing','content','lexicon']
    .map(name=>[name,require(join(APP,'api',name+'.js'))])
);
const Content=require(join(APP,'lib','content-store.js'));
const Lexicon=require(join(APP,'lib','lexicon-store.js'));
const Release=require(join(APP,'lib','content-release.js'));

const tasks=Array.from({length:19},(_,index)=>({
  id:'day-3.task.'+(index+1),
  revision:1,
  type:'choice',
  tags:[],
  revisionProgress:'preserve',
  lexiconRefs:[],
  prompt:{ru:'Задание '+(index+1)},
  options:[{ru:'Верно'},{ru:'Неверно'}],
  correctIndex:0
}));
const pattern={
  id:'day-3.pattern',
  revision:1,
  type:'pattern-drill',
  tags:[],
  revisionProgress:'preserve',
  lexiconRefs:[],
  pattern:{ru:'Фразы дня'},
  modes:['drill','listening','speaking'],
  items:Array.from({length:8},(_,index)=>({
    id:'phrase.'+(index+1),
    prompt:{ru:'Фраза '+(index+1)},
    answer:{
      accepted:['Phrase '+(index+1)],
      nearMiss:true,
      caseSensitive:false
    }
  }))
};
const node={
  id:'day-3',
  kind:'lesson',
  title:{ru:'День 3'},
  dayIndex:3,
  order:0,
  prerequisites:[],
  activityIds:[...tasks.map(task=>task.id),pattern.id],
  completion:{
    mode:'all',
    requirements:[
      {kind:'activity-seen',activityIds:tasks.map(task=>task.id)},
      {
        kind:'practice-completed',
        activityId:pattern.id,
        modes:['drill','listening','speaking']
      }
    ]
  },
  optional:false
};

await Content.putDraft({
  schemaVersion:1,
  id:'general-foundation',
  revision:1,
  slug:'general-foundation',
  title:{ru:'Основной курс'},
  level:{labels:[]},
  access:{mode:'free'},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Путь'},nodes:[node]}],
  activities:[...tasks,pattern],
  resources:[]
});
await Lexicon.putDraft({schemaVersion:1,revision:1,entries:[]});
await Release.publishDraftRelease(['general-foundation']);

const TYPES={
  '.html':'text/html',
  '.js':'text/javascript',
  '.css':'text/css',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.json':'application/json'
};
const PORT=4176;
const ROOT='http://127.0.0.1:'+PORT+'/';
const CHROME=process.env.FIT_CHROME
  ||(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined);

const server=createServer(async(req,res)=>{
  const parsed=new URL(req.url||'/',ROOT);
  const path=decodeURIComponent(parsed.pathname);
  req.query=Object.fromEntries(parsed.searchParams.entries());
  const api=/^\/api\/([a-z]+)$/.exec(path);
  if(api){
    const handler=API[api[1]];
    if(!handler){res.statusCode=404;res.end();return;}
    const chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    req.body=chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{};
    await handler(req,res);
    return;
  }
  const file=normalize(join(DIST,path==='/'?'index.html':path));
  if(!file.startsWith(DIST)||!existsSync(file)||!statSync(file).isFile()){
    res.statusCode=404;
    res.end();
    return;
  }
  res.setHeader('Content-Type',TYPES[extname(file)]||'application/octet-stream');
  res.end(readFileSync(file));
});
await new Promise(resolve=>server.listen(PORT,'127.0.0.1',resolve));

let bad=0;
const ok=(name,value)=>{
  if(!value)bad++;
  console.log((value?'  ok  ':' FAIL ')+name);
};
const appears=(locator,timeout=5000)=>
  locator.waitFor({timeout}).then(()=>true,()=>false);

async function twoTapChoice(page,label){
  const option=()=>page.locator('label.learn-option',{
    hasText:new RegExp('^'+label+'(?:Нажми ещё раз)?$')
  }).first();
  const next=page.locator('.learn-feedback-next');

  // The option animates/re-renders between selected and confirmed states. Re-acquire
  // the live node for each tap so Playwright cannot wait on a stale disabled label.
  if(!(await next.isVisible().catch(()=>false))){
    await option().waitFor({state:'visible',timeout:5000});
    await option().evaluate(node=>node.click());
  }
  if(!(await next.isVisible().catch(()=>false))){
    await page.waitForTimeout(150);
    const live=option();
    if(!(await live.isDisabled().catch(()=>true)))await live.evaluate(node=>node.click());
  }
  await next.waitFor({timeout:5000});
  // The feedback button also transitions/re-mounts. Click the live DOM node before
  // returning so callers never keep a locator across that transition.
  await next.evaluate(node=>node.click());
}

const browser=await chromium.launch(CHROME?{executablePath:CHROME}:{});
try{
  const context=await browser.newContext({
    viewport:{width:390,height:800},
    locale:'ru-RU'
  });
  await context.addInitScript(()=>{
    try{localStorage.setItem('unmute.onboarding.v1','1');}catch{}
  });
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error)));

  await page.goto(ROOT+'#/');
  await page.getByRole('heading',{name:'Сегодня'}).waitFor({timeout:8000});
  ok('43-unit fixture is the current Day 3',await appears(page.getByText('День 3',{exact:true}).first(),3000));
  await page.getByRole('button',{name:'Начать',exact:true}).click();
  await page.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  ok(
    '43-unit fixture opens its first regular task',
    await appears(page.getByRole('heading',{name:'Задание 1'}),8000)
  );

  for(let index=0;index<19;index++){
    await twoTapChoice(page,'Верно');
  }

  ok(
    'after 19 regular tasks the runner reaches speed practice',
    await appears(page.getByText('Тренируем скорость: фразы должны вылетать без раздумий.'),8000)
  );

  await page.goto(ROOT+'#/');
  ok(
    'Today counts 19 of the real 43 required units before phrase practice',
    await appears(page.getByText(/19 из 43 заданий/),8000)
  );

  await page.goto(ROOT+'#/course');
  ok(
    'Route uses the same 19/43 denominator',
    await appears(page.getByText('19/43',{exact:true}),8000)
  );

  await page.goto(ROOT+'#/');
  await page.getByRole('button',{name:'Продолжить',exact:true}).click();
  await page.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  await page.getByText('Тренируем скорость: фразы должны вылетать без раздумий.').waitFor({timeout:8000});
  await page.getByRole('button',{name:'Начать',exact:true}).click();

  for(let index=0;index<3;index++){
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    // «Совпало» itself commits the phrase and advances to the next one.
    await page.getByRole('button',{name:'Совпало',exact:true}).click();
  }

  await page.goto(ROOT+'#/');
  ok(
    'leaving mid-speed practice exposes 22/43 on Today',
    await appears(page.getByText(/22 из 43 заданий/),8000)
  );

  await page.reload();
  ok(
    'production reload keeps the same unfinished 22/43 progress',
    await appears(page.getByText(/22 из 43 заданий/),8000)
  );

  await page.goto(ROOT+'#/course');
  ok(
    'Route still agrees with Today after reload',
    await appears(page.getByText('22/43',{exact:true}),8000)
  );

  ok('focused progress flow has no runtime errors',errors.length===0);
  if(errors.length)console.log(errors.join('\n'));

  await context.close();

  // A second fresh anonymous device checks the original failure mode:
  // attempted-but-wrong regular tasks must not inflate the day counter.
  const correctionContext=await browser.newContext({
    viewport:{width:390,height:800},
    locale:'ru-RU'
  });
  await correctionContext.addInitScript(()=>{
    try{localStorage.setItem('unmute.onboarding.v1','1');}catch{}
  });
  const correction=await correctionContext.newPage();
  const correctionErrors=[];
  correction.on('pageerror',error=>correctionErrors.push(String(error)));

  await correction.goto(ROOT+'#/');
  await correction.getByRole('button',{name:'Начать',exact:true}).click();
  await correction.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  await correction.getByRole('heading',{name:'Задание 1'}).waitFor({timeout:8000});

  for(let index=0;index<19;index++){
    await twoTapChoice(correction,'Неверно');
  }

  ok(
    'all 19 wrong regular first-pass answers enter correction with 19 still unresolved',
    await appears(correction.getByText('Работа над ошибками · осталось 19',{exact:true}),8000)
  );
  await correction.waitForFunction(()=>{
    const raw=localStorage.getItem('unmute.lesson-run:general-foundation:day-3');
    if(!raw)return false;
    try{
      const run=JSON.parse(raw);
      const results=run.taskSection?.firstPassResults??run.firstPassResults??{};
      return Object.keys(results).length===19;
    }catch{return false;}
  });

  await correction.goto(ROOT+'#/');
  ok(
    'wrong first-pass attempts do not count as completed day units',
    await appears(correction.getByText(/0 из 43 заданий/),8000)
  );
  ok(
    'Today still offers Continue because the unfinished run exists',
    await appears(correction.getByRole('button',{name:'Продолжить',exact:true}),3000)
  );

  await correction.reload();
  ok(
    'reload preserves 0/43 plus the unresolved correction queue',
    await appears(correction.getByText(/0 из 43 заданий/),8000)
  );

  await correction.getByRole('button',{name:'Продолжить',exact:true}).click();
  await correction.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  ok(
    'resume returns to the 19-item correction queue',
    await appears(correction.getByText('Работа над ошибками · осталось 19',{exact:true}),8000)
  );

  await twoTapChoice(correction,'Верно');
  ok(
    'one corrected task reduces the unresolved queue to 18',
    await appears(correction.getByText('Работа над ошибками · осталось 18',{exact:true}),8000)
  );

  await correction.goto(ROOT+'#/');
  ok(
    'one resolved correction moves canonical progress from 0/43 to 1/43',
    await appears(correction.getByText(/1 из 43 заданий/),8000)
  );
  await correction.goto(ROOT+'#/course');
  ok(
    'Route agrees with Today after the correction',
    await appears(correction.getByText('1/43',{exact:true}),8000)
  );

  ok('wrong-first-pass flow has no runtime errors',correctionErrors.length===0);
  if(correctionErrors.length)console.log(correctionErrors.join('\n'));

  await correctionContext.close();

  // A third fresh device checks the speed-specific rule from the contract:
  // «Совпало», but too slow, is still unresolved and must return in correction.
  const slowContext=await browser.newContext({
    viewport:{width:390,height:800},
    locale:'ru-RU'
  });
  await slowContext.addInitScript(()=>{
    try{localStorage.setItem('unmute.onboarding.v1','1');}catch{}
  });
  const slow=await slowContext.newPage();
  const slowErrors=[];
  slow.on('pageerror',error=>slowErrors.push(String(error)));

  await slow.goto(ROOT+'#/');
  await slow.getByRole('button',{name:'Начать',exact:true}).click();
  await slow.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  await slow.getByRole('heading',{name:'Задание 1'}).waitFor({timeout:8000});

  for(let index=0;index<19;index++){
    await twoTapChoice(slow,'Верно');
  }
  await slow.getByText('Тренируем скорость: фразы должны вылетать без раздумий.').waitFor({timeout:8000});
  await slow.getByRole('button',{name:'Начать',exact:true}).click();

  // Do not press «Готово»: the timer reveals the answer after the nominal deadline
  // plus the hidden 600 ms reaction grace. A matching phrase is still unresolved.
  ok(
    'a phrase that exceeds the speed deadline is marked slow',
    await appears(slow.getByText('Медленно',{exact:true}),8000)
  );
  await slow.getByRole('button',{name:'Совпало',exact:true}).click();

  for(let index=1;index<8;index++){
    await slow.getByRole('button',{name:'Готово',exact:true}).click();
    await slow.getByRole('button',{name:'Совпало',exact:true}).click();
  }

  ok(
    'slow-but-matching phrase enters work on mistakes',
    await appears(slow.getByText('Работа над ошибками · осталось 1',{exact:true}),8000)
  );

  await slow.goto(ROOT+'#/');
  ok(
    'seven fast phrases plus one slow phrase produce 26/43, not 27/43',
    await appears(slow.getByText(/26 из 43 заданий/),8000)
  );

  await slow.reload();
  ok(
    'slow phrase remains unresolved after reload',
    await appears(slow.getByText(/26 из 43 заданий/),8000)
  );

  await slow.getByRole('button',{name:'Продолжить',exact:true}).click();
  await slow.waitForURL(/#\/learn\/day-3/,{timeout:5000});
  ok(
    'resume returns to the single slow speed correction',
    await appears(slow.getByText('Работа над ошибками · осталось 1',{exact:true}),8000)
  );

  await slow.getByRole('button',{name:'Готово',exact:true}).click();
  await slow.getByRole('button',{name:'Совпало',exact:true}).click();
  await slow.getByText(/7 из 8 вовремя/).waitFor({timeout:8000});
  await slow.getByRole('button',{name:'Далее',exact:true}).click();

  ok(
    'after correcting the slow phrase the lesson advances to listening',
    await appears(slow.getByText('Тренируем слух: понимать фразу с первого раза, без текста.'),8000)
  );

  await slow.goto(ROOT+'#/');
  ok(
    'corrected speed mode closes all eight speed units: 27/43',
    await appears(slow.getByText(/27 из 43 заданий/),8000)
  );
  await slow.goto(ROOT+'#/course');
  ok(
    'Route agrees with the corrected 27/43 speed state',
    await appears(slow.getByText('27/43',{exact:true}),8000)
  );

  ok('slow-speed correction flow has no runtime errors',slowErrors.length===0);
  if(slowErrors.length)console.log(slowErrors.join('\n'));

  await slowContext.close();
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.close();
}

console.log(bad?'\nDay progress e2e failures: '+bad:'\nDay progress e2e passed');
process.exit(bad?1:0);
