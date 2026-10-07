// Targeted content changes of the main course (general-foundation), owner decisions 9, 10, 16
// of docs/unmute-launch-plan.md. The importer applies them to a fresh build; the patch script
// (scripts/patch-general-course.mjs) applies them to the live draft, keeping admin edits.
import { displayAnswerFor } from './display-answer.mjs';

export const DAY1_VOICE_ID='pattern.day1-voice';

const voiceItem=(n,ru,...accepted)=>({
  id:DAY1_VOICE_ID+'.item-'+n,
  prompt:{ru},
  answer:{accepted,nearMiss:true,caseSensitive:false}
});

/** Day 1 ends with a voice win: three short phrases said aloud (decision 16). */
export function day1VoiceActivity(){
  return {
    id:DAY1_VOICE_ID,revision:1,type:'pattern-drill',tags:['abc'],revisionProgress:'preserve',lexiconRefs:[],
    pattern:{ru:'Первые фразы вслух'},
    modes:['speaking'],
    items:[
      voiceItem(1,'Я здесь работаю.','I work here.','I work here'),
      voiceItem(2,'Я не знаю.','I don\'t know.','I don\'t know','I do not know'),
      voiceItem(3,'Ты говоришь по-английски?','Do you speak English?','Do you speak English')
    ]
  };
}

/** Adds the day 1 voice practice once; returns true when the set changed. */
export function applyDayOneVoice(set){
  const node=set.roadmaps?.[0]?.nodes?.find(item=>item.id==='day-1');
  if(!node)return false;
  let changed=false;
  if(!set.activities.some(activity=>activity.id===DAY1_VOICE_ID)){
    set.activities.push(day1VoiceActivity());
    changed=true;
  }
  if(!node.activityIds.includes(DAY1_VOICE_ID)){
    node.activityIds.push(DAY1_VOICE_ID);
    changed=true;
  }
  const requirements=node.completion?.requirements;
  if(Array.isArray(requirements)&&!requirements.some(item=>item.activityId===DAY1_VOICE_ID)){
    requirements.push({kind:'practice-completed',activityId:DAY1_VOICE_ID,modes:['speaking']});
    changed=true;
  }
  return changed;
}

const firstText=value=>value&&typeof value==='object'?String(value.ru||Object.values(value)[0]||''):'';

/** Fills `displayAnswer` of written tasks whose stored answer is lowercase (decision 10).
 *  Never overwrites a value set in the admin. Returns how many tasks changed. */
export function fillDisplayAnswers(set){
  let count=0;
  for(const activity of set.activities){
    if(activity.type!=='text-input'&&activity.type!=='translation')continue;
    if(activity.displayAnswer)continue;
    const shown=displayAnswerFor(activity.answer?.accepted?.[0],{task:firstText(activity.prompt),hint:firstText(activity.source)});
    if(!shown)continue;
    activity.displayAnswer=shown;
    count++;
  }
  return count;
}

/** Copies the Russian phrase (`source`) the old importer lost into tasks that still have none
 *  (decision 9). `fresh` is a build of the fixed importer. Returns the changed ids. */
export function fillMissingSources(set,fresh){
  const freshById=new Map(fresh.activities.map(activity=>[activity.id,activity]));
  const changed=[];
  for(const activity of set.activities){
    if(activity.type!=='text-input'||activity.source)continue;
    const twin=freshById.get(activity.id);
    if(!twin?.source)continue;
    // Only the same task: an answer edited in the admin may no longer fit the old phrase.
    if(String(twin.answer?.accepted?.[0]||'')!==String(activity.answer?.accepted?.[0]||''))continue;
    activity.source=twin.source;
    changed.push(activity.id);
  }
  return changed;
}
