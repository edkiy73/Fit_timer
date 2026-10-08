/* FitTimer catalog image boundary regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(arguments[2]!=null&&!cond?' → '+arguments[2]:''));
}

const aiPath=require.resolve('../../../packages/core/server/ai');
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{
    getSettings:async()=>({}),
    generate:async()=>({provider:'test',model:'test',fallback:false,image:'data:image/png;base64,AA=='})
  }
};

const mod=require('../lib/admin/fittimer/catalog-images');

(async()=>{
  ok('FitTimer image module owns catalog image action',mod.ACTIONS.has('catalog_ai_image'));
  ok('FitTimer image module does not own Core action',!mod.ACTIONS.has('users_list'));

  const equipment=mod.imageEquipment([{id:'dumbbell',count:2},'bench',{id:'custom',name:'TRX straps'},'unknown']);
  ok('equipment comes from structured stage data, with count',
    equipment.join('|')==='2 dumbbells|workout bench|TRX straps',equipment.join('|'));
  ok('no equipment in the stage means none on the picture',mod.imageEquipment([]).length===0);

  ok('static exercise detection preserved',mod.imageStaticExercise('Планка','удержание позиции')===true);

  const prompt=mod.adminExerciseImagePrompt({
    name:'Сгибание рук с гантелями',
    description:'Сгибайте руки контролируемо',
    muscles:['ar'],
    format:'3x12',
    equipment:[{id:'dumbbell',count:2}],
    gender:'man'
  });
  ok('exercise prompt keeps one-body constraint',
    prompt.includes('Exactly one solid')&&prompt.includes('biceps brachii'));
  ok('exercise prompt names the structured equipment',prompt.includes('Equipment: 2 dumbbells.'));
  ok('exercise prompt absolutely forbids any text inside the image',
    prompt.includes('ZERO text of any kind')&&prompt.includes('Do not render the exercise or program name inside the image.'));

  const coverPrompt=mod.adminCoverImagePrompt({program:'Сильная спина',gives:'Сила и осанка',category:'strength',gender:'woman',exerciseNames:['Тяга']});
  ok('cover prompt absolutely forbids any text inside the image',
    coverPrompt.includes('ZERO text of any kind')&&coverPrompt.includes('Do not render the exercise or program name inside the image.'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  const handled=await mod.handleCatalogImageAI('users_list',{},res);
  ok('FitTimer image handler ignores Core action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
