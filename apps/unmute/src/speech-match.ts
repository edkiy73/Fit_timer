import { bare, norm } from './engine/answer-normalize';

/**
 * Frozen English Trainer voice matcher.
 * It intentionally uses a looser word-overlap rule than typed-answer checking:
 * articles/prepositions a/an/the/to/of are ignored and 70% of target words must match.
 */
export function looseSpeechMatch(heard:string,target:string):boolean{
  const drop:Record<string,1>={a:1,an:1,the:1,to:1,of:1};
  const normalize=(value:string)=>
    bare(norm(value)).split(' ').filter(word=>word&&!drop[word]);
  const heardWords=normalize(heard);
  const targetWords=normalize(target);
  if(!heardWords.length||!targetWords.length)return false;

  let hit=0;
  for(const word of targetWords){
    const index=heardWords.indexOf(word);
    if(index>=0){
      hit++;
      heardWords.splice(index,1);
    }
  }
  return hit/targetWords.length>=0.7;
}
