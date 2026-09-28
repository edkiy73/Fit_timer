import { describe, expect, it } from 'vitest';
import { emptyWordsProgress, wordProgressKey } from '../progress';
import {
  WORD_INTERVALS,
  WORD_SESSION_CAP,
  addWordToReview,
  dueWords,
  gradeWordReview,
  removeWordFromReview,
  wordReviewSession
} from './word-srs';

describe('personal vocabulary SRS',()=>{
  it('uses lexeme+sense identity and first schedules tomorrow',()=>{
    let doc=emptyWordsProgress();
    doc=addWordToReview(doc,'lex.work','verb',100,'2026-09-28T10:00:00Z');
    doc=addWordToReview(doc,'lex.work','noun',100,'2026-09-28T10:01:00Z');

    expect(Object.keys(doc.items)).toHaveLength(2);
    expect(doc.items[wordProgressKey('lex.work','verb')]?.due).toBe(101);
    expect(doc.items[wordProgressKey('lex.work','noun')]?.due).toBe(101);
  });

  it('keeps the legacy word intervals and reset semantics',()=>{
    expect(Array.from(WORD_INTERVALS)).toEqual([0,2,6,16,35]);
    let doc=addWordToReview(emptyWordsProgress(),'lex.work','verb',100,'2026-09-28T10:00:00Z');
    doc=gradeWordReview(doc,'lex.work','verb',true,101,'2026-09-29T10:00:00Z');
    expect(doc.items[wordProgressKey('lex.work','verb')]).toMatchObject({box:1,due:103});
    doc=gradeWordReview(doc,'lex.work','verb',false,103,'2026-10-01T10:00:00Z');
    expect(doc.items[wordProgressKey('lex.work','verb')]).toMatchObject({box:0,due:103});
  });

  it('keeps removals as tombstones',()=>{
    let doc=addWordToReview(emptyWordsProgress(),'lex.work','verb',100,'2026-09-28T10:00:00Z');
    doc=removeWordFromReview(doc,'lex.work','verb','2026-09-28T11:00:00Z');
    expect(doc.items[wordProgressKey('lex.work','verb')]?.deleted).toBe(true);
    expect(dueWords(doc,999)).toHaveLength(0);
  });

  it('caps one word-review session at 20 while keeping the waiting count',()=>{
    let doc=emptyWordsProgress();
    for(let i=0;i<25;i++){
      doc=addWordToReview(doc,'lex.word-'+i,'sense',0,'2026-09-28T10:00:00Z');
    }
    const session=wordReviewSession(doc,10);
    expect(WORD_SESSION_CAP).toBe(20);
    expect(session.items).toHaveLength(20);
    expect(session.totalDue).toBe(25);
    expect(session.waiting).toBe(5);
  });
});
