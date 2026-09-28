'use strict';

const assert=require('assert');
const Ipa=require('../lib/ipa-bootstrap');

const source=[
  "work\t/wɝːk/",
  "worked\t/wɝːkt/",
  "working\t/ˈwɝːkɪŋ/",
  "home\t/hoʊm/",
  "a\t/ˈeɪ/, /ə/"
].join('\n');

const parsed=Ipa.parseIpaSource(source);
assert.equal(parsed.get('worked'),'/wɝːkt/');
assert.equal(parsed.get('a'),'/ˈeɪ/, /ə/');

const lexicon={
  entries:[
    {
      id:'lex.work',revision:4,language:'en',lemma:'work',
      pronunciation:{ipa:'/wɝːk/'},
      forms:[
        {text:'work',kind:'lemma'},
        {text:'worked',kind:'inflection'},
        {text:'working',kind:'inflection',pronunciation:{ipa:'/custom/' }}
      ],
      senses:[{id:'verb',translations:{ru:['работать']}}],
      examples:[]
    },
    {
      id:'lex.home',revision:2,language:'en',lemma:'home',
      forms:[{text:'home',kind:'lemma',pronunciation:{ruReading:'хоум'}}],
      senses:[{id:'noun',translations:{ru:['дом']}}],
      examples:[]
    },
    {
      id:'lex.unknown',revision:1,language:'en',lemma:'zzz',
      forms:[{text:'zzz',kind:'lemma'}],
      senses:[{id:'other',translations:{ru:['zzz']}}],
      examples:[]
    }
  ]
};

const plan=Ipa.planIpaBootstrap(lexicon,source);
assert.equal(plan.source.sha,Ipa.IPA_SOURCE_SHA);
assert.equal(plan.report.forms,5);
assert.equal(plan.report.alreadyHaveIpa,2); // lemma work fallback + custom working
assert.equal(plan.report.updatedForms,2); // worked + home
assert.equal(plan.report.unmatched,1);
assert.equal(plan.report.updatedLexemes,2);

const work=plan.changes.find(change=>change.id==='lex.work');
assert.equal(work.expectedRevision,4);
assert.equal(work.entry.forms.find(form=>form.text==='worked').pronunciation.ipa,'/wɝːkt/');
assert.equal(work.entry.pronunciation.ipa,'/wɝːk/');
assert.equal(work.entry.forms.find(form=>form.text==='working').pronunciation.ipa,'/custom/');

const home=plan.changes.find(change=>change.id==='lex.home');
assert.equal(home.entry.forms[0].pronunciation.ruReading,'хоум');
assert.equal(home.entry.forms[0].pronunciation.ipa,'/hoʊm/');

console.log('UnMute IPA bootstrap tests passed');
