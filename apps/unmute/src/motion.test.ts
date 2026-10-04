import { afterEach, describe, expect, it, vi } from 'vitest';
import { motionMs, prefersReducedMotion } from './motion';

describe('motion tokens',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('reads millisecond and second CSS duration tokens',()=>{
    vi.stubGlobal('getComputedStyle',()=>({
      getPropertyValue:(name:string)=>name==='--dur-mode'?'300ms':name==='--slow'?'0.42s':''
    }));
    expect(motionMs('--dur-mode',1)).toBe(300);
    expect(motionMs('--slow',1)).toBe(420);
    expect(motionMs('--missing',77)).toBe(77);
  });

  it('uses the system reduced-motion preference',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    expect(prefersReducedMotion()).toBe(true);
  });
});
