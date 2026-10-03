import { describe, expect, it, vi } from 'vitest';
import { reviewSessionSeed } from './review-seed';

function memoryStorage(){
  const map=new Map<string,string>();
  return {
    getItem:(key:string)=>map.get(key)??null,
    setItem:(key:string,value:string)=>{map.set(key,value);},
    map
  };
}

describe('review session shuffle seed',()=>{
  it('reuses the same seed after remount/restart on the same course day',()=>{
    const storage=memoryStorage();
    const first=reviewSessionSeed('general-foundation',10,storage);
    const second=reviewSessionSeed('general-foundation',10,storage);
    expect(second).toBe(first);
  });

  it('uses a different persisted slot for another course or study day',()=>{
    const storage=memoryStorage();
    const first=reviewSessionSeed('general-foundation',10,storage);
    const anotherDay=reviewSessionSeed('general-foundation',11,storage);
    const anotherCourse=reviewSessionSeed('a1-starter',10,storage);
    expect(anotherDay).not.toBe(first);
    expect(anotherCourse).not.toBe(first);
    expect(storage.map.size).toBe(3);
  });

  it('falls back to an in-memory seed when storage is unavailable',()=>{
    const storage={
      getItem:vi.fn(()=>{throw new Error('blocked');}),
      setItem:vi.fn()
    };
    expect(reviewSessionSeed('general-foundation',10,storage)).toBeTruthy();
  });
});
