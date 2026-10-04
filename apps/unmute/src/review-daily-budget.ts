export const REVIEW_DAILY_BASE=20;
export const REVIEW_DAILY_EXTRA=10;

export interface ReviewDailyBudget {
  day:number;
  limit:number;
  completed:number;
}

export interface ReviewBudgetStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}

const PREFIX='unmute.review-budget:';

function key(day:number):string{
  return PREFIX+day;
}

export function readReviewBudget(
  day:number,
  storage:ReviewBudgetStorage=localStorage
):ReviewDailyBudget{
  try{
    const raw=storage.getItem(key(day));
    if(raw){
      const parsed=JSON.parse(raw) as Partial<ReviewDailyBudget>;
      if(parsed.day===day){
        return {
          day,
          limit:Math.max(REVIEW_DAILY_BASE,Number(parsed.limit)||REVIEW_DAILY_BASE),
          completed:Math.max(0,Number(parsed.completed)||0)
        };
      }
    }
  }catch{}
  return {day,limit:REVIEW_DAILY_BASE,completed:0};
}

export function remainingReviewQuota(
  day:number,
  storage:ReviewBudgetStorage=localStorage
):number{
  const budget=readReviewBudget(day,storage);
  return Math.max(0,budget.limit-budget.completed);
}

export function recordReviewCompletion(
  day:number,
  count=1,
  storage:ReviewBudgetStorage=localStorage
):ReviewDailyBudget{
  const current=readReviewBudget(day,storage);
  const next={
    ...current,
    completed:Math.max(0,current.completed+Math.max(0,count))
  };
  try{storage.setItem(key(day),JSON.stringify(next));}catch{}
  return next;
}

export function addReviewExtra(
  day:number,
  storage:ReviewBudgetStorage=localStorage
):ReviewDailyBudget{
  const current=readReviewBudget(day,storage);
  const next={...current,limit:current.limit+REVIEW_DAILY_EXTRA};
  try{storage.setItem(key(day),JSON.stringify(next));}catch{}
  return next;
}

export function capReviewCount(
  rawDue:number,
  day:number,
  storage:ReviewBudgetStorage=localStorage
):number{
  return Math.min(Math.max(0,rawDue),remainingReviewQuota(day,storage));
}
