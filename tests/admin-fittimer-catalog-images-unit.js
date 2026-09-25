/* FitTimer catalog image boundary regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const aiPath=require.resolve('../lib/ai');
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

  const equipment=mod.imageEquipment('Жим гантелей','Лежа на скамье');
  ok('equipment parser stays FitTimer-specific',equipment.includes('dumbbells')&&equipment.includes('workout bench'));

  ok('static exercise detection preserved',mod.imageStaticExercise('Планка','удержание позиции')===true);

  const prompt=mod.adminExerciseImagePrompt({
    name:'Сгибание рук с гантелями',
    description:'Сгибайте руки контролируемо',
    muscles:['руки'],
    format:'3x12',
    gender:'man'
  });
  ok('exercise prompt keeps one-body constraint',
    prompt.includes('Exactly one solid')&&prompt.includes('biceps brachii'));

  const res={statusCode:0,body:'',setHeader(){},end(v){this.body=String(v||'');}};
  const handled=await mod.handleCatalogImageAI('users_list',{},res);
  ok('FitTimer image handler ignores Core action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
