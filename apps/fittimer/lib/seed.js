/* Curated FitTimer V2 reference catalog.
   Available through authenticated admin actions only; imports have no side effects.
   Stable IDs and deterministic stage IDs preserve catalog overlays. */
'use strict';
const C = require('./fit-ai-contract');
const CP = require('./fit-catalog-program');
const { GOALS, LEVELS } = require('./admin/fittimer/catalog-text');

const REFERENCES = [
  {
    id:'vshape_v2', suffix:'vshape',
    dto:require('../catalog/etalon-v-silhouette-ru-v2.json'),
    english:require('../catalog/etalon-v-silhouette-en-v2.json'),
    cat:'relief',level:'Средний',min:65,
    gives:'Две силовые тренировки дома: приоритет широчайших и дельт, пропорциональная нагрузка на грудь, ноги и руки, работа над контролем корпуса.',
    ruGives:'Две домашние силовые в неделю с приоритетом широчайших и плеч, работой на всё тело и понятной прогрессией.',
    enGives:'Two balanced home strength sessions each week, emphasizing back width and delts while developing chest, legs and core.'
  },
  {
    id:'slim_toned_v2', suffix:'slimtoned',
    dto:require('../catalog/etalon-slim-toned-ru-v2.json'),
    english:require('../catalog/etalon-slim-toned-en-v2.json'),
    cat:'relief',level:'Средний',min:45,
    gives:'Три силовые тренировки дома для стройного, подтянутого тела: ноги, ягодицы, спина, грудь, руки и контроль корпуса.',
    ruGives:'Три домашние тренировки в неделю для пропорционального укрепления всего тела и поддержки формы при снижении веса.',
    enGives:'Three balanced home strength sessions weekly for a leaner, toned body with full-body strength and core control.'
  }
];

function validateReferenceMetadata(ref){
  if(!ref || !/^[a-z][a-z0-9_]*$/.test(String(ref.id||''))) throw new Error('etalon_invalid_id');
  if(!GOALS.includes(ref.cat)) throw new Error(ref.id+'_invalid_category:'+ref.cat);
  if(!LEVELS.includes(ref.level)) throw new Error(ref.id+'_invalid_level:'+ref.level);
  if(!Number.isInteger(ref.min) || ref.min<1 || ref.min>180) throw new Error(ref.id+'_invalid_duration:'+ref.min);
  if(typeof ref.gives!=='string' || ref.gives.trim().length<20) throw new Error(ref.id+'_missing_gives');
  if(typeof ref.ruGives!=='string' || ref.ruGives.trim().length<20) throw new Error(ref.id+'_missing_ru_gives');
  if(typeof ref.enGives!=='string' || ref.enGives.trim().length<20) throw new Error(ref.id+'_missing_en_gives');
}

function referenceItem(ref){
  validateReferenceMetadata(ref);
  const validated=C.checkOutput('program.create',ref.dto);
  if(!validated.ok) throw new Error(ref.id+'_invalid:'+(validated.missing||[]).join(','));
  let seq=0;
  const created=C.programFromCreate(ref.dto,prefix=>prefix+'_'+ref.suffix+'_'+(++seq));
  if(created.errors.length)throw new Error(ref.id+'_invalid:'+created.errors.join(','));
  const program=created.program;
  const ru=CP.textsOf(program);
  const translated=[];
  program.plans.forEach((pl,pi)=>{
    const expected=pl.exercises.reduce((n,ex)=>n+ex.stages.length,0);
    const rows=ref.english.plans[pi]||[];
    if(rows.length!==expected)throw new Error(ref.id+'_english_stage_count:'+pi);
    let i=0;
    pl.exercises.forEach(ex=>ex.stages.forEach(st=>{
      const [name,desc,mistakes]=rows[i++];
      translated.push({stageId:st.stageId,name,desc,mistakes});
    }));
  });
  const en={programName:ref.english.programName,programDesc:ref.english.programDesc,stages:translated};
  if(!CP.textsComplete(ru,en))throw new Error(ref.id+'_english_incomplete');
  return {
    id:ref.id,by:'',cat:ref.cat,level:ref.level,min:ref.min,sourceLocale:'ru',
    name:ref.dto.program.name,gives:ref.gives,program,
    locales:{
      ru:{name:ref.dto.program.name,gives:ref.ruGives,texts:ru},
      en:{name:ref.english.programName,gives:ref.enGives,texts:en}
    }
  };
}
const SEED_TRAINERS={};
const refIds = REFERENCES.map(r=>r.id);
if(new Set(refIds).size!==refIds.length) throw new Error('etalon_duplicate_reference_id');
const SEED_ITEMS=REFERENCES.map(referenceItem);
module.exports={SEED_ITEMS,SEED_TRAINERS,validateReferenceMetadata};
