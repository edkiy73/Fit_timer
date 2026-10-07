/** The answer as the learner sees it: the course's display form, else the first accepted answer.
 *  Checking always uses answer.accepted. */
export function shownAnswer(activity:{displayAnswer?:string|undefined;answer:{accepted:string[]}}):string{
  return activity.displayAnswer||activity.answer.accepted[0]||'';
}
