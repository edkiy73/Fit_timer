import { describe, expect, it } from 'vitest';
import { gradeSentenceResponse, sentenceResponseStage } from './sentence-progression';

describe('adaptive sentence progression',()=>{
  it('keeps a new or failed scaffolded card on chips',()=>{
    expect(sentenceResponseStage(undefined)).toBe('build');
    expect(gradeSentenceResponse(undefined,'build',false)).toEqual({
      responseStage:'build',
      writeWrongStreak:0
    });
  });

  it('graduates from chips to writing only after a correct answer',()=>{
    expect(gradeSentenceResponse(undefined,'build',true)).toEqual({
      responseStage:'write',
      writeWrongStreak:0
    });
  });

  it('allows one writing mistake without dropping back to chips',()=>{
    const next=gradeSentenceResponse({box:2,responseStage:'write',writeWrongStreak:0},'write',false);
    expect(next).toEqual({responseStage:'write',writeWrongStreak:1});
  });

  it('drops back to chips after two graded writing mistakes in a row',()=>{
    const next=gradeSentenceResponse({box:0,responseStage:'write',writeWrongStreak:1},'write',false);
    expect(next).toEqual({responseStage:'build',writeWrongStreak:0});
  });

  it('resets the writing mistake streak after success',()=>{
    const next=gradeSentenceResponse({box:0,responseStage:'write',writeWrongStreak:1},'write',true);
    expect(next).toEqual({responseStage:'write',writeWrongStreak:0});
  });

  it('migrates legacy SRS cards without resetting progress',()=>{
    expect(sentenceResponseStage({box:0})).toBe('build');
    expect(sentenceResponseStage({box:1})).toBe('write');
  });
});
