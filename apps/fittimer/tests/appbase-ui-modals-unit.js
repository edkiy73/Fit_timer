/* FitTimer modal adoption regression. */
const fs=require('fs');
let bad=0;
const ok=(name,cond)=>{
  if(!cond)bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
};

const data=fs.readFileSync('src/app/10-data-sync.js','utf8');
const media=fs.readFileSync('src/app/30-progress-media.js','utf8');
const workout=fs.readFileSync('src/app/70-workout.js','utf8');

ok('wellness modal uses appUi',
  data.includes("appUi.openModal($('wellModal'))")
  && data.includes("appUi.closeModal($('wellModal'))"));
ok('comparison modal uses appUi',
  media.includes("appUi.openModal($('cmpModal'))")
  && media.includes("appUi.closeModal($('cmpModal'))"));
ok('photo fullscreen modal uses appUi',
  media.includes("appUi.openModal($('photoFullModal'))")
  && media.includes("appUi.closeModal($('photoFullModal'))"));
ok('workout swap modal uses appUi',
  workout.includes("appUi.openModal($('swapModal'))")
  && workout.includes("appUi.closeModal($('swapModal'))"));

for(const [src,id] of [[data,'wellModal'],[media,'cmpModal'],[media,'photoFullModal'],[workout,'swapModal']]){
  ok(id+' has no direct open class mutation',
    !src.includes("$('"+id+"').classList.add('open')"));
  ok(id+' has no direct close class mutation',
    !src.includes("$('"+id+"').classList.remove('open')"));
}

process.exit(bad?1:0);
