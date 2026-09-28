'use strict';

process.env.ALLOW_MEMORY_STORE='1';
process.env.ADMIN_KEY='unmute-content-admin-test';

const assert=require('assert');
const { createContentAdminHandler, reviewItems, LEGACY_SHA }=require('../lib/content-admin');
const Content=require('../lib/content-store');
const Lexicon=require('../lib/lexicon-store');
const Release=require('../lib/content-release');

function res(){
  return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v||'';}};
}
async function action(handler,name,body={}){
  const out=res();
  const handled=await handler(name,{action:name,...body},out);
  let parsed={};try{parsed=JSON.parse(out.body||'{}');}catch(_){}
  return {handled,status:out.statusCode,body:parsed};
}

const model={fixture:true};
const course={
  schemaVersion:1,id:'general-foundation',revision:1,slug:'general-foundation',title:{ru:'Test'},
  level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'entitlement',entitlement:'course.general-foundation',freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Main'},nodes:[{id:'day-1',kind:'lesson',title:{ru:'Day 1'},dayIndex:1,order:0,prerequisites:[],activityIds:['a1'],optional:false}]}],
  activities:[{id:'a1',revision:1,type:'theory',tags:[],revisionProgress:'preserve',body:{ru:'x'},format:'text'}]
};
const lexicon={
  schemaVersion:1,revision:1,entries:[{
    id:'work',revision:1,language:'en',lemma:'work',forms:[{text:'work',kind:'lemma'}],
    senses:[
      {id:'verb',translations:{ru:['работать']},tags:['needs-review']},
      {id:'noun',translations:{ru:['работа']},tags:['needs-review']}
    ],examples:[],deprecated:false
  }]
};
const report={lessons:32,cards:452,planDays:40,dictionaryEntries:577};

(async()=>{
  const importer={
    parseLegacySource(source){assert.equal(source,'fixture-source');return model;},
    buildCourseSet(input){assert.equal(input,model);return course;},
    buildLexicon(input){assert.equal(input,model);return lexicon;},
    validateImport(input,c,l){assert.equal(input,model);assert.equal(c,course);assert.equal(l,lexicon);return report;}
  };
  const handler=createContentAdminHandler({
    loadLegacySource:async()=> 'fixture-source',
    loadImporter:async()=> importer
  });

  const ignored=await action(handler,'users_list');
  assert.equal(ignored.handled,false);

  const imported=await action(handler,'content_legacy_import');
  assert.equal(imported.handled,true);
  assert.equal(imported.status,200);
  assert.equal(imported.body.report.cards,452);
  assert.equal(imported.body.sourceSha,LEGACY_SHA);
  assert.ok(await Content.getDraft('general-foundation'));
  assert.ok(await Lexicon.getDraft());

  const queue=await action(handler,'content_review_queue');
  assert.equal(queue.status,200);
  assert.equal(queue.body.count,1);
  assert.equal(queue.body.items[0].lemma,'work');
  assert.equal(reviewItems(await Lexicon.getDraft()).length,1);

  const before=await action(handler,'content_status');
  assert.equal(before.status,200);
  assert.equal(before.body.course.published,null);

  const published=await action(handler,'content_publish');
  assert.equal(published.status,200);
  assert.equal(published.body.course.revision,1);
  assert.equal(published.body.lexicon.revision,1);
  assert.equal(published.body.release.revision,1);
  assert.equal(published.body.release.sets['general-foundation'],1);
  assert.equal(published.body.release.lexiconRevision,1);

  // A newly staged course snapshot is invisible until a new paired release pointer is committed.
  const nextDraft=await Content.getDraft('general-foundation');
  nextDraft.title.ru='Staged but not released';
  await Content.putDraft(nextDraft);
  const staged=await Content.stageDraft('general-foundation');
  assert.equal(staged.revision,2);
  const stillReleased=await Release.getReleasedSet('general-foundation');
  assert.equal(stillReleased.revision,1);
  assert.equal(stillReleased.title.ru,'Test');

  const after=await action(handler,'content_status');
  assert.equal(after.body.course.published.revision,1);
  assert.equal(after.body.lexicon.published.revision,1);

  console.log('UnMute content Admin tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
