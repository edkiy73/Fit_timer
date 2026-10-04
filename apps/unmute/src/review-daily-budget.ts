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
export const REVIEW_BUDGET_EVENT='unmute:review-budget-changed';

function key(day:number):string{
  return PREFIX+day;
}
function changed(day:number):void{
  try{
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(REVIEW_BUDGET_EVENT,{detail:{day}}));
  }catch{}
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
  try{
    storage.setItem(key(day),JSON.stringify(next));
    changed(day);
  }catch{}
  return next;
}

export function addReviewExtra(
  day:number,
  storage:ReviewBudgetStorage=localStorage
):ReviewDailyBudget{
  const current=readReviewBudget(day,storage);
  const next={...current,limit:current.limit+REVIEW_DAILY_EXTRA};
  try{
    storage.setItem(key(day),JSON.stringify(next));
    changed(day);
  }catch{}
  return next;
}

export function takeReviewQuota<T>(
  sources:ReadonlyArray<readonly T[]>,
  limit:number
):{items:T[];hidden:number}{
  const queues=sources.map(source=>[...source]);
  const items:T[]=[];
  while(items.length<Math.max(0,limit)&&queues.some(queue=>queue.length>0)){
    for(const queue of queues){
      if(items.length>=limit)break;
      const item=queue.shift();
      if(item!==undefined)items.push(item);
    }
  }
  return {items,hidden:queues.reduce((sum,queue)=>sum+queue.length,0)};
}

export function capReviewCount(
  rawDue:number,
  day:number,
  storage:ReviewBudgetStorage=localStorage
):number{
  return Math.min(Math.max(0,rawDue),remainingReviewQuota(day,storage));
}
