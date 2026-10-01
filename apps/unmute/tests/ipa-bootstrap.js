'use strict';

const assert=require('assert');
const Ipa=require('../lib/ipa-bootstrap');

// Britfone notation: SURFACE(variant), phonemes with the stress mark before the vowel.
const source=[
  'WORK, w ˈɜː k',
  'WORKED, w ˈɜː k t',
  'WORKING, w ˈɜː k ɪ ŋ',
  'TRYING(1), t ɹ ˈaɪ ŋ',
  'TRYING(2), t ɹ ˈaɪ ɪ ŋ',
  'LIVE(1), l ˈɪ v',
  'LIVE(2), l ˈaɪ v',
  'A(1), ə',
  'A(2), ˈeɪ',
  'WATER, w ˈɔː t ə',
  'STATION, s t ˈeɪ ʃ ə n',
  'BIRTHDAY, b ˈɜː θ d ˌeɪ',
  'UNDERSTAND, ˌʌ n d ə s t ˈæ n d',
  'NEW, n j ˈuː',
  'MONTHS, m ˈɐ n θ s',
  'GET, ɡ ˈɛ t',
  'UP, ˈʌ p',
  'HOUR, ˈaʊ ə'
].join('\n');

const index=Ipa.parseIpaSource(source);
const say=(surface,existing)=>Ipa.britishFor(index,surface,existing);

// British learner-dictionary symbols, stress before the syllable, none on one-syllable words.
assert.deepEqual(say('work'),{from:'dictionary',ipa:'wɜːk',ruReading:'уёк'});
assert.equal(say('understand').ipa,'ˌʌndəˈstænd');
assert.equal(say('understand').ruReading,'андэстэ́нд');
assert.equal(say('birthday').ipa,'ˈbɜːθdeɪ');
assert.equal(say('get up').ipa,'ɡet ʌp');
assert.equal(say('get up').ruReading,'гэт ап');
// Russian hints: final schwa, syllabic -ən, iotation, θs → one letter.
assert.equal(say('water').ruReading,'уо́та');
assert.equal(say('hour').ruReading,'а́уэ');
assert.equal(say('station').ruReading,'стэ́йшн');
assert.equal(say('new').ruReading,'нью');
assert.equal(say('months').ruReading,'манс');
// Variant choice: weak "a", full "-ing", and the stored vowel decides homographs.
assert.equal(say('a').ipa,'ə');
assert.equal(say('trying').ipa,'ˈtraɪɪŋ');
assert.equal(say('live').ipa,'lɪv');
assert.equal(say('live','/laɪv/').ipa,'laɪv');
// Contractions come from the built-in supplement.
assert.equal(say("i'm").ipa,'aɪm');
// Outside the dictionary: the stored transcription stays, without the American r.
assert.deepEqual(say('zorb','ˈzɔːrb'),{from:'stored',ipa:'zɔːb',ruReading:'зоб'});
assert.equal(say('zorb'),null);

const lexicon={
  entries:[
    {
      id:'lex.work',revision:4,language:'en',lemma:'work',
      pronunciation:{ipa:'wɜːrk',ruReading:'уёрк'},
      forms:[
        {text:'work',kind:'lemma'},
        {text:'worked',kind:'inflection'},
        {text:'working',kind:'inflection',pronunciation:{ipa:'ˈwɜːkɪŋ',ruReading:'уёкинг',audioKey:'a1'}}
      ],
      senses:[{id:'verb',translations:{ru:['работать']}}],
      examples:[]
    },
    {
      id:'lex.live',revision:2,language:'en',lemma:'live',
      pronunciation:{ipa:'laɪv'},
      forms:[{text:'live',kind:'lemma'}],
      senses:[{id:'adjective',translations:{ru:['живой']}}],
      examples:[]
    },
    {
      id:'lex.phrase',revision:1,language:'en',lemma:'nice to meet you, zorb',
      forms:[{text:'nice to meet you, zorb',kind:'phrase'}],
      senses:[{id:'other',translations:{ru:['приятно']}}],
      examples:[]
    },
    {
      id:'lex.old',revision:1,language:'en',lemma:'work',deprecated:true,
      pronunciation:{ipa:'wɝk'},
      forms:[{text:'work',kind:'lemma'}],
      senses:[{id:'other',translations:{ru:['работа']}}],
      examples:[]
    }
  ]
};

const plan=Ipa.planIpaBootstrap(lexicon,source);
assert.equal(plan.source.sha,Ipa.IPA_SOURCE_SHA);
assert.equal(plan.report.forms,5);
assert.equal(plan.report.alreadyBritish,1); // working
assert.equal(plan.report.updatedForms,3); // work lemma, worked, live lemma
assert.equal(plan.report.unmatched,1);
assert.deepEqual(plan.report.unmatchedSample,['nice to meet you, zorb']);
assert.equal(plan.report.updatedLexemes,2);

const work=plan.changes.find(change=>change.id==='lex.work');
assert.equal(work.expectedRevision,4);
assert.deepEqual(work.entry.pronunciation,{ipa:'wɜːk',ruReading:'уёк'});
assert.deepEqual(work.entry.forms.find(form=>form.text==='worked').pronunciation,{ipa:'wɜːkt',ruReading:'уёкт'});
assert.equal(work.entry.forms.find(form=>form.text==='working').pronunciation.audioKey,'a1');
assert.equal(work.entry.forms.find(form=>form.text==='work').pronunciation,undefined);
assert.deepEqual(plan.changes.find(change=>change.id==='lex.live').entry.pronunciation,{ipa:'laɪv',ruReading:'лайв'});

// Applying the plan and planning again changes nothing.
const applied={entries:lexicon.entries.map(entry=>(plan.changes.find(change=>change.id===entry.id)||{entry}).entry)};
assert.equal(Ipa.planIpaBootstrap(applied,source).changes.length,0);

console.log('UnMute IPA bootstrap tests passed');
