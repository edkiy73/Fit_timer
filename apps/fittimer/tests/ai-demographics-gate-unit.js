const fs = require('fs');

const builder = fs.readFileSync('src/app/60-builder.js','utf8');
const ai = fs.readFileSync('src/app/40-programs-ai.js','utf8');

const need = (ok, msg) => { if(!ok) throw new Error(msg); };

const openBuilderBlock = builder.slice(
  builder.indexOf('export function openBuilder'),
  builder.indexOf('export function curPlan')
);
need(!openBuilderBlock.includes('requireWho('),
  'manual create/edit through openBuilder must not require age/gender');

const initAIBlock = builder.slice(
  builder.indexOf('export function initAIForm'),
  builder.indexOf('function aiChoiceEnglish')
);
need(initAIBlock.includes("requireWho('ai'"),
  'AI program creation must require age/gender');

for(const fn of ['openEditAI','openExAI','openExEdAI','openYouTube']){
  const start = ai.indexOf('export function ' + fn);
  need(start >= 0, fn + ' is missing');
  const next = ai.indexOf('\nexport function ', start + 20);
  const block = ai.slice(start, next >= 0 ? next : start + 2500);
  need(block.includes("requireWho('ai'"), fn + ' must require age/gender');
}

console.log('AI demographics gate contract: ok');
