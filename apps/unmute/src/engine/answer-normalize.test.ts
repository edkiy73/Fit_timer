import { describe, expect, it } from 'vitest';
import { bare, canon, expand, norm } from './answer-normalize';

describe('legacy answer normalization parity',()=>{
  it('normalizes case, punctuation, dashes and curly apostrophes',()=>{
    expect(norm(' Hello—WORLD, it\u2019s OK! ')).toBe("hello world it's ok");
  });

  it('expands legacy contractions',()=>{
    expect(expand("i'm sure we'll go")).toBe('i am sure we will go');
    expect(expand('cannot wait')).toBe('can not wait');
  });

  it('canonicalizes colloquial speech and spelling variants',()=>{
    expect(canon('Yeah, I wanna practise travelling.')).toBe('yes i want to practice traveling');
    expect(canon('Gimme the colour, please.')).toBe('give me the color please');
  });

  it('canonicalizes no-apostrophe forms and number words',()=>{
    expect(canon('im here and ive got two')).toBe('i am here and i have got 2');
    expect(canon('dont call me at fifteen')).toBe('do not call me at 15');
  });

  it('keeps legacy have-got equivalence',()=>{
    expect(canon('I have got a car')).toBe('i have a car');
    expect(canon('I have got to go')).toBe('i got to go');
  });

  it('removes apostrophes in bare form',()=>{
    expect(bare("don't")).toBe('dont');
  });
});
