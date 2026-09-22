import { readFile } from 'node:fs/promises';

const events = await readFile('src/app/90-events.js', 'utf8');
const programs = await readFile('src/app/40-programs-ai.js', 'utf8');
const workout = await readFile('src/app/70-workout.js', 'utf8');
const ru = await readFile('src/i18n/ru.js', 'utf8');
const en = await readFile('src/i18n/en.js', 'utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

need(events.includes('async function aiRetryDialog(error)'), 'shared AI recovery dialog is missing');
need(events.includes("if(retry) return runSelfAI(promptFn, targetId, applyFn, title, kind);"), 'text AI retry must rerun the same request');
need(events.includes("cancelText:t('ai.editRequest')"), 'text AI failure must offer request editing');
need(programs.includes("if(retry) return generateSlotImageViaAI();"), 'single-image retry is missing');
need(programs.includes("if(retry) return generateAllImagesViaAI('missing');"), 'batch image retry must regenerate only missing images');
need(programs.includes("await finishImgGen(done, total, failed);"), 'batch image recovery must be awaited');
need(workout.includes("if(retry) return swapViaAI();"), 'workout exercise replacement retry is missing');
need(ru.includes("'ai.retry': \"Повторить\""), 'RU retry copy is missing');
need(ru.includes("'ai.editRequest': \"Изменить запрос\""), 'RU edit-request copy is missing');
need(en.includes("'ai.retry': \"Retry\""), 'EN retry copy is missing');
need(en.includes("'ai.editRequest': \"Edit request\""), 'EN edit-request copy is missing');

console.log('AI error recovery is valid.');
