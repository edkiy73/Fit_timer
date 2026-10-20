import fs from 'node:fs';import { fileURLToPath } from 'node:url';import vm from 'node:vm';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../prototype/v11/',import.meta.url));
const noop=()=>{};const node=()=>({dataset:{},style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},addEventListener:noop,setAttribute:noop,removeAttribute:noop,querySelector:()=>null,querySelectorAll:()=>[],focus:noop,getBoundingClientRect:()=>({height:0}),innerHTML:'',scrollTop:0});const nodes=new Map();
const document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)},querySelectorAll:()=>[],addEventListener:noop,documentElement:node(),body:node(),activeElement:null};
const c={document,console,URL,URLSearchParams,Intl,Date,Set,Map,Promise,innerHeight:844,innerWidth:390,navigator:{language:'ru'},location:{href:'https://example.test/prototype-v10.html',search:'',hash:''},history:{replaceState:noop,pushState:noop,go:noop,back:noop},localStorage:{getItem:()=>null,setItem:noop},matchMedia:()=>({matches:false,addEventListener:noop}),setTimeout:()=>0,clearTimeout:noop,setInterval:()=>0,clearInterval:noop,requestAnimationFrame:noop,MutationObserver:class{observe(){}},addEventListener:noop};c.window=c;vm.createContext(c);
for(const f of ['data','topics','core','ui','media','s-location','s-auth','s-feed','s-events','s-people','s-profile','s-comm','s-chats','s-me','s-settings','s-completion','s-navigation','qa'])vm.runInContext(fs.readFileSync(root+f+'.js','utf8'),c,{filename:f+'.js'});
const run=s=>vm.runInContext(s,c);const json=s=>JSON.parse(JSON.stringify(run(s)));
run("render=()=>{};refresh=()=>{};var notices=[];toast=(message,options)=>notices.push({message,options});");
const fresh=()=>run("S=freshState('full');S.lang='ru';S.session={};initNav();notices=[];");
const authScreen=(id,p)=>run(`S.session=null;initNav();S.nav.auth.push({id:'${id}',p:${JSON.stringify(p)},f:{}});SC.${id}.render(cur().p,cur())`);
const appScreen=(id,p)=>run(`S.nav.stacks[S.nav.tab].push({id:'${id}',p:${JSON.stringify(p)},f:{}});SC.${id}.render(cur().p,cur())`);
const src=f=>fs.readFileSync(root+f,'utf8');

/* UX-01: quizzes are paused — onboarding, composer and dating copy do not mention them */
{const all=['s-auth.js','s-feed.js','s-people.js','qa.js'].map(src).join('\n');
 for(const s of ['Первый тест','результат теста','С результатом теста','Пройти тест','пройти тесты','Пройденные тесты'])assert.ok(!all.includes(s),`no «${s}»`);
 console.log('PASS UX-01 no quiz mentions outside the «Скоро» stub');}

/* UX-02/UX-03: one 3-step onboarding scale; «мы пара» is not a personal status, the partner question leads to the invitation */
{fresh();const a04=authScreen('A04',{}),a05=authScreen('A05',{step:1}),a05b=authScreen('A05',{step:2});fresh();
 assert.ok(a04.includes('1 / 3')&&a05.includes('2 / 3')&&a05b.includes('3 / 3'));
 assert.ok(a05.includes('Ты здесь с партнёром?')&&a05.includes('onbPartner'));
 assert.ok(!json("optItems('status')").some(([k])=>k==='couple'),'status choices omit «мы пара»');
 console.log('PASS UX-02/03 onboarding steps and partner question');}

/* UX-04/UX-05: a status is a pill, never a button; leaving lives in the ⋯ menu */
{fresh();run("S.joined.add('rope')");const c03=appScreen('C03',{id:'rope'});
 assert.ok(!c03.includes('data-act="cLeave"'),'no leave button labelled as a state');assert.ok(c03.includes('pill ok'));
 run("S.joined.delete('queer');S.pendingJoin.add('queer')");const q=appScreen('C03',{id:'queer'});
 assert.ok(q.includes('Заявка на рассмотрении')&&q.includes('cCancelReq')&&q.includes('Заявка у ведущих'));assert.ok(!q.includes('Подай заявку'));
 assert.ok(!appScreen('C02',{}).match(/class="pill[^"]*">[^<]*(?:<svg[\s\S]*?<\/svg>)?Ты участник/),'C02 sections do not repeat the state pill');
 console.log('PASS UX-04/05 community state vs action');}

/* UX-06/07/08: cancelled, past and online events */
{fresh();const e7=appScreen('E03',{id:'e7'});
 for(const s of ['Участие по заявке','откроется после одобрения','Пойдёшь?'])assert.ok(!e7.includes(s),`cancelled event hides «${s}»`);
 const e2=appScreen('E03',{id:'e2'});assert.ok(!e2.includes('Точное место'),'online event talks about a link');assert.ok(e2.includes('по твоему времени'));
 assert.ok(!src('ui.js').includes("L('Ты на событии'"));
 console.log('PASS UX-06/07/08/09 event states and time');}

/* UX-11: a topic is never in «Совпадает» and «Стоит обсудить» at once */
{fresh();for(const id of Object.keys(run('PEOPLE'))){const sh=json(`shared('${id}')`);const disc=sh.discuss.join(' ');for(const t of sh.match)assert.ok(!disc.includes(run(`topic('${t}')`)+':'),`${id}: ${t} in both groups`);}
 console.log('PASS UX-11 compatibility groups do not overlap');}

/* UX-13/14: access tabs say the direction; a decline reads «решили не открывать» with a 30-day re-ask */
{fresh();const p7=run("accessBody({tab:'out'})");
 assert.ok(p7.includes('Открыто мной')&&p7.includes('Открыто мне')&&p7.includes('Мои запросы'));assert.ok(!p7.includes('Жду ответа'));
 assert.ok(p7.includes('решили не открывать')&&p7.includes('Запросить снова можно через'));assert.equal(run('REASK_DAYS'),30);
 assert.ok(!run("reqCardHTML({id:'x',p:'kira',scopes:['info'],t:Date.now()})").includes(">Открыть<"),'no bare «Открыть» on a request');
 console.log('PASS UX-13/14 access tabs, decline wording, re-ask');}

/* UX-15: QA aliases resolve instead of throwing */
{fresh();run("qaApp=()=>{};signIn=()=>{}");assert.doesNotThrow(()=>run("qaGo('Q02',{})"));console.log('PASS UX-15 QA alias');}

/* owner: «Я» → «Профиль» / «Профили» */
{fresh();assert.equal(run('meTabName()'),'Профиль');run("S.pair={status:'active',with:'sofi',since:1,name:{ru:'Мы',en:'Us'}}");assert.equal(run('meTabName()'),'Профили');
 console.log('PASS «Профиль» tab name');}

/* owner screenshots (20.10, round 2) */
{fresh();
 const q01=appScreen('Q01',{});assert.ok(q01.includes('or-line')&&q01.includes('pairShareLink')&&!q01.includes('btn text mt12" data-act="pairShareLink"'),'partner link is a divider + secondary button');
 const x01=appScreen('X01',{});assert.ok(!x01.includes('me-pair')&&!x01.includes('class="nextstep"'),'profile hub: pair and next step are plain list rows');assert.ok(x01.includes('Профиль пары'));
 fresh();const h01=appScreen('H01',{sub:'chats'});assert.ok(h01.includes('data-go="H05"')&&!h01.includes('btn text" data-go="H05"'),'archive is a header action');
 assert.ok(/cm-sort"><span class="sortlab">[\s\S]*data-sel="thSort"/.test(run("replyTree('d','d1')")),'reply order is a sort control, not tabs');
 const c07=appScreen('C07',{id:'rope'});assert.ok(c07.includes('Кто увидит')&&c07.includes('alert mt16'),'audience line has its own title and spacing');
 fresh();const mem=appScreen('C03',{id:'rope',t:'members'});assert.ok(mem.includes('cMoreMembers'),'1285 members: the list is paged');run("ACT.cMoreMembers({dataset:{v:'rope'}})");assert.ok(appScreen('C03',{id:'rope',t:'members'}).includes('участник сообщества'),'next page appends demo rows');
 assert.ok(/\.mgrid\[data-reorder\]\{overflow:visible/.test(fs.readFileSync(root+'styles.css','utf8')),'media editor grid does not clip dashed tiles');
 console.log('PASS owner screenshots round 2');}

/* spacing pass (owner, 20.10): plain stacked content has one vertical rhythm */
{const css=fs.readFileSync(root+'styles.css','utf8');
 for(const rule of [':where(.wrap,.auth-wrap,.sh-b)>:where(.btn)+:where(.btn){margin-top:10px}','>.btn.text{margin-inline:auto}','.mb12{margin-bottom:12px}'])assert.ok(css.includes(rule),`spacing rule «${rule}»`);
 console.log('PASS spacing rhythm rules');}

/* owner round 3 (21.10) */
{fresh();
 const prof=appScreen('P01',{id:'maya'});assert.ok(!/class="seg tabs-full[^"]*"[\s\S]{0,400}<em>/.test(prof),'profile activity tabs carry no counters');
 const stream=run("followStream(allPosts().filter(x=>followingOf('me').includes(x.author)),'all',true)");assert.ok(stream.some(x=>x.k!=='post')&&stream.some(x=>x.k==='post'),'«Подписки» mixes posts with followed people’s activity');
 assert.ok(json("followStream(allPosts().filter(x=>followingOf('me').includes(x.author)),'events',true)").every(x=>x.k==='event'),'the kind switch narrows the stream');
 assert.ok(json("followStream(allPosts().filter(x=>followingOf('me').includes(x.author)),'all',false)").every(x=>x.k==='post'),'topic filters hide activity cards');
 const card=run("actCard({k:'follow',who:'maya',p:'mia',t:Date.now()-3600e3},0)");assert.ok(card.includes('теперь следит')&&!/следил[аи]?\b|подписал(ся|ась)/.test(card),'activity lines are gender-neutral');
 assert.ok(!run("authorPicker()").includes('author-picker'),'no author picker without a couple');
 const f07=appScreen('F07',{type:'text'});assert.ok(f07.includes('Приватная часть')&&!f07.includes('Кому открыта'),'audience is a short «Приватная часть · N»');
 const sc=run("SC.D03.render({sub:'discover'},{p:{sub:'discover'},f:{}})");assert.ok(!sc.includes('мало данных'),'no «not enough data» plate on the deck');
 console.log('PASS owner round 3');}

/* chat header: pills only when they say something */
{fresh();run("S.me.jars=[]");/* a new account with no interests yet: nothing in common to show */const ari=appScreen('H02',{id:'ari'});assert.ok(!ari.includes('chat-ctx')&&!ari.includes('мало общего')&&!ari.includes('Приватная часть закрыта'),'Ari has no shared context and no private part: no pills');
 fresh();const mia=appScreen('H02',{id:'mia'});assert.ok(mia.includes('chat-ctx')&&mia.includes('общий интерес'),'a person with shared context keeps the pill');
 console.log('PASS chat header pills');}
