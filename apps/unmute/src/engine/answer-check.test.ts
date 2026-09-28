import { describe, expect, it } from 'vitest';
import { checkAnswer, dropOptional, softDiffOk, splitCore, stripTime } from './answer-check';

describe('legacy answer check parity',()=>{
  it('accepts exact, punctuation, apostrophe and canonical equivalents',()=>{
    expect(checkAnswer('I\u2019m here.',['im here'])).toBe(true);
    expect(checkAnswer('Yeah, I wanna go.',['yes i want to go'])).toBe(true);
    expect(checkAnswer('I have got a car',['I have a car'])).toBe(true);
  });

  it('treats please as optional exactly like legacy',()=>{
    expect(dropOptional('please call me please')).toBe('call me');
    expect(checkAnswer('Please call me',['call me'])).toBe(true);
    expect(checkAnswer('Call me please',['call me'])).toBe(true);
  });

  it('allows meaningful time phrases to move without changing the answer',()=>{
    expect(checkAnswer('Yesterday I called him',['I called him yesterday'])).toBe(true);
    expect(checkAnswer('I called him next week',['Next week I called him'])).toBe(true);
    expect(checkAnswer('I called him right now',['Right now I called him'])).toBe(true);
  });

  it('does not allow meaningful time to disappear',()=>{
    expect(checkAnswer('I called him',['I called him yesterday'])).toBe(false);
    expect(checkAnswer('I called him last week',['I called him next week'])).toBe(false);
  });

  it('allows only legacy soft time differences after a 3+ word core',()=>{
    expect(checkAnswer('I called him',['I called him today'])).toBe(true);
    expect(checkAnswer('I called him',['I called him now'])).toBe(true);
    expect(checkAnswer('I called him',['I called him tomorrow'])).toBe(false);
    // Legacy intentionally requires a core longer than two words for movable-time matching.
    expect(checkAnswer('I work',['I work now'])).toBe(false);
  });

  it('keeps the exact legacy time extraction behavior',()=>{
    expect(stripTime(['yesterday','i','called','him','next','week'])).toEqual(['i','called','him']);
    expect(splitCore('Yesterday I called him next week')).toEqual({c:'i called him',t:'next week yesterday'});
    expect(softDiffOk('today','')).toBe(true);
    expect(softDiffOk('yesterday','')).toBe(false);
  });

  it('rejects a different core sentence',()=>{
    expect(checkAnswer('I called her yesterday',['I called him yesterday'])).toBe(false);
    expect(checkAnswer('I did call him yesterday',['I called him yesterday'])).toBe(false);
  });
});
