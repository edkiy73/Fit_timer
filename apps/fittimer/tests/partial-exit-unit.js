const fs = require('fs');

const events = fs.readFileSync('src/app/90-events.js','utf8');
const workout = fs.readFileSync('src/app/70-workout.js','utf8');
const ru = fs.readFileSync('src/i18n/ru.js','utf8');
const en = fs.readFileSync('src/i18n/en.js','utf8');
const sourceHtml = fs.readFileSync('src/html/10-programs-builder.html','utf8');
const generated = fs.readFileSync('index.html','utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(/import\s*\{[\s\S]*\bfinishPartialWorkout\b[\s\S]*\}\s*from\s*['"]\.\/70-workout\.js['"]/.test(events),
  'finishPartialWorkout must be imported into 90-events.js');
need(events.includes("registerAction('finishWorkoutToday'"), 'finish-for-today action handler is missing');
need(sourceHtml.includes('id="exitFinishToday" data-act="finishWorkoutToday"'), 'finish-for-today action is not wired declaratively');
need(workout.includes('export function finishPartialWorkout()'), 'finishPartialWorkout export is missing');

for(const key of [
  'workout.saveExit','workout.saveExitSub','workout.finishToday','workout.finishTodaySub',
  'workout.discardExit','workout.discardExitSub'
]){
  need(ru.includes("'" + key + "':"), 'RU translation missing: ' + key);
  need(en.includes("'" + key + "':"), 'EN translation missing: ' + key);
}
need(sourceHtml.includes('id="exitFinishToday"'), 'canonical exit modal is missing finishToday');
need(generated.includes('id="exitFinishToday"'), 'generated index.html is stale: finishToday missing');
need(!generated.includes('data-i18n="workout.finishCompletely"'), 'generated index.html still contains obsolete exit action');

console.log('partial exit contract: ok');
