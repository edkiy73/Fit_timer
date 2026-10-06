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
    const option=page.locator('label.learn-option',{hasText:'Верно'}).first();
    await option.click();
    await option.click();
    const next=page.getByRole('button',{name:'Далее',exact:true});
    await next.waitFor({timeout:5000});
    await next.click();
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
    await page.getByRole('button',{name:'Совпало',exact:true}).click();
    await page.getByRole('button',{name:'Далее',exact:true}).click();
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
}catch(error){
  bad++;
  console.error(error);
}finally{
  await browser.close();
  server.close();
}

console.log(bad?'\nDay progress e2e failures: '+bad:'\nDay progress e2e passed');
process.exit(bad?1:0);
