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
const VERBS=[["work","worked","worked"],["become","became","become"]];
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
const patternActivity=course.activities.find(a=>a.id==='pattern.mech');
assert.deepEqual(Array.from(patternActivity.modes),['drill','listening','speaking']);
const day1=course.roadmaps[0].nodes[0];
const day2=course.roadmaps[0].nodes[1];
assert.equal(day1.completion.mode,'all');
assert.equal(day1.completion.requirements.filter(r=>r.kind==='activity-seen').length,2);
const practiceRequirement=day1.completion.requirements.find(r=>r.kind==='practice-started');
assert.equal(practiceRequirement.activityId,'pattern.mech');
assert.deepEqual(Array.from(practiceRequirement.modes),['drill','listening','speaking']);
assert.ok(!day1.completion.requirements.some(r=>r.kind==='activity-seen'&&r.activityIds.includes('dialogue.d1')));
assert.equal(day2.kind,'review');
assert.deepEqual(Array.from(day2.completion.requirements).map(r=>r.kind),['manual']);
assert.equal(course.resources.length,2);
const phraseBank=course.resources.find(resource=>resource.type==='phrase-collection');
const verbTable=course.resources.find(resource=>resource.type==='verb-table');
assert.ok(phraseBank);
assert.ok(verbTable);
assert.equal(phraseBank.id,'phrase-bank');
assert.equal(phraseBank.groups.length,1);
assert.equal(phraseBank.groups[0].items.length,1);
assert.equal(verbTable.id,'irregular-verbs');
assert.equal(verbTable.items.length,2);


const work=lexicon.entries.find(e=>e.lemma==='work');
assert.equal(work.senses.length,2);
assert.equal(work.forms.find(form=>form.id==='base').text,'work');
assert.equal(work.forms.find(form=>form.id==='past').text,'worked');
assert.equal(work.forms.find(form=>form.id==='participle').text,'worked');
assert.equal(work.forms.filter(form=>form.text==='worked').length,2);
assert.equal(verbTable.items[0].lexemeId,work.id);
assert.equal(verbTable.items[0].baseFormId,'base');
assert.deepEqual(Array.from(verbTable.items[0].pastFormIds),['past']);
assert.deepEqual(Array.from(verbTable.items[0].participleFormIds),['participle']);
const become=lexicon.entries.find(e=>e.lemma==='become');
assert.ok(become);
assert.deepEqual(Array.from(become.senses[0].translations.ru),['становиться']);
assert.ok(become.senses[0].tags.includes('needs-review'));
assert.equal(become.forms.find(form=>form.id==='base').text,'become');
assert.equal(become.forms.find(form=>form.id==='past').text,'became');
assert.equal(become.forms.find(form=>form.id==='participle').text,'become');
assert.ok(work.senses.every(s=>s.tags.includes('needs-review')));
const howAreYou=lexicon.entries.find(e=>e.lemma==='how are you');
assert.ok(howAreYou);
assert.equal(howAreYou.senses.length,2);
assert.equal(howAreYou.senses.map(s=>s.translations.ru[0]).sort().join('|'),['Как дела?','как ты?'].sort().join('|'));
const phraseRef=phraseBank.groups[0].items[0];
assert.equal(phraseRef.lexemeId,howAreYou.id);
assert.equal(phraseRef.senseId,howAreYou.senses.find(s=>s.translations.ru.includes('Как дела?')).id);

assert.throws(()=>validateImport(model,course,lexicon),/unexpected_lessons/);
console.log('UnMute legacy importer unit tests passed');
