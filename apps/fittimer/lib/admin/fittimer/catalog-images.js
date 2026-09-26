'use strict';

const { getSettings, generate } = require('../../../../../packages/core/server/ai');
const { send, fail, clampLine } = require('../../../../../packages/core/server/util');
const { GOALS } = require('./catalog-text');

const ACTIONS = new Set(['catalog_ai_image']);

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

function imageCoverTone(category,context){
  const byCat={
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
  if(byCat[category])return byCat[category];
  const s=String(context||'').toLowerCase();
  if(/кардио|вынослив|жиросж|похуд|hiit|cardio|endurance|fat loss/.test(s))return byCat.cardio;
  if(/сила|силов|мышечн|масса|гипертроф|strength|muscle|hypertrophy/.test(s))return byCat.power;
  if(/растяж|гибк|мобил|восстанов|после род|stretch|flexibility|mobility|recovery|postpartum/.test(s))return byCat.flex;
  if(/осанк|спин|кор|пресс|стабил|posture|back|core|stability/.test(s))return byCat.back;
  return {tone:'Fit Timer violet and purple',mood:'balanced, premium, modern'};
}

function imageEquipment(name,description){
  const s=(String(name||'')+' '+String(description||'')).toLowerCase();
  const out=[];
  const add=(re,label)=>{if(re.test(s)&&!out.includes(label))out.push(label);};
  add(/гантел|dumbbell/,'dumbbells');
  add(/штанг|barbell/,'barbell');
  add(/гир(я|и|ей|ю|ь)?|kettlebell/,'kettlebell');
  add(/резин|эспанд|resistance band|\bband\b/,'resistance band');
  add(/скам(ья|ьи|ье|ью|ьей)|bench/,'workout bench');
  add(/блок|кроссовер|трос|cable/,'cable machine');
  add(/турник|перекладин|pull[- ]?up bar/,'pull-up bar');
  add(/коврик|\bmat\b/,'exercise mat');
  add(/фитбол|мяч|exercise ball|swiss ball/,'exercise ball');
  add(/тумб|платформ|степ|plyo box|step platform/,'box or step platform');
  return out;
}

function imageStaticExercise(name,description){
  const s=(String(name||'')+' '+String(description||'')).toLowerCase();
  return /планк|удержан|статич|изометр|вис на|wall sit|dead hang|hollow hold|side plank|isometric|static hold/.test(s);
}

function adminMuscleRegions(meta){
  const exercise=(String(meta.name||'')+' '+String(meta.description||'')).toLowerCase();
  const out=[];
  const add=text=>{if(text&&!out.includes(text))out.push(text);};
  (meta.muscles||[]).forEach(label=>{
    const key=String(label||'').toLowerCase();
    if(/ягод|glute/.test(key))add('gluteus maximus on both sides');
    else if(/квадриц|quadriceps/.test(key))add('quadriceps on both legs');
    else if(/задн.*бед|hamstring/.test(key))add('hamstrings on both legs');
    else if(/икр|calves|calf/.test(key))add('calf muscles on both legs');
    else if(/груд|chest/.test(key))add('pectoralis major on both sides of the chest');
    else if(/плеч|shoulder/.test(key))add('deltoid muscles on both shoulders');
    else if(/пресс|core|abs|abdom/.test(key))add('rectus abdominis and obliques on both sides of the core');
    else if(/рук|arms/.test(key)){
      if(/бицепс|biceps? curl|hammer curl|сгибан.*рук/.test(exercise)){
        add('biceps brachii on both upper arms');
        add('brachialis on both upper arms');
        add('brachioradialis on both forearms');
      }else if(/трицепс|triceps? extension|разгибан.*рук/.test(exercise)){
        add('triceps brachii on both upper arms');
      }else add('upper-arm muscles on both arms');
    }else if(/шея|neck/.test(key))add('neck stabilizer muscles on both sides');
    else if(/спин|back/.test(key)){
      if(/присед|squat|станов|deadlift|румын|romanian|наклон|good morning|hip hinge/.test(exercise))
        add('lower back / spinal erectors on both sides');
      else
        add('latissimus dorsi and mid-back muscles on both sides');
    }else add(String(label||'').trim());
  });
  return out;
}

function adminImageCharacterStyle(gender){
  return gender==='man'
    ?'lifelike male athlete, natural skin tone, attractive masculine face, strong athletic physique'
    :'lifelike female athlete, natural skin tone, beautiful feminine face, fit athletic physique';
}

function adminExerciseImagePrompt(meta){
  const equipment=imageEquipment(meta.name,meta.description);
  const isStatic=imageStaticExercise(meta.name,meta.description);
  const regions=adminMuscleRegions(meta);
  const muscles=regions.length?regions.join(', '):'only the primary working muscles required by this movement';
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

async function handleCatalogImageAI(action,body,res){
  if(!ACTIONS.has(action))return false;

  const kind=String(body&&body.kind||'exercise');
  if(!['cover','exercise'].includes(kind)){
    fail(res,400,'bad_image_kind');
    return true;
  }

  const name=clampLine(body&&body.name,120);
  const description=String(body&&body.description||'').slice(0,1000);
  const program=clampLine(body&&body.program,120);
  const gives=String(body&&body.gives||'').slice(0,500);
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
    if(!out.image){
      fail(res,502,'image_not_returned');
      return true;
    }
    send(res,200,{ok:true,image:out.image,provider:out.provider,model:out.model,fallback:out.fallback});
  }catch(e){
    fail(res,502,'image_generation_failed',{detail:String(e.message||e).slice(0,500)});
  }
  return true;
}

module.exports={
  handleCatalogImageAI,ACTIONS,
  adminExerciseImagePrompt,adminCoverImagePrompt,
  imageEquipment,imageStaticExercise,adminMuscleRegions
};
