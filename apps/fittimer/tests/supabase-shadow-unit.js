/* Supabase shadow document-store regression. */
let bad=0;
const ok=(name,cond,extra)=>{
  if(!cond) bad++;
  console.log((cond?'  ok  ':' ПЛОХО')+'  '+name+(extra==null?'':' → '+extra));
};

const {createDocumentStore}=require('../../../packages/core/server/document-store');
const calls=[];
const fake=createDocumentStore({
  async upsert(doc){calls.push(['upsert',doc]);return true;},
  async listAccount(accountHash){calls.push(['list',accountHash]);return [];},
  async purgeProfile(accountHash,profileId){calls.push(['profile',accountHash,profileId]);return true;},
  async purgeAccount(accountHash){calls.push(['account',accountHash]);return true;}
});
(async()=>{
  await fake.upsert({profileId:'p1',key:'note:1'});
  await fake.listAccount('acc');
  await fake.purgeProfile('acc','p1');
  await fake.purgeAccount('acc');
  ok('generic document-store contract delegates provider adapter',calls.length===4);

  process.env.SUPABASE_URL='https://demo-project.supabase.co';
  process.env.SUPABASE_SECRET_KEY='sb_secret_shadow_test';
  process.env.SUPABASE_SHADOW_WRITE='1';
  process.env.SUPABASE_SHADOW_COMPARE='1';

  const originalFetch=global.fetch;
  const requests=[];
  global.fetch=async(url,opts={})=>{
    requests.push({url:String(url),opts});
    if(opts.method==='POST'){
      return {ok:true,status:201,text:async()=>'',json:async()=>({})};
    }
    if(opts.method==='DELETE'){
      return {ok:true,status:204,text:async()=>'',json:async()=>({})};
    }
    return {
      ok:true,status:200,text:async()=>'',headers:{get:name=>{
        if(String(name).toLowerCase()!=='content-range')return null;
        return String(url).includes('deleted=eq.true')?'*/0':'0-0/1';
      }},json:async()=>[
        {
          account_hash:'acc123456',
          profile_id:'p1',
          doc_key:'note:1',
          revision:2,
          schema_version:1,
          device_id:'d1',
          deleted:false,
          payload:'{"x":1}',
          source_at:'2026-09-25T00:00:00.000Z',
          shadowed_at:'2026-09-25T00:01:00.000Z'
        }
      ]
    };
  };

  try{
    delete require.cache[require.resolve('../../../packages/core/server/supabase')];
    delete require.cache[require.resolve('../../../packages/core/server/supabase-document-store')];
    delete require.cache[require.resolve('../../../packages/core/server/sync-shadow')];
    const Shadow=require('../../../packages/core/server/sync-shadow');

    const write=await Shadow.writeDocument({
      accountHash:'acc123456',profileId:'p1',key:'note:1',
      rev:2,schema:1,deviceId:'d1',deleted:false,value:'{"x":1}',
      at:'2026-09-25T00:00:00.000Z'
    });
    ok('shadow write enabled and succeeds',write.enabled===true&&write.ok===true,JSON.stringify(write));
    const writeBatch=await Shadow.recordWriteBatch([write]);
    ok('shadow write batch monitoring records successful batch',
      writeBatch.enabled===true&&writeBatch.summary.written===1&&writeBatch.summary.failed===0,
      JSON.stringify(writeBatch));

    const post=requests.find(x=>x.opts.method==='POST');
    const payload=post&&JSON.parse(String(post.opts.body||'[]'))[0];
    ok('Supabase adapter writes generic document identity/revision',
      payload&&payload.account_hash==='acc123456'&&payload.profile_id==='p1'
      &&payload.doc_key==='note:1'&&payload.revision===2);

    const parity=await Shadow.compareAccount('acc123456',[{
      profileId:'p1',key:'note:1',rev:2,schema:1,deviceId:'d1',
      deleted:false,value:'{"x":1}',at:'2026-09-25T00:00:00.000Z'
    }]);
    ok('shadow parity reports exact match',
      parity.ok===true&&parity.parity===true&&parity.matches===1,
      JSON.stringify(parity));

    const migration=await Shadow.migrationStatus();
    ok('migration monitoring exposes document count and readiness',
      migration.stats&&migration.stats.documents===1
      &&migration.readiness&&migration.readiness.readyForCompare===true,
      JSON.stringify(migration));

    await Shadow.purgeProfile('acc123456','p1');
    await Shadow.purgeAccount('acc123456');
    ok('privacy purge reaches Supabase even through document adapter',
      requests.filter(x=>x.opts.method==='DELETE').length===2);

    ok('Supabase requests keep secret only in server headers',
      requests.every(x=>x.opts.headers&&x.opts.headers.Authorization==='Bearer sb_secret_shadow_test'));
  }catch(e){
    ok('Supabase shadow unit does not fail',false,e&&e.stack||e);
  }finally{
    global.fetch=originalFetch;
  }

  process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
