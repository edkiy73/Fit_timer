/* ============ SHARED COMPONENTS ============ */
/** jars: list of {t,lv,limit,vis} or [t,lv]. V9: one vessel, one colour; the fill is the level 1–10.
 *  «обсуждаемо» — dashed outline, «табу» — crossed out. o.more adds a «+N» tile, o.was shows the previous answer. */
/** liquid colour follows the value on one scale of the accent: a dark accent for 10 → the regular accent for 1 (no other hues). The number is always printed. */
function jarColor(v){v=Math.max(1,Math.min(10,+v||1));return `color-mix(in srgb,var(--accent) ${Math.round(35+(v-1)/9*65)}%,var(--accent-deep))`;}
const jarInk=v=>(+v||1)>=6?'#fff':'#1A1414';
function jarsHTML(list,o={}){
 const items=list.map(normJar);
 return `<div class="jars ${o.pre?'pre':''} ${o.cls||''}">${items.map((j,i)=>{
  const tag=o.act?'button':'div';const attrs=o.act?`data-act="${o.act}" data-v="${j.t}" ${o.who?`data-who="${o.who}" data-ans="${j.limit||j.lv}"${j.dir?` data-dir="${j.dir.join(' ')}"`:''}`:''} aria-label="${esc(topic(j.t))}: ${esc(jarWord(j))}"`:'';
  const was=o.was&&o.was[j.t]!=null?`<small class="was">${L('было','was')} ${o.was[j.t]==='hard'?L('табу','taboo'):o.was[j.t]==='discuss'?L('обсужд.','negot.'):o.was[j.t]}</small>`:'';
  const vis=o.vis&&j.vis!=='public'?`<span class="jvis">${j.vis==='granted'?I.key:I.eyeoff}</span>`:'';
  if(j.limit)return `<${tag} class="jar ${j.limit==='hard'?'taboo':'discuss'}" ${attrs}><span class="vessel"><span class="jm">${j.limit==='hard'?I.block:I.chat}</span>${vis}</span><span class="jn">${esc(topic(j.t))}</span><span class="jw sr">${j.limit==='hard'?(o.who&&o.who!=='me'?L('нельзя','not for me'):L('табу','taboo')):L('обсуждаемо','negotiable')}</span>${was}</${tag}>`;
  /* the higher the level, the calmer the surface: 8–9 barely ripple, 10 is full to the lid — only bubbles */
  const calm=j.lv>=10?'full':j.lv>=8?'calm':'';
  return `<${tag} class="jar ${calm}" ${attrs} style="--v:${j.lv};--jc:${jarColor(j.lv)};--jt:${jarInk(j.lv)};--d:${(i%6)*.35}s"><span class="vessel"><span class="fill"><i class="bub"></i>${j.lv>=8?'<i class="bub b2"></i>':''}</span><b class="lv">${j.lv}</b>${vis}</span><span class="jn">${esc(topic(j.t))}</span>${was}</${tag}>`;}).join('')}${o.more?`<button class="jar more" data-act="${o.more.act}" data-v="${o.more.v}"><span class="vessel"><b>+${o.more.n}</b></span><span class="jn">${L('ещё','more')}</span></button>`:''}${o.add?`<button class="jar add" data-act="${o.add}"><span class="vessel">${I.plus}</span><span class="jn">${L('Добавить','Add')}</span></button>`:''}</div>`;
}
/** one answer row: level badge + name (one line, cut with «…») + the answer under it. Long nicknames and long words never squeeze each other. */
function ansRow(name,j,note=''){const n=j?normJar(j):null;const badge=!n?'<span class="ar-lv none">—</span>':n.limit?`<span class="ar-lv ${n.limit==='hard'?'taboo':'discuss'}">${n.limit==='hard'?I.block:I.chat}</span>`:`<span class="ar-lv" style="--jc:${jarColor(n.lv)};--jt:${jarInk(n.lv)}">${n.lv}</span>`;
 return `<div class="li static ansrow">${badge}<span class="tx"><b>${esc(name)}</b><small>${n?esc(jarDesc(n)):L('не отмечено','not set')}${note?` · ${note}`:''}</small></span></div>`;}
const pubJars=id=>id==='me'||id==='couple'?(id==='couple'?(S.ui.couplePreview||(S.pair?.proposal?.status==='pending'&&S.pair.proposal.text?.jars?S.pair.proposal.text:coupleProfile())):(S.ui.profilePreview||S.me)).jars.filter(j=>j.vis==='public'):(person(id)?.jars||[]).map(normJar).filter(j=>!j.vis||j.vis==='public');
const fillJars=()=>setTimeout(()=>$$('.jars.pre').forEach(j=>j.classList.remove('pre')),90);
function venn(n,o={}){return `<div class="venn ${o.mini?'mini':''} ${o.pre?'pre':''}" ${o.id?`id="${o.id}"`:''}><i></i><i></i><b>${n}${o.mini?'':`<small>${pl(n,['общий интерес','общих интереса','общих интересов'],['shared interest','shared interests'],true)}</small>`}</b></div>`;}
const playVenn=()=>setTimeout(()=>$$('.venn.pre').forEach(v=>v.classList.remove('pre')),120);

/** Shared interests: only data both people made visible. Categories, no score. */
function shared(id){
 const p=person(id);if(!p)return{match:[],complement:[],discuss:[],few:true};
 const mine=(authorProfile()?.jars||[]).filter(j=>j.vis==='public'&&!j.limit);
 const theirs=(p.jars||[]).map(normJar).filter(j=>!j.limit);
 const match=mine.filter(j=>j.lv>=6&&theirs.some(x=>x.t===j.t&&x.lv>=6)).map(j=>j.t);
 const complement=[];const discuss=[];const placed=new Set();/* V11 (UX-11): a topic sits in exactly one group — «Стоит обсудить» wins over «Дополняете» and «Совпадает» */
 const r1=fmtList(publicField(authorProfile()||S.me,'role')),r2=fmtList(p.role);
 const roles=r1.includes('lead')&&r2.includes('recv')?['lead','recv']:r1.includes('recv')&&r2.includes('lead')?['recv','lead']:null;
 if(roles)complement.push(L(`Твоя ${opt('role',roles[0])} и ${opt('role',roles[1])} у ${pname(id)} дополняют друг друга`,`Your ${opt('role',roles[0])} role and ${pname(id)}’s ${opt('role',roles[1])} role complement each other`));
 else if(r1.includes('switch')||r2.includes('switch'))complement.push(L('Среди открытых ролей есть свитч: роли можно договорить вместе','The shared roles include switch: roles are open to agree on'));
 mine.forEach(j=>{const x=theirs.find(y=>y.t===j.t);if(!x)return;
  if(Math.abs(x.lv-j.lv)>=4){placed.add(j.t);discuss.push(L(`${topic(j.t)}: у тебя ${jarShort(j)}, у ${pname(id)} ${jarShort(x)}`,`${topic(j.t)}: you ${jarShort(j)}, ${pname(id)} ${jarShort(x)}`));return;}
  /* direction: giving meets receiving → complements; both only give (or only receive) → worth agreeing on */
  const a=normDir(j.dir),b=normDir(x.dir);if(!a||!b)return;
  const fits=(a.includes('give')&&b.includes('get'))||(a.includes('get')&&b.includes('give'));
  if(fits){placed.add(j.t);complement.push(L(`${topic(j.t)}: у тебя ${dirText(a)}, у ${pname(id)} ${dirText(b)} — дополняете друг друга`,`${topic(j.t)}: you — ${dirText(a)}, ${pname(id)} — ${dirText(b)}: you complement each other`));}
  else if(a.length===1&&b.length===1&&a[0]===b[0]&&a[0]!=='watch'){placed.add(j.t);discuss.push(L(`${topic(j.t)}: вам обоим ближе ${dirText(a)} — стоит договориться`,`${topic(j.t)}: you both lean to ${dirText(a)} — worth agreeing on`));}});
 const mf=fmtList(publicField(authorProfile()||S.me,'format')),tf=fmtList(p.format);if(mf.length&&tf.length&&mf.includes('mono')!==tf.includes('mono'))discuss.push(L(`Формат отношений разный: у тебя — ${fmtText(mf,2)}, в профиле ${pname(id)} — ${fmtText(tf,2)}`,`Different relationship format: you — ${fmtText(mf,2)}, ${pname(id)}’s profile — ${fmtText(tf,2)}`));else{const both=mf.filter(x=>tf.includes(x));if(both.length)complement.push(L(`Совпадает формат: ${fmtText(both,2)}`,`Same format: ${fmtText(both,2)}`));}
 return{match:match.filter(t=>!placed.has(t)),complement,discuss:[...new Set(discuss)],few:mine.length<2||theirs.length<2};
}
/** «what you share» — ONE component for the discovery card and the full profile: summary (opens the full comparison), matches (each topic opens the side-by-side answers),
    what complements, what is worth discussing. Uses only what both of you made visible. */
function compatBlock(id,o={}){const demo=!!o.demo;
 /* demo (my own preview): a sample built from my own public interests, so the block looks exactly as a real visitor's */
 const sh=demo?(()=>{const mine=(S.me.jars||[]).filter(j=>j.vis==='public'&&!j.limit).slice(0,2).map(j=>j.t);return{match:mine,complement:mine.length?[L('Ваши роли и ритм дополняют друг друга','Your roles and pace complement each other')]:[],discuss:[],few:!mine.length};})():shared(id);
 const sec=(t,n,body)=>`<div class="cp-s"><div class="cp-t"><span>${t}</span>${n!=null?`<b>${n}</b>`:''}</div>${body}</div>`;
 const chipAttrs=m=>demo?'data-act="demoNote"':`data-act="topic" data-v="${esc(m)}" data-who="${esc(id)}"`;
 const match=sh.match.length?sec(L('Совпадает','In common'),sh.match.length,`<div class="chips">${sh.match.map(m=>`<button class="chip hit" ${chipAttrs(m)}>${esc(topic(m))}</button>`).join('')}</div>`):'';
 const comp=sh.complement.length?sec(L('Дополняете друг друга','You complement each other'),null,sh.complement.map(c=>`<div class="fact"><i class="g">${I.check}</i><span>${esc(c)}</span></div>`).join('')):'';
 const disc=sh.discuss.length?sec(L('Стоит обсудить','Worth discussing'),null,sh.discuss.slice(0,2).map(c=>`<div class="fact"><i class="a">${I.warn}</i><span>${esc(c)}</span></div>`).join('')):'';
 return `<section class="compat"><button class="cp-h" ${demo?'data-act="demoNote"':`data-go="P05" data-id="${esc(id)}"`}>${venn(sh.few?'?':sh.match.length,{mini:1})}<span class="grow"><b>${esc(sharedSummary(id,sh))}</b><span>${L('Только то, что вы оба открыли','Only what you both made visible')}</span></span>${I.chev}</button>${match}${comp}${disc}${demo?`<p class="cp-demo">${L('Демо: так блок увидит человек — с вашими общими интересами','Demo: this is how a visitor sees it, with your shared interests')}</p>`:''}</section>`;}
/** «what a person told about themselves»: every chosen detail in ONE card — the same block in the discovery card and in every profile
    (gender, orientation, role, relationship status, format; «looking for» only when dating is on). City sits in the header line. */
function detailsGroup(id){const p=person(id);if(!p)return '';
 const only=p.pair?['role','format','seek']:null;
 const rows=identityFields().filter(([k])=>(!only||only.includes(k))&&(k!=='seek'||p.dating)).map(([k,title])=>{const v=IDENTITY_MULTI.includes(k)?fmtList(p[k]).map(x=>opt(k,x)).filter(Boolean).join(', '):opt(k,p[k]);return v?[title,v]:null;}).filter(Boolean);
 return rows.length?grp(p.pair?L('Данные пары','Couple details'):L('Данные','Details'),`<dl class="kv">${rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`):'';}
function sharedSummary(id,sh){const s=sh||shared(id);if(s.few)return L('Пока мало общего контекста','Not much shared context yet');
 const parts=[];if(s.match.length)parts.push(pl(s.match.length,['общий интерес','общих интереса','общих интересов'],['shared interest','shared interests']));if(s.complement.length)parts.push(L('дополняете друг друга','you complement each other'));return parts.join(', ')||L('Есть что обсудить','Something to talk about');}

/* ---------- people ---------- */
function whoLine(id){const p=person(id);if(!p)return '';const g=(p.gender||[]).map(x=>opt('gender',x)).join(', ');const o=(p.orient||[]).map(x=>opt('orient',x)).join(', ');return [p.pair?T(p.pairNote):'',[g,o].filter(Boolean).join(', ')].filter(Boolean).join(' · ');}
function placeLine(id){const p=person(id);if(!p)return '';const km=S.me.location?.mode==='nearby'?nearbyDistance(id):null;return [city(p.city),km!==null?L(`около ${Math.max(5,km)} км`,`about ${Math.max(5,km)} km`):''].filter(Boolean).join(' · ');}
function presence(id){const p=person(id);if(!p)return '';return p.online?L('сейчас в сети','online now'):T(p.last)||'';}
/** attributes that open a person's profile (own profile for me) */
const profGo=id=>id==='couple'?'data-go="Q03"':id==='me'?'data-go="P03"':`data-go="P01" data-p='${esc(JSON.stringify({id}))}'`;
/** avatar + name as one link to the profile; used where a row has its own other actions */
const whoLink=(id,cls='xs',extra='')=>`<button class="plink" ${profGo(id)} aria-label="${esc(L(`Профиль: ${pname(id)}`,`Profile: ${pname(id)}`))}">${av(id,cls)}</button>`;
function personRow(id,o={}){
 return `<button class="li" ${profGo(id)}>${av(id,o.round?'round':'')}<span class="tx"><b>${esc(pname(id))}${person(id).dating&&person(id).age?`, ${person(id).age}`:''}${nameBadges(person(id))}</b><small>${o.sub||esc(whoLine(id))}</small></span>${o.right||I.chev}</button>`;
}

/* ---------- posts ---------- */
const allPosts=()=>[...S.myPosts.filter(p=>p.status==='published'&&!p.hiddenByPair&&(p.author!=='couple'||activePair())),...S.posts];
const postById=id=>{const p=S.posts.find(p=>p.id===id)||S.myPosts.find(p=>p.id===id);if(p?.author==='couple'&&(!activePair()||p.hiddenByPair))return {...p,text:{ru:'Совместный профиль недоступен',en:'Couple profile unavailable'},media:[],tags:[],result:null,poll:null,comments:(p.comments||[]).filter(c=>c.a!=='couple'),unavailable:true};return p;};
/** V7: one post type with optional attachments — photos/video (≤6), a poll (2–10 options) or a quiz result */
const postMedia=p=>p.media&&p.media.length?p.media:p.type==='photo'?[{type:'plate',key:p.plate||'rose'}]:[];
const postKinds=p=>{const k=[];if(postMedia(p).length)k.push('photo');if(p.poll)k.push('poll');if(p.result)k.push('result');if(!k.length)k.push('text');return k;};
function pollVoters(p,i){return [...new Set([...(p.pollVoters?.[i]||[]),...(p.vote===i?['me']:[])])].filter(id=>person(id)&&!isBlocked(id));}
/* poll (owner 15.10): before the vote every option is an outlined button with an empty circle — obviously tappable;
   after it the bars fill like the jars (liquid edge, a bubble in yours), the text never moves (your mark sits after it),
   the count is a contained «people» button, and withdrawing is a quiet text button with an icon. */
function pollHTML(p,o={}){const voted=p.vote!=null,opts=p.poll,live=!o.preview,tot=opts.reduce((n,x,i)=>n+pollVoters(p,i).length,0),max=Math.max(1,...opts.map((x,i)=>pollVoters(p,i).length));const anim=p._voteAt&&Date.now()-p._voteAt<1500;
 return `<div class="poll ${voted?'voted':''} ${anim?'anim':''}" role="group" aria-label="${p.pollQ?esc(T(p.pollQ)):L('Опрос','Poll')}">${p.pollQ?`<b class="poll-q">${esc(T(p.pollQ))}</b>`:''}${opts.map((x,i)=>{const n=pollVoters(p,i).length,pc=tot?Math.round(n/tot*100):0,mine=p.vote===i,lead=voted&&n===max&&n>0;
  return `<div class="poll-option ${mine?'mine':''} ${lead?'leader':''}"><button type="button" ${live&&!voted?`data-act="vote" data-v="${p.id}" data-i="${i}"`:''} class="poll-choice ${mine?'mine':''}" aria-pressed="${mine}" aria-disabled="${!live||voted}">${voted?`<i class="pfill" style="--pc:${pc}%">${mine?'<b class="pbub"></b>':''}</i>`:'<span class="pradio" aria-hidden="true"></span>'}<span class="po"><span class="pot">${esc(T(x[0]))}</span>${mine?`<span class="pmine" aria-label="${L('твой выбор','your choice')}">${I.check}</span>`:''}</span></button>${voted?`<button type="button" class="poll-count" ${live?`data-act="pollPeople" data-v="${p.id}" data-i="${i}"`:''} aria-label="${L('Кто выбрал этот вариант','Who chose this option')}: ${n}"><span>${n}</span>${live?I.chev:''}</button>`:''}</div>`;}).join('')}<div class="poll-f"><span class="note">${pl(tot,['голос','голоса','голосов'],['vote','votes'])}${!voted&&live?` · ${L('выбери один вариант','pick one option')}`:''}</span>${voted&&live?`<button type="button" class="poll-undo" data-act="unvote" data-v="${p.id}">${I.undo}<span>${L('Отменить голос','Withdraw vote')}</span></button>`:''}</div></div>`;}
ACT.pollPeople=a=>{const p=postById(a.dataset.v),i=+a.dataset.i;if(!p?.poll?.[i]||p.vote==null)return;const ids=pollVoters(p,i);sheet(()=>({title:esc(T(p.poll[i][0])),body:ids.length?`<div class="card list">${ids.map(id=>personRow(id)).join('')}</div>`:empty('people',L('Пока никто','Nobody yet'),'' )}));};

function postMediaHTML(p,o={}){let h='';const m=postMedia(p);if(m.length)h+=mediaGrid(m,{id:p.id});
 if(p.poll)h+=pollHTML(p,o);
 if(p.result)h+=`<div class="testcard" style="--n:${Math.min(4,p.result.length)}" aria-label="${L('Интересы','Interests')}">${jarsHTML(p.result,{act:o.preview?'':'topic',who:p.author})}</div>`;
 return h;}
/** Post Markdown, FetLife-like and safe: the text is escaped first, raw HTML never runs.
 *  Supported: **bold**, *italic*, ~~strike~~, `code`, > quote, - / 1. lists, ## heading, [text](https://…).
 *  No images: ![alt](url) shows as a plain link. Links only http/https and open after a confirmation. */
function mdInline(s){const keep=[];const put=h=>`\u0000${keep.push(h)-1}\u0000`;
 s=s.replace(/`([^`\n]+)`/g,(_,c)=>put(`<code>${c}</code>`));
 s=s.replace(/!?\[([^\]\n]{1,120})\]\((https?:\/\/[^\s()<>"']{1,400})\)/g,(_,t,u)=>put(`<a href="${u}" data-act="mdLink" data-v="${u}" rel="noopener noreferrer nofollow">${t}</a>`));
 s=s.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,(_,a,b)=>`<b>${a||b}</b>`).replace(/~~([^~\n]+)~~/g,'<s>$1</s>').replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g,'$1<i>$2</i>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g,'$1<i>$2</i>');
 return s.replace(/\u0000(\d+)\u0000/g,(_,i)=>keep[+i]);}
function md(src,cls){const lines=esc(String(src||'')).split('\n');let out='',list=null,para=[];
 const flushP=()=>{if(para.length){out+=`<p>${para.map(mdInline).join('<br>')}</p>`;para=[];}};const flushL=()=>{if(list){out+=`<${list.t}>${list.items.map(x=>`<li>${mdInline(x)}</li>`).join('')}</${list.t}>`;list=null;}};
 for(let k=0;k<lines.length;k++){const l=lines[k];let m;
  if(!l.trim()){flushP();flushL();continue;}
  if(/^\\([-*]|\d+[.)]|&gt;|#{1,3})\s/.test(l)){flushL();para.push(l.slice(1));continue;}
  if((m=l.match(/^\s*[-*]\s+(.*)/))||(m=l.match(/^\s*\d+[.)]\s+(.*)/))){const t=/^\s*\d/.test(l)?'ol':'ul';flushP();if(list&&list.t!==t)flushL();list=list||{t,items:[]};list.items.push(m[1]);continue;}
  flushL();
  if((m=l.match(/^&gt;\s?(.*)/))){flushP();const q=[m[1]];while(k+1<lines.length&&/^&gt;/.test(lines[k+1]))q.push(lines[++k].replace(/^&gt;\s?/,''));out+=`<blockquote>${q.map(mdInline).join('<br>')}</blockquote>`;continue;}
  if((m=l.match(/^#{1,3}\s+(.*)/))){flushP();out+=`<h4>${mdInline(m[1])}</h4>`;continue;}
  para.push(l);}
 flushP();flushL();return `<div class="md${cls?' '+cls:''}">${out}</div>`;}
/** Markdown → one line of plain text, for list rows and previews */
const mdPlain=s=>String(s||'').replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/^\s*(#{1,3}|>|[-*]|\d+[.)])\s+/gm,'').replace(/(\*\*|__|~~|`)/g,'').replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,!?:;])/g,'$1$2').replace(/^\\(?=[-*>#\d])/gm,'').replace(/\s*\n+\s*/g,' ').trim();
ACT.mdLink=(a,e)=>{e?.stopPropagation();const u=a.dataset.v;let host='';try{host=new URL(u).host;}catch(_){return;}if(!/^https?:$/.test(new URL(u).protocol))return;
 ask({icon:'link',title:L('Открыть внешнюю ссылку?','Open an external link?'),text:L(`Ссылка ведёт на ${host} — это не FetUre. Не вводи там пароль от FetUre.`,`The link goes to ${host}, outside FetUre. Don’t enter your FetUre password there.`),ok:L('Открыть','Open')}).then(ok=>{if(ok)window.open(u,'_blank','noopener,noreferrer');});};
/** reply actions under a comment/reply: like, reply, more (report / block, delete own). kind 'p' = post replies, 'd' = discussion replies */
const replyList=(kind,id)=>kind==='p'?postById(id)?.comments:S.discussions.find(x=>x.id===id)?.replies;
function replyActs(kind,id,i,c){if(c.status)return '';c={...c,liked:!!(c.reactions?c.reactions.me:c.liked)};const n=(c.likes||0)+(c.reactions?Object.values(c.reactions).filter(Boolean).length:c.liked?1:0);
 return `<div class="r-acts"><button class="${c.liked?'on':''}" data-act="rLike" data-v="${kind}:${id}" data-i="${i}" aria-pressed="${!!c.liked}" aria-label="${L('Нравится ответ','Like reply')}">${c.liked?I.heartf:I.heart}${n?`<span>${n}</span>`:''}</button><button data-act="rReply" data-v="${kind}:${id}" data-i="${i}" aria-label="${esc(L(`Ответить ${pname(c.a)}`,`Reply to ${pname(c.a)}`))}">${I.chat}</button><button data-act="rMore" data-v="${kind}:${id}" data-i="${i}" aria-label="${L('Ещё','More')}">${I.more}</button></div>`;}
function identifyReplies(kind,id){const list=replyList(kind,id)||[];list.forEach((c,i)=>{if(!c.id)c.id=`${kind}_${id}_${i}`;});return list;}
/* replies like Threads / X (owner 15.10): a top-level reply with its avatar and a thread line; every answer inside that
   branch hangs on the line one step in (no endless indent), deeper answers say whom they answer. A long branch shows
   its first two answers and «Ещё N ответов»; the branch opens by itself for a deep link or your just-sent reply. */
function replyTree(kind,id){const list=identifyReplies(kind,id),byId=new Map(list.map(c=>[c.id,c])),route=cur(),open=route.open||(route.open=[]),focus=route.p?.reply;
 const kids=parent=>list.filter(c=>(c.parent||null)===parent);const roots=list.filter(c=>!c.parent||!byId.has(c.parent));
 const flat=root=>{const out=[],seen=new Set([root.id]);const walk=pid=>kids(pid).forEach(c=>{if(seen.has(c.id))return;seen.add(c.id);out.push(c);walk(c.id);});walk(root.id);return out;};
 const one=(c,root,child)=>{const hidden=c.deleted||c.a==='couple'&&!activePair()||isBlocked(c.a),parent=byId.get(c.parent);const status=c.status==='pending'?L('отправляется…','sending…'):c.status==='failed'?L('не отправлено','not sent'):F.rel(c.t);
  const to=child&&parent&&parent.id!==root.id&&!parent.deleted&&!isBlocked(parent.a)?`<small class="cm-to">${L('в ответ','replying to')} <button class="plink" ${profGo(parent.a)}>${esc(pname(parent.a))}</button></small>`:'';
  return `<article class="cm ${child?'child':''} ${hidden?'removed':c.status||''}" id="reply-${esc(c.id)}"><div class="cm-l">${hidden?`<span class="av cm-ghost" aria-hidden="true">${I.lock}</span>`:whoLink(c.a,child?'xs':'sm')}</div><div class="cm-b">${hidden?`<p class="note">${c.deleted?L('Ответ удалён','Reply deleted'):isBlocked(c.a)?L('Ответ скрыт: автор заблокирован','Reply hidden: author blocked'):L('Ответ недоступен','Reply unavailable')}</p>`:`<div class="cm-h"><button class="plink pnm" ${profGo(c.a)}><span class="nmt">${esc(pname(c.a))}</span>${nameBadges(person(c.a))}</button><time>${status}</time></div>${to}<p class="reply-text">${esc(T(c.text))}</p>${c.status==='failed'&&kind==='p'?`<button class="btn text auto" data-act="retryComment" data-v="${esc(c.id)}">${L('Повторить','Retry')}</button>`:''}${replyActs(kind,id,c.id,c)}`}</div></article>`;};
 /* order of top-level replies, like the big apps: computed once when the screen opens (or the order is switched) and then
    frozen — nothing jumps while you read. Your new replies go on top and stay there; others' new replies go to the end.
    «Интересные»: likes count only from 100, answers in the branch only from 10; below that it is simply newest first. */
 route.openedAt??=Date.now();
 const sort=route.sort||'top',gone=c=>c.deleted||isBlocked(c.a)?1:0,lk=c=>(c.likes||0)+(c.liked?1:0),score=c=>{const l=lk(c),n=flat(c).length;return (l>=100?l:0)+(n>=10?n*5:0);};
 if(!route.order||route.orderSort!==sort){route.order=[...roots].sort((a,b)=>(gone(a)-gone(b))||(sort==='top'?score(b)-score(a):0)||(b.t-a.t)).map(c=>c.id);route.orderSort=sort;}
 {const known=new Set(route.order),fresh=roots.filter(c=>!known.has(c.id));route.order=[...fresh.filter(c=>ownedIdentity(c.a)).sort((a,b)=>b.t-a.t).map(c=>c.id),...route.order,...fresh.filter(c=>!ownedIdentity(c.a)).sort((a,b)=>a.t-b.t).map(c=>c.id)];}
 const rootSet=new Set(roots);roots.splice(0,roots.length,...route.order.map(id=>byId.get(id)).filter(c=>c&&rootSet.has(c)));
 const PAGE=REPLY_PAGE;const fi=focus?roots.findIndex(r=>r.id===focus||flat(r).some(c=>c.id===focus)):-1;route.shown=Math.max(route.shown||PAGE,fi+1);
 const page=roots.slice(0,route.shown),left=roots.length-page.length;
 const head=roots.length>1?`<div class="cm-sort" role="tablist" aria-label="${L('Порядок ответов','Reply order')}">${[['top',L('Интересные','Top')],['new',L('Новые','Newest')]].map(([k,l])=>`<button role="tab" class="${sort===k?'on':''}" aria-selected="${sort===k}" data-act="thSort" data-v="${k}">${l}</button>`).join('')}</div>`:'';
 const tail=left?`<button class="cm-load" data-act="thPage" data-left="${left}">${L(`Показать ещё ${Math.min(PAGE,left)} из ${left}`,`Show ${Math.min(PAGE,left)} more of ${left}`)}</button>`:'';
 return head+page.map(root=>{const all=flat(root);/* opens once by itself for a deep link or your new reply; after that you can fold it again */
  route.auto??=[];const want=all.filter(c=>(c.id===focus||(ownedIdentity(c.a)&&c.t>=route.openedAt))&&!route.auto.includes(c.id));if(want.length){route.auto.push(...want.map(c=>c.id));if(!open.includes(root.id))open.push(root.id);}const forced=false;const isOpen=open.includes(root.id)||forced||all.length<=3;const shown=isOpen?all:all.slice(0,2),rest=all.length-shown.length;
  const more=rest?`<button class="cm-more" data-act="thOpen" data-v="${esc(root.id)}"><span class="cm-avs">${[...new Set(all.slice(2).map(c=>c.a))].filter(x=>!isBlocked(x)).slice(0,3).map(x=>av(x,'xs')).join('')}</span>${L(`Ещё ${pl(rest,['ответ','ответа','ответов'],['reply','replies'])}`,`${rest} more ${rest===1?'reply':'replies'}`)}</button>`:'';
  const less=isOpen&&!forced&&all.length>3?`<button class="cm-more less" data-act="thClose" data-v="${esc(root.id)}">${L('Свернуть ветку','Collapse thread')}</button>`:'';
  return `<div class="th ${all.length?'has-kids':''}">${one(root,root,false)}${all.length?`<div class="cm-kids">${shown.map(c=>one(c,root,true)).join('')}${more}${less}</div>`:''}</div>`;}).join('')+tail;}
const REPLY_PAGE=50;
ACT.thSort=a=>{const r=cur();if(r.sort===a.dataset.v)return;r.sort=a.dataset.v;r.shown=REPLY_PAGE;r.order=null;refresh();};
ACT.thPage=()=>{const r=cur();r.shown=(r.shown||REPLY_PAGE)+REPLY_PAGE;refresh();};
ACT.thOpen=a=>{const r=cur();r.open=[...new Set([...(r.open||[]),a.dataset.v])];refresh();};
ACT.thClose=a=>{const r=cur();r.open=(r.open||[]).filter(x=>x!==a.dataset.v);refresh();};
function replyComposer(route){const c=route.replyTarget;if(!c)return '';return `<div class="reply-target"><span>${L('Ответ для','Reply to')} <b>${esc(pname(c.a))}</b></span><button class="ibtn sm" data-act="replyCancel" aria-label="${L('Отменить ответ','Cancel reply')}">${I.close}</button></div>`;}
ACT.replyCancel=()=>{delete cur().replyTarget;refresh();};
function notifyReply(kind,id,c){if(c.notified||c.status||c.deleted)return;const list=identifyReplies(kind,id);const parent=list.find(x=>x.id===c.parent);const root=kind==='p'?postById(id)?.author:S.discussions.find(x=>x.id===id)?.author;const targets=[...new Set([parent&&!parent.deleted?parent.a:null,root].filter(x=>x&&x!==c.a&&!isBlocked(x)))];c.notified=true;S.replyDeliveries??=[];for(const to of targets){const n={id:'rn_'+c.id+'_'+to,type:'reply',to,p:c.a,reply:c.id,parent:c.parent||null,t:Date.now(),read:false,go:[kind==='p'?'F05':'C06',{id,reply:c.id}]};S.replyDeliveries.push(n);if(to==='me')S.notifs.unshift(n);else socialDelivery(to,'reply',c.id,{p:c.a,go:n.go});}}
function scrollToReply(p){const r=cur();const to=r.scrollTo||(r.scrolledTo!==p.reply?p.reply:null);if(to){const el=document.getElementById?.('reply-'+to);if(el){el.scrollIntoView({block:'center',behavior:r.scrollTo?'smooth':'auto'});if(r.scrollTo){el.classList.add('cm-flash');delete r.scrollTo;}else r.scrolledTo=p.reply;}}
 /* auto-load the next batch of replies when «show more» comes into view */
 const more=$('.cm-load');if(more&&'IntersectionObserver' in window){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();if(cur()===r&&document.contains(more))ACT.thPage();}},{rootMargin:'200px'});io.observe(more);}}
const replyAt=a=>{const [kind,id]=a.dataset.v.split(':');const list=identifyReplies(kind,id);const c=list.find(x=>x.id===a.dataset.i)||list[+a.dataset.i];return c?{kind,id,c,list}:null;};
ACT.rLike=a=>{const x=replyAt(a);if(!x||x.c.status||x.c.deleted||isBlocked(x.c.a))return;if(!canAct('react','me')||x.kind==='d'&&!communityAuthorAllowed(S.discussions.find(d=>d.id===x.id)?.c,'me','comment'))return;x.c.reactions??={me:!!x.c.liked};x.c.reactions.me=!x.c.reactions.me;x.c.liked=!!x.c.reactions.me;refresh();};
ACT.rReply=a=>{const x=replyAt(a);if(!x||x.c.status||x.c.deleted||isBlocked(x.c.a))return;const input=x.kind==='p'?'cmt':'dr';if(!$('#'+input))return;cur().replyTarget={id:x.c.id,a:x.c.a};refresh();ACT.dockReply();};

ACT.rMore=a=>{const x=replyAt(a);if(!x)return;const mine=ownedIdentity(x.c.a);
 sheet(()=>({title:L('Ответ','Reply'),body:`<div class="card list">${mine?linkRow({act:'rDel',v:a.dataset.v,p:null,icon:'trash',cls:'danger',title:L('Удалить ответ','Delete reply'),noChev:1}).replace('data-act="rDel"',`data-act="rDel" data-i="${a.dataset.i}"`):`${linkRow({go:'P01',p:{id:x.c.a},icon:'me',title:L(`Профиль ${esc(pname(x.c.a))}`,`${esc(pname(x.c.a))}’s profile`)})}${linkRow({act:'report',v:'comment',icon:'flag',cls:'danger',title:L('Пожаловаться','Report'),noChev:1}).replace('data-act="report"',`data-act="report" data-who="${x.c.a}"`)}${linkRow({act:'block',v:x.c.a,icon:'block',cls:'danger',title:L(`Заблокировать ${esc(pname(x.c.a))}`,`Block ${esc(pname(x.c.a))}`),sub:L('Скроет ответы и прекратит контакт','Hides their replies and ends contact'),noChev:1})}`}</div>`}));};
ACT.rDel=a=>{const x=replyAt(a);if(!x||!ownedIdentity(x.c.a))return;closeSheet(true);ask({icon:'trash',tone:'l',title:L('Удалить ответ?','Delete reply?'),ok:L('Удалить','Delete'),danger:true}).then(ok=>{if(!ok)return;const i=x.list.indexOf(x.c);if(i>=0){x.c.deleted=true;x.c.text={ru:'',en:''};}refresh();toast(L('Ответ удалён','Reply deleted'),{type:'ok'});});};
/* Rich text field (V10 round 2): FetLife-like — a toolbar with icons, formatting shows as you type.
   The stored value stays the same safe Markdown that md() renders, so drafts, validation, preview and the API contract
   don't change. Rendering into the editor always goes through md() (escaped text), pasting is plain text only,
   and only http(s) links survive. Prototype uses execCommand; the React app takes a real editor (see the plan, round 2). */
function rteHTML(v){return md(v).replace(/^<div class="md[^"]*">/,'').replace(/<\/div>$/,'').replace(/ data-act="mdLink" data-v="[^"]*"/g,'');}
/** o.name — route form field (r.f); o.local — a field inside a sheet: no route state, the value lives on the editor
 *  (data-md), read it with rteVal(id). The toolbar is one row: what doesn’t fit goes under «…» (rteFit). */
function rteField(o){const r=cur();const v=o.local?(o.value||''):(r.f[o.name]??'');const err=!o.local&&r.err&&r.err[o.name];
 const b=(c,icon,label,x='')=>`<button type="button" data-act="rte" data-v="${c}" aria-label="${label}" title="${label}" ${x}>${I[icon]}<span>${label}</span></button>`;
 return `<div class="field rte ${err?'err':''}" data-field="${o.name}">${o.label?`<span>${o.label}</span>`:''}<div class="rte-box">
 <div class="rte-tb" role="toolbar" aria-label="${L('Оформление текста','Text formatting')}">${b('undo','undo',L('Отменить','Undo'))}${b('redo','redo',L('Повторить','Redo'))}<i></i>${b('bold','fbold',L('Жирный','Bold'),'aria-pressed="false"')}${b('italic','fital',L('Курсив','Italic'),'aria-pressed="false"')}${b('strikeThrough','fstrike',L('Зачёркнутый','Strikethrough'),'aria-pressed="false"')}${b('link','link',L('Ссылка','Link'))}${b('h4','fhead',L('Заголовок','Heading'),'aria-pressed="false"')}<i></i>${b('insertUnorderedList','flist',L('Список','List'),'aria-pressed="false"')}${b('insertOrderedList','folist',L('Нумерованный список','Numbered list'),'aria-pressed="false"')}${b('blockquote','fquote',L('Цитата','Quote'),'aria-pressed="false"')}<button type="button" class="rte-mbtn" data-act="rte" data-v="more" aria-label="${L('Ещё оформление','More formatting')}" aria-expanded="false" hidden>${I.more}</button></div>
 <div class="rte-pop" role="menu" hidden></div>
 <div class="inp rte-ed ${v?'':'is-empty'}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${esc(o.label||o.ph||'')}" data-in="rte" data-name="${o.name}" ${o.local?`id="${o.local}" data-local="1"`:''} data-md="${esc(v)}" data-ph="${esc(o.ph||'')}" ${o.max?`data-max="${o.max}"`:''} ${err?'aria-invalid="true"':''}>${rteHTML(v)}</div></div>
 ${err?`<div class="ferr">${I.alert}${err}</div>`:''}${o.max?`<div class="counter" data-count="${o.name}">${String(v).length} / ${o.max}</div>`:''}</div>`;}
const rteVal=id=>document.getElementById(id)?.dataset.md??'';
/** one-row toolbar: show everything, then hide from the end until the row fits; hidden commands go into the «…» menu */
function rteFit(box){const tb=$('.rte-tb',box),pop=$('.rte-pop',box),mb=$('.rte-mbtn',tb);if(!tb||!tb.clientWidth)return;
 const items=[...tb.children].filter(x=>x!==mb);items.forEach(x=>x.hidden=false);mb.hidden=true;pop.innerHTML='';
 const over=()=>tb.scrollWidth>tb.clientWidth+1;if(!over()){box.classList.remove('pop-on');return;}
 mb.hidden=false;const hid=[];
 for(let k=items.length-1;k>=0&&over();k--){if(items[k].tagName==='I'){items[k].hidden=true;continue;}items[k].hidden=true;hid.unshift(items[k]);}
 // a separator never ends the visible row
 for(let k=items.length-1;k>=0;k--){if(items[k].hidden)continue;if(items[k].tagName==='I')items[k].hidden=true;else break;}
 pop.innerHTML=hid.map(x=>{const c=x.cloneNode(true);c.hidden=false;c.setAttribute('role','menuitem');return c.outerHTML;}).join('');}
const rteObs=typeof ResizeObserver==='function'?new ResizeObserver(es=>es.forEach(e=>rteFit(e.target))):null;
new MutationObserver(()=>$$('.rte-box:not([data-fit])').forEach(b=>{b.dataset.fit=1;rteFit(b);rteObs?.observe(b);})).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(!e.target.closest('.rte-mbtn,.rte-pop'))$$('.rte-box.pop-on').forEach(b=>{b.classList.remove('pop-on');$('.rte-pop',b).hidden=true;$('.rte-mbtn',b).setAttribute('aria-expanded','false');});});
/** editor DOM → Markdown. Only the tags the toolbar makes are kept; everything else becomes its text. */
function rteMd(root){
 const wrap=(m,x)=>{const t=x.match(/^(\s*)([\s\S]*?)(\s*)$/);return t[2]?`${t[1]}${m}${t[2]}${m}${t[3]}`:x;};
 const inl=n=>[...n.childNodes].map(c=>{if(c.nodeType===3)return c.nodeValue.replace(/ /g,' ');if(c.nodeType!==1)return '';const g=c.tagName,x=inl(c);
  if(g==='BR')return '\n';if(g==='B'||g==='STRONG')return wrap('**',x);if(g==='I'||g==='EM')return wrap('*',x);if(g==='S'||g==='STRIKE'||g==='DEL')return wrap('~~',x);if(g==='CODE')return x?`\`${x}\``:'';
  if(g==='A'){const h=c.getAttribute('href')||'';return /^https?:\/\//.test(h)&&x.trim()?`[${x.trim()}](${h})`:x;}
  if(g==='DIV'||g==='P'||g==='LI')return '\n'+x;return x;}).join('');
 const lines=s=>s.replace(/^\n+|\n+$/g,'').split('\n');const out=[];let run='';
 // a plain line that only looks like markup («- », «1. », «> », «## ») is kept literal with a backslash
 const esc1=l=>/^\s*([-*]|\d+[.)]|>|#{1,3})\s/.test(l)?'\\'+l.replace(/^\s+/,''):l;
 const flush=()=>{if(run.trim())out.push(lines(run).map(esc1).join('\n'));run='';};
 const BLK=/^(P|DIV|H[1-6]|BLOCKQUOTE|UL|OL)$/;const walk=node=>[...node.childNodes].forEach(c=>{const g=c.nodeType===1?c.tagName:'';
  if((g==='P'||g==='DIV')&&[...c.children].some(x=>BLK.test(x.tagName))){flush();walk(c);flush();return;}
  if(!g||!BLK.test(g)){run+=c.nodeType===3?c.nodeValue.replace(/ /g,' '):g==='BR'?'\n':inl({childNodes:[c]});return;}
  flush();
  if(/^H/.test(g)){const t=inl(c).replace(/\n/g,' ').trim();if(t)out.push('## '+t);}
  else if(g==='BLOCKQUOTE'){const t=lines(inl(c)).filter(x=>x.trim());if(t.length)out.push(t.map(x=>'> '+x).join('\n'));}
  else if(g==='UL'||g==='OL'){const it=[...c.children].filter(x=>x.tagName==='LI').map(x=>inl(x).replace(/\n/g,' ').trim()).filter(Boolean);if(it.length)out.push(it.map((x,k)=>(g==='OL'?`${k+1}. `:'- ')+x).join('\n'));}
  else{const t=lines(inl(c)).map(esc1).join('\n');if(t.trim())out.push(t);}});
 walk(root);flush();return out.join('\n\n').trim();}
const rteSync=ed=>{const r=cur();const name=ed.dataset.name;const v=rteMd(ed);ed.dataset.md=v;if(!ed.dataset.local){r.f[name]=v;r.dirty=true;}ed.classList.toggle('is-empty',!ed.textContent.trim()&&!ed.querySelector('li'));
 if(!ed.dataset.local&&r.err&&r.err[name])setErr(name,'');const c=$(`[data-count="${name}"]`,ed.closest('.rte'));if(c){const max=+ed.dataset.max;c.textContent=`${v.length} / ${max}`;c.classList.toggle('over',v.length>max);}};
/* Markdown shortcuts while typing: «- » or «* » at a line start makes a list, «1. » a numbered list, «> » a quote.
   Undo is the usual one: Backspace right after the shortcut (or the undo button / Ctrl+Z) gives back the typed characters;
   the toolbar button toggles the list off; Enter on an empty item leaves the list. */
const RTE_AUTO=[[/^[-*]$/,'insertUnorderedList'],[/^1[.)]$/,'insertOrderedList'],[/^>$/,'blockquote']];
function rteAuto(ed,e){if(e?.inputType!=='insertText'||e.data!==' ')return false;const sel=getSelection();if(!sel.rangeCount||!sel.isCollapsed)return false;
 const n=sel.anchorNode,off=sel.anchorOffset;if(!n||n.nodeType!==3||!ed.contains(n))return false;
 if(n.previousSibling&&n.previousSibling.nodeName!=='BR')return false;if(n.parentElement.closest('li,blockquote,h4'))return false;
 const typed=n.nodeValue.slice(0,off),mk=typed.replace(/[\s ]$/,'');if(typed===mk)return false;
 const rule=RTE_AUTO.find(([re])=>re.test(mk));if(!rule)return false;
 // the shortcut must be the first thing on its line
 for(let p=n.parentElement;p&&p!==ed;p=p.parentElement){if(p.previousSibling&&!/^(P|DIV)$/.test(p.nodeName))return false;if(/^(P|DIV)$/.test(p.nodeName))break;}
 const r=document.createRange();r.setStart(n,0);r.setEnd(n,off);sel.removeAllRanges();sel.addRange(r);document.execCommand('delete');
 if(rule[1]==='blockquote')document.execCommand('formatBlock',false,'blockquote');else document.execCommand(rule[1]);
 ed._auto={cmd:rule[1],text:mk+' '};return true;}
document.addEventListener('keydown',e=>{const ed=e.target.closest?.('.rte-ed');if(!ed||!ed._auto)return;const a=ed._auto;
 if(e.key==='Backspace'){const sel=getSelection();const blk=sel.anchorNode&&(sel.anchorNode.nodeType===1?sel.anchorNode:sel.anchorNode.parentElement).closest('li,blockquote');
  if(blk&&!blk.textContent.trim()){e.preventDefault();if(a.cmd==='blockquote')document.execCommand('formatBlock',false,'p');else document.execCommand(a.cmd);document.execCommand('insertText',false,a.text);ed._auto=null;rteSync(ed);rteState();return;}}
 if(e.key.length===1||e.key==='Enter'||e.key==='Backspace')ed._auto=null;},true);
IN.rte=(el,e)=>{if(rteAuto(el,e))rteState();rteSync(el);};
const rteState=()=>{const ed=document.activeElement?.closest?.('.rte-ed');if(!ed)return;const tb=ed.closest('.rte-box');const blk=String(document.queryCommandValue('formatBlock')||'').toLowerCase();
 $$('[aria-pressed]',tb).forEach(b=>{const c=b.dataset.v;let on=false;try{on=c==='h4'||c==='blockquote'?blk===c:document.queryCommandState(c);}catch(_){}b.setAttribute('aria-pressed',String(!!on));});};
document.addEventListener('selectionchange',rteState);
// toolbar buttons must not take the caret away from the text
document.addEventListener('mousedown',e=>{if(e.target.closest('.rte-tb button,.rte-pop button'))e.preventDefault();});
document.addEventListener('paste',e=>{const ed=e.target.closest?.('.rte-ed');if(!ed)return;e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain'));});
document.addEventListener('focusin',e=>{if(e.target.closest?.('.rte-ed')){try{document.execCommand('defaultParagraphSeparator',false,'p');document.execCommand('styleWithCSS',false,false);}catch(_){}}});
ACT.rte=a=>{const box=a.closest('.rte-box'),ed=$('.rte-ed',box),c=a.dataset.v;
 if(c==='more'){const on=box.classList.toggle('pop-on');$('.rte-pop',box).hidden=!on;a.setAttribute('aria-expanded',String(on));return;}
 if(a.closest('.rte-pop')){box.classList.remove('pop-on');$('.rte-pop',box).hidden=true;$('.rte-mbtn',box).setAttribute('aria-expanded','false');}
 if(document.activeElement!==ed)ed.focus();
 if(c==='link'){const sel=getSelection();const range=sel.rangeCount?sel.getRangeAt(0).cloneRange():null;const txt=sel.toString();
  ask({icon:'link',title:L('Ссылка','Link'),text:`<input class="inp" id="rteUrl" type="url" inputmode="url" placeholder="https://" aria-label="${L('Адрес ссылки','Link address')}">`,ok:L('Вставить','Insert')}).then(ok=>{
   const u=(document.getElementById('rteUrl')?.value||'').trim();ed.focus();if(range){sel.removeAllRanges();sel.addRange(range);}
   if(!ok||!u)return;if(!/^https?:\/\/[^\s()<>"']{1,400}$/.test(u)){toast(L('Нужна ссылка, начинающаяся с https://','A link must start with https://'),{type:'warn'});return;}
   if(txt)document.execCommand('createLink',false,u);else document.execCommand('insertHTML',false,`<a href="${esc(u)}">${esc(u)}</a>&nbsp;`);rteSync(ed);});
  setTimeout(()=>document.getElementById('rteUrl')?.focus(),60);return;}
 if(c==='h4'||c==='blockquote'){const blk=String(document.queryCommandValue('formatBlock')||'').toLowerCase();document.execCommand('formatBlock',false,blk===c?'p':c);}
 else document.execCommand(c,false,null);
 rteSync(ed);rteState();};
function postCard(p,o={}){p={...p,liked:!!(p.reactions?p.reactions.me:p.liked)};
 const mine=ownedIdentity(p.author);const pid=JSON.stringify({id:p.id});
 const head=`<div class="post-h"><button class="who" ${profGo(p.author)}>${av(p.author,'sm')}<span class="tx"><b><span class="nmt">${esc(p.authorName?T(p.authorName):pname(p.author))}</span>${nameBadges(person(p.author))}</b><small>${F.rel(p.t)}${p.aud==='followers'?` · <span class="aud">${I.people}${L('подписчикам','followers')}</span>`:''}${o.community&&p.community?` · ${esc(T(COMMUNITIES[p.community].name))}`:''}</small></span></button><button class="ibtn ghost sm" data-act="postMenu" data-v="${p.id}" aria-label="${L('Ещё','More')}">${I.more}</button></div>`;
 const media=postMediaHTML(p,o);
 const tags=p.tags&&p.tags.length?`<div class="tags">${p.tags.map(t=>`<button data-go="F04" data-p='${esc(JSON.stringify({id:t}))}'>#${esc(topic(t))}</button>`).join('')}</div>`:'';
 const nC=p.comments.length;
 const html=`<article class="post" style="animation-delay:${(o.i||0)*40}ms">${head}<div class="body" ${o.detail?'':`data-go="F05" data-p='${pid}'`}>${T(p.text)?md(T(p.text)):''}${media}</div>${tags}
 <div class="post-a"><button class="${p.liked?'on':''}" data-act="likePost" data-v="${p.id}" aria-pressed="${!!p.liked}" aria-label="${L('Нравится публикация','Like post')}">${p.liked?I.heartf:I.heart}<span>${p.likes+(p.reactions?Object.values(p.reactions).filter(Boolean).length:p.liked?1:0)}</span></button>
 <button ${o.detail?'data-act="focusReply"':`data-go="F05" data-p='${pid}'`} aria-label="${L('Обсуждение','Replies')}">${I.chat}<span>${nC}</span></button>
 <button class="sp ${p.saved?'saved':''}" data-act="savePost" data-v="${p.id}" aria-pressed="${!!p.saved}" aria-label="${L('Сохранить','Save')}">${p.saved?I.bookmarkf:I.bookmark}</button>
 <button data-act="sharePost" data-v="${p.id}" aria-label="${L('Поделиться','Share')}">${I.share}</button></div></article>`;
 return o.preview?html.replace(/ data-(act|go|p|v|id)=("[^"]*"|'[^']*')/g,'').replace(/<button /g,'<button disabled '):html;
}
function skeletonPosts(n=3){return Array.from({length:n},()=>`<div class="skp"><div class="row"><div class="sk" style="width:36px;height:36px;border-radius:12px"></div><div class="grow"><div class="sk" style="height:12px;width:40%"></div><div class="sk" style="height:10px;width:24%;margin-top:6px"></div></div></div><div class="sk" style="height:12px;margin-top:14px"></div><div class="sk" style="height:12px;margin-top:8px;width:80%"></div></div>`).join('');}
/** first visit of a list shows a short skeleton — loading never looks like emptiness */
function firstLoad(key,html,sk){if(QA.seen[key])return html;QA.seen[key]=1;setTimeout(()=>{if(main().dataset.screen&&$('#main .sk'))refresh();},650);return sk||skeletonPosts();}

/* ---------- events ---------- */
const EV=id=>EVENTS[id]||S.extraEvents[id];
const allEventIds=()=>[...Object.keys(EVENTS),...Object.keys(S.extraEvents)];
const myR=id=>S.rsvp[id]||{status:'none',app:'none'};
const isPast=id=>{const e=EV(id);return e.past||e.end<NOW;};
function evStatusPill(id){
 const e=EV(id),r=myR(id);
 if(e.cancelled)return `<span class="pill bad">${L('Отменено','Cancelled')}</span>`;
 if(e.organizer==='me')return `<span class="pill v">${L('Ты организатор','You organise')}</span>`;
 if(isPast(id))return eventAttendanceConfirmed(id)?`<span class="pill">${I.check}${L('Посещено','Attended')}</span>`:'';
 if(r.app==='pending')return `<span class="pill wait">${L('Заявка на рассмотрении','Application pending')}</span>`;
 if(r.app==='approved')return `<span class="pill ok">${L('Заявка одобрена','Approved')}</span>`;
 if(r.app==='declined')return `<span class="pill bad">${L('Заявка отклонена','Declined')}</span>`;
 if(r.status==='going')return `<span class="pill ok">${L('Иду','Going')}</span>`;
 if(r.status==='interested')return `<span class="pill v">${L('Интересно','Interested')}</span>`;
 return '';
}
/* V11 (UX-09): an in-person event is shown in the venue's local time; an online one in the viewer's time (the organiser's zone as a second line) */
const evTz=e=>e.format==='online'?USER_TZ:(e.tz||USER_TZ);
const evAway=e=>e.format==='online'&&!!e.tz&&e.tz!==USER_TZ;
function evWhen(id,full){const e=EV(id),tz=evTz(e);const t=F.time(e.start,tz);const day=full?F.day(e.start,tz):F.date(e.start,{tz});
 return `${day}, ${t}${evAway(e)?` ${L('по твоему времени','your time')}`:''}`;}
function eventCard(id,o={}){
 const e=EV(id);const st=o.neutral?'':evStatusPill(id);
 const fmt=e.format==='online'?`<span>${I.video}${L('Онлайн','Online')}</span>`:`<span>${I.pin}${esc(T(e.area)||city(e.city))}</span>`;
 const tz=evTz(e);const meta=`<div class="meta"><span>${I.clock}${F.time(e.start,tz)}</span><span>${I.ticket}${e.price?esc(T(e.price)):L('Бесплатно','Free')}</span></div>`;
 if(o.row)return `<button class="evc row" data-go="E03" data-p='${esc(JSON.stringify({id}))}'><div class="cv">${evCover(e,'cal')}<div class="date"><b>${F.dnum(e.start,tz)}</b><small>${F.mon(e.start,tz)}</small></div></div><div class="bd"><small>${e.format==='online'?L('Онлайн','Online'):esc(city(e.city))} · ${F.time(e.start,tz)}</small><b>${esc(T(e.title))}</b>${st||`<span class="note">${esc(pname(e.organizer))}</span>`}</div></button>`;
 return `<button class="evc" data-go="E03" data-p='${esc(JSON.stringify({id}))}' style="animation-delay:${(o.i||0)*50}ms"><div class="cv">${evCover(e,'cal')}<div class="date"><b>${F.dnum(e.start,tz)}</b><small>${F.mon(e.start,tz)}</small></div><div class="fmt">${fmt}</div>${st?`<div class="my">${st}</div>`:''}</div>
 <div class="bd"><small>${esc(evType(e.type))} · ${esc(pname(e.organizer))}</small><b>${esc(T(e.title))}</b>${meta}</div></button>`;
}
const evCover=(e,icon)=>e.cover?`<img class="evimg" src="${esc(e.cover)}" alt="" draggable="false">`:plate(e.plate,icon);
const evType=t=>({workshop:L('Мастер-класс','Workshop'),talk:L('Обсуждение','Discussion'),party:L('Вечеринка','Party'),meetup:L('Встреча','Meetup'),edu:L('Обучение','Class')}[t]||t);

/* ---------- communities ---------- */
/** community picture: one source (cover photo, or the plate with the group icon) used as the avatar everywhere; detail adds it as a banner */
const commAv=c=>evCover(c,'users3');
function commCard(id,o={}){
 const c=COMMUNITIES[id];const j=S.joined.has(id),pend=S.pendingJoin.has(id);
 const state=o.noState?'':ownsCommunity(id)?`<span class="pill ok">${I.gear}${L('Ты ведёшь','You host')}</span>`:j?`<span class="pill ok">${I.check}${L('Ты участник','Member')}</span>`:pend?`<span class="pill wait">${L('На рассмотрении','Under review')}</span>`:c.privacy==='closed'?`<span class="pill">${I.lock}${L('По заявке','By request')}</span>`:'';
 return `<button class="cmc" data-go="C03" data-p='${esc(JSON.stringify({id}))}' style="animation-delay:${(o.i||0)*40}ms"><div class="cv" style="position:relative">${commAv(c)}</div><div class="tx"><b>${esc(T(c.name))}</b><small>${esc(mdPlain(T(c.desc)))}</small><div class="meta"><span>${pl(C.members(id),['участник','участника','участников'],['member','members'])}</span><span>·</span><span>${c.city==='online'?L('онлайн','online'):esc(city(c.city))}</span>${state?` ${state}`:''}</div></div></button>`;
}

/* ---------- sheet builders reused across screens ---------- */
/* ---------- V7 chips: inline chips + full-screen picker with search (forms) or fold/expand (filter screens) ---------- */
const chipTxt=(id,l)=>{const en=Object.values(OPT).flat().find(x=>x[0]===id);return esc((l+' '+id+' '+(TOPICS[id]?.en||'')+' '+(TOPICS[id]?.ru||'')+' '+(en?en[1]+' '+en[2]:'')).toLowerCase());};
function chipBtn(id,l,on,act,o={},extra=''){const ex=o.ex?.includes(id);return `<button class="chip ${on?'on':''} ${ex?'ex':''} ${extra}" data-act="${act}" data-v="${esc(id)}" ${o.k?`data-k="${o.k}"`:''} ${o.key?`data-key="${o.key}"`:''} aria-pressed="${on}" data-txt="${chipTxt(id,l)}">${esc(l)}</button>`;}
/** items: [[id,label]]; selected: ids. o: {k, title, groups:[[title,ids]], max, ex, limit, fold, all} */
function chipGroup(items,selected,act,o={}){
 const key=act+'|'+(o.k||'');const sel=new Set((selected||[]).filter(x=>x!=null&&x!==''));const lim=o.limit??8;
 S.ui.chipReg=S.ui.chipReg||{};S.ui.chipReg[key]={items,sel:[...sel],act,k:o.k,title:o.title,groups:o.groups,ex:o.ex,max:o.max};
 if(o.all||items.length<=lim+2)return `<div class="chips">${items.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o)).join('')}</div>`;
 if(o.fold){const open=S.ui.unfold?.[key];const keep=new Set([...sel,...items.slice(0,lim).map(x=>x[0])]);const hid=items.filter(([id])=>!keep.has(id)).length;
  return `<div class="chips ${open?'':'folded'}" data-fold="${key}">${items.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o,keep.has(id)?'':'fx')).join('')}<button class="chip more" data-act="chipFold" data-v="${key}" data-n="${hid}">${open?L('Свернуть','Show less'):L(`Ещё ${hid}`,`${hid} more`)}</button></div>`;}
 // keep the original order and every chip already on screen: selecting never moves chips around
 S.ui.chipShown=S.ui.chipShown||{};const shown=S.ui.chipShown[key]=new Set([...(S.ui.chipShown[key]||[]),...items.slice(0,lim).map(x=>x[0]),...sel]);
 const first=items.filter(([id])=>shown.has(id));
 return `<div class="chips">${first.map(([id,l])=>chipBtn(id,l,sel.has(id),act,o)).join('')}<button class="chip more" data-act="chipAll" data-v="${key}">${ic('search',14)}${L('Все','All')} · ${items.length}</button></div>`;
}
const chipPicker=o=>chipGroup(o.items,o.sel,o.act,{title:o.title,max:o.max,groups:o.cats?topicGroups(o.items.map(x=>x[0])):o.groups});
const optGroups=g=>{const b=OPT_BASE[g]||8;const ids=optList(g).map(x=>x[0]);return [[L('Популярное','Popular'),ids.slice(0,b)],[L('Ещё варианты','More options'),ids.slice(b)]];};
/** Shared identity choices: same IDs, multiplicity and catalog in onboarding/profile. */
const IDENTITY_KEYS=['gender','orient','role','status','format','seek'];
const IDENTITY_MULTI=['gender','orient','format','role','seek'];
const identityFields=()=>[
 ['gender',L('Гендер','Gender'),L('До пяти выбранных вариантов.','Up to five selected options.')],
 ['orient',L('Ориентация','Orientation'),L('До пяти выбранных вариантов.','Up to five selected options.')],
 ['role',L('Роль','Role'),L('До пяти вариантов. Это не согласие на практики.','Up to five options. This is not consent to any practice.')],
 ['status',L('Статус отношений','Relationship status'),L('Необязательно.','Optional.')],
 ['format',L('Формат отношений','Relationship format'),L('До пяти выбранных вариантов.','Up to five selected options.')],
 ['seek',L('Ищу','Looking for'),L('Можно выбрать несколько.','You can choose more than one.')]
];
const identityDraft=m=>Object.fromEntries(IDENTITY_KEYS.map(k=>[k,IDENTITY_MULTI.includes(k)?[...fmtList(m[k])]:m[k]==='any'||m[k]==='unspecified'?null:m[k]||null]));
function identityChoices(k,value,act){const title=identityFields().find(x=>x[0]===k)[1];return chipGroup(optItems(k),IDENTITY_MULTI.includes(k)?fmtList(value):[value],act,{k,title,groups:optGroups(k),limit:5,max:['gender','orient','format','role'].includes(k)?5:undefined});}
function toggleIdentityValue(value,k,v){if(!OPT[k]?.some(x=>x[0]===v))return value;if(!IDENTITY_MULTI.includes(k))return value===v?null:v;const arr=[...fmtList(value)],i=arr.indexOf(v);if(i<0){if(['gender','orient','format','role'].includes(k)&&arr.length>=5){toast(L('Можно выбрать до пяти вариантов','Choose up to five options'),{type:'info'});return arr;}arr.push(v);}else arr.splice(i,1);return arr;}


const topicGroups=ids=>{ids=ids||Object.keys(TOPICS);return CATS.map(c=>[T(c),ids.filter(t=>TOPICS[t]?.cat===c.id)]).filter(g=>g[1].length);};
ACT.chipFold=a=>{const key=a.dataset.v;S.ui.unfold=S.ui.unfold||{};const box=a.closest('.chips');const open=box.classList.toggle('folded')===false;S.ui.unfold[key]=open;a.textContent=open?L('Свернуть','Show less'):L(`Ещё ${a.dataset.n}`,`${a.dataset.n} more`);};
ACT.chipAll=a=>openChipPicker(a.dataset.v);
function openChipPicker(key){S.ui.pickKey=key;sheet(()=>{const r=S.ui.chipReg[key];const sel=new Set(r.sel);const groups=r.groups||[[L('Все','All'),r.items.map(x=>x[0])]];const label=id=>r.items.find(x=>x[0]===id)?.[1]||id;
 return{title:r.title||L('Выбор','Choose'),search:true,searchPh:L('Найти вариант','Find an option'),head:`<span class="pill ${sel.size?'v':''}">${r.max?`${sel.size}/${r.max}`:sel.size}</span>`,
 body:groups.map(([t,ids])=>`<section class="fsec" data-t="${esc(t.toLowerCase())}"><div class="sec">${esc(t)}</div><div class="chips">${ids.filter(id=>r.items.some(x=>x[0]===id)).map(id=>chipBtn(id,label(id),sel.has(id),'chipPick',{ex:r.ex,key})).join('')}</div></section>`).join('')+`<p class="note sh-empty" hidden>${L('Такого варианта нет. Попробуй другое слово — ищем по-русски и по-английски.','No such option. Try another word — we search in Russian and English.')}</p>`,
 foot:`<div class="row g8">${sel.size?`<button class="btn soft" style="flex:0 0 auto;width:auto" data-act="chipClear" data-v="${key}">${L('Сбросить','Clear')}</button>`:''}<button class="btn primary" data-act="closeSheet">${sel.size?L(`Готово · ${sel.size}`,`Done · ${sel.size}`):L('Готово','Done')}</button></div>`};},{full:true});}
ACT.chipPick=a=>{const r=S.ui.chipReg[a.dataset.key];const fn=ACT[r.act];if(!fn)return;fn({dataset:{v:a.dataset.v,k:r.k||''},classList:{contains:()=>false,add(){},remove(){}},closest:()=>null},null);resheet();};
ACT.chipClear=a=>{const r=S.ui.chipReg[a.dataset.v];for(const v of [...r.sel])ACT[r.act]({dataset:{v,k:r.k||''},classList:{contains:()=>false,add(){},remove(){}},closest:()=>null},null);resheet();};
/** search across chip sections (.fsec) inside a container: sheets and full-screen filter pages */
function filterSections(root,q){q=(q||'').toLowerCase().trim();let total=0;
 for(const sec of root.querySelectorAll('.fsec')){const titleHit=q&&sec.dataset.t?.includes(q);let n=0;sec.classList.toggle('searching',!!q);
  for(const el of sec.querySelectorAll('[data-txt]')){const hit=!q||titleHit||el.dataset.txt.includes(q);el.hidden=!hit;if(hit)n++;}
  sec.hidden=!!q&&!n&&!titleHit;total+=n;}
 const em=root.querySelector('.sh-empty,.pg-empty');if(em)em.hidden=!q||!!total;}
IN.shq=el=>{S.ui.shq=el.value;filterSections($('#sheet .sh-b'),el.value);};
IN.pgq=el=>{cur().fq=el.value;filterSections($('#main .view'),el.value);};
const pageSearch=(ph)=>`<div class="fsearch"><div class="inwrap">${I.search}<input class="inp" type="search" data-in="pgq" value="${esc(cur().fq||'')}" placeholder="${esc(ph)}" aria-label="${esc(ph)}" enterkeyhint="search"></div></div>`;
const fsec=(title,html,o={})=>`<section class="fsec" data-t="${esc(String(title).replace(/<[^>]+>/g,'').toLowerCase())}"><div class="sec">${title}${o.right||''}</div>${html}</section>`;
const localMediaURLs=new Set();
function clearLocalMedia(){for(const url of localMediaURLs)URL.revokeObjectURL(url);localMediaURLs.clear();}
function pickLocalMedia(accept,multiple=true){return new Promise(resolve=>{
 const input=document.createElement('input');input.type='file';input.accept=accept;input.multiple=multiple;input.hidden=true;document.body.append(input);
 const finish=files=>{input.remove();resolve(files);};input.addEventListener('cancel',()=>finish([]),{once:true});
 input.addEventListener('change',()=>{const chosen=[];for(const file of input.files){const video=file.type.startsWith('video/'),image=file.type.startsWith('image/');
  if(!video&&!image||accept==='image/*'&&!image){toast(L('Выбери фото или видео поддерживаемого формата','Choose a supported photo or video'),{type:'warn'});continue;}
  if(file.size>(video?100:20)*1024*1024){toast(L('Фото — до 20 МБ, видео — до 100 МБ','Photos up to 20 MB, videos up to 100 MB'),{type:'warn'});continue;}
  const url=URL.createObjectURL(file);localMediaURLs.add(url);chosen.push({url,name:file.name,type:video?'video':'image',size:file.size});if(chosen.length>=6)break;
 }finish(chosen);},{once:true});input.click();
});}
function mediaPreviews(files,removeAct){return files?.length?`<div class="attachment-preview">${files.map((f,i)=>`<figure>${f.type==='video'?`<video controls playsinline preload="metadata" src="${esc(f.url)}"></video>`:`<img src="${esc(f.url)}" alt="${esc(f.name)}" loading="lazy">`}<figcaption>${esc(f.name)}</figcaption>${removeAct?`<button class="btn soft auto" data-act="${removeAct}" data-v="${i}">${L('Убрать','Remove')}</button>`:''}</figure>`).join('')}</div>`:'';}
/* «мы пара» is not a personal status (V11, UX-03): a couple is made by linking two accounts; the couple profile keeps status 'couple' internally */
const optList=g=>OPT[g].filter(x=>!(g==='status'&&x[0]==='couple'));
const optItems=g=>optList(g).map(x=>[x[0],S.lang==='en'?x[2]:x[1]]);

const topicItems=ids=>(ids||Object.keys(TOPICS)).map(t=>[t,topic(t)]);

/* ---------- desktop context column ---------- */
window.CTX=function(tabId){
 const ev=allEventIds().filter(id=>!isPast(id)&&!EV(id).cancelled).sort((a,b)=>EV(a).start-EV(b).start).slice(0,3);
 const foot='';const groups=[...new Set([...S.joined,...myComms()])];
 if(tabId==='feed')return `<h3>${L('Ближайшие события','Coming up')}</h3>${ev.map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}<h3>${L('Сообщества для тебя','Communities for you')}</h3><div class="card list">${Object.keys(COMMUNITIES).filter(c=>!S.joined.has(c)&&!ownsCommunity(c)&&!COMMUNITIES[c].hidden&&COMMUNITIES[c].status!=='review').slice(0,3).map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${commAv(COMMUNITIES[c])}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(C.members(c),['участник','участника','участников'],['member','members'])}</small></span></button>`).join('')}</div>${foot}`;
 if(tabId==='people'){const li=S.likesIn.filter(l=>!isMatch(l.p)&&!l.passed);return `<h3>${L('Тебе симпатизируют','Liked you')}</h3>${li.length?`<div class="card list">${li.map(l=>`<button class="mini" data-go="P01" data-id="${l.p}">${av(l.p,'sm')}<span class="grow"><b>${esc(pname(l.p))}</b><small>${l.src==='profile'?L('из профиля','from profile'):L('из подборки','from discover')}</small></span></button>`).join('')}</div>`:`<p class="note">${L('Пока никого — это нормально.','No one yet — that’s fine.')}</p>`}${foot}`;}
 if(tabId==='groups')return `<h3>${L('Мои сообщества','My communities')}</h3><div class="card list">${groups.length?groups.map(c=>`<button class="mini" data-go="C03" data-id="${c}"><span class="av sm" style="position:relative">${commAv(COMMUNITIES[c])}</span><span class="grow"><b>${esc(T(COMMUNITIES[c].name))}</b><small>${pl(S.discussions.filter(d=>d.c===c).length,['обсуждение','обсуждения','обсуждений'],['discussion','discussions'])}</small></span></button>`).join(''):`<p class="note" style="padding:10px 0">${L('Ты пока ни в одном','You haven’t joined any yet')}</p>`}</div><h3>${L('События сообществ','Community events')}</h3>${ev.filter(id=>EV(id).community).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')}${foot}`;
 if(tabId==='chats')return `<h3>${L('Уведомления','Notifications')}</h3><div class="card list">${linkRow({go:'N01',icon:'bell',title:L('Центр уведомлений','Notification center')})}</div>${foot}`;
 if(tabId==='me')return `<h3>${L('Мои события','My events')}</h3>${myEventIds('going').slice(0,2).map(id=>eventCard(id,{row:1})).join('<div style="height:8px"></div>')||`<p class="note">${L('Пока нет','None yet')}</p>`}${foot}`;
 return foot;
};
function eventAttendanceConfirmed(id){const e=EV(id),r=myR(id);return r.status==='going'&&(!e.approval||r.app==='approved');}
function myEventIds(kind){
 return allEventIds().filter(id=>{const e=EV(id),r=myR(id),past=isPast(id),own=e.organizer==='me';
  const app=e.approval&&['pending','approved','declined'].includes(r.app);
  if(kind==='organize')return own;
  if(own)return false;
  if(kind==='cancelled')return !!e.cancelled&&(app||['going','interested'].includes(r.status));
  if(e.cancelled)return false;
  if(kind==='past')return past&&eventAttendanceConfirmed(id);
  if(past)return false;
  if(kind==='going')return eventAttendanceConfirmed(id);
  if(kind==='apps')return app&&!eventAttendanceConfirmed(id);
  if(kind==='interested')return r.status==='interested'&&!app;
  return false;}).sort((a,b)=>EV(a).start-EV(b).start);
}
const myUpcomingEventIds=()=>[...new Set(['going','apps','interested','organize'].flatMap(myEventIds))].filter(id=>!isPast(id)&&!EV(id).cancelled);

function updCard(u){const src=u.e?T(EV(u.e).title):T(COMMUNITIES[u.c].name);return `<button class="upd ${u.read?'':'unread'}" data-act="openUpdate" data-v="${u.id}"><span class="ico ${u.e?'l':'v'}">${u.e?I.cal:I.users3}</span><span class="tx"><b>${esc(src)}</b><p>${esc(T(u.text))}</p><small>${F.rel(u.t)}</small></span></button>`;}



/* V10 revision: every category of a section sits in one popup as chips; only long searchable lists keep a small picker */
/** a long list inside a filter: the chosen ones and a few popular ones as chips, the rest behind «Все · N» (same as chipPicker) */
function popChips(items,sel,act,more,o={}){if(items.length<=(o.lim||6)+2)return `<div class="chips">${items.map(([id,l])=>chipBtn(id,l,sel.includes(id),act,o)).join('')}</div>`;const pop=(o.groups?o.groups[0][1]:items.map(x=>x[0])).slice(0,o.lim||6);const shown=items.filter(([id])=>sel.includes(id)||pop.includes(id));
 return `<div class="chips">${shown.map(([id,l])=>chipBtn(id,l,sel.includes(id),act,o)).join('')}<button class="chip more" ${more}>${ic('search',14)}${L('Все','All')} · ${items.length}</button></div>`;}
/** single choice inside a filter: if the options fit in one row they are chips (one tap), otherwise a select field */
const fitChips=items=>items.length<=4&&items.reduce((w,[,l])=>w+String(l).length*7.4+38,0)<=340;
function choiceChips(items,sel,act,o={}){return `<div class="chips" role="radiogroup">${items.map(([id,l])=>`<button class="chip ${String(id)===String(sel)?'on':''}" role="radio" aria-checked="${String(id)===String(sel)}" data-act="${act}" data-v="${esc(id)}" ${o.k?`data-k="${o.k}"`:''}>${esc(l)}</button>`).join('')}</div>`;}
const fchoices=(items,sel,act,o={})=>fitChips(items)?choiceChips(items,sel,act,o):choices(items,sel,act,o);
/** «reset this filter» icon in a section header — shown only when the section has a value */
const fclr=(k,act='fClear')=>`<button class="fclr" data-act="${act}" data-v="${k}" aria-label="${L('Сбросить','Reset')}">${I.close}</button>`;
function fInline(r){
 if(r.search&&r.pick){const pk=r.pick();return `<section class="fin"><div class="fin-t"><b>${r.label}</b><span>${L('можно несколько','pick any')}</span>${r.on()&&r.clear?fclr(r.k):''}</div>${popChips(pk.items,pk.sel,pk.act,`data-act="fOpen" data-v="${r.k}"`,{groups:pk.groups})}</section>`;}
 if(r.search)return `<section class="fin"><div class="fin-t"><b>${r.label}</b><span>${L('можно несколько','pick any')}</span>${r.on()&&r.clear?fclr(r.k):''}</div><div class="chips">${r.on()?`<span class="chip on static">${esc(r.summary())}</span>`:''}<button class="chip more" data-act="fOpen" data-v="${r.k}">${ic('search',14)}${L('Все','All')}</button></div></section>`;
 const html=r.body().replace(/<section class="fsec"[^>]*><div class="sec">\s*<\/div>/g,'<section class="fsec">');const single=/role="radiogroup"|data-ch="sel"/.test(html);
 return `<section class="fin"><div class="fin-t"><b>${r.label}</b>${single?'':`<span>${L('можно несколько','pick any')}</span>`}${r.on()&&r.clear?fclr(r.k):''}</div><div class="fin-b">${html}</div></section>`;}
/* ---------- V8 filters, Feeld-style: a tidy list «category → current choice»; a row opens its options with search ---------- */
const sumOf=(items,sel,none)=>{const l=items.filter(([id])=>sel.includes(id)).map(x=>x[1]);return l.length?(l.slice(0,2).join(', ')+(l.length>2?` +${l.length-2}`:'')):(none||L('Любые','Any'));};
function filterSheet(cfg){S.ui.fcfg=cfg;S.ui.fsub=null;const start=JSON.stringify(cfg.draft());
 sheet(()=>{const c=S.ui.fcfg;const sub=S.ui.fsub&&c.rows.find(r=>r.k===S.ui.fsub);
  if(sub)return{title:sub.label,lead:`<button class="ibtn ghost sm" data-act="fBack" aria-label="${L('К фильтрам','Back to filters')}">${I.back}</button>`,search:!!sub.search,searchPh:L('Найти вариант','Find an option'),body:`${sub.body()}<p class="note sh-empty" hidden>${L('Ничего не нашлось','Nothing found')}</p>`,foot:`<button class="btn primary" data-act="fBack">${L('Готово','Done')}</button>`};
  const n=c.count();return{title:c.title,head:`<button class="btn text auto" data-act="fReset">${L('Сбросить','Reset')}</button>`,
   body:`${c.top?c.top():''}${c.rows.map(fInline).join('')}${c.note?`<p class="grp-n">${c.note}</p>`:''}${!n?`<p class="note mt12">${L('С такими фильтрами пока ничего нет. Можно применить их или изменить выбор.','Nothing matches yet. You can apply these filters or change your choices.')}</p>`:''}`,
   foot:`<button class="btn primary" data-act="fApply">${c.noCount?L('Применить','Apply'):n?c.applyLabel(n):L('Применить фильтры','Apply filters')}</button>`};},
 {full:true,back:()=>{if(S.ui.fsub){S.ui.fsub=null;resheet();return true;}return false;}});}
ACT.fOpen=a=>{S.ui.fsub=a.dataset.v;S.ui.shq='';resheet();$('#sheet .sh-b')&&($('#sheet .sh-b').scrollTop=0);};
ACT.fBack=()=>{S.ui.fsub=null;S.ui.shq='';resheet();};
ACT.fClear=a=>{const r=S.ui.fcfg.rows.find(x=>x.k===a.dataset.v);if(r&&r.clear)r.clear();resheet();};
ACT.fReset=()=>{S.ui.fcfg.reset();resheet();};
ACT.fApply=()=>{S.ui.fcfg.apply();closeSheet();refresh();toast(L('Фильтры применены','Filters applied'),{type:'ok'});};
/** a single option list for one filter category: chips grouped, searchable */
const fChips=(items,sel,act,o={})=>o.groups?o.groups.map(([t,ids])=>fsec(t,chipGroup(items.filter(([id])=>ids.includes(id)),sel,act,{...o,all:1,k:o.k}))).join(''):fsec(o.title||'',chipGroup(items,sel,act,{...o,all:1}));


/* Author changes never route, rebuild a sheet or replace the discovery card. */
ACT.chooseAuthor=a=>{const id=a.dataset.v,r=cur();closeAuthorMenu();if(!authorAllowed(id))return;if(id==='couple'){coupleProfile();if(a.dataset.k==='dating'&&!authorProfile('couple')?.dating){toast(L('Анкета пары выключена. Включи её в настройках пары.','The couple profile is off. Turn it on in couple settings.'),{type:'warn',action:{label:L('Настройки пары','Couple settings'),fn:()=>go('Q01')}});return;}}if(r.id==='F07'){const existing=ownPost(r.p.id);if(existing&&existing.status!=='draft')return;S.composeActor=id;r.author=id;r.pairId=id==='couple'?S.pair.id:null;r.dirty=true;r.resSel=[];refresh();return;}if(a.dataset.k==='dating'&&r.id!=='D03'){S.datingEpoch=(S.datingEpoch||0)+1;S.datingActor=id;refresh();return;}if(r.id!=='D03')return;const candidate=$('#deck .pc.top')?.dataset.id||pool()[0];S.datingEpoch=(S.datingEpoch||0)+1;S.datingActor=id;deckBusy=false;r.p.actor=undefined;const list=pool();if(candidate&&list.includes(candidate)){S.deckOrder=S.deckOrder.filter(x=>x!==candidate);S.deckOrder.unshift(candidate);}else if(candidate)toast(L('Эта анкета недоступна для выбранного профиля','This candidate is unavailable to the selected profile'));refresh();};

function paintReactions(){$$('[data-act="likePost"]').forEach(el=>{const p=postById(el.dataset.v);if(!p)return;const on=!!(p.reactions?p.reactions.me:p.liked);el.classList.toggle('on',on);el.setAttribute('aria-pressed',on);el.innerHTML=`${on?I.heartf:I.heart}<span>${p.likes+(p.reactions?Object.values(p.reactions).filter(Boolean).length:p.liked?1:0)}</span>`;});}

function openAuthorMenu(a,after){if(closeAuthorMenu())return;authorMenuAction=after;authorMenuOpener=a;if(!activePair())return;const kind=a.dataset?.k||authorKind(),cur_=kindActor(kind);const m=document.createElement('div');m.id='authorMenu';m.className='author-menu';m.setAttribute('popover','auto');m.setAttribute('role','menu');m.setAttribute('aria-label',kind==='dating'?L('Знакомиться как','Meet as'):L('Опубликовать как','Post as'));
 const sub=id=>kind==='dating'?(id==='me'?L('Личная анкета. Симпатии видишь только ты','Personal profile. Only you see the likes'):authorProfile('couple')?.dating?L('Анкета пары. Симпатии и совпадения видят оба','Couple profile. Both of you see likes and matches'):L('Анкета пары выключена','Couple profile is off')):(id==='me'?L('Публикуется сразу','Published right away'):pairTrusted()?L('Публикуется сразу — вы доверяете друг другу','Published right away — you trust each other'):L('Партнёр подтвердит перед публикацией','Your partner approves before it goes out'));
 const off=id=>kind==='dating'&&id==='couple'&&!authorProfile('couple')?.dating;
 m.innerHTML=`<p class="am-t">${kind==='dating'?L('Знакомиться как','Meet as'):L('Опубликовать как','Post as')}</p>`+['me','couple'].map(id=>`<button role="menuitemradio" aria-checked="${cur_===id}" ${off(id)?'aria-disabled="true"':''} data-act="chooseAuthor" data-v="${id}" data-k="${kind}">${av(id,'sm')}<span><b>${esc(pname(id))}</b><small>${sub(id)}</small></span>${cur_===id?I.check:''}</button>`).join('');document.body.append(m);const box=a.getBoundingClientRect();m.style.left=Math.max(8,Math.min(box.left,innerWidth-288))+'px';m.style.top=Math.min(box.bottom+6,innerHeight-210)+'px';m.showPopover();syncModal();m.querySelector('[aria-checked="true"]')?.focus({preventScroll:true});a.setAttribute('aria-expanded','true');m.addEventListener('toggle',e=>{if(e.newState==='closed'&&m.isConnected&&$('#authorMenu')===m)closeAuthorMenu();});}
ACT.authorMenu=a=>openAuthorMenu(a);

