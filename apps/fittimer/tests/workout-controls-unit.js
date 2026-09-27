const fs = require('fs');

const html = fs.readFileSync('src/html/20-workout-finish.html','utf8');
const workout = fs.readFileSync('src/app/70-workout.js','utf8');
const css = fs.readFileSync('src/styles/30-themes-settings.css','utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(html.includes('id="workEdit"'), 'exercise-card edit button is missing');
need(!html.includes('id="workMore"') && !html.includes('id="workMenu"'), 'old workout overflow menu still exists');
need(html.includes('id="btnDone"') && html.includes('id="btnSkip"'), 'done/skip controls are missing');

need(workout.includes("setShown('workEdit', step.phase === 'work' && !!step.exName)"),
  'edit control must be visible only on work steps');
need(/setShown\('btnDone', true\);\s*setShown\('btnSkip', true\)/.test(workout),
  'repetition steps must expose both Done and Skip');
need(/setShown\('btnDone', step\.phase === 'work'\);\s*setShown\('btnSkip', true\)/.test(workout),
  'timed work steps must expose both Done and Skip while rest keeps Skip');
need(workout.includes("$('workEdit').onclick"), 'exercise-card edit button is not wired');

need(css.includes('.act-row .btn-done{flex:1.45'), 'Done must remain the primary wide action');
need(css.includes('.act-row .btn-skip{flex:1 1 104px'), 'Skip must have a compact permanent slot');

console.log('workout controls contract: ok');
