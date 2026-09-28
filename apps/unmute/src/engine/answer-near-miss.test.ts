import { describe, expect, it } from 'vitest';
import { isFormPair, isGrammarWord, levenshtein, nearMiss } from './answer-near-miss';

describe('legacy near-miss parity',()=>{
  it('uses legacy edit distance including adjacent transposition',()=>{
    expect(levenshtein('work','wrok')).toBe(1);
    expect(levenshtein('kitten','sitting')).toBe(3);
    expect(levenshtein('same','same')).toBe(0);
  });

  it('recognizes morphology as a grammar/form error, not a typo',()=>{
    expect(isFormPair('work','works')).toBe(true);
    expect(isFormPair('work','worked')).toBe(true);
    expect(isFormPair('study','studies')).toBe(true);
    expect(isFormPair('make','making')).toBe(true);
    expect(isFormPair('good','goof')).toBe(false);

    expect(nearMiss('I works today',['I work today'])).toBe(false);
  });

  it('accepts one plausible typo in one content word as near miss',()=>{
    expect(nearMiss('I wrok today',['I work today'])).toBe(true);
    expect(nearMiss('This is beautful',['This is beautiful'])).toBe(true);
  });

  it('allows distance two only for long words',()=>{
    expect(nearMiss('I abcdefgh now',['I abxxefgh now'])).toBe(true);
    expect(nearMiss('I book now',['I back now'])).toBe(false);
  });

  it('does not classify missing words or multiple wrong words as a typo',()=>{
    expect(nearMiss('I work',['I work today'])).toBe(false);
    expect(nearMiss('I wrok tomorow',['I work tomorrow'])).toBe(false);
  });

  it('treats grammar-word substitutions as grammar errors',()=>{
    expect(isGrammarWord('in')).toBe(true);
    expect(isGrammarWord('on')).toBe(true);
    expect(nearMiss('I work in Bali',['I work on Bali'])).toBe(false);
  });

  it('uses the lexicon callback only for grammar-vs-content-word differences',()=>{
    const known=(word:string)=>word==='ate';
    expect(nearMiss('I work ate home',['I work at home'],known)).toBe(false);
    expect(nearMiss('I work abt home',['I work at home'],known)).toBe(true);
  });

  it('returns false when canonical answer is already correct',()=>{
    expect(nearMiss("Yeah, I wanna go.",['yes i want to go'])).toBe(false);
  });
});
