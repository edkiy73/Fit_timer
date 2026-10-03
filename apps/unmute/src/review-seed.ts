import { randomSeed } from './shuffle';

export interface ReviewSeedStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}

const keyFor=(setId:string,todayDay:number)=>'unmute.review-seed:'+setId+':'+todayDay;

/** Keeps the visual order of Review choices/chips stable for the same course and study day. */
export function reviewSessionSeed(
  setId:string,
  todayDay:number,
  storage:ReviewSeedStorage=localStorage
):string{
  const key=keyFor(setId,todayDay);
  try{
    const existing=String(storage.getItem(key)||'').trim();
    if(existing)return existing;
    const seed=randomSeed();
    storage.setItem(key,seed);
    return seed;
  }catch{
    // Storage can be unavailable in private/restricted webviews; the current mounted
    // session still remains stable because this value is pinned into PinnedReviewSession.
    return randomSeed();
  }
}
