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
  activities:[{id:'a1',revision:1,type:'theory',tags:[],revisionProgress:'preserve',body:{ru:'I work.'},format:'text'}]
};
const lexicon={
  schemaVersion:1,revision:1,entries:[
    {
      id:'work',revision:1,language:'en',lemma:'work',forms:[{text:'work',kind:'lemma'}],
      senses:[
        {id:'verb',translations:{ru:['работать']},tags:['needs-review']},
        {id:'noun',translations:{ru:['работа']},tags:['needs-review']}
      ],examples:[],deprecated:false
    },
    {
      id:'pronoun-i',revision:1,language:'en',lemma:'I',forms:[{text:'I',kind:'lemma'}],
      senses:[{id:'pronoun',partOfSpeech:'pronoun',translations:{ru:['я']},tags:[]}],
      examples:[],deprecated:false
    }
  ]
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

  const blockedImport=await action(handler,'content_legacy_import');
  assert.equal(blockedImport.status,409);
  assert.equal(blockedImport.body.error,'draft_exists_use_overwrite');
  const overwritten=await action(handler,'content_legacy_import',{overwrite:true});
  assert.equal(overwritten.status,200);

  const structure=await action(handler,'content_course_structure');
  assert.equal(structure.status,200);
  assert.equal(structure.body.roadmaps[0].nodes[0].id,'day-1');
  assert.equal(structure.body.roadmaps[0].nodes[0].activityCount,1);

  const nodeBefore=await action(handler,'content_course_node',{roadmapId:'main',nodeId:'day-1'});
  assert.equal(nodeBefore.status,200);
  assert.equal(nodeBefore.body.activities.length,1);
  assert.equal(nodeBefore.body.activities[0].id,'a1');

  const openedActivity=await action(handler,'content_activity_get',{activityId:'a1'});
  assert.equal(openedActivity.status,200);
  const editedActivity=JSON.parse(JSON.stringify(openedActivity.body.activity));
  editedActivity.body.ru='I work online.';
  editedActivity.revisionProgress='reset';
  const savedActivity=await action(handler,'content_activity_save',{
    activityId:'a1',expectedRevision:1,activity:editedActivity
  });
  assert.equal(savedActivity.status,200);
  assert.equal(savedActivity.body.activity.revision,2);
  assert.equal(savedActivity.body.activity.body.ru,'I work online.');
  assert.equal(savedActivity.body.activity.revisionProgress,'reset');

  const staleActivity=await action(handler,'content_activity_save',{
    activityId:'a1',expectedRevision:1,activity:editedActivity
  });
  assert.equal(staleActivity.status,400);
  assert.equal(staleActivity.body.error,'activity_revision_conflict');

  const createdActivity=await action(handler,'content_activity_create',{
    roadmapId:'main',nodeId:'day-1',type:'text-input'
  });
  assert.equal(createdActivity.status,200);
  const createdId=createdActivity.body.activity.id;
  assert.ok(/^activity\.text-input\./.test(createdId));

  const nodeWithNew=await action(handler,'content_course_node',{roadmapId:'main',nodeId:'day-1'});
  assert.deepEqual(nodeWithNew.body.node.activityIds,['a1',createdId]);

  const reordered=await action(handler,'content_activity_reorder',{
    roadmapId:'main',nodeId:'day-1',activityIds:[createdId,'a1']
  });
  assert.equal(reordered.status,200);
  assert.deepEqual(reordered.body.node.activityIds,[createdId,'a1']);

  const detached=await action(handler,'content_activity_detach',{
    roadmapId:'main',nodeId:'day-1',activityId:createdId
  });
  assert.equal(detached.status,200);
  assert.deepEqual(detached.body.node.activityIds,['a1']);

  const detachedEntity=await action(handler,'content_activity_get',{activityId:createdId});
  assert.equal(detachedEntity.status,200);
  assert.equal(detachedEntity.body.activity.id,createdId);

  const createdSet=await action(handler,'content_set_create',{
    id:'b1-b2',title:'B1–B2',levelFrom:'b1',levelTo:'b2',accessMode:'entitlement',freeDays:3
  });
  assert.equal(createdSet.status,200);
  assert.equal(createdSet.body.set.id,'b1-b2');

  // Learner-addressed past tense gets both forms in the draft; a second run finds nothing.
  const gf=await action(handler,'content_gender_fix',{setId:'general-foundation'});
  assert.equal(gf.status,200);
  assert.equal(typeof gf.body.changed,'number');
  const gfAgain=await action(handler,'content_gender_fix',{setId:'general-foundation'});
  assert.equal(gfAgain.body.changed,0);

  const a1=await action(handler,'content_a1_seed');
  assert.equal(a1.status,200);
  assert.equal(a1.body.id,'a1-starter');

  const sets=await action(handler,'content_sets_list');
  assert.equal(sets.status,200);
  assert.ok(sets.body.sets.some(set=>set.id==='a1-starter'&&set.draftRevision));
  assert.ok(sets.body.sets.some(set=>set.id==='general-foundation'));
  assert.ok(sets.body.sets.some(set=>set.id==='b1-b2'));

  const bStructure=await action(handler,'content_course_structure',{setId:'b1-b2'});
  assert.equal(bStructure.status,200);
  assert.equal(bStructure.body.set.id,'b1-b2');
  assert.equal(bStructure.body.roadmaps[0].nodes.length,1);

  const bSaved=await action(handler,'content_set_save',{
    setId:'b1-b2',
    expectedDraftRevision:bStructure.body.draftRevision,
    changes:{title:'B1 to B2',description:'Second set',levelFrom:'b1',levelTo:'b2',accessMode:'entitlement',freeDays:5}
  });
  assert.equal(bSaved.status,200);
  assert.equal(bSaved.body.set.title.ru,'B1 to B2');
  assert.equal(bSaved.body.set.access.freePreview.days,5);

  const staleSet=await action(handler,'content_set_save',{
    setId:'b1-b2',
    expectedDraftRevision:bStructure.body.draftRevision,
    changes:{title:'stale'}
  });
  assert.equal(staleSet.status,400);
  assert.equal(staleSet.body.error,'set_revision_conflict');

  const bNode=await action(handler,'content_node_create',{setId:'b1-b2',roadmapId:'main',title:'День 2'});
  assert.equal(bNode.status,200);
  assert.equal(bNode.body.node.dayIndex,2);
  assert.deepEqual(bNode.body.node.prerequisites,['day-1']);

  const bNodeSaved=await action(handler,'content_node_save',{
    setId:'b1-b2',roadmapId:'main',nodeId:bNode.body.node.id,expectedVersion:bNode.body.version,
    changes:{title:'Разговорный день',kind:'practice',optional:true}
  });
  assert.equal(bNodeSaved.status,200);
  assert.equal(bNodeSaved.body.node.kind,'practice');
  assert.equal(bNodeSaved.body.node.optional,true);

  const bActivity=await action(handler,'content_activity_create',{
    setId:'b1-b2',roadmapId:'main',nodeId:'day-1',type:'theory'
  });
  assert.equal(bActivity.status,200);

  const crossSet=await action(handler,'content_activity_get',{setId:'b1-b2',activityId:'a1'});
  assert.equal(crossSet.status,404);
  assert.equal(crossSet.body.error,'activity_not_found');

  const bNodeList=await action(handler,'content_course_structure',{setId:'b1-b2'});
  const bNodes=bNodeList.body.roadmaps[0].nodes;
  const reorderedNodes=await action(handler,'content_node_reorder',{
    setId:'b1-b2',roadmapId:'main',nodeIds:[bNodes[1].id,bNodes[0].id]
  });
  assert.equal(reorderedNodes.status,200);

  const blockedDelete=await action(handler,'content_node_delete',{
    setId:'b1-b2',roadmapId:'main',nodeId:'day-1'
  });
  assert.equal(blockedDelete.status,400);
  assert.equal(blockedDelete.body.error,'node_has_dependents');

  const aiPrompt=await action(handler,'content_lexicon_ai_prompt',{setId:'general-foundation',limit:20});
  assert.equal(aiPrompt.status,200);
  assert.equal(aiPrompt.body.format,'unmute.lexicon.patch.v1');
  assert.ok(aiPrompt.body.targetCount>=1);
  assert.ok(aiPrompt.body.prompt.includes('unmute.lexicon.patch.v1'));
  assert.ok(aiPrompt.body.coverage.missingSurfaces>=1);

  const blockedIncomplete=await action(handler,'content_publish',{setIds:['general-foundation']});
  assert.equal(blockedIncomplete.status,409);
  assert.equal(blockedIncomplete.body.error,'lexical_coverage_incomplete');
  assert.ok(blockedIncomplete.body.sets['general-foundation'].missingSurfaces>=1);

  const patchText=JSON.stringify({
    format:'unmute.lexicon.patch.v1',
    entries:[{
      lemma:'online',
      forms:[{text:'online',kind:'lemma',ipa:'ˌɑːnˈlaɪn',ruReading:'онлайн'}],
      senses:[{
        partOfSpeech:'adverb',
        translations:['онлайн','в интернете'],
        examples:[{en:'I work online.',ru:'Я работаю онлайн.'}]
      }]
    }]
  });
  const patchPreview=await action(handler,'content_lexicon_patch_preview',{
    setId:'general-foundation',text:patchText
  });
  assert.equal(patchPreview.status,200);
  assert.equal(patchPreview.body.summary.creates,1);
  assert.equal(patchPreview.body.summary.conflicts,0);
  assert.equal(patchPreview.body.changes[0].lemma,'online');

  const patchApplied=await action(handler,'content_lexicon_patch_apply',{
    setId:'general-foundation',text:patchText
  });
  assert.equal(patchApplied.status,200);
  assert.equal(patchApplied.body.applied,1);
  assert.ok(patchApplied.body.coverage.resolvedSurfaces>=2);
  assert.ok((await Lexicon.getDraft()).entries.some(entry=>entry.lemma==='online'));

  const queue=await action(handler,'content_review_queue');
  assert.equal(queue.status,200);
  assert.equal(queue.body.count,1);
  assert.equal(queue.body.items[0].lemma,'work');
  assert.equal(queue.body.items[0].revision,1);
  assert.equal(reviewItems(await Lexicon.getDraft()).length,1);

  const opened=await action(handler,'content_lexeme_get',{lexemeId:'work'});
  assert.equal(opened.status,200);
  assert.equal(opened.body.lexeme.senses.length,2);

  const saved=await action(handler,'content_lexeme_save',{
    lexemeId:'work',
    expectedRevision:1,
    reviewed:true,
    changes:{senses:[
      {id:'verb',partOfSpeech:'verb',translations:{ru:['работать']},tags:['needs-review']},
      {id:'noun',partOfSpeech:'noun',translations:{ru:['работа','труд']},tags:['needs-review']}
    ]}
  });
  assert.equal(saved.status,200);
  assert.equal(saved.body.lexeme.revision,2);
  assert.equal(saved.body.lexeme.senses[0].partOfSpeech,'verb');
  assert.equal(saved.body.lexeme.senses[1].translations.ru[1],'труд');
  assert.equal(saved.body.remainingReview,0);
  assert.ok(saved.body.lexeme.senses.every(sense=>!sense.tags.includes('needs-review')));

  const stale=await action(handler,'content_lexeme_save',{
    lexemeId:'work',
    expectedRevision:1,
    changes:{senses:saved.body.lexeme.senses}
  });
  assert.equal(stale.status,400);
  assert.equal(stale.body.error,'lexeme_revision_conflict');

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

  const publishedB=await action(handler,'content_publish',{setIds:['b1-b2']});
  assert.equal(publishedB.status,200);
  assert.equal(publishedB.body.release.revision,2);
  assert.equal(publishedB.body.release.sets['general-foundation'],1);
  assert.equal(publishedB.body.release.sets['b1-b2'],1);
  assert.equal(publishedB.body.courses['b1-b2'].revision,1);
  assert.equal((await Release.getReleasedSet('general-foundation')).revision,1);
  assert.equal((await Release.getReleasedSet('b1-b2')).revision,1);

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
  assert.equal(after.body.lexicon.published.revision,2);

  console.log('UnMute content Admin tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
