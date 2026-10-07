/** One segment per task: correct / wrong / current / not reached yet.
 * `steps` is the whole section; tasks resolved before this run (`done`) show as passed,
 * so coming back to a half-done day never looks like starting over.
 * Mistakes replayed at the end do not add extra segments. */
export function RunnerProgress({
  steps,
  current,
  results,
  done,
  label
}:{
  steps:number[];
  current:number|undefined;
  results:Record<number,boolean>;
  done:ReadonlySet<number>;
  label:string;
}){
  const answered=steps.filter(step=>results[step]!==undefined||done.has(step)).length;
  return (
    <div className="runner-progress runner-progress-segmented" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={Math.max(1,steps.length)} aria-valuenow={answered}>
      {steps.map(step=>{
        const state=results[step]===true
          ? 'correct'
          : results[step]===false
            ? 'wrong'
            : done.has(step)
              ? 'correct'
              : step===current
                ? 'current'
                : 'pending';
        return <span key={step} className={'runner-progress-step is-'+state} aria-hidden="true" />;
      })}
    </div>
  );
}
