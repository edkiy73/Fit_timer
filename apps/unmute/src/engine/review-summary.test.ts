import { describe, expect, it } from 'vitest';
import { emptyWordsProgress } from '../progress';
import { addWordToReview } from './word-srs';
import { buildReviewSummary, CARD_REVIEW_SESSION_CAP } from './review-summary';

describe('aggregate review summary',()=>{
  it('combines cards, capped practice and personal words',()=>{
    const cardIds=Array.from({length:35},(_,i)=>'card.'+i);
    const cards=Object.fromEntries(cardIds.map((id,i)=>[id,{box:2,due:i<32?1:99}]));

    let words=emptyWordsProgress();
    for(let i=0;i<23;i++) words=addWordToReview(words,'lex.'+i,'sense',0,'2026-09-28T10:00:00Z');

    const summary=buildReviewSummary({
      cardIds,
      cards,
      practiceIds:['a','b','c','d'],
      practice:{
        drill:{
          a:{box:1,due:1},b:{box:1,due:1},c:{box:1,due:1},d:{box:1,due:1}
        },
        speaking:{a:{box:1,due:1},b:{box:1,due:1},c:{box:1,due:1}},
        listening:{a:{box:1,due:1},b:{box:1,due:1},c:{box:1,due:99}}
      },
      words
    },10);

    expect(CARD_REVIEW_SESSION_CAP).toBe(30);
    expect(summary.cards.dueIds).toHaveLength(30);
    expect(summary.cards.waiting).toBe(2);
    expect(summary.practice.dueCount).toBe(7);
    expect(summary.practice.waitingCount).toBe(2);
    expect(summary.words.items).toHaveLength(20);
    expect(summary.words.waiting).toBe(3);
    expect(summary.actionableCount).toBe(57);
    expect(summary.waitingCount).toBe(7);
  });
});
