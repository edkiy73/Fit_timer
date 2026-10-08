'use strict';

const { store } = require('../../../../../packages/core/server/store');
const { send, fail, rndId, clampLine, clampText, cleanPic } = require('../../../../../packages/core/server/util');
const { getSettings, providerStatus, billingProviderStatus } = require('../../../../../packages/core/server/ai');
const { sendPushToAccountHash } = require('../../../../../packages/core/server/push');
const {
  GOALS, LEVELS, LANGS, normLocale, normalizeCatalog,
  localeMiss, programMiss, syncSourceFields
} = require('./catalog-text');
const FitExerciseV2 = require('../../fit-exercise-v2');

const ACTIONS = new Set([
  'overview','approve','reject','pro','ban','unban',
  'save_draft','publish_draft','delete_draft',
  'add','edit','remove','seed','reference_list'
]);

const clean=(v,n)=>String(v==null?'':v).slice(0,n);

// Фото упражнений: только v2 — по stable exercise.id (+ позиция plan/exercise).
// Важно: сервер не должен молча сохранять только часть набора. Админка заранее
// ужимает картинки под этот бюджет, а здесь любая потеря считается ошибкой запроса.
function picsResult(src){
  let budget=800*1024;
  const items=src&&+src.v===2&&Array.isArray(src.items)?src.items:[];
  const out=[];
  let rejected=false;
  for(let index=0;index<items.length;index++){
    const item=items[index];
    if(!item||typeof item!=='object'){rejected=true;continue;}
    if(out.length>=30){if(item.data)rejected=true;continue;}
    const val=cleanPic(item.data,budget);
    if(!val){if(item.data)rejected=true;continue;}
    out.push({
      id:clampLine(item.id,80),
      p:Math.max(0,Math.min(99,Math.round(+item.p||0))),
      i:Math.max(0,Math.min(199,Math.round(+item.i||0))),
      n:clampLine(item.n,60),
      data:val
    });
    budget-=val.length;
  }
  return {media:{v:2,items:out},rejected};
}
function pics(src){
  return picsResult(src).media;
}
function checkedCover(value){
  if(value==null||value==='')return {value:null,rejected:false};
  const cleaned=cleanPic(value,90000);
  return {value:cleaned||null,rejected:!cleaned};
}

async function readItems(listKey,want){
  const ids=(await store.list(listKey)).slice(-300);
  const raws=await store.many(ids.map(id=>`c:${id}`));
  const out=[];
  raws.forEach(raw=>{
    if(!raw)return;
    try{
      const c=JSON.parse(raw);
      if(!want||c.status===want)out.push(c);
    }catch(_){}
  });
  return out;
}

/* Готовность записи: цель, уровень, программа и языки. requireBoth — для публикации:
   каталог показывает запись и по-русски, и по-английски. */
function checkItem(it,opts){
  opts=opts||{};
  const norm=normalizeCatalog(it,opts.fallbackSource||'ru');
  const miss=[];
  if(!GOALS.includes(it.cat))miss.push('цель');
  if(!LEVELS.includes(it.level))miss.push('уровень');
  miss.push(...programMiss(norm));
  const sourceTexts=norm.locales[norm.sourceLocale]&&norm.locales[norm.sourceLocale].texts;
  const required=opts.requireBoth?LANGS:[norm.sourceLocale];
  required.forEach(lang=>miss.push(...localeMiss(norm.locales[lang],sourceTexts,lang.toUpperCase())));
  return Object.assign(norm,{miss});
}
// Что видит список админки: готовность языков, посчитанная сервером
function withReadiness(c){
  const norm=normalizeCatalog(c,c.sourceLocale||'ru');
  const sourceTexts=norm.locales[norm.sourceLocale]&&norm.locales[norm.sourceLocale].texts;
  const ready={};
  LANGS.forEach(lang=>{ready[lang]=!!norm.program&&localeMiss(norm.locales[lang],sourceTexts,'').length===0;});
  return Object.assign({},c,{ready});
}

async function overview(res){
  const [pending,drafts,approved,settings]=await Promise.all([
    readItems('c:pending','pending'),
    readItems('c:drafts','draft'),
    readItems('c:approved','approved'),
    getSettings()
  ]);
  const handles=await store.list('t:all');
  const raws=await store.many(handles.map(h=>`t:${h}`));
  const counts=await store.pipe(handles.flatMap(h=>[
    ['GET',`t:${h}:programs`],['GET',`t:${h}:opens`]
  ]));
  const trainers=[];
  raws.forEach((raw,i)=>{
    if(!raw)return;
    try{
      const t=JSON.parse(raw);
      trainers.push({
        handle:t.handle,name:t.name||'',about:t.about||'',
        years:t.years==null?null:t.years,links:t.links||'',
        since:t.since||null,seen:t.seen||null,banned:!!t.banned,
        programs:+counts[i*2]||0,opens:+counts[i*2+1]||0
      });
    }catch(_){}
  });
  send(res,200,{
    pending:pending.map(withReadiness),drafts:drafts.map(withReadiness),approved:approved.map(withReadiness),
    trainers,settings,
    // один справочник оборудования на приложение, ИИ и админку (форма генерации)
    equipment:FitExerciseV2.EQUIPMENT.filter(e=>e.id!=='custom').map(e=>({id:e.id,roles:e.roles.slice()})),
    providers:providerStatus(),
    billingProviders:billingProviderStatus()
  });
}

async function moderate(action,id,body,res){
  const raw=await store.get(`c:${id}`);
  if(!raw)return fail(res,404,'not_found');
  const c=JSON.parse(raw);
  if(action==='approve'){
    const checked=checkItem(c,{requireBoth:true,fallbackSource:c.sourceLocale||'ru'});
    if(checked.miss.length)return fail(res,400,'catalog_not_ready',{miss:checked.miss});
    syncSourceFields(c,checked);
  }
  c.status=action==='approve'?'approved':'rejected';
  if(action==='approve'&&body.pro!==undefined)c.pro=!!body.pro;
  await store.set(`c:${id}`,JSON.stringify(c));
  if(action==='approve')await store.push('c:approved',id);
  try{
    const traw=await store.get(`t:${c.by}`);
    const tr=traw?JSON.parse(traw):null;
    if(tr&&tr.mailHash){
      const araw=await store.get(`a:${tr.mailHash}`);
      const acc=araw?JSON.parse(araw):{};
      const en=acc&&acc.locale==='en';
      const ok=c.status==='approved';
      await sendPushToAccountHash(tr.mailHash,{
        category:'trainer',
        title:ok?(en?'Program approved':'Программа принята в каталог'):(en?'Catalog submission rejected':'Заявка в каталог отклонена'),
        body:ok?(en?`“${c.name}” is now published in the catalog.`:`«${c.name}» опубликована в каталоге.`):(en?`“${c.name}” did not pass moderation. Open your submissions for details.`:`«${c.name}» не прошла модерацию. Открой заявки, чтобы проверить статус.`),
        data:{stage:'catalog-status',catalogId:c.id,status:c.status,category:'trainer'}
      });
    }
  }catch(_){}
  send(res,200,{ok:true,status:c.status,pro:!!c.pro});
}

/* Правка записи поверх сохранённой. Языки сливаются по одному: прислали только EN —
   RU остаётся прежним. name/gives верхнего уровня — правка исходного языка. */
function mergeIncoming(current,incoming){
  const it=Object.assign({},current,incoming);
  const src=normLocale(incoming.sourceLocale||current.sourceLocale);
  it.locales=Object.assign({},current.locales||{},incoming.locales||{});
  if(incoming.name!==undefined||incoming.gives!==undefined){
    const block=Object.assign({},it.locales[src]||{});
    if(incoming.name!==undefined)block.name=incoming.name;
    if(incoming.gives!==undefined)block.gives=incoming.gives;
    it.locales[src]=block;
  }
  // Новая программа приносит свои тексты исходного языка: старая накладка исходника
  // не должна откатить их (например, переименование после правки через ИИ).
  const sentSourceTexts=incoming.locales&&incoming.locales[src]&&incoming.locales[src].texts!==undefined;
  if(incoming.program!==undefined&&!sentSourceTexts&&it.locales[src]){
    it.locales[src]=Object.assign({},it.locales[src]);
    delete it.locales[src].texts;
  }
  return it;
}

async function handleCatalogAdmin(action,body,res){
  if(!ACTIONS.has(action))return false;
  const id=clean(body&&body.id,20);

  if(action==='reference_list'){
    const {SEED_ITEMS}=require('../../seed');
    const approved=new Set(await store.list('c:approved'));
    const items=await Promise.all(SEED_ITEMS.map(async it=>{
      const raw=approved.has(it.id)?await store.get('c:'+it.id):null;
      let current=null;
      try{current=raw?JSON.parse(raw):null;}catch(_){}
      return {id:it.id,name:it.name||it.program&&it.program.name||it.id,
        published:!!(current&&current.status==='approved'),
        status:current&&current.status||'unpublished',
        updatedAt:current&&current.referenceUpdatedAt||null};
    }));
    send(res,200,{ok:true,items});
    return true;
  }

  if(action==='overview'){
    await overview(res);
    return true;
  }

  if(action==='approve'||action==='reject'){
    await moderate(action,id,body||{},res);
    return true;
  }

  if(action==='pro'){
    const raw=await store.get(`c:${id}`);
    if(!raw){fail(res,404,'not_found');return true;}
    const c=JSON.parse(raw);
    c.pro=!!(body&&body.pro);
    await store.set(`c:${id}`,JSON.stringify(c));
    send(res,200,{ok:true,pro:c.pro});
    return true;
  }

  if(action==='ban'||action==='unban'){
    const handle=clean(body&&body.handle,40);
    const raw=await store.get(`t:${handle}`);
    if(!raw){fail(res,404,'not_found');return true;}
    const t=JSON.parse(raw);
    t.banned=action==='ban';
    await store.set(`t:${handle}`,JSON.stringify(t));
    send(res,200,{ok:true,banned:t.banned});
    return true;
  }

  if(action==='save_draft'){
    const incoming=(body&&body.item)||{};
    let current=null;
    let draftId=id;
    if(draftId){
      const raw=await store.get('c:'+draftId);
      if(!raw){fail(res,404,'not_found');return true;}
      try{current=JSON.parse(raw);}catch(_){}
      if(!current||current.status!=='draft'){fail(res,409,'not_draft');return true;}
    }else{
      draftId='d'+rndId(7);
    }
    const merged=mergeIncoming(current||{},incoming);
    // Черновик может быть неполным: программу и языки проверит публикация.
    const norm=normalizeCatalog(merged,(current&&current.sourceLocale)||'ru');
    const coverCheck=checkedCover(merged.cover);
    const mediaCheck=picsResult(merged.media);
    if(coverCheck.rejected){fail(res,400,'cover_too_large',{miss:['обложка слишком большая или повреждена']});return true;}
    if(mediaCheck.rejected){fail(res,400,'media_too_large',{miss:['одно или несколько фото не помещаются в каталог']});return true;}
    const now=new Date().toISOString();
    const c={
      id:draftId,
      by:clampLine(merged.by,40),
      cat:GOALS.includes(merged.cat)?merged.cat:((current&&current.cat)||'tone'),
      level:LEVELS.includes(merged.level)?merged.level:((current&&current.level)||'Новичок'),
      min:Math.max(1,Math.min(180,Math.round(+merged.min||20))),
      cover:coverCheck.value,
      media:mediaCheck.media,
      pro:!!merged.pro,
      status:'draft',
      at:(current&&current.at)||now,
      updatedAt:now,
      mine:true
    };
    syncSourceFields(c,norm);
    await store.set('c:'+draftId,JSON.stringify(c));
    if(!current)await store.push('c:drafts',draftId);
    send(res,200,{ok:true,id:draftId,status:'draft',updatedAt:now});
    return true;
  }

  if(action==='publish_draft'){
    const raw=await store.get('c:'+id);
    if(!raw){fail(res,404,'not_found');return true;}
    const c=JSON.parse(raw);
    if(c.status!=='draft'){fail(res,409,'not_draft');return true;}
    const checked=checkItem(c,{requireBoth:true,fallbackSource:c.sourceLocale||'ru'});
    if(checked.miss.length){fail(res,400,'catalog_not_ready',{miss:checked.miss});return true;}
    syncSourceFields(c,checked);
    c.status='approved';
    c.pro=body&&body.pro!==undefined?!!body.pro:!!c.pro;
    c.publishedAt=new Date().toISOString();
    await store.set('c:'+id,JSON.stringify(c));
    await store.removeFromList('c:drafts',id);
    const approvedIds=await store.list('c:approved');
    if(!approvedIds.includes(id))await store.push('c:approved',id);
    send(res,200,{ok:true,id,status:'approved',pro:!!c.pro});
    return true;
  }

  if(action==='delete_draft'){
    const raw=await store.get('c:'+id);
    if(!raw){fail(res,404,'not_found');return true;}
    const c=JSON.parse(raw);
    if(c.status!=='draft'){fail(res,409,'not_draft');return true;}
    c.status='removed';
    c.removedAt=new Date().toISOString();
    await store.set('c:'+id,JSON.stringify(c));
    await store.removeFromList('c:drafts',id);
    send(res,200,{ok:true});
    return true;
  }

  if(action==='add'){
    const it=(body&&body.item)||{};
    const checked=checkItem(it,{requireBoth:true,fallbackSource:it.sourceLocale||'ru'});
    if(checked.miss.length){fail(res,400,'bad_item',{miss:checked.miss});return true;}
    const coverCheck=checkedCover(it.cover);
    const mediaCheck=picsResult(it.media);
    if(coverCheck.rejected){fail(res,400,'cover_too_large',{miss:['обложка слишком большая или повреждена']});return true;}
    if(mediaCheck.rejected){fail(res,400,'media_too_large',{miss:['одно или несколько фото не помещаются в каталог']});return true;}
    const newId='a'+rndId(7);
    const c={
      id:newId,by:clean(it.by,40),cat:it.cat,level:it.level,
      min:Math.max(1,Math.min(180,Math.round(+it.min||20))),
      cover:coverCheck.value,media:mediaCheck.media,
      pro:!!it.pro,status:'approved',at:new Date().toISOString(),mine:true
    };
    syncSourceFields(c,checked);
    await store.set(`c:${newId}`,JSON.stringify(c));
    await store.push('c:approved',newId);
    send(res,200,{ok:true,id:newId});
    return true;
  }

  if(action==='edit'){
    const raw=await store.get(`c:${id}`);
    if(!raw){fail(res,404,'not_found');return true;}
    const c=JSON.parse(raw);
    const incoming=(body&&body.item)||{};
    const it=mergeIncoming(c,incoming);
    const touchesText=['program','locales','sourceLocale','name','gives'].some(k=>incoming[k]!==undefined);
    const checked=checkItem(it,{
      requireBoth:c.status==='approved'&&touchesText,
      fallbackSource:c.sourceLocale||'ru'
    });
    // Заявку правят по частям (сначала второй язык, потом картинки): блокирует только
    // то, без чего запись не может жить, — программа и исходный язык.
    if(checked.miss.length){fail(res,400,'bad_item',{miss:checked.miss});return true;}
    if(touchesText)syncSourceFields(c,checked);
    if(it.by!=null)c.by=clampLine(it.by,40);
    ['cat','level'].forEach(k=>{if(it[k]!=null)c[k]=clean(it[k],40);});
    if(it.min!=null)c.min=Math.max(1,Math.min(180,Math.round(+it.min||20)));
    if(incoming.cover!==undefined){
      const coverCheck=checkedCover(incoming.cover);
      if(coverCheck.rejected){fail(res,400,'cover_too_large',{miss:['обложка слишком большая или повреждена']});return true;}
      c.cover=coverCheck.value;
    }
    if(it.pro!==undefined)c.pro=!!it.pro;
    if(incoming.media!==undefined){
      const mediaCheck=picsResult(incoming.media);
      if(mediaCheck.rejected){fail(res,400,'media_too_large',{miss:['одно или несколько фото не помещаются в каталог']});return true;}
      c.media=mediaCheck.media;
    }
    await store.set(`c:${id}`,JSON.stringify(c));
    send(res,200,{ok:true});
    return true;
  }

  if(action==='remove'){
    const raw=await store.get(`c:${id}`);
    if(!raw){fail(res,404,'not_found');return true;}
    const c=JSON.parse(raw);
    c.status='removed';
    await store.set(`c:${id}`,JSON.stringify(c));
    send(res,200,{ok:true});
    return true;
  }

  const { SEED_ITEMS, SEED_TRAINERS } = require('../../seed');
  const now=new Date().toISOString();
  for(const [handle,t] of Object.entries(SEED_TRAINERS)){
    if(await store.get(`t:${handle}`))continue;
    await store.push('t:all',handle);
    await store.set(`t:${handle}`,JSON.stringify(Object.assign(
      {handle,since:now,seen:now,keyHash:'',years:null,links:''},t)));
  }
  const have=new Set(await store.list('c:approved'));
  const referenceId=clean(body.referenceId,100);
  const requested=referenceId?SEED_ITEMS.filter(it=>it.id===referenceId):SEED_ITEMS;
  if(referenceId&&!requested.length){fail(res,404,'reference_not_found');return true;}
  let added=0,updated=0;
  for(const it of requested){
    const exists=have.has(it.id);
    if(exists&&!body.update)continue;
    const oldRaw=exists?await store.get(`c:${it.id}`):null;
    if(exists&&!oldRaw){fail(res,409,'reference_missing_record');return true;}
    const old=oldRaw?JSON.parse(oldRaw):null;
    // Keep media and non-program catalog metadata; replace canonical exercise content.
    // User-installed copies and their workout history are stored separately.
    const next=Object.assign({},old||{},it,{
      status:'approved',
      at:old&&old.at||now,
      cover:old&&old.cover||null,
      pics:old&&old.pics||it.pics||null,
      referenceUpdatedAt:now
    });
    await store.set(`c:${it.id}`,JSON.stringify(next));
    if(!exists){
      await store.push('c:approved',it.id);
      if(it.by)await store.incr(`t:${it.by}:programs`);
      added++;
    }else updated++;
  }
  send(res,200,{ok:true,items:requested.length,added,updated});
  return true;
}

module.exports={handleCatalogAdmin,ACTIONS,pics,checkItem,readItems};
