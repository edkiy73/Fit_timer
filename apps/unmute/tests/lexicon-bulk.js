'use strict';

const assert=require('assert');
const Bulk=require('../lib/lexicon-bulk');

const snapshot={
  schemaVersion:1,revision:1,entries:[
    {
      id:'lex.work',revision:3,language:'en',lemma:'work',
      forms:[
        {text:'work',kind:'lemma',pronunciation:{ipa:'wɝːk',ruReading:'уёрк'}}
      ],
      pronunciation:{ipa:'wɝːk',ruReading:'уёрк'},
      senses:[{id:'verb',partOfSpeech:'verb',translations:{ru:['работать']},tags:[]}],
      examples:[],deprecated:false
    },
    {
      id:'lex.sound',revision:2,language:'en',lemma:'sound',
      forms:[{text:'sound',kind:'lemma'}],
      senses:[
        {id:'verb',partOfSpeech:'verb',translations:{ru:['звучать']},tags:[]},
        {id:'noun',partOfSpeech:'noun',translations:{ru:['звук']},tags:[]}
      ],
      examples:[],deprecated:false
    }
  ]
};

const parsed=Bulk.parsePatch(JSON.stringify({
  format:'unmute.lexicon.patch.v1',
  entries:[
    {
      lemma:'work',
      forms:[
        {text:'work',kind:'lemma',ipa:'WRONG',ruReading:'ворк'},
        {text:'worked',kind:'inflection',ipa:'wɝːkt',ruReading:'уёркт'}
      ],
      senses:[{
        id:'verb',partOfSpeech:'verb',translations:['работать','трудиться'],
        examples:[{en:'I worked yesterday.','ru':'Я работал вчера.'}]
      }]
    },
    {
      lemma:'travel',
      forms:[
        {text:'travel',kind:'lemma',ipa:'ˈtrævəl',ruReading:'трэвэл'},
        {text:'travels',kind:'inflection',ipa:'ˈtrævəlz',ruReading:'трэвэлз'}
      ],
      senses:[{
        partOfSpeech:'verb',translations:['путешествовать'],
        examples:[{en:'I travel a lot.',ru:'Я много путешествую.'}]
      }]
    },
    {
      lemma:'sound',
      forms:[{text:'sounded',kind:'inflection',ipa:'ˈsaʊndɪd',ruReading:'саундид'}],
      senses:[{partOfSpeech:'verb',translations:['звучать'],examples:[]}]
    }
  ]
}));

assert.equal(parsed.entries.length,3);
assert.ok(parsed.entries[0].forms.find(form=>form.text==='worked').pronunciation.ipa);

const preview=Bulk.previewPatch(snapshot,parsed);
assert.equal(preview.summary.creates,1);
assert.equal(preview.summary.updates,2);
assert.equal(preview.summary.conflicts,0);

const work=preview.changes.find(change=>change.id==='lex.work').entry;
assert.equal(work.forms.find(form=>form.text==='work').pronunciation.ipa,'wɝːk');
assert.equal(work.forms.find(form=>form.text==='worked').pronunciation.ipa,'wɝːkt');
assert.ok(preview.warnings.some(value=>value.includes('kept existing ipa')));
assert.ok(work.senses[0].translations.ru.includes('трудиться'));
assert.equal(work.examples[0].senseId,'verb');

const travel=preview.changes.find(change=>change.entry.lemma==='travel');
assert.equal(travel.kind,'create');
assert.equal(travel.expectedRevision,0);
assert.ok(/^lex\.travel/.test(travel.id));
assert.equal(travel.entry.senses[0].translations.ru[0],'путешествовать');

const sound=preview.changes.find(change=>change.id==='lex.sound').entry;
assert.ok(sound.forms.some(form=>form.text==='sounded'));
assert.equal(sound.senses.length,2);
assert.equal(sound.senses[0].translations.ru[0],'звучать');
assert.equal(sound.senses[1].translations.ru[0],'звук');
assert.ok(preview.warnings.some(value=>value.includes('polysemous')));

const conflict=Bulk.previewPatch(snapshot,{
  format:'unmute.lexicon.patch.v1',
  entries:[{
    lemma:'job',
    forms:['job','work'],
    senses:[{partOfSpeech:'noun',translations:['работа'],examples:[]}]
  }]
});
assert.equal(conflict.summary.conflicts,1);
assert.equal(conflict.changes.length,0);
assert.equal(conflict.conflicts[0].code,'surface_owned_by_other_lexeme');

const prompt=Bulk.buildAiPrompt({
  missing:[
    {surface:"it's",count:166,contexts:["It's cold.","I think it's fine."]},
    {surface:"worked",count:12,contexts:["I worked yesterday."]}
  ]
},2);
assert.equal(prompt.targets.length,2);
assert.ok(prompt.prompt.includes('unmute.lexicon.patch.v1'));
assert.ok(prompt.prompt.includes("It's cold."));
assert.ok(prompt.prompt.includes('worked'));
assert.ok(prompt.prompt.includes('IPA must describe the EXACT form'));

console.log('UnMute bulk lexicon tests passed');
