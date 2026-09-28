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
