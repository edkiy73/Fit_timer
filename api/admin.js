/* POST /api/admin — всё управление каталогом одной дверью.

   Одна точка вместо десятка файлов: действий много, но все они об одном и том же
   и все требуют одного и того же ключа. Разносить их по файлам — значит повторить
   проверку ключа десять раз и десять раз ошибиться в ней по-разному.

   Ключ — ADMIN_KEY в переменных окружения, передаётся заголовком, а не в адресе:
   адрес попадает в историю браузера и в журналы, заголовок — нет. */

const { store } = require('../lib/store');
const { send, fail, readBody, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic } = require('../lib/util');
const { getSettings, sanitizeSettings, providerStatus, billingProviderStatus, generate } = require('../lib/ai');
const FitAIProtocol = require('../lib/ai-protocol');
const { handleAI } = require('../lib/ai-endpoint');
const { sendPushToAccountHash, notificationPrefs } = require('../lib/push');
const { sendMail } = require('../lib/mail');
const crypto = require('crypto');

const GOALS = ['slim', 'tone', 'glut', 'core', 'power', 'relief', 'flex', 'back', 'post', 'cardio'];
const LEVELS = ['Новичок', 'Средний', 'Продвинутый'];
const clean = (v, n) => String(v == null ? '' : v).slice(0, n);
const escMail = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const LANGS = ['ru', 'en'];
const normLocale = v => LANGS.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : 'ru';
const ACCOUNT_EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const accountMail = v => String(v || '').trim().toLowerCase().slice(0,120);
const accountHash = email => crypto.createHash('sha256').update(String(email)).digest('hex').slice(0,32);
const codeHash = code => crypto.createHash('sha256').update(String(code)).digest('hex');
const adminDigits = n => {
  const b = crypto.randomBytes(n);
  let out = '';
  for(let i=0;i<n;i++) out += String(b[i] % 10);
  return out;
};
async function indexAccount(mh){
  if(!(await store.get(`a:indexed:${mh}`))){
    await store.set(`a:indexed:${mh}`, '1');
    await store.push('a:all', mh);
  }
}
async function ensureAccountIndex(){
  if(await store.get('a:index:backfill:v1')) return 0;
  // Старые аккаунты появились до общего индекса a:all. Ищем только ключи
  // точного формата a:<32 hex>, чтобы не захватить a:indexed:* и служебные записи.
  const keys = await store.scan('a:????????????????????????????????');
  const ids = [...new Set(keys.map(k => {
    const m = String(k).match(/^a:([a-f0-9]{32})$/);
    return m ? m[1] : '';
  }).filter(Boolean))];
  const have = new Set((await store.list('a:all')).filter(x => /^[a-f0-9]{32}$/.test(String(x))));
  const missing = ids.filter(mh => !have.has(mh));
  const commands = [];
  ids.forEach(mh => commands.push(['SET', `a:indexed:${mh}`, '1', 'EX', String(365 * 24 * 3600)]));
  missing.forEach(mh => commands.push(['RPUSH', 'a:all', mh]));
  if(ids.length) commands.push(['EXPIRE', 'a:all', String(365 * 24 * 3600)]);
  if(commands.length) await store.pipe(commands);
  // Маркер ставим только после успешного прохода, чтобы ошибка Redis не
  // превратила частичную миграцию в «готово».
  await store.set('a:index:backfill:v1', new Date().toISOString(), 10 * 365 * 24 * 3600);
  return missing.length;
}
async function adminUsers(){
  await ensureAccountIndex();
  const ids=[...new Set((await store.list('a:all')).filter(x=>/^[a-f0-9]{32}$/.test(String(x))))].slice(-1000);
  const now=new Date();
  const month=now.toISOString().slice(0,7);
  const [year,mon]=month.split('-').map(Number);
  const periodStart=`${month}-01`;
  const periodEnd=new Date(Date.UTC(year,mon,0)).toISOString().slice(0,10);
  const settings=await getSettings();
  const limits=settings.limits||{};
  const [raws, usage] = await Promise.all([
    store.many(ids.map(mh=>`a:${mh}`)),
    store.many(ids.flatMap(mh=>[
      `ai:use:${month}:${mh}:heavy`,
      `ai:use:${month}:${mh}:light`,
      `ai:use:${month}:${mh}:image`
    ]))
  ]);
  const out=[];
  raws.forEach((raw,i)=>{
    if(!raw) return;
    try{
      const a=JSON.parse(raw), sub=a.sub||null;
      out.push({
        id:ids[i], email:a.email||'', handle:a.handle||'', locale:a.locale||'ru',
        since:a.since||null, seen:a.seen||null,
        premium:!!(sub && (Date.parse(sub.until)||0)>Date.now()),
        sub:sub?{
          plan:String(sub.plan||''), until:sub.until||null, since:sub.since||null,
          provider:String(sub.provider||sub.source||''), autoRenew:!!sub.autoRenew
        }:null,
        devices:Object.keys(a.syncDevices||{}).length,
        pushDevices:Object.keys(a.pushDevices||{}).length,
        aiUsage:{
          month, periodStart, periodEnd,
          programs:+usage[i*3]||0,
          exercises:+usage[i*3+1]||0,
          images:+usage[i*3+2]||0,
          limits:{
            programs:+limits.heavy||0,
            exercises:+limits.light||0,
            images:+limits.image||0
          }
        }
      });
    }catch(_){}
  });
  return out.sort((x,y)=>String(y.seen||y.since||'').localeCompare(String(x.seen||x.since||'')));
}

function cleanLocaleBlock(v){
  if(!v || typeof v !== 'object') return null;
  return {
    name: clampLine(v.name, 60),
    gives: clampText(v.gives, 300),
    text: clean(v.text, 60000)
  };
}
function normalizeCatalogText(it, fallbackSource){
  const sourceLocale = normLocale((it && it.sourceLocale) || fallbackSource);
  const locales = {};
  const src = (it && it.locales && typeof it.locales === 'object') ? it.locales : {};
  LANGS.forEach(lang => {
    const block = cleanLocaleBlock(src[lang]);
    if(block && (block.name || block.gives || block.text)) locales[lang] = block;
  });
  const otherLocale = sourceLocale === 'ru' ? 'en' : 'ru';
  if(locales[sourceLocale] && locales[otherLocale]){
    locales[otherLocale] = normalizeTranslatedBlock(locales[sourceLocale], locales[otherLocale]);
  }
  // Совместимость со старыми записями и заявками: верхний уровень — оригинал.
  if(!locales[sourceLocale] && it && (it.name || it.gives || it.text)){
    locales[sourceLocale] = cleanLocaleBlock({name:it.name, gives:it.gives, text:it.text});
  }
  return {sourceLocale, locales};
}
function localeMiss(block, label){
  const miss = [];
  if(!block || clean(block.name, 60).trim().length < 3) miss.push(label + ': название');
  if(!block || clean(block.gives, 300).trim().length < 20) miss.push(label + ': что даёт');
  if(!block || clean(block.text, 60000).length < 60) miss.push(label + ': текст программы');
  return miss;
}
const TRANSLATABLE_KEYS = new Set([
  'ПРОГРАММА','ОПИСАНИЕ ПРОГРАММЫ','УПРАЖНЕНИЕ','ОПИСАНИЕ',
  'ОШИБКИ','ЗАМЕНА','ОПИСАНИЕ ЗАМЕНЫ'
]);

function protocolLine(line){
  const m=String(line||'').match(/^([А-ЯЁ][А-ЯЁ ]{1,40}):\s*(.*)$/);
  return m?{key:m[1],value:m[2]}:null;
}
function translationFieldsFromText(text){
  const out={programName:'',programDescription:'',exercises:[]};
  let ex=null;
  String(text||'').split(/\r?\n/).forEach(line=>{
    const p=protocolLine(line);if(!p)return;
    if(p.key==='ПРОГРАММА'){out.programName=p.value;return;}
    if(p.key==='ОПИСАНИЕ ПРОГРАММЫ'){out.programDescription=p.value;return;}
    if(p.key==='УПРАЖНЕНИЕ'){
      ex={index:out.exercises.length,name:p.value,description:'',mistakes:'',replacementName:'',replacementDescription:''};
      out.exercises.push(ex);return;
    }
    if(!ex)return;
    if(p.key==='ОПИСАНИЕ')ex.description=p.value;
    else if(p.key==='ОШИБКИ')ex.mistakes=p.value;
    else if(p.key==='ЗАМЕНА')ex.replacementName=p.value;
    else if(p.key==='ОПИСАНИЕ ЗАМЕНЫ')ex.replacementDescription=p.value;
  });
  return out;
}
function applyTranslationFields(sourceText, translated){
  const src=translationFieldsFromText(sourceText);
  const list=Array.isArray(translated&&translated.exercises)?translated.exercises:[];
  const byIndex=new Map(list.map((x,i)=>{x=x&&typeof x==='object'?x:{};return [Number.isInteger(+x.index)?+x.index:i,x];}));
  let exIndex=-1;
  return String(sourceText||'').split(/\r?\n/).map(line=>{
    const p=protocolLine(line);if(!p)return line;
    if(p.key==='ПРОГРАММА'){
      const v=String((translated&&translated.programName)||'').trim();
      return v?'ПРОГРАММА: '+v:line;
    }
    if(p.key==='ОПИСАНИЕ ПРОГРАММЫ'){
      const v=String((translated&&translated.programDescription)||'').trim();
      return v?'ОПИСАНИЕ ПРОГРАММЫ: '+v:line;
    }
    if(p.key==='УПРАЖНЕНИЕ')exIndex++;
    const x=byIndex.get(exIndex)||{};
    const map={
      'УПРАЖНЕНИЕ':'name',
      'ОПИСАНИЕ':'description',
      'ОШИБКИ':'mistakes',
      'ЗАМЕНА':'replacementName',
      'ОПИСАНИЕ ЗАМЕНЫ':'replacementDescription'
    };
    const field=map[p.key];
    if(!field)return line;
    const v=String(x[field]||'').trim();
    return v?p.key+': '+v:line;
  }).join('\n');
}
function translationPayload(source){
  const fields=translationFieldsFromText(source&&source.text);
  return {
    name:String(source&&source.name||''),
    gives:String(source&&source.gives||''),
    programName:fields.programName,
    programDescription:fields.programDescription,
    exercises:fields.exercises
  };
}
function translationPayloadComplete(source,payload){
  if(!payload||!String(payload.name||'').trim()||!String(payload.gives||'').trim())return false;
  const src=translationPayload(source);
  if(src.programName&&!String(payload.programName||'').trim())return false;
  if(src.programDescription&&!String(payload.programDescription||'').trim())return false;
  const list=Array.isArray(payload.exercises)?payload.exercises:[];
  if(list.length!==src.exercises.length)return false;
  for(let i=0;i<src.exercises.length;i++){
    const a=src.exercises[i],b=list.find(x=>x&&+x.index===i)||list[i]||{};
    for(const k of ['name','description','mistakes','replacementName','replacementDescription']){
      if(a[k]&&!String(b[k]||'').trim())return false;
    }
  }
  return true;
}
function normalizeTranslatedBlock(source,target){
  if(!source||!target)return target;
  const fields=translationFieldsFromText(target.text);
  return {
    name:clampLine(target.name,60),
    gives:clampText(target.gives,300),
    text:applyTranslationFields(source.text,fields)
  };
}
function protocolShape(text){
  return String(text||'').split(/\r?\n/).map(line=>{
    const p=protocolLine(line);if(!p)return '';
    return p.key+':'+(TRANSLATABLE_KEYS.has(p.key)?'<text>':p.value.trim());
  }).filter(Boolean);
}

function syncSourceFields(c, norm){
  const src = norm.locales[norm.sourceLocale] || norm.locales.ru || norm.locales.en;
  c.sourceLocale = norm.sourceLocale;
  c.locales = norm.locales;
  if(src){
    c.name = src.name;
    c.gives = src.gives;
    c.text = src.text;
  }
}

// Карта «название упражнения → картинка». Режем и по числу, и по общему весу:
// запись в хранилище не резиновая, а тридцать фото — это уже не программа.
function pics(src){
  const out = {};
  let budget = 800 * 1024;
  for(const [k, v] of Object.entries((src && typeof src === 'object') ? src : {})){
    // Проверяем ФОРМУ: картинка уедет в атрибут <img src> у каждого, кто откроет
    // страницу программы, и «начинается на data:image/» этого не гарантирует.
    const key = clampLine(k, 60), val = cleanPic(v, budget);
    if(!key || !val) continue;
    out[key] = val;
    budget -= val.length;
    if(Object.keys(out).length >= 30) break;
  }
  return out;
}

async function readItems(listKey, want){
  const ids = (await store.list(listKey)).slice(-300);
  const raws = await store.many(ids.map(id => `c:${id}`));
  const out = [];
  raws.forEach(raw => {
    if(!raw) return;
    try{
      const c = JSON.parse(raw);
      if(!want || c.status === want) out.push(c);
    }catch(e){}
  });
  return out;
}

// Метаданные общие для обоих языков, текст — отдельный. В каталог публикуем
// только запись, у которой готовы RU и EN и не разъехалась машинная структура.
function checkItem(it, opts){
  opts = opts || {};
  const norm = normalizeCatalogText(it, opts.fallbackSource || 'ru');
  const miss = [];
  if(!GOALS.includes(it.cat)) miss.push('цель');
  if(!LEVELS.includes(it.level)) miss.push('уровень');
  const required = opts.requireBoth ? LANGS : [norm.sourceLocale];
  required.forEach(lang => miss.push(...localeMiss(norm.locales[lang], lang.toUpperCase())));
  const bothReady = LANGS.every(lang => localeMiss(norm.locales[lang], lang.toUpperCase()).length === 0);
  if(bothReady){
    const ruShape = protocolShape(norm.locales.ru.text);
    const enShape = protocolShape(norm.locales.en.text);
    if(!ruShape.length || JSON.stringify(ruShape) !== JSON.stringify(enShape)){
      miss.push('RU/EN: структура программы должна совпадать');
    }
  }
  return {miss, sourceLocale:norm.sourceLocale, locales:norm.locales};
}

module.exports = async (req, res) => {
  if(req.query && (req.query.ai_endpoint === '1' || req.query.public_config === '1')) return handleAI(req, res);
  if(cors(req, res)) return;
  if(req.method !== 'POST') return fail(res, 405, 'method_not_allowed');
  if(!store.configured()) return fail(res, 503, 'no_store');

  const admin = process.env.ADMIN_KEY || '';
  if(!admin) return fail(res, 503, 'no_admin_key');
  // Заголовок приходит закодированным — в него можно положить только ASCII,
  // а ключ бывает любым. Кривую кодировку считаем неверным ключом, а не падаем.
  let given = String(req.headers['x-admin-key'] || '');
  try{ given = decodeURIComponent(given); }catch(e){ return fail(res, 403, 'bad_key'); }
  if(!sameSecret(given, admin)) return fail(res, 403, 'bad_key');

  let body;
  try{ body = await readBody(req); }catch(e){ return fail(res, 413, 'too_large'); }
  const a = (body && body.action) || '';
  const id = clean(body && body.id, 20);

  /* ---- что происходит в каталоге ---- */
  if(a === 'overview'){
    const [pending, approved, settings] = await Promise.all([
      readItems('c:pending', 'pending'),
      readItems('c:approved', 'approved'),
      getSettings()
    ]);
    // Тренеры: те, кто хоть раз отметился. Список ников лежит отдельно, потому что
    // пройти по всем ключам базы нельзя — и не нужно.
    const handles = await store.list('t:all');
    const raws = await store.many(handles.map(h => `t:${h}`));
    const counts = await store.pipe(handles.flatMap(h => [
      ['GET', `t:${h}:programs`], ['GET', `t:${h}:opens`]
    ]));
    const trainers = [];
    raws.forEach((raw, i) => {
      if(!raw) return;
      try{
        const t = JSON.parse(raw);
        trainers.push({handle: t.handle, name: t.name || '', about: t.about || '',
                       years: t.years == null ? null : t.years, links: t.links || '',
                       since: t.since || null, seen: t.seen || null, banned: !!t.banned,
                       programs: +counts[i * 2] || 0, opens: +counts[i * 2 + 1] || 0});
      }catch(e){}
    });
    return send(res, 200, {pending, approved, trainers, settings, providers:providerStatus(), billingProviders:billingProviderStatus()});
  }

  /* ---- пользователи / ручной Premium / тестовый вход ---- */
  if(a === 'users_list'){
    return send(res,200,{ok:true,users:await adminUsers()});
  }

  if(a === 'user_ai_reset'){
    const email=accountMail(body&&body.email);
    if(!ACCOUNT_EMAIL.test(email)) return fail(res,400,'bad_email');
    const mh=accountHash(email);
    if(!(await store.get(`a:${mh}`))) return fail(res,404,'account_not_found');
    const month=new Date().toISOString().slice(0,7);
    await Promise.all([
      store.del(`ai:use:${month}:${mh}:heavy`),
      store.del(`ai:use:${month}:${mh}:light`),
      store.del(`ai:use:${month}:${mh}:image`)
    ]);
    return send(res,200,{ok:true,email,month});
  }

  if(a === 'user_create'){
    const email=accountMail(body&&body.email);
    if(!ACCOUNT_EMAIL.test(email)) return fail(res,400,'bad_email');
    const mh=accountHash(email);
    let acc=null;
    try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
    if(!acc){
      const now=new Date().toISOString();
      acc={email,since:now,seen:now,handle:'',sub:null,locale:(body&&body.locale)==='en'?'en':'ru'};
      await store.set(`a:${mh}`,JSON.stringify(acc));
    }
    await indexAccount(mh);
    return send(res,200,{ok:true,created:true,email});
  }

  if(a === 'user_premium'){
    const email=accountMail(body&&body.email);
    if(!ACCOUNT_EMAIL.test(email)) return fail(res,400,'bad_email');
    const mh=accountHash(email);
    let acc=null;
    try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
    if(!acc) return fail(res,404,'account_not_found');
    const revoke=!!(body&&body.revoke);
    if(revoke){
      acc.sub=null;
    }else{
      const days=Math.max(1,Math.min(3650,Math.round(+body.days||30)));
      const now=new Date(), until=new Date(now.getTime()+days*86400000);
      acc.sub={
        plan:days>=300?'year':'month',
        since:now.toISOString().slice(0,10),
        until:until.toISOString().slice(0,10),
        currency:'ADMIN',price:0,autoRenew:false,
        provider:'admin',source:'admin',grantedAt:now.toISOString()
      };
    }
    acc.seen=acc.seen||new Date().toISOString();
    await store.set(`a:${mh}`,JSON.stringify(acc));
    await indexAccount(mh);
    return send(res,200,{ok:true,email,sub:acc.sub||null});
  }

  if(a === 'user_test_code'){
    const email=accountMail(body&&body.email);
    if(!ACCOUNT_EMAIL.test(email)) return fail(res,400,'bad_email');
    const mh=accountHash(email);
    const raw=await store.get(`a:${mh}`);
    if(!raw) return fail(res,404,'account_not_found');
    const code=adminDigits(6);
    await store.set(`mail:${mh}`,JSON.stringify({
      h:codeHash(code),tries:0,at:Date.now(),source:'admin_test'
    }),15*60);
    return send(res,200,{ok:true,email,code,expiresMinutes:15});
  }

  /* ---- новости и предложения ----
     Один запрос обрабатывает маленькую пачку: serverless-функция живёт недолго,
     поэтому админка продолжает курсором, пока список не закончится. */  
  if(a === 'campaign_send'){
    await ensureAccountIndex();
    const kind = body && body.kind === 'offers' ? 'offers' : 'news';
    const wantPush = !!(body && body.push);
    const wantEmail = !!(body && body.email);
    if(!wantPush && !wantEmail) return fail(res,400,'no_channel');
    const copy = (body && body.copy) || {};
    const cleanCopy = lang => ({
      title: clampLine(copy[lang] && copy[lang].title, 100),
      body: clampText(copy[lang] && copy[lang].body, 1000)
    });
    const texts = {ru:cleanCopy('ru'), en:cleanCopy('en')};
    if(!texts.ru.title || !texts.ru.body || !texts.en.title || !texts.en.body) return fail(res,400,'campaign_copy_required');

    const unique = [...new Set((await store.list('a:all')).filter(x=>/^[a-f0-9]{32}$/.test(String(x))))];
    const cursor = Math.max(0, Math.min(unique.length, +body.cursor || 0));
    const batch = unique.slice(cursor, cursor + 8);
    let pushSent=0,emailSent=0,skipped=0,failed=0;
    for(const mh of batch){
      let acc=null; try{acc=JSON.parse(await store.get(`a:${mh}`));}catch(_){}
      if(!acc || !acc.email){skipped++;continue;}
      const prefs=await notificationPrefs(mh);
      const locale=acc.locale==='en'?'en':'ru', msg=texts[locale];
      // Общий 14-дневный cooldown именно для предложений. Новости этим лимитом
      // не блокируем, но один и тот же запуск всё равно доставляем только в один канал.
      if(kind==='offers'){
        const last=Date.parse(await store.get(`campaign:last:offers:${mh}`)||'')||0;
        if(Date.now()-last < 14*86400000){skipped++;continue;}
      }
      let delivered=false;
      if(wantPush && prefs.offers !== false){
        try{
          const r=await sendPushToAccountHash(mh,{category:'offers',title:msg.title,body:msg.body,
            data:{stage:'campaign',kind,category:'offers'}});
          if(r&&r.sent>0){pushSent+=r.sent;delivered=true;}
        }catch(_){failed++;}
      }
      const emailPref = kind==='offers' ? prefs.emailOffers === true : prefs.emailNews === true;
      if(!delivered && wantEmail && emailPref){
        try{
          const text=msg.body+'\n\nFit Timer';
          const html=`<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1B1630"><h2 style="font-size:22px">${escMail(msg.title)}</h2><p>${escMail(msg.body).replace(/\n/g,'<br>')}</p><p style="color:#6C6785;font-size:13px">Настройки рассылок можно изменить в Fit Timer → Аккаунт → Уведомления.</p></div>`;
          await sendMail({to:acc.email,subject:msg.title,text,html});
          emailSent++;delivered=true;
        }catch(_){failed++;}
      }
      if(delivered && kind==='offers') await store.set(`campaign:last:offers:${mh}`,new Date().toISOString(),30*24*3600);
      if(!delivered) skipped++;
    }
    const next=cursor+batch.length;
    return send(res,200,{ok:true,cursor:next,done:next>=unique.length,total:unique.length,pushSent,emailSent,skipped,failed});
  }

  /* ---- ИИ, тариф и платёжные идентификаторы ----
     Секретных ключей здесь нет: они остаются в окружении сервера. Админка меняет
     только маршрутизацию, модели, лимиты и отображаемую цену. */
  if(a === 'save_settings'){
    const settings = sanitizeSettings(body && body.settings);
    await store.set('settings:ai', JSON.stringify(settings));
    return send(res, 200, {ok:true, settings});
  }

  if(a === 'test_ai'){
    const type = body && body.type === 'image' ? 'image' : 'text';
    const settings = await getSettings();
    try{
      const out = await generate(type, settings, type === 'image'
        ? 'Minimal flat fitness app icon, violet on dark background, no text'
        : 'Ответь ровно одним словом: работает');
      return send(res, 200, {ok:true, provider:out.provider, model:out.model,
        fallback:out.fallback, result:type === 'text' ? out.text.slice(0,100) : 'image'});
    }catch(e){
      return fail(res, 502, 'ai_test_failed', {detail:String(e.message || e).slice(0,500)});
    }
  }

  /* ---- перевод каталога по запросу модератора ----
     Никаких автоматических переводов при отправке: тратим ИИ только на заявку,
     которую действительно решили готовить к публикации. Ручной ввод в админке
     остаётся полноценным запасным путём. */
  if(a === 'translate_catalog'){
    const from=normLocale(body&&body.from);
    const to=normLocale(body&&body.to);
    if(from===to)return fail(res,400,'same_locale');
    const source=cleanLocaleBlock(body&&body.locale);
    const bad=localeMiss(source,from.toUpperCase());
    if(bad.length)return fail(res,400,'bad_source_locale',{miss:bad});
    const names={ru:'Russian',en:'English'};
    const sourceFields=translationPayload(source);
    const prompt=[
      'Translate the user-visible fitness text from '+names[from]+' to '+names[to]+'.',
      'Return ONLY valid JSON with exactly these top-level keys: name, gives, programName, programDescription, exercises. No Markdown.',
      'Each exercises item MUST contain exactly: index, name, description, mistakes, replacementName, replacementDescription.',
      'Keep every exercise index and array order unchanged.',
      'Translate ONLY human-readable prose and names. Do not translate or invent machine fields, muscles, weekdays, numbers, weights, reps, rest, format tokens, booleans, progression settings or workout mechanics.',
      'If a source string is empty, return an empty string for that field.',
      'Do not summarize, improve, reinterpret or rewrite the workout. Translate meaning faithfully.',
      'SOURCE JSON:',
      JSON.stringify(sourceFields)
    ].join('\n');
    try{
      const settings=await getSettings();
      const out=await generate('text',settings,prompt);
      const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
      let parsed;
      try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'translation_bad_json');}
      if(!translationPayloadComplete(source,parsed))return fail(res,502,'translation_incomplete');
      const locale={
        name:clampLine(parsed.name,60),
        gives:clampText(parsed.gives,300),
        text:applyTranslationFields(source.text,parsed)
      };
      const miss=localeMiss(locale,to.toUpperCase());
      if(miss.length)return fail(res,502,'translation_incomplete',{miss});
      if(JSON.stringify(protocolShape(source.text))!==JSON.stringify(protocolShape(locale.text))){
        return fail(res,502,'translation_changed_structure');
      }
      return send(res,200,{ok:true,locale,provider:out.provider,model:out.model,fallback:out.fallback});
    }catch(e){
      return fail(res,502,'translation_failed',{detail:String(e.message||e).slice(0,500)});
    }
  }

  function exerciseBlockRange(text, exerciseName){
    const lines=String(text||'').split(/\r?\n/);
    const target=String(exerciseName||'').trim().toLowerCase();
    let start=-1,end=lines.length;
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^УПРАЖНЕНИЕ:\s*(.*)$/i);
      if(!m) continue;
      if(start<0 && m[1].trim().toLowerCase()===target){ start=i; continue; }
      if(start>=0){ end=i; break; }
    }
    return {lines,start,end};
  }
  const EXERCISE_OPTIONAL_LABELS=new Set(FitAIProtocol.OPTIONAL_EXERCISE_LABELS);
  function replaceExerciseBlock(text, exerciseName, candidate){
    const src=exerciseBlockRange(text,exerciseName);
    if(src.start<0) return text;
    const sourceLines=src.lines.slice(src.start,src.end);
    const candidateLines=String(candidate||'').split(/\r?\n/);
    const candidateByKey={};
    candidateLines.forEach(line=>{
      const p=protocolLine(line);
      if(!p) return;
      if(!candidateByKey[p.key]) candidateByKey[p.key]=[];
      candidateByKey[p.key].push(p.value);
    });

    const used={};
    const existingKeys=new Set();
    const merged=sourceLines.map(line=>{
      const p=protocolLine(line);
      if(!p) return line;
      existingKeys.add(p.key);
      const idx=used[p.key]||0;
      used[p.key]=idx+1;
      const vals=candidateByKey[p.key]||[];
      if(idx>=vals.length) return line;
      return p.key+': '+String(vals[idx]||'').trim();
    });

    // Для редактирования упражнения разрешаем ДОБАВИТЬ только официальные
    // optional-поля парсера. Это позволяет превратить упражнение без веса в
    // «повторения и вес», задать 8 кг, шаг/потолок и т.п., но не даёт модели
    // изобретать новые служебные labels.
    candidateLines.forEach(line=>{
      const p=protocolLine(line);
      if(!p || existingKeys.has(p.key) || !EXERCISE_OPTIONAL_LABELS.has(p.key)) return;
      merged.push(p.key+': '+String(p.value||'').trim());
      existingKeys.add(p.key);
    });

    return src.lines.slice(0,src.start).concat(merged,src.lines.slice(src.end)).join('\n');
  }
  function structureChangeRequested(text){
    const s=String(text||'').toLowerCase();
    return /(?:добав\w*|убер\w*|удал\w*|замен\w*|перестав\w*|перенес\w*)\s+(?:нов\w+\s+)?(?:упражнен\w*|день\w*|вариант\w*|трениров\w*)/i.test(s)
      || /(?:add|remove|delete|replace|reorder|move)\s+(?:a\s+|an\s+|the\s+|new\s+)?(?:exercise|day|variant|workout)/i.test(s);
  }
  function programExerciseBlocks(text){
    const lines=String(text||'').split(/\r?\n/),out=[];
    for(let i=0;i<lines.length;i++){
      if(!/^УПРАЖНЕНИЕ:\s*/i.test(lines[i]))continue;
      let end=i+1;
      while(end<lines.length&&!/^УПРАЖНЕНИЕ:\s*/i.test(lines[end])&&!/^ДЕНЬ:\s*/i.test(lines[end]))end++;
      out.push({start:i,end,lines:lines.slice(i,end)});
      i=end-1;
    }
    return out;
  }
  function mergeProgramEditText(sourceText,candidateText){
    const srcLines=String(sourceText||'').split(/\r?\n/);
    const candLines=String(candidateText||'').split(/\r?\n/);
    const srcBlocks=programExerciseBlocks(sourceText),candBlocks=programExerciseBlocks(candidateText);
    const candExerciseLines=new Set();
    candBlocks.forEach(b=>{for(let i=b.start;i<b.end;i++)candExerciseLines.add(i);});
    const vals={};
    candLines.forEach((line,i)=>{
      if(candExerciseLines.has(i))return;
      const p=protocolLine(line);if(!p)return;
      if(!vals[p.key])vals[p.key]=[];
      vals[p.key].push(p.value);
    });
    const used={},blockMap=new Map(srcBlocks.map((b,i)=>[b.start,{b,i}])),out=[];
    for(let i=0;i<srcLines.length;i++){
      const entry=blockMap.get(i);
      if(entry){
        const cb=candBlocks[entry.i];
        const sourceBlock=entry.b.lines.join('\n');
        const candidateBlock=cb?cb.lines.join('\n'):'';
        const tempName=(protocolLine(entry.b.lines[0])||{}).value||'';
        const wrapped='УПРАЖНЕНИЕ: '+tempName+'\n'+entry.b.lines.slice(1).join('\n');
        // same merger, addressed by the source exercise name
        out.push(...replaceExerciseBlock(wrapped,tempName,candidateBlock).split('\n'));
        i=entry.b.end-1;
        continue;
      }
      const p=protocolLine(srcLines[i]);
      if(!p){out.push(srcLines[i]);continue;}
      const idx=used[p.key]||0;used[p.key]=idx+1;
      const arr=vals[p.key]||[];
      out.push(idx<arr.length?p.key+': '+String(arr[idx]||'').trim():srcLines[i]);
    }
    return out.join('\n');
  }

  if(a === 'catalog_ai_edit'){
    const mode=String(body&&body.mode||'program');
    if(!['program','exercise'].includes(mode))return fail(res,400,'bad_ai_mode');
    const locale=cleanLocaleBlock(body&&body.locale);
    const bad=localeMiss(locale,'AI');
    if(bad.length)return fail(res,400,'bad_source_locale',{miss:bad});
    const instruction=clean(body&&body.instruction,2000).trim();
    if(!instruction)return fail(res,400,'missing_instruction');
    const exercise=clampLine(body&&body.exercise,120);
    const language=/[а-яё]/i.test(locale.name+' '+locale.gives)?'Russian':'English';

    try{
      const settings=await getSettings();

      if(mode==='exercise'){
        const range=exerciseBlockRange(locale.text,exercise);
        if(range.start<0)return fail(res,404,'exercise_not_found');
        const sourceBlock=range.lines.slice(range.start,range.end).join('\n');
        const prompt=[
          'Edit exactly ONE Fit Timer exercise according to the instruction.',
          'Return ONLY valid JSON: {"block":"..."}. No Markdown.',
          FitAIProtocol.machineLanguageRules(language),
          FitAIProtocol.exerciseSchema(language),
          FitAIProtocol.progressionRules(),
          FitAIProtocol.editRules(false),
          'Instruction: '+instruction,
          '=== CURRENT EXERCISE ===\n'+sourceBlock
        ].join('\n\n');
        const out=await generate('text',settings,prompt);
        const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
        let parsed;
        try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'ai_bad_json');}
        const block=String(parsed.block||'').trim();
        if(!block)return fail(res,502,'ai_incomplete');
        const text=replaceExerciseBlock(locale.text,exercise,block);
        const edited={name:locale.name,gives:locale.gives,text};
        return send(res,200,{ok:true,locale:edited,provider:out.provider,model:out.model,fallback:out.fallback});
      }

      const structural=structureChangeRequested(instruction);
      const prompt=[
        'Edit this Fit Timer catalog program according to the instruction.',
        'Return ONLY valid JSON with exactly the keys name, gives, text. No Markdown.',
        FitAIProtocol.machineLanguageRules(language),
        FitAIProtocol.programSchema(language),
        FitAIProtocol.progressionRules(),
        FitAIProtocol.editRules(structural),
        'Instruction: '+instruction,
        'PROGRAM JSON:',
        JSON.stringify(locale)
      ].join('\n\n');
      const out=await generate('text',settings,prompt);
      const raw=String(out.text||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
      let parsed;
      try{parsed=JSON.parse(raw);}catch(_){return fail(res,502,'ai_bad_json');}
      const rawEdited=cleanLocaleBlock(parsed);
      const miss=localeMiss(rawEdited,'AI');
      if(miss.length)return fail(res,502,'ai_incomplete',{miss});
      const edited={
        name:rawEdited.name,
        gives:rawEdited.gives,
        text:structural?rawEdited.text:mergeProgramEditText(locale.text,rawEdited.text)
      };
      return send(res,200,{ok:true,locale:edited,provider:out.provider,model:out.model,fallback:out.fallback});
    }catch(e){
      return fail(res,502,'ai_edit_failed',{detail:String(e.message||e).slice(0,500)});
    }
  }

  if(a === 'catalog_ai_image'){
    const kind=String(body&&body.kind||'exercise');
    if(!['cover','exercise'].includes(kind)) return fail(res,400,'bad_image_kind');
    const name=clampLine(body&&body.name,120);
    const description=clean(body&&body.description,1000);
    const program=clampLine(body&&body.program,120);
    const gender=body&&body.gender==='m'?'man':'woman';
    const style=[
      'Style: a stylized realistic 3D illustration of a human body.',
      'Use muted gray tones for the body and a warm orange glow for the working muscles.',
      'Show movement direction with clean white arrows when useful.',
      'Use a clean, slightly blurred neutral or gym background.',
      'Character: '+gender+'.',
      'Keep the SAME visual language across the whole program image set.',
      'No text, logos, captions, UI, collage, or watermarks inside the image.'
    ].join(' ');
    const prompt = kind==='cover'
      ? 'Create a square 1:1 cover image for the fitness-program card "'+program+'". '+style+' Show the overall theme of the program rather than one specific exercise.'
      : 'Create a 4:3 exercise illustration for "'+name+'" in a fitness app. '+style+
        (description?' Technique context: '+description+'.':'')+
        ' Show the most characteristic phase of the movement and anatomically plausible exercise technique.';
    try{
      const settings=await getSettings();
      const out=await generate('image',settings,prompt,{aspectRatio:kind==='cover'?'1:1':'4:3'});
      if(!out.image) return fail(res,502,'image_not_returned');
      return send(res,200,{ok:true,image:out.image,provider:out.provider,model:out.model,fallback:out.fallback});
    }catch(e){
      return fail(res,502,'image_generation_failed',{detail:String(e.message||e).slice(0,500)});
    }
  }

  /* ---- решение по заявке ---- */
  if(a === 'approve' || a === 'reject'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    if(a === 'approve'){
      const checked = checkItem(c, {requireBoth:true, fallbackSource:c.sourceLocale || 'ru'});
      if(checked.miss.length) return fail(res, 400, 'catalog_not_ready', {miss:checked.miss});
      syncSourceFields(c, checked);
    }
    c.status = a === 'approve' ? 'approved' : 'rejected';
    /* Доступ решается ЗДЕСЬ, а не тренером в заявке: «премиум» — это про то, что
       мы продаём, и отдавать этот рычаг тому, кто программу прислал, значит
       получить премиум-каталог из всего, что прислали. */
    if(a === 'approve' && body.pro !== undefined) c.pro = !!body.pro;
    await store.set(`c:${id}`, JSON.stringify(c));
    if(a === 'approve') await store.push('c:approved', id);
    try{
      const traw=await store.get(`t:${c.by}`),tr=traw?JSON.parse(traw):null;
      if(tr&&tr.mailHash){
        const araw=await store.get(`a:${tr.mailHash}`),acc=araw?JSON.parse(araw):{},en=acc&&acc.locale==='en',ok=c.status==='approved';
        await sendPushToAccountHash(tr.mailHash,{category:'trainer',
          title:ok?(en?'Program approved':'Программа принята в каталог'):(en?'Catalog submission rejected':'Заявка в каталог отклонена'),
          body:ok?(en?`“${c.name}” is now published in the catalog.`:`«${c.name}» опубликована в каталоге.`):(en?`“${c.name}” did not pass moderation. Open your submissions for details.`:`«${c.name}» не прошла модерацию. Открой заявки, чтобы проверить статус.`),
          data:{stage:'catalog-status',catalogId:c.id,status:c.status,category:'trainer'}});
      }
    }catch(_){}
    return send(res, 200, {ok: true, status: c.status, pro: !!c.pro});
  }

  /* ---- открыть или закрыть программу подпиской ----
     Отдельным действием, а не только в правке: это решение принимают на витрине,
     глядя на список, и ради одного переключателя открывать всю форму незачем. */
  if(a === 'pro'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    c.pro = !!(body && body.pro);
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true, pro: c.pro});
  }

  /* ---- закрыть или вернуть тренера ---- */
  if(a === 'ban' || a === 'unban'){
    const handle = clean(body && body.handle, 40);
    const raw = await store.get(`t:${handle}`);
    if(!raw) return fail(res, 404, 'not_found');
    const t = JSON.parse(raw);
    t.banned = a === 'ban';
    await store.set(`t:${handle}`, JSON.stringify(t));
    return send(res, 200, {ok: true, banned: t.banned});
  }

  /* ---- добавить программу от себя ---- */
  if(a === 'add'){
    const it = (body && body.item) || {};
    const checked = checkItem(it, {requireBoth:true, fallbackSource:it.sourceLocale || 'ru'});
    if(checked.miss.length) return fail(res, 400, 'bad_item', {miss:checked.miss});
    const newId = 'a' + rndId(7);
    const c = {
      id: newId, by: clean(it.by, 40), cat: it.cat, level: it.level,
      min: Math.max(1, Math.min(180, Math.round(+it.min || 20))),
      cover: cleanPic(it.cover, 90000) || null, media: pics(it.media),
      exCount: Math.max(0, Math.round(+it.exCount || 0)),
      pro: !!it.pro,
      status: 'approved', at: new Date().toISOString(), mine: true
    };
    syncSourceFields(c, checked);
    await store.set(`c:${newId}`, JSON.stringify(c));
    await store.push('c:approved', newId);
    return send(res, 200, {ok: true, id: newId});
  }

  /* ---- поправить уже лежащее ---- */
  if(a === 'edit'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    const incoming = (body && body.item) || {};
    const it = Object.assign({}, c, incoming);
    if(incoming.locales !== undefined){
      it.locales = Object.assign({}, c.locales || {}, incoming.locales || {});
    }
    const touchesLegacyText = incoming.name !== undefined || incoming.gives !== undefined || incoming.text !== undefined;
    if(incoming.locales === undefined && touchesLegacyText){
      // Старый админ/API правил name/gives/text напрямую. Не игнорируем такую правку:
      // она относится к исходному языку, а второй язык остаётся как был.
      const base = normalizeCatalogText(c, c.sourceLocale || 'ru');
      const srcLang = normLocale(incoming.sourceLocale || base.sourceLocale);
      it.sourceLocale = srcLang;
      it.locales = Object.assign({}, base.locales);
      it.locales[srcLang] = Object.assign({}, it.locales[srcLang] || {});
      ['name','gives','text'].forEach(k => { if(incoming[k] !== undefined) it.locales[srcLang][k] = incoming[k]; });
    }
    const touchesText = incoming.locales !== undefined || incoming.sourceLocale !== undefined || touchesLegacyText;
    const checked = checkItem(it, {
      requireBoth: c.status === 'approved' && touchesText,
      fallbackSource:c.sourceLocale || 'ru'
    });
    if(checked.miss.length) return fail(res, 400, 'bad_item', {miss:checked.miss});
    // Правка идёт теми же пределами, что и добавление: разойдясь, они дают
    // каталог, в который через правку попадает то, что не прошло бы при добавлении.
    if(touchesText) syncSourceFields(c, checked);
    if(it.by    != null) c.by    = clampLine(it.by, 40);
    ['cat', 'level'].forEach(k => { if(it[k] != null) c[k] = clean(it[k], 40); });
    if(it.min != null) c.min = Math.max(1, Math.min(180, Math.round(+it.min || 20)));
    if(it.cover !== undefined) c.cover = cleanPic(it.cover, 90000) || null;
    if(it.exCount != null) c.exCount = Math.max(0, Math.round(+it.exCount || 0));
    if(it.pro !== undefined) c.pro = !!it.pro;
    // Картинки правятся целиком: присланная карта заменяет прежнюю, поэтому убрать
    // фото можно тем же действием, каким его добавляют.
    if(it.media !== undefined) c.media = pics(it.media);
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true});
  }

  /* ---- убрать из каталога ----
     Запись помечаем удалённой, а не стираем: витрина отдаёт только approved,
     а по id ещё может прийти запрос от того, кто успел её добавить. */
  if(a === 'remove'){
    const raw = await store.get(`c:${id}`);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    c.status = 'removed';
    await store.set(`c:${id}`, JSON.stringify(c));
    return send(res, 200, {ok: true});
  }

  /* ---- залить стартовый набор ----
     Нужно ровно один раз, чтобы каталогу было чем открыться. Повторный вызов
     ничего не портит: программы с теми же id перезаписываются, а не двоятся. */
  if(a === 'seed'){
    const { SEED_ITEMS, SEED_TRAINERS } = require('../lib/seed');
    const now = new Date().toISOString();
    for(const [handle, t] of Object.entries(SEED_TRAINERS)){
      if(await store.get(`t:${handle}`)) continue;
      await store.push('t:all', handle);
      await store.set(`t:${handle}`, JSON.stringify(Object.assign(
        {handle, since: now, seen: now, keyHash: '', years: null, links: ''}, t)));
    }
    const have = new Set((await store.list('c:approved')));
    for(const it of SEED_ITEMS){
      await store.set(`c:${it.id}`, JSON.stringify(Object.assign(
        {status: 'approved', at: now, cover: null}, it)));
      if(!have.has(it.id)){
        await store.push('c:approved', it.id);
        // Счётчик программ автора: без него на его странице и в списке тренеров
        // значилось «0 программ» рядом с его же программой в каталоге.
        if(it.by) await store.incr(`t:${it.by}:programs`);
      }
    }
    return send(res, 200, {ok: true, items: SEED_ITEMS.length});
  }

  fail(res, 400, 'unknown_action');
};
