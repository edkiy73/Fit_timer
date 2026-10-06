import { gradePracticeSrs, type PracticeSrsKind, type PracticeSrsState } from './practice-srs';

export type PracticeUnitGrade='strong'|'weak'|'neutral';
export type PracticeUnitGradeContext='lesson'|'review';

/**
 * Phrase-level SRS signal.
 * - lesson weak/revealed/slow items must not come back again the same calendar day;
 * - correction attempts never call this helper, so a later correction cannot upgrade first-pass quality;
 * - manual speech pass is neutral and leaves existing SRS untouched.
 */
export function gradePracticeUnitSrs(
  kind:PracticeSrsKind,
  previous:PracticeSrsState|undefined,
  grade:PracticeUnitGrade,
  todayDay:number,
  context:PracticeUnitGradeContext
):PracticeSrsState|undefined{
  if(grade==='neutral')return previous;
  const next=gradePracticeSrs(kind,previous,grade==='strong',todayDay);
  if(context==='lesson'&&grade==='weak'){
    return {...next,due:Math.max(todayDay+1,next.due)};
  }
  return next;
}
