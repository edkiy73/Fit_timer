import type { Activity } from './content/schema';
import type { CourseProgressDocument } from './progress';
import { PatternDrillView } from './pattern-drill';

type PatternActivity=Extract<Activity,{type:'pattern-drill'}>;

function shuffle<T>(values:T[],random:()=>number):T[]{
  const copy=values.slice();
  for(let index=copy.length-1;index>0;index--){
    const swap=Math.floor(random()*(index+1));
    [copy[index],copy[swap]]=[copy[swap]!,copy[index]!];
  }
  return copy;
}

export function studiedPatternActivities(
  activities:Activity[],
  progress:CourseProgressDocument
):PatternActivity[]{
  return activities.filter((activity):activity is PatternActivity=>{
    if(activity.type!=='pattern-drill')return false;
    const state=progress.practice.drill[activity.id];
    return Boolean(state&&!state.deleted&&state.box>0);
  });
}

export function buildMixedDrillActivity(
  activities:Activity[],
  progress:CourseProgressDocument,
  random:()=>number=Math.random
):PatternActivity|null{
  const studied=studiedPatternActivities(activities,progress);
  if(studied.length<3)return null;

  const bag=studied.flatMap(activity=>activity.items);
  const items=shuffle(bag,random).slice(0,10);
  if(!items.length)return null;

  return {
    id:'mixed.review',
    revision:1,
    type:'pattern-drill',
    title:{ru:'Смешанный дрилл',en:'Mixed drill'},
    tags:['mixed-review'],
    revisionProgress:'preserve',
    lexiconRefs:[],
    pattern:{ru:'Смешанный дрилл',en:'Mixed drill'},
    modes:['drill'],
    items,
  };
}

export function MixedDrillView({
  activity,
  onDone
}:{
  activity:PatternActivity;
  onDone:()=>void;
}){
  return (
    <PatternDrillView
      activity={activity}
      setId="mixed-review"
      savePractice={async()=>{}}
      variant="mixed"
      onDone={onDone}
    />
  );
}
