/* AppBase reusable UI states/tokens regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const ui=fs.readFileSync('src/core/ui.ts','utf8');
const events=fs.readFileSync('src/app/90-events.js','utf8');
const foundation=fs.readFileSync('src/styles/00-foundation.css','utf8');
const start=fs.readFileSync('src/styles/10-start-workout.css','utf8');
const settings=fs.readFileSync('src/styles/30-themes-settings.css','utf8');
const trainer=fs.readFileSync('src/styles/50-components-trainer.css','utf8');

ok('busy helper supports explicit disabled state',
  ui.includes('button.disabled = options.disabled ?? busy'));
ok('voice model download adopts reusable busy state',
  events.includes('AppBaseUI.setBusy(b, running')
  && events.includes("AppBaseUI.setBusy($(id), true"));
ok('old voice button busy mutation is removed',
  !events.includes('s.textContent=label; b.textContent=button; b.disabled=disabled'));

ok('empty-state is a foundation primitive',
  foundation.includes('.empty-state{') && foundation.includes('.empty-state .es-ico'));
ok('empty-state no longer belongs to trainer CSS',
  !trainer.includes('.empty-state{'));

for(const token of [
  '--ui-control-radius',
  '--ui-button-primary-min-h',
  '--ui-button-secondary-min-h',
  '--ui-card-radius',
  '--ui-card-padding',
  '--ui-card-gap',
  '--ui-card-margin'
]){
  ok('foundation defines '+token,foundation.includes(token+':'));
}
ok('primary button uses reusable geometry',
  start.includes('min-height:var(--ui-button-primary-min-h)')
  && start.includes('border-radius:var(--ui-control-radius)'));
ok('secondary button uses reusable geometry',
  trainer.includes('min-height:var(--ui-button-secondary-min-h)')
  && trainer.includes('border-radius:var(--ui-control-radius)'));
ok('card block uses reusable geometry',
  settings.includes('border-radius:var(--ui-card-radius)')
  && settings.includes('padding:var(--ui-card-padding)')
  && settings.includes('gap:var(--ui-card-gap)'));

process.exit(bad?1:0);
