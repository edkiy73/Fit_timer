'use strict';

process.env.ALLOW_MEMORY_STORE='1';

const assert=require('assert');
const {store}=require('../../../packages/core/server/store');
const Content=require('../lib/content-store');
const Lexicon=require('../lib/lexicon-store');
const ContentDraft=require('../lib/content-draft-workspace');
const LexiconDraft=require('../lib/lexicon-draft-workspace');

const course={
  schemaVersion:1,id:'general-foundation',revision:1,slug:'general-foundation',
  title:{ru:'Test'},level:{from:'a1',to:'b1',labels:[]},
  access:{mode:'entitlement',entitlement:'course.general-foundation',freePreview:{kind:'first-days',days:7,learnedContentStaysAvailable:true}},
  defaultRoadmapId:'main',
  roadmaps:[{id:'main',title:{ru:'Main'},nodes:[
    {id:'day-1',kind:'lesson',title:{ru:'Day 1'},dayIndex:1,order:0,prerequisites:[],activityIds:['a1','a2'],optional:false}
  ]}],
  activities:[
    {id:'a1',revision:1,type:'theory',tags:[],revisionProgress:'preserve',body:{ru:'old'},format:'text'},
    {id:'a2',revision:1,type:'text-input',tags:[],revisionProgress:'preserve',prompt:{ru:'Q'},answer:{accepted:['A'],nearMiss:true,caseSensitive:false}}
  ],
  draftUpdatedAt:'legacy'
};

const lexicon={
  schemaVersion:1,revision:1,entries:[
    {id:'work',revision:1,language:'en',lemma:'work',forms:[{text:'work',kind:'lemma'}],
      senses:[{id:'verb',partOfSpeech:'verb',translations:{ru:['работать']},tags:['needs-review']}],
      examples:[],deprecated:false},
    {id:'home',revision:1,language:'en',lemma:'home',forms:[{text:'home',kind:'lemma'}],
      senses:[{id:'noun',partOfSpeech:'noun',translations:{ru:['дом']},tags:[]}],
      examples:[],deprecated:false}
  ],
  draftUpdatedAt:'legacy'
};

(async()=>{
  // Simulate drafts that already exist in production from the pre-workspace implementation.
  await store.pipe([
    ['SET',Content.keys.draftKey('general-foundation'),JSON.stringify(course)],
    ['SET',Lexicon.keys.DRAFT,JSON.stringify(lexicon)]
  ]);

  const legacyCourse=await Content.getDraft('general-foundation');
  const legacyLexicon=await Lexicon.getDraft();
  assert.equal(legacyCourse.activities[0].body.ru,'old');
  assert.equal(legacyLexicon.entries[0].revision,1);
  assert.equal(await store.get(ContentDraft.keys.pointerKey('general-foundation')),null);
  assert.equal(await store.get(LexiconDraft.keys.POINTER),null);

  // First entity edit lazily migrates the old monolith and only advances that entity.
  const changedLexeme=await Lexicon.updateDraftLexeme('work',current=>{
    current.senses[0].translations.ru=['работать','трудиться'];
    return current;
  },1);
  assert.equal(changedLexeme.revision,2);
  assert.ok(await store.get(LexiconDraft.keys.POINTER));

  const changedActivity=await Content.updateDraftActivity('general-foundation','a1',1,current=>{
    current.body.ru='new';
    return current;
  });
  assert.equal(changedActivity.activity.revision,2);
  assert.ok(await store.get(ContentDraft.keys.pointerKey('general-foundation')));

  // Legacy blobs remain untouched: entity edits no longer rewrite hundreds of siblings.
  const oldCourseBlob=JSON.parse(await store.get(Content.keys.draftKey('general-foundation')));
  const oldLexiconBlob=JSON.parse(await store.get(Lexicon.keys.DRAFT));
  assert.equal(oldCourseBlob.activities[0].body.ru,'old');
  assert.equal(oldLexiconBlob.entries[0].revision,1);

  const normalizedCourse=await Content.getDraft('general-foundation');
  const normalizedLexicon=await Lexicon.getDraft();
  assert.equal(normalizedCourse.activities.find(x=>x.id==='a1').body.ru,'new');
  assert.equal(normalizedCourse.activities.find(x=>x.id==='a2').revision,1);
  assert.equal(normalizedLexicon.entries.find(x=>x.id==='work').revision,2);
  assert.equal(normalizedLexicon.entries.find(x=>x.id==='home').revision,1);
  assert.ok(normalizedCourse.draftRevision>=2);
  assert.ok(normalizedLexicon.draftRevision>=2);

  // Published snapshots are still assembled as whole immutable documents.
  const stagedCourse=await Content.stageDraft('general-foundation');
  const stagedLexicon=await Lexicon.stageDraft();
  assert.equal(stagedCourse.activities.find(x=>x.id==='a1').body.ru,'new');
  assert.equal(stagedCourse.draftRevision,undefined);
  assert.equal(stagedLexicon.entries.find(x=>x.id==='work').revision,2);
  assert.equal(stagedLexicon.draftRevision,undefined);

  console.log('UnMute normalized draft workspace tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
