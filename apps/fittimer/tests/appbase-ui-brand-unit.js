/* AppBase product UI brand token regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const product=JSON.parse(fs.readFileSync('config/product.json','utf8'));
const ui=product.brand&&product.brand.ui;
const core=fs.readFileSync('../../packages/core/src/core/ui.ts','utf8');
const platform=fs.readFileSync('src/app/80-platform.js','utf8');
const runtime=fs.readFileSync('app.config.js','utf8');

for(const mode of ['dark','light']){
  ok(mode+' UI theme exists',!!(ui&&ui[mode]));
  for(const key of ['background','card','surface','accent','accentInk']){
    ok(mode+'.'+key+' is a hex color',/^#[0-9A-Fa-f]{6}$/.test(String(ui&&ui[mode]&&ui[mode][key]||'')));
  }
}

ok('UI Core exports CSS variable helper',core.includes('export function applyCssVars'));
ok('FitTimer theme composition reads product brand tokens',
  platform.includes('appRuntimeCompat.runtimeConfig()') && !platform.includes('window.FIT_TIMER_CONFIG')
  && platform.includes('appUi.applyCssVars(document.body'));
ok('generated runtime config carries UI theme tokens',
  runtime.includes('"ui"')&&runtime.includes('"dark"')&&runtime.includes('"light"'));

process.exit(bad?1:0);
