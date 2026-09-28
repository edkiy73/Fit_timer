'use strict';

process.env.ALLOW_MEMORY_STORE='1';
process.env.ADMIN_KEY='unmute-lexicon-admin';

const assert=require('assert');
const Lexicon=require('../lib/lexicon-store');
const handler=require('../api/lexicon');

function res(){return {statusCode:0,headers:{},body:'',setHeader(k,v){this.headers[k]=v;},end(v){this.body=v||'';}};}
async function call(req){
  const out=res();
  await handler({headers:{},query:{},...req},out);
  let body={};try{body=JSON.parse(out.body||'{}');}catch(_){}
  return {status:out.statusCode,body};
}

const sample={
  schemaVersion:1,revision:1,entries:[
    {
      id:'work',revision:1,language:'en',lemma:'work',
      forms:[
        {text:'work',kind:'lemma'},{text:'works',kind:'inflection'},{text:'worked',kind:'inflection'},{text:'working',kind:'inflection'}
      ],
      pronunciation:{ipa:'wɜːrk',ruReading:'уёрк'},
      senses:[
        {id:'verb',partOfSpeech:'verb',translations:{ru:['работать']},tags:[]},
        {id:'noun',partOfSpeech:'noun',translations:{ru:['работа','труд']},tags:[]}
      ],
      examples:[
        {id:'work-verb-1',senseId:'verb',text:'I work from home.',translations:{ru:'Я работаю из дома.'},source:{sourceKind:'legacy'}},
        {id:'work-noun-1',senseId:'noun',text:'I have a lot of work.',translations:{ru:'У меня много работы.'},source:{sourceKind:'manual'}}
      ],
      deprecated:false
    },
    {
      id:'read',revision:1,language:'en',lemma:'read',
      forms:[
        {id:'base',text:'read',kind:'lemma',pronunciation:{ipa:'/riːd/'}},
        {id:'past',text:'read',kind:'inflection',pronunciation:{ipa:'/rɛd/'}},
        {id:'participle',text:'read',kind:'inflection',pronunciation:{ipa:'/rɛd/'}}
      ],
      senses:[{id:'verb',partOfSpeech:'verb',translations:{ru:['читать']},tags:[]}],
      examples:[],deprecated:false
    },
    {
      id:'working-adjective',revision:1,language:'en',lemma:'working',
      forms:[{text:'working',kind:'lemma'}],
      senses:[{id:'adjective',partOfSpeech:'adjective',translations:{ru:['работающий','рабочий']},tags:[]}],
      examples:[],deprecated:false
    }
  ]
};

(async()=>{
  Lexicon.validateLexicon(sample);
  await Lexicon.putDraft(sample);
  const published=await Lexicon.publish();
  assert.equal(published.revision,1);

  // Ambiguous surface is returned as multiple explicit candidates; never silently replaced.
  const working=Lexicon.lookup(published,'working');
  assert.deepEqual(working.map(x=>x.id),['work','working-adjective']);

  // No heuristic stemming: unknown strings stay unknown.
  assert.deepEqual(Lexicon.lookup(published,'worker'),[]);
  assert.deepEqual(Lexicon.lookup(published,'workes'),[]);

  const work=Lexicon.lookup(published,'worked');
  assert.equal(work.length,1);
  assert.equal(work[0].id,'work');
  assert.equal(work[0].senses.length,2);
  assert.equal(work[0].examples.find(x=>x.senseId==='verb').translations.ru,'Я работаю из дома.');
  assert.equal(work[0].examples.find(x=>x.senseId==='noun').translations.ru,'У меня много работы.');

  const read=Lexicon.lookup(published,'read');
  assert.equal(read.length,1);
  assert.equal(read[0].id,'read');
  assert.equal(read[0].forms.filter(form=>form.text==='read').length,3);

  const badDuplicate=JSON.parse(JSON.stringify(sample));
  badDuplicate.entries[1].forms[1].id=undefined;
  assert.throws(()=>Lexicon.validateLexicon(badDuplicate),/duplicate_form_requires_id/);

  const lookup=await call({method:'GET',query:{action:'lookup',q:'working'}});
  assert.equal(lookup.status,200);
  assert.equal(lookup.body.entries.length,2);

  const bad=JSON.parse(JSON.stringify(sample));
  bad.entries[0].examples[0].senseId='noun-missing';
  assert.throws(()=>Lexicon.validateLexicon(bad),/unknown_example_sense/);

  console.log('UnMute lexicon tests passed');
})().catch(error=>{console.error(error);process.exit(1);});
