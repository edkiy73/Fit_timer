import { describe, expect, it } from 'vitest';
import {
  CARD_INTERVALS,
  cardLearningStatus,
  gradeCardSrs,
  initialCardSrsState,
  isCardDue
} from './card-srs';

describe('legacy card SRS parity',()=>{
  it('keeps the exact legacy intervals',()=>{
    expect(Array.from(CARD_INTERVALS)).toEqual([0,1,3,7,16,35]);
  });

  it('starts from box zero and moves forward on correct answers',()=>{
    const day=20000;
    let state=initialCardSrsState();
    state=gradeCardSrs(state,true,day);
    expect(state).toEqual({box:1,due:day+1});

    state=gradeCardSrs(state,true,day);
    expect(state).toEqual({box:2,due:day+3});

    state=gradeCardSrs(state,true,day);
    expect(state).toEqual({box:3,due:day+7});
  });

  it('caps at box five and keeps the 35 day interval',()=>{
    const day=20000;
    const state=gradeCardSrs({box:5,due:0},true,day);
    expect(state).toEqual({box:5,due:day+35});
  });

  it('resets to box zero and due today after a wrong answer',()=>{
    const day=20000;
    expect(gradeCardSrs({box:4,due:99999},false,day)).toEqual({box:0,due:day});
    expect(gradeCardSrs(undefined,false,day)).toEqual({box:0,due:day});
  });

  it('matches legacy due semantics',()=>{
    const state={box:2,due:20003};
    expect(isCardDue(state,20002)).toBe(false);
    expect(isCardDue(state,20003)).toBe(true);
    expect(isCardDue(state,20004)).toBe(true);
    expect(isCardDue(undefined,20004)).toBe(false);
  });

  it('matches legacy lesson learned threshold at box three',()=>{
    expect(cardLearningStatus(undefined)).toBe('new');
    expect(cardLearningStatus({box:1,due:0})).toBe('started');
    expect(cardLearningStatus({box:2,due:0})).toBe('started');
    expect(cardLearningStatus({box:3,due:0})).toBe('learned');
    expect(cardLearningStatus({box:5,due:0})).toBe('learned');
  });
});
