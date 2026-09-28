import assert from 'node:assert/strict';
import { parseLegacySource,buildCourseSet,buildLexicon,validateImport } from '../lib/legacy-import.mjs';

const fixture=String.raw`
const LESSONS=[
{id:"abc",t:"ABC",s:"",theory:"<p>x</p>",cards:[{t:"mc",q:"Q?",ru:"В?",o:["a","b"],a:0}]}
];
LESSONS.push({id:"mech",t:"M",s:"",theory:"<p>m</p>",cards:[{t:"in",task:"Переведи",ru:"Работай",a:["work"]}]});
const EX={"abc#0":"base"};
Object.assign(EX,{"abc#0":"expanded"});
const MORE_CARDS={"abc":[{t:"in",task:"Переведи",ru:"Дом",a:["home"]}]};
const MORE_CARDS2={"abc":[]};
const MORE_CARDS3={"abc":[]};
const FIX={"abc#0":{ex:"fixed"}};
const ALT={"mech#0":["work please"]};
const PATTERNS={"mech":{p:"pattern",items:[["Я работаю","I work"]]}};
const DIALOGS=[{id:"d1",t:"D",day:1,lines:[{q:"Hi",task:"Answer",a:["hi"],ans:"Hi"}]}];
const AI_TALKS=[{id:"ai1",day:1,title:"Talk",topic:"topic",focus:["one"]}];
const PLAN=[
{ids:["abc","mech"],g:"g1",ex:["e1"]},
{ids:[],g:"g2",ex:[]},
{ids:[],g:"g3",ex:[]},
{ids:[],g:"g4",ex:[]},
{ids:[],g:"g5",ex:[]},
{ids:[],g:"g6",ex:[]},
{ids:[],g:"g7",ex:[]},
{ids:[],g:"g8",ex:[]},
{ids:[],g:"g9",ex:[]},
{ids:[],g:"g10",ex:[]},
{ids:[],g:"g11",ex:[]},
{ids:[],g:"g12",ex:[]},
{ids:[],g:"g13",ex:[]},
{ids:[],g:"g14",ex:[]},
{ids:[],g:"g15",ex:[]},
{ids:[],g:"g16",ex:[]},
{ids:[],g:"g17",ex:[]},
{ids:[],g:"g18",ex:[]},
{ids:[],g:"g19",ex:[]},
{ids:[],g:"g20",ex:[]},
{ids:[],g:"g21",ex:[]},
{ids:[],g:"g22",ex:[]},
{ids:[],g:"g23",ex:[]},
{ids:[],g:"g24",ex:[]},
{ids:[],g:"g25",ex:[]},
{ids:[],g:"g26",ex:[]},
{ids:[],g:"g27",ex:[]},
{ids:[],g:"g28",ex:[]},
{ids:[],g:"g29",ex:[]},
{ids:[],g:"g30",ex:[]},
{ids:[],g:"g31",ex:[]},
{ids:[],g:"g32",ex:[]},
{ids:[],g:"g33",ex:[]},
{ids:[],g:"g34",ex:[]},
{ids:[],g:"g35",ex:[]},
{ids:[],g:"g36",ex:[]},
{ids:[],g:"g37",ex:[]},
{ids:[],g:"g38",ex:[]},
{ids:[],g:"g39",ex:[]},
{ids:[],g:"g40",ex:[]}
];
const DICT={"work":["работать; работа","w","у"],"home":["дом","h","х"]};
Object.assign(DICT,{"hello":["привет","h","х"]});
const PHRASES=[{g:"x",items:[["How are you?","Как дела?"]]}];
const VERBS=[["work","worked","worked"]];
const TAGS={abc:["основы"]};
const PHRASE_RU={"good morning":"доброе утро","how are you":"как ты?"};
`;

const model=parseLegacySource(fixture);
assert.equal(model.lessons.length,2);
assert.equal(model.lessons[0].cards.length,2);
assert.equal(model.lessons[0].cards[0].ex,'fixed');
assert.equal(Array.from(model.lessons[1].cards[0].a).join('|'),'work|work please');
assert.equal(Object.keys(model.dictionary).length,3);

const lexicon=buildLexicon(model);
const course=buildCourseSet(model,lexicon);
assert.equal(course.id,'general-foundation');
assert.equal(course.roadmaps[0].nodes.length,40);
assert.ok(course.roadmaps[0].nodes[0].activityIds[0]==='plan.day-1');
assert.ok(course.activities.some(a=>a.id==='dialogue.d1'));
assert.ok(course.activities.some(a=>a.id==='ai.ai1'));
assert.equal(course.resources.length,1);
assert.equal(course.resources[0].id,'phrase-bank');
assert.equal(course.resources[0].type,'phrase-collection');
assert.equal(course.resources[0].groups.length,1);
assert.equal(course.resources[0].groups[0].items.length,1);


const work=lexicon.entries.find(e=>e.lemma==='work');
assert.equal(work.senses.length,2);
assert.ok(work.senses.every(s=>s.tags.includes('needs-review')));
const howAreYou=lexicon.entries.find(e=>e.lemma==='how are you');
assert.ok(howAreYou);
assert.equal(howAreYou.senses.length,2);
assert.equal(howAreYou.senses.map(s=>s.translations.ru[0]).sort().join('|'),['Как дела?','как ты?'].sort().join('|'));
const phraseRef=course.resources[0].groups[0].items[0];
assert.equal(phraseRef.lexemeId,howAreYou.id);
assert.equal(phraseRef.senseId,howAreYou.senses.find(s=>s.translations.ru.includes('Как дела?')).id);

assert.throws(()=>validateImport(model,course,lexicon),/unexpected_lessons/);
console.log('UnMute legacy importer unit tests passed');
