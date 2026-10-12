import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=name=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('C01 posts: draft/pending isolation, reviewed feed ACL, CAS, retries and irreversible text removal',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 for(const file of ['20261010_001_feture_domain.sql','20261010_002_catalog_read.sql','20261010090405_feture_scoped_seed.sql','20261010164924_feture_interest_transactions.sql','20261010225100_feture_verification_store.sql','20261010225653_feture_documents.sql','20261010230935_feture_private_profile.sql','20261010231459_feture_scoped_access.sql','20261010233014_feture_moderation.sql','20261011080915_feture_share_links.sql','20261011083303_feture_qa_adult_access.sql','20261011113717_feture_qa_any_account_audit.sql','20261011120139_feture_operator_roles.sql','20261011121629_feture_operator_account_binding.sql','20261011133134_feture_community_posts.sql','20261011134257_feture_post_review.sql','20261011140051_feture_post_reports.sql','20261011140835_feture_post_report_author_privacy.sql','20261011141800_feture_post_recipients.sql','20261011043127_feture_questionnaires.sql','20261011045829_feture_questionnaires_release.sql','20261011190651_feture_test_result_posts.sql','20261011193939_feture_post_photos.sql','20261012050032_feture_photo_review_consent.sql','20261012073357_feture_staff_photo_read.sql','20261012170000_feture_post_bookmarks.sql','20261013002400_feture_post_daily_views.sql'])await db.exec(sql(file));
 const rpc=async(name,args)=>(await db.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
 const op=(actor,command)=>rpc('feture_post_command',[actor,JSON.stringify(command)]);
 const [a,b,c]=['a','b','c'].map(x=>x.repeat(32));for(const owner of [a,b,c])await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
 await db.query("insert into public.feture_verification_policies values('fixture','production','v1',18,86400000,60000,90,true)");
 await db.exec('set role service_role');const docs=[];
 for(const key of ['privacy','adult-content','community','terms']){await rpc('feture_document_save',[key,'ru',0,'Правила',JSON.stringify([{type:'paragraph',text:'Правила для проверок'}]),true]);docs.push((await rpc('feture_document_publish',[key,'ru',1,true,new Date().toISOString()])).document.id);}
 for(const [n,owner] of [a,b,c].entries()){await rpc('feture_consent_accept',[owner,'ru',docs]);await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(n+1),owner]);}
 // C01.4 server-only allowlist, consent, immutable preview and idempotent copy.
 const share=(actor,command)=>rpc('feture_test_share_command',[actor,JSON.stringify(command)]);
 const tests=(actor,command)=>rpc('feture_test_command',[actor,JSON.stringify(command)]);
 const start=await tests(a,{action:'tests.start',testId:'closeness',operationId:id(3000)});
 const attempt=start.attempt,answers=Object.fromEntries(attempt.version.definition.questions.map(q=>[q.id,[q.options[4].id]]));
 const complete=await tests(a,{action:'tests.complete',attemptId:attempt.id,operationId:id(3001),expectedRevision:1,answers,position:7});
 const previewCommand={action:'posts.testPreview',attemptId:attempt.id};
 assert.equal((await share(b,previewCommand)).error,'resource_not_found');
 const preview=(await share(a,previewCommand)).preview;
 assert.deepEqual(preview.items.map(x=>x.id),['connection']);
 assert.deepEqual(Object.keys(preview.items[0]).sort(),['id','summary','title']);
 assert.equal(JSON.stringify(preview).includes('questionIds'),false);assert.equal(JSON.stringify(preview).includes('average'),false);
 const copy={action:'posts.fromTest',attemptId:attempt.id,expectedAttemptRevision:complete.attempt.revision,versionId:attempt.version.id,projectionHash:preview.projectionHash,id:id(3002),operationId:id(3003),selected:['connection'],authorLabel:'Моё имя',plannedAudience:'public',recipientCodes:[],consent:true};
 for(const bad of [{...copy,consent:false},{...copy,text:'RAW ANSWERS'},{...copy,selected:['space']},{...copy,selected:['connection','connection']},{...copy,versionId:null}])assert.equal((await share(a,bad)).error,'invalid_request');
 assert.equal((await share(b,copy)).error,'resource_not_found');
 assert.equal((await share(a,{...copy,projectionHash:'0'.repeat(64)})).error,'revision_conflict');
 await db.exec('reset role');await db.query("update public.feture_test_share_templates set summaries=jsonb_set(summaries,'{high}',to_jsonb('Другой вывод'::text)) where version_id=$1",[attempt.version.id]);await db.exec('set role service_role');
 assert.equal((await share(a,copy)).error,'revision_conflict');
 const current=(await share(a,previewCommand)).preview;
 const approvedCopy={...copy,projectionHash:current.projectionHash};const copied=await share(a,approvedCopy);
 assert.equal(copied.entry.state,'draft');assert.equal(copied.entry.audience,'private');assert.equal(copied.entry.kind,'text');assert.equal(copied.entry.text.includes('Другой вывод'),true);
 assert.equal(copied.entry.text.includes('Личное пространство'),false);assert.equal(copied.entry.text.includes('answers'),false);assert.equal(Object.hasOwn(copied.entry,'attemptId'),false);
 assert.equal((await share(a,approvedCopy)).replayed,true);assert.equal((await share(a,{...approvedCopy,authorLabel:'Иное имя'})).error,'operation_conflict');
 assert.equal((await op(b,{action:'posts.read',id:copy.id})).error,'resource_not_found');
 assert.equal((await db.query('select count(*)::int n from public.feture_posts where id=$1',[copy.id])).rows[0].n,1);
 await tests(a,{action:'tests.delete',attemptId:attempt.id,operationId:id(3004),expectedRevision:2});
 assert.equal((await share(a,previewCommand)).error,'resource_not_found');assert.equal((await share(a,approvedCopy)).replayed,true);
 assert.equal((await share(a,{...approvedCopy,id:id(3005),operationId:id(3006)})).error,'resource_not_found');
 await op(a,{action:'posts.delete',id:copy.id,operationId:id(3007),expectedRevision:1});
 assert.equal((await share(a,approvedCopy)).entry.text,'');assert.equal((await share(a,approvedCopy)).entry.state,'deleted');
 const privateStart=(await tests(a,{action:'tests.start',testId:'boundaries',operationId:id(3008)})).attempt;
 const privateAnswers=Object.fromEntries(privateStart.version.definition.questions.map(q=>[q.id,[q.options[4].id]]));
 await tests(a,{action:'tests.complete',attemptId:privateStart.id,operationId:id(3009),expectedRevision:1,answers:privateAnswers,position:7});
 assert.equal((await share(a,{action:'posts.testPreview',attemptId:privateStart.id})).preview.items.length,0);
 for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(db.query('select public.feture_test_share_command($1,$2)',[a,JSON.stringify(previewCommand)]),/permission denied/);await assert.rejects(db.query('select * from public.feture_test_share_templates'),/permission denied/);}
 await db.exec('reset role;set role service_role');
 const create={action:'posts.save',id:id(10),operationId:id(11),expectedRevision:0,text:'Мой личный текст',kind:'question',authorLabel:'Открытое имя',plannedAudience:'public',recipientCodes:[]};
 assert.equal((await op(a,{...create,author_hash:b})).error,'invalid_request');
 const draft=await op(a,create);assert.equal(draft.entry.state,'draft');assert.equal(draft.entry.audience,'private');assert.equal((await op(a,create)).replayed,true);
 assert.equal((await db.query("select count(*) n from public.feture_posts where state<>'deleted'")).rows[0].n,1);
 for(const actor of [b,c])assert.equal((await op(actor,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(b,{action:'posts.mine',cursor:null})).items.length,0);
 assert.equal((await op(b,{action:'posts.feed',cursor:null})).items.length,0);
 assert.equal((await op(b,{...create,operationId:id(12),expectedRevision:1})).error,'resource_not_found');
 const submit={action:'posts.submit',id:id(10),operationId:id(13),expectedRevision:1};const pending=await op(a,submit);assert.equal(pending.entry.state,'pending');assert.equal((await op(a,submit)).replayed,true);
 assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{...create,operationId:id(14),expectedRevision:1})).error,'revision_conflict');
 const manager='d'.repeat(32),auditor='e'.repeat(32),qa='f'.repeat(32),generation='1'.repeat(64);
 await db.exec('reset role');await db.query("insert into public.feture_operators(account_hash,role,revision,account_generation) values($1,'manager',1,$4),($2,'auditor',1,$4),($3,'qa_operator',1,$4)",[manager,auditor,qa,generation]);await db.exec('set role service_role');
 await db.query('insert into public.feture_profiles(account_hash) values($1)',[manager]);await rpc('feture_consent_accept',[manager,'ru',docs]);await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(4),manager]);
 const review=(actor,cmd,gen=generation)=>rpc('feture_post_review_command',[actor,gen,JSON.stringify(cmd)]);
 assert.equal((await review(qa,{action:'queue',cursor:null})).error,'forbidden');assert.equal((await review(auditor,{action:'queue',cursor:null})).error,'forbidden');assert.equal((await review(manager,{action:'queue',cursor:null},'2'.repeat(64))).error,'forbidden');
 assert.equal((await review(manager,{action:'queue',cursor:null})).items.length,1);
 const approve={action:'decide',id:id(10),operationId:id(90),expectedRevision:2,decision:'approve',reason:'reviewed'};
 await db.exec('reset role');await db.query("insert into public.feture_operators(account_hash,role,revision,account_generation) values($1,'manager',1,$2)",[a,generation]);await db.exec('set role service_role');assert.equal((await review(a,approve)).error,'review_required');
 assert.equal((await review(qa,{...approve,action:null})).error,'invalid_request');
 assert.equal((await review(auditor,approve)).error,'forbidden');assert.equal((await review(manager,{...approve,expectedRevision:1})).error,'revision_conflict');
 const approved=await review(manager,approve);assert.equal(approved.post.state,'published');assert.equal((await review(manager,approve)).replayed,true);
 const view=async owner=>rpc('feture_post_view_open',[owner,id(10)]);
 assert.deepEqual(await view(a),{ok:true,hidden:true,uniqueDailyOpens:null});
 const one=await view(b);
 assert.deepEqual(one,{ok:true,hidden:true,uniqueDailyOpens:null});
 assert.deepEqual(await view(b),one);
 assert.deepEqual(await view(c),one);
 assert.deepEqual(await view(manager),one);
 assert.equal((await db.query('select count(*)::int n from public.feture_post_view_receipts')).rows[0].n,3);
 assert.equal((await view('f'.repeat(32))).error,'resource_not_found');
 for(const [idx,owner] of ['7'.repeat(32),'8'.repeat(32)].entries()){
  await db.query('insert into public.feture_profiles(account_hash) values($1)',[owner]);
  await rpc('feture_consent_accept',[owner,'ru',docs]);
  await db.query("insert into public.feture_verification_attempts(id,account_hash,issuer,environment,policy_version,state,created_at,expires_at,proof_issued_at,proof_expires_at) values($1,$2,'fixture','production','v1','verified',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',clock_timestamp(),clock_timestamp()+interval '1 hour')",[id(7790+idx),owner]);
 }
 assert.equal((await view('7'.repeat(32))).hidden,true);
 assert.deepEqual(await view('8'.repeat(32)),{ok:true,hidden:false,uniqueDailyOpens:5});
 assert.equal((await view(b)).uniqueDailyOpens,5);
 const receipts=(await db.query('select viewer_digest from public.feture_post_view_receipts')).rows;
 assert.equal(receipts.length,5);
 assert.ok(receipts.every(row=>/^[a-f0-9]{64}$/.test(row.viewer_digest)));


 assert.equal((await review(manager,{...approve,decision:'hide',reason:'privacy'})).error,'operation_conflict');
 const audit=await review(auditor,{action:'audit',cursor:null});assert.equal(audit.items.length,1);assert.equal(JSON.stringify(audit).includes('Мой личный текст'),false);
 const hide={action:'decide',id:id(10),operationId:id(91),expectedRevision:3,decision:'hide',reason:'privacy'};
 assert.equal((await review(manager,hide)).post.state,'hidden');assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await view(b)).error,'resource_not_found');
 const reopen={...hide,operationId:id(92),expectedRevision:4,decision:'reopen',reason:'reviewed'};assert.equal((await review(manager,reopen)).post.state,'pending');assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 const reapprove={...approve,operationId:id(93),expectedRevision:5};assert.equal((await review(manager,reapprove)).post.state,'published');
 await db.exec('reset role');await db.query("update public.feture_operators set role=null where account_hash=$1",[manager]);await db.exec('set role service_role');assert.equal((await review(manager,reapprove)).error,'forbidden');await db.exec('reset role');await db.query("update public.feture_operators set role='manager' where account_hash=$1",[manager]);await db.exec('set role service_role');

 const reportOp=(actor,cmd)=>rpc('feture_post_report_command',[actor,JSON.stringify(cmd)]);
 const reportReview=(actor,cmd,gen=generation)=>rpc('feture_post_report_review',[actor,gen,JSON.stringify(cmd)]);
 const complaint={action:'posts.report',id:id(10),reportId:id(100),expectedRevision:6,reason:'privacy',note:'CONFIDENTIAL REPORTER NOTE'};
 assert.equal((await reportOp(a,complaint)).error,'resource_not_found');
 assert.equal((await reportOp(b,{...complaint,expectedRevision:5})).error,'revision_conflict');
 assert.equal((await reportOp(b,{...complaint,state:'resolved'})).error,'invalid_request');
 const report=await reportOp(b,complaint);assert.equal(report.report.state,'open');assert.equal((await reportOp(b,complaint)).replayed,true);
 assert.equal((await reportOp(b,{...complaint,note:'Changed retry'})).error,'operation_conflict');
 assert.equal((await reportOp(b,{...complaint,reportId:id(101)})).error,'report_pending');
 assert.equal((await reportOp(c,complaint)).error,'resource_not_found');
 const complaint2={...complaint,reportId:id(102),note:'Second private explanation'};assert.equal((await reportOp(c,complaint2)).ok,true);
 assert.equal((await reportOp(a,{action:'posts.reports',cursor:null})).items.length,0);
 const mine=await reportOp(b,{action:'posts.reports',cursor:null});assert.equal(mine.items.length,1);assert.equal(JSON.stringify(mine).includes('CONFIDENTIAL'),false);assert.equal(JSON.stringify(mine).includes('Мой личный текст'),false);
 assert.equal((await reportReview(auditor,{action:'reports',cursor:null})).error,'forbidden');assert.equal((await reportReview(qa,{action:'reports',cursor:null})).error,'forbidden');
 const staffReports=await reportReview(manager,{action:'reports',cursor:null});assert.equal(staffReports.items.length,2);assert.equal(staffReports.items[0].context.revision,6);assert.equal(JSON.stringify(staffReports).includes('reporter_hash'),false);
 assert.equal((await reportReview(a,{action:'reports',cursor:null})).items.length,0);
 const resolve={action:'resolveReport',id:id(100),operationId:id(103),expectedRevision:1,decision:'hide',reason:'privacy'};
 assert.equal((await reportReview(a,resolve)).error,'resource_not_found');
 assert.equal((await reportReview(manager,resolve,'2'.repeat(64))).error,'forbidden');assert.equal((await reportReview(auditor,resolve)).error,'forbidden');
 assert.equal((await reportReview(manager,resolve)).report.resolution,'hide');assert.equal((await reportReview(manager,resolve)).replayed,true);assert.equal((await reportReview(manager,{...resolve,decision:'dismiss',reason:'reviewed'})).error,'operation_conflict');
 assert.equal((await op(b,{action:'posts.read',id:id(10)})).error,'resource_not_found');assert.equal((await reportOp(b,complaint)).report.state,'resolved');
 assert.equal((await reportOp(b,{...complaint,reportId:id(104),expectedRevision:7})).error,'resource_not_found');
 const hiddenReports=await reportReview(manager,{action:'reports',cursor:null});assert.equal(hiddenReports.items.length,1);assert.equal(hiddenReports.items[0].context,null);
 assert.equal((await review(manager,{...reopen,operationId:id(105),expectedRevision:7})).post.state,'pending');assert.equal((await review(manager,{...approve,operationId:id(106),expectedRevision:8})).post.state,'published');
 const changed=await reportReview(manager,{action:'reports',cursor:null});assert.equal(changed.items[0].context,null);
 assert.equal((await reportReview(manager,{...resolve,id:id(102),operationId:id(107)})).error,'revision_conflict');
 assert.equal((await reportReview(manager,{...resolve,id:id(102),operationId:id(108),decision:'dismiss',reason:'reviewed'})).report.state,'resolved');
 const reportAudit=await reportReview(auditor,{action:'reportAudit',cursor:null});assert.equal(reportAudit.items.length,2);for(const secret of ['CONFIDENTIAL','Second private','Мой личный текст','reporter_hash'])assert.equal(JSON.stringify(reportAudit).includes(secret),false);
 const feed=await op(b,{action:'posts.feed',cursor:null});assert.equal(feed.items.length,1);assert.equal(feed.items[0].mine,false);
 for(const secret of ['author_hash','account_hash','email','nickname','boundary','granted'])assert.equal(JSON.stringify(feed).includes(secret),false);

 // C01.3: account-bound recipient codes never grant profile permissions.
 const address=actor=>rpc('feture_post_address_command',[actor,JSON.stringify({action:'posts.address'})]);
 const bCode=(await address(b)).code,cCode=(await address(c)).code;
 assert.equal((await address(b)).code,bCode);
 const selected={...create,id:id(200),operationId:id(201),plannedAudience:'granted',recipientCodes:[bCode],text:'SELECTED PRIVATE POST'};
 assert.equal((await op(a,{...selected,recipientCodes:[id(999)]})).error,'recipient_unavailable');
 assert.equal((await op(a,{...selected,recipientCodes:[bCode,bCode]})).error,'invalid_request');
 const selectedDraft=await op(a,selected);assert.deepEqual(selectedDraft.entry.recipientCodes,[bCode]);
 const selectedSubmit={action:'posts.submit',id:id(200),operationId:id(202),expectedRevision:1};
 assert.equal((await op(a,selectedSubmit)).entry.audience,'granted');
 assert.equal((await op(b,{action:'posts.read',id:id(200)})).error,'resource_not_found');
 const queue=await review(manager,{action:'queue',cursor:null});assert.equal(queue.items.find(v=>v.id===id(200)).audience,'granted');
 assert.equal(JSON.stringify(queue).includes(bCode),false);
 assert.equal((await review(manager,{...approve,id:id(200),operationId:id(203),expectedRevision:2})).ok,true);
 const permitted=await op(b,{action:'posts.read',id:id(200)});assert.equal(permitted.entry.text,selected.text);assert.deepEqual(permitted.entry.recipientCodes,[]);
 assert.equal((await op(c,{action:'posts.read',id:id(200)})).error,'resource_not_found');
 // C02.1: saved posts never outlive the post's current visibility.
 const bookmark=(actor,command)=>rpc('feture_post_bookmark_command',[actor,JSON.stringify(command)]);
 const savedList={action:'posts.bookmarks',cursor:null};
 const bookmarkSave={action:'posts.bookmarkSave',id:id(200),operationId:id(7000)};
 assert.deepEqual((await bookmark(b,savedList)).items,[]);
 assert.equal((await bookmark(c,bookmarkSave)).error,'resource_not_found');
 assert.equal((await bookmark(b,{...bookmarkSave,accountHash:b})).error,'invalid_request');
 assert.deepEqual(await bookmark(b,bookmarkSave),{ok:true,saved:true,replayed:false});
 assert.deepEqual(await bookmark(b,bookmarkSave),{ok:true,saved:true,replayed:true});
 assert.equal((await bookmark(b,{...bookmarkSave,id:id(201)})).error,'operation_conflict');
 assert.equal((await bookmark(b,savedList)).items[0].id,id(200));
 assert.equal((await bookmark(b,savedList)).items[0].recipientCodes.length,0);
 assert.equal((await bookmark(b,{action:'posts.bookmarks',cursor:{at:'bad',id:id(200)}})).error,'invalid_cursor');
 assert.equal((await op(b,{action:'posts.feed',cursor:null})).items.some(v=>v.id===id(200)),true);
 assert.equal((await op(c,{action:'posts.feed',cursor:null})).items.some(v=>v.id===id(200)),false);
 const selectedReport={action:'posts.report',id:id(200),reportId:id(204),expectedRevision:3,reason:'privacy',note:'SELECTED REPORT NOTE'};
 assert.equal((await reportOp(c,selectedReport)).error,'resource_not_found');assert.equal((await reportOp(b,selectedReport)).ok,true);
 assert.equal((await reportReview(manager,{action:'reports',cursor:null})).items.find(v=>v.id===id(204)).context.text,selected.text);
 const revoke={action:'posts.revokeRecipient',id:id(200),operationId:id(205),expectedRevision:3,code:bCode};
 assert.equal((await op(c,revoke)).error,'resource_not_found');assert.equal((await op(a,{...revoke,expectedRevision:2})).error,'revision_conflict');
 assert.equal((await op(a,revoke)).entry.state,'published');assert.equal((await op(a,revoke)).replayed,true);
 assert.equal((await op(b,{action:'posts.read',id:id(200)})).error,'resource_not_found');
 assert.deepEqual((await bookmark(b,savedList)).items,[]);
 assert.equal((await bookmark(b,bookmarkSave)).error,'resource_not_found');
 assert.equal((await bookmark(b,{action:'posts.bookmarkRemove',id:id(200),operationId:id(7001)})).error,'resource_not_found');
 assert.equal((await db.query('select count(*)::int n from public.feture_post_bookmarks where account_hash=$1',[b])).rows[0].n,1); // Stored privately, never projected.
 assert.equal((await reportReview(manager,{action:'reports',cursor:null})).items.find(v=>v.id===id(204)).context,null);
 assert.equal((await reportReview(manager,{...resolve,id:id(204),operationId:id(206)})).error,'revision_conflict');
 assert.deepEqual((await op(a,selected)).entry.recipientCodes,[]); // Retry never restores old permission.
 const expanded={...selected,operationId:id(207),expectedRevision:4,recipientCodes:[cCode]};
 assert.equal((await op(a,expanded)).entry.state,'draft');assert.equal((await op(c,{action:'posts.read',id:id(200)})).error,'resource_not_found');
 await op(a,{...selectedSubmit,operationId:id(208),expectedRevision:5});await review(manager,{...approve,id:id(200),operationId:id(209),expectedRevision:6});
 assert.equal((await op(c,{action:'posts.read',id:id(200)})).ok,true);
 const rotate={action:'posts.rotateAddress',operationId:id(210)};
 const rotated=await rpc('feture_post_address_command',[c,JSON.stringify(rotate)]);assert.notEqual(rotated.code,cCode);
 assert.equal((await rpc('feture_post_address_command',[c,JSON.stringify(rotate)])).code,rotated.code);
 assert.equal((await op(c,{action:'posts.read',id:id(200)})).error,'resource_not_found');
 assert.deepEqual((await op(a,expanded)).entry.recipientCodes,[]);
 assert.equal((await op(a,{...expanded,operationId:id(211),expectedRevision:7})).error,'recipient_unavailable');
 assert.equal((await db.query('select count(*) n from public.feture_scoped_grants')).rows[0].n,0);
 await reportReview(manager,{...resolve,id:id(204),operationId:id(212),decision:'dismiss',reason:'reviewed'});
 await op(a,{action:'posts.delete',id:id(200),operationId:id(213),expectedRevision:7});
 await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[c,a]);
 assert.equal((await op(c,{action:'posts.feed',cursor:null})).items.length,0);assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[b]);assert.equal((await op(b,{action:'posts.feed',cursor:null})).error,'resource_not_found');
 const edit={...create,operationId:id(15),expectedRevision:9,text:'Исправленный текст'};assert.equal((await op(a,edit)).entry.state,'draft');assert.equal((await op(c,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{...edit,text:'другой повтор'})).error,'operation_conflict');
 const remove={action:'posts.delete',id:id(10),operationId:id(16),expectedRevision:10};await db.query('update public.feture_verification_attempts set proof_expires_at=clock_timestamp() where account_hash=$1',[a]);
 const deleted=await op(a,remove);assert.equal(deleted.entry.state,'deleted');assert.equal(deleted.entry.text,'');assert.equal(deleted.entry.authorLabel,'');assert.equal((await op(a,remove)).replayed,true);assert.equal((await op(a,create)).entry.state,'deleted');assert.equal((await op(a,submit)).entry.state,'deleted');assert.equal((await review(manager,approve)).post.state,'deleted');assert.equal((await review(manager,{action:'queue',cursor:null})).items.length,0);assert.equal(JSON.stringify(await review(auditor,{action:'audit',cursor:null})).includes('Мой личный текст'),false);
 assert.equal((await op(a,{action:'posts.read',id:id(10)})).error,'resource_not_found');
 assert.equal((await op(a,{action:'posts.mine',cursor:null})).items.length,0);assert.equal((await reportOp(b,{action:'posts.reports',cursor:null})).items[0].state,'resolved');assert.equal((await reportReview(manager,{action:'reports',cursor:null})).items.length,0);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_posts'));await assert.rejects(db.query('select * from public.feture_post_operations'));await assert.rejects(db.query('select * from public.feture_post_addresses'));await assert.rejects(db.query('select * from public.feture_post_recipients'));await assert.rejects(db.query('select * from public.feture_post_bookmarks'));await assert.rejects(db.query('select * from public.feture_post_bookmark_operations'));await assert.rejects(bookmark(b,savedList));await assert.rejects(address(b));await assert.rejects(op(a,{action:'posts.mine',cursor:null}));await assert.rejects(review(manager,{action:'queue',cursor:null}));await assert.rejects(db.query('select * from public.feture_post_reviews'));await assert.rejects(db.query('select * from public.feture_post_reports'));await assert.rejects(reportOp(b,{action:'posts.reports',cursor:null}));await assert.rejects(reportReview(manager,{action:'reports',cursor:null}));}

 // C01.5a: storage metadata never grants direct access or bypasses photo review.
 await db.exec('set role service_role');
 await db.query("update public.feture_verification_attempts set proof_expires_at=clock_timestamp()+interval '1 hour' where account_hash in ($1,$2)",[a,b]);
 const photo=(actor,command)=>rpc('feture_post_photo_command',[actor,JSON.stringify(command)]);
 const photoDraft={...create,id:id(4000),operationId:id(4001)};
 await op(a,photoDraft);
 const prep={action:'prepare',id:id(4000),operationId:id(4002),expectedRevision:1,contentHash:'a'.repeat(64),bytes:270,width:2,height:3,consent:true};
 assert.equal((await photo(b,prep)).error,'resource_not_found');
 assert.equal((await photo(a,{...prep,consent:false})).error,'invalid_request');
 assert.equal((await photo(a,{...prep,path:'https://foreign'})).error,'invalid_request');
 const reserved=await photo(a,prep);assert.equal(reserved.upload,true);assert.equal(reserved.path,id(4000)+'/'+id(4002)+'.jpg');
 assert.equal((await photo(a,{...prep,contentHash:'b'.repeat(64)})).error,'operation_conflict');
 const attach={action:'attach',id:prep.id,operationId:prep.operationId,expectedRevision:1};
 assert.equal((await photo(a,attach)).entry.revision,2);assert.equal((await photo(a,attach)).replayed,true);
 assert.equal((await photo(a,{action:'read',id:prep.id,revision:1})).error,'resource_not_found');
 assert.equal((await photo(b,{action:'read',id:prep.id,revision:2})).error,'resource_not_found');
 assert.equal((await photo(a,{action:'read',id:prep.id,revision:2})).photo.hash,prep.contentHash);
 await op(a,{action:'posts.submit',id:prep.id,operationId:id(4003),expectedRevision:2});

 // C01.5b2a: explicit owner consent is bound to the exact pending photo/post.
 const consent=(actor,command)=>rpc('feture_photo_review_command',[actor,JSON.stringify(command)]);
 const staffRead=(actor,rev=3,gen=generation)=>rpc('feture_staff_photo_read',[actor,gen,prep.id,rev]);
 for(const actor of [qa,auditor,b])assert.equal((await staffRead(actor)).error,'forbidden');
 assert.equal((await staffRead(manager,3,'2'.repeat(64))).error,'forbidden');
 assert.equal((await staffRead(manager)).error,'resource_not_found');
 const status={action:'status',id:prep.id};
 const grant={action:'consent',id:prep.id,operationId:id(4100),expectedRevision:3,expectedConsentRevision:0,consent:true,consentVersion:'photo-staff-review-v1'};
 for(const name of ['feture_photo_review_consents','feture_photo_review_operations'])assert.equal((await db.query('select relrowsecurity from pg_class where oid=$1::regclass',[name])).rows[0].relrowsecurity,true);
 assert.equal((await db.query("select bool_and(not prosecdef) safe from pg_proc where proname in ('feture_photo_review_command','feture_photo_review_status')")).rows[0].safe,true);
 assert.equal((await consent(b,status)).error,'resource_not_found');
 assert.equal((await consent(manager,status)).error,'resource_not_found');
 assert.equal((await consent(a,{...grant,consent:false})).error,'invalid_request');
 assert.equal((await consent(a,{...grant,consentVersion:'other'})).error,'invalid_request');
 assert.equal((await consent(a,Object.fromEntries(Object.entries(grant).filter(([k])=>k!=='consentVersion')))).error,'invalid_request');
 assert.equal((await consent(a,{...grant,contentHash:prep.contentHash})).error,'invalid_request');
 assert.equal((await consent(a,{...grant,expectedRevision:2})).error,'revision_conflict');
 const photoGranted=await consent(a,grant);assert.equal(photoGranted.reviewConsent.active,true);assert.equal(photoGranted.reviewConsent.revision,1);
 assert.deepEqual(Object.keys(photoGranted.reviewConsent).sort(),['active','hasPhoto','postId','postRevision','revision']);
 assert.equal((await consent(a,grant)).replayed,true);
 assert.deepEqual(Object.keys((await staffRead(manager)).photo).sort(),['bytes','consentRevision','hash','height','path','width']);
 assert.equal((await staffRead(manager)).photo.consentRevision,1);
 await db.exec('reset role');await db.query('insert into public.feture_blocks(blocker_hash,blocked_hash) values($1,$2)',[a,manager]);await db.exec('set role service_role');
 assert.equal((await staffRead(manager)).error,'resource_not_found');
 await db.exec('reset role');await db.query('delete from public.feture_blocks where blocker_hash=$1 and blocked_hash=$2',[a,manager]);await db.exec('set role service_role');

 assert.equal((await staffRead(a)).error,'resource_not_found');
 assert.equal((await staffRead(manager,2)).error,'resource_not_found');
 await db.exec('reset role');await db.query("update public.feture_operators set role=null where account_hash=$1",[manager]);await db.exec('set role service_role');
 assert.equal((await staffRead(manager)).error,'forbidden');
 await db.exec('reset role');await db.query("update public.feture_operators set role='manager' where account_hash=$1",[manager]);await db.exec('set role service_role');
 assert.equal((await consent(a,{...grant,expectedConsentRevision:1})).error,'operation_conflict');
 // Consent alone does not unlock staff bytes, ordinary readers or publication.
 assert.equal((await photo(manager,{action:'read',id:prep.id,revision:3})).error,'resource_not_found');
 assert.equal((await photo(b,{action:'read',id:prep.id,revision:3})).error,'resource_not_found');
 await assert.rejects(review(manager,{...approve,id:prep.id,operationId:id(4004),expectedRevision:3}),/photo_review_required/);
 const withdraw={action:'revoke',id:prep.id,operationId:id(4101),expectedConsentRevision:1};
 await db.query("update public.feture_verification_attempts set proof_issued_at=clock_timestamp()-interval '30 seconds',proof_expires_at=clock_timestamp()-interval '1 second' where account_hash=$1",[a]);
 assert.equal((await consent(a,status)).reviewConsent.active,false);
 assert.equal((await staffRead(manager)).error,'resource_not_found');
 assert.equal((await consent(a,withdraw)).reviewConsent.revision,2); // Revoke ignores adult expiry.
 assert.equal((await staffRead(manager)).error,'resource_not_found');
 assert.equal((await consent(a,grant)).reviewConsent.active,false); // Old replay cannot restore consent.
 assert.equal((await consent(a,{...grant,operationId:id(4102),expectedConsentRevision:2})).error,'review_required');
 await db.query("update public.feture_verification_attempts set proof_expires_at=clock_timestamp()+interval '1 hour' where account_hash=$1",[a]);
 assert.equal((await consent(a,{...grant,operationId:id(4103),expectedConsentRevision:1})).error,'revision_conflict');
 assert.equal((await consent(a,{...grant,operationId:id(4104),expectedConsentRevision:2})).reviewConsent.active,true);

 await op(a,{...photoDraft,operationId:id(4110),expectedRevision:3,text:'A changed version'});
 assert.equal((await consent(a,status)).reviewConsent.active,false);
 assert.equal((await consent(a,{...grant,operationId:id(4111),expectedRevision:4,expectedConsentRevision:3})).error,'review_required');
 await op(a,{action:'posts.submit',id:prep.id,operationId:id(4112),expectedRevision:4});
 assert.equal((await consent(a,{...grant,operationId:id(4113),expectedRevision:5,expectedConsentRevision:3})).reviewConsent.active,true);
 const detach={action:'remove',id:prep.id,operationId:id(4005),expectedRevision:5};
 assert.equal((await photo(a,detach)).entry.revision,6);assert.equal((await photo(a,detach)).replayed,true);
 assert.equal((await photo(a,{...detach,expectedRevision:6})).error,'operation_conflict');
 assert.equal((await photo(a,{action:'read',id:prep.id,revision:6})).photo,null);
 assert.equal((await consent(a,status)).reviewConsent.active,false);
 assert.equal((await consent(a,{...grant,operationId:id(4104),expectedConsentRevision:2})).reviewConsent.active,false);
 assert.equal((await consent(a,{...withdraw,operationId:id(4105),expectedConsentRevision:4})).reviewConsent.revision,5);
 assert.equal((await photo(a,prep)).upload,false); // Old retries cannot recreate removed objects.
 assert.equal((await db.query('select count(*) n from public.feture_photo_gc')).rows[0].n,1);
 const prep2={...prep,operationId:id(4006),expectedRevision:6};await photo(a,prep2);
 await photo(a,{...attach,operationId:prep2.operationId,expectedRevision:6});
 await op(a,{action:'posts.delete',id:prep.id,operationId:id(4007),expectedRevision:7});
 assert.equal((await photo(a,prep2)).entry.state,'deleted');assert.equal((await photo(a,{action:'read',id:prep.id,revision:8})).error,'resource_not_found');
 assert.equal((await db.query('select count(*) n from public.feture_photo_gc')).rows[0].n,2);
 const stalePost={...photoDraft,id:id(4010),operationId:id(4011)};await op(a,stalePost);
 const stale={...prep,id:stalePost.id,operationId:id(4012)};await photo(a,stale);
 assert.equal((await consent(a,{action:'status',id:stalePost.id})).reviewConsent.hasPhoto,false);
 assert.equal((await consent(a,{...grant,id:stalePost.id,operationId:id(4120),expectedRevision:1})).error,'review_required');
 const earlyRevoke={action:'revoke',id:stalePost.id,operationId:id(4121),expectedConsentRevision:0};
 assert.equal((await consent(a,earlyRevoke)).reviewConsent.revision,1);
 assert.equal((await consent(a,{...grant,id:stalePost.id,operationId:id(4122),expectedRevision:1})).error,'revision_conflict');
 assert.equal((await consent(a,earlyRevoke)).replayed,true);
 await op(a,{...stalePost,expectedRevision:1,operationId:id(4013),text:'changed'});
 assert.equal((await photo(a,{...attach,id:stale.id,operationId:stale.operationId})).error,'revision_conflict');
 await db.exec('reset role');await db.query("update public.feture_post_photos set created_at=clock_timestamp()-interval '2 days' where operation_id=$1",[stale.operationId]);await db.exec('set role service_role');
 await rpc('feture_photo_sweep',[]);assert.equal((await photo(a,stale)).upload,false);

 // A withdrawal before a first grant creates a monotonic tombstone: delayed grant CAS fails.
 const nextDraft={...photoDraft,id:id(4500),operationId:id(4501)};await op(a,nextDraft);
 const nextPhoto={...prep,id:nextDraft.id,operationId:id(4502)};await photo(a,nextPhoto);await photo(a,{...attach,id:nextDraft.id,operationId:nextPhoto.operationId});
 await op(a,{action:'posts.submit',id:nextDraft.id,operationId:id(4503),expectedRevision:2});
 const initialWithdraw={...withdraw,id:nextDraft.id,operationId:id(4504),expectedConsentRevision:0};
 assert.equal((await consent(a,initialWithdraw)).reviewConsent.revision,1);
 const delayedGrant={...grant,id:nextDraft.id,operationId:id(4506)};
 assert.equal((await consent(a,delayedGrant)).error,'revision_conflict');
 const freshGrant={...delayedGrant,operationId:id(4507),expectedConsentRevision:1};
 assert.equal((await consent(a,freshGrant)).reviewConsent.active,true);
 assert.equal((await consent(a,initialWithdraw)).reviewConsent.active,true); // Replay never withdraws a later explicit grant.
 const replacement={...nextPhoto,operationId:id(4508),expectedRevision:3};await photo(a,replacement);
 await photo(a,{...attach,id:nextDraft.id,operationId:replacement.operationId,expectedRevision:3});
 assert.equal((await consent(a,{action:'status',id:nextDraft.id})).reviewConsent.active,false);
 assert.equal((await consent(a,freshGrant)).reviewConsent.active,false);
 await op(a,{action:'posts.delete',id:nextDraft.id,operationId:id(4509),expectedRevision:4});
 assert.equal((await consent(a,{...initialWithdraw,operationId:id(4510),expectedConsentRevision:2})).reviewConsent.revision,3);
 const noPhoto={...photoDraft,id:id(4600),operationId:id(4601)};await op(a,noPhoto);
 await op(a,{action:'posts.submit',id:noPhoto.id,operationId:id(4602),expectedRevision:1});
 assert.equal((await consent(a,{...grant,id:noPhoto.id,operationId:id(4603),expectedRevision:2})).error,'resource_not_found');
 // Erasure outbox survives profile cascade and contains only opaque paths.
 await db.exec('reset role');await db.query('delete from public.feture_profiles where account_hash=$1',[a]);await db.exec('set role service_role');
 assert.equal((await db.query('select count(*) n from public.feture_post_photos')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from public.feture_photo_review_consents')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from public.feture_photo_review_operations')).rows[0].n,0);
 assert.equal((await db.query('select count(*) n from public.feture_photo_gc')).rows[0].n,5);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from public.feture_post_photos'));await assert.rejects(db.query('select * from public.feture_photo_gc'));await assert.rejects(photo(b,{action:'read',id:prep.id,revision:2}));await assert.rejects(rpc('feture_photo_sweep',[]));await assert.rejects(db.query('select * from public.feture_photo_review_consents'));await assert.rejects(db.query('select * from public.feture_photo_review_operations'));await assert.rejects(consent(b,status));await assert.rejects(rpc('feture_photo_review_status',[b,prep.id]));await assert.rejects(staffRead(manager));}
 }finally{await db.close();}
});
