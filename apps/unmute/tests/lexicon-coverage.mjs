import assert from 'node:assert/strict';
import { auditLexicalCoverage, buildCourseCorpus } from '../lib/lexicon-coverage.mjs';

const course={
  activities:[
    {
      id:'a1',type:'theory',body:{ru:'<p>I worked from home. I work online.</p>'},
      lexiconRefs:[{surface:'work',lexemeId:'lex.work',senseId:'verb'}]
    },
    {
      id:'a2',type:'dialogue',scene:{ru:'Разговор'},lexiconRefs:[],
      lines:[{id:'l1',partner:{ru:'How are you?'},task:{ru:'Ответь'},answer:{accepted:['I am good.']},displayAnswer:'I am good.'}]
    }
  ]
};

const lexicon={
  entries:[
    {
      id:'lex.work',lemma:'work',forms:[
        {text:'work',kind:'lemma'},{text:'worked',kind:'inflection'}
      ],
      pronunciation:{ipa:'wɝːk',ruReading:'уёрк'},
      senses:[{id:'verb',translations:{ru:['работать']}}],
      examples:[{id:'e1',senseId:'verb',text:'I work from home.',translations:{ru:'Я работаю из дома.'}}]
    },
    {
      id:'lex.home',lemma:'home',forms:[{text:'home',kind:'lemma'}],
      pronunciation:{ipa:'hoʊm'},
      senses:[{id:'noun',translations:{ru:['дом']}}],
      examples:[]
    },
    {
      id:'phrase.how-are-you',lemma:'how are you',forms:[{text:'how are you',kind:'phrase'}],
      senses:[{id:'sense-1',translations:{ru:['как дела']}}],
      examples:[]
    }
  ]
};

const corpus=buildCourseCorpus(course);
assert.ok(corpus.uniqueSurfaces>=8);
assert.ok(corpus.surfaces.some(item=>item.surface==='worked'));
assert.ok(corpus.surfaces.some(item=>item.surface==='online'));

const audit=auditLexicalCoverage(course,lexicon);
assert.ok(audit.resolvedSurfaces>=3);
assert.ok(audit.missing.some(item=>item.surface==='online'));
assert.ok(audit.missing.some(item=>item.surface==='from'));
assert.equal(audit.knownPhrasesUsed,1);
assert.ok(audit.ipaSurfaces>=2);
assert.ok(audit.ruReadingSurfaces>=1);
assert.ok(audit.exampleSurfaces>=2); // work and worked resolve to the same example-bearing lexeme
assert.ok(audit.pinnedSurfaces>=1);

console.log('UnMute lexical coverage tests passed');
