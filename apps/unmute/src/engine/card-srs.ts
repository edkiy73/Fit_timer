export const CARD_INTERVALS = [0,1,3,7,16,35] as const;

export interface CardSrsState {
  box:number;
  due:number;
}

export function initialCardSrsState():CardSrsState{
  return {box:0,due:0};
}

export function gradeCardSrs(
  previous:CardSrsState|undefined,
  correct:boolean,
  todayDay:number
):CardSrsState{
  const state=previous ?? initialCardSrsState();
  const box=correct ? Math.min(5,state.box+1) : 0;
  // A mistake comes back tomorrow, not today: the lesson corrects it right away and the review
  // has already retried it in the session, so «На сегодня всё» stays true (launch plan, decision 12).
  return {
    box,
    due:todayDay + (correct ? (CARD_INTERVALS[box] ?? 1) : 1),
  };
}

export function isCardDue(state:CardSrsState|undefined,todayDay:number):boolean{
  return Boolean(state && state.due<=todayDay);
}

export function cardLearningStatus(state:CardSrsState|undefined):'new'|'started'|'learned'{
  if(!state)return 'new';
  return state.box>=3 ? 'learned' : 'started';
}
