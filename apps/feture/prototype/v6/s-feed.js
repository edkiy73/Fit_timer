/* ============ F: FEED (For you / Following / Events), POSTS, CREATE ============ */
const TYPES=()=>[['text',L('Текст','Text')],['photo',L('Фото','Photos')],['poll',L('Опросы','Polls')],['result',L('Результаты','Results')]];
const filtN=f=>(f.tags||[]).length+(f.ex||[]).length+(f.types||[]).length;
function filterPosts(list,f){return list.filter(p=>!(S.hiddenPosts&&S.hiddenPosts.has(p.id))&&!(S.mutedAuthors&&S.mutedAuthors.has(p.author))&&!isBlocked(p.author)
 &&(!(f.tags||[]).length||p.tags.some(t=>f.tags.includes(t)))&&!p.tags.some(t=>(f.ex||[]).includes(t))&&(!(f.types||[]).length||f.types.includes(p.type)));}

SC.F01={root:1,tab:'feed',title:()=>L('Лента','Feed'),render:(p)=>{
 const sub=p.sub||'foryou';
 const head=`${bar(L('Лента','Feed'),{actions:`${searchBtn(sub==='events'?'events':'posts')}${bellBtn()}`})}`;
 const tabs=seg([['foryou',L('Для тебя','For you')],['following',L('Подписки','Following')],['events',L('События','Events'),myEventIds('going').length+myEventIds('apps').length||'']],sub,'feedSub');
 if(sub==='events')return head+`<div class="view"><div class="wrap">${tabs}${eventsList()}</div></div>`;
 const fkey=sub==='following'?'following':'feed';const f=S.filters[fkey];const n=filtN(f);
 const src=sub==='following'?allPosts().filter(x=>S.follows.has(x.author)||x.author==='me'):allPosts();
 const list=filterPosts(src,f).sort((a,b)=>b.t-a.t);
 const chipsActive=[...(f.tags||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="tags" data-v="${t}">#${esc(topic(t))} ${ic('close',14)}</button>`),...(f.ex||[]).map(t=>`<button class="chip ex" data-act="rmFilter" data-k="ex" data-v="${t}">${esc(topic(t))} ${ic('close',14)}</button>`),...(f.types||[]).map(t=>`<button class="chip filter on" data-act="rmFilter" data-k="types" data-v="${t}">${TYPES().find(x=>x[0]===t)[1]} ${ic('close',14)}</button>`)].join('');
 const quick=!n?Object.keys(TOPICS).slice(0,7).filter(t=>allPosts().some(p=>p.tags.includes(t))).map(t=>`<button class="chip filter" data-act="quickTag" data-v="${t}">#${esc(topic(t))}</button>`).join(''):chipsActive;
 let body;
 if(sub==='following'&&!S.follows.size)body=empty('people',L('Ты пока ни на кого не подписан(а)','You’re not following anyone yet'),L('Подпишись на авторов и сообщества — их публикации появятся здесь. Подписка не открывает личный чат.','Follow authors and communities — their posts appear here. Following doesn’t open a private chat.'),`<button class="btn primary" data-go="G01" data-p='{"scope":"people"}'>${L('Найти людей','Find people')}</button><button class="btn soft" data-tab="groups">${L('Сообщества','Communities')}</button>`);
 else if(!list.length)body=empty('filter',L('Ничего не нашлось','Nothing found'),L('С такими фильтрами публикаций нет. Сними один из фильтров.','No posts match these filters. Remove one of them.'),`<button class="btn soft" data-act="clearFeedFilters">${L('Сбросить фильтры','Reset filters')}</button>`);
 else body=`<div class="posts">${firstLoad('feed-'+sub,list.map((x,i)=>postCard(x,{i})).join(''))}</div>`;
 return head+`<div class="view"><div class="wrap">${tabs}
 <button class="composer" data-act="create">${av('me','sm')}<span>${L('Что у тебя нового?','What’s on your mind?')}</span><span class="ibtn">${I.plus}</span></button>
 <div class="filterline"><div class="chips scroll">${quick}</div><button class="chip filter ${n?'on':''}" data-act="feedFilters" data-v="${fkey}" aria-label="${L('Фильтры','Filters')}">${ic('filter',16)}${n?`<em>${n}</em>`:L('Фильтры','Filters')}</button></div>
 ${body}</div></div>`;}};
ACT.feedSub=a=>setSub(a.dataset.v);
ACT.quickTag=a=>{const f=S.filters.feed;f.tags=[a.dataset.v];refresh();toast(L(`Показываем #${topic(a.dataset.v)}`,`Showing #${topic(a.dataset.v)}`),{action:{label:L('Сбросить','Reset'),fn:()=>{f.tags=[];refresh();}}});};
ACT.rmFilter=a=>{const fk=cur().p.sub==='following'?'following':'feed';const f=S.filters[fk];f[a.dataset.k]=(f[a.dataset.k]||[]).filter(x=>x!==a.dataset.v);refresh();};
ACT.clearFeedFilters=()=>{const fk=cur().p.sub==='following'?'following':'feed';S.filters[fk]={};refresh();};

/* F02 — feed filters: include / exclude topics, post types; applies to the current tab only */
ACT.feedFilters=a=>{const fk=a.dataset.v;const draft=JSON.parse(JSON.stringify(S.filters[fk]));draft.tags=draft.tags||[];draft.ex=draft.ex||[];draft.types=draft.types||[];S.ui.ff={fk,d:draft};
 sheet(()=>{const d=S.ui.ff.d;const cnt=filterPosts(fk==='following'?allPosts().filter(x=>S.follows.has(x.author)||x.author==='me'):allPosts(),d).length;
 return{title:L('Фильтры ленты','Feed filters'),head:`<button class="btn text auto" data-act="ffReset">${L('Сбросить','Reset')}</button>`,body:`<p class="note" style="margin-bottom:6px">${fk==='following'?L('Только для вкладки «Подписки».','Only for the Following tab.'):L('Только для вкладки «Для тебя».','Only for the For you tab.')}</p>
 <div class="sec">${L('Показывать темы','Show topics')}</div>${chipGroup(topicItems(),d.tags,'ffTag',{ex:d.ex})}
 <div class="sec">${L('Скрыть темы','Hide topics')}<span class="note" style="font-weight:500">${L('не будут попадаться','won’t appear')}</span></div>${chipGroup(topicItems(),d.ex,'ffEx')}
 <div class="sec">${L('Тип публикаций','Post type')}</div>${chipGroup(TYPES(),d.types,'ffType')}`,
 foot:`<button class="btn primary ${cnt?'':'off'}" data-act="ffApply">${cnt?L(`Показать ${pl(cnt,['публикацию','публикации','публикаций'],[])}`,`Show ${pl(cnt,[],['post','posts'])}`):L('Нет подходящих публикаций','No matching posts')}</button>`};});};
const ffToggle=(k)=>a=>{const d=S.ui.ff.d;const v=a.dataset.v;const arr=d[k];const i=arr.indexOf(v);i<0?arr.push(v):arr.splice(i,1);if(k==='tags')d.ex=d.ex.filter(x=>x!==v);if(k==='ex')d.tags=d.tags.filter(x=>x!==v);resheet();};
ACT.ffTag=ffToggle('tags');ACT.ffEx=ffToggle('ex');ACT.ffType=ffToggle('types');
ACT.ffReset=()=>{S.ui.ff.d={tags:[],ex:[],types:[]};resheet();};
ACT.ffApply=()=>{S.filters[S.ui.ff.fk]=S.ui.ff.d;closeSheet();refresh();};

/* post actions — a post like is a reaction, never a personal like */
ACT.likePost=a=>{const p=postById(a.dataset.v);p.liked=!p.liked;a.classList.toggle('on',p.liked);a.setAttribute('aria-pressed',p.liked);a.innerHTML=`${p.liked?I.heartf:I.heart}<span>${p.likes+(p.liked?1:0)}</span>`;};
ACT.savePost=a=>{const p=postById(a.dataset.v);p.saved=!p.saved;const s=S.me.saved.posts;p.saved?s.push(p.id):s.splice(s.indexOf(p.id),1);a.classList.toggle('saved',p.saved);a.innerHTML=p.saved?I.bookmarkf:I.bookmark;toast(p.saved?L('Сохранено — найдёшь в «Я → Сохранённое»','Saved — find it in Me → Saved'):L('Убрано из сохранённого','Removed from saved'),{type:p.saved?'ok':'',action:p.saved?{label:L('Открыть','Open'),fn:()=>go('G04')}:null});};
ACT.sharePost=()=>{toast(L('Ссылка скопирована. Откроется только у тех, кому видна публикация','Link copied. It opens only for people who can see the post'),{type:'ok'});};
ACT.vote=a=>{const p=postById(a.dataset.v);if(p.vote!=null)return;run(null,()=>{p.vote=+a.dataset.i;refresh();},{ms:250});};
ACT.postMenu=a=>{const p=postById(a.dataset.v);const mine=p.author==='me';
 sheet(()=>({title:L('Публикация','Post'),body:`<div class="card list">${mine?`${linkRow({act:'editPost',v:p.id,icon:'edit',title:L('Редактировать','Edit'),noChev:1})}${linkRow({act:'delPost',v:p.id,icon:'trash',cls:'danger',title:L('Удалить','Delete'),noChev:1})}`:
 `${linkRow({act:'hidePost',v:p.id,icon:'eyeoff',title:L('Скрыть публикацию','Hide this post'),sub:L('Больше не увидишь её в ленте','You won’t see it in your feed'),noChev:1})}${linkRow({act:'muteAuthor',v:p.author,icon:'belloff',title:L(`Не показывать ${pname(p.author)}`,`Mute ${pname(p.author)}`),sub:L('Автор не узнает об этом','The author won’t be notified'),noChev:1})}${linkRow({act:'sharePost',v:p.id,icon:'link',title:L('Скопировать ссылку','Copy link'),noChev:1})}${linkRow({act:'report',v:'post',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1})}`}</div>`}));};
ACT.hidePost=a=>{S.hiddenPosts=S.hiddenPosts||new Set();S.hiddenPosts.add(a.dataset.v);closeSheet();refresh();toast(L('Публикация скрыта','Post hidden'),{action:{label:L('Вернуть','Undo'),fn:()=>{S.hiddenPosts.delete(a.dataset.v);refresh();}}});};
ACT.muteAuthor=a=>{S.mutedAuthors=S.mutedAuthors||new Set();S.mutedAuthors.add(a.dataset.v);closeSheet();refresh();toast(L(`${pname(a.dataset.v)} скрыт(а) из ленты`,`${pname(a.dataset.v)} muted in your feed`),{action:{label:L('Вернуть','Undo'),fn:()=>{S.mutedAuthors.delete(a.dataset.v);refresh();}}});};
ACT.delPost=a=>{closeSheet(true);ask({icon:'trash',tone:'l',title:L('Удалить публикацию?','Delete this post?'),text:L('Её больше никто не увидит. Комментарии тоже удалятся.','Nobody will see it again. Comments are deleted too.'),ok:L('Удалить','Delete'),danger:true}).then(ok=>{if(!ok)return;run(null,()=>{S.myPosts=S.myPosts.filter(x=>x.id!==a.dataset.v);if(cur().id==='F05')back();else refresh();},{ok:L('Публикация удалена','Post deleted')});});};
ACT.editPost=a=>{closeSheet(true);const p=postById(a.dataset.v);go('F07',{id:p.id,type:p.type});};

/* F05 — post with replies */
SC.F05={title:()=>L('Публикация','Post'),valid:p=>!!postById(p.id)&&!isBlocked(postById(p.id).author),render:(p,r)=>{const x=postById(p.id);
 return `${bar(L('Публикация','Post'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap">${postCard(x,{detail:1})}
 <div class="sec" id="replies">${pl(x.comments.length,['ответ','ответа','ответов'],['reply','replies'])}</div>
 ${x.comments.length?x.comments.map((c,i)=>`<div class="comment ${c.status||''}">${av(c.a,'xs')}<div class="tx"><b>${esc(pname(c.a))}</b><time>${c.status==='pending'?L('отправляется…','sending…'):c.status==='failed'?L('не отправлено','not sent'):F.rel(c.t)}</time><p>${esc(T(c.text))}</p>${c.status==='failed'?`<button class="btn text auto" style="min-height:32px;padding:0;color:var(--danger)" data-act="retryComment" data-v="${i}">${L('Повторить','Retry')}</button>`:''}</div></div>`).join(''):`<p class="note">${L('Пока никто не ответил. Начни разговор — по-доброму.','No replies yet. Start the conversation — kindly.')}</p>`}
 </div></div><div class="inputbar"><textarea id="cmt" rows="1" placeholder="${L('Ответить…','Reply…')}" aria-label="${L('Ответ','Reply')}" data-in="grow" data-enter="sendComment">${esc(r.f.cmt||'')}</textarea><button class="ibtn send" data-act="sendComment" aria-label="${L('Отправить','Send')}">${I.send}</button></div>`;}};
IN.grow=el=>{el.style.height='auto';el.style.height=Math.min(120,el.scrollHeight)+'px';cur().f[el.id]=el.value;const s=el.parentNode.querySelector('.send');if(s)s.disabled=!el.value.trim();};
ACT.focusReply=()=>{$('#cmt')?.focus();};
ACT.sendComment=()=>{const el=$('#cmt');const v=el.value.trim();if(!v){el.focus();toast(L('Напиши что-нибудь','Write something first'),{type:'warn'});return;}
 if(v.length>1000){toast(L('Слишком длинно: максимум 1000 символов','Too long: 1000 characters max'),{type:'err'});return;}
 const x=postById(cur().p.id);const c={a:'me',text:{ru:v,en:v},t:Date.now(),status:'pending'};x.comments.push(c);cur().f.cmt='';refresh();
 const v2=$('#main .view');v2.scrollTop=v2.scrollHeight;
 net().then(()=>{c.status='';refresh();}).catch(()=>{c.status='failed';refresh();toast(L('Ответ не отправлен. Текст сохранён — можно повторить','Reply not sent. Your text is kept — you can retry'),{type:'err'});});};
ACT.retryComment=a=>{const x=postById(cur().p.id);const c=x.comments[+a.dataset.v];c.status='pending';refresh();net().then(()=>{c.status='';refresh();}).catch(()=>{c.status='failed';refresh();toast(NETFAIL(),{type:'err'});});};

/* F04 — topic feed */
SC.F04={title:p=>topic(p.id),valid:p=>!!TOPICS[p.id],render:(p)=>{const posts=filterPosts(allPosts(),{}).filter(x=>x.tags.includes(p.id));const comms=Object.keys(COMMUNITIES).filter(c=>COMMUNITIES[c].topics.includes(p.id));const mine=S.me.jars.find(j=>j.t===p.id);
 return `${bar('#'+esc(topic(p.id)),{back:1,sm:1,actions:searchBtn('posts')})}<div class="view nodock"><div class="wrap">
 <div class="card flat"><p style="margin:0 0 12px;font-size:15px">${esc(T(TOPIC_DESC[p.id])||L('Тема из каталога «Изучить». Здесь — живые публикации и сообщества по ней.','A topic from Explore. Here you’ll find live posts and communities about it.'))}</p>
 <div class="row g8"><button class="btn md ${mine?'soft':'primary'}" data-act="editJar" data-v="${p.id}">${mine?`${I.check}${L('В моей карте','In my map')}`:`${I.plus}${L('Отметить у себя','Add to my map')}`}</button><button class="btn md soft" data-go="X06" data-id="${p.id}">${I.book}${L('О теме','Guide')}</button></div>
 <p class="note mt8">${L('Отметка приватна. Никто не видит, кто отметил тему у себя.','Your mark is private. Nobody sees who marked a topic.')}</p></div>
 ${comms.length?`<div class="sec">${L('Сообщества','Communities')}</div>${comms.map((c,i)=>commCard(c,{i})).join('')}`:''}
 <div class="sec">${L('Публикации','Posts')}</div>${posts.length?`<div class="posts">${posts.map((x,i)=>postCard(x,{i})).join('')}</div>`:`<p class="note">${L('Публикаций по теме пока нет.','No posts on this topic yet.')}</p>`}</div></div>`;}};

/* F06 — what to create */
ACT.create=()=>sheet(()=>({title:L('Создать','Create'),body:`<div class="card list">${[['text','edit','l',L('Публикация','Post'),L('Текст, можно с темами','Text with topics')],['photo','image','v',L('Фото','Photos'),L('Проходят проверку перед публикацией','Reviewed before publishing')],['poll','poll','a',L('Опрос','Poll'),L('2–4 варианта ответа','2–4 options')],['result','test','s',L('Результат теста','Quiz result'),L('Только выбранные темы, без ответов','Only chosen topics, no answers')],['event','cal','g',L('Событие','Event'),L('Дата, место, условия участия','Date, place, admission')],['journal','book','',L('Запись в дневник','Journal entry'),L('Видишь только ты','Only you can see it')]].map(([t,i,tone,b,s])=>linkRow({act:'createType',v:t,icon:i,tone,title:b,sub:s})).join('')}</div>`}));
ACT.createType=a=>{const t=a.dataset.v;closeSheet(true);if(t==='event')return go('E11',{});if(t==='journal')return go('X14',{});if(t==='result'&&!S.me.tests.roles?.done){toast(L('Сначала пройди хотя бы один тест','Take at least one quiz first'),{type:'info',action:{label:L('Тесты','Quizzes'),fn:()=>go('X01',{sub:'explore'})}});return;}go('F07',{type:t});};

/* F07 — editor; F08 audience; F09 preview */
const AUD=()=>[['all',I.globe,L('Все участники','All members'),L('Видно в ленте и в твоём профиле','Visible in the feed and on your profile')],['followers',I.people,L('Подписчики','Followers'),L('Только те, кто подписан на тебя','Only people who follow you')],['granted',I.lock,L('Расширенный круг','Private circle'),L('Люди с действующим доступом к твоему расширенному профилю','People with active access to your private profile')],['only',I.eyeoff,L('Только я','Only me'),L('Сохранится как запись в дневнике','Saved as a journal entry')]];
SC.F07={title:()=>L('Редактор','Editor'),render:(p,r)=>{
 const ex=p.id?postById(p.id):null;if(ex&&!r.init){r.init=1;r.f.text=T(ex.text);r.tags=[...ex.tags];r.aud=ex.aud;}
 r.tags=r.tags||[];r.aud=r.aud||'all';r.media=r.media||[];r.opts=r.opts||['',''];
 const type=p.type||'text';const a=AUD().find(x=>x[0]===r.aud);
 const typeBlock=type==='photo'?`<div class="sec">${L('Фото','Photos')}<span class="note" style="font-weight:500">${r.media.length}/6</span></div><div class="edit-ph">${r.media.map((m,i)=>`<div><span style="position:absolute;inset:0">${plate(m)}</span><button class="rm" data-act="rmMedia" data-v="${i}" aria-label="${L('Убрать','Remove')}">${I.close}</button></div>`).join('')}${r.media.length<6?`<button data-act="addMedia" aria-label="${L('Добавить фото','Add photo')}">${I.plus}</button>`:''}</div>${r.err&&r.err.media?`<div class="ferr">${I.alert}${r.err.media}</div>`:''}<p class="note mt8">${L('Фото проверяются перед публикацией. Лица других людей — только с их согласия.','Photos are reviewed before publishing. Other people’s faces only with their consent.')}</p>`
 :type==='poll'?`<div class="sec">${L('Варианты ответа','Options')}</div>${r.opts.map((o,i)=>`<label class="field ${r.err&&r.err['o'+i]?'err':''}" data-field="o${i}" style="margin-bottom:8px"><div class="inwrap"><span style="position:absolute;left:16px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--faint)">${i+1}</span><input class="inp" name="o${i}" data-in="pollOpt" data-i="${i}" value="${esc(o)}" maxlength="60" placeholder="${L('Вариант','Option')} ${i+1}"></div></label>`).join('')}${r.opts.length<4?`<button class="btn text auto" data-act="addOpt">${I.plus}${L('Добавить вариант','Add option')}</button>`:''}${r.err&&r.err.opts?`<div class="ferr">${I.alert}${r.err.opts}</div>`:''}`
 :type==='result'?`<div class="sec">${L('Что показать из результата','What to show from the result')}</div><div class="card flat">${jarsHTML(S.me.jars.filter(j=>!j.limit).slice(0,4).map(j=>[j.t,j.lv]))}<p class="note mt12">${L('Сырые ответы и скрытые темы не попадут в публикацию.','Raw answers and hidden topics are never included.')}</p></div>`:'';
 return `${bar(ex?L('Редактирование','Edit post'):({text:L('Новая публикация','New post'),photo:L('Фото','Photos'),poll:L('Опрос','Poll'),result:L('Результат теста','Quiz result')}[type]),{back:1,sm:1})}<div class="view nodock cta2"><div class="wrap">
 <div class="row" style="margin-bottom:12px">${av('me','sm')}<div class="grow"><b style="font-size:15px">${esc(pname('me'))}</b><button class="pill v" style="display:flex;margin-top:4px" data-act="audience">${a[1]}${a[2]} ${ic('down',13)}</button></div></div>
 ${field({name:'text',label:type==='poll'?L('Вопрос','Question'):L('Текст','Text'),textarea:1,max:1000,ph:type==='poll'?L('О чём спросить людей?','What do you want to ask?'):L('О чём хочется рассказать?','What would you like to share?'),attrs:'rows="5"'})}
 ${typeBlock}
 <div class="sec">${L('Темы','Topics')}<span class="note" style="font-weight:500">${L('до 3','up to 3')}</span></div>${chipGroup(topicItems(),r.tags,'postTag')}
 ${r.aud==='granted'?`<div class="alert info mt16">${I.lock}<span>${L('Увидят только люди с действующим доступом. Если доступ отзовут или он истечёт — публикация пропадёт у них.','Only people with active access will see it. If access is revoked or expires, it disappears for them.')}</span></div>`:''}
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="toPreview">${L('Предпросмотр','Preview')}</button><button class="btn soft" data-act="saveDraft">${L('Сохранить черновик','Save draft')}</button></div></div>`;}};
ACT.postTag=a=>{const r=cur();const v=a.dataset.v;const i=r.tags.indexOf(v);if(i<0&&r.tags.length>=3){toast(L('Можно выбрать не больше 3 тем','You can pick up to 3 topics'),{type:'warn'});return;}i<0?r.tags.push(v):r.tags.splice(i,1);r.dirty=true;refresh();};
ACT.addMedia=()=>{const r=cur();r.media.push(['rose','sea','amber','lilac','plum','moss'][r.media.length%6]);r.dirty=true;if(r.err)delete r.err.media;refresh();};
ACT.rmMedia=a=>{cur().media.splice(+a.dataset.v,1);refresh();};
IN.pollOpt=el=>{const r=cur();r.opts[+el.dataset.i]=el.value;r.dirty=true;if(r.err){delete r.err['o'+el.dataset.i];delete r.err.opts;}$(`[data-field="o${el.dataset.i}"]`)?.classList.remove('err');};
ACT.addOpt=()=>{cur().opts.push('');refresh();};
ACT.audience=()=>sheet(()=>({title:L('Кто увидит','Who can see this'),body:`<div class="btns" style="gap:0">${AUD().map(([k,i,t,s])=>`<button class="radio ${cur().aud===k?'on':''}" data-act="setAud" data-v="${k}" style="margin-top:8px"><i></i><span class="tx"><b>${t}</b><small>${s}</small></span></button>`).join('')}</div><p class="note mt16">${L('Откровенные материалы видны только расширенному кругу и только после проверки возраста.','Explicit content is visible only to the private circle and only after an age check.')}</p>`}));
ACT.setAud=a=>{cur().aud=a.dataset.v;cur().dirty=true;closeSheet();refresh();if(a.dataset.v==='only')toast(L('Запись сохранится в дневник, а не в ленту','This will be saved to your journal, not the feed'),{type:'info'});};
function validatePost(){const r=cur();const type=r.p.type||'text';r.err={};const tx=fv('text').trim();
 if(!tx)r.err.text=type==='poll'?L('Напиши вопрос','Write your question'):L('Напиши хотя бы пару слов','Write at least a few words');
 else if(tx.length>1000)r.err.text=L('Максимум 1000 символов','1000 characters max');
 if(type==='photo'&&!r.media.length)r.err.media=L('Добавь хотя бы одно фото','Add at least one photo');
 if(type==='poll'){const f=r.opts.map(o=>o.trim()).filter(Boolean);if(f.length<2)r.err.opts=L('Нужно минимум 2 варианта','At least 2 options needed');if(new Set(f).size!==f.length)r.err.opts=L('Варианты не должны повторяться','Options must be different');}
 if(Object.keys(r.err).length){refresh();shakeFirstErr();return false;}return true;}
ACT.toPreview=()=>{if(!validatePost())return;const r=cur();go('F09',{draft:{type:r.p.type||'text',text:fv('text').trim(),tags:r.tags,aud:r.aud,media:r.media,opts:r.opts.filter(o=>o.trim()),edit:r.p.id||null}});};
ACT.saveDraft=a=>{const r=cur();if(!fv('text').trim()){setErr('text',L('Пустой черновик не сохранить','Can’t save an empty draft'));shakeFirstErr();return;}
 run(a,()=>{const id=r.p.id||'m'+Date.now();const ex=S.myPosts.find(x=>x.id===id);const obj={id,author:'me',t:Date.now(),type:r.p.type||'text',tags:r.tags,likes:0,aud:r.aud,status:'draft',text:{ru:fv('text'),en:fv('text')},comments:[]};ex?Object.assign(ex,obj):S.myPosts.unshift(obj);r.dirty=false;r.p.id=id;},{ok:L('Черновик сохранён в «Я → Мои публикации»','Draft saved in Me → My posts')});};
SC.F09={title:()=>L('Предпросмотр','Preview'),valid:p=>!!p.draft,render:(p)=>{const d=p.draft;const a=AUD().find(x=>x[0]===d.aud);
 const fake={id:'preview',author:'me',t:Date.now(),type:d.type,tags:d.tags,likes:0,aud:d.aud,text:{ru:d.text,en:d.text},comments:[],plate:(d.media[0]||'rose'),poll:d.type==='poll'?d.opts.map(o=>[{ru:o,en:o},0]):null,result:d.type==='result'?S.me.jars.filter(j=>!j.limit).slice(0,2).map(j=>[j.t,j.lv]):null};
 return `${bar(L('Предпросмотр','Preview'),{back:1,sm:1})}<div class="view nodock cta1"><div class="wrap">
 <p class="note">${L('Так публикацию увидят другие:','This is how others will see it:')}</p><div class="card" style="padding:0 16px;margin-top:10px;pointer-events:none">${postCard(fake,{detail:1})}</div>
 <div class="card list mt16">${linkRow({act:'back',icon:'eye',tone:'v',title:a[2],sub:a[3],noChev:1})}${d.type==='photo'?linkRow({icon:'shield',tone:'a',title:L('Проверка фото','Photo review'),sub:L('Обычно до 30 минут. До этого публикацию видишь только ты','Usually under 30 minutes. Until then only you can see it'),noChev:1}):''}</div>
 </div></div><div class="ctabar"><div class="wrap"><button class="btn primary" data-act="publish">${d.aud==='only'?L('Сохранить в дневник','Save to journal'):d.type==='photo'?L('Отправить на проверку','Submit for review'):L('Опубликовать','Publish')}</button></div></div>`;}};
ACT.back=()=>back();
ACT.publish=a=>{const d=cur().p.draft;
 run(a,()=>{
  if(d.aud==='only'){S.me.journal.unshift({id:'j'+Date.now(),t:Date.now(),topics:d.tags,text:{ru:d.text,en:d.text}});}
  else{const id=d.edit||'m'+Date.now();const obj={id,author:'me',t:Date.now(),type:d.type,tags:d.tags,likes:0,aud:d.aud,status:d.type==='photo'?'review':'published',text:{ru:d.text,en:d.text},comments:[],plate:d.media[0],poll:d.type==='poll'?d.opts.map(o=>[{ru:o,en:o},0]):null,result:d.type==='result'?S.me.jars.filter(j=>!j.limit).slice(0,2).map(j=>[j.t,j.lv]):null};
   const ex=S.myPosts.find(x=>x.id===id);ex?Object.assign(ex,obj,{comments:ex.comments}):S.myPosts.unshift(obj);}
  const st=stack();st.length=1;S.nav.stacks.feed[0].p.sub='foryou';if(S.nav.tab!=='feed')S.nav.tab='feed';render('back');
 },{ok:()=>d.aud==='only'?L('Сохранено в дневник','Saved to your journal'):d.type==='photo'?L('Отправлено на проверку. Сообщим, когда опубликуем','Submitted for review. We’ll let you know when it’s live'):L('Опубликовано','Published')});};

/* F10 — my posts and drafts */
SC.F10={title:()=>L('Мои публикации','My posts'),render:(p)=>{const t=p.t||'published';const list=S.myPosts.filter(x=>x.status===t);
 const cnt=k=>S.myPosts.filter(x=>x.status===k).length;
 return `${bar(L('Мои публикации','My posts'),{back:1,sm:1,actions:`<button class="ibtn" data-act="create" aria-label="${L('Создать','Create')}">${I.plus}</button>`})}<div class="view nodock"><div class="wrap">
 ${tabsRow([['published',L('Опубликованы','Published'),cnt('published')],['review',L('На проверке','In review'),cnt('review')],['draft',L('Черновики','Drafts'),cnt('draft')]],t,'f10tab')}
 ${list.length?(t==='draft'?list.map(x=>`<button class="jentry" data-go="F07" data-p='${JSON.stringify({id:x.id,type:x.type})}'><time>${L('Изменён','Edited')} ${F.rel(x.t)}</time><p>${esc(T(x.text))}</p></button>`).join(''):`<div class="posts">${list.map((x,i)=>(t==='review'?`<div class="alert warn" style="margin-top:12px">${I.clock}<span>${L('Фото на проверке. Пока публикацию видишь только ты.','Photos in review. Only you can see this post for now.')}</span></div>`:'')+postCard(x,{i})).join('')}</div>`)
 :empty(t==='draft'?'edit':'feed',t==='draft'?L('Черновиков нет','No drafts'):t==='review'?L('Ничего не ждёт проверки','Nothing in review'):L('Ты ещё ничего не публиковал(а)','You haven’t posted yet'),t==='published'?L('Поделись мыслью, вопросом или результатом теста — аудиторию выбираешь сам(а).','Share a thought, a question or a quiz result — you choose the audience.'):'',t==='published'?`<button class="btn primary" data-act="create">${L('Создать публикацию','Create a post')}</button>`:'')}
 </div></div>`;}};
ACT.f10tab=a=>setP('t',a.dataset.v);
