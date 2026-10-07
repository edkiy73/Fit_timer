// Targeted main-course fixes (launch plan decisions 9, 10, 16): display answers, lost
// Russian phrases, the day 1 voice practice — and that re-running changes nothing.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { displayAnswerFor, looksLikeQuestion } from '../lib/display-answer.mjs';
import { buildA1StarterCourse } from '../lib/a1-starter-course.mjs';
import { applyDayOneVoice, fillDisplayAnswers, fillMissingSources, DAY1_VOICE_ID } from '../lib/general-course-patches.mjs';

assert.equal(displayAnswerFor("i didn't go there yesterday",{task:'Сделай отрицание'}),"I didn't go there yesterday.");
assert.equal(displayAnswerFor('can you come tomorrow',{task:'Сделай вопрос'}),'Can you come tomorrow?');
assert.equal(displayAnswerFor('how long have you been here',{task:'Задай вопрос'}),'How long have you been here?');
assert.equal(displayAnswerFor('i have a question',{task:'У меня есть вопрос.'}),'I have a question.');
assert.equal(displayAnswerFor('have a nice day'),'Have a nice day.');
assert.equal(displayAnswerFor('i work in it',{task:'Я работаю в IT.'}),'I work in IT.');
assert.equal(displayAnswerFor('i used to play cs a lot',{task:'Раньше я много играл в CS.'}),'I used to play CS a lot.');
assert.equal(displayAnswerFor("i'm from russia, but i live in tbilisi"),"I'm from Russia, but I live in Tbilisi.");
assert.equal(displayAnswerFor('i bought a laptop. the laptop is fast'),'I bought a laptop. The laptop is fast.');
assert.equal(displayAnswerFor('Thank you.'),undefined,'already well-formed answers stay as they are');
assert.equal(displayAnswerFor(''),undefined);
assert.equal(looksLikeQuestion('do you speak english'),true);
assert.equal(looksLikeQuestion("don't worry about it"),false);

const set={
  activities:[
    {id:'a',type:'text-input',prompt:{ru:'Задай вопрос'},answer:{accepted:['what do you do']}},
    {id:'b',type:'translation',prompt:{ru:'Я устаю.'},answer:{accepted:["i'm getting tired"]},displayAnswer:'Admin wording.'},
    {id:'c',type:'text-input',prompt:{ru:'Спроси'},answer:{accepted:['edited in admin']}},
    {id:'d',type:'choice',prompt:{ru:'?'},options:[{ru:'x'},{ru:'y'}],correctIndex:0}
  ],
  roadmaps:[{nodes:[{id:'day-1',activityIds:['d'],completion:{mode:'all',requirements:[{kind:'activity-seen',activityIds:['d']}]}}]}]
};
const fresh={activities:[
  {id:'a',type:'text-input',source:{ru:'Чем ты занимаешься?'},answer:{accepted:['what do you do']}},
  {id:'c',type:'text-input',source:{ru:'Старая фраза'},answer:{accepted:['original answer']}}
]};

assert.deepEqual(fillMissingSources(set,fresh),['a'],'only the unchanged task gets the phrase');
assert.deepEqual(set.activities[0].source,{ru:'Чем ты занимаешься?'});
assert.equal(set.activities[2].source,undefined);
assert.equal(fillDisplayAnswers(set),2);
assert.equal(set.activities[0].displayAnswer,'What do you do?');
assert.equal(set.activities[1].displayAnswer,'Admin wording.','an admin value is never overwritten');
assert.equal(applyDayOneVoice(set),true);
const day1=set.roadmaps[0].nodes[0];
assert.ok(day1.activityIds.includes(DAY1_VOICE_ID));
assert.deepEqual(day1.completion.requirements.at(-1),{kind:'practice-completed',activityId:DAY1_VOICE_ID,modes:['speaking']});

// Idempotent: a second pass changes nothing.
assert.deepEqual(fillMissingSources(set,fresh),[]);
assert.equal(fillDisplayAnswers(set),0);
assert.equal(applyDayOneVoice(set),false);
assert.equal(set.activities.filter(activity=>activity.id===DAY1_VOICE_ID).length,1);

// The server accepts the new field and rejects an empty one.
process.env.ALLOW_MEMORY_STORE='1';
const Content=createRequire(import.meta.url)('../lib/content-store.js');
const withDisplay=value=>{
  const course=buildA1StarterCourse();
  const task=course.activities.find(activity=>activity.type==='text-input'||activity.type==='translation');
  task.displayAnswer=value;
  return course;
};
assert.throws(()=>Content.validateSet(withDisplay(' ')),/bad_display_answer/);
Content.validateSet(withDisplay('I work here.'));

console.log('UnMute main course patch tests passed');
