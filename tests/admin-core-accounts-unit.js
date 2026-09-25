/* Core Admin accounts ownership regression. */
let bad=0;
function ok(name,cond){
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name);
}

const storePath=require.resolve('../lib/store');
const aiPath=require.resolve('../lib/ai');
const fakeStore={
  get:async()=>null,
  set:async()=>true,
  del:async()=>1,
  push:async()=>1,
  list:async()=>[],
  many:async()=>[],
  scan:async()=>[],
  pipe:async()=>[]
};
require.cache[storePath]={
  id:storePath,filename:storePath,loaded:true,exports:{store:fakeStore}
};
require.cache[aiPath]={
  id:aiPath,filename:aiPath,loaded:true,
  exports:{getSettings:async()=>({limits:{heavy:10,light:20,image:30}})}
};

const mod=require('../lib/admin/core/accounts');

(async()=>{
  const expected=['users_list','user_ai_reset','user_create','user_premium','user_test_code'];
  ok('Core Admin owns generic account actions',expected.every(x=>mod.ACTIONS.has(x)));
  ok('Core Admin does not own FitTimer catalog action',!mod.ACTIONS.has('catalog_ai_create'));
  const source=require('fs').readFileSync(require.resolve('../lib/admin/core/accounts'),'utf8');
  ok('Core AI usage buckets are product-neutral',!source.includes('programs:')&&!source.includes('exercises:'));
  ok('account hash is stable and anonymous',
    /^[a-f0-9]{32}$/.test(mod.accountHash('person@example.com'))
    && mod.accountHash('person@example.com')===mod.accountHash('person@example.com'));

  const res={
    statusCode:0,
    setHeader(){},
    end(){}
  };
  const handled=await mod.handleAdminAccounts('catalog_ai_create',{},res);
  ok('account handler ignores product action',handled===false&&res.statusCode===0);

  process.exit(bad?1:0);
})().catch(e=>{
  console.error(e);
  process.exit(1);
});
