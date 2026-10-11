import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url),{testsCommand}=require('../lib/feture/questionnaires');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('result to map: explicit private selection, manual limits, atomic conflict, replay, version and owner isolation',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const file of ['20261010_001_feture_domain.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261011043516_feture_private_journal.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011050304_feture_result_map.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const rpc=async(name,...args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
 const alice='a'.repeat(32),bob='b'.repeat(32),run=c=>rpc('feture_test_command',alice,c),apply=(owner,c)=>rpc('feture_test_map_command',owner,c);
 await db.exec('set role service_role');
 const first=(await run({action:'tests.start',testId:'dynamics',operationId:id(1)})).attempt;
 const answers=Object.fromEntries(first.version.definition.questions.map(q=>[q.id,[q.options[4].id]]));
 const done=(await run({action:'tests.complete',attemptId:first.id,operationId:id(2),expectedRevision:1,answers,position:7})).attempt;
 assert.equal((await db.query('select count(*)::int n from public.feture_interest_states')).rows[0].n,0); // completion never edits map
 const preview={action:'tests.mapPreview',attemptId:done.id};
 assert.equal((await apply(bob,preview)).error,'resource_not_found');
 let choices=await apply(alice,preview);assert.equal(choices.items.length,2);assert.equal(choices.versionId,done.version.id);assert.equal(choices.items.every(i=>i.available),true);
 const manual={stance:'not_interested',experience:'tried',boundary:'hard',boundaryNote:null,intensity:null,visibility:'granted',useForDiscovery:false};
 await rpc('feture_interest_mutate',alice,id(3),'interest-1-12',0,'set',manual);
 choices=await apply(alice,preview);assert.equal(choices.items.find(i=>i.interestId==='interest-1-12').available,false);
 const command={action:'tests.mapApply',attemptId:done.id,operationId:id(4),selected:[{interestId:'interest-1-7',expectedRevision:0},{interestId:'interest-1-12',expectedRevision:0}]};
 assert.deepEqual(testsCommand(command),command);assert.throws(()=>testsCommand({...command,selected:[{interestId:'interest-1-7',expectedRevision:0,boundary:'none'}]}));assert.throws(()=>testsCommand({...command,selected:[command.selected[0],command.selected[0]]}));
 assert.equal((await apply(alice,command)).error,'map_changed');
 assert.equal((await db.query("select count(*)::int n from public.feture_interest_states where interest_id='interest-1-7'")).rows[0].n,0); // entire batch rejects before any insert
 const selected={...command,selected:[command.selected[0]]};
 assert.equal((await apply(bob,selected)).error,'resource_not_found');
 assert.equal((await apply(alice,{...selected,selected:[{interestId:'interest-1-7',expectedRevision:1}]})).error,'invalid_request');
 assert.equal((await apply(alice,{...selected,selected:[{interestId:'interest-1-1',expectedRevision:0}]})).error,'invalid_request');
 assert.equal((await apply(alice,selected)).applied,1);
 const entry=(await db.query("select * from public.feture_interest_states where account_hash=$1 and interest_id='interest-1-7'",[alice])).rows[0];
 assert.equal(entry.source,'test');assert.equal(entry.test_version,done.version.id);assert.equal(entry.visibility,'private');assert.equal(entry.use_for_discovery,false);assert.equal(entry.experience,'unspecified');assert.equal(entry.intensity,null);assert.equal(entry.boundary,'none');
 assert.equal((await apply(alice,selected)).replayed,true);
 assert.equal((await db.query('select count(*)::int n from public.feture_interest_history where account_hash=$1',[alice])).rows[0].n,2); // manual + selected; retry adds nothing
 assert.equal((await apply(alice,{...selected,selected:[{interestId:'interest-1-12',expectedRevision:0}]})).error,'operation_conflict');
 await rpc('feture_interest_mutate',alice,id(5),'interest-1-7',1,'set',manual);
 assert.equal((await apply(alice,selected)).replayed,true);
 assert.equal((await db.query("select boundary,source from public.feture_interest_states where account_hash=$1 and interest_id='interest-1-7'",[alice])).rows[0].boundary,'hard');
 await rpc('feture_interest_mutate',alice,id(6),'interest-1-7',2,'delete',null);
 assert.equal((await apply(alice,selected)).replayed,true);
 assert.equal((await db.query("select deleted from public.feture_interest_states where account_hash=$1 and interest_id='interest-1-7'",[alice])).rows[0].deleted,true);
 assert.equal((await apply(alice,{...selected,operationId:id(7)})).error,'map_changed');
 const retake=(await run({action:'tests.start',testId:'dynamics',operationId:id(8)})).attempt;
 const skips=Object.fromEntries(retake.version.definition.questions.map(q=>[q.id,null]));
 await run({action:'tests.complete',attemptId:retake.id,operationId:id(9),expectedRevision:1,answers:skips,position:7});
 assert.equal((await apply(alice,{...preview,attemptId:retake.id})).items.length,0);
 assert.equal((await apply(alice,{...selected,attemptId:retake.id,operationId:id(10)})).error,'invalid_request');
 await rpc('feture_test_admin',{action:'feture.tests.save',definition:{...first.version.definition,title:'Новая редакция'},expectedRevision:first.version.revision});
 await rpc('feture_test_admin',{action:'feture.tests.publish',testId:'dynamics',revision:first.version.revision+1,reviewed:true});
 const newer=(await run({action:'tests.start',testId:'dynamics',operationId:id(20)})).attempt;
 await run({action:'tests.complete',attemptId:newer.id,operationId:id(21),expectedRevision:1,answers,position:7});
 assert.equal((await apply(alice,{...preview,attemptId:newer.id})).items.length,0); // changed exact definition needs fresh editorial mapping
 assert.equal((await apply(alice,preview)).items.length,2); // older immutable version retains its own rules
 await run({action:'tests.delete',attemptId:done.id,operationId:id(11),expectedRevision:2});
 assert.equal((await apply(alice,selected)).error,'resource_not_found');assert.equal((await apply(alice,{...selected,operationId:id(12)})).error,'resource_not_found');
 await assert.rejects(db.query('update public.feture_test_map_rules set reason=reason'),/permission denied/);
 await db.exec('reset role');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(apply(alice,preview),/permission denied/);await assert.rejects(db.query('select * from public.feture_test_map_operations'),/permission denied/);await assert.rejects(db.query('select * from public.feture_test_map_rules'),/permission denied/);await db.exec('reset role');}
 await db.query('delete from public.feture_profiles where account_hash=$1',[alice]);assert.equal((await db.query('select count(*)::int n from public.feture_test_map_operations')).rows[0].n,0);
 }finally{await db.close();}
});
