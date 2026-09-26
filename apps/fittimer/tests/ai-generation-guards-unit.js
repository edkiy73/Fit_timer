const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
function need(cond, msg){
  if(!cond){ bad++; console.error('FAIL:', msg); }
  else console.log('ok:', msg);
}

const programs = read('src/app/40-programs-ai.js');
const builder = read('src/app/60-builder.js');
const events = read('src/app/90-events.js');
const ru = read('src/i18n/ru.js');
const en = read('src/i18n/en.js');
const FitAIProtocol = require('../lib/ai-protocol');

need(builder.includes("dur: ['5 мин', '10 мин', '15 мин', '20 мин', '30 мин', '40 мин', '45+ мин']"),
  '5-minute duration option is present');
need(builder.includes("const AI_DEFAULT_DURATION = '10 мин'"),
  '10 minutes is the default duration');
need(builder.includes("qChips('qDur', Q_OPTS.dur, false, ()=> q.dur, v => q.dur = v, true)"),
  'duration chip is required and cannot be cleared');
need(builder.includes('function aiProgramHasUserInput()') && builder.includes('function aiCreateProgramGuard()'),
  'program creation owns one semantic input guard');
need(programs.includes('guard: ()=> aiCreateProgramGuard()'),
  'program AI source uses the program guard');
need(programs.includes('function aiExerciseHasUserInput()') && programs.includes('function aiCreateExerciseGuard()'),
  'exercise creation owns one semantic input guard');
need(programs.includes('guard: ()=> aiCreateExerciseGuard()'),
  'exercise AI source uses the exercise guard');
need(programs.includes("function aiEditRequestGuard(fieldId)"),
  'program and exercise edits share one explicit-request guard');
need(programs.includes("guard: ()=> aiEditRequestGuard('eaWish')"),
  'program edit requires an explicit user request');
need(programs.includes("guard: ()=> aiEditRequestGuard('exeWish')"),
  'exercise edit requires an explicit user request');
need(!programs.includes('No specific request. Improve clarity'),
  'program edit has no hidden empty-request fallback');
need(!programs.includes('No specific request. Improve clarity and technique guidance'),
  'exercise edit has no hidden empty-request fallback');

need(programs.includes('function imageGenerationGuard(kind, item)'),
  'single-image naming rules are centralized');
need(programs.includes('function imageWorkspaceGuard()'),
  'image workspace naming rules are centralized');
need(programs.includes('if(!imageGenerationGuard(kind, item)) return false;'),
  'every single AI image generation passes the central guard');
need(programs.includes('if(!imageWorkspaceGuard()) return;') &&
     programs.includes("function openImages(){\n  if(!imageWorkspaceGuard()) return false;"),
  'batch generation and image workspace both use the shared guard');
const singlePrompt = programs.slice(programs.indexOf('function singleImagePrompt'), programs.indexOf('let imgGenCancelled'));
need(singlePrompt.includes('const name = imageProgramName();') && !singlePrompt.includes("|| 'Workout program'"),
  'real image generation has no hidden fallback program name');
need(!events.includes("if(!item.name){ appAlert(t('images.needExerciseName'))"),
  'exercise editor has no duplicate local image-name guard');

const copyFullStart = events.indexOf("$('aiCopyFull').onclick");
const copyFullHandler = events.slice(copyFullStart, events.indexOf('\n  };\n', copyFullStart));
need(copyFullHandler.includes('const text = programToText(editAIProg);'),
  'copy-program action exports the raw FitTimer program text');
need(!copyFullHandler.includes('aiPrompt(') && !copyFullHandler.includes('=== TASK ===') && !copyFullHandler.includes('CURRENT PROGRAM'),
  'copy-program action does not prepend AI protocol or hidden task');

const prompt = FitAIProtocol.programPrompt('Russian');
need(prompt.includes('Do not target a fixed number of exercises'),
  'AI protocol does not target a fixed exercise count');
need(prompt.includes('rep-based work ≈ reps × 3 seconds × sides'),
  'AI protocol estimates rep work with the same 3-sec baseline as the app');
need(prompt.includes('5 to 20 minutes, aim to stay within about ±5 minutes'),
  'short workouts use the ±5-minute planning tolerance');

for(const key of ['ai.needProgramInput','ai.needExerciseInput','ai.needEditRequest','images.needProgramName','images.needExerciseName','images.needAllExerciseNames']){
  need(ru.includes("'"+key+"'") && en.includes("'"+key+"'"), key+' exists in RU and EN');
}

if(bad){
  console.error('\nFailed:', bad);
  process.exit(1);
}
console.log('\nAI generation guards: ok');
