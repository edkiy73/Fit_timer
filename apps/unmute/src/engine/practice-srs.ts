export type PracticeSrsKind='drill'|'speaking'|'listening';

export const PRACTICE_INTERVALS={
  drill:[0,2,6,16,35],
  speaking:[0,3,9,24,45],
  listening:[0,2,7,18,40],
} as const;

export interface PracticeSrsState{
  box:number;
  due:number;
}

export const FIRST_CORRECT_DAYS=3;

export type PracticeItemGrade='strong'|'weak'|'neutral';

export function initialPracticeSrsState():PracticeSrsState{
  return {box:0,due:0};
}

export function gradePracticeSrs(
  kind:PracticeSrsKind,
  previous:PracticeSrsState|undefined,
  correct:boolean,
  todayDay:number
):PracticeSrsState{
  const state=previous ?? initialPracticeSrsState();
  const box=correct ? Math.min(4,state.box+1) : 0;
  const intervals=PRACTICE_INTERVALS[kind];
  return {
    box,
    due:todayDay+(intervals[box]??0),
  };
}

export function isPracticeDue(state:PracticeSrsState|undefined,todayDay:number):boolean{
  return Boolean(state&&state.due<=todayDay);
}


export function gradePracticeItemSrs(
  kind:PracticeSrsKind,
  previous:PracticeSrsState|undefined,
  grade:Exclude<PracticeItemGrade,'neutral'>,
  todayDay:number
):PracticeSrsState{
  if(grade==='strong'){
    const graded=gradePracticeSrs(kind,previous,true,todayDay);
    // First time right: the phrase first comes to «Повтор» in 3 days at the earliest (decision 08.10).
    return previous ? graded : {...graded,due:Math.max(graded.due,todayDay+FIRST_CORRECT_DAYS)};
  }
  // Weak lesson/review results should not reappear in the same calendar day.
  return {box:0,due:todayDay+1};
}
