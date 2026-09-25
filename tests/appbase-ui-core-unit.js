/* AppBase UI Core boundary regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const source=fs.readFileSync('src/core/ui.ts','utf8');
const esmEntry=fs.readFileSync('src/main.ts','utf8');

[
  'setShown','setText','openModal','closeModal','closestModal','setBusy','bindActions'
].forEach(name=>ok('UI Core exports '+name,source.includes('export function '+name)));

ok('UI Core stays product-neutral',
  !/Fit ?Timer|workout|exercise|trainer|catalog|program/i.test(source));
ok('UI Core has no app-specific selectors',
  !/#\w+|scrWork|btnDone|modal-card/.test(source));
ok('production ESM entry exposes UI through the product module bridge',
  /FitTimerModules/.test(esmEntry)
  && /ui:\s*uiCore/.test(esmEntry)
  && /uiCore/.test(esmEntry));

process.exit(bad?1:0);
