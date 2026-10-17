/* ============ F: FEED (For you / Following / Events), POSTS, CREATE ============ */
const TYPES=()=>[['text',L('Только текст','Text only')],['photo',L('С фото и видео','With photos & video')],['poll',L('С опросом','With a poll')],['result',L('С результатом теста','With a quiz result')]];
const filtN=f=>(f.tags||[]).length+(f.ex||[]).length+(f.types||[]).length;
function filterPosts(list,f){return list.filter(p=>!(S.hiddenPosts&&S.hiddenPosts.has(p.id))&&!(S.mutedAuthors&&S.mutedAuthors.has(p.author))&&!isBlocked(p.author)
 &&(!(f.tags||[]).length||p.tags.some(t=>f.tags.includes(t)))&&!p.tags.some(t=>(f.ex||[]).includes(t))&&(!(f.types||[]).length||postKinds(p).some(k=>f.types.includes(k))));}

SC.F01={root:1,tab:'feed',title:()=>L('Лента','Feed'),render:(p)=>{
 const sub=p.sub||'foryou';
 const head=`${bar(L('Лента','Feed'),{actions:`${searchBtn('posts')}${bellBtn()}`})}`;
 const tabs='';
 const fkey=sub==='following'?'following':'feed';const f=S.filters[fkey];const n=filtN(f);
 const src=sub==='following'?allPosts().filter(x=>social().follows.has(x.author)||x.author==='me'):allPosts();
 const list=filterPosts(src,f).sort((a,b)=>b.t-a.t);
 const chipsActive=[...(f.tags||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="tags" data-v="${t}">#${esc(topic(t))} ${ic('close',14)}</button>`),...(f.ex||[]).map(t=>`<button class="chip ex" data-act="rmFilter" data-k="ex" data-v="${t}">${esc(topic(t))} ${ic('close',14)}</button>`),...(f.types||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="types" data-v="${t}">${TYPES().find(x=>x[0]===t)[1]} ${ic('close',14)}</button>`)].join('');
 const quick=!n?Object.keys(TOPICS).slice(0,7).filter(t=>allPosts().some(p=>p.tags.includes(t))).map(t=>`<button class="chip filter" data-act="quickTag" data-v="${t}">#${esc(topic(t))}</button>`).join(''):chipsActive;
 let body;
 if(sub==='following'&&!social().follows.size)body=empty('people',L('Ты пока ни на кого не подписан(а)','You’re not following anyone yet'),L('Подпишись на авторов и сообщества — их публикации появятся здесь. Подписка не открывает личный чат.','Follow authors and communities — their posts appear here. Following doesn’t open a private chat.'),`<button class="btn primary" data-go="G01" data-p='{"scope":"people"}'>${L('Найти людей','Find people')}</button><button class="btn soft" data-tab="groups">${L('Сообщества','Communities')}</button>`);
 else if(!list.length)body=empty('filter',L('Ничего не нашлось','Nothing found'),L('С такими фильтрами публикаций нет. Сними один из фильтров.','No posts match these filters. Remove one of them.'),`<button class="btn soft" data-act="clearFeedFilters">${L('Сбросить фильтры','Reset filters')}</button>`);
 else body=`<div class="posts">${firstLoad('feed-'+sub,list.map((x,i)=>postCard(x,{i})).join(''))}</div>`;
 return head+`<div class="view"><div class="wrap">${tabs}
 <div class="composer"><button class="cmp-main" data-go="F07">${av('me','sm')}<span>${L('Что у тебя нового?','What’s on your mind?')}</span></button><button class="ibtn ghost sm" data-act="composeX" data-x="media" aria-label="${L('Фото или видео','Photo or video')}">${I.image}</button><button class="ibtn ghost sm" data-act="composeX" data-x="poll" aria-label="${L('Опрос','Poll')}">${I.poll}</button><button class="ibtn add" data-act="create" aria-label="${L('Создать','Create')}">${I.plus}</button></div>
 <div class="filterline"><div class="chips scroll"><button class="chip filter ${sub==='following'?'on':''}" data-act="feedSub" data-v="${sub==='following'?'foryou':'following'}" aria-pressed="${sub==='following'}">${L('Подписки','Following')}</button>${quick}</div><button class="chip filter ${n?'on':''}" data-act="feedFilters" data-v="${fkey}" aria-label="${L('Фильтры','Filters')}">${ic('filter',16)}${L('Фильтры','Filters')}${n?`<em class="badge-abs">${n}</em>`:''}</button></div>
 ${body}</div></div>`;}};
ACT.feedSub=a=>setSub(a.dataset.v);
ACT.quickTag=a=>{const fk=cur().p.sub==='following'?'following':'feed';const f=S.filters[fk];f.tags=f.tags||[];const v=a.dataset.v;const k=f.tags.indexOf(v);k<0?f.tags.push(v):f.tags.splice(k,1);refresh();};
ACT.rmFilter=a=>{const fk=cur().p.sub==='following'?'following':'feed';const f=S.filters[fk];f[a.dataset.k]=(f[a.dataset.k]||[]).filter(x=>x!==a.dataset.v);refresh();};
ACT.clearFeedFilters=()=>{const fk=cur().p.sub==='following'?'following':'feed';S.filters[fk]={};refresh();};

/* F02 — feed filters: include / exclude topics, post types; applies to the current tab only */
ACT.feedFilters=a=>{const fk=a.dataset.v;const d=JSON.parse(JSON.stringify(S.filters[fk]));d.tags=d.tags||[];d.ex=d.ex||[];d.types=d.types||[];S.ui.ff={fk,d};
 const src=()=>fk==='following'?allPosts().filter(x=>social().follows.has(x.author)||x.author==='me'):allPosts();const TI=topicItems();
 filterSheet({title:L('Фильтры ленты','Feed filters'),draft:()=>S.ui.ff.d,count:()=>filterPosts(src(),S.ui.ff.d).length,
  applyLabel:n=>n?L(`Показать ${pl(n,['публикацию','публикации','публикаций'],[])}`,`Show ${pl(n,[],['post','posts'])}`):L('Нет подходящих публикаций','No matching posts'),
  reset:()=>{S.ui.ff.d={tags:[],ex:[],types:[]};},apply:()=>{S.filters[fk]=S.ui.ff.d;},
  note:fk==='following'?L('Действует только для подписок.','Applies to Following only.'):'',
  rows:[{k:'types',label:L('Что в публикации','Post contains'),on:()=>S.ui.ff.d.types.length,summary:()=>sumOf(TYPES(),S.ui.ff.d.types,L('Всё','Anything')),body:()=>fChips(TYPES(),S.ui.ff.d.types,'ffType')},
   {k:'tags',label:L('Показывать интересы','Show interests'),search:1,pick:()=>({items:TI,sel:S.ui.ff.d.tags,act:'ffTag',groups:topicGroups()}),on:()=>S.ui.ff.d.tags.length,summary:()=>sumOf(TI,S.ui.ff.d.tags,L('Все интересы','All interests')),body:()=>fChips(TI,S.ui.ff.d.tags,'ffTag',{groups:topicGroups()})},
   {k:'ex',label:L('Скрывать темы','Hide topics'),search:1,pick:()=>({items:TI,sel:S.ui.ff.d.ex,act:'ffEx',groups:topicGroups()}),on:()=>S.ui.ff.d.ex.length,summary:()=>sumOf(TI,S.ui.ff.d.ex,L('Ничего не скрыто','Nothing hidden')),body:()=>fChips(TI,S.ui.ff.d.ex,'ffEx',{groups:topicGroups()})}]});};
const ffToggle=(k)=>a=>{const d=S.ui.ff.d;const v=a.dataset.v;const arr=d[k];const i=arr.indexOf(v);i<0?arr.push(v):arr.splice(i,1);if(k==='tags')d.ex=d.ex.filter(x=>x!==v);if(k==='ex')d.tags=d.tags.filter(x=>x!==v);resheet();};
ACT.ffTag=ffToggle('tags');ACT.ffEx=ffToggle('ex');ACT.ffType=ffToggle('types');
ACT.ffReset=()=>{S.ui.ff.d={tags:[],ex:[],types:[]};resheet();};
ACT.ffMode=a=>{S.ui.ffMode=a.dataset.v;resheet();};
ACT.ffApply=()=>{S.filters[S.ui.ff.fk]=S.ui.ff.d;closeSheet();refresh();};

/* post actions — a post like is a reaction, never a personal like */
ACT.likePost=a=>{if(cur().id==='F01'&&activePair()&&!a.dataset.authorConfirmed){openAuthorMenu(a,()=>{a.dataset.authorConfirmed='1';try{ACT.likePost(a);}finally{delete a.dataset.authorConfirmed;}});return;}const p=postById(a.dataset.v);if(!p||p.unavailable||!authorGuard()||isBlocked(p.author))return;const actor=actionAuthor();p.reactions??={me:!!p.liked};p.reactions[actor]=!p.reactions[actor];if(actor==='me')p.liked=p.reactions.me;paintReactions();};
ACT.savePost=a=>{const p=postById(a.dataset.v);p.saved=!p.saved;const s=S.me.saved.posts;p.saved?s.push(p.id):s.splice(s.indexOf(p.id),1);a.classList.toggle('saved',p.saved);a.innerHTML=p.saved?I.bookmarkf:I.bookmark;toast(p.saved?L('Сохранено — найдёшь в «Я → Сохранённое»','Saved — find it in Me → Saved'):L('Убрано из сохранённого','Removed from saved'),{type:p.saved?'ok':'',action:p.saved?{label:L('Открыть','Open'),fn:()=>go('G04')}:null});};
ACT.sharePost=()=>{toast(L('Ссылка скопирована. Откроется только у тех, кому видна публикация','Link copied. It opens only for people who can see the post'),{type:'ok'});};
/* V7: a vote can be changed (tap another option) or withdrawn (tap it again / «Отменить голос») */
ACT.vote=a=>{const p=postById(a.dataset.v),i=+a.dataset.i;if(!p?.poll?.[i]||p.vote!=null)return;run(null,()=>{if(p.vote!=null)return;p.vote=i;p._voteAt=Date.now();refresh();},{ms:220});};
ACT.unvote=a=>{const p=postById(a.dataset.v);if(!p?.poll||p.vote==null)return;run(null,()=>{p.vote=null;refresh();},{ms:220,ok:L('Голос отменён','Vote withdrawn')});};

/* post menu (restored: it was dropped by mistake in #1115) */
ACT.postMenu=a=>{const p=postById(a.dataset.v);const mine=p.author==='me';
 sheet(()=>({title:L('Публикация','Post'),body:`<div class="card list">${mine?`${linkRow({act:'editPost',v:p.id,icon:'edit',title:L('Редактировать','Edit'),noChev:1})}${linkRow({act:'delPost',v:p.id,icon:'trash',cls:'danger',title:L('Удалить','Delete'),noChev:1})}`:
 `${linkRow({act:'hidePost',v:p.id,icon:'eyeoff',title:L('Скрыть публикацию','Hide this post'),sub:L('Больше не увидишь её в ленте','You won’t see it in your feed'),noChev:1})}${linkRow({act:'muteAuthor',v:p.author,icon:'belloff',title:L(`Не показывать ${esc(pname(p.author))}`,`Mute ${esc(pname(p.author))}`),sub:L('Автор не узнает об этом','The author won’t be notified'),noChev:1})}${linkRow({act:'sharePost',v:p.id,icon:'link',title:L('Скопировать ссылку','Copy link'),noChev:1})}${linkRow({act:'report',v:'post',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1})}`}</div>`}));};
ACT.hidePost=a=>{S.hiddenPosts=S.hiddenPosts||new Set();S.hiddenPosts.add(a.dataset.v);closeSheet();refresh();toast(L('Публикация скрыта','Post hidden'),{action:{label:L('Вернуть','Undo'),fn:()=>{S.hiddenPosts.delete(a.dataset.v);refresh();}}});};
ACT.muteAuthor=a=>{S.mutedAuthors=S.mutedAuthors||new Set();S.mutedAuthors.add(a.dataset.v);closeSheet();refresh();toast(L(`${pname(a.dataset.v)} скрыт(а) из ленты`,`${pname(a.dataset.v)} muted in your feed`),{action:{label:L('Вернуть','Undo'),fn:()=>{S.mutedAuthors.delete(a.dataset.v);refresh();}}});};
ACT.delPost=a=>{closeSheet(true);ask({icon:'trash',tone:'l',title:L('Удалить публикацию?','Delete this post?'),text:L('Её больше никто не увидит. Комментарии тоже удалятся.','Nobody will see it again. Comments are deleted too.'),ok:L('Удалить','Delete'),danger:true}).then(ok=>{if(!ok)return;run(null,()=>{S.myPosts=S.myPosts.filter(x=>x.id!==a.dataset.v);delete S.postEdits[a.dataset.v];if(cur().id==='F05')back();else refresh();},{ok:L('Публикация удалена','Post deleted')});});};
ACT.editPost=a=>{closeSheet(true);const p=postById(a.dataset.v);go('F07',{id:p.id});};
/* F05 — post with replies */
SC.F05={title:()=>L('Публикация','Post'),valid:p=>!!postById(p.id)&&!isBlocked(postById(p.id).author),render:(p,r)=>{const x=postById(p.id);
 return `${bar(L('Публикация','Post'),{back:1,sm:1,actions:authorPicker()})}<div class="view nodock cta1"><div class="wrap">${postCard(x,{detail:1})}
 <div class="sec" id="replies">${pl(x.comments.length,['ответ','ответа','ответов'],['reply','replies'])}</div>
 ${x.comments.length?replyTree('p',x.id):`<p class="note">${L('Пока никто не ответил. Начни разговор — по-доброму.','No replies yet. Start the conversation — kindly.')}</p>`}
 ${replyComposer(r)}
 </div></div><div class="inputbar"><textarea id="cmt" rows="1" placeholder="${L('Ответить…','Reply…')}" aria-label="${L('Ответ','Reply')}" data-in="grow" data-enter="sendComment">${esc(r.f.cmt||'')}</textarea><button class="ibtn send" data-act="sendComment" aria-label="${L('Отправить','Send')}">${I.send}</button></div>`;},after:p=>scrollToReply(p)};
IN.grow=el=>{el.style.height='auto';const h=el.scrollHeight+2;el.style.height=Math.min(120,h)+'px';el.style.overflowY=h>120?'auto':'hidden';cur().f[el.id]=el.value;const s=el.parentNode.querySelector('.send');if(s)s.disabled=!el.value.trim();};
ACT.focusReply=()=>ACT.dockReply();
function sendPostReply(c,x,route,owner,session){const allowed=()=>S===owner&&S.session===session&&authorAllowed(c.a)&&postById(x.id)===x&&x.comments.includes(c)&&!c.deleted&&!isBlocked(x.author);if(!allowed())return;const repaint=()=>{if(cur()===route)refresh();};c.status='pending';repaint();net().then(()=>{if(!allowed())return;c.status='';notifyReply('p',x.id,c);repaint();}).catch(()=>{if(!allowed())return;c.status='failed';repaint();toast(L('Ответ не отправлен. Текст сохранён — можно повторить','Reply not sent. Your text is kept — you can retry'),{type:'err'});});}
ACT.sendComment=()=>{const route=cur(),el=$('#cmt'),v=el?.value.trim();if(!v){el?.focus();return;}if(v.length>1000){toast(L('Максимум 1000 символов','1000 characters max'),{type:'err'});return;}const x=postById(route.p.id);if(!authorGuard()||!S.session||!x||x.unavailable||isBlocked(x.author))return;identifyReplies('p',x.id);const parent=x.comments.find(c=>c.id===route.replyTarget?.id);if(route.replyTarget&&(!parent||parent.deleted||isBlocked(parent.a)))return;const c={id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,7),a:actionAuthor(),sender:pairMember(),text:{ru:v,en:v},parent:parent?.id||null,t:Date.now(),status:'pending'};x.comments.push(c);route.f.cmt='';delete route.replyTarget;route.scrollTo=c.id;sendPostReply(c,x,route,S,S.session);};
ACT.retryComment=a=>{const x=postById(cur().p.id);if(!x)return;const c=identifyReplies('p',x.id).find(c=>c.id===a.dataset.v)||x.comments[+a.dataset.v];if(!c||c.status!=='failed'||!ownedIdentity(c.a))return;sendPostReply(c,x,cur(),S,S.session);};

/* F04 — topic feed */
SC.F04={title:p=>topic(p.id),valid:p=>!!TOPICS[p.id],render:(p)=>{const posts=filterPosts(allPosts(),{}).filter(x=>x.tags.includes(p.id));const comms=Object.keys(COMMUNITIES).filter(c=>COMMUNITIES[c].topics.includes(p.id));const mine=S.me.jars.find(j=>j.t===p.id);
 return `${bar('#'+esc(topic(p.id)),{back:1,sm:1,actions:searchBtn('posts')})}<div class="view nodock"><div class="wrap">
 <div class="card flat"><p style="margin:0 0 12px;font-size:15px">${esc(T(TOPIC_DESC[p.id])||L('Живые публикации и сообщества по теме.','Live posts and communities on this topic.'))}</p>
 <div class="row g8"><button class="btn md ${mine?'soft':'primary'}" data-act="editJar" data-v="${p.id}">${mine?`${I.check}${L('Есть у меня','In my jars')}`:`${I.plus}${L('Отметить у себя','Add to my map')}`}</button><button class="btn md soft" data-act="topic" data-v="${p.id}">${I.book}${L('О теме','About')}</button></div>
 <p class="note mt8">${L('Отметка приватна. Никто не видит, кто отметил тему у себя.','Your mark is private. Nobody sees who marked a topic.')}</p></div>
 ${comms.length?`<div class="sec">${L('Сообщества','Communities')}</div>${comms.map((c,i)=>commCard(c,{i})).join('')}`:''}
 <div class="sec">${L('Публикации','Posts')}</div>${posts.length?`<div class="posts">${posts.map((x,i)=>postCard(x,{i})).join('')}</div>`:`<p class="note">${L('Публикаций по теме пока нет.','No posts on this topic yet.')}</p>`}</div></div>`;}};

/* F06 — what to create: three things, not six. Photos, video, a poll and a quiz result are attachments of a post. */
ACT.create=()=>sheet(()=>({title:L('Создать','Create'),body:`<div class="create3">${[['post','edit','l',L('Публикация','Post'),L('Текст, до 6 фото или видео, опрос или результат теста','Text, up to 6 photos or videos, a poll or a quiz result')],['event','cal','g',L('Событие','Event'),L('Встреча онлайн или офлайн: дата, место, условия','An online or in-person meetup: date, place, admission')]].map(([t,i,tone,b,s])=>`<button class="c3" data-act="createType" data-v="${t}"><span class="ico ${tone}">${I[i]}</span><span class="tx"><b>${b}</b><small>${s}</small></span>${I.chev}</button>`).join('')}</div>
 <div class="create-q"><button data-act="createType" data-v="post" data-x="media">${I.image}${L('Фото/видео','Photo/video')}</button><button data-act="createType" data-v="post" data-x="poll">${I.poll}${L('Опрос','Poll')}</button><button data-act="createType" data-v="post" data-x="result">${I.test}${L('Результат','Result')}</button></div>`}));
ACT.createType=a=>{const t=a.dataset.v;closeSheet(true);if(t==='event')return go('E11',{});go('F07',{x:a.dataset.x||''});};
ACT.composeX=a=>go('F07',{x:a.dataset.x});

/* F07 — editor; F08 audience; F09 preview */
const AUD=()=>[['all',I.globe,L('Все участники','All members'),L('Видно в ленте и в твоём профиле','Visible in the feed and on your profile')],['followers',I.people,L('Подписчики','Followers'),L('Только те, кто подписан на тебя','Only people who follow you')],['granted',I.key,L('Приватный круг','Private circle'),L('Люди, которым ты открыл(а) расширенный профиль','People you’ve shared your private profile with')]];
const POLL_MAX=10;
/* V8: start minimal — text and three buttons; each block opens only when asked, in its own card */
const resEligible=(actor=actionAuthor())=>(authorProfile(actor)?.jars||[]).filter(j=>!j.limit&&j.vis==='public'&&Number.isInteger(j.lv)&&j.lv>=1&&j.lv<=10);
const postResultSelection=r=>[...new Set(r.resSel||[])].filter(t=>resEligible().some(j=>j.t===t)).slice(0,4);
const postResultReady=d=>!d.result||postResultSelection({resSel:d.result}).length>0;
const missingPostResult=()=>toast(L('Темы результата больше не открыты всем. Вернись в редактор','Result topics are no longer public. Return to the editor'),{type:'warn'});
let composeDraftSeq=0;
function syncComposeAudience(owner,aud){if(!owner||typeof navHistory==='undefined'||!navHistory)return;for(const entry of navHistory.entries){for(const route of Object.values(entry.nav?.stacks||{}).flat()){if(route.id==='F07'&&route.composeId===owner){route.aud=aud;route.dirty=true;}if(route.id==='F09'&&route.p.draft?.composeId===owner)route.p.draft.aud=aud;}}}
const composeAudience=()=>cur().id==='F09'?cur().p.draft.aud:cur().aud;
const ownPost=id=>S.myPosts.find(p=>p.id===id&&ownedIdentity(p.author));
SC.F07={title:()=>L('Публикация','Post'),valid:p=>!p.id||!!ownPost(p.id),render:(p,r)=>{
 const ex=p.id?postById(p.id):null;
 if(!r.init){r.init=1;r.author=ex?.author||authorId();r.composeId='compose'+(++composeDraftSeq);r.pollLocale=S.lang;r.tags=[];r.aud='all';r.media=[];r.poll=null;r.result=false;r.resSel=resEligible().slice(0,4).map(j=>j.t);
  if(ex){r.f.text=T(ex.text);r.f.pollQ=T(ex.pollQ)||'';r.tags=[...ex.tags];r.aud=ex.aud;r.media=(ex.media||[]).slice();r.poll=ex.poll?{opts:ex.poll.map(x=>T(x[0]))}:null;r.result=!!ex.result;if(ex.result)r.resSel=ex.result.map(x=>x[0]);}
  const saved=S.postEdits[p.id]?.draft;if(saved){r.f.text=saved.text;r.f.pollQ=saved.pollQ||'';r.tags=[...saved.tags];r.aud=saved.aud;r.media=saved.media.slice();r.poll=saved.poll?{opts:[...saved.poll]}:null;r.pollLocale=saved.pollLocale||S.lang;r.result=!!saved.result;r.resSel=saved.result?[...saved.result]:[];}
  if(p.x==='poll'||p.type==='poll')r.poll={opts:['','']};if(p.x==='result')r.result=true;if(p.x==='media')setTimeout(()=>{if(cur()===r)ACT.postMedia();},250);}
 r.resSel=postResultSelection(r);
 const a=AUD().find(x=>x[0]===r.aud)||AUD()[0];const m=r.media;const el=resEligible();
 const mediaBlock=m.length?grp(L(`Фото и видео · ${m.length}/${MEDIA_MAX}`,`Photos & video · ${m.length}/${MEDIA_MAX}`),`<div class="edit-ph">${m.map((x,i)=>`<div>${x.type==='video'?`<video src="${esc(x.url)}" muted playsinline preload="metadata"></video><span class="mainph">${ic('video',12)} ${fmtDur(x.dur||0)}</span>`:`<img src="${esc(x.url)}" alt="">`}<button class="rm" data-act="rmMedia" data-v="${i}" aria-label="${L('Убрать','Remove')}">${I.close}</button><button class="vw" data-act="viewDraftMedia" data-v="${i}" aria-label="${L('Посмотреть','View')}"></button></div>`).join('')}${m.length<MEDIA_MAX?`<button data-act="postMedia" aria-label="${L('Добавить фото или видео','Add photo or video')}">${I.plus}</button>`:''}</div>`):'';
 const pollBlock=r.poll?grp(L(`Опрос · ${r.poll.opts.length}/${POLL_MAX}`,`Poll · ${r.poll.opts.length}/${POLL_MAX}`),`${field({name:'pollQ',label:L('Вопрос','Question'),max:200,ph:L('О чём спросить людей?','What do you want to ask?')})}${r.poll.opts.map((o,i)=>`<div class="field pollopt ${r.err&&r.err['o'+i]?'err':''}" data-field="o${i}"><div class="inwrap"><span class="n">${i+1}</span><input class="inp" name="o${i}" data-in="pollOpt" data-i="${i}" value="${esc(o)}" maxlength="80" placeholder="${L('Вариант','Option')} ${i+1}" aria-label="${L('Вариант','Option')} ${i+1}">${r.poll.opts.length>2?`<button class="ibtn ghost sm" data-act="rmOpt" data-v="${i}" aria-label="${L('Убрать вариант','Remove option')}">${I.close}</button>`:''}</div></div>`).join('')}${r.poll.opts.length<POLL_MAX?`<button class="btn text auto" data-act="addOpt">${I.plus}${L('Добавить вариант','Add option')}</button>`:''}${r.err&&r.err.opts?`<div class="ferr">${I.alert}${r.err.opts}</div>`:''}`,{right:`<button data-act="rmPoll">${L('Убрать','Remove')}</button>`,foot:L('Голос можно отменить отдельной ссылкой. После голосования видны участники, выбравшие каждый вариант.','Withdraw your vote using the separate link. After voting, participants can see who chose each option.')+(ex?.poll?' '+L('Изменение вариантов сбросит голоса опроса.','Changing the options resets the poll votes.'):'')}):'';
 const resBlock=r.result?grp(L('Результат','Result'),el.length?`${(sel=>sel.length?`<div class="testcard" style="--n:${Math.min(4,sel.length)}">${jarsHTML(sel)}</div>`:'')(el.filter(j=>r.resSel.includes(j.t)).slice(0,4).map(j=>[j.t,j.lv,j.dir]))}<div class="chips mt12">${el.map(j=>chipBtn(j.t,topic(j.t),r.resSel.includes(j.t),'resPick')).join('')}</div>`:`<p class="note">${L('Пока нечего показать: открой хотя бы одну тему для всех в «Я».','Nothing to show yet: make at least one topic public in Me.')}</p>`,{right:`<button data-act="rmResult">${L('Убрать','Remove')}</button>`,foot:L('Только темы, открытые всем, до 4. Ответы, границы и скрытые темы не попадают.','Only topics open to everyone, up to 4. Answers, limits and hidden topics are never included.')}):'';
 const tools=`<div class="attach">${m.length?'':`<button data-act="postMedia">${I.image}<span>${L('Фото/видео','Photo/video')}</span></button>`}${r.poll?'':`<button data-act="addPoll">${I.poll}<span>${L('Опрос','Poll')}</span></button>`}${r.result?'':`<button data-act="addResult">${I.test}<span>${L('Результат','Result')}</span></button>`}</div>`;
 return `${bar(ex?L('Редактирование','Edit post'):L('Новая публикация','New post'),{back:1,sm:1,actions:`<button class="btn text auto" data-act="saveDraft">${L('В черновик','Save draft')}</button>`})}<div class="view nodock cta1"><div class="wrap">
 ${S.postEdits[p.id]?`<p class="note mb12">${L('Открыты сохранённые правки. Исходная публикация пока не изменена.','Saved changes are open. The original post is unchanged.')}</p>`:''}<section class="grp"><div class="card compose"><div class="row" style="gap:10px">${authorPicker(ex?.status!=='draft'?ex?.author:null)}<button class="pill v" data-act="audience">${a[1]}${a[2]} ${ic('down',13)}</button></div>
 ${rteField({name:'text',label:'',max:1000,ph:r.poll?L('Пара слов к опросу — по желанию','A few words about the poll — optional'):L('О чём хочется рассказать?','What would you like to share?')})}
 ${tools}</div>${r.err&&r.err.media?`<div class="ferr">${I.alert}${r.err.media}</div>`:''}</section>
 ${mediaBlock}${pollBlock}${resBlock}
 ${grp(L('Интересы · до 3','Interests · up to 3'),chipPicker({items:topicItems(),sel:r.tags,act:'postTag',title:L('Интересы публикации','Post interests'),max:3,cats:true}))}
 ${r.aud==='granted'?`<p class="grp-n">${L('Увидят только люди, которым ты открыл(а) расширенный профиль. Когда доступ закончится — публикация пропадёт у них.','Only people you shared your private profile with will see it. When access ends, it disappears for them.')}</p>`:''}
 </div></div><div class="ctabar"><div class="wrap"><div class="row g8"><button class="btn soft" style="flex:0 0 auto;width:auto" data-act="toPreview">${I.eye}${L('Как увидят','Preview')}</button><button class="btn primary" data-act="publishNow">${m.length?L('Отправить на проверку','Submit for review'):L('Опубликовать','Publish')}</button></div></div></div>`;}};
ACT.resPick=a=>{const r=cur();r.resSel=postResultSelection(r);const v=a.dataset.v;if(!resEligible().some(j=>j.t===v))return;const i=r.resSel.indexOf(v);if(i<0&&r.resSel.length>=4){toast(L('Не больше 4 тем','Up to 4 topics'),{type:'warn'});return;}i<0?r.resSel.push(v):r.resSel.splice(i,1);r.dirty=true;refresh();};
ACT.publishNow=a=>{if(!validatePost())return;const r=cur();r.p.draft=draftOf(r);ACT.publish(a);};
ACT.postTag=a=>{const r=cur();const v=a.dataset.v;const i=r.tags.indexOf(v);if(i<0&&r.tags.length>=3){toast(L('Можно выбрать не больше 3 тем','You can pick up to 3 topics'),{type:'warn'});return;}i<0?r.tags.push(v):r.tags.splice(i,1);r.dirty=true;refresh();};
ACT.postMedia=()=>{const r=cur();openUploader({max:MEDIA_MAX,have:r.media.length,accept:'media',aspect:'4:5',aspects:['4:5','1:1','orig'],title:L('Фото и видео','Photos & video'),done:items=>{r.media.push(...items);r.dirty=true;if(r.err)delete r.err.media;refresh();}});};
ACT.viewDraftMedia=a=>openViewer(cur().media.map(m=>({type:m.type,src:m.url})),+a.dataset.v);
ACT.rmMedia=a=>{cur().media.splice(+a.dataset.v,1);cur().dirty=true;refresh();};
ACT.addPoll=()=>{const r=cur();r.poll={opts:['','']};r.dirty=true;refresh();setTimeout(()=>$('[name="o0"]')?.focus(),60);};
ACT.rmPoll=()=>{const r=cur();r.poll=null;r.dirty=true;refresh();};
ACT.addResult=()=>{if(!resEligible().length){toast(L('Сначала открой хотя бы одну тему для всех в «Я»','First make at least one topic public in Me'),{type:'info',action:{label:L('Тесты','Quizzes'),fn:()=>openMe('X01')}});return;}const r=cur();r.result=true;r.dirty=true;refresh();};
ACT.rmResult=()=>{cur().result=false;cur().dirty=true;refresh();};
IN.pollOpt=el=>{const r=cur();r.poll.opts[+el.dataset.i]=el.value;r.dirty=true;if(r.err){delete r.err['o'+el.dataset.i];delete r.err.opts;}$(`[data-field="o${el.dataset.i}"]`)?.classList.remove('err');};
ACT.addOpt=()=>{const r=cur();if(r.poll.opts.length>=POLL_MAX)return;r.poll.opts.push('');refresh();setTimeout(()=>$(`[name="o${r.poll.opts.length-1}"]`)?.focus(),60);};
ACT.rmOpt=a=>{const r=cur();r.poll.opts.splice(+a.dataset.v,1);r.dirty=true;refresh();};
ACT.audience=()=>sheet(()=>({title:L('Кто увидит','Who can see this'),body:`<div class="btns" style="gap:0">${AUD().map(([k,i,t,s])=>`<button class="radio ${composeAudience()===k?'on':''}" data-act="setAud" data-v="${k}" style="margin-top:8px"><i></i><span class="tx"><b>${t}</b><small>${s}</small></span></button>`).join('')}</div><p class="note mt16">${L('Откровенные фото и видео — только для приватного круга.','Explicit photos and video are for the private circle only.')}</p>`}));
ACT.setAud=a=>{const r=cur(),v=a.dataset.v;if(!AUD().some(x=>x[0]===v))return;if(r.id==='F09'){r.p.draft.aud=v;const editor=stack().slice(0,-1).reverse().find(x=>x.id==='F07');if(editor){editor.aud=v;editor.dirty=true;}syncComposeAudience(r.p.draft.composeId,v);}else{r.aud=v;r.dirty=true;syncComposeAudience(r.composeId,v);}closeSheet();refresh();};
function validatePost(){const r=cur();if(!SC.F07.valid(r.p)){toast(L('Эта публикация больше недоступна для редактирования','This post can no longer be edited'),{type:'warn'});return false;}r.err={};const tx=fv('text').trim();
 if(!tx&&!r.media.length&&!r.result&&!r.poll)r.err.text=L('Напиши пару слов или добавь фото','Write a few words or add a photo');
 if(r.result&&!postResultSelection(r).length)r.err.text=L('Выбери открытые темы для результата или убери его','Choose public topics for the result or remove it');
 if(r.poll&&!fv('pollQ').trim())r.err.pollQ=L('Напиши вопрос для опроса','Write the poll question');
 if(r.poll&&fv('pollQ').trim().length>200)r.err.pollQ=L('Максимум 200 символов','200 characters max');
 if(tx.length>1000)r.err.text=L('Максимум 1000 символов','1000 characters max');
 if(r.poll){const f=r.poll.opts.map(o=>o.trim());f.forEach((o,i)=>{if(!o)r.err['o'+i]=' ';});const filled=f.filter(Boolean);if(filled.length<2)r.err.opts=L('Нужно минимум 2 варианта','At least 2 options needed');else if(f.some(o=>!o))r.err.opts=L('Заполни или убери пустые варианты','Fill in or remove empty options');if(new Set(filled.map(x=>x.toLowerCase())).size!==filled.length)r.err.opts=L('Варианты не должны повторяться','Options must be different');}
 if(Object.keys(r.err).length){refresh();shakeFirstErr();return false;}return true;}
const draftOf=r=>({author:ownPost(r.p.id)?.status!=='draft'&&ownPost(r.p.id)?ownPost(r.p.id).author:authorId(),composeId:r.composeId,pollLocale:r.pollLocale,text:fv('text').trim(),tags:[...r.tags],aud:r.aud,media:r.media.slice(),poll:r.poll?r.poll.opts.map(o=>o.trim()).filter(Boolean):null,pollQ:r.poll?fv('pollQ').trim():null,result:r.result&&postResultSelection(r).length?postResultSelection(r):null,edit:r.p.id||null});
const postFromDraft=(d,id,existing=null)=>{
 const samePoll=existing?.poll&&d.poll&&(T(existing.pollQ)||'')===(d.pollQ||'')&&existing.poll.length===d.poll.length&&existing.poll.every((o,i)=>(typeof o[0]==='object'?(o[0][d.pollLocale]??o[0].ru??o[0].en??''):o[0])===d.poll[i]);
 return {id,author:existing?.status!=='draft'&&existing?existing.author:(d.author||'me'),t:Date.now(),type:'post',tags:d.tags,likes:existing?.likes??0,vote:samePoll?(existing.vote??null):null,pollVoters:samePoll?structuredClone(existing.pollVoters||[]):[],aud:d.aud,text:{ru:d.text,en:d.text},comments:existing?.comments||[],media:d.media,poll:d.poll?(samePoll?existing.poll:d.poll.map(o=>[{ru:o,en:o},0])):null,pollQ:d.poll&&d.pollQ?{ru:d.pollQ,en:d.pollQ}:null,result:d.result?resEligible(d.author||actionAuthor()).filter(j=>postResultSelection({resSel:d.result}).includes(j.t)).map(j=>[j.t,j.lv,j.dir]):null};
};
ACT.toPreview=()=>{if(!validatePost())return;go('F09',{draft:draftOf(cur())});};
ACT.saveDraft=a=>{const r=cur();if(!SC.F07.valid(r.p)){toast(L('Эта публикация больше недоступна для редактирования','This post can no longer be edited'),{type:'warn'});return;}if(!fv('text').trim()&&!r.media.length){setErr('text',L('Пустой черновик не сохранить','Can’t save an empty draft'));shakeFirstErr();return;}
 let saved=false,revision=false;run(a,()=>{if(!SC.F07.valid(r.p))return;const id=r.p.id||'m'+Date.now();const ex=ownPost(id),d=draftOf(r);revision=!!ex&&ex.status!=='draft';if(revision){S.postEdits[id]={draft:copyNavValue(d),t:Date.now()};}else{const obj={...postFromDraft(d,id,ex),status:'draft'};ex?Object.assign(ex,obj):S.myPosts.unshift(obj);}saved=true;r.dirty=false;r.p.id=id;refresh();},{ok:()=>!saved?null:revision?L('Правки сохранены. Исходная публикация не изменена','Changes saved. The original post is unchanged'):L('Черновик сохранён в «Я → Мои публикации»','Draft saved in Me → My posts')});};

SC.F09={title:()=>L('Предпросмотр','Preview'),valid:p=>!!p.draft&&(!p.draft.edit||!!ownPost(p.draft.edit)),render:(p)=>{const d=p.draft;const a=AUD().find(x=>x[0]===d.aud);const fake={...postFromDraft(d,'preview')};MEDIA_SRC.preview=()=>d.media;const hasPhoto=d.media.length>0;
 return `${bar(L('Предпросмотр','Preview'),{back:1,sm:1,actions:authorPicker(d.edit?ownPost(d.edit)?.author:null)})}<div class="view nodock cta1"><div class="wrap">
 <p class="note">${L('Так публикацию увидят другие:','This is how others will see it:')}</p><div class="card preview-post" style="padding:0 16px;margin-top:10px">${postCard(fake,{detail:1,preview:1})}</div>
 <div class="card list mt16">${linkRow({act:'audience',icon:'eye',tone:'v',title:a[2],sub:a[3],val:L('Изменить','Change')})}${hasPhoto?linkRow({icon:'shield',tone:'a',title:L('Проверка фото и видео','Photo & video review'),sub:L('Обычно до 30 минут. До этого публикацию видишь только ты','Usually under 30 minutes. Until then only you can see it'),noChev:1}):''}</div>
 </div></div><div class="ctabar"><div class="wrap"><div class="row g8"><button class="btn soft" style="flex:0 0 auto;width:auto" data-back>${L('Изменить','Edit')}</button><button class="btn primary" data-act="publish">${hasPhoto?L('Отправить на проверку','Submit for review'):L('Опубликовать','Publish')}</button></div></div></div>`;}};
ACT.back=()=>back();
function finishPostCompose(route,composeId){
 const trim=st=>{let i=composeId?st.findIndex(r=>r.id==='F07'&&r.composeId===composeId):-1;if(i<0&&composeId)i=st.findIndex(r=>r.id==='F09'&&r.p.draft?.composeId===composeId);if(i<0)i=st.indexOf(route);if(i>=0){st.splice(Math.max(1,i));return true;}return false;};
 trim(stack());
 if(typeof navHistory!=='undefined'&&navHistory){for(const entry of navHistory.entries){let changed=false;for(const st of Object.values(entry.nav?.stacks||{}))changed=trim(st)||changed;if(changed){const st=entry.nav.stacks[entry.nav.tab]||[];entry.key=JSON.stringify([!!S.session,entry.nav.tab,st.map(r=>[r.id,r.p])]);}}navNextReplace=true;}
 render('back');
}
ACT.publish=a=>{const route=cur(),d=route.p.draft;if(!d.edit||ownPost(d.edit)?.status==='draft')d.author=authorId();const ticket=authorTicket(d.author||'me');if(!authorGuard(ticket.id))return;if(d.edit&&!ownPost(d.edit)){toast(L('Исходная публикация удалена. Изменения не отправлены','The original post was deleted. Changes were not sent'),{type:'warn'});return;}if(!postResultReady(d)){missingPostResult();return;}let published=false;const hasPhoto=d.media.length>0;
 run(a,()=>{
  if(!validAuthor(ticket))return;
  if(d.edit&&!ownPost(d.edit)){toast(L('Исходная публикация удалена. Изменения не отправлены','The original post was deleted. Changes were not sent'),{type:'warn'});return;}
  if(!postResultReady(d)){missingPostResult();return;}
  {const id=d.edit||'m'+Date.now();const ex=S.myPosts.find(x=>x.id===id);const obj={...postFromDraft(d,id,ex),status:hasPhoto?'review':'published'};
   ex?Object.assign(ex,obj):S.myPosts.unshift(obj);delete S.postEdits[id];}
  published=true;finishPostCompose(route,d.composeId||route.composeId);if(hasPhoto)autoResolve();
 },{ok:()=>{if(!published)return null;toast(hasPhoto?L('Отправлено на проверку. Сообщим, когда опубликуем','Submitted for review. We’ll let you know when it’s live'):L('Опубликовано','Published'),{type:'ok',action:{label:L('Мои публикации','My posts'),fn:()=>go('F10')}});return null;}});};

/* F10 — my posts and drafts */
SC.F10={title:()=>L('Мои публикации','My posts'),render:()=>{const by=k=>S.myPosts.filter(x=>x.status===k);
 const drafts=by('draft'),review=by('review'),pub=by('published');const edits=Object.entries(S.postEdits).filter(([id])=>!!ownPost(id));
 return `${bar(L('Мои публикации','My posts'),{back:1,sm:1,actions:`<button class="ibtn" data-go="F07" aria-label="${L('Создать','Create')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">
 ${drafts.length?grp(L(`Черновики · ${drafts.length}`,`Drafts · ${drafts.length}`),drafts.map(x=>`<button class="li" data-go="F07" data-p='${esc(JSON.stringify({id:x.id}))}'><span class="ico">${I.edit}</span><span class="tx"><b>${esc(T(x.text)).slice(0,60)||L('Без текста','No text')}</b><small>${L('Изменён','Edited')} ${F.rel(x.t)}</small></span>${I.chev}</button>`).join(''),{list:1}):''}
 ${edits.length?grp(L(`Сохранённые правки · ${edits.length}`,`Saved changes · ${edits.length}`),edits.map(([id,x])=>`<div class="li"><span class="ico">${I.edit}</span><button class="tx" data-go="F07" data-id="${id}" style="text-align:left"><b>${esc(x.draft.text).slice(0,60)||L('Без текста','No text')}</b><small>${L('Только ты видишь правки ·','Only you see the changes ·')} ${F.rel(x.t)}</small></button><button class="ibtn ghost sm" data-act="discardPostEdits" data-v="${id}" aria-label="${L('Удалить сохранённые правки','Discard saved changes')}">${I.trash}</button></div>`).join(''),{list:1}):''}
 ${review.length?`<section class="grp"><div class="grp-t"><span>${L('На проверке','In review')} · ${review.length}</span></div><div class="posts">${review.map((x,i)=>postCard(x,{i})).join('')}</div><p class="grp-n">${L('Пока публикацию видишь только ты.','Only you can see it for now.')}</p></section>`:''}
 ${pub.length?`<section class="grp"><div class="grp-t"><span>${L('Опубликованы','Published')} · ${pub.length}</span></div><div class="posts">${pub.map((x,i)=>postCard(x,{i})).join('')}</div></section>`:''}
 ${!S.myPosts.length?empty('feed',L('Ты ещё ничего не публиковал(а)','You haven’t posted yet'),L('Поделись мыслью, фото или опросом — аудиторию выбираешь сам(а).','Share a thought, photos or a poll — you choose the audience.'),`<button class="btn primary" data-go="F07">${L('Создать публикацию','Create a post')}</button>`):''}
 </div></div>`;}};
ACT.f10tab=a=>setP('t',a.dataset.v);


ACT.discardPostEdits=a=>{const id=a.dataset.v,owner=S,edit=S.postEdits[id];if(!edit)return;ask({icon:'trash',title:L('Удалить сохранённые правки?','Discard saved changes?'),text:L('Исходная публикация и ответы останутся. Удалятся только сохранённые правки.','The original post and replies stay. Only the saved changes are discarded.'),ok:L('Удалить правки','Discard changes'),danger:true}).then(ok=>{if(!ok||S!==owner||S.postEdits[id]!==edit)return;let discarded=false;run(null,()=>{if(S.postEdits[id]!==edit)return;delete S.postEdits[id];discarded=true;refresh();},{ok:()=>discarded?L('Правки удалены. Исходная публикация сохранена','Changes discarded. Original post kept'):null});});};
