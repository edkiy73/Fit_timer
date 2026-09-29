import { describe, expect, it } from 'vitest';
import type { Activity } from './content/schema';
import { emptyCourseProgress } from './progress';
import {
  buildMixedDrillActivity,
  studiedPatternActivities
} from './mixed-drill';

function pattern(id:string,start:number):Extract<Activity,{type:'pattern-drill'}>{
  return {
    id,
    revision:1,
    type:'pattern-drill',
    tags:[],
    revisionProgress:'preserve',
    lexiconRefs:[],
    pattern:{ru:id},
    modes:['drill','listening','speaking'],
    items:Array.from({length:4},(_,index)=>({
      id:id+'.item-'+index,
      prompt:{ru:'Фраза '+(start+index)},
      answer:{accepted:['Phrase '+(start+index)],nearMiss:true,caseSensitive:false}
    }))
  };
}

const activities:Activity[]=[
  pattern('pattern.a',0),
  pattern('pattern.b',10),
  pattern('pattern.c',20),
  pattern('pattern.d',30),
];

describe('mixed drill',()=>{
  it('uses only patterns whose drill SRS has been learned past box zero',()=>{
    const progress=emptyCourseProgress();
    progress.practice.drill['pattern.a']={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.drill['pattern.b']={box:2,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.drill['pattern.c']={box:0,due:1,at:'2026-09-29T00:00:00Z'};
    progress.practice.drill['pattern.d']={box:2,due:1,at:'2026-09-29T00:00:00Z',deleted:true};

    expect(studiedPatternActivities(activities,progress).map(item=>item.id))
      .toEqual(['pattern.a','pattern.b']);
    expect(buildMixedDrillActivity(activities,progress,()=>0.5)).toBeNull();
  });

  it('mixes all learned pattern phrases and caps the session at ten',()=>{
    const progress=emptyCourseProgress();
    for(const id of ['pattern.a','pattern.b','pattern.c']){
      progress.practice.drill[id]={box:1,due:1,at:'2026-09-29T00:00:00Z'};
    }

    const mixed=buildMixedDrillActivity(activities,progress,()=>0.999);

    expect(mixed).not.toBeNull();
    expect(mixed?.items).toHaveLength(10);
    expect(new Set(mixed?.items.map(item=>item.id)).size).toBe(10);
    expect(mixed?.id).toBe('mixed.review');
  });
});
