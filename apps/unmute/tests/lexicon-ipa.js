'use strict';

const assert=require('assert');
const Ipa=require('../lib/lexicon-ipa');

const source=[
  'work\t/ˈwɝk/',
  'worked\t/ˈwɝkt/',
  'read\t/ˈɹid/, /ˈɹɛd/',
  "it's\t/ˈɪts/"
].join('\n');

assert.deepEqual(Ipa.parseIpaVariants('/ˈɹid/, /ˈɹɛd/'),['ˈɹid','ˈɹɛd']);
const map=Ipa.parseNeededIpa(source,new Set(['worked','read','missing']));
assert.deepEqual(map.get('worked'),['ˈwɝkt']);
assert.deepEqual(map.get('read'),['ˈɹid','ˈɹɛd']);
assert.equal(map.has('work'),false);

const lexicon={entries:[
  {
    id:'lex.work',revision:4,language:'en',lemma:'work',
    forms:[
      {text:'work',kind:'lemma'},
      {text:'worked',kind:'inflection',pronunciation:{ruReading:'уёркт'}}
    ],
    pronunciation:{ipa:'legacy-work',ruReading:'уёрк'},
    senses:[{id:'verb',translations:{ru:['работать']},tags:[]}],
    examples:[],deprecated:false
  },
  {
    id:'lex.read',revision:2,language:'en',lemma:'read',
    forms:[{text:'read',kind:'lemma'}],
    senses:[{id:'verb',translations:{ru:['читать']},tags:[]}],
    examples:[],deprecated:false
  }
]};

const audit={resolved:[
  {surface:'work',lexemeIds:['lex.work']},
  {surface:'worked',lexemeIds:['lex.work']},
  {surface:'read',lexemeIds:['lex.read']}
]};

const plan=Ipa.planIpaEnrichment(lexicon,audit,source);
assert.equal(plan.summary.alreadyHaveIpa,1);
assert.equal(plan.summary.formsChanged,2);
assert.equal(plan.summary.lexemesChanged,2);

const work=plan.changes.find(change=>change.id==='lex.work').entry;
assert.equal(work.pronunciation.ipa,'legacy-work');
const worked=work.forms.find(form=>form.text==='worked');
assert.equal(worked.pronunciation.ipa,'ˈwɝkt');
assert.equal(worked.pronunciation.ruReading,'уёркт');
assert.equal(worked.pronunciation.source.version,Ipa.SOURCE.commit);

const read=plan.changes.find(change=>change.id==='lex.read').entry;
const readForm=read.forms.find(form=>form.text==='read');
assert.equal(readForm.pronunciation.ipa,'ˈɹid');
assert.deepEqual(readForm.pronunciation.ipaVariants,['ˈɹid','ˈɹɛd']);
assert.equal(readForm.pronunciation.source.license,'MIT');

console.log('UnMute IPA bootstrap tests passed');
