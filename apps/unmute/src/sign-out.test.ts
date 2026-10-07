import { describe, expect, it, vi } from 'vitest';
import { clearPersonalLocalState, finishPendingSignOut, signOutAndClear } from './sign-out';

function memoryStorage(entries:Record<string,string>){
  const map=new Map(Object.entries(entries));
  return {
    get length(){return map.size;},
    key:(i:number)=>[...map.keys()][i]??null,
    removeItem:(key:string)=>{map.delete(key);},
    getItem:(key:string)=>map.get(key)??null,
    has:(key:string)=>map.has(key)
  };
}

function steps(saved:boolean){
  return {
    flush:vi.fn(async()=>saved),
    unregisterPush:vi.fn(async()=>{}),
    logout:vi.fn(async()=>{}),
    clearDocuments:vi.fn(async()=>{}),
    clearContentCache:vi.fn(async()=>{}),
    clearLocal:vi.fn()
  };
}

describe('sign-out on a shared phone (decision 20)',()=>{
  it('saves first, then signs out and clears the phone',async()=>{
    const s=steps(true);
    expect(await signOutAndClear(s)).toBe('done');
    expect(s.flush).toHaveBeenCalledBefore(s.logout);
    expect(s.clearDocuments).toHaveBeenCalled();
    expect(s.clearContentCache).toHaveBeenCalled();
    expect(s.clearLocal).toHaveBeenCalled();
  });

  it('never wipes unsent progress silently: asks first, clears only when forced',async()=>{
    const s=steps(false);
    expect(await signOutAndClear(s)).toBe('unsent');
    expect(s.logout).not.toHaveBeenCalled();
    expect(s.clearDocuments).not.toHaveBeenCalled();
    expect(await signOutAndClear(s,{force:true})).toBe('done');
    expect(s.clearDocuments).toHaveBeenCalled();
  });

  it('removes personal keys and keeps device preferences',()=>{
    const storage=memoryStorage({
      'unmute.lesson-run:general-foundation:day-2':'{}','unmute.pattern-run:x':'{}','unmute.aiTrial.talk':'id',
      'unmute.onboarding.v1':'1','unmute.review-budget:10':'3',
      'unmute.theme':'dark','unmute.locale':'ru','unmute.update.dismissed':'5'
    });
    expect(clearPersonalLocalState(storage)).toBe(5);
    expect(storage.has('unmute.theme')).toBe(true);
    expect(storage.has('unmute.locale')).toBe(true);
    expect(storage.has('unmute.onboarding.v1')).toBe(false);
  });

  it('the next start finishes a sign-out the old page could not fully clean',()=>{
    const storage=memoryStorage({'unmute.sign-out.pending':'1','unmute.onboarding.v1':'1','unmute.theme':'dark'});
    expect(finishPendingSignOut(storage)).toBe(true);
    expect(storage.has('unmute.onboarding.v1')).toBe(false);
    expect(storage.has('unmute.sign-out.pending')).toBe(false);
    expect(storage.has('unmute.theme')).toBe(true);
    expect(finishPendingSignOut(storage)).toBe(false);
  });
});
