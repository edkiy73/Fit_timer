import { gradeWordReview } from './engine/word-srs';
import { activitySaveClock } from './activity-progress';
import { readWordsProgress, writeWordsProgress } from './sync';

export async function saveWordReview(
  lexemeId:string,
  senseId:string,
  correct:boolean,
  now=new Date()
):Promise<void>{
  const words=await readWordsProgress();
  const clock=activitySaveClock(now);
  await writeWordsProgress(
    gradeWordReview(
      words,
      lexemeId,
      senseId,
      correct,
      clock.dayNumber,
      clock.at
    )
  );
}
