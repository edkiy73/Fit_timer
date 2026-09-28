import { describe, expect, it } from 'vitest';
import {
  PRACTICE_INTERVALS,
  gradePracticeSrs,
  initialPracticeSrsState,
  isPracticeDue
} from './practice-srs';

describe('legacy pattern/vocab/listening SRS parity',()=>{
  it('keeps the exact legacy intervals',()=>{
    expect(Array.from(PRACTICE_INTERVALS.pattern)).toEqual([0,2,6,16,35]);
    expect(Array.from(PRACTICE_INTERVALS.vocab)).toEqual([0,3,9,24,45]);
    expect(Array.from(PRACTICE_INTERVALS.listening)).toEqual([0,2,7,18,40]);
  });

  it('advances boxes independently per practice kind',()=>{
    const day=20000;
    expect(gradePracticeSrs('pattern',undefined,true,day)).toEqual({box:1,due:day+2});
    expect(gradePracticeSrs('vocab',undefined,true,day)).toEqual({box:1,due:day+3});
    expect(gradePracticeSrs('listening',undefined,true,day)).toEqual({box:1,due:day+2});
  });

  it('uses later intervals exactly like legacy',()=>{
    const day=20000;
    expect(gradePracticeSrs('pattern',{box:2,due:0},true,day)).toEqual({box:3,due:day+16});
    expect(gradePracticeSrs('vocab',{box:2,due:0},true,day)).toEqual({box:3,due:day+24});
    expect(gradePracticeSrs('listening',{box:2,due:0},true,day)).toEqual({box:3,due:day+18});
  });

  it('caps at box four',()=>{
    const day=20000;
    expect(gradePracticeSrs('pattern',{box:4,due:0},true,day)).toEqual({box:4,due:day+35});
    expect(gradePracticeSrs('vocab',{box:4,due:0},true,day)).toEqual({box:4,due:day+45});
    expect(gradePracticeSrs('listening',{box:4,due:0},true,day)).toEqual({box:4,due:day+40});
  });

  it('resets wrong answers to box zero and due today',()=>{
    const day=20000;
    expect(gradePracticeSrs('pattern',{box:3,due:99999},false,day)).toEqual({box:0,due:day});
    expect(gradePracticeSrs('vocab',{box:3,due:99999},false,day)).toEqual({box:0,due:day});
    expect(gradePracticeSrs('listening',{box:3,due:99999},false,day)).toEqual({box:0,due:day});
  });

  it('matches legacy due semantics',()=>{
    expect(initialPracticeSrsState()).toEqual({box:0,due:0});
    expect(isPracticeDue({box:2,due:10},9)).toBe(false);
    expect(isPracticeDue({box:2,due:10},10)).toBe(true);
    expect(isPracticeDue({box:2,due:10},11)).toBe(true);
    expect(isPracticeDue(undefined,11)).toBe(false);
  });
});
