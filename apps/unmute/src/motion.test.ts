import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOTION, easeOutCubic, motionProgress, prefersReducedMotion, withViewTransition } from './motion';

describe('motion system',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('is time-based, so 60 Hz and 120 Hz land on the same progress',()=>{
    const at60=30*(1000/60);
    const at120=60*(1000/120);
    expect(motionProgress(0,at60,1000)).toBeCloseTo(.5,6);
    expect(motionProgress(0,at120,1000)).toBeCloseTo(.5,6);
    expect(easeOutCubic(motionProgress(0,at60,1000)))
      .toBeCloseTo(easeOutCubic(motionProgress(0,at120,1000)),6);
  });

  it('clamps time and exposes the canonical durations',()=>{
    expect(motionProgress(100,50,MOTION.base)).toBe(0);
    expect(motionProgress(0,9999,MOTION.base)).toBe(1);
    expect(MOTION.press).toBeLessThan(MOTION.base);
    expect(MOTION.base).toBeLessThan(MOTION.progress);
    expect(MOTION.progress).toBeLessThanOrEqual(MOTION.ring);
  });

  it('uses the OS reduced-motion preference',()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('uses View Transitions when motion is allowed and skips them for reduced motion',()=>{
    const start=vi.fn((callback:()=>void)=>{callback();});
    Object.defineProperty(document,'startViewTransition',{configurable:true,value:start});
    vi.stubGlobal('matchMedia',()=>({matches:false}));
    const change=vi.fn();
    withViewTransition(change);
    expect(start).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);

    start.mockClear();
    change.mockClear();
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    withViewTransition(change);
    expect(start).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document,'startViewTransition');
  });
});
