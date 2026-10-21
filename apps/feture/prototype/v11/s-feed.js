/* ============ F: FEED (For you / Following / Events), POSTS, CREATE ============ */
const TYPES=()=>[['text',L('Только текст','Text only')],['photo',L('С фото и видео','With photos & video')],['poll',L('С опросом','With a poll')],['result',L('С интересами','With interests')]];
const filtN=f=>(f.tags||[]).length+(f.ex||[]).length+(f.types||[]).length+(f.kinds||[]).length;
function filterPosts(list,f){return list.filter(p=>!(S.hiddenPosts&&S.hiddenPosts.has(p.id))&&!(S.mutedAuthors&&S.mutedAuthors.has(p.author))&&!isBlocked(p.author)
 &&(!(f.tags||[]).length||p.tags.some(t=>f.tags.includes(t)))&&!p.tags.some(t=>(f.ex||[]).includes(t))&&(!(f.types||[]).length||postKinds(p).some(k=>f.types.includes(k))));}

/** events in the feed: upcoming within 14 days, never cancelled/under review; priority — mine (going/applied) → organisers I follow →
 *  communities I joined → my city or online; one card per six posts, at most three per screen */
function feedEventPicks(){const now=Date.now(),mine=new Set(myUpcomingEventIds()),seen=S.ui.feedEvSeen??={},hidden=S.ui.feedEvHidden??=new Set();
 const rank=id=>{const e=EV(id);if(mine.has(id))return 0;if(social('me').follows.has(e.organizer))return 1;if(e.community&&S.joined.has(e.community))return 2;if(e.format==='online'||e.city===S.me.city)return 3;return 9;};
 /* an event that was first shown more than 3 days ago is not repeated, unless it is mine or starts within 2 days */
 const stale=id=>{const t=seen[id];return t&&now-t>3*DAY&&!mine.has(id)&&EV(id).start-now>2*DAY;};
 const picks=allEventIds().filter(id=>{const e=EV(id);return e&&!hidden.has(id)&&!stale(id)&&!isPast(id)&&!e.cancelled&&e.status!=='review'&&e.start-now<=14*DAY&&e.organizer!=='me'&&!isBlocked(e.organizer);}).map(id=>[rank(id),id]).filter(x=>x[0]<9).sort((a,b)=>a[0]-b[0]||EV(a[1]).start-EV(b[1]).start).slice(0,3).map(x=>x[1]);
 /* at most three distinct events per calendar day: the day's set fills up on first sight and later renders reuse it */
 const day=new Date(now).toDateString(),dd=S.ui.feedEvDay=S.ui.feedEvDay?.d===day?S.ui.feedEvDay:{d:day,ids:new Set()};
 const out=picks.filter(id=>dd.ids.has(id)||dd.ids.size<3);out.forEach(id=>dd.ids.add(id));out.forEach(id=>{seen[id]??=now;});return out;}
SC.F01={root:1,tab:'feed',title:()=>L('Лента','Feed'),render:(p)=>{
 const sub=p.sub||'foryou';
 const head=`${bar(L('Лента','Feed'),{actions:`${searchBtn('posts')}${bellBtn()}`})}`;
 /* V11 (UX-18): the feed source is an explicit two-way switch — «Для тебя» is visible as a state, not implied by an off chip */
 const tabs=`<div class="mb12">${seg([['foryou',L('Для тебя','For you')],['following',L('Подписки','Following')]],sub==='following'?'following':'foryou','feedSub','sm')}</div>`;
 const fkey=sub==='following'?'following':'feed';const f=S.filters[fkey];const n=filtN(f);
 const src=sub==='following'?allPosts().filter(x=>social('me').follows.has(x.author)||x.author==='me'):allPosts();
 const list=filterPosts(src,f).sort((a,b)=>b.t-a.t);
 /* V11 (owner, 20.10): «Подписки» is an activity stream like FetLife's «Отслеживаемое» — posts of people you follow plus what they do (likes, events, communities, follows), filtered by kind.
    Whose activity shows is each person's own setting (Settings → Privacy → Activity). Topic filters apply to posts only, so they hide activity cards. */
 const stream=sub==='following'?followStream(list,f.kinds||[],!((f.tags||[]).length+(f.ex||[]).length+(f.types||[]).length)):null;
 const chipsActive=[...(f.tags||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="tags" data-v="${t}">#${esc(topic(t))} ${ic('close',14)}</button>`),...(f.ex||[]).map(t=>`<button class="chip ex" data-act="rmFilter" data-k="ex" data-v="${t}">${esc(topic(t))} ${ic('close',14)}</button>`),...(f.types||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="types" data-v="${t}">${TYPES().find(x=>x[0]===t)[1]} ${ic('close',14)}</button>`),...(f.kinds||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="kinds" data-v="${t}">${FEED_KINDS().find(x=>x[0]===t)[1]} ${ic('close',14)}</button>`)].join('');
 const quick=!n?Object.keys(TOPICS).slice(0,7).filter(t=>allPosts().some(p=>p.tags.includes(t))).map(t=>`<button class="chip filter" data-act="quickTag" data-v="${t}">#${esc(topic(t))}</button>`).join(''):chipsActive;
 let body;
 if(sub==='following'&&!followingOf('me').length)body=empty('people',L('Подписок пока нет','You’re not following anyone yet'),L('Подпишись на авторов и сообщества — их публикации появятся здесь. Подписка не открывает личный чат.','Follow authors and communities — their posts appear here. Following doesn’t open a private chat.'),`<button class="btn primary" data-go="G01" data-p='{"scope":"people"}'>${L('Найти людей','Find people')}</button><button class="btn soft" data-tab="groups">${L('Сообщества','Communities')}</button>`);
 else if(sub==='following'&&!stream.length)body=empty('filter',L('Ничего не нашлось','Nothing found'),L('С такими фильтрами ничего нет. Сними один из фильтров.','Nothing matches these filters. Remove one of them.'),`<button class="btn soft" data-act="clearFeedFilters">${L('Сбросить фильтры','Reset filters')}</button>`);
 else if(sub==='following')body=`<div class="posts">${firstLoad('feed-following',stream.map((x,i)=>x.k==='post'?postCard(x.p,{i}):actCard(x,i)).join(''),Array.from({length:3},()=>`<div class="sk" style="height:96px;border-radius:22px;margin-top:10px"></div>`).join(''))}</div>`;
 else if(!list.length)body=empty('filter',L('Ничего не нашлось','Nothing found'),L('С такими фильтрами публикаций нет. Сними один из фильтров.','No posts match these filters. Remove one of them.'),`<button class="btn soft" data-act="clearFeedFilters">${L('Сбросить фильтры','Reset filters')}</button>`);
 else{const ev=sub==='foryou'?feedEventPicks():[];let k=0;body=`<div class="posts">${firstLoad('feed-'+sub,list.map((x,i)=>postCard(x,{i})+((i+1)%6===0&&ev[k]?`<div class="feed-ev"><div class="fe-h"><small>${L('Скоро рядом','Coming up')}</small><button type="button" class="linkbtn" data-act="feedEvLess" data-v="${ev[k]}">${L('Реже такое','Less of this')}</button></div>${eventCard(ev[k++],{row:1})}</div>`:'')).join(''))}</div>`;}
 return head+`<div class="view"><div class="wrap">${tabs}
 <div class="composer"><button class="cmp-main" data-go="F07">${av('me','sm')}<span>${L('Что у тебя нового?','What’s on your mind?')}</span></button><button class="ibtn ghost sm" data-act="composeX" data-x="media" aria-label="${L('Фото или видео','Photo or video')}">${I.image}</button><button class="ibtn ghost sm" data-act="composeX" data-x="poll" aria-label="${L('Опрос','Poll')}">${I.poll}</button><button class="ibtn add" data-act="create" aria-label="${L('Создать','Create')}">${I.plus}</button></div>
  <div class="filterline"><div class="chips scroll">${quick}</div><button class="chip filter ${n?'on':''}" data-act="feedFilters" data-v="${fkey}" aria-label="${L('Фильтры','Filters')}">${ic('filter',16)}${L('Фильтры','Filters')}${n?`<em class="badge-abs">${n}</em>`:''}</button></div>
 ${body}</div></div>`;}};
ACT.feedSub=a=>setSub(a.dataset.v);
const FEED_KINDS=()=>[['posts',L('Публикации','Posts')],['likes',L('Лайки','Likes')],['events',L('События','Events')],['comm',L('Сообщества','Communities')],['follows',L('Подписки','Follows')]];
/** posts of followed people + their visible activity, newest first. Two or more of the same kind by the same person on the same day fold into one card. */
function followStream(posts,kinds,withAct){const items=[],all=!kinds.length,has=k=>all||kinds.includes(k);
 if(has('posts'))posts.forEach(p=>items.push({k:'post',t:p.t,p}));
 if(withAct){const muted=S.mutedActivity||new Set(),groups={};
  followingOf('me').filter(id=>person(id)&&activityShown(id)&&!muted.has(id)).forEach(id=>activityOf(id).slice(0,12).forEach(x=>{const key={like:'likes',event:'events',comm:'comm',follow:'follows'}[x.k];if(!has(key)||(x.k==='like'&&person(id)?.hideLikes))return;(groups[id+'|'+x.k]??=[]).push({...x,who:id});}));
  /* a burst = actions of one kind by one person with no pause longer than 6 hours between them (not a calendar day, so midnight never splits it) */
  Object.entries(groups).forEach(([key,list])=>{list.sort((a,b)=>b.t-a.t);const bursts=[];list.forEach(x=>{const cur=bursts[bursts.length-1];cur&&cur[cur.length-1].t-x.t<=6*HOUR?cur.push(x):bursts.push([x]);});
   bursts.forEach(g=>g.length>=2?items.push({k:'group',kind:g[0].k,who:g[0].who,gid:key+'|'+Math.round(g[0].t/6e4),items:g,t:g[0].t}):items.push(g[0]));});}
 return items.sort((a,b)=>b.t-a.t).slice(0,60);}
/** what a post is made of: media (photos / one or more videos), a poll, interests, text */
function postParts(p){const media=(p.media||[]).filter(m=>m.url),photos=media.filter(m=>m.type!=='video').length,videos=media.filter(m=>m.type==='video').length;return {media,photos,videos,poll:!!(p.poll||p.type==='poll'),result:!!(p.result||p.type==='result')};}
/** «6 фото · видео · опрос · интересы» — the composition of a post in words */
function partsLine(p){const q=postParts(p),a=[];if(q.videos)a.push(q.videos>1?pl(q.videos,['видео','видео','видео'],['video','videos']):L('видео','video'));if(q.photos)a.push(pl(q.photos,['фото','фото','фото'],['photo','photos']));if(q.poll)a.push(L('опрос','poll'));if(q.result)a.push(L('интересы','interests'));return a.join(' · ');}
/** thumbnail of a liked post: the first photo / video poster if there is media (counter for several, play mark for video), otherwise a poll / interests / text tile; extra parts ride as small marks */
function likeThumb(p,row){const q=postParts(p),first=q.media[0],n=q.media.length;
 /* a media tile names the photos in its counter; a video next to photos, a poll and interests ride as small marks inside the top-right corner */
 const mk=[q.photos&&q.videos&&I.video,q.poll&&I.poll,q.result&&I.test].filter(Boolean),marks=n&&mk.length?`<span class="actc-xs">${mk.map(m=>`<i>${m}</i>`).join('')}</span>`:'';
 if(first){const src=first.type==='video'?first.poster:first.url;
  const body=src?`<img src="${esc(src)}" alt="" loading="lazy" draggable="false">`:`<span class="actc-vid">${I.video}</span>`;
  const cnt=q.photos&&(q.photos>1||q.videos)?`<span class="actc-n">${I.image}${q.photos}</span>`:q.videos>1?`<span class="actc-n">${I.video}${q.videos}</span>`:q.videos?`<span class="actc-n">${I.video}${fmtDur(first.dur||0)}</span>`:'';
  const play=first.type==='video'?`<span class="mplay">${I.playf}</span>`:'';
  return {cls:n>1?'multi':'',html:body+play+cnt+(row?'':marks),mc:n,parts:partsLine(p)};}
 if(q.poll)return {cls:'kind',html:`${I.poll}${row?'':`<small>${L('Опрос','Poll')}</small>`}`,mc:0,parts:partsLine(p)};
 if(q.result)return {cls:'kind',html:`${I.test}${row?'':`<small>${L('Интересы','Interests')}</small>`}`,mc:0,parts:partsLine(p)};
 return row?{cls:'ic',html:I.edit,mc:0,parts:''}:{cls:'txt',html:`<span>${esc(mdPlain(T(p.text)).slice(0,40))}</span>`,mc:0,parts:''};}
/** the tappable preview of one activity item (used by single cards and by the expanded list of a group) */
function actPrev(x){const pv=(go,p,thumb,t,s)=>`<button class="actc-p" data-go="${go}" data-p='${esc(JSON.stringify(p))}'><span class="actth ${thumb[1]||''}">${thumb[0]}</span><span class="tx"><b>${t}</b>${s?`<small>${s}</small>`:''}</span></button>`;
 if(x.k==='like'){const p=x.post,t=likeThumb(p,1);return pv('F05',{id:p.id},[t.html,t.cls],esc(mdPlain(T(p.text)).slice(0,80)||L('Публикация','Post')),`${esc(pname(p.author))}${t.parts?` · ${t.parts}`:''} · ${F.rel(x.t)}`);}
 if(x.k==='event'){const e=EV(x.e);return pv('E03',{id:x.e},[evCover(e,'cal'),''],esc(T(e.title)),`${F.date(e.start)} · ${e.format==='online'?L('онлайн','online'):esc(city(e.city))}`);}
 if(x.k==='comm'){const c=COMMUNITIES[x.c];return pv('C03',{id:x.c},[commAv(c),''],esc(T(c.name)),pl(C.members(x.c),['участник','участника','участников'],['member','members']));}
 return pv('P01',{id:x.p},[av(x.p,''),'round'],esc(pname(x.p)),esc(whoLine(x.p)));}
/** one activity card: who + what in a neutral present-tense line; a group adds a strip of thumbnails («+N» expands the whole list in place) */
function actCard(x,i){const who=x.who,nm=`<b>${esc(pname(who))}</b>`;let text,body;
 const head=(t)=>`<div class="actc-hd"><p class="actc-t">${t}<small>${F.rel(x.t)}</small></p><button class="ibtn ghost sm" data-act="actMenu" data-v="${esc(who)}" aria-label="${L('Ещё','More')}">${I.more}</button></div>`;
 if(x.k==='group'){const n=x.items.length,open=S.ui.actOpen?.has(x.gid);
  const th=(g)=>{if(g.k==='like'){const t=likeThumb(g.post);return `<button class="actc-th ${t.cls}" data-go="F05" data-p='${esc(JSON.stringify({id:g.post.id}))}' aria-label="${esc(pname(g.post.author))}">${t.html}</button>`;}
   if(g.k==='follow')return `<button class="actc-th round" data-go="P01" data-p='${esc(JSON.stringify({id:g.p}))}' aria-label="${esc(pname(g.p))}">${av(g.p,'')}</button>`;return '';};
  if(x.kind==='like')text=L(`${nm}: нравится ${pl(n,['публикация','публикации','публикаций'],[])}`,`${nm} likes ${n} posts`);
  else if(x.kind==='follow')text=L(`${nm} теперь следит за ${n} ${n%10===1&&n%100!==11?'человеком':'людьми'}`,`${nm} now follows ${n} people`);
  else if(x.kind==='event')text=L(`${nm}: в планах ${pl(n,['событие','события','событий'],[])}`,`${nm} has ${n} events planned`);
  else text=L(`${nm} в ${n} сообществах`,`${nm} is in ${n} communities`);
  const strip=['like','follow'].includes(x.kind);
  if(open)body=`<div class="actc-list">${x.items.map(actPrev).join('')}<button class="btn text auto" data-act="actOpen" data-v="${esc(x.gid)}">${L('Свернуть','Collapse')}</button></div>`;
  else if(strip)body=`<div class="actc-row"><div class="actc-strip">${x.items.slice(0,12).map(th).join('')}</div><button class="actc-more" data-act="actOpen" data-v="${esc(x.gid)}" aria-label="${L('Показать все','Show all')}" hidden></button></div>`;
  else body=`<div class="actc-list">${x.items.slice(0,2).map(actPrev).join('')}${n>2?`<button class="btn text auto" data-act="actOpen" data-v="${esc(x.gid)}">${L(`Ещё ${n-2}`,`${n-2} more`)}</button>`:''}</div>`;
  return `<div class="actc" style="animation-delay:${(i||0)*40}ms"><button class="actc-av" data-go="P01" data-p='${esc(JSON.stringify({id:who}))}' aria-label="${esc(pname(who))}">${av(who,'sm')}</button><div class="actc-b">${head(text)}${body}</div></div>`;}
 if(x.k==='like')text=L(`${nm}: нравится публикация ${esc(pname(x.post.author))}`,`${nm} likes ${esc(pname(x.post.author))}’s post`);
 else if(x.k==='event')text=x.st==='interested'?L(`${nm}: интересует событие`,`${nm} is interested in an event`):L(`${nm} идёт на событие`,`${nm} is going to an event`);
 else if(x.k==='comm')text=L(`${nm} в сообществе`,`${nm} is in a community`);
 else text=L(`${nm} теперь следит за ${esc(pname(x.p))}`,`${nm} now follows ${esc(pname(x.p))}`);
 return `<div class="actc" style="animation-delay:${(i||0)*40}ms"><button class="actc-av" data-go="P01" data-p='${esc(JSON.stringify({id:who}))}' aria-label="${esc(pname(who))}">${av(who,'sm')}</button><div class="actc-b">${head(text)}${actPrev(x)}</div></div>`;}
/** a strip scrolls under a fixed «+N» on the right, like the chips under «Фильтры»: N = tiles still hidden to the right; fades show on the side that has more */
function actFit(r){const s=r.firstElementChild,b=r.lastElementChild;b.hidden=false;
 const over=s.scrollWidth>s.clientWidth+1;if(!over){b.hidden=true;s.classList.remove('fl','fr');return;}
 const more=s.scrollLeft+s.clientWidth<s.scrollWidth-2,edge=s.scrollLeft+s.clientWidth-(more?14:-1),hid=[...s.children].filter(t=>t.offsetLeft+t.offsetWidth>edge).length;
 s.classList.toggle('fl',s.scrollLeft>2);s.classList.toggle('fr',more);
 b.innerHTML=hid?`+${hid}`:I.down;}
const actObs=typeof ResizeObserver==='function'?new ResizeObserver(es=>es.forEach(e=>actFit(e.target))):null;
new MutationObserver(()=>$$('.actc-row:not([data-fit])').forEach(r=>{r.dataset.fit=1;actFit(r);actObs?.observe(r);requestAnimationFrame(()=>actFit(r));r.firstElementChild.addEventListener('scroll',()=>actFit(r),{passive:true});})).observe(document.body,{childList:true,subtree:true});
ACT.actOpen=a=>{const o=S.ui.actOpen??=new Set();const g=a.dataset.v;o.has(g)?o.delete(g):o.add(g);refresh();};
ACT.actMenu=a=>{const id=a.dataset.v;sheet(()=>({title:esc(pname(id)),body:`<div class="card list">${linkRow({go:'P01',p:{id},icon:'me',title:L('Открыть профиль','Open profile'),noChev:1})}${linkRow({act:'actMute',v:id,icon:'belloff',title:L('Не показывать активность','Hide this person’s activity'),sub:L('Публикации в ленте останутся','Their posts stay in your feed'),noChev:1})}</div>`}));};
ACT.actMute=a=>{const id=a.dataset.v;(S.mutedActivity??=new Set()).add(id);closeSheet(true);refresh();toast(L(`Активность ${pname(id)} скрыта из ленты`,`${pname(id)}’s activity is hidden from your feed`),{type:'ok',action:{label:L('Вернуть','Undo'),fn:()=>{S.mutedActivity.delete(id);refresh();}}});};
ACT.quickTag=a=>{const fk=cur().p.sub==='following'?'following':'feed';const f=S.filters[fk];f.tags=f.tags||[];const v=a.dataset.v;const k=f.tags.indexOf(v);k<0?f.tags.push(v):f.tags.splice(k,1);refresh();};
ACT.rmFilter=a=>{const fk=cur().p.sub==='following'?'following':'feed';const f=S.filters[fk];f[a.dataset.k]=(f[a.dataset.k]||[]).filter(x=>x!==a.dataset.v);refresh();};
ACT.clearFeedFilters=()=>{const fk=cur().p.sub==='following'?'following':'feed';S.filters[fk]={};refresh();};

/* F02 — feed filters: include / exclude topics, post types; applies to the current tab only */
ACT.feedFilters=a=>{const fk=a.dataset.v;const d=JSON.parse(JSON.stringify(S.filters[fk]));d.tags=d.tags||[];d.ex=d.ex||[];d.types=d.types||[];d.kinds=d.kinds||[];delete d.events;S.ui.ff={fk,d};
 const src=()=>fk==='following'?allPosts().filter(x=>social('me').follows.has(x.author)||x.author==='me'):allPosts();const TI=topicItems();
 filterSheet({noCount:1,title:L('Фильтры ленты','Feed filters'),draft:()=>S.ui.ff.d,count:()=>filterPosts(src(),S.ui.ff.d).length,
  applyLabel:n=>n?L(`Показать ${pl(n,['публикацию','публикации','публикаций'],[])}`,`Show ${pl(n,[],['post','posts'])}`):L('Нет подходящих публикаций','No matching posts'),
  reset:()=>{S.ui.ff.d={tags:[],ex:[],types:[],kinds:[]};},apply:()=>{S.filters[fk]=S.ui.ff.d;},
  rows:[...(fk==='following'?[{k:'kinds',label:L('Что показывать','Show'),clear:()=>{S.ui.ff.d.kinds=[];},on:()=>S.ui.ff.d.kinds.length,summary:()=>sumOf(FEED_KINDS(),S.ui.ff.d.kinds,L('Всё','Everything')),body:()=>fChips(FEED_KINDS(),S.ui.ff.d.kinds,'ffKind')}]:[]),{k:'types',label:L('Что в публикации','Post contains'),on:()=>S.ui.ff.d.types.length,clear:()=>{S.ui.ff.d.types=[];},summary:()=>sumOf(TYPES(),S.ui.ff.d.types,L('Всё','Anything')),body:()=>fChips(TYPES(),S.ui.ff.d.types,'ffType')},
   {k:'tags',label:L('Показывать интересы','Show interests'),search:1,clear:()=>{S.ui.ff.d.tags=[];},pick:()=>({items:TI,sel:S.ui.ff.d.tags,act:'ffTag',groups:topicGroups()}),on:()=>S.ui.ff.d.tags.length,summary:()=>sumOf(TI,S.ui.ff.d.tags,L('Все интересы','All interests')),body:()=>fChips(TI,S.ui.ff.d.tags,'ffTag',{groups:topicGroups()})},
   {k:'ex',label:L('Скрывать интересы','Hide interests'),search:1,clear:()=>{S.ui.ff.d.ex=[];},pick:()=>({items:TI,sel:S.ui.ff.d.ex,act:'ffEx',groups:topicGroups()}),on:()=>S.ui.ff.d.ex.length,summary:()=>sumOf(TI,S.ui.ff.d.ex,L('Ничего не скрыто','Nothing hidden')),body:()=>fChips(TI,S.ui.ff.d.ex,'ffEx',{groups:topicGroups()})}]});};
const ffToggle=(k)=>a=>{const d=S.ui.ff.d;const v=a.dataset.v;const arr=d[k];const i=arr.indexOf(v);i<0?arr.push(v):arr.splice(i,1);if(k==='tags')d.ex=d.ex.filter(x=>x!==v);if(k==='ex')d.tags=d.tags.filter(x=>x!==v);resheet();};
ACT.ffKind=ffToggle('kinds');ACT.ffTag=ffToggle('tags');ACT.ffEx=ffToggle('ex');ACT.ffType=ffToggle('types');
ACT.ffReset=()=>{S.ui.ff.d={tags:[],ex:[],types:[]};resheet();};
ACT.ffMode=a=>{S.ui.ffMode=a.dataset.v;resheet();};
ACT.ffApply=()=>{S.filters[S.ui.ff.fk]=S.ui.ff.d;closeSheet();refresh();};

/* post actions — a post like is a reaction, never a personal like */
ACT.likePost=a=>{const p=postById(a.dataset.v);if(!p||p.unavailable||!canAct('react','me')||isBlocked(p.author))return;const actor='me';p.reactions??={me:!!p.liked};p.reactions[actor]=!p.reactions[actor];if(actor==='me'){p.liked=p.reactions.me;p.likedAt=p.liked?Date.now():undefined;}paintReactions();};
ACT.savePost=a=>{const p=postById(a.dataset.v);p.saved=!p.saved;const s=S.me.saved.posts;p.saved?s.push(p.id):s.splice(s.indexOf(p.id),1);a.classList.toggle('saved',p.saved);a.innerHTML=p.saved?I.bookmarkf:I.bookmark;toast(p.saved?L('Сохранено — найдёшь в «Профиль → Сохранённое»','Saved — find it in Profile → Saved'):L('Убрано из сохранённого','Removed from saved'),{type:p.saved?'ok':'',action:p.saved?{label:L('Открыть','Open'),fn:()=>go('G04')}:null});};
ACT.sharePost=()=>{toast(L('Ссылка скопирована. Откроется только у тех, кому видна публикация','Link copied. It opens only for people who can see the post'),{type:'ok'});};
/* V7: a vote can be changed (tap another option) or withdrawn (tap it again / «Отменить голос») */
ACT.vote=a=>{const p=postById(a.dataset.v),i=+a.dataset.i;if(!p?.poll?.[i]||p.vote!=null)return;run(null,()=>{if(p.vote!=null)return;p.vote=i;p._voteAt=Date.now();refresh();},{ms:220});};
ACT.unvote=a=>{const p=postById(a.dataset.v);if(!p?.poll||p.vote==null)return;run(null,()=>{p.vote=null;refresh();},{ms:220,ok:L('Голос отменён','Vote withdrawn')});};

/* post menu (restored: it was dropped by mistake in #1115) */
ACT.postMenu=a=>{const p=postById(a.dataset.v);const mine=ownedIdentity(p.author);
 sheet(()=>({title:L('Публикация','Post'),body:`<div class="card list">${mine?`${linkRow({act:'editPost',v:p.id,icon:'edit',title:L('Редактировать','Edit'),noChev:1})}${linkRow({act:'delPost',v:p.id,icon:'trash',cls:'danger',title:L('Удалить','Delete'),noChev:1})}`:
 `${linkRow({act:'hidePost',v:p.id,icon:'eyeoff',title:L('Скрыть публикацию','Hide this post'),sub:L('Больше не увидишь её в ленте','You won’t see it in your feed'),noChev:1})}${linkRow({act:'muteAuthor',v:p.author,icon:'belloff',title:L(`Не показывать ${esc(pname(p.author))}`,`Mute ${esc(pname(p.author))}`),sub:L('Автор не узнает об этом','The author won’t be notified'),noChev:1})}${linkRow({act:'sharePost',v:p.id,icon:'link',title:L('Скопировать ссылку','Copy link'),noChev:1})}${linkRow({act:'report',v:'post',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1})}`}</div>`}));};
ACT.hidePost=a=>{S.hiddenPosts=S.hiddenPosts||new Set();S.hiddenPosts.add(a.dataset.v);closeSheet();refresh();toast(L('Публикация скрыта','Post hidden'),{action:{label:L('Вернуть','Undo'),fn:()=>{S.hiddenPosts.delete(a.dataset.v);refresh();}}});};
ACT.muteAuthor=a=>{S.mutedAuthors=S.mutedAuthors||new Set();S.mutedAuthors.add(a.dataset.v);closeSheet();refresh();toast(L(`Публикации ${pname(a.dataset.v)} скрыты из ленты`,`${pname(a.dataset.v)} muted in your feed`),{action:{label:L('Вернуть','Undo'),fn:()=>{S.mutedAuthors.delete(a.dataset.v);refresh();}}});};
ACT.delPost=a=>{const id=a.dataset.v,post=ownPost(id),ticket=authorTicket(post?.author||'me');if(!post||!validAuthor(ticket))return;const joint=post.author==='couple';closeSheet(true);ask({icon:'trash',tone:'l',title:joint?L('Скрыть совместную публикацию?','Hide the joint post?'):L('Удалить публикацию?','Delete this post?'),text:joint?L('Публикация исчезнет из общего показа и останется в закрытом архиве.','The post leaves public view and stays in the private archive.'):L('Её больше никто не увидит. Комментарии тоже удалятся.','Nobody will see it again. Comments are deleted too.'),ok:joint?L('Скрыть','Hide'):L('Удалить','Delete'),danger:true}).then(ok=>{if(!ok||!validAuthor(ticket)||ownPost(id)!==post)return;run(null,()=>{if(!validAuthor(ticket)||ownPost(id)!==post)return;if(joint){post.hiddenByPair=true;post.hiddenMedia=post.media;post.media=[];const q=jointQueue()[id];if(q)q.status='cancelled';}else S.myPosts=S.myPosts.filter(x=>x!==post);delete S.postEdits[id];if(cur().id==='F05')back();else refresh();},{ok:joint?L('Публикация скрыта','Post hidden'):L('Публикация удалена','Post deleted')});});};
ACT.editPost=a=>{closeSheet(true);const p=postById(a.dataset.v);go('F07',{id:p.id});};
/* F05 — post with replies */
SC.F05={title:()=>L('Публикация','Post'),valid:p=>!!postById(p.id)&&!isBlocked(postById(p.id).author),render:(p,r)=>{const x=postById(p.id);
 return `${bar(L('Публикация','Post'),{back:1,sm:1,actions:authorPicker()})}<div class="view nodock cta1"><div class="wrap">${postCard(x,{detail:1})}
 <div class="sec" id="replies">${pl(x.comments.length,['ответ','ответа','ответов'],['reply','replies'])}</div>
 ${x.comments.length?replyTree('p',x.id):``}
 </div></div><div class="inputbar">${replyComposer(r)}<textarea id="cmt" rows="1" placeholder="${L('Ответить…','Reply…')}" aria-label="${L('Ответ','Reply')}" data-in="grow" data-enter="sendComment">${esc(r.f.cmt||'')}</textarea><button class="ibtn send" data-act="sendComment" aria-label="${L('Отправить','Send')}">${I.send}</button></div>`;},after:p=>scrollToReply(p)};
IN.grow=el=>{el.style.height='auto';const h=el.scrollHeight+2;el.style.height=Math.min(120,h)+'px';el.style.overflowY=h>120?'auto':'hidden';cur().f[el.id]=el.value;const s=el.parentNode.querySelector('.send');if(s)s.disabled=!el.value.trim();};
ACT.focusReply=()=>ACT.dockReply();
function sendPostReply(c,x,route,owner,session){const allowed=()=>S===owner&&S.session===session&&authorAllowed(c.a)&&postById(x.id)===x&&x.comments.includes(c)&&!c.deleted&&!isBlocked(x.author);if(!allowed())return;const repaint=()=>{if(cur()===route)refresh();};c.status='pending';repaint();net().then(()=>{if(!allowed())return;c.status='';notifyReply('p',x.id,c);repaint();}).catch(()=>{if(!allowed())return;c.status='failed';repaint();toast(L('Ответ не отправлен. Текст сохранён — можно повторить','Reply not sent. Your text is kept — you can retry'),{type:'err'});});}
ACT.sendComment=()=>{const route=cur(),el=$('#cmt'),v=el?.value.trim();if(!v){el?.focus();return;}if(v.length>1000){toast(L('Максимум 1000 символов','1000 characters max'),{type:'err'});return;}const x=postById(route.p.id);if(!canAct('comment','me')||!S.session||!x||x.unavailable||isBlocked(x.author))return;identifyReplies('p',x.id);const parent=x.comments.find(c=>c.id===route.replyTarget?.id);if(route.replyTarget&&(!parent||parent.deleted||isBlocked(parent.a)))return;const c={id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),a:'me',sender:pairMember(),text:{ru:v,en:v},parent:parent?.id||null,t:Date.now(),status:'pending'};x.comments.push(c);route.f.cmt='';delete route.replyTarget;route.scrollTo=c.id;sendPostReply(c,x,route,S,S.session);};
ACT.retryComment=a=>{const x=postById(cur().p.id);if(!x)return;const c=identifyReplies('p',x.id).find(c=>c.id===a.dataset.v)||x.comments[+a.dataset.v];if(!c||c.status!=='failed'||!ownedIdentity(c.a))return;sendPostReply(c,x,cur(),S,S.session);};

/* F04 — topic feed */
SC.F04={title:p=>topic(p.id),valid:p=>!!TOPICS[p.id],render:(p)=>{const posts=filterPosts(allPosts(),{}).filter(x=>x.tags.includes(p.id));const comms=Object.keys(COMMUNITIES).filter(c=>COMMUNITIES[c].topics.includes(p.id));const mine=S.me.jars.find(j=>j.t===p.id);
 return `${bar('#'+esc(topic(p.id)),{back:1,sm:1,actions:searchBtn('posts')})}<div class="view nodock"><div class="wrap">
 <div class="card flat"><p style="margin:0 0 12px;font-size:15px">${esc(T(TOPIC_DESC[p.id])||L('Живые публикации и сообщества по интересу.','Live posts and communities on this interest.'))}</p>
 <div class="row g8">${mine?`<span class="pill ok">${I.check}${L('В твоих интересах','In your interests')}</span><button class="btn md soft" data-act="editJar" data-v="${p.id}">${L('Изменить ответ','Edit answer')}</button>`:`<button class="btn md primary" data-act="editJar" data-v="${p.id}">${I.plus}${L('Добавить в интересы','Add to interests')}</button>`}<button class="btn md soft" data-act="topic" data-v="${p.id}">${I.book}${L('О теме','About')}</button></div>
 </div>
 ${comms.length?`<div class="sec">${L('Сообщества','Communities')}</div>${comms.map((c,i)=>commCard(c,{i})).join('')}`:''}
 <div class="sec">${L('Публикации','Posts')}</div>${posts.length?`<div class="posts">${posts.map((x,i)=>postCard(x,{i})).join('')}</div>`:`<p class="note">${L('Публикаций по интересу пока нет.','No posts on this interest yet.')}</p>`}</div></div>`;}};

/* F06 — what to create: three things, not six. Photos, video, a poll and a quiz result are attachments of a post. */
ACT.create=()=>sheet(()=>({title:L('Создать','Create'),body:`<div class="create3">${[['post','edit','l',L('Публикация','Post'),L('Текст, до 6 фото или видео, опрос или твои интересы','Text, up to 6 photos or videos, a poll or your interests')],['event','cal','g',L('Событие','Event'),L('Встреча онлайн или офлайн: дата, место, условия','An online or in-person meetup: date, place, admission')]].map(([t,i,tone,b,s])=>`<button class="c3" data-act="createType" data-v="${t}"><span class="ico ${tone}">${I[i]}</span><span class="tx"><b>${b}</b><small>${s}</small></span>${I.chev}</button>`).join('')}</div>
 <p class="create-qt">${L('Или сразу начать с','Or start straight with')}</p><div class="create-q"><button data-act="createType" data-v="post" data-x="media">${I.image}${L('Фото/видео','Photo/video')}</button><button data-act="createType" data-v="post" data-x="poll">${I.poll}${L('Опрос','Poll')}</button><button data-act="createType" data-v="post" data-x="result">${I.test}${L('Интересы','Interests')}</button></div>`}));
ACT.createType=a=>{const t=a.dataset.v;closeSheet(true);if(t==='event')return go('E11',{});go('F07',{x:a.dataset.x||''});};
ACT.composeX=a=>go('F07',{x:a.dataset.x});

/* F07 — editor; F08 audience; F09 preview */
const AUD=()=>[['all',I.globe,L('Все участники','All members'),L('Видно в ленте и в твоём профиле','Visible in the feed and on your profile')],['followers',I.people,L('Подписчики','Followers'),L('Только те, кто подписан на тебя','Only people who follow you')],['granted',I.key,(n=>L(`Приватная часть${n?` · ${n}`:''}`,`Private part${n?` · ${n}`:''}`))(givenGrantEntries().length),L('Люди, у которых есть доступ к твоей приватной части','People you’ve shared your private part with')]];
const POLL_MAX=10;
/* V8: start minimal — text and three buttons; each block opens only when asked, in its own card */
const resEligible=(actor=actionAuthor())=>(authorProfile(actor)?.jars||[]).filter(j=>!j.limit&&j.vis==='public'&&Number.isInteger(j.lv)&&j.lv>=1&&j.lv<=10);
const postResultSelection=r=>[...new Set(r.resSel||[])].filter(t=>resEligible(r.author||composeActor()).some(j=>j.t===t)).slice(0,4);
const postResultReady=d=>!d.result||postResultSelection({resSel:d.result,author:d.author}).length>0;
const missingPostResult=()=>toast(L('Интересы результата больше не открыты всем. Вернись в редактор','Result interests are no longer public. Return to the editor'),{type:'warn'});
let composeDraftSeq=0;
function syncComposeAudience(owner,aud){if(!owner||typeof navHistory==='undefined'||!navHistory)return;for(const entry of navHistory.entries){for(const route of Object.values(entry.nav?.stacks||{}).flat()){if(route.id==='F07'&&route.composeId===owner){route.aud=aud;route.dirty=true;}if(route.id==='F09'&&route.p.draft?.composeId===owner)route.p.draft.aud=aud;}}}
const composeAudience=()=>cur().id==='F09'?cur().p.draft.aud:cur().aud;
const ownPost=id=>S.myPosts.find(p=>p.id===id&&!p.hiddenByPair&&ownedIdentity(p.author)&&(p.author==='couple'||pairMember()==='me')&&(p.status!=='draft'||(p.creator||'me')===pairMember()));
SC.F07={title:()=>L('Публикация','Post'),valid:p=>!p.id||!!ownPost(p.id),render:(p,r)=>{
 const ex=p.id?postById(p.id):null;
 if(!r.init){r.init=1;r.author=ex?.author||(p.author==='couple'&&activePair()||S.composeActor==='couple'&&activePair()?'couple':'me');r.pairId=ex?.pairId||(r.author==='couple'?(coupleProfile(),S.pair?.id):null);r.composeId='compose'+(++composeDraftSeq);r.pollLocale=S.lang;r.tags=[];r.aud='all';r.media=[];r.poll=null;r.result=false;r.resSel=resEligible().slice(0,4).map(j=>j.t);
  if(ex){r.f.text=T(ex.text);r.f.pollQ=T(ex.pollQ)||'';r.tags=[...ex.tags];r.aud=ex.aud;r.media=(ex.media||[]).slice();r.poll=ex.poll?{opts:ex.poll.map(x=>T(x[0]))}:null;r.result=!!ex.result;if(ex.result)r.resSel=ex.result.map(x=>x[0]);}
  const saved=S.postEdits[p.id]?.draft;if(saved){r.author=ex?.author||saved.author||'me';r.f.text=saved.text;r.f.pollQ=saved.pollQ||'';r.tags=[...saved.tags];r.aud=saved.aud;r.media=saved.media.slice();r.poll=saved.poll?{opts:[...saved.poll]}:null;r.pollLocale=saved.pollLocale||S.lang;r.result=!!saved.result;r.resSel=saved.result?[...saved.result]:[];}
  if(p.x==='poll'||p.type==='poll')r.poll={opts:['','']};if(p.x==='result')r.result=true;if(p.x==='media')setTimeout(()=>{if(cur()===r)ACT.postMedia();},250);}
 r.resSel=postResultSelection(r);
 const a=AUD().find(x=>x[0]===r.aud)||AUD()[0];const m=r.media;const el=resEligible();
 const mediaBlock=m.length?grp(L(`Фото и видео · ${m.length}/${MEDIA_MAX}`,`Photos & video · ${m.length}/${MEDIA_MAX}`),`<div class="edit-ph">${m.map((x,i)=>`<div>${x.type==='video'?`<video src="${esc(x.url)}" muted playsinline preload="metadata"></video><span class="mainph">${ic('video',12)} ${fmtDur(x.dur||0)}</span>`:`<img src="${esc(x.url)}" alt="">`}<button class="rm" data-act="rmMedia" data-v="${i}" aria-label="${L('Убрать','Remove')}">${I.close}</button><button class="vw" data-act="viewDraftMedia" data-v="${i}" aria-label="${L('Посмотреть','View')}"></button></div>`).join('')}${m.length<MEDIA_MAX?`<button data-act="postMedia" aria-label="${L('Добавить фото или видео','Add photo or video')}">${I.plus}</button>`:''}</div>`):'';
 const pollBlock=r.poll?grp(L(`Опрос · ${r.poll.opts.length}/${POLL_MAX}`,`Poll · ${r.poll.opts.length}/${POLL_MAX}`),`${field({name:'pollQ',label:L('Вопрос','Question'),max:200,ph:L('О чём спросить людей?','What do you want to ask?')})}${r.poll.opts.map((o,i)=>`<div class="field pollopt ${r.err&&r.err['o'+i]?'err':''}" data-field="o${i}"><div class="inwrap"><span class="n">${i+1}</span><input class="inp" name="o${i}" data-in="pollOpt" data-i="${i}" value="${esc(o)}" maxlength="80" placeholder="${L('Вариант','Option')} ${i+1}" aria-label="${L('Вариант','Option')} ${i+1}">${r.poll.opts.length>2?`<button class="ibtn ghost sm" data-act="rmOpt" data-v="${i}" aria-label="${L('Убрать вариант','Remove option')}">${I.close}</button>`:''}</div></div>`).join('')}${r.poll.opts.length<POLL_MAX?`<button class="btn text auto" data-act="addOpt">${I.plus}${L('Добавить вариант','Add option')}</button>`:''}${r.err&&r.err.opts?`<div class="ferr">${I.alert}${r.err.opts}</div>`:''}`,{right:`<button data-act="rmPoll">${L('Убрать','Remove')}</button>`,foot:L('Голос можно отменить отдельной ссылкой. После голосования видны участники, выбравшие каждый вариант.','Withdraw your vote using the separate link. After voting, participants can see who chose each option.')+(ex?.poll?' '+L('Изменение вариантов сбросит голоса опроса.','Changing the options resets the poll votes.'):'')}):'';
 const resBlock=r.result?grp(L('Интересы','Interests'),el.length?`${(sel=>sel.length?`<div class="testcard" style="--n:${Math.min(4,sel.length)}">${jarsHTML(sel)}</div>`:'')(el.filter(j=>r.resSel.includes(j.t)).slice(0,4).map(j=>[j.t,j.lv,j.dir]))}<div class="chips mt12">${el.map(j=>chipBtn(j.t,topic(j.t),r.resSel.includes(j.t),'resPick')).join('')}</div>`:`<p class="note">${L('Пока нечего показать: открой хотя бы один интерес для всех в «Профиле».','Nothing to show yet: make at least one interest public in Me.')}</p>`,{right:`<button data-act="rmResult">${L('Убрать','Remove')}</button>`,foot:L('Только интересы, открытые всем, до 4. Ответы, границы и скрытые интересы не попадают.','Only interests open to everyone, up to 4. Answers, limits and hidden topics are never included.')}):'';
 const tools=`<div class="attach">${m.length?'':`<button data-act="postMedia">${I.image}<span>${L('Фото/видео','Photo/video')}</span></button>`}${r.poll?'':`<button data-act="addPoll">${I.poll}<span>${L('Опрос','Poll')}</span></button>`}${r.result?'':`<button data-act="addResult">${I.test}<span>${L('Интересы','Interests')}</span></button>`}</div>`;
 return `${bar(ex?L('Редактирование','Edit post'):L('Новая публикация','New post'),{back:1,sm:1,actions:`<button class="btn text auto" data-act="saveDraft">${L('В черновик','Save draft')}</button>`})}<div class="view nodock cta1"><div class="wrap">
 ${S.postEdits[p.id]?``:''}<section class="grp"><div class="card compose"><div class="row" style="gap:10px">${authorPicker(ex?.status!=='draft'?ex?.author:null)}${selectRow('setAud',L('Кто увидит','Who can see this'),AUD().map(([k,,t])=>[k,t]),composeAudience(),{aria:L('Кто увидит','Who can see this')})}</div>
 ${rteField({name:'text',label:'',max:1000,ph:r.poll?L('Пара слов к опросу — по желанию','A few words about the poll — optional'):L('О чём хочется рассказать?','What would you like to share?')})}
 ${tools}</div>${r.err&&r.err.media?`<div class="ferr">${I.alert}${r.err.media}</div>`:''}</section>
 ${mediaBlock}${pollBlock}${resBlock}
 ${grp(L('Интересы · до 3','Interests · up to 3'),chipPicker({items:topicItems(),sel:r.tags,act:'postTag',title:L('Интересы публикации','Post interests'),max:3,cats:true}))}
 ${r.aud==='granted'?``:''}
 </div></div><div class="ctabar"><div class="wrap"><div class="row g8"><button class="btn soft" style="flex:0 0 auto;width:auto" data-act="toPreview">${I.eye}${L('Как увидят','Preview')}</button><button class="btn primary" data-act="publishNow">${r.author==='couple'&&!pairTrusted()?L('На согласование','Request approval'):m.length?L('Отправить на проверку','Submit for review'):L('Опубликовать','Publish')}</button></div></div></div>`;}};
ACT.resPick=a=>{const r=cur();r.resSel=postResultSelection(r);const v=a.dataset.v;if(!resEligible().some(j=>j.t===v))return;const i=r.resSel.indexOf(v);if(i<0&&r.resSel.length>=4){toast(L('Не больше 4 интересов','Up to 4 interests'),{type:'warn'});return;}i<0?r.resSel.push(v):r.resSel.splice(i,1);r.dirty=true;refresh();};
ACT.publishNow=a=>{if(!validatePost())return;const r=cur();r.p.draft=draftOf(r);ACT.publish(a);};
ACT.postTag=a=>{const r=cur();const v=a.dataset.v;const i=r.tags.indexOf(v);if(i<0&&r.tags.length>=3){toast(L('Можно выбрать не больше 3 интересов','You can pick up to 3 interests'),{type:'warn'});return;}i<0?r.tags.push(v):r.tags.splice(i,1);r.dirty=true;refresh();};
ACT.postMedia=()=>{const r=cur();openUploader({max:MEDIA_MAX,have:r.media.length,accept:'media',aspect:'4:5',aspects:['4:5','1:1','orig'],title:L('Фото и видео','Photos & video'),done:items=>{r.media.push(...items);r.dirty=true;if(r.err)delete r.err.media;refresh();}});};
ACT.viewDraftMedia=a=>openViewer(cur().media.map(m=>({type:m.type,src:m.url})),+a.dataset.v);
ACT.rmMedia=a=>{cur().media.splice(+a.dataset.v,1);cur().dirty=true;refresh();};
ACT.addPoll=()=>{const r=cur();r.poll={opts:['','']};r.dirty=true;refresh();setTimeout(()=>$('[name="o0"]')?.focus(),60);};
ACT.rmPoll=()=>{const r=cur();r.poll=null;r.dirty=true;refresh();};
ACT.addResult=()=>{if(!resEligible().length){toast(L('Сначала открой хотя бы один интерес для всех в «Профиле»','First make at least one interest public in Profile'),{type:'info',action:{label:L('Открыть','Open'),fn:()=>openMe('X01')}});return;}const r=cur();r.result=true;r.dirty=true;refresh();};
ACT.rmResult=()=>{cur().result=false;cur().dirty=true;refresh();};
IN.pollOpt=el=>{const r=cur();r.poll.opts[+el.dataset.i]=el.value;r.dirty=true;if(r.err){delete r.err['o'+el.dataset.i];delete r.err.opts;}$(`[data-field="o${el.dataset.i}"]`)?.classList.remove('err');};
ACT.addOpt=()=>{const r=cur();if(r.poll.opts.length>=POLL_MAX)return;r.poll.opts.push('');refresh();setTimeout(()=>$(`[name="o${r.poll.opts.length-1}"]`)?.focus(),60);};
ACT.rmOpt=a=>{const r=cur();r.poll.opts.splice(+a.dataset.v,1);r.dirty=true;refresh();};
ACT.setAud=a=>{const r=cur(),v=a.dataset.v;if(!AUD().some(x=>x[0]===v))return;if(r.id==='F09'){r.p.draft.aud=v;const editor=stack().slice(0,-1).reverse().find(x=>x.id==='F07');if(editor){editor.aud=v;editor.dirty=true;}syncComposeAudience(r.p.draft.composeId,v);}else{r.aud=v;r.dirty=true;syncComposeAudience(r.composeId,v);}refresh();};
function validatePost(){const r=cur();if(!SC.F07.valid(r.p)){toast(L('Эта публикация больше недоступна для редактирования','This post can no longer be edited'),{type:'warn'});return false;}r.err={};const tx=fv('text').trim();
 if(!tx&&!r.media.length&&!r.result&&!r.poll)r.err.text=L('Напиши пару слов или добавь фото','Write a few words or add a photo');
 if(r.result&&!postResultSelection(r).length)r.err.text=L('Выбери открытые интересы для результата или убери его','Choose public interests for the result or remove it');
 if(r.poll&&!fv('pollQ').trim())r.err.pollQ=L('Напиши вопрос для опроса','Write the poll question');
 if(r.poll&&fv('pollQ').trim().length>200)r.err.pollQ=L('Максимум 200 символов','200 characters max');
 if(tx.length>1000)r.err.text=L('Максимум 1000 символов','1000 characters max');
 if(r.poll){const f=r.poll.opts.map(o=>o.trim());f.forEach((o,i)=>{if(!o)r.err['o'+i]=' ';});const filled=f.filter(Boolean);if(filled.length<2)r.err.opts=L('Нужно минимум 2 варианта','At least 2 options needed');else if(f.some(o=>!o))r.err.opts=L('Заполни или убери пустые варианты','Fill in or remove empty options');if(new Set(filled.map(x=>x.toLowerCase())).size!==filled.length)r.err.opts=L('Варианты не должны повторяться','Options must be different');}
 if(Object.keys(r.err).length){refresh();shakeFirstErr();return false;}return true;}
const draftOf=r=>({author:ownPost(r.p.id)?.status!=='draft'&&ownPost(r.p.id)?ownPost(r.p.id).author:(r.author||'me'),pairId:r.pairId,by:pairMember(),composeId:r.composeId,pollLocale:r.pollLocale,text:fv('text').trim(),tags:[...r.tags],aud:r.aud,media:r.media.slice(),poll:r.poll?r.poll.opts.map(o=>o.trim()).filter(Boolean):null,pollQ:r.poll?fv('pollQ').trim():null,result:r.result&&postResultSelection(r).length?postResultSelection(r):null,edit:r.p.id||null});
const postFromDraft=(d,id,existing=null)=>{
 const samePoll=existing?.poll&&d.poll&&(T(existing.pollQ)||'')===(d.pollQ||'')&&existing.poll.length===d.poll.length&&existing.poll.every((o,i)=>(typeof o[0]==='object'?(o[0][d.pollLocale]??o[0].ru??o[0].en??''):o[0])===d.poll[i]);
 return {id,author:existing?.status!=='draft'&&existing?existing.author:(d.author||'me'),pairId:d.pairId||existing?.pairId,authorName:existing?.authorName||(d.author==='couple'?structuredClone(S.pair?.name):null),coauthors:existing?.coauthors||(d.author==='couple'?[...realMembers('couple')]:[]),creator:existing?.creator||d.by||pairMember(),t:Date.now(),type:'post',tags:d.tags,likes:existing?.likes??0,vote:samePoll?(existing.vote??null):null,pollVoters:samePoll?structuredClone(existing.pollVoters||[]):[],aud:d.aud,text:{ru:d.text,en:d.text},comments:existing?.comments||[],media:d.media,poll:d.poll?(samePoll?existing.poll:d.poll.map(o=>[{ru:o,en:o},0])):null,pollQ:d.poll&&d.pollQ?{ru:d.pollQ,en:d.pollQ}:null,result:d.result?resEligible(d.author||actionAuthor()).filter(j=>postResultSelection({resSel:d.result,author:d.author}).includes(j.t)).map(j=>[j.t,j.lv,j.dir]):null};
};
ACT.toPreview=()=>{if(!validatePost())return;go('F09',{draft:draftOf(cur())});};
ACT.saveDraft=a=>{const r=cur();if(!SC.F07.valid(r.p)){toast(L('Эта публикация больше недоступна для редактирования','This post can no longer be edited'),{type:'warn'});return;}if(!fv('text').trim()&&!r.media.length){setErr('text',L('Пустой черновик не сохранить','Can’t save an empty draft'));shakeFirstErr();return;}
 let saved=false,revision=false;run(a,()=>{if(!SC.F07.valid(r.p))return;const id=r.p.id||'m'+Date.now();const ex=ownPost(id),d=draftOf(r);revision=!!ex&&ex.status!=='draft';if(revision){S.postEdits[id]={draft:copyNavValue(d),t:Date.now()};}else{const obj={...postFromDraft(d,id,ex),status:'draft'};ex?Object.assign(ex,obj):S.myPosts.unshift(obj);}saved=true;r.dirty=false;r.p.id=id;refresh();},{ok:()=>!saved?null:revision?L('Правки сохранены. Исходная публикация не изменена','Changes saved. The original post is unchanged'):L('Черновик сохранён в «Профиль → Мои публикации»','Draft saved in Profile → My posts')});};

SC.F09={title:()=>L('Предпросмотр','Preview'),valid:p=>!!p.draft&&(!p.draft.edit||!!ownPost(p.draft.edit)),render:(p)=>{const d=p.draft;const a=AUD().find(x=>x[0]===d.aud);const fake={...postFromDraft(d,'preview')};MEDIA_SRC.preview=()=>d.media;const hasPhoto=d.media.length>0;
 return `${bar(L('Предпросмотр','Preview'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap">
 <div class="card preview-post" style="padding:0 16px;margin-top:10px">${postCard(fake,{detail:1,preview:1})}</div>
 <div class="card list mt16"><div class="li"><span class="ico v">${I.eye}</span>${selectRow('setAud',L('Кто увидит','Who can see this'),AUD().map(([k,,t])=>[k,t]),composeAudience())}</div>${hasPhoto?linkRow({icon:'shield',tone:'a',title:L('Проверка фото и видео','Photo & video review'),sub:L('Обычно до 30 минут. До этого публикацию видишь только ты','Usually under 30 minutes. Until then only you can see it'),noChev:1}):''}</div>
 </div></div><div class="ctabar"><div class="wrap"><div class="row g8"><button class="btn soft" style="flex:0 0 auto;width:auto" data-back>${L('Изменить','Edit')}</button><button class="btn primary" data-act="publish">${d.author==='couple'&&!pairTrusted()?L('На согласование','Request approval'):hasPhoto?L('Отправить на проверку','Submit for review'):L('Опубликовать','Publish')}</button></div></div></div>`;}};
ACT.back=()=>back();
function finishPostCompose(route,composeId){
 const trim=st=>{let i=composeId?st.findIndex(r=>r.id==='F07'&&r.composeId===composeId):-1;if(i<0&&composeId)i=st.findIndex(r=>r.id==='F09'&&r.p.draft?.composeId===composeId);if(i<0)i=st.indexOf(route);if(i>=0){st.splice(Math.max(1,i));return true;}return false;};
 trim(stack());
 if(typeof navHistory!=='undefined'&&navHistory){for(const entry of navHistory.entries){let changed=false;for(const st of Object.values(entry.nav?.stacks||{}))changed=trim(st)||changed;if(changed){const st=entry.nav.stacks[entry.nav.tab]||[];entry.key=JSON.stringify([!!S.session,entry.nav.tab,st.map(r=>[r.id,r.p])]);}}navNextReplace=true;}
 render('back');
}
ACT.publish=a=>{const route=cur(),d=route.p.draft;if(!d||d.by&&d.by!==pairMember())return;if(d.author==='couple'&&d.pairId!==S.pair?.id)return;const ticket=authorTicket(d.author||'me');if(!authorGuard(ticket.id))return;if(d.edit&&!ownPost(d.edit)){toast(L('Исходная публикация удалена. Изменения не отправлены','The original post was deleted. Changes were not sent'),{type:'warn'});return;}if(!postResultReady(d)){missingPostResult();return;}let published=false;const hasPhoto=d.media.length>0;
 run(a,()=>{
  if(!validAuthor(ticket))return;
  if(d.edit&&!ownPost(d.edit)){toast(L('Исходная публикация удалена. Изменения не отправлены','The original post was deleted. Changes were not sent'),{type:'warn'});return;}
  if(!postResultReady(d)){missingPostResult();return;}
  {const id=d.edit||'m'+Date.now();const ex=S.myPosts.find(x=>x.id===id);const obj={...postFromDraft(d,id,ex),status:hasPhoto?'review':'published'};if(d.author==='couple'){published=submitJointPost(d,id,ex);if(published)finishPostCompose(route,d.composeId||route.composeId);return;}
   ex?Object.assign(ex,obj):S.myPosts.unshift(obj);delete S.postEdits[id];}
  published=true;finishPostCompose(route,d.composeId||route.composeId);if(hasPhoto)autoResolve();
 },{ok:()=>{if(!published)return null;if(d.author==='couple'&&!pairTrusted()){toast(L('Отправлено партнёру на согласование','Sent to your partner for approval'),{type:'ok',action:{label:L('Посмотреть','View'),fn:()=>go('Q03')}});return null;}toast(hasPhoto?L('Отправлено на проверку. Сообщим, когда опубликуем','Submitted for review. We’ll let you know when it’s live'):L('Опубликовано','Published'),{type:'ok',action:{label:L('Мои публикации','My posts'),fn:()=>go('F10')}});return null;}});};

/* F10 — my posts and drafts */
SC.F10={title:()=>L('Мои публикации','My posts'),render:()=>{const by=k=>S.myPosts.filter(x=>x.status===k&&!x.hiddenByPair&&(x.author==='couple'?activePair()&&(k!=='draft'||(x.creator||'me')===pairMember()):pairMember()==='me'));
 const drafts=by('draft'),review=by('review'),pub=by('published');const edits=Object.entries(S.postEdits).filter(([id])=>!!ownPost(id));
 return `${bar(L('Мои публикации','My posts'),{back:1,sm:1,actions:`<button class="ibtn" data-go="F07" aria-label="${L('Создать','Create')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">
 ${activePair()?jointWorkHTML():''}${drafts.length?grp(L(`Черновики · ${drafts.length}`,`Drafts · ${drafts.length}`),drafts.map(x=>`<button class="li" data-go="F07" data-p='${esc(JSON.stringify({id:x.id}))}'><span class="ico">${I.edit}</span><span class="tx"><b>${esc(T(x.text)).slice(0,60)||L('Без текста','No text')}</b><small>${L('Изменён','Edited')} ${F.rel(x.t)}</small></span>${I.chev}</button>`).join(''),{list:1}):''}
 ${edits.length?grp(L(`Сохранённые правки · ${edits.length}`,`Saved changes · ${edits.length}`),edits.map(([id,x])=>`<div class="li"><span class="ico">${I.edit}</span><button class="tx" data-go="F07" data-id="${id}" style="text-align:left"><b>${esc(x.draft.text).slice(0,60)||L('Без текста','No text')}</b><small>${L('Только ты видишь правки ·','Only you see the changes ·')} ${F.rel(x.t)}</small></button><button class="ibtn ghost sm" data-act="discardPostEdits" data-v="${id}" aria-label="${L('Удалить сохранённые правки','Discard saved changes')}">${I.trash}</button></div>`).join(''),{list:1}):''}
 ${review.length?`<section class="grp"><div class="grp-t"><span>${L('На проверке','In review')} · ${review.length}</span></div><div class="posts">${review.map((x,i)=>postCard(x,{i})).join('')}</div></section>`:''}
 ${pub.length?`<section class="grp"><div class="grp-t"><span>${L('Опубликованы','Published')} · ${pub.length}</span></div><div class="posts">${pub.map((x,i)=>postCard(x,{i})).join('')}</div></section>`:''}
 ${!S.myPosts.length?empty('feed',L('Публикаций пока нет','You haven’t posted yet'),L('Поделись мыслью, фото или опросом — аудиторию выбираешь ты.','Share a thought, photos or a poll — you choose the audience.'),`<button class="btn primary" data-go="F07">${L('Создать публикацию','Create a post')}</button>`):''}
 </div></div>`;}};
ACT.f10tab=a=>setP('t',a.dataset.v);


ACT.discardPostEdits=a=>{const id=a.dataset.v,owner=S,edit=S.postEdits[id];if(!edit)return;ask({icon:'trash',title:L('Удалить сохранённые правки?','Discard saved changes?'),text:L('Исходная публикация и ответы останутся. Удалятся только сохранённые правки.','The original post and replies stay. Only the saved changes are discarded.'),ok:L('Удалить правки','Discard changes'),danger:true}).then(ok=>{if(!ok||S!==owner||S.postEdits[id]!==edit)return;let discarded=false;run(null,()=>{if(S.postEdits[id]!==edit)return;delete S.postEdits[id];discarded=true;refresh();},{ok:()=>discarded?L('Правки удалены. Исходная публикация сохранена','Changes discarded. Original post kept'):null});});};


