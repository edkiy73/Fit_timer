import { describe, expect, it } from 'vitest';
import { gradePracticeUnitSrs } from './practice-unit-srs';

describe('phrase-level practice SRS',()=>{
  it('schedules a weak first lesson attempt no earlier than tomorrow',()=>{
    expect(gradePracticeUnitSrs('drill',undefined,'weak',100,'lesson')).toEqual({
      box:0,
      due:101
    });
    expect(gradePracticeUnitSrs('listening',{box:3,due:150},'weak',100,'lesson')).toEqual({
      box:0,
      due:101
    });
  });

  it('keeps strong mode-specific intervals',()=>{
    expect(gradePracticeUnitSrs('drill',undefined,'strong',100,'lesson')).toEqual({
      box:1,
      due:102
    });
    expect(gradePracticeUnitSrs('speaking',undefined,'strong',100,'lesson')).toEqual({
      box:1,
      due:103
    });
    expect(gradePracticeUnitSrs('listening',undefined,'strong',100,'lesson')).toEqual({
      box:1,
      due:102
    });
  });

  it('does not change SRS for a neutral manual speech pass',()=>{
    expect(gradePracticeUnitSrs('speaking',undefined,'neutral',100,'lesson')).toBeUndefined();
    expect(gradePracticeUnitSrs('speaking',{box:2,due:109},'neutral',100,'lesson')).toEqual({
      box:2,
      due:109
    });
  });

  it('keeps review grading semantics separate from first-learning delay',()=>{
    expect(gradePracticeUnitSrs('drill',{box:2,due:100},'weak',100,'review')).toEqual({
      box:0,
      due:100
    });
  });
});
