import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { payload, sql } from '../tools/seed-sql.mjs';

const base={manifestPath:'seed/development-manifest.json',projectRef:'anrhayozrhrmiwexmbhw',stage:'prelaunch',scope:'profiles',operation:'sync'};
const migration=new URL('../supabase/migrations/20261010090405_feture_scoped_seed.sql',import.meta.url);

test('seed transactions: ownership, review binding, idempotency, rollback, scoped cleanup and role denial',async()=>{
  const db=new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
    await db.exec(readFileSync(migration,'utf8'));
    const call=async(data,overrides={})=>{
      const o={project:base.projectRef,stage:base.stage,operation:'sync',apply:false,token:null,adopt:false,...overrides};
      return (await db.query('select feture_seed.manage($1::jsonb,$2,$3,$4,$5,$6,$7) result',[JSON.stringify(data),o.project,o.stage,o.operation,o.apply,o.token,o.adopt])).rows[0].result;
    };
    const data=payload(base),catalog=payload({...base,scope:'catalog'});
    await db.exec("create table public.appbase_kv(key text primary key,value text); insert into public.appbase_kv values('keep','shared');");
    let r=await call(data);assert.equal(r.writes,0);assert.equal(r.counts.insert,3);
    assert.equal((await db.query('select count(*)::int n from public.feture_profiles')).rows[0].n,0);
    await assert.rejects(call(data,{project:'aaaaaaaaaaaaaaaaaaaa'}),/seed_environment_mismatch/);
    await assert.rejects(call(data,{stage:'live'}),/seed_environment_mismatch/);
    await assert.rejects(call(data,{apply:true,token:'a'.repeat(64)}),/seed_review_rejected/);
    await assert.rejects(call({...data,records:[{...data.records[0],table:'appbase_kv'}]}),/seed_table_forbidden/);
    await assert.rejects(call({...data,records:[data.records[0],data.records[0]]}),/duplicate_seed_key/);
    await assert.rejects(call({...data,records:[{...data.records[0],key:'a'.repeat(32)}]}),/invalid_seed_profile/);
    await assert.rejects(call({...data,records:[{...data.records[0],value:{...data.records[0].value,account_hash:null}}]}),/invalid_seed_profile/);
    assert.equal((await call(catalog)).canApply,false);
    const mismatched=structuredClone(catalog);mismatched.records[0].value.title='Changed';
    assert.ok((await call(mismatched,{adopt:true})).blockers.includes('unowned_row_conflict'));
    r=await call(catalog,{adopt:true});assert.equal(r.counts.adopt,156);assert.equal(r.canApply,true);
    await call(catalog,{apply:true,adopt:true,token:r.reviewToken});
    assert.equal((await call(catalog)).counts.unchanged,156);
    r=await call(data);await call(data,{apply:true,token:r.reviewToken});
    r=await call(data);assert.equal(r.counts.unchanged,3);assert.equal((await call(data,{apply:true,token:r.reviewToken})).writes,0);
    await db.exec("insert into public.feture_profiles(account_hash,display_name) values('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Owner');");
    const beforeOther=await call(data);
    const other={...data,datasetId:'feture-other-fixture',records:data.records.slice(0,1).map(e=>({...e,key:'seed:feture-other-fixture:'+e.seedKey,value:{...e.value,account_hash:'seed:feture-other-fixture:'+e.seedKey}}))};
    r=await call(other);await call(other,{apply:true,token:r.reviewToken});
    await assert.rejects(call(data,{apply:true,token:beforeOther.reviewToken}),/seed_review_rejected/);
    const changed=structuredClone(data);changed.version='2';changed.records[0].value.about='Обновлённое описание';
    assert.ok((await call({...changed,version:'1'})).blockers.includes('seed_version_reused'));
    r=await call(changed);await call(changed,{apply:true,token:r.reviewToken});
    await assert.rejects(call(data),/seed_dataset_conflict/);
    const cleanup={...changed,records:[]};
    await db.query("insert into public.feture_posts(author_hash,body) values($1,'dependency')",[data.records[0].key]);
    r=await call(cleanup,{operation:'cleanup'});assert.ok(r.blockers.includes('seed_has_dependents'));
    await assert.rejects(call(cleanup,{operation:'cleanup',apply:true,token:r.reviewToken}),/seed_review_rejected/);
    await db.query('delete from public.feture_posts where author_hash=$1',[data.records[0].key]);
    r=await call(cleanup,{operation:'cleanup'});
    await db.query("update public.feture_profiles set about='drift' where account_hash=$1",[data.records[0].key]);
    assert.ok((await call(cleanup,{operation:'cleanup'})).blockers.includes('seed_content_drift'));
    await assert.rejects(call(cleanup,{operation:'cleanup',apply:true,token:r.reviewToken}),/seed_review_rejected/);
    await db.query('update public.feture_profiles set about=$1 where account_hash=$2',[changed.records[0].value.about,data.records[0].key]);
    // A late FK failure rolls back earlier writes in the same function/transaction.
    const broken=structuredClone(catalog);broken.version='2';broken.records[0].value.title='Changed temporarily';
    broken.records.push({table:'feture_interests',key:'interest-999-1',seedKey:'interest-999-1',value:{id:'interest-999-1',category_id:'category-999',title:'Invalid dependency',position:0}});
    r=await call(broken);await assert.rejects(call(broken,{apply:true,token:r.reviewToken}),/foreign key constraint/);
    assert.equal((await db.query('select title from public.feture_categories where id=$1',[catalog.records[0].key])).rows[0].title,catalog.records[0].value.title);
    assert.ok((await call({...catalog,records:[]},{operation:'cleanup'})).blockers.includes('seed_has_dependents'));
    r=await call(cleanup,{operation:'cleanup'});assert.equal(r.counts.delete,3);await call(cleanup,{operation:'cleanup',apply:true,token:r.reviewToken});
    assert.equal((await db.query('select count(*)::int n from public.feture_profiles')).rows[0].n,2);
    assert.equal((await call(other)).counts.unchanged,1);
    assert.equal((await call(cleanup,{operation:'cleanup'})).counts.delete,0);
    assert.equal((await db.query('select value from public.appbase_kv')).rows[0].value,'shared');
    assert.equal((await db.query("select display_name from public.feture_profiles where account_hash='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'")).rows[0].display_name,'Owner');
    await db.exec('grant select on public.feture_profiles to anon');await assert.rejects(call(other),/seed_security_drift/);await db.exec('revoke select on public.feture_profiles from anon');
    await db.exec("update feture_seed.environment set stage='live'");await assert.rejects(call(other),/seed_environment_mismatch/);
    await db.exec("update feture_seed.environment set stage='prelaunch'");
    for(const role of ['anon','authenticated','service_role']){
      await db.exec('set role '+role);
      await assert.rejects(db.query('select * from feture_seed.records'),/permission denied/);
      await assert.rejects(call(data),/permission denied/);
      if(role!=='service_role')await assert.rejects(db.query('select * from public.feture_profiles'),/permission denied/);
      await db.exec('reset role');
    }
    assert.throws(()=>sql({...base,mode:'apply',adopt:false}),/invalid_seed_options/);
    assert.throws(()=>sql({...base,mode:'preview',adopt:true}),/invalid_seed_options/);
    assert.ok(sql({...base,mode:'preview',adopt:false}).endsWith('commit;\n'));
  } finally {await db.close();}
});
