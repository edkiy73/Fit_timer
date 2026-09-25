/* AppBase UI Core boundary regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const source=fs.readFileSync('src/core/ui.ts','utf8');
const runtime=fs.readFileSync('src/core/ui.runtime.js','utf8');

[
  'setShown','setText','openModal','closeModal','closestModal','setBusy','bindActions'
].forEach(name=>ok('UI Core exports '+name,source.includes('export function '+name)));

ok('UI Core stays product-neutral',
  !/Fit ?Timer|workout|exercise|trainer|catalog|program/i.test(source));
ok('UI Core has no app-specific selectors',
  !/#\w+|scrWork|btnDone|modal-card/.test(source));
ok('generated UI runtime exposes AppBaseUI',
  runtime.includes('var AppBaseUI')&&runtime.includes('AppBaseUI.bindActions = bindActions'));

process.exit(bad?1:0);
