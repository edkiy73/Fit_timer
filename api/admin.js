/* POST /api/admin — всё управление каталогом одной дверью.

   Одна точка вместо десятка файлов: действий много, но все они об одном и том же
   и все требуют одного и того же ключа. Разносить их по файлам — значит повторить
   проверку ключа десять раз и десять раз ошибиться в ней по-разному.

   Ключ — ADMIN_KEY в переменных окружения, передаётся заголовком, а не в адресе:
   адрес попадает в историю браузера и в журналы, заголовок — нет. */

const { store } = require('../lib/store');
const { send, fail, readBody, rateOkScoped, rndId, sameSecret, cors,
        clampText, clampLine, cleanPic } = require('../lib/util');
const { getSettings, sanitizeSettings, providerStatus, billingProviderStatus, generate } = require('../lib/ai');
const FitAIProtocol = require('../lib/ai-protocol');
const { handleAI } = require('../lib/ai-endpoint');
const { sendPushToAccountHash, notificationPrefs } = require('../lib/push');
const { sendMail } = require('../lib/mail');
const { handleAdminObservability } = require('../lib/admin/core/observability');
const { handleAdminAccounts } = require('../lib/admin/core/accounts');
const { handleAdminCampaigns } = require('../lib/admin/core/campaigns');
const { handleAdminAISettings } = require('../lib/admin/core/ai-settings');
const { handleAdminRelease } = require('../lib/admin/core/release');
const { handleCatalogTextAI } = require('../lib/admin/fittimer/catalog-ai');
const { GOALS, LEVELS, LANGS, normLocale, cleanLocaleBlock, normalizeCatalogText, localeMiss, protocolShape, syncSourceFields } = require('../lib/admin/fittimer/catalog-text');
const crypto = require('crypto');

const ANDROID_RELEASE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.ANDROID_RELEASE_REPO || '')
  ? process.env.ANDROID_RELEASE_REPO : 'edkiy73/Fit_timer';
const ANDROID_RELEASE_TAG = 'latest-apk';
const ANDROID_RELEASE_META = 'FitTimer-release.json';

const IMAGE_GOAL_LABELS = {
  slim:'weight loss and calorie burn',
  tone:'full-body toning and general fitness',
  glut:'glutes and lower-body shaping',
  core:'core and abdominal strength',
  power:'strength and endurance',
  relief:'muscle definition',
  flex:'mobility, stretching and flexibility',
  back:'posture and back strength',
  post:'postpartum recovery',
  cardio:'cardio and energy'
};
function imageCoverTone(category, context){
  const byCat = {
    slim:{tone:'deep blue to cyan',mood:'energetic, fast, fresh'},
    tone:{tone:'violet and magenta',mood:'balanced, athletic, modern'},
    glut:{tone:'berry magenta and deep violet',mood:'strong, sculpted, energetic'},
    core:{tone:'warm amber and indigo with violet accents',mood:'focused, controlled, stable'},
    power:{tone:'deep crimson and burgundy with subtle violet undertones',mood:'powerful, intense, athletic'},
    relief:{tone:'crimson-violet and deep burgundy',mood:'defined, strong, premium'},
    flex:{tone:'teal and emerald with soft lavender accents',mood:'calm, fluid, restorative'},
    back:{tone:'indigo and blue-violet with a warm accent',mood:'upright, controlled, stable'},
    post:{tone:'soft teal and lavender',mood:'gentle, restorative, confident'},
    cardio:{tone:'electric blue to cyan',mood:'energetic, fast, fresh'}
  };
  if(byCat[category]) return byCat[category];
  const s=String(context||'').toLowerCase();
  if(/кардио|вынослив|жиросж|похуд|hiit|cardio|endurance|fat loss/.test(s)) return byCat.cardio;
  if(/сила|силов|мышечн|масса|гипертроф|strength|muscle|hypertrophy/.test(s)) return byCat.power;
  if(/растяж|гибк|мобил|восстанов|после род|stretch|flexibility|mobility|recovery|postpartum/.test(s)) return byCat.flex;
  if(/осанк|спин|кор|пресс|стабил|posture|back|core|stability/.test(s)) return byCat.back;
  return {tone:'Fit Timer violet and purple',mood:'balanced, premium, modern'};
}
function imageEquipment(name, description){
  const s=(String(name||'')+' '+String(description||'')).toLowerCase();
  const out=[];
  const add=(re,label)=>{if(re.test(s)&&!out.includes(label))out.push(label);};
  add(/гантел|dumbbell/,'dumbbells');
  add(/штанг|barbell/,'barbell');
  add(/гир(я|и|ей|ю|ь)?|kettlebell/,'kettlebell');
  add(/резин|эспанд|resistance band|\bband\b/,'resistance band');
  add(/скам(ья|ьи|ью)|bench/,'workout bench');
  add(/блок|кроссовер|трос|cable/,'cable machine');
  add(/турник|перекладин|pull[- ]?up bar/,'pull-up bar');
  add(/коврик|\bmat\b/,'exercise mat');
  add(/фитбол|мяч|exercise ball|swiss ball/,'exercise ball');
  add(/тумб|платформ|степ|plyo box|step platform/,'box or step platform');
  return out;
}
function imageStaticExercise(name, description){
  const s=(String(name||'')+' '+String(description||'')).toLowerCase();
  return /планк|удержан|статич|изометр|вис на|wall sit|dead hang|hollow hold|side plank|isometric|static hold/.test(s);
}

function adminMuscleRegions(meta){
  const exercise=(String(meta.name||'')+' '+String(meta.description||'')).toLowerCase();
  const out=[];
  const add=text=>{if(text&&!out.includes(text))out.push(text);};
  (meta.muscles||[]).forEach(label=>{
    const key=String(label||'').toLowerCase();
    if(/ягод|glute/.test(key)) add('gluteus maximus on both sides');
    else if(/квадриц|quadriceps/.test(key)) add('quadriceps on both legs');
    else if(/задн.*бед|hamstring/.test(key)) add('hamstrings on both legs');
    else if(/икр|calves|calf/.test(key)) add('calf muscles on both legs');
    else if(/груд|chest/.test(key)) add('pectoralis major on both sides of the chest');
    else if(/плеч|shoulder/.test(key)) add('deltoid muscles on both shoulders');
    else if(/пресс|core|abs|abdom/.test(key)) add('rectus abdominis and obliques on both sides of the core');
    else if(/рук|arms/.test(key)){
      if(/бицепс|biceps? curl|hammer curl|сгибан.*рук/.test(exercise)){
        add('biceps brachii on both upper arms');
        add('brachialis on both upper arms');
        add('brachioradialis on both forearms');
      } else if(/трицепс|triceps? extension|разгибан.*рук/.test(exercise)){
        add('triceps brachii on both upper arms');
      } else add('upper-arm muscles on both arms');
    }
    else if(/шея|neck/.test(key)) add('neck stabilizer muscles on both sides');
    else if(/спин|back/.test(key)){
      if(/присед|squat|станов|deadlift|румын|romanian|наклон|good morning|hip hinge/.test(exercise))
        add('lower back / spinal erectors on both sides');
      else
        add('latissimus dorsi and mid-back muscles on both sides');
    } else add(String(label||'').trim());
  });
  return out;
}
function adminImageCharacterStyle(gender){
  return gender==='man'
    ? 'lifelike male athlete, natural skin tone, attractive masculine face, strong athletic physique'
    : 'lifelike female athlete, natural skin tone, beautiful feminine face, fit athletic physique';
}

function adminExerciseImagePrompt(meta){
  const equipment=imageEquipment(meta.name,meta.description);
  const isStatic=imageStaticExercise(meta.name,meta.description);
  const regions=adminMuscleRegions(meta);
  const muscles=regions.length?regions.join(', '):'only the primary working muscles required by this movement';
  // Раньше немоторные (не изометрические, не изолированные суставом) движения
  // просили «два полупрозрачных наложенных фото одного атлета» — нейросеть
  // регулярно рисовала это как двух слипшихся людей друг в друге, а не как
  // внятное до/после. Один чёткий кадр самой показательной фазы + стрелки —
  // тот же приём, что уже нормально работал для локальных движений, теперь
  // единый для всех не-статичных упражнений.
  const motion=isStatic
    ?'Show ONE clear final pose only. No ghost pose or movement trail.'
    :'Show ONE full athlete only, in the single clearest and most demonstrative phase of the movement (usually peak contraction or full range of motion). Exactly one solid, fully opaque figure — no second body, no duplicated limbs, no ghost pose, no semi-transparent overlay, no motion blur, no double exposure. Show the direction of motion only with one or two small violet-lavender trajectory arrows beside the moving body part(s) or equipment.';
  return [
    'Create a 4:3 instructional fitness illustration for "'+meta.name+'" in the Fit Timer app.',
    'Style: premium stylized-realistic 3D, '+adminImageCharacterStyle(meta.gender)+', realistic dark sportswear, polished high-end rendering.',
    'Background: premium modern gym with depth and good lighting, softly blurred and secondary; avoid flat gray studio backgrounds.',
    'Brand accents: Fit Timer violet (#7C56F5) and light lavender (#B7A0FF) only for arrows, subtle rim light and small environmental accents.',
    meta.description?'Technique: '+meta.description:null,
    equipment.length?'Equipment: '+equipment.join(', ')+'. Show correct quantity, scale, grip/contact and position.':'Do not invent equipment that the exercise does not require.',
    motion,
    'Highlight ONLY these muscle regions with a clearly visible localized warm red to red-orange glow: '+muscles+'.',
    'Do not highlight unrelated muscles. Keep muscle glow anatomically consistent, symmetrical and equally strong between male and female versions.',
    meta.format?'Exercise format: '+meta.format+'.':null,
    'Choose the clearest side or three-quarter camera angle. Keep important joints, limbs and equipment visible.',
    'Prioritize correct biomechanics: realistic joint alignment, spine, stance, grip, range of motion and equipment placement.',
    'No extra limbs, merged hands, duplicated equipment, text, labels, logos, UI, collage, borders or watermarks.'
  ].filter(Boolean).join(' ');
}

function adminCoverImagePrompt(meta){
  const context=[IMAGE_GOAL_LABELS[meta.category],meta.gives,(meta.exerciseNames||[]).join(', ')].filter(Boolean).join(' · ');
  const palette=imageCoverTone(meta.category,context);
  return [
    'Create a square 1:1 premium catalog cover for the fitness program "'+meta.program+'".',
    'This is a PROGRAM COVER, not an exercise instruction. Create one bold, simple hero image that reads instantly at small thumbnail size.',
    'COMPOSITION: full-bleed edge-to-edge artwork. Absolutely no inset square, inner card, picture frame, border, outline, vignette frame or mockup-within-a-mockup. The artwork itself must fill the entire 1:1 canvas.',
    'Use one large hero athlete as the dominant subject, occupying roughly 65-80% of the frame. Prefer a close or medium-wide athletic composition over a distant full gym scene. Keep only one or two large supporting elements; avoid tiny weights, racks, plates and decorative detail that disappears in the catalog.',
    'VISUAL STYLE: premium cinematic stylized-realistic 3D, natural skin tone, realistic sportswear, polished directional lighting, subtle depth and a modern gym atmosphere. Avoid gray mannequin/anatomy-model styling.',
    'Character: '+meta.gender+'. Make the pose energetic and aspirational, but not an exercise diagram.',
    context?'Program context: '+context+'.':null,
    'Goal-specific atmosphere: '+palette.tone+'. Mood: '+palette.mood+'. Keep one restrained Fit Timer violet (#7C56F5) rim-light or environmental accent so every category still belongs to the same brand.',
    'The goal color should come mainly from the background light and atmosphere, not from tinting the athlete skin.',
    'Use a softly blurred, simplified gym background with broad shapes and depth. The athlete must remain much more important than the environment.',
    'No instructional arrows, no ghost poses, no muscle heat-map, no text, letters, numbers, labels, logos, UI, collage, split-screen, frames, borders, corner icons, badges, decorative sparkles, stars or watermarks.'
  ].filter(Boolean).join(' ');
}

const clean = (v, n) => String(v == null ? '' : v).slice(0, n);
const escMail = v => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
  // Админка — одна из самых чувствительных дверей. Даже при сбое Redis
  // перебор ключа не должен становиться безлимитным.
  if(!(await rateOkScoped(req, 'admin-auth', 30, '', 3600, true))){
    return fail(res, 429, 'rate_limited');
  }
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
    const [pending, drafts, approved, settings] = await Promise.all([
      readItems('c:pending', 'pending'),
      readItems('c:drafts', 'draft'),
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
    return send(res, 200, {pending, drafts, approved, trainers, settings, providers:providerStatus(), billingProviders:billingProviderStatus()});
  }

  if(await handleAdminRelease(a,res,{
    repo:ANDROID_RELEASE_REPO,
    tag:ANDROID_RELEASE_TAG,
    archiveTag:'apk-archive',
    metaName:ANDROID_RELEASE_META,
    latestAsset:'FitTimer-latest.apk',
    archivePrefix:'FitTimer',
    userAgent:'FitTimer-admin'
  })) return;

  /* ---- reusable Core Admin actions ---- */
  if(await handleAdminObservability(a, body, res)) return;
  if(await handleAdminAccounts(a, body, res)) return;

  if(await handleAdminCampaigns(a, body, res)) return;

  if(await handleAdminAISettings(a, body, res)) return;

  if(await handleCatalogTextAI(a, body, res)) return;

  if(a === 'catalog_ai_image'){
    const kind=String(body&&body.kind||'exercise');
    if(!['cover','exercise'].includes(kind)) return fail(res,400,'bad_image_kind');
    const name=clampLine(body&&body.name,120);
    const description=clean(body&&body.description,1000);
    const program=clampLine(body&&body.program,120);
    const gives=clean(body&&body.gives,500);
    const category=GOALS.includes(String(body&&body.category||''))?String(body.category):'';
    const gender=body&&body.gender==='m'?'man':'woman';
    const muscles=Array.isArray(body&&body.muscles)?body.muscles.map(x=>clampLine(x,50)).filter(Boolean).slice(0,12):[];
    const format=clampLine(body&&body.format,80);
    const exerciseNames=Array.isArray(body&&body.exerciseNames)?body.exerciseNames.map(x=>clampLine(x,120)).filter(Boolean).slice(0,20):[];
    const prompt=kind==='cover'
      ?adminCoverImagePrompt({program,gives,category,gender,exerciseNames})
      :adminExerciseImagePrompt({name,description,muscles,format,gender});
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

  /* ---- черновики админских программ ----
     Черновик живёт на сервере и никогда не попадает в c:approved до явной
     публикации. В отличие от add он намеренно допускает незаполненный RU/EN:
     проверка полного каталожного контракта выполняется только publish_draft. */
  if(a === 'save_draft'){
    const incoming = (body && body.item) || {};
    let current = null;
    let draftId = id;
    if(draftId){
      const raw = await store.get('c:' + draftId);
      if(!raw) return fail(res, 404, 'not_found');
      try{ current = JSON.parse(raw); }catch(_){}
      if(!current || current.status !== 'draft') return fail(res, 409, 'not_draft');
    }else{
      draftId = 'd' + rndId(7);
    }

    const merged = Object.assign({}, current || {}, incoming);
    if(incoming.locales !== undefined){
      merged.locales = Object.assign({}, (current && current.locales) || {}, incoming.locales || {});
    }
    const norm = normalizeCatalogText(merged, (current && current.sourceLocale) || 'ru');
    const sourceLocale = norm.sourceLocale;
    const src = norm.locales[sourceLocale] || {name:'', gives:'', text:''};
    const now = new Date().toISOString();
    const c = {
      id:draftId,
      by:clampLine(merged.by,40),
      cat:GOALS.includes(merged.cat) ? merged.cat : ((current && current.cat) || 'tone'),
      level:LEVELS.includes(merged.level) ? merged.level : ((current && current.level) || 'Новичок'),
      min:Math.max(1,Math.min(180,Math.round(+merged.min || 20))),
      cover:cleanPic(merged.cover,90000) || null,
      media:pics(merged.media),
      exCount:Math.max(0,Math.round(+merged.exCount || 0)),
      pro:!!merged.pro,
      status:'draft',
      at:(current && current.at) || now,
      updatedAt:now,
      mine:true,
      sourceLocale,
      locales:norm.locales,
      name:src.name || '',
      gives:src.gives || '',
      text:src.text || ''
    };
    await store.set('c:' + draftId, JSON.stringify(c));
    if(!current) await store.push('c:drafts', draftId);
    return send(res, 200, {ok:true, id:draftId, status:'draft', updatedAt:now});
  }

  if(a === 'publish_draft'){
    const raw = await store.get('c:' + id);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    if(c.status !== 'draft') return fail(res, 409, 'not_draft');
    const checked = checkItem(c, {requireBoth:true, fallbackSource:c.sourceLocale || 'ru'});
    if(checked.miss.length) return fail(res, 400, 'catalog_not_ready', {miss:checked.miss});
    syncSourceFields(c, checked);
    c.status = 'approved';
    c.pro = body && body.pro !== undefined ? !!body.pro : !!c.pro;
    c.publishedAt = new Date().toISOString();
    await store.set('c:' + id, JSON.stringify(c));
    await store.removeFromList('c:drafts', id);
    const approvedIds = await store.list('c:approved');
    if(!approvedIds.includes(id)) await store.push('c:approved', id);
    return send(res, 200, {ok:true, id, status:'approved', pro:!!c.pro});
  }

  if(a === 'delete_draft'){
    const raw = await store.get('c:' + id);
    if(!raw) return fail(res, 404, 'not_found');
    const c = JSON.parse(raw);
    if(c.status !== 'draft') return fail(res, 409, 'not_draft');
    c.status = 'removed';
    c.removedAt = new Date().toISOString();
    await store.set('c:' + id, JSON.stringify(c));
    await store.removeFromList('c:drafts', id);
    return send(res, 200, {ok:true});
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
