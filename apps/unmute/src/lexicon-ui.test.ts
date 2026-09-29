import { describe, expect, it } from 'vitest';
import { lexiconContextFor, splitEnglishText } from './lexicon-ui';

describe('clickable lexicon text',()=>{
  it('keeps punctuation while making every English word addressable',()=>{
    expect(splitEnglishText("I don't know — правда.").map(part=>[part.kind,part.value])).toEqual([
      ['word','I'],
      ['text',' '],
      ['word',"don't"],
      ['text',' '],
      ['word','know'],
      ['text',' — правда.']
    ]);
  });

  it('uses an exact occurrence ref without guessing another ambiguous occurrence',()=>{
    const refs=[
      {surface:'work',occurrence:2,lexemeId:'lex.work',senseId:'verb'}
    ];

    expect(lexiconContextFor(refs,'work',1)).toEqual({});
    expect(lexiconContextFor(refs,'work',2)).toEqual({
      lexemeId:'lex.work',
      senseId:'verb',
      formId:undefined
    });
  });

  it('uses a sole unnumbered content ref as exact context',()=>{
    expect(lexiconContextFor(
      [{surface:'went',lexemeId:'lex.go',senseId:'verb',formId:'past'}],
      'went',
      1
    )).toEqual({
      lexemeId:'lex.go',
      senseId:'verb',
      formId:'past'
    });
  });
});
