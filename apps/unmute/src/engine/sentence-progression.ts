export type SentenceResponseKind='build'|'write';
export type SentenceResponseStage='build'|'write';

export interface SentenceProgressState {
  box:number;
  responseStage?:SentenceResponseStage;
  writeWrongStreak?:number;
  deleted?:boolean;
}

/** Legacy cards did not store a response stage. A successful SRS box means the learner
 * has already answered correctly at least once; box 0 stays scaffolded. */
export function sentenceResponseStage(
  state:SentenceProgressState|undefined
):SentenceResponseStage{
  if(!state||state.deleted)return 'build';
  if(state.responseStage)return state.responseStage;
  return state.box>0?'write':'build';
}

export function gradeSentenceResponse(
  previous:SentenceProgressState|undefined,
  kind:SentenceResponseKind|undefined,
  correct:boolean
):{responseStage?:SentenceResponseStage;writeWrongStreak?:number}{
  if(!kind){
    return previous?.responseStage
      ? {responseStage:previous.responseStage,writeWrongStreak:previous.writeWrongStreak??0}
      : {};
  }

  const stage=sentenceResponseStage(previous);
  if(kind==='build'){
    return correct
      ? {responseStage:'write',writeWrongStreak:0}
      : {responseStage:'build',writeWrongStreak:0};
  }

  // Choosing to type while still scaffolded does not punish the learner for trying:
  // a correct answer graduates to writing; a wrong answer stays on chips.
  if(stage==='build'){
    return correct
      ? {responseStage:'write',writeWrongStreak:0}
      : {responseStage:'build',writeWrongStreak:0};
  }

  if(correct)return {responseStage:'write',writeWrongStreak:0};
  const wrong=(previous?.writeWrongStreak??0)+1;
  return wrong>=2
    ? {responseStage:'build',writeWrongStreak:0}
    : {responseStage:'write',writeWrongStreak:wrong};
}
