import { describe, expect, it } from 'vitest';
import type { CourseSet, RoadmapNode } from './content/schema';
import { emptyCourseProgress } from './progress';
import type { DayProgress } from './day-progress';
import { dayPart, dayWave, memoryModel, waveDensity, weekLevels } from './today-visuals';
import { activitySaveClock } from './activity-progress';

const set={activities:[
  {id:'a',type:'choice',prompt:{ru:'Короткий'},options:[{ru:'x'}],correctIndex:0},
  {id:'b',type:'choice',prompt:{ru:'Гораздо более длинный вопрос задания'},options:[{ru:'x'}],correctIndex:0}
]} as unknown as CourseSet;
const node={id:'day-1',activityIds:['a','b']} as unknown as RoadmapNode;
const progress=(completed:number):DayProgress=>({
  status:completed?'in_progress':'not_started',totalSteps:2,completedSteps:completed,attemptedSteps:completed,pendingCorrections:0,
  sections:[{id:'tasks',required:true,totalSteps:2,completedSteps:completed,attemptedSteps:completed,pendingCorrections:0,status:completed===2?'complete':completed?'in_progress':'not_started'}],
  nextRequiredSection:null,dayComplete:completed===2
});

describe('dayWave',()=>{
  it('keeps a dense line for short days and marks done/current/pending per step',()=>{
    const bars=dayWave(set,node,progress(1));
    expect(waveDensity(2)).toBe(4);
    expect(bars).toHaveLength(8);
    expect(bars.slice(0,4).every(bar=>bar.state==='done')).toBe(true);
    expect(bars.slice(4).every(bar=>bar.state==='current')).toBe(true);
    expect(bars.every(bar=>bar.height>=.22&&bar.height<=1)).toBe(true);
  });
  it('has no current bar once the day is complete',()=>{
    expect(dayWave(set,node,progress(2)).every(bar=>bar.state==='done')).toBe(true);
  });
});

describe('weekLevels',()=>{
  it('scales days by how much was done and keeps flag-only days visible',()=>{
    const clock=activitySaveClock(new Date('2026-10-06T10:00:00'));
    const doc=emptyCourseProgress();
    doc.seen={a:{at:'2026-10-06T09:00:00'},b:{at:'2026-10-06T09:05:00'},c:{at:'2026-10-05T09:00:00'}};
    const levels=weekLevels(doc,{'2026-10-03':{at:'2026-10-03T08:00:00'}},clock.dayNumber);
    expect(levels[6]).toBe(1);
    expect(levels[5]).toBeGreaterThan(.28);
    expect(levels[5]).toBeLessThan(1);
    expect(levels[3]).toBeGreaterThan(0);
    expect(levels[0]).toBe(0);
  });
});

describe('memoryModel',()=>{
  it('puts cards and phrases on rings by strength and counts due items',()=>{
    const doc=emptyCourseProgress();
    doc.cards={a:{box:0,due:5,at:'x'},b:{box:3,due:20,at:'x'},c:{box:2,due:9,at:'x',deleted:true}};
    doc.practiceItems.drill={'p|1':{box:2,due:12,at:'x'}};
    const model=memoryModel(doc,10);
    expect(model).toMatchObject({total:3,strong:1,growing:1,fresh:1,due:1});
    for(const dot of model.dots){
      const r=Math.hypot(dot.x-60,dot.y-60);
      expect(r).toBeLessThanOrEqual(56);
      if(dot.ring==='fresh')expect(r).toBeLessThanOrEqual(23.01);
      if(dot.ring==='strong')expect(r).toBeGreaterThanOrEqual(44.99);
    }
  });
});

describe('dayPart',()=>{
  it('names the time of day',()=>{
    expect(dayPart(new Date('2026-10-06T07:00:00'))).toBe('morning');
    expect(dayPart(new Date('2026-10-06T13:00:00'))).toBe('day');
    expect(dayPart(new Date('2026-10-06T19:00:00'))).toBe('evening');
    expect(dayPart(new Date('2026-10-06T23:30:00'))).toBe('night');
  });
});
