/* AppBase UI Core boundary regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const source=fs.readFileSync('../../packages/core/src/core/ui.ts','utf8');
const esmEntry=fs.readFileSync('src/main.ts','utf8');
const deps=fs.readFileSync('src/app/00-dependencies.js','utf8');
const adminTsx=fs.readFileSync('../../packages/ui-react/src/admin.tsx','utf8');
const adminCampaigns=fs.readFileSync('../../packages/ui-react/src/admin-campaigns.tsx','utf8');
const adminCss=fs.readFileSync('../../packages/ui-react/src/admin.css','utf8');

[
  'setShown','setText','openModal','closeModal','closestModal','setBusy','bindActions'
].forEach(name=>ok('UI Core exports '+name,source.includes('export function '+name)));

ok('UI Core stays product-neutral',
  !/Fit ?Timer|workout|exercise|trainer|catalog|program/i.test(source));
ok('UI Core has no app-specific selectors',
  !/#\w+|scrWork|btnDone|modal-card/.test(source));
ok('product runtime composes UI Core from an explicit import',
  /import \* as appbaseUi from '@appbase\/core\/ui\.js'/.test(deps)
  && /const appUi = \{/.test(deps)
  && !/FitTimerModules/.test(esmEntry));

ok('shared Admin restores the selected section after refresh',
  adminTsx.includes("sessionStorage.getItem('appbase.admin.tab')")
  && adminTsx.includes("sessionStorage.setItem('appbase.admin.tab'"));

ok('campaigns own a responsive no-overflow layout',
  adminCampaigns.includes('ab-admin-stack ab-admin-campaigns')
  && adminCss.includes('.ab-admin-campaigns{min-width:0;max-width:100%}')
  && adminCss.includes('.ab-admin-campaigns .ab-admin-grid{grid-template-columns:1fr}'));

process.exit(bad?1:0);
