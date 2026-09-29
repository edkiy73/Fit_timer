import { describe, expect, it } from 'vitest';
import { emptyWordsProgress } from './progress';
import type { LexiconSnapshot } from './lexicon/schema';
import { resolveWordReviewSession } from './word-review';

const lexicon:LexiconSnapshot={
  schemaVersion:1,
  revision:1,
  entries:[
    {
      id:'lex.work',
      revision:1,
      language:'en',
      lemma:'work',
      forms:[{text:'work',kind:'lemma'}],
      senses:[{
        id:'verb',
        translations:{ru:['работать'],en:['work']},
        tags:[]
      }],
      examples:[],
      deprecated:false
    },
    {
      id:'lex.home',
      revision:1,
      language:'en',
      lemma:'home',
      forms:[{text:'home',kind:'lemma'}],
      senses:[{
        id:'noun',
        translations:{ru:['дом']},
        tags:[]
      }],
      examples:[],
      deprecated:false
    }
  ]
};

describe('resolved word review session',()=>{
  it('resolves due personal words into learner-facing lemma and translation',()=>{
    const words=emptyWordsProgress();
    words.items['lex.work|verb']={
      lexemeId:'lex.work',
      senseId:'verb',
      box:1,
      due:10,
      at:'2026-09-29T00:00:00Z'
    };
    words.items['lex.home|noun']={
      lexemeId:'lex.home',
      senseId:'noun',
      box:1,
      due:99,
      at:'2026-09-29T00:00:00Z'
    };

    const session=resolveWordReviewSession(words,lexicon,10,'ru');

    expect(session.items).toHaveLength(1);
    expect(session.items[0]).toMatchObject({
      lemma:'work',
      translations:['работать']
    });
    expect(session.totalDue).toBe(1);
    expect(session.unresolved).toBe(0);
  });

  it('does not invent a display value for stale lexicon references',()=>{
    const words=emptyWordsProgress();
    words.items['lex.missing|sense']={
      lexemeId:'lex.missing',
      senseId:'sense',
      box:1,
      due:1,
      at:'2026-09-29T00:00:00Z'
    };

    const session=resolveWordReviewSession(words,lexicon,10,'ru');

    expect(session.items).toHaveLength(0);
    expect(session.unresolved).toBe(1);
  });
});
