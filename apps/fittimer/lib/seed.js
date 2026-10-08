/* Curated FitTimer V2 catalog seed.
   Published only by the authenticated admin 'seed' action; importing this module
   does not modify production catalog data. Deterministic IDs preserve overlay refs. */
'use strict';

const C = require('./fit-ai-contract');
const CP = require('./fit-catalog-program');
const dto = require('../catalog/etalon-v-silhouette-ru-v2.json');
const english = require('../catalog/etalon-v-silhouette-en-v2.json');

function referenceItem(){
  const validated = C.checkOutput('program.create', dto);
  if(!validated.ok) throw new Error('etalon_v2_invalid:' + (validated.missing || []).join(','));
  let seq = 0;
  const created = C.programFromCreate(dto, prefix => prefix + '_vshape_' + (++seq));
  if(created.errors.length) throw new Error('etalon_v2_invalid:' + created.errors.join(','));
  const program = created.program;
  const ru = CP.textsOf(program);
  const translated = [];
  program.plans.forEach((pl, pi) => {
    const expected = pl.exercises.reduce((n, ex) => n + ex.stages.length, 0);
    const rows = english.plans[pi] || [];
    if(rows.length !== expected) throw new Error('etalon_english_stage_count:' + pi);
    let i = 0;
    pl.exercises.forEach(ex => ex.stages.forEach(st => {
      const [name, desc, mistakes] = rows[i++];
      translated.push({stageId:st.stageId, name, desc, mistakes});
    }));
  });
  const en = {programName:english.programName,programDesc:english.programDesc,stages:translated};
  if(!CP.textsComplete(ru,en)) throw new Error('etalon_english_incomplete');
  return {
    id:'vshape_v2',
    by:'',
    cat:'relief',
    level:'Средний',
    min:65,
    sourceLocale:'ru',
    name:'Плечи шире, талия уже — V-силуэт',
    gives:'Две силовые тренировки дома: приоритет широчайших и дельт, пропорциональная нагрузка на грудь, ноги и руки, работа над контролем корпуса.',
    program,
    locales:{
      ru:{name:'Плечи шире, талия уже — V-силуэт',
        gives:'Две домашние силовые в неделю с приоритетом широчайших и плеч, работой на всё тело и понятной прогрессией.',
        texts:ru},
      en:{name:'Wider Shoulders, Narrower Waist — V Shape',
        gives:'Two balanced home strength sessions each week, emphasizing back width and delts while developing chest, legs and core.',
        texts:en}
    }
  };
}
const SEED_TRAINERS = {};
const SEED_ITEMS = [referenceItem()];
module.exports = {SEED_ITEMS, SEED_TRAINERS};
