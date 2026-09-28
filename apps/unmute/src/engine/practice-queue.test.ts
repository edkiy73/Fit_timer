import { describe, expect, it } from 'vitest';
import {
  PRACTICE_DAILY_CAPS,
  buildPracticeReviewQueue,
  selectPracticeQueue
} from './practice-queue';

const ids=['a','b','c','d','e','f'];

describe('practice daily queue parity',()=>{
  it('keeps legacy daily caps',()=>{
    expect(PRACTICE_DAILY_CAPS).toEqual({pattern:3,vocab:2,listening:2});
  });

  it('selects the oldest overdue items first and cuts to the daily cap',()=>{
    const queue=selectPracticeQueue('pattern',ids,{
      a:{box:1,due:10},
      b:{box:1,due:8},
      c:{box:1,due:12},
      d:{box:1,due:7},
      e:{box:1,due:9},
      f:{box:1,due:50},
    },12);

    expect(queue.due.map(item=>item.id)).toEqual(['d','b','e']);
    expect(queue.totalDue).toBe(5);
    expect(queue.waiting).toBe(2);
  });

  it('preserves source order when due dates are equal',()=>{
    const queue=selectPracticeQueue('vocab',['c','a','b'],{
      a:{box:1,due:5},
      b:{box:1,due:5},
      c:{box:1,due:5},
    },5);

    expect(queue.due.map(item=>item.id)).toEqual(['c','a']);
    expect(queue.waiting).toBe(1);
  });

  it('ignores unseen and future items',()=>{
    const queue=selectPracticeQueue('listening',ids,{
      a:undefined,
      b:{box:0,due:11},
      c:{box:2,due:12},
      d:{box:3,due:13},
    },12);

    expect(queue.due.map(item=>item.id)).toEqual(['b','c']);
    expect(queue.totalDue).toBe(2);
    expect(queue.waiting).toBe(0);
  });

  it('never returns the negative waiting count produced by legacy patWaiting',()=>{
    const queue=selectPracticeQueue('pattern',ids,{
      a:{box:1,due:3},
    },3);
    expect(queue.waiting).toBe(0);
  });

  it('builds one deterministic review summary for all three practice modes',()=>{
    const queue=buildPracticeReviewQueue(ids,{
      pattern:{
        a:{box:1,due:1},b:{box:1,due:2},c:{box:1,due:3},d:{box:1,due:4},
      },
      vocab:{
        a:{box:1,due:1},b:{box:1,due:2},c:{box:1,due:3},
      },
      listening:{
        d:{box:1,due:1},e:{box:1,due:2},f:{box:1,due:99},
      }
    },10);

    expect(queue.pattern.due.map(item=>item.id)).toEqual(['a','b','c']);
    expect(queue.pattern.waiting).toBe(1);
    expect(queue.vocab.due.map(item=>item.id)).toEqual(['a','b']);
    expect(queue.vocab.waiting).toBe(1);
    expect(queue.listening.due.map(item=>item.id)).toEqual(['d','e']);
    expect(queue.listening.waiting).toBe(0);
    expect(queue.dueCount).toBe(7);
    expect(queue.waitingCount).toBe(2);
  });
});
