const fs = require('fs');

const shell = fs.readFileSync('src/html/00-shell-home.html','utf8');
const html = fs.readFileSync('src/html/20-workout-finish.html','utf8');
const workout = fs.readFileSync('src/app/70-workout.js','utf8');
const events = fs.readFileSync('src/app/90-events.js','utf8');
const ru = fs.readFileSync('src/i18n/ru.js','utf8');
const css = fs.readFileSync('src/styles/30-themes-settings.css','utf8');
const actionCss = fs.readFileSync('src/styles/10-start-workout.css','utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(shell.includes('id="workMore"') && shell.includes('id="workMenu"'),
  'top workout menu is missing');
need(!shell.includes('id="btnExit"'), 'old Exit button still exists in workout top bar');
need(!html.includes('id="workEdit"'), 'card edit button must be moved to top menu');
need(!html.includes('id="btnPause"'), 'pause must not occupy bottom action bar');
need(html.includes('id="btnPrev"') && html.includes('id="btnDone"') && html.includes('id="btnSkip"'),
  'bottom bar must contain only Back, Done and Skip');
need(!html.includes('data-icon="check"'), 'Done button must not contain a check icon');
need(html.indexOf('id="btnSkip"') < html.indexOf('id="btnDone"'), 'Skip must be left of Done');
need(workout.includes("t(step.phase === 'rest' ? 'workout.next' : 'workout.skip')"),
  'rest action must be Next, not Skip');
need(events.includes("t('workout.areYouSure')") && events.includes('skipConfirmIdx'),
  'work-step Skip must require a second tap');
need(workout.includes('data-i18n="workout.editExercise"') && workout.includes('data-i18n="workout.stopWorkout"'),
  'dynamic top menu must participate in runtime i18n');
need(ru.includes("'workout.next':") && ru.includes("'workout.areYouSure':"),
  'RU copy for Next/Are you sure is missing');

need(workout.includes("edit.id = 'workEditItem'"), 'Edit exercise top-menu item is missing');
need(workout.includes("pause.id = 'workPauseItem'"), 'Pause top-menu item is missing');
need(workout.includes("stop.id = 'workExitItem'"), 'Stop workout top-menu item is missing');
need(workout.includes("sep.className = 'menu-sep'"), 'menu separator is missing');

need(actionCss.includes('font-size:16px;letter-spacing:.09em;text-transform:uppercase'),
  'Done and Skip typography must use the same font size/weight treatment');
need(css.includes('.act-row .btn-done,.act-row .btn-skip{flex:1 1 0'),
  'Done and Skip must share the bottom row evenly');

console.log('workout controls contract: ok');
