/* Фикстуры упражнений в модели V2 для браузерных тестов.

   Тесты кладут программы прямо в хранилище, поэтому им нужен короткий способ собрать
   слот упражнения V2 (этапы, prescription, progressState) без копирования всей формы.
   installV2Fixtures(page) добавляет в страницу (до запуска приложения) функцию
   v2ex(name, spec):

     spec = {
       id, warmup, media,                       // слот
       type, value, sets, rest, restAfter, perSide, desc, muscles, mistakes, video,
       load: {type, equipment, name, count, weight, levels, level},   // по умолчанию — без нагрузки
       prog: {mode, every, reps:{step,max}, weight:{step,max}, time:{step,max}}, // по умолчанию — выключена
       state: {count, current:{reps, weight, time, level}},
       stages: [spec2, …]                        // доп. этапы движения (prescription-часть)
     }

   и v2plan(id, exercises, extra) для варианта программы. Значения проходят через
   FitExerciseV2.normalizeExercise — ту же нормализацию, что у приложения. */

function installV2Fixtures(page){
  return page.addInitScript(() => {
    const prescription = (name, s) => ({
      name, desc:s.desc || '', type:s.type || 'reps', value:String(s.value == null ? 10 : s.value),
      sets:s.sets == null ? 1 : s.sets, perSide:!!s.perSide, rest:s.rest == null ? 30 : s.rest,
      restAfter:s.restAfter == null ? null : s.restAfter, muscles:s.muscles || [], mistakes:s.mistakes || '',
      video:s.video || '',
      load:Object.assign({type:'none', equipment:null, name:'', count:1, unit:'kg', weight:0, levels:[], level:0}, s.load || {}),
      supportEquipment:s.support || [],
      progression:Object.assign({mode:'none', every:null}, s.prog || {}, {
        reps:Object.assign({step:null, max:null}, (s.prog && s.prog.reps) || {}),
        weight:Object.assign({step:null, max:null}, (s.prog && s.prog.weight) || {}),
        time:Object.assign({step:null, max:null}, (s.prog && s.prog.time) || {})
      })
    });
    let seq = 0;
    globalThis.v2ex = (name, spec) => {
      const s = spec || {};
      const base = s.id || ('fx' + (++seq) + Math.random().toString(36).slice(2, 6));
      const stages = [{stageId:base + '-s1', prescription:prescription(name, s), advance:{mode:s.advance || 'manual'}}]
        .concat((s.stages || []).map((st, i) => ({stageId:base + '-s' + (i + 2),
          prescription:prescription(st.name || name, st), advance:{mode:st.advance || 'manual'}})));
      const raw = {
        id:base, warmup:!!s.warmup, media:s.media || null,
        currentStageId:s.currentStage ? stages[s.currentStage].stageId : stages[0].stageId,
        stages,
        progressState:{count:(s.state && s.state.count) || 0,
          current:Object.assign({reps:null, weight:null, time:null, level:null}, (s.state && s.state.current) || {})}
      };
      return globalThis.FitExerciseV2 ? globalThis.FitExerciseV2.normalizeExercise(raw).exercise : raw;
    };
    globalThis.v2plan = (id, exercises, extra) => Object.assign(
      {id, days:[], rounds:1, roundRest:0, exercises}, extra || {});
  });
}

module.exports = { installV2Fixtures };
